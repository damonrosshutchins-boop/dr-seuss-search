"use strict";
/* Seuss Talk: room chat and opt-in WebRTC voice. Browser bundle uses only a Supabase publishable key. */
(() => {
  const PROJECT_URL = "https://cihzaevtdoquseoxxdqf.supabase.co";
  const PUBLISHABLE_KEY = "sb_publishable_TKOD-qL58VJU9c4R952W_w_Tw7qbqgL";
  const DASH_AUTH = "https://supabase.com/dashboard/project/cihzaevtdoquseoxxdqf/auth/providers";
  const DASH_REALTIME = "https://supabase.com/dashboard/project/cihzaevtdoquseoxxdqf/realtime/settings";
  const $ = (id) => document.getElementById(id);
  const dlg = $("seuss-talk");
  if (!dlg) return;

  let client = null, user = null, profile = null, room = null;
  let messagesChannel = null, voiceChannel = null, localStream = null;
  let voicePeers = new Map(), remoteAudios = new Map(), candidateQueues = new Map();
  let voiceActive = false, muted = false, initialized = false;

  function status(message, bad = false) {
    const el = $("talk-status");
    el.textContent = message;
    el.classList.toggle("bad", !!bad);
  }
  function show(el, yes) { $(el).hidden = !yes; }
  function node(tag, cls, value) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (value !== undefined) el.textContent = value;
    return el;
  }
  function explainSetup(message) {
    $("talk-setup").hidden = false;
    $("talk-setup-message").textContent = message;
    $("talk-auth").hidden = true;
    $("talk-app").hidden = true;
  }

  async function boot() {
    if (initialized) return;
    initialized = true;
    status("Connecting to Seuss Talk…");
    try {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
      client = createClient(PROJECT_URL, PUBLISHABLE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
      });
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      if (sessionData.session) {
        user = sessionData.session.user;
      } else {
        const { data, error } = await client.auth.signInAnonymously();
        if (error) {
          const msg = String(error.message || error);
          if (/anonymous|disabled|not enabled|signups not allowed/i.test(msg)) {
            explainSetup("Anonymous sign-ins are not enabled yet. In Supabase, open Authentication → Sign In / Providers → Anonymous Sign-Ins and turn it on. Then open Realtime Settings and turn OFF “Allow public access” so voice-room channels use their member checks.");
            $("talk-auth-link").href = DASH_AUTH;
            $("talk-realtime-link").href = DASH_REALTIME;
            return;
          }
          throw error;
        }
        user = data.user;
      }
      await loadProfile();
    } catch (err) {
      status("Could not connect: " + String(err && err.message || err), true);
      initialized = false;
    }
  }

  async function loadProfile() {
    const { data, error } = await client.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    if (error) throw error;
    if (data) {
      profile = data;
      $("talk-name").value = data.display_name;
      show("talk-auth", false);
      show("talk-setup", false);
      show("talk-app", true);
      await listRooms();
    } else {
      show("talk-setup", false);
      show("talk-auth", true);
      show("talk-app", false);
      status("Choose a screen name to get started.");
    }
  }

  async function saveName(event) {
    event.preventDefault();
    const name = $("talk-name").value.trim();
    const { error } = await client.rpc("set_display_name", { p_name: name });
    if (error) { status(error.message, true); return; }
    profile = { display_name: name };
    show("talk-auth", false);
    show("talk-app", true);
    status("Welcome to Seuss Talk.");
    await listRooms();
  }

  async function listRooms() {
    status("Loading rooms…");
    const { data, error } = await client.from("rooms")
      .select("id,name,is_public,created_at,created_by")
      .order("created_at", { ascending: false }).limit(60);
    if (error) { status(error.message, true); return; }
    const { data: memberships, error: memberError } = await client.from("room_members")
      .select("room_id").eq("user_id", user.id);
    if (memberError) { status(memberError.message, true); return; }
    const mine = new Set((memberships || []).map(x => x.room_id));
    const list = $("talk-room-list");
    list.replaceChildren();
    if (!data || !data.length) list.append(node("p", "talk-muted", "No rooms yet. Create the first one!"));
    for (const item of data || []) {
      const card = node("div", "talk-room-card");
      const info = node("div", "talk-room-info");
      info.append(node("strong", "", item.name));
      info.append(node("span", "talk-muted", item.is_public ? "Open room" : "Password protected"));
      const action = node("button", "chip talk-small", mine.has(item.id) ? "Open" : "Join");
      action.type = "button";
      action.addEventListener("click", () => mine.has(item.id) ? openRoom(item) : joinRoom(item));
      card.append(info, action);
      list.append(card);
    }
    status((data || []).length + " room(s) available.");
  }

  async function createRoom(event) {
    if (event && typeof event.preventDefault === "function") event.preventDefault();
    const button = $("talk-create-button");
    if (!client || !user) { status("Still connecting. Close Seuss Talk and open it again.", true); return; }
    const name = $("talk-room-name").value.trim();
    const password = $("talk-lock").checked ? $("talk-room-password").value : null;
    if (name.length < 2 || name.length > 48) { status("Room name must be between 2 and 48 characters.", true); return; }
    if ($("talk-lock").checked && (!password || password.length < 6)) { status("Use a room password with at least 6 characters.", true); return; }
    if (button) { button.disabled = true; button.textContent = "Creating…"; }
    status("Creating your room…");
    try {
      const { data, error } = await client.rpc("create_room", { p_name: name, p_password: password });
      if (error) throw error;
      if (!data) throw new Error("The server did not return a room ID. Please try again.");
      $("talk-room-name").value = "";
      $("talk-room-password").value = "";
      $("talk-lock").checked = false;
      $("talk-room-password").hidden = true;
      await listRooms();
      const { data: created, error: roomError } = await client.from("rooms").select("id,name,is_public,created_by,created_at").eq("id", data).single();
      if (roomError) throw roomError;
      await openRoom(created);
      status("Room created successfully.");
    } catch (err) {
      status("Could not create room: " + String(err && err.message || err), true);
    } finally {
      if (button) { button.disabled = false; button.textContent = "Create room"; }
    }
  }
  async function joinRoom(item) {
    let password = null;
    if (!item.is_public) {
      password = window.prompt("This room is password protected. Enter its password:");
      if (password === null) return;
    }
    const { error } = await client.rpc("join_room", { p_room_id: item.id, p_password: password });
    if (error) { status(error.message, true); return; }
    await openRoom(item);
  }

  function messageCard(message) {
    const card = node("article", "talk-message");
    const head = node("div", "talk-message-head");
    head.append(node("strong", "", message.display_name));
    head.append(node("time", "talk-muted", new Date(message.created_at).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})));
    card.append(head, node("p", "", message.body));
    if (message.user_id !== user.id) {
      const actions = node("div", "talk-message-actions");
      const block = node("button", "talk-text-button", "Block");
      block.type = "button";
      block.addEventListener("click", async () => {
        if (!window.confirm("Block this user? Their messages will be hidden from you.")) return;
        const { error } = await client.from("user_blocks").insert({ blocker_id:user.id, blocked_id:message.user_id });
        status(error ? error.message : "User blocked.");
        if (!error) await loadMessages();
      });
      const report = node("button", "talk-text-button", "Report");
      report.type = "button";
      report.addEventListener("click", async () => {
        const reason = window.prompt("Report reason: spam, harassment, inappropriate_content, privacy, or other", "other");
        if (!reason) return;
        const allowed = ["spam","harassment","inappropriate_content","privacy","other"];
        if (!allowed.includes(reason.trim())) { status("Choose one of the listed report reasons.", true); return; }
        const details = window.prompt("Optional details (do not include personal information):", "") || null;
        const { error } = await client.from("user_reports").insert({
          reporter_id:user.id, reported_user_id:message.user_id, room_id:room.id,
          message_id:message.id, reason:reason.trim(), details
        });
        status(error ? error.message : "Report submitted.");
      });
      actions.append(block, report);
      card.append(actions);
    }
    return card;
  }

  async function loadMessages() {
    const { data, error } = await client.from("messages").select("*")
      .eq("room_id", room.id).order("created_at", { ascending:true }).limit(100);
    if (error) { status(error.message, true); return; }
    const list = $("talk-messages");
    list.replaceChildren();
    for (const message of data || []) list.append(messageCard(message));
    list.scrollTop = list.scrollHeight;
  }

  async function loadMembers() {
    const { data: members, error } = await client.from("room_members").select("user_id")
      .eq("room_id", room.id);
    if (error) return;
    const ids = (members || []).map(m => m.user_id);
    if (!ids.length) { $("talk-members").textContent = "No members"; return; }
    const { data: people } = await client.from("profiles").select("id,display_name").in("id", ids);
    $("talk-members").textContent = (people || []).map(p => p.display_name).join(" · ");
  }

  async function openRoom(item) {
    await leaveVoice();
    if (messagesChannel) { await client.removeChannel(messagesChannel); messagesChannel = null; }
    room = item;
    $("talk-room-title").textContent = item.name;
    $("talk-room-lock").textContent = item.is_public ? "Open" : "Password protected";
    show("talk-rooms-view", false);
    show("talk-room-view", true);
    await loadMessages();
    await loadMembers();
    messagesChannel = client.channel("room-messages-" + item.id)
      .on("postgres_changes", {
        event:"INSERT", schema:"public", table:"messages", filter:"room_id=eq." + item.id
      }, async () => { await loadMessages(); })
      .subscribe();
    status("In " + item.name + ". Voice is off until you choose Join voice.");
  }

  async function sendMessage(event) {
    event.preventDefault();
    const input = $("talk-message-input");
    const body = input.value.trim();
    if (!body || !room) return;
    const { error } = await client.from("messages").insert({
      room_id:room.id, user_id:user.id, display_name:profile.display_name, body
    });
    if (error) { status(error.message, true); return; }
    input.value = "";
  }

  function sendSignal(to, payload) {
    if (!voiceChannel) return;
    return voiceChannel.send({ type:"broadcast", event:"voice-signal", payload:Object.assign({
      from:user.id, to:to
    }, payload) });
  }

  async function makePeer(peerId, offerer) {
    if (voicePeers.has(peerId) || !localStream) return voicePeers.get(peerId);
    const pc = new RTCPeerConnection({
      iceServers:[{ urls:"stun:stun.l.google.com:19302" }]
    });
    voicePeers.set(peerId, pc);
    candidateQueues.set(peerId, []);
    for (const track of localStream.getTracks()) pc.addTrack(track, localStream);
    pc.onicecandidate = (event) => {
      if (event.candidate) sendSignal(peerId, { candidate:event.candidate });
    };
    pc.ontrack = (event) => {
      let audio = remoteAudios.get(peerId);
      if (!audio) {
        audio = document.createElement("audio");
        audio.autoplay = true;
        audio.playsInline = true;
        audio.className = "talk-remote-audio";
        $("talk-audio-host").append(audio);
        remoteAudios.set(peerId, audio);
      }
      audio.srcObject = event.streams[0];
      audio.play().catch(() => {});
    };
    pc.onconnectionstatechange = () => {
      if (["failed","closed","disconnected"].includes(pc.connectionState)) removePeer(peerId);
    };
    if (offerer) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendSignal(peerId, { description:pc.localDescription });
    }
    return pc;
  }

  async function handleSignal(payload) {
    if (!payload || payload.to !== user.id || !voiceActive) return;
    const peerId = payload.from;
    try {
      const pc = await makePeer(peerId, false);
      if (payload.description) {
        await pc.setRemoteDescription(payload.description);
        const queue = candidateQueues.get(peerId) || [];
        for (const candidate of queue) await pc.addIceCandidate(candidate);
        candidateQueues.set(peerId, []);
        if (payload.description.type === "offer") {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendSignal(peerId, { description:pc.localDescription });
        }
      } else if (payload.candidate) {
        if (pc.remoteDescription) await pc.addIceCandidate(payload.candidate);
        else candidateQueues.get(peerId).push(payload.candidate);
      } else if (payload.leave) {
        removePeer(peerId);
      }
    } catch (err) {
      status("Voice connection issue: " + String(err && err.message || err), true);
    }
  }

  function voicePeople() {
    if (!voiceChannel) return [];
    const state = voiceChannel.presenceState();
    return Object.values(state).flat().filter(p => p.user_id && p.user_id !== user.id);
  }

  async function syncVoicePeers() {
    if (!voiceActive || !localStream) return;
    for (const person of voicePeople()) {
      if (user.id < person.user_id && !voicePeers.has(person.user_id)) {
        try { await makePeer(person.user_id, true); } catch (err) {
          status("Could not start a voice connection: " + String(err && err.message || err), true);
        }
      }
    }
    $("talk-voice-status").textContent = "Voice connected · " + (voicePeers.size + 1) + " participant(s)";
  }

  async function joinVoice() {
    if (voiceActive) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      status("Voice calls need a supported browser and microphone permission.", true); return;
    }
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio:true, video:false });
      voiceActive = true;
      voiceChannel = client.channel("room:" + room.id + ":voice", {
        config:{ private:true, presence:{ key:user.id } }
      });
      voiceChannel
        .on("broadcast", { event:"voice-signal" }, ({payload}) => handleSignal(payload))
        .on("presence", { event:"sync" }, () => syncVoicePeers());
      voiceChannel.subscribe(async (state, err) => {
        if (state === "SUBSCRIBED") {
          await voiceChannel.track({ user_id:user.id, display_name:profile.display_name });
          $("talk-voice-status").textContent = "Voice joined · waiting for others";
          $("talk-join-voice").hidden = true;
          $("talk-leave-voice").hidden = false;
          $("talk-mute").hidden = false;
          await syncVoicePeers();
        } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") {
          status("Voice room authorization failed. Check the Realtime settings and room membership.", true);
          await leaveVoice();
        }
      });
    } catch (err) {
      voiceActive = false;
      if (localStream) localStream.getTracks().forEach(t => t.stop());
      localStream = null;
      status("Microphone unavailable: " + String(err && err.message || err), true);
    }
  }

  function removePeer(peerId) {
    const pc = voicePeers.get(peerId);
    if (pc) { pc.ontrack = null; pc.close(); voicePeers.delete(peerId); }
    candidateQueues.delete(peerId);
    const audio = remoteAudios.get(peerId);
    if (audio) { audio.pause(); audio.srcObject = null; audio.remove(); remoteAudios.delete(peerId); }
  }

  async function leaveVoice() {
    voiceActive = false;
    if (voiceChannel) {
      for (const peerId of voicePeers.keys()) sendSignal(peerId, { leave:true });
      try { await voiceChannel.untrack(); } catch {}
      await client.removeChannel(voiceChannel);
      voiceChannel = null;
    }
    for (const peerId of Array.from(voicePeers.keys())) removePeer(peerId);
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    localStream = null;
    muted = false;
    $("talk-join-voice").hidden = !room;
    $("talk-leave-voice").hidden = true;
    $("talk-mute").hidden = true;
    $("talk-mute").textContent = "Mute mic";
    $("talk-voice-status").textContent = "Voice is off";
  }

  async function leaveRoom() {
    await leaveVoice();
    if (messagesChannel) { await client.removeChannel(messagesChannel); messagesChannel = null; }
    if (room) {
      await client.from("room_members").delete().eq("room_id", room.id).eq("user_id", user.id);
    }
    room = null;
    show("talk-room-view", false);
    show("talk-rooms-view", true);
    await listRooms();
  }

  $("open-seuss-talk").addEventListener("click", async () => {
    if (!dlg.open) dlg.showModal();
    await boot();
  });
  $("talk-close").addEventListener("click", () => dlg.close());
  $("talk-auth-form").addEventListener("submit", saveName);
  $("talk-create-form").addEventListener("submit", createRoom);
  $("talk-create-button").addEventListener("click", createRoom);
  $("talk-lock").addEventListener("change", () => { $("talk-room-password").hidden = !$("talk-lock").checked; });
  $("talk-refresh").addEventListener("click", listRooms);
  $("talk-back-rooms").addEventListener("click", leaveRoom);
  $("talk-message-form").addEventListener("submit", sendMessage);
  $("talk-join-voice").addEventListener("click", joinVoice);
  $("talk-leave-voice").addEventListener("click", leaveVoice);
  $("talk-mute").addEventListener("click", () => {
    if (!localStream) return;
    muted = !muted;
    localStream.getAudioTracks().forEach(track => track.enabled = !muted);
    $("talk-mute").textContent = muted ? "Unmute mic" : "Mute mic";
  });
  dlg.addEventListener("close", () => {
    if (room) leaveRoom().catch(() => {});
  });
})();