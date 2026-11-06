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
  let selectedMessageRecipient = null;
  let popupChecking = false;
  const popupQueue = [];
  const incomingPopup = $("site-incoming-popup");
  const composeDialog = $("site-admin-compose");
  const directDialog = $("site-admin-direct-dialog");
  let selectedDirectRecipient = null;
  let navigationChecking = false, lastReportedView = null, viewTimer = 0;
  const sharingCheckbox = $("site-share-active-view");
  const policyNotice = $("site-policy-notice");
  const knownAllowed = new Map();
  let guardListLoading = false;
  const accessStep = $("site-access-step");
  const credentialsFields = $("site-credentials-fields");
  let accessProfileName = "", accessPollTimer = 0, accessChecking = false;
  try { sharingCheckbox.checked = localStorage.getItem("dss-share-domain") !== "no"; } catch { sharingCheckbox.checked = true; }
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
  // The alternate proxy engines cannot enforce the same domain checks on
  // their internal traffic. Limit the experimental options to verified admins.
  window.seussCanUseExperimentalProxy = async () =>
    loggedIn && isAdmin && !!(await server("site_check_admin"));
  function setLock(state) {
    if (state === lastState) return;
    lastState = state;
    window.dispatchEvent(new CustomEvent("seuss-site-access-change", { detail:{ state } }));
    const overlay = $("site-moderation-overlay");
    overlay.hidden = state === "active";
    $("site-moderation-title").textContent =
      state === "banned" ? "Your Seuss Search account is banned" :
      state === "frozen" ? "Your Seuss session is paused" : "Your Seuss session has been removed";
    $("site-moderation-explanation").textContent =
      state === "banned"
        ? "A blocked website was detected or an admin restricted this account. Your access to Seuss Search is paused until an admin reviews and lifts the ban."
        : state === "frozen"
          ? "A site moderator temporarily froze this in-site session. The page will unlock when they restore access."
          : "A site moderator removed this session from Seuss Search. Access will return if they restore your account.";
    document.body.classList.toggle("site-access-locked", state !== "active");
  }
  async function heartbeat() {
    if (!loggedIn || checking || !api || document.visibilityState === "hidden") return;
    checking = true;
    try {
      const state = await server("site_heartbeat");
      setLock(["active","frozen","kicked","banned"].includes(state) ? state : "kicked");
      if (state === "active" && typeof window.dssRecheckActiveSite === "function")
        await window.dssRecheckActiveSite();
    } catch (error) {
      feedback("site-login-status", "Connection issue: " + errText(error), true);
    } finally {
      checking = false;
    }
  }
  const ACCOUNT_DOMAIN = "login.seuss.invalid";
  const validUsername = name => /^[A-Za-z][A-Za-z0-9_]{2,23}$/.test(name);
  const nameFromAccount = user => {
    const email = String(user && user.email || "").toLowerCase();
    return email.endsWith("@" + ACCOUNT_DOMAIN)
      ? email.slice(0, -(ACCOUNT_DOMAIN.length + 1))
      : null;
  };
  const lockLoginForm = disabled => {
    $("site-username").disabled = disabled;
    $("site-account-password").disabled = disabled;
    $("site-login-submit").disabled = disabled;
    $("site-account-signin").disabled = disabled;
  };
  const loginFeedback = (message, error = false) => feedback("site-login-status", message, error);
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
    const accountHandle = nameFromAccount(me);
    $("site-username").value = accountHandle || (person ? person.display_name : "");
    lockLoginForm(false);
    if (me.is_anonymous === false && person && person.display_name) {
      // A returning account with a valid persisted Supabase Auth session.
      await activateProfile(person.display_name);
      return;
    }
    loginFeedback(me.is_anonymous === false
      ? "Account signed in. Enter your username and password to log in again."
      : "Create a username and password. No email required.");
  }
  function accessFeedback(message, error = false) {
    feedback("site-access-status", message, error);
  }
  function stopAccessPoll() {
    clearTimeout(accessPollTimer);
    accessPollTimer = 0;
  }
  function showAccessGate(name, status) {
    accessProfileName = name;
    window.seussAccountReady = false;
    document.body.classList.remove("site-authenticated");
    loggedIn = false;
    credentialsFields.hidden = true;
    accessStep.hidden = false;
    $("site-login-title").textContent = "Site access approval required";
    $("site-account-password").value = "";
    if (!login.open) {
      if (typeof login.showModal === "function") login.showModal();
      else login.setAttribute("open", "");
    }
    if (status === "pending")
      accessFeedback("Your access request is pending moderator review. This page checks for approval automatically.");
    else if (status === "denied")
      accessFeedback("A moderator declined your last request. You may enter an invitation code or request review again later.", true);
    else
      accessFeedback("Enter the invitation code or request permission from a moderator.");
    scheduleAccessPoll();
  }
  function resetAccessGate() {
    stopAccessPoll();
    accessStep.hidden = true;
    credentialsFields.hidden = false;
    $("site-login-title").textContent = "Sign up or log in";
    $("site-access-code").value = "";
    accessProfileName = "";
  }
  function scheduleAccessPoll() {
    stopAccessPoll();
    if (accessStep.hidden) return;
    accessPollTimer = setTimeout(async () => {
      if (!document.hidden) await checkAccessApproval(true);
      scheduleAccessPoll();
    }, 12000);
  }
  async function checkAccessApproval(silent = false) {
    if (accessStep.hidden || accessChecking || !api) return;
    accessChecking = true;
    const button = $("site-access-check");
    button.disabled = true;
    try {
      const result = await server("site_access_status");
      if (result && result.state === "approved") {
        stopAccessPoll();
        await activateProfile(accessProfileName || $("site-username").value.trim());
      } else if (result && result.state === "denied") {
        accessFeedback("This access request was denied. You can try the invitation code, or request again after six hours.", true);
      } else if (!silent && result && result.state === "pending") {
        accessFeedback("Your request is still waiting for a moderator.");
      } else if (!silent) {
        accessFeedback("No approved access yet. Enter the code or request approval.");
      }
    } catch (error) {
      if (!silent) accessFeedback("Could not check approval: " + errText(error), true);
    } finally {
      button.disabled = false;
      accessChecking = false;
    }
  }
  async function redeemSiteAccess() {
    if (accessStep.hidden) return;
    const code = $("site-access-code").value.trim();
    if (!code) {
      accessFeedback("Enter the invitation code first.", true);
      return;
    }
    const button = $("site-access-redeem");
    button.disabled = true;
    try {
      // First check the invitation code. If it isn't that code, use the
      // EXISTING server-side moderator code validator (with its own rate limit).
      // Verified moderators receive entry through a separate server-side grant.
      let approved = await server("site_access_redeem", { p_code:code });
      let asModerator = false;
      if (!approved) {
        asModerator = !!(await server("site_claim_admin", { p_code:code }));
        if (asModerator) {
          approved = !!(await server("site_access_enter_as_admin"));
        }
      }
      $("site-access-code").value = "";
      if (!approved) {
        accessFeedback("Code not recognized. Enter an invitation/moderator code, or request moderator approval below. Too many incorrect attempts cause a temporary lock.", true);
        return;
      }
      accessFeedback(asModerator
        ? "Moderator code accepted! Entering with moderator permissions…"
        : "Invitation accepted! Entering Seuss Search…");
      await activateProfile(accessProfileName || $("site-username").value.trim());
    } catch (error) {
      accessFeedback("Code check failed: " + errText(error), true);
    } finally { button.disabled = false; }
  }
  async function requestSiteAccess() {
    if (accessStep.hidden) return;
    const button = $("site-access-request");
    button.disabled = true;
    try {
      const status = await server("site_access_request");
      accessFeedback(status === "pending"
        ? "Request sent! A moderator can approve you in Settings → Account & moderation. This page checks automatically."
        : status === "denied"
          ? "The last request was denied. Please try again after six hours."
          : "Access is already approved. Checking…",
        status === "denied");
      if (status === "approved") await checkAccessApproval();
    } catch (error) {
      accessFeedback("Could not request access: " + errText(error), true);
    } finally { button.disabled = false; }
  }
  async function activateProfile(name) {
    await server("set_display_name", { p_name:name });
    const access = await server("site_access_status");
    if (!access || access.state !== "approved") {
      showAccessGate(name, access && access.state);
      return;
    }
    stopAccessPoll();
    const state = await server("site_heartbeat");
    if (!["active", "frozen", "kicked", "banned"].includes(state)) {
      throw new Error("Could not verify your account's site access.");
    }
    const admin = !!(await server("site_check_admin"));
    $("site-username-label").textContent = name;
    setLock(state);
    isAdmin = admin;
    $("site-admin-unlock").hidden = isAdmin;
    $("site-admin-panel").hidden = !isAdmin;
    loggedIn = true;
    accessStep.hidden = true;
    window.seussAccountReady = true;
    document.body.classList.add("site-authenticated");
    $("site-account-password").value = "";
    if (login.open) login.close();
    window.dispatchEvent(new Event("seuss-site-unlocked"));
    scheduleBackgroundChecks();
    pollInbox();
    pollNavigation();
    reportCurrentView();
    if (isAdmin) {
      feedback("site-admin-status", "Admin access active on this account.");
      await refreshAdmin();
    }
  }
  async function createAccount(event) {
    if (event) event.preventDefault();
    if (!api || !me || !accessStep.hidden) return;
    const username = $("site-username").value.trim();
    const password = $("site-account-password").value;
    if (!validUsername(username)) {
      loginFeedback("Use 3–24 characters: start with a letter, then letters, numbers or underscores.", true);
      return;
    }
    if (password.length < 10 || password.length > 128) {
      loginFeedback("Choose a password between 10 and 128 characters.", true);
      return;
    }
    if (me.is_anonymous === false) {
      loginFeedback("You're already signed in to an account. Use Log In or Switch account in Settings.", true);
      return;
    }
    lockLoginForm(true);
    loginFeedback("Creating your username and password account…");
    try {
      // Built-in Supabase Auth signup avoids the separate Edge Function.
      // This Supabase project has email auto-confirm enabled, so a generated,
      // nondeliverable identifier can serve as the Auth login ID. No visitor
      // email is collected and passwords remain managed by Supabase Auth.
      const email = username.toLowerCase() + "@" + ACCOUNT_DOMAIN;
      const { data, error } = await api.auth.signUp({ email, password });
      if (error) {
        if (/already registered|already exists|email exists|user already/i.test(error.message || "")) {
          throw new Error("That username is already taken. Choose another username or log in.");
        }
        throw error;
      }
      if (!data?.session?.access_token || !data?.user || data.user.is_anonymous) {
        throw new Error(
          "Your account was created but the server did not sign you in. " +
          "Choose Log in and enter the same username and password."
        );
      }
      me = data.user;
      await activateProfile(username);
    } catch (error) {
      loginFeedback("Could not create account: " + errText(error), true);
    } finally {
      lockLoginForm(false);
    }
  }
  async function signInAccount() {
    if (!api) return;
    const name = $("site-username").value.trim();
    const password = $("site-account-password").value;
    const oldEmailLogin = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(name);
    if (!validUsername(name) && !oldEmailLogin) {
      loginFeedback("Enter your username, or the email of an older account.", true);
      return;
    }
    if (!password) {
      loginFeedback("Enter your account password.", true);
      return;
    }
    lockLoginForm(true);
    loginFeedback("Checking your login…");
    try {
      const email = oldEmailLogin ? name : name.toLowerCase() + "@" + ACCOUNT_DOMAIN;
      const { data, error } = await api.auth.signInWithPassword({ email, password });
      if (error) throw new Error("Username or password incorrect.");
      me = data.user;
      const handle = nameFromAccount(me);
      const { data:person, error:profileError } = await api.from("profiles")
        .select("display_name").eq("id", me.id).maybeSingle();
      if (profileError) throw profileError;
      await activateProfile(handle || person?.display_name || name);
    } catch (error) {
      loginFeedback("Login failed: " + errText(error), true);
    } finally {
      lockLoginForm(false);
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
      scheduleBackgroundChecks();
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
  // All text in messages is shown as plain text, never inserted as HTML.
  function showNextIncomingPopup() {
    if (!loggedIn || incomingPopup.open || !popupQueue.length) return;
    const note = popupQueue.shift();
    $("site-incoming-sender").textContent = "An admin has alerted you";
    $("site-incoming-from").textContent = "From: " + (note.sender_name || "Site admin");
    $("site-incoming-body").textContent = note.message;
    $("site-incoming-time").textContent = note.sent_at
      ? new Date(note.sent_at).toLocaleString() : "";
    if (typeof incomingPopup.showModal === "function") incomingPopup.showModal();
    else incomingPopup.setAttribute("open", "");
  }

  async function pollInbox() {
    if (!loggedIn || popupChecking || document.visibilityState === "hidden") return;
    popupChecking = true;
    try {
      const notices = await server("site_fetch_admin_popups");
      if (Array.isArray(notices) && notices.length) {
        popupQueue.push(...notices);
        showNextIncomingPopup();
      }
    } catch (error) {
      console.warn("Could not retrieve site announcements:", errText(error));
    } finally {
      popupChecking = false;
    }
  }

  function openMessageComposer(id, name) {
    if (!isAdmin) return;
    selectedMessageRecipient = id;
    $("site-admin-message-target").textContent = id
      ? "To: " + name
      : "To: everyone online (except you)";
    $("site-admin-message-body").value = "";
    feedback("site-admin-compose-status", "Messages appear as dismissible popups on the recipient's site.");
    if (typeof composeDialog.showModal === "function") composeDialog.showModal();
    else composeDialog.setAttribute("open", "");
    $("site-admin-message-body").focus();
  }

  async function sendAdminMessage(event) {
    event.preventDefault();
    if (!isAdmin) return;
    const message = $("site-admin-message-body").value.trim();
    if (!message || message.length > 400) {
      feedback("site-admin-compose-status", "Enter 1–400 characters.", true);
      return;
    }
    const send = $("site-admin-compose-send");
    send.disabled = true;
    try {
      const count = await server("site_send_admin_popup", {
        p_recipient_id:selectedMessageRecipient,
        p_message:message
      });
      composeDialog.close();
      feedback("site-admin-status", count
        ? "Popup sent to " + count + (count === 1 ? " person." : " people.")
        : "Nobody else is currently online to receive a message.");
    } catch (error) {
      feedback("site-admin-compose-status", "Couldn't send popup: " + errText(error), true);
    } finally {
      send.disabled = false;
    }
  }

  // The only reported browsing detail is the current top-level hostname or
  // an in-site section label. Visitors can disable reporting in Settings.
  function currentReportedView() {
    if (!sharingCheckbox.checked) return "Not shared";
    return typeof window.getSeussCurrentView === "function"
      ? window.getSeussCurrentView() : "Home";
  }
  function reportCurrentView() {
    clearTimeout(viewTimer);
    if (!loggedIn || lastState !== "active") return;
    viewTimer = setTimeout(async () => {
      const value = currentReportedView();
      if (value === lastReportedView) return;
      try {
        await server("site_set_active_view", { p_view:value });
        lastReportedView = value;
      } catch (error) {
        console.warn("Could not update current site view:", errText(error));
      }
    }, 400);
  }

  function showDirectedNotice(sender, host) {
    const note = $("site-admin-redirect-notice");
    $("site-admin-redirect-text").textContent =
      (sender || "A site admin") + " opened " + host +
      " in a new tab inside Seuss Search. You can close this tab.";
    note.hidden = false;
  }

  async function pollNavigation() {
    if (!loggedIn || navigationChecking || document.hidden || lastState !== "active") return;
    navigationChecking = true;
    try {
      const rows = await server("site_fetch_navigation_request");
      if (!Array.isArray(rows) || !rows.length) return;
      const item = rows[0], target = new URL(item.target_url);
      if (target.protocol !== "https:" || target.username || target.password) return;
      if (typeof window.openAdminDirectedSite !== "function") return;
      if (settings.open) settings.close();
      await window.openAdminDirectedSite(target.href);
      showDirectedNotice(item.sender_name, target.hostname);
    } catch (error) {
      console.warn("Admin site navigation failed:", errText(error));
    } finally {
      navigationChecking = false;
    }
  }

  function openDirectComposer(id, name) {
    if (!isAdmin) return;
    selectedDirectRecipient = id;
    $("site-admin-direct-target").textContent = "Open a proxy tab for " + name;
    $("site-admin-direct-url").value = "https://";
    feedback("site-admin-direct-status", "Only HTTPS websites are allowed. The visitor can close the tab.");
    if (typeof directDialog.showModal === "function") directDialog.showModal();
    else directDialog.setAttribute("open", "");
    $("site-admin-direct-url").focus();
  }

  async function sendAdminNavigation(event) {
    event.preventDefault();
    if (!isAdmin || !selectedDirectRecipient) return;
    let target;
    try {
      const raw = $("site-admin-direct-url").value.trim();
      target = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw);
      if (target.protocol !== "https:" || target.username || target.password
          || !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(target.hostname)
          || target.port || target.href.length > 2048) {
        throw new Error("Enter a normal HTTPS website URL.");
      }
    } catch (error) {
      feedback("site-admin-direct-status", "Invalid URL: " + errText(error), true);
      return;
    }
    const button = $("site-admin-direct-send");
    button.disabled = true;
    try {
      await server("site_admin_send_navigation", {
        p_user_id:selectedDirectRecipient, p_url:target.href
      });
      directDialog.close();
      feedback("site-admin-status", "Redirect requested to " + target.hostname +
        ". A new in-site tab will open when the visitor next checks for updates.");
    } catch (error) {
      feedback("site-admin-direct-status", "Could not open site for visitor: " + errText(error), true);
    } finally { button.disabled = false; }
  }

  // Proxy-only site protection. Never send full URLs, searches, or page text.
  // Visitors can opt out of routine domain sharing, but site safety checks
  // still evaluate domains they try to visit within this proxy.
  function showPolicyNotice(message) {
    $("site-policy-description").textContent = message;
    if (!policyNotice.open) {
      if (typeof policyNotice.showModal === "function") policyNotice.showModal();
      else policyNotice.setAttribute("open", "");
    }
  }

  window.dssSitePolicyCheck = async target => {
    if (!loggedIn || !api) return false;
    let host;
    try {
      const u = new URL(target);
      if (u.protocol !== "https:" && u.protocol !== "http:") return true;
      host = u.hostname.toLowerCase();
      if (!host || host.length > 120) return false;
    } catch { return false; }

    const expires = knownAllowed.get(host);
    if (expires && expires > Date.now()) return true;
    try {
      const decision = await server("site_guard_evaluate", { p_domain:host });
      if (decision && decision.blocked) {
        knownAllowed.delete(host);
        if (decision.banned) {
          setLock("banned");
          feedback("site-admin-status", "Your account is restricted. Ask a site admin to review the ban.", true);
        } else {
          showPolicyNotice("This website is blocked by Seuss Search site rules. The attempt has been reported to site admins.");
        }
        return false;
      }
      knownAllowed.set(host, Date.now() + 20000);
      return true;
    } catch (error) {
      console.warn("Could not check Seuss Search site rules:", errText(error));
      showPolicyNotice("Website safety checks are temporarily unavailable. Please try again later.");
      return false;
    }
  };

  async function editGuardRule(event) {
    event.preventDefault();
    if (!isAdmin) return;
    const input = $("site-guard-domain");
    const domain = input.value.trim().toLowerCase()
      .replace(/^https?:\/\//,"").replace(/\/.*$/,"");
    if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(domain) || domain.length>120) {
      feedback("site-guard-status", "Enter a valid domain without a path or URL scheme.", true);
      return;
    }
    const button = $("site-guard-add");
    button.disabled = true;
    try {
      await server("site_admin_guard_change_rule", {p_domain:domain,p_action:"add"});
      input.value = "";
      feedback("site-guard-status", domain + " is now blocked and reported.");
      await refreshGuard();
    } catch(error) {
      feedback("site-guard-status", "Could not add domain: " + errText(error), true);
    } finally {button.disabled = false;}
  }

  async function setGuardRule(domain,action) {
    if (!isAdmin) return;
    if (action==="remove" && !window.confirm("Remove "+domain+" from the custom block list?")) return;
    try {
      await server("site_admin_guard_change_rule", {p_domain:domain,p_action:action});
      feedback("site-guard-status", domain + " removed from the custom block list.");
      await refreshGuard();
    } catch(error) { feedback("site-guard-status", "Rule update failed: " + errText(error), true); }
  }

  async function setGuardBan(id,name,action) {
    if (!isAdmin) return;
    if (!window.confirm((action==="ban"?"Ban ":"Unban ")+name+" from Seuss Search?")) return;
    try {
      await server("site_admin_guard_set_ban", {p_user_id:id,p_action:action});
      feedback("site-guard-status", (action==="ban"?"Banned ":"Unbanned ")+name+".");
      await Promise.all([refreshGuard(),refreshUsers()]);
    } catch(error) { feedback("site-guard-status", "Ban update failed: " + errText(error), true); }
  }

  async function refreshGuard() {
    if (!isAdmin || guardListLoading) return;
    guardListLoading = true;
    const ruleBox = $("site-guard-rules");
    const banBox = $("site-guard-bans");
    const eventBox = $("site-guard-events");
    try {
      const [rules,bans,events] = await Promise.all([
        server("site_admin_guard_rules"),
        server("site_admin_guard_bans"),
        server("site_admin_guard_incidents")
      ]);
      ruleBox.replaceChildren();
      banBox.replaceChildren();
      eventBox.replaceChildren();
      if (!rules.length) ruleBox.append(create("p","talk-muted","No custom domains blocked yet."));
      for(const rule of rules) {
        const row=create("div","site-admin-row");
        row.append(create("strong","",rule.domain));
        const remove=create("button","chip talk-small","Remove");
        remove.type="button";
        remove.addEventListener("click",()=>setGuardRule(rule.domain,"remove"));
        row.append(remove);ruleBox.append(row);
      }
      if (!bans.length) banBox.append(create("p","talk-muted","No accounts currently banned."));
      for(const entry of bans) {
        const row=create("div","site-admin-row");
        const detail=create("div","site-admin-person");
        detail.append(create("strong","",entry.display_name || "Guest"));
        detail.append(create("small","","Reason: "+(entry.reason==="adult"?"Built-in adult-site filter":"Admin action")));
        detail.append(create("small","","Blocked domain: "+(entry.reason==="adult"?entry.domain:"Not applicable")));
        detail.append(create("small","","Since: "+new Date(entry.banned_at).toLocaleString()));
        const unban=create("button","chip talk-small","Unban");
        unban.type="button";
        unban.addEventListener("click",()=>setGuardBan(entry.user_id,entry.display_name || "Guest","unban"));
        row.append(detail,unban);banBox.append(row);
      }
      if (!events.length) eventBox.append(create("p","talk-muted","No blocked visits recorded."));
      for(const event of events) {
        const row=create("div","site-admin-row");
        const detail=create("div","site-admin-person");
        detail.append(create("strong","",(event.display_name||"Guest")+" · "+event.category));
        detail.append(create("small","",event.domain));
        detail.append(create("small","",new Date(event.occurred_at).toLocaleString()));
        row.append(detail);eventBox.append(row);
      }
    } catch(error) {
      feedback("site-guard-status", "Could not refresh site rules: " + errText(error), true);
    } finally {guardListLoading=false;}
  }

  async function refreshUsers() {
    const output = $("site-admin-users");
    output.replaceChildren(create("p", "talk-muted", "Loading users…"));
    try {
      const data = await server("site_admin_visitor_views");
      output.replaceChildren();
      if (!data.length) output.append(create("p", "talk-muted", "No recent visitors."));
      for (const person of data) {
        const row = create("div", "site-admin-row");
        const name = person.display_name || "Guest";
        const details = create("div", "site-admin-person");
        details.append(create("strong", "", name + (person.user_id === me.id ? " (you)" : "")));
        const online = new Date(person.last_seen).getTime() > Date.now() - 150000;
        details.append(create("small", "", person.site_state === "active"
          ? (online ? "Recently active" : "Offline")
          : person.site_state + (online ? " · recently active" : " · offline")));
        details.append(create("small", "", "Current site: " +
          (online && person.site_state === "active"
            ? (person.active_view || "Not reported yet") : "Not available")));
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
          if (online && person.site_state === "active") {
            const messageButton = create("button", "chip talk-small", "Message");
            messageButton.type = "button";
            messageButton.addEventListener("click", () => openMessageComposer(person.user_id, name));
            controls.prepend(messageButton);
            const directButton = create("button", "chip talk-small", "Go to site");
            directButton.type = "button";
            directButton.addEventListener("click", () => openDirectComposer(person.user_id, name));
            controls.prepend(directButton);
            const banButton = create("button", "chip talk-small talk-danger", "Ban");
            banButton.type = "button";
            banButton.addEventListener("click", () => setGuardBan(person.user_id,name,"ban"));
            controls.append(banButton);
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
  async function revealRoomPassword(item, button, valueNode) {
    if (!isAdmin) return;
    if (button.dataset.revealed === "true") {
      valueNode.textContent = "";
      valueNode.hidden = true;
      button.dataset.revealed = "false";
      button.textContent = "Reveal password";
      return;
    }
    button.disabled = true;
    button.textContent = "Loading…";
    try {
      const password = await server("site_admin_reveal_room_password", { p_room_id:item.id });
      valueNode.textContent = "Password: " + password;
      valueNode.hidden = false;
      button.dataset.revealed = "true";
      button.textContent = "Hide password";
    } catch (error) {
      feedback("site-admin-status", "Could not reveal password: " + errText(error), true);
      button.textContent = "Reveal password";
    } finally {
      button.disabled = false;
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
        if (!item.is_public) {
          const reveal = create("button", "chip talk-small", "Reveal password");
          reveal.type = "button";
          reveal.dataset.revealed = "false";
          const passwordValue = create("small", "talk-muted", "");
          passwordValue.hidden = true;
          reveal.addEventListener("click", () => revealRoomPassword(item, reveal, passwordValue));
          actions.append(reveal);
          row.append(passwordValue);
        }
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
  async function refreshAccessRequests() {
    if (!isAdmin) return;
    const output = $("site-access-admin-list");
    output.replaceChildren(create("p","talk-muted","Checking for access requests…"));
    try {
      const requests = await server("site_admin_access_requests");
      output.replaceChildren();
      if (!requests.length) {
        output.append(create("p","talk-muted","No pending access requests."));
        return;
      }
      for (const request of requests) {
        const row = create("div","site-admin-row");
        const details = create("div","site-admin-person");
        details.append(create("strong","",request.display_name || "Account"));
        details.append(create("small","","Requested: " + new Date(request.requested_at).toLocaleString()));
        const actions = create("div","site-admin-actions");
        const accept = create("button","chip talk-small","Approve");
        const deny = create("button","chip talk-small talk-danger","Deny");
        accept.type = deny.type = "button";
        accept.addEventListener("click", () => decideAccessRequest(request.user_id,true,request.display_name));
        deny.addEventListener("click", () => decideAccessRequest(request.user_id,false,request.display_name));
        actions.append(accept,deny);
        row.append(details,actions);
        output.append(row);
      }
    } catch (error) {
      output.replaceChildren(create("p","talk-muted","Could not load requests: " + errText(error)));
    }
  }
  async function decideAccessRequest(userId, allow, displayName) {
    if (!isAdmin || !window.confirm((allow ? "Approve " : "Deny ") +
      (displayName || "this account") + "'s access request?")) return;
    try {
      await server("site_admin_access_decide", { p_user_id:userId, p_approve:allow });
      feedback("site-access-admin-status", (allow ? "Approved " : "Denied ") + (displayName || "account") + ".");
      await refreshAccessRequests();
    } catch (error) {
      feedback("site-access-admin-status", "Could not update request: " + errText(error), true);
    }
  }
  async function refreshAdmin() {
    if (!isAdmin) return;
    await Promise.all([refreshUsers(), refreshRooms(), refreshGuard(), refreshAccessRequests()]);
  }
  const tutorial = $("tutorial");
  if (tutorial && tutorial.open) tutorial.close();
  if (typeof login.showModal === "function") login.showModal();
  else login.setAttribute("open", "");
  lockLoginForm(true);
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
  // The account screen cannot be dismissed to expose the site.
  login.addEventListener("close", () => {
    if (window.seussAccountReady === true) return;
    try {
      if (typeof login.showModal === "function") login.showModal();
      else login.setAttribute("open", "");
    } catch { login.setAttribute("open", ""); }
  });
  $("site-login-form").addEventListener("submit", createAccount);
  $("site-account-signin").addEventListener("click", signInAccount);
  $("site-access-redeem").addEventListener("click", redeemSiteAccess);
  $("site-access-request").addEventListener("click", requestSiteAccess);
  $("site-access-check").addEventListener("click", () => checkAccessApproval());
  $("site-access-code").addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      redeemSiteAccess();
    }
  });
  $("site-access-switch").addEventListener("click", () => $("site-account-switch").click());
  $("site-access-admin-refresh").addEventListener("click", refreshAccessRequests);
  $("site-account-switch").addEventListener("click", async () => {
    // Hide the entire site as soon as a session switch starts.
    window.seussAccountReady = false;
    document.body.classList.remove("site-authenticated");
    loggedIn = false;
    stopAccessPoll();
    try {
      if (api) {
        const { error:signOutError } = await api.auth.signOut();
        if (signOutError) throw signOutError;
        const { data, error } = await api.auth.signInAnonymously();
        if (error) throw error;
        me = data.user;
      }
      loggedIn = false;
      isAdmin = false;
      lastReportedView = null;
      $("site-admin-redirect-notice").hidden = true;
      $("site-admin-unlock").hidden = false;
      $("site-admin-panel").hidden = true;
      $("site-account-password").value = "";
      $("site-username").value = "";
      resetAccessGate();
      lockLoginForm(false);
      $("site-login-submit").textContent = "Create account";
      feedback("site-login-status", "Signed out. Create a username and password account, or log in.");
      if (typeof login.showModal === "function") login.showModal();
      else login.setAttribute("open", "");
    } catch (error) {
      if (!login.open) {
        if (typeof login.showModal === "function") login.showModal();
        else login.setAttribute("open", "");
      }
      feedback("site-login-status", "Could not switch accounts: " + errText(error), true);
    }
  });
  $("site-admin-activate").addEventListener("click", claimAdmin);
  $("site-admin-refresh").addEventListener("click", refreshAdmin);
  $("site-guard-add").addEventListener("click", editGuardRule);
  $("site-guard-domain").addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      editGuardRule(event);
    }
  });
  $("site-guard-refresh").addEventListener("click", refreshGuard);
  $("site-policy-dismiss").addEventListener("click", () => policyNotice.close());
  $("site-admin-message-everyone").addEventListener("click", () => openMessageComposer(null, "everyone"));
  $("site-admin-message-form").addEventListener("submit", sendAdminMessage);
  $("site-admin-direct-form").addEventListener("submit", sendAdminNavigation);
  $("site-admin-direct-cancel").addEventListener("click", () => directDialog.close());
  $("site-admin-redirect-dismiss").addEventListener("click", () => {
    $("site-admin-redirect-notice").hidden = true;
  });
  sharingCheckbox.addEventListener("change", () => {
    try { localStorage.setItem("dss-share-domain", sharingCheckbox.checked ? "yes" : "no"); } catch {}
    lastReportedView = null;
    reportCurrentView();
  });
  window.addEventListener("dss-active-view-change", reportCurrentView);
  $("site-admin-compose-cancel").addEventListener("click", () => composeDialog.close());
  $("site-incoming-dismiss").addEventListener("click", () => incomingPopup.close());
  incomingPopup.addEventListener("close", showNextIncomingPopup);
  $("open-settings").addEventListener("click", () => {
    if (isAdmin) refreshAdmin();
    scheduleBackgroundChecks();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      if (!accessStep.hidden) checkAccessApproval(true);
      heartbeat();
      pollInbox();
      pollNavigation();
      reportCurrentView();
    }
  });
  // Keep background network work light. Each check has its own timer so
  // one poll never cancels another; hidden tabs use a slower cadence.
  let heartbeatTimer = 0, inboxTimer = 0, adminTimer = 0, navigationTimer = 0;
  function scheduleHeartbeat() {
    clearTimeout(heartbeatTimer);
    if (!loggedIn) return;
    const perf = !!(window.settings && window.settings.performanceMode);
    const delay = document.hidden ? 180000 : perf ? 120000 : 30000;
    heartbeatTimer = setTimeout(async () => {
      if (!document.hidden) await heartbeat();
      scheduleHeartbeat();
    }, delay);
  }
  function scheduleInbox() {
    clearTimeout(inboxTimer);
    if (!loggedIn) return;
    const perf = !!(window.settings && window.settings.performanceMode);
    const delay = document.hidden ? 180000 : perf ? 90000 : 20000;
    inboxTimer = setTimeout(async () => {
      if (!document.hidden) await pollInbox();
      scheduleInbox();
    }, delay);
  }
  function scheduleAdminRefresh() {
    clearTimeout(adminTimer);
    if (!loggedIn || !isAdmin || !settings.open) return;
    const perf = !!(window.settings && window.settings.performanceMode);
    adminTimer = setTimeout(async () => {
      if (!document.hidden && settings.open) {
        await Promise.all([refreshUsers(), refreshAccessRequests()]);
      }
      scheduleAdminRefresh();
    }, perf ? 120000 : 30000);
  }
  function scheduleNavigation() {
    clearTimeout(navigationTimer);
    if (!loggedIn) return;
    const perf = !!(window.settings && window.settings.performanceMode);
    const delay = document.hidden ? 180000 : perf ? 60000 : 12000;
    navigationTimer = setTimeout(async () => {
      if (!document.hidden) await pollNavigation();
      scheduleNavigation();
    }, delay);
  }
  function scheduleBackgroundChecks() {
    scheduleHeartbeat();
    scheduleInbox();
    scheduleNavigation();
    scheduleAdminRefresh();
  }
  document.addEventListener("visibilitychange", scheduleBackgroundChecks);
  window.addEventListener("dss-performance-mode-change", scheduleBackgroundChecks);
  scheduleBackgroundChecks();
})();
