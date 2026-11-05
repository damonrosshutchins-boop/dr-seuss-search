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
  const openRooms = new Map();
  let messagesChannel = null, voiceChannel = null, controlChannel = null, localStream = null;
  let controlReady = false;
  let voicePeers = new Map(), remoteAudios = new Map(), candidateQueues = new Map();
  const mutedUsers = new Set();
  let voiceActive = false, muted = false, ownerMuted = false, initialized = false;

  function status(message, bad = false) {
    const el = $("talk-status");
    el.textContent = message;
    el.classList.toggle("bad", !!bad);
  }
  function show(el, yes) { $(el).hidden = !yes; }
  function isRoomOwner(userId) { return !!room && room.created_by === userId; }
  function appendOwnerBadge(parent) {
    parent.append(node("span", "talk-owner-badge", "OWNER"));
  }
  function updateRoomComposer() {
    const input = $("talk-message-input");
    const send = $("talk-message-form").querySelector('button[type="submit"]');
    input.disabled = ownerMuted;
    send.disabled = ownerMuted;
    input.placeholder = ownerMuted ? "Muted by the room owner" : "Write a message…";
    $("talk-join-voice").disabled = ownerMuted;
    $("talk-join-voice").textContent = ownerMuted ? "Muted by owner" : "Join voice";
  }
  function updateMicButton() {
    const button = $("talk-mute");
    button.hidden = !voiceActive;
    button.disabled = ownerMuted;
    button.textContent = ownerMuted ? "Muted by owner" : (muted ? "Unmute mic" : "Mute mic");
  }
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
      // Ensure the current guest JWT is available to private Realtime channels.
      await client.realtime.setAuth();
      await loadProfile();
    } catch (err) {
      status("Could not connect: " + String(err && err.message || err), true);
      initialized = false;
    }
  }

  async function loadProfile() {
    const { data, error } = await client.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    if (error) throw error;
    if (data && typeof data.display_name === "string" && data.display_name.trim().length >= 2) {
      profile = data;
      $("talk-name").value = data.display_name;
      $("talk-current-name").textContent = data.display_name;
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
    if (name.length < 2 || name.length > 24) {
      status("Your username must be between 2 and 24 characters.", true);
      return;
    }
    const { error } = await client.rpc("set_display_name", { p_name: name });
    if (error) { status(error.message, true); return; }
    profile = { display_name: name };
    $("talk-current-name").textContent = name;
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

  function renderRoomTabs() {
    const roomsTab = $("talk-rooms-tab");
    const tabs = $("talk-room-tabs");
    tabs.replaceChildren();
    const roomsActive = !room;
    roomsTab.classList.toggle("active", roomsActive);
    roomsTab.setAttribute("aria-selected", String(roomsActive));

    for (const item of openRooms.values()) {
      const wrapper = node("div", "talk-tab-item");
      const tab = node("button", "talk-tab", item.name);
      tab.type = "button";
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", String(!!room && room.id === item.id));
      tab.dataset.roomTab = item.id;
      tab.classList.toggle("active", !!room && room.id === item.id);

      const close = node("button", "talk-tab-close", "×");
      close.type = "button";
      close.dataset.closeRoomTab = item.id;
      close.setAttribute("aria-label", "Close " + item.name + " tab");
      close.title = "Close tab";

      wrapper.append(tab, close);
      tabs.append(wrapper);
    }
  }

  async function showRoomsTab() {
    await leaveVoice();
    if (messagesChannel) {
      await client.removeChannel(messagesChannel);
      messagesChannel = null;
    }
    if (controlChannel) {
      await client.removeChannel(controlChannel);
      controlChannel = null;
      controlReady = false;
    }
    room = null;
    ownerMuted = false;
    mutedUsers.clear();
    updateRoomComposer();
    show("talk-room-view", false);
    show("talk-rooms-view", true);
    renderRoomTabs();
    await listRooms();
  }

  async function closeRoomTab(roomId) {
    openRooms.delete(roomId);
    if (room && room.id === roomId) {
      await showRoomsTab();
      return;
    }
    renderRoomTabs();
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
    if (message.id) card.dataset.messageId = message.id;
    const head = node("div", "talk-message-head");
    const messageOwner = isRoomOwner(message.user_id);
    head.append(node("strong", messageOwner ? "talk-owner-name" : "", message.display_name || "Unknown user"));
    if (messageOwner) appendOwnerBadge(head);
    if (message.user_id === user.id) head.append(node("span", "talk-you-label", "You"));
    head.append(node("time", "talk-muted", new Date(message.created_at).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})));
    card.append(head, node("p", messageOwner ? "talk-owner-message" : "", message.body));
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
    const { data, error } = await client.from("messages")
      .select("id,room_id,user_id,display_name,body,created_at")
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
    if (error) { status("Could not load room members: " + error.message, true); return; }

    const { data: muteRows, error: muteError } = await client.from("room_mutes")
      .select("user_id").eq("room_id", room.id);
    if (muteError) { status("Could not load room mute status: " + muteError.message, true); return; }

    mutedUsers.clear();
    for (const entry of muteRows || []) mutedUsers.add(entry.user_id);
    ownerMuted = mutedUsers.has(user.id);
    updateRoomComposer();
    updateMicButton();

    const ids = (members || []).map(m => m.user_id);
    const output = $("talk-members");
    output.replaceChildren();
    if (!ids.length) {
      output.append(node("span", "talk-muted", "No members"));
      return;
    }

    const { data: people, error: peopleError } = await client.from("profiles")
      .select("id,display_name").in("id", ids);
    if (peopleError) {
      status("Could not load member usernames: " + peopleError.message, true);
      return;
    }
    const nameById = new Map((people || []).map(p => [p.id, p.display_name]));

    for (const memberId of ids) {
      const row = node("div", "talk-member-row");
      row.dataset.userId = memberId;
      const identity = node("div", "talk-member-identity");
      const memberName = nameById.get(memberId) || "Guest";
      const memberIsOwner = isRoomOwner(memberId);
      identity.append(node("strong", memberIsOwner ? "talk-owner-name" : "", memberName));
      if (memberIsOwner) appendOwnerBadge(identity);
      if (memberId === user.id) identity.append(node("span", "talk-muted", "You"));
      if (mutedUsers.has(memberId)) identity.append(node("span", "talk-muted-label", "MUTED"));
      row.append(identity);

      if (isRoomOwner(user.id) && memberId !== room.created_by) {
        const controls = node("div", "talk-member-controls");
        const muteButton = node("button", "talk-text-button", mutedUsers.has(memberId) ? "Unmute" : "Mute");
        muteButton.type = "button";
        muteButton.addEventListener("click", () => setRoomMemberMute(memberId, !mutedUsers.has(memberId)));
        const kickButton = node("button", "talk-text-button talk-danger", "Kick");
        kickButton.type = "button";
        kickButton.addEventListener("click", () => kickRoomMember(memberId));
        controls.append(muteButton, kickButton);
        row.append(controls);
      }
      output.append(row);
    }
  }

  async function setRoomMemberMute(memberId, shouldMute) {
    if (!room || !isRoomOwner(user.id) || memberId === room.created_by) return;
    try {
      const { error } = await client.rpc("set_room_member_mute", {
        p_room_id:room.id, p_user_id:memberId, p_muted:shouldMute
      });
      if (error) throw error;
      if (shouldMute) mutedUsers.add(memberId);
      else mutedUsers.delete(memberId);
      if (memberId === user.id) {
        ownerMuted = shouldMute;
        if (localStream) localStream.getAudioTracks().forEach(track => {
          track.enabled = !ownerMuted && !muted;
        });
        updateRoomComposer();
        updateMicButton();
      }
      const remoteAudio = remoteAudios.get(memberId);
      if (remoteAudio) remoteAudio.muted = shouldMute;
      await loadMembers();
      status(shouldMute ? "Member muted in this room." : "Member unmuted.");
    } catch (err) {
      status("Could not change member mute: " + String(err && err.message || err), true);
    }
  }

  async function kickRoomMember(memberId) {
    if (!room || !isRoomOwner(user.id) || memberId === room.created_by) return;
    const row = Array.from($("talk-members").querySelectorAll(".talk-member-row"))
      .find(item => item.dataset.userId === memberId);
    const label = row ? row.querySelector("strong")?.textContent || "this member" : "this member";
    if (!window.confirm("Kick " + label + " from this room? They can join again later if the room is open.")) return;
    try {
      const { error } = await client.rpc("kick_room_member", {
        p_room_id:room.id, p_user_id:memberId
      });
      if (error) throw error;
      removePeer(memberId);
      mutedUsers.delete(memberId);
      await loadMembers();
      status(label + " was kicked from the room.");
    } catch (err) {
      status("Could not kick member: " + String(err && err.message || err), true);
    }
  }

  async function deleteCurrentRoom() {
    if (!room || !isRoomOwner(user.id)) return;
    const roomToDelete = room;
    if (!window.confirm('Delete "' + roomToDelete.name + '"? This permanently removes the room, its messages, and its member list.')) return;
    try {
      const { error } = await client.rpc("delete_room", { p_room_id:roomToDelete.id });
      if (error) throw error;
      openRooms.delete(roomToDelete.id);
      await showRoomsTab();
      status("Room deleted.");
    } catch (err) {
      status("Could not delete room: " + String(err && err.message || err), true);
    }
  }

  async function handleRoomModeration({payload}) {
    if (!payload || !room || payload.room_id !== room.id) return;
    if (payload.action === "mute") {
      const targetId = payload.target_id;
      if (payload.muted) mutedUsers.add(targetId);
      else mutedUsers.delete(targetId);

      if (targetId === user.id) {
        ownerMuted = !!payload.muted;
        if (localStream) localStream.getAudioTracks().forEach(track => {
          track.enabled = !ownerMuted && !muted;
        });
        updateRoomComposer();
        updateMicButton();
        status(ownerMuted ? "The room owner muted you." : "The room owner unmuted you.");
      } else {
        const audio = remoteAudios.get(targetId);
        if (audio) audio.muted = !!payload.muted;
      }
      renderVoiceMembers();
      await loadMembers();
      return;
    }

    if (payload.action === "kick") {
      removePeer(payload.target_id);
      if (payload.target_id === user.id) {
        openRooms.delete(room.id);
        await showRoomsTab();
        status("The room owner kicked you from this room.");
      } else {
        await loadMembers();
      }
      return;
    }

    if (payload.action === "delete-room") {
      const deletedId = payload.room_id;
      openRooms.delete(deletedId);
      await showRoomsTab();
      status("The room owner deleted this room.");
    }
  }

  function startRoomControlChannel(item) {
    if (controlChannel) client.removeChannel(controlChannel);
    controlReady = false;
    controlChannel = client.channel("room:" + item.id + ":control", {
      config:{ private:true }
    });
    controlChannel
      .on("broadcast", { event:"member-moderation" }, handleRoomModeration)
      .subscribe((state, error) => {
        if (state === "SUBSCRIBED") controlReady = true;
        else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") {
          controlReady = false;
          status("Room moderation updates could not connect: " + String(error && error.message || state), true);
        }
      });
  }

  async function openRoom(item) {
    await leaveVoice();
    if (messagesChannel) {
      await client.removeChannel(messagesChannel);
      messagesChannel = null;
    }
    if (controlChannel) {
      await client.removeChannel(controlChannel);
      controlChannel = null;
      controlReady = false;
    }
    ownerMuted = false;
    mutedUsers.clear();
    openRooms.set(item.id, item);
    room = item;
    renderRoomTabs();
    $("talk-room-title").textContent = item.name;
    $("talk-room-lock").textContent = item.is_public ? "Open" : "Password protected";
    show("talk-rooms-view", false);
    show("talk-room-view", true);
    await loadMessages();
    await loadMembers();
    updateRoomComposer();
    startRoomControlChannel(item);
    $("talk-delete-room").hidden = !isRoomOwner(user.id);
    // This project accepts private Realtime topics only. Keep chat scoped to
    // the room and authorize the topic through room_members in realtime.messages.
    messagesChannel = client.channel("room:" + item.id + ":chat", {
      config:{ private:true }
    })
      .on("postgres_changes", {
        event:"INSERT", schema:"public", table:"messages", filter:"room_id=eq." + item.id
      }, async () => { await loadMessages(); })
      .subscribe((state, error) => {
        if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") {
          status("Live chat could not connect: " + String(error && error.message || state), true);
        }
      });
    status("In " + item.name + ". Voice is off until you choose Join voice.");
  }

  async function sendMessage(event) {
    event.preventDefault();
    const input = $("talk-message-input");
    const body = input.value.trim();
    if (!body) return;
    if (!client || !user || !profile || !room) {
      status("Choose a username and join a room before sending a message.", true);
      return;
    }

    const button = $("talk-message-form").querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    status("Sending message…");
    try {
      const { data, error } = await client.from("messages").insert({
        room_id:room.id,
        user_id:user.id,
        display_name:profile.display_name,
        body
      }).select("id,room_id,user_id,display_name,body,created_at").single();

      if (error) throw error;
      if (!data) throw new Error("The server did not return the saved message.");

      input.value = "";
      const list = $("talk-messages");
      const alreadyShown = Array.from(list.children)
        .some(item => item.dataset.messageId === data.id);
      if (!alreadyShown) list.append(messageCard(data));
      list.scrollTop = list.scrollHeight;
      status("Message sent.");
    } catch (err) {
      status("Message not sent: " + String(err && err.message || err), true);
    } finally {
      if (button) button.disabled = false;
      input.focus();
    }
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
      audio.muted = mutedUsers.has(peerId);
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

  function renderVoiceMembers() {
    const output = $("talk-voice-members");
    if (!output) return;
    output.replaceChildren();
    if (!voiceChannel || !voiceActive) {
      output.append(node("span", "talk-muted", "No one in voice"));
      return;
    }

    const uniquePeople = new Map();
    for (const person of Object.values(voiceChannel.presenceState()).flat()) {
      if (!person || !person.user_id || uniquePeople.has(person.user_id)) continue;
      uniquePeople.set(person.user_id, person.display_name || "Guest");
    }
    if (!uniquePeople.size) {
      output.append(node("span", "talk-muted", "No one in voice"));
      return;
    }
    for (const [id, name] of uniquePeople.entries()) {
      const member = node("span", "talk-voice-person");
      member.append(node("strong", isRoomOwner(id) ? "talk-owner-name" : "", name));
      if (isRoomOwner(id)) appendOwnerBadge(member);
      if (id === user.id) member.append(node("span", "talk-muted", "(you)"));
      if (mutedUsers.has(id)) member.append(node("span", "talk-muted-label", "MUTED"));
      output.append(member);
    }
  }

  async function syncVoicePeers() {
    if (!voiceActive || !localStream) return;
    renderVoiceMembers();
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
    if (ownerMuted) {
      status("The room owner has muted you. You cannot join voice until they unmute you.", true);
      return;
    }
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
        .on("presence", { event:"sync" }, () => {
          renderVoiceMembers();
          syncVoicePeers();
        });
      voiceChannel.subscribe(async (state, err) => {
        if (state === "SUBSCRIBED") {
          await voiceChannel.track({ user_id:user.id, display_name:profile.display_name });
          renderVoiceMembers();
          $("talk-voice-status").textContent = "Voice joined · waiting for others";
          $("talk-join-voice").hidden = true;
          $("talk-leave-voice").hidden = false;
          updateMicButton();
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
    $("talk-mute").disabled = false;
    $("talk-mute").textContent = "Mute mic";
    $("talk-voice-status").textContent = "Voice is off";
    updateRoomComposer();
    renderVoiceMembers();
  }

  $("open-seuss-talk").addEventListener("click", async () => {
    if (!dlg.open) dlg.showModal();
    await boot();
  });
  $("talk-close").addEventListener("click", () => dlg.close());
  $("talk-auth-form").addEventListener("submit", saveName);
  $("talk-create-form").addEventListener("submit", createRoom);
  $("talk-lock").addEventListener("change", () => { $("talk-room-password").hidden = !$("talk-lock").checked; });
  $("talk-refresh").addEventListener("click", listRooms);
  $("talk-rooms-tab").addEventListener("click", showRoomsTab);
  $("talk-room-tabs").addEventListener("click", async (event) => {
    const closeButton = event.target.closest("[data-close-room-tab]");
    if (closeButton) {
      await closeRoomTab(closeButton.dataset.closeRoomTab);
      return;
    }
    const tabButton = event.target.closest("[data-room-tab]");
    if (tabButton) {
      const item = openRooms.get(tabButton.dataset.roomTab);
      if (item) await openRoom(item);
    }
  });
  $("talk-back-rooms").addEventListener("click", showRoomsTab);
  $("talk-message-form").addEventListener("submit", sendMessage);
  $("talk-join-voice").addEventListener("click", joinVoice);
  $("talk-leave-voice").addEventListener("click", leaveVoice);
  $("talk-mute").addEventListener("click", () => {
    if (!localStream || ownerMuted) return;
    muted = !muted;
    localStream.getAudioTracks().forEach(track => track.enabled = !muted && !ownerMuted);
    updateMicButton();
  });
  $("talk-delete-room").addEventListener("click", deleteCurrentRoom);
  dlg.addEventListener("close", () => {
    if (room) showRoomsTab().catch(() => {});
  });
})();