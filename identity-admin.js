"use strict";
/* Site-wide username and moderated in-site controls for Dr. Seuss Search.
 * Admin credentials are checked by Supabase RPCs; never put a secret in this file.
 */
(() => {
  const $ = id => document.getElementById(id);
  const PROJECT = "https://cihzaevtdoquseoxxdqf.supabase.co";
  const KEY = "sb_publishable_TKOD-qL58VJU9c4R952W_w_Tw7qbqgL";
  const login = $("site-login");
  const settings = $("settings");
  if (!login || !settings) return;

  let api = null, me = null, isAdmin = false, selectedRoom = null;
  let checking = false, loggedIn = false, lastState = null;
  const errText = error => String(error && error.message || error);
  const create = (tag, cls, value) => {
    const element = document.createElement(tag);
    if (cls) element.className = cls;
    if (value != null) element.textContent = value;
    return element;
  };
  const feedback = (id, message, error) => {
    const el = $(id);
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("bad", !!error);
  };
  const server = async (name, args = {}) => {
    if (!api) throw new Error("Please finish setting up your username first.");
    const { data, error } = await api.rpc(name, args);
    if (error) throw error;
    return data;
  };
  function setLock(state) {
    if (state === lastState) return;
    lastState = state;
    window.dispatchEvent(new CustomEvent("seuss-site-access-change", { detail:{ state } }));
    const overlay = $("site-moderation-overlay");
    overlay.hidden = state === "active";
    $("site-moderation-title").textContent = state === "frozen" ? "Your Seuss session is paused" : "Your Seuss session has been removed";
    $("site-moderation-explanation").textContent = state === "frozen"
      ? "A site moderator temporarily froze this in-site session. The page will unlock when they restore access."
      : "A site moderator removed this session from Seuss Search. Access will return if they restore your account.";
    document.body.classList.toggle("site-access-locked", state !== "active");
  }
  async function heartbeat() {
    if (!loggedIn || checking || !api || document.visibilityState === "hidden") return;
    checking = true;
    try {
      const state = await server("site_heartbeat");
      setLock(state === "active" ? "active" : state === "frozen" ? "frozen" : "kicked");
    } catch (error) {
      feedback("site-login-status", "Connection issue: " + errText(error), true);
    } finally {
      checking = false;
    }
  }
  async function startup() {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.57.0");
    if (!api) api = createClient(PROJECT, KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
    const { data: sessionData, error: sessionError } = await api.auth.getSession();
    if (sessionError) throw sessionError;
    if (sessionData.session) me = sessionData.session.user;
    else {
      const { data, error } = await api.auth.signInAnonymously();
      if (error) throw error;
      me = data.user;
    }
    const { data: person, error: profileError } = await api
      .from("profiles").select("display_name").eq("id", me.id).maybeSingle();
    if (profileError) throw profileError;
    $("site-username").value = person ? person.display_name : "";
    $("site-username").disabled = false;
    $("site-login-submit").disabled = false;
    feedback("site-login-status", person
      ? "Welcome back! Confirm your username or choose a new one."
      : "Create a username to continue. No email address is needed.");
  }
  async function finishLogin(event) {
    event.preventDefault();
    if (!api || !me) return;
    const name = $("site-username").value.trim();
    if (name.length < 2 || name.length > 24) {
      feedback("site-login-status", "Use a username between 2 and 24 characters.", true);
      return;
    }
    const btn = $("site-login-submit");
    btn.disabled = true;
    try {
      await server("set_display_name", { p_name:name });
      $("site-username-label").textContent = name;
      loggedIn = true;
      await heartbeat();
      isAdmin = !!(await server("site_check_admin"));
      $("site-admin-unlock").hidden = isAdmin;
      $("site-admin-panel").hidden = !isAdmin;
      login.close();
      if (isAdmin) {
        feedback("site-admin-status", "Admin access active on this account.");
        await refreshAdmin();
      }
    } catch (error) {
      feedback("site-login-status", "Could not save username: " + errText(error), true);
    } finally {
      btn.disabled = false;
    }
  }
  async function claimAdmin() {
    const code = $("site-admin-code").value;
    if (!loggedIn || !code) {
      feedback("site-admin-status", "Enter your admin access code first.", true);
      return;
    }
    $("site-admin-activate").disabled = true;
    try {
      const ok = await server("site_claim_admin", { p_code:code });
      if (!ok) {
        feedback("site-admin-status", "Access denied. The code may be incorrect or temporarily locked. Try again later.", true);
        return;
      }
      isAdmin = !!(await server("site_check_admin"));
      if (!isAdmin) throw new Error("The server did not confirm admin permissions.");
      $("site-admin-code").value = "";
      $("site-admin-unlock").hidden = true;
      $("site-admin-panel").hidden = false;
      feedback("site-admin-status", "Admin access activated for this account.");
      await refreshAdmin();
    } catch (error) {
      feedback("site-admin-status", "Admin unlock failed: " + errText(error), true);
    } finally {
      $("site-admin-activate").disabled = false;
    }
  }
  async function changeUser(id, action, name) {
    const descriptions = {
      kick:"Remove", freeze:"Freeze", unfreeze:"Unfreeze", restore:"Restore"
    };
    if (!window.confirm(descriptions[action] + " " + name + " in Seuss Search? This only affects their in-site session.")) return;
    try {
      await server("site_manage_user", { p_user_id:id, p_action:action });
      feedback("site-admin-status", descriptions[action] + " applied to " + name + ".");
      await refreshUsers();
    } catch (error) {
      feedback("site-admin-status", "Could not moderate user: " + errText(error), true);
    }
  }
  async function refreshUsers() {
    const output = $("site-admin-users");
    output.replaceChildren(create("p", "talk-muted", "Loading users…"));
    try {
      const data = await server("site_online_users");
      output.replaceChildren();
      if (!data.length) output.append(create("p", "talk-muted", "No recent visitors."));
      for (const person of data) {
        const row = create("div", "site-admin-row");
        const name = person.display_name || "Guest";
        const details = create("div", "site-admin-person");
        details.append(create("strong", "", name + (person.user_id === me.id ? " (you)" : "")));
        const online = new Date(person.last_seen).getTime() > Date.now() - 70000;
        details.append(create("small", "", person.site_state === "active" ? "Online" : person.site_state + (online ? " · online" : " · offline")));
        row.append(details);
        if (person.user_id !== me.id) {
          const controls = create("div", "site-admin-actions");
          const actions = person.site_state === "active" ? [["Freeze","freeze"],["Kick","kick"]]
            : [["Restore access", "restore"]];
          for (const [label, action] of actions) {
            const button = create("button", "chip talk-small" + (action === "kick" ? " talk-danger" : ""), label);
            button.type = "button";
            button.addEventListener("click", () => changeUser(person.user_id, action, name));
            controls.append(button);
          }
          row.append(controls);
        }
        output.append(row);
      }
    } catch (error) {
      output.replaceChildren(create("p", "talk-muted", "Could not load users: " + errText(error)));
    }
  }
  async function moderateRoomMember(roomId, member, muted) {
    try {
      await server("site_admin_mute_room_user", { p_room_id:roomId, p_user_id:member.user_id, p_muted:muted });
      feedback("site-admin-status", (muted ? "Muted " : "Unmuted ") + member.display_name + " in this room.");
      await loadRoomMembers(roomId);
    } catch (error) {
      feedback("site-admin-status", "Room mute failed: " + errText(error), true);
    }
  }
  async function loadRoomMembers(roomId) {
    selectedRoom = roomId;
    const output = $("site-admin-room-members");
    output.replaceChildren(create("p", "talk-muted", "Loading room members…"));
    try {
      const members = await server("site_admin_room_users", { p_room_id:roomId });
      if (selectedRoom !== roomId) return;
      output.replaceChildren();
      if (!members.length) output.append(create("p", "talk-muted", "No room members."));
      for (const member of members) {
        const row = create("div", "site-admin-row");
        row.append(create("span", "", member.display_name + (member.is_owner ? " (owner)" : "")));
        if (member.user_id !== me.id) {
          const btn = create("button", "chip talk-small", member.muted ? "Unmute" : "Mute");
          btn.type = "button";
          btn.addEventListener("click", () => moderateRoomMember(roomId, member, !member.muted));
          row.append(btn);
        }
        output.append(row);
      }
    } catch (error) {
      output.replaceChildren(create("p", "talk-muted", "Could not load room: " + errText(error)));
    }
  }
  async function deleteRoom(item) {
    if (!window.confirm("Permanently delete room \"" + item.name + "\" and its messages?")) return;
    try {
      await server("site_admin_delete_room", { p_room_id:item.id });
      if (selectedRoom === item.id) {
        selectedRoom = null;
        $("site-admin-room-members").replaceChildren();
      }
      feedback("site-admin-status", "Room deleted.");
      await refreshRooms();
    } catch (error) {
      feedback("site-admin-status", "Could not delete room: " + errText(error), true);
    }
  }
  async function refreshRooms() {
    const output = $("site-admin-rooms");
    output.replaceChildren(create("p", "talk-muted", "Loading rooms…"));
    try {
      const { data, error } = await api.from("rooms")
        .select("id,name,is_public,created_by").order("created_at", {ascending:false}).limit(100);
      if (error) throw error;
      output.replaceChildren();
      if (!data.length) output.append(create("p", "talk-muted", "No chat rooms yet."));
      for (const item of data) {
        const row = create("div", "site-admin-row");
        row.append(create("strong", "", item.name + (item.is_public ? "" : " 🔒")));
        const actions = create("div", "site-admin-actions");
        const manage = create("button", "chip talk-small", "Members");
        manage.type = "button";
        manage.addEventListener("click", () => {
          $("site-admin-selected-room").textContent = "Members in " + item.name;
          loadRoomMembers(item.id);
        });
        const remove = create("button", "chip talk-small talk-danger", "Delete");
        remove.type = "button";
        remove.addEventListener("click", () => deleteRoom(item));
        actions.append(manage, remove);
        row.append(actions);
        output.append(row);
      }
    } catch (error) {
      output.replaceChildren(create("p", "talk-muted", "Could not load rooms: " + errText(error)));
    }
  }
  async function refreshAdmin() {
    if (!isAdmin) return;
    await Promise.all([refreshUsers(), refreshRooms()]);
  }
  const tutorial = $("tutorial");
  if (tutorial && tutorial.open) tutorial.close();
  if (typeof login.showModal === "function") login.showModal();
  else login.setAttribute("open", "");
  $("site-username").disabled = true;
  $("site-login-submit").disabled = true;
  feedback("site-login-status", "Connecting securely…");
  startup().catch(error => {
    feedback("site-login-status", "Could not connect: " + errText(error) + ". Retry to continue.", true);
    $("site-login-retry").hidden = false;
  });
  $("site-login-retry").addEventListener("click", () => {
    $("site-login-retry").hidden = true;
    feedback("site-login-status", "Connecting securely…");
    startup().catch(error => {
      feedback("site-login-status", "Could not connect: " + errText(error), true);
      $("site-login-retry").hidden = false;
    });
  });
  login.addEventListener("cancel", event => event.preventDefault());
  $("site-login-form").addEventListener("submit", finishLogin);
  $("site-admin-activate").addEventListener("click", claimAdmin);
  $("site-admin-refresh").addEventListener("click", refreshAdmin);
  $("open-settings").addEventListener("click", () => { if (isAdmin) refreshAdmin(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") heartbeat(); });
  setInterval(heartbeat, 10000);
  setInterval(() => { if (isAdmin && settings.open) refreshUsers(); }, 20000);
})();
