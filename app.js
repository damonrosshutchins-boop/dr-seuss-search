"use strict";
/* Dr. Seuss Search — a Scramjet-powered web proxy that runs on static hosting (GitHub Pages). */

const BASE = new URL("./", document.querySelector('script[src*="app.js"]')?.src || location.href); // stable app directory, including GitHub Pages subpaths
// The site UI stays locked until the signed-in account saves its profile.
window.seussAccountReady = false;
function requireSeussAccount() {
	return window.seussAccountReady === true &&
		document.body.classList.contains("site-authenticated");
}
const at = (p) => new URL(p, BASE).pathname;

const DEFAULTS = {
	engine: "https://search.brave.com/search?q=%s",
	transport: "libcurl",
	wisp: "wss://wisp.mercurywork.shop/",
	fallbackWisp: "",
	background: "",
	accent: "#d8262f",
	theme: "light",
	reducedMotion: false,
	performanceMode: false,
	embedSearchPages: false,
	proxyEngine: "seusslite",
	rammerheadServer: "",
	adriftServer: "https://adrift-6c1f6.web.app/",
};
const ENGINE_NAMES = {
	"https://duckduckgo.com/?q=%s": "DuckDuckGo",
	"https://www.google.com/search?q=%s": "Google",
	"https://www.bing.com/search?q=%s": "Bing",
	"https://search.brave.com/search?q=%s": "Brave",
};
const TRANSPORTS = { libcurl: at("libcurl/index.mjs"), epoxy: at("epoxy/index.mjs") };
// Only two transport implementations are bundled. Automatic options
// select fallback order; they are not additional network engines.
const TRANSPORT_OPTIONS = ["libcurl", "epoxy", "auto-libcurl", "auto-epoxy"];
const TRANSPORT_LABELS = { libcurl:"libcurl", epoxy:"Epoxy" };
function transportPreference() {
	return TRANSPORT_OPTIONS.includes(settings.transport) ? settings.transport : "libcurl";
}
function preferredTransport() {
	return ["epoxy", "auto-epoxy"].includes(transportPreference()) ? "epoxy" : "libcurl";
}
const TILES = [
	["Google", "https://www.google.com", "#4285f4"],
	["YouTube", "https://www.youtube.com", "#d8262f"],
	["Wikipedia", "https://en.wikipedia.org", "#1d1a17"],
	["Reddit", "https://www.reddit.com", "#ff4500"],
	["Discord", "https://discord.com/app", "#5865f2"],
	["GitHub", "https://github.com", "#24292f"],
];

const $ = (id) => document.getElementById(id);
let storedSettings = {};
try { storedSettings = JSON.parse(localStorage.getItem("dss-settings") || "{}") || {}; } catch { storedSettings = {}; }
const settings = Object.assign({}, DEFAULTS, storedSettings);
window.settings = settings;
const save = () => {
	try { localStorage.setItem("dss-settings", JSON.stringify(settings)); }
	catch { showError("Settings could not be saved.", "Your browser may have local storage disabled or full."); }
};

function applyAppearance() {
	const accent = /^#[0-9a-f]{6}$/i.test(settings.accent) ? settings.accent : DEFAULTS.accent;
	document.documentElement.style.setProperty("--red", accent);
	document.documentElement.dataset.theme = settings.theme === "dark" ? "dark" : "light";
	document.documentElement.classList.toggle("reduce-motion", !!settings.reducedMotion || !!settings.performanceMode);
	document.documentElement.classList.toggle("performance-mode", !!settings.performanceMode);
	const bg = String(settings.background || "").trim();
	if (bg) {
		try {
			const u = new URL(bg);
			if (u.protocol === "https:" || u.protocol === "http:") {
				document.body.style.backgroundImage = "linear-gradient(rgba(255,246,227,.82), rgba(255,246,227,.82)), url(" + JSON.stringify(u.href) + ")";
				document.body.style.backgroundSize = "cover";
				document.body.style.backgroundAttachment = "fixed";
				document.body.style.backgroundPosition = "center";
			} else throw new Error("Unsupported image URL");
		} catch {
			document.body.style.backgroundImage = "";
			settings.background = "";
		}
	} else {
		document.body.style.backgroundImage = "";
		document.body.style.backgroundSize = "";
		document.body.style.backgroundAttachment = "";
		document.body.style.backgroundPosition = "";
	}
}

/* ---------- Rammerhead server validation ---------- */
function rammerheadServerURL(raw = settings.rammerheadServer) {
	try {
		if (!raw || !String(raw).trim()) return null;
		const u = new URL(String(raw).trim());
		// Rammerhead sessions contain browsing cookies. Never submit them over plain HTTP.
		if (u.protocol !== "https:" || u.username || u.password || u.origin === location.origin) return null;
		// Standard Rammerhead is hosted at the server root.
		return u.origin + "/";
	} catch { return null; }
}

function adriftPortalURL(raw = settings.adriftServer) {
	try {
		const u = new URL(String(raw || "").trim());
		if (u.protocol !== "https:" || u.username || u.password ||
			u.origin === location.origin) return null;
		// Remote proxy portals are third-party websites; do not forward account
		// tokens, internal state, or arbitrary user-entered query parameters.
		return u.origin + u.pathname;
	} catch { return null; }
}
/* ---------- Settings dialog ---------- */
const dlg = $("settings");
// The private admin relay is deliberately not saved or sent to a service;
// it lives only in page memory until the tab closes or access changes.
// This is a UI/session privacy preference, not a concealed network tunnel.
let adminRelaySession = "";
let adminRelayPermissionChecked = false;
let adminRelayVisibilitySequence = 0;
async function canUseAdminRelay() {
	if (!requireSeussAccount() ||
		typeof window.seussCanUseExperimentalProxy !== "function") return false;
	try { return (await window.seussCanUseExperimentalProxy()) === true; }
	catch { return false; }
}
async function showAdminRelaySettings() {
	const sequence = ++adminRelayVisibilitySequence;
	const panel = $("s-admin-relay-panel");
	panel.hidden = true;
	$("s-admin-relay-enabled").disabled = true;
	adminRelayPermissionChecked = false;
	const allowed = await canUseAdminRelay();
	if (sequence !== adminRelayVisibilitySequence || !dlg.open) return;
	adminRelayPermissionChecked = allowed;
	if (!allowed) return;
	panel.hidden = false;
	$("s-admin-relay-enabled").disabled = false;
	$("s-admin-relay-enabled").checked = !!adminRelaySession;
	$("s-admin-relay-url").value = adminRelaySession;
	$("s-admin-relay-code").value = "";
	$("s-admin-relay-status").textContent = adminRelaySession
		? "Session-only relay selected for Scramjet."
		: "Disabled — existing primary and fallback relays are unchanged.";
}
$("s-admin-relay-enabled").addEventListener("change", () => {
	$("s-admin-relay-status").textContent =
		$("s-admin-relay-enabled").checked
			? "Enter a trusted secure wss:// relay and Save."
			: "Admin relay disabled after Save.";
});
$("s-admin-relay-url").addEventListener("input", () => {
	$("s-admin-relay-url").setCustomValidity("");
});
// Keep relay presets separate from the saved transport setting. Selecting
// a preset changes only the Settings form until Save is pressed.
const wispPresetSelect = $("s-wisp-preset");
const wispUrlInput = $("s-wisp");
const wispTestStatus = $("s-wisp-test-status");
const wispTestButton = $("s-wisp-test");
const fallbackWispPresetSelect = $("s-fallback-wisp-preset");
const fallbackWispUrlInput = $("s-fallback-wisp");
const fallbackWispTestStatus = $("s-fallback-wisp-test-status");
const fallbackWispTestButton = $("s-fallback-wisp-test");
const WISP_PRESET_VALUES = [...wispPresetSelect.options]
	.map(option => option.value).filter(value => value !== "custom");
let cancelWispPresetTest = null;
function clearWispPresetTest() {
	if (cancelWispPresetTest) cancelWispPresetTest();
	cancelWispPresetTest = null;
	wispTestStatus.textContent = "";
	wispTestButton.disabled = false;
}
function syncWispPreset() {
	const value = wispUrlInput.value.trim();
	wispPresetSelect.value = WISP_PRESET_VALUES.includes(value) ? value : "custom";
}
function validateWispAddress(input) {
	try {
		const url = new URL(String(input || "").trim());
		if (url.protocol !== "wss:" || !url.hostname || url.username ||
			url.password || url.hash) return null;
		return url.href;
	} catch { return null; }
}
// Direct, short-lived Wisp handshake test: independent of Scramjet and its
// service worker. A response confirms only Wisp protocol availability.
// It cannot prove a remote website is reachable through the relay.
function probeWispHandshake(address, timeoutMs = 6000, signal = null) {
	return new Promise(resolve => {
		let socket = null;
		let timer = null;
		let done = false;
		const abort = () => finish(false, "Test cancelled.");
		const finish = (ok, reason) => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			if (signal) signal.removeEventListener("abort", abort);
			try { socket?.close(); } catch {}
			resolve({ ok, reason });
		};
		if (signal?.aborted) return finish(false, "Test cancelled.");
		try {
			socket = new WebSocket(address);
			socket.binaryType = "arraybuffer";
		} catch {
			return finish(false, "Could not create a WebSocket.");
		}
		if (signal) signal.addEventListener("abort", abort, { once:true });
		timer = setTimeout(() => finish(false, "Wisp handshake timed out."), timeoutMs);
		socket.addEventListener("message", event => {
			const bytes = event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : null;
			const valid = bytes && bytes.length >= 5 && [3,5].includes(bytes[0]) &&
				bytes[1] === 0 && bytes[2] === 0 && bytes[3] === 0 && bytes[4] === 0;
			finish(!!valid, valid ? "Wisp handshake received." : "Not a Wisp handshake.");
		});
		socket.addEventListener("error", () => finish(false, "WebSocket connection failed."));
		socket.addEventListener("close", () => finish(false, "Connection closed before handshake."));
	});
}
function syncFallbackWispPreset() {
	const value = fallbackWispUrlInput.value.trim();
	fallbackWispPresetSelect.value = value === "" ? "" :
		WISP_PRESET_VALUES.includes(value) ? value : "custom";
}
let cancelFallbackWispTest = null;
function clearFallbackWispTest() {
	if (cancelFallbackWispTest) cancelFallbackWispTest();
	cancelFallbackWispTest = null;
	fallbackWispTestButton.disabled = false;
	fallbackWispTestStatus.textContent = "";
}
fallbackWispPresetSelect.addEventListener("change", () => {
	clearFallbackWispTest();
	fallbackWispUrlInput.setCustomValidity("");
	if (fallbackWispPresetSelect.value === "custom") fallbackWispUrlInput.focus();
	else fallbackWispUrlInput.value = fallbackWispPresetSelect.value;
});
fallbackWispUrlInput.addEventListener("input", () => {
	fallbackWispUrlInput.setCustomValidity("");
	syncFallbackWispPreset();
	clearFallbackWispTest();
});
fallbackWispTestButton.addEventListener("click", async () => {
	clearFallbackWispTest();
	const candidate = fallbackWispUrlInput.value.trim();
	if (!candidate) {
		fallbackWispTestStatus.textContent = "Fallback is disabled.";
		return;
	}
	const address = validateWispAddress(candidate);
	if (!address) {
		fallbackWispTestStatus.textContent = "Enter a valid secure wss:// address.";
		return;
	}
	const controller = new AbortController();
	let cancelled = false;
	cancelFallbackWispTest = () => { cancelled = true; controller.abort(); };
	fallbackWispTestButton.disabled = true;
	fallbackWispTestStatus.textContent = "Testing fallback Wisp handshake…";
	const result = await probeWispHandshake(address, 7000, controller.signal);
	if (cancelled) return;
	cancelFallbackWispTest = null;
	fallbackWispTestButton.disabled = false;
	fallbackWispTestStatus.textContent = result.reason +
		(result.ok ? " Save to enable this fallback." : " Check this relay's settings.");
});
wispPresetSelect.addEventListener("change", () => {
	clearWispPresetTest();
	wispUrlInput.setCustomValidity("");
	if (wispPresetSelect.value !== "custom") wispUrlInput.value = wispPresetSelect.value;
	else wispUrlInput.focus();
});
wispUrlInput.addEventListener("input", () => {
	wispUrlInput.setCustomValidity("");
	syncWispPreset();
	clearWispPresetTest();
});
wispTestButton.addEventListener("click", () => {
	clearWispPresetTest();
	const address = validateWispAddress(wispUrlInput.value);
	if (!address) {
		wispTestStatus.textContent = "Enter a valid secure wss:// relay address.";
		return;
	}
	let socket;
	try {
		socket = new WebSocket(address);
		socket.binaryType = "arraybuffer";
	} catch {
		wispTestStatus.textContent = "Could not open a WebSocket to this relay.";
		return;
	}
	let done = false;
	let timer;
	const finish = (message) => {
		if (done) return;
		done = true;
		clearTimeout(timer);
		try { socket.close(); } catch {}
		wispTestButton.disabled = false;
		wispTestStatus.textContent = message;
		if (cancelWispPresetTest === cancel) cancelWispPresetTest = null;
	};
	const cancel = () => finish("");
	cancelWispPresetTest = cancel;
	wispTestButton.disabled = true;
	wispTestStatus.textContent = "Connecting to relay…";
	let opened = false;
	timer = setTimeout(() => finish(opened
		? "Connected, but no Wisp handshake was received."
		: "Connection timed out. This relay may be unavailable."), 11000);
	socket.addEventListener("open", () => {
		if (done) return;
		opened = true;
		wispTestStatus.textContent = "WebSocket opened. Checking Wisp handshake…";
	});
	socket.addEventListener("message", event => {
		if (done) return;
		const bytes = event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : null;
		const valid = bytes && bytes.length >= 5 && [3,5].includes(bytes[0]) &&
			bytes[1] === 0 && bytes[2] === 0 && bytes[3] === 0 && bytes[4] === 0;
		finish(valid ? "Wisp handshake received. Save to use this relay." :
			"WebSocket replied without a valid Wisp handshake.");
	});
	socket.addEventListener("error", () => finish("WebSocket failed. Try another relay."));
	socket.addEventListener("close", () => {
		if (!done) finish("Connection closed before a Wisp handshake.");
	});
});
function syncLabel() {
	$("engine-label").textContent = settings.proxyEngine === "seusslite" ?
		"Seuss Search" : settings.proxyEngine === "customloader" ?
		"DuckDuckGo" : (ENGINE_NAMES[settings.engine] || "custom engine");
}
function openSettings() {
	$("s-engine").value = settings.engine;
	$("s-embed-search").checked = !!settings.embedSearchPages;
	$("s-proxy-engine").value =
		["seusslite","customloader","scramjet","rammerhead","ultraviolet","adrift"].includes(settings.proxyEngine)
			? settings.proxyEngine : "scramjet";
	$("s-rammerhead-url").value = settings.rammerheadServer || "";
	$("s-adrift-url").value = settings.adriftServer || "";
	$("s-transport").value = transportPreference();
	$("s-wisp").value = settings.wisp;
	syncWispPreset();
	clearWispPresetTest();
	fallbackWispUrlInput.value = settings.fallbackWisp || "";
	syncFallbackWispPreset();
	clearFallbackWispTest();
	$("s-background").value = settings.background || "";
	$("s-accent").value = settings.accent || DEFAULTS.accent;
	$("s-theme").value = settings.theme || "light";
	$("s-motion").checked = !!settings.reducedMotion;
	$("s-performance").checked = !!settings.performanceMode;
	if (typeof dlg.showModal === "function") { if (!dlg.open) dlg.showModal(); } else { dlg.setAttribute("open", ""); }
	void showAdminRelaySettings();
}
$("open-settings").onclick = openSettings;
$("engine-label").onclick = openSettings;
$("s-reset").onclick = () => {
	$("s-engine").value = DEFAULTS.engine;
	$("s-embed-search").checked = DEFAULTS.embedSearchPages;
	$("s-proxy-engine").value = DEFAULTS.proxyEngine;
	$("s-rammerhead-url").value = DEFAULTS.rammerheadServer;
	$("s-adrift-url").value = DEFAULTS.adriftServer;
	$("s-transport").value = DEFAULTS.transport;
	$("s-admin-relay-enabled").checked = false;
	$("s-admin-relay-url").value = "";
	$("s-admin-relay-code").value = "";
	$("s-admin-relay-status").textContent = "Admin relay will be cleared when Settings is saved.";
	$("s-wisp").value = DEFAULTS.wisp;
	syncWispPreset();
	clearWispPresetTest();
	fallbackWispUrlInput.value = DEFAULTS.fallbackWisp;
	syncFallbackWispPreset();
	clearFallbackWispTest();
	$("s-background").value = DEFAULTS.background;
	$("s-accent").value = DEFAULTS.accent;
	$("s-theme").value = DEFAULTS.theme;
	$("s-motion").checked = DEFAULTS.reducedMotion;
	$("s-performance").checked = DEFAULTS.performanceMode;
};
$("s-rammerhead-url").addEventListener("input", () => $("s-rammerhead-url").setCustomValidity(""));
$("s-adrift-url").addEventListener("input", () => $("s-adrift-url").setCustomValidity(""));
$("settings-form").addEventListener("submit", async (event) => {
	const requestAdminRelay = !$("s-admin-relay-panel").hidden &&
		$("s-admin-relay-enabled").checked;
	const rawAdminRelay = $("s-admin-relay-url").value.trim();
	const selectedAdminRelay = requestAdminRelay ? validateWispAddress(rawAdminRelay) : "";
	if (requestAdminRelay && !selectedAdminRelay) {
		event.preventDefault();
		$("s-admin-relay-url").setCustomValidity(
			"Enter a secure wss:// WebSocket address for this admin-only session.");
		$("s-admin-relay-url").reportValidity();
		return;
	}
	if (requestAdminRelay) {
		// A fresh server-side permission check is required on each activation.
		event.preventDefault();
		if (!adminRelayPermissionChecked || !(await canUseAdminRelay())) {
			adminRelayPermissionChecked = false;
			$("s-admin-relay-panel").hidden = true;
			$("s-admin-relay-status").textContent = "Admin permission could not be verified.";
			return;
		}
		const accessCodeInput = $("s-admin-relay-code");
		const accessCode = accessCodeInput.value;
		accessCodeInput.value = "";
		if (!accessCode) {
			$("s-admin-relay-status").textContent = "Enter the admin relay code to activate this session.";
			return;
		}
		try {
			if (typeof window.seussGetAdminRelayAccessToken !== "function")
				throw new Error("Admin identity is not available.");
			const accessToken = await window.seussGetAdminRelayAccessToken();
			if (!accessToken) throw new Error("Admin sign-in is required.");
			const response = await fetch("https://seuss-scramjet-private.onrender.com/api/admin/relay-access", {
				method: "POST", mode: "cors", cache: "no-store",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ code:accessCode, accessToken })
			});
			const check = await response.json();
			if (!response.ok || check.ok !== true) throw new Error(check.error || "Access denied.");
		} catch (error) {
			$("s-admin-relay-status").textContent =
				"Admin relay code verification failed: " + (error?.message || String(error));
			return;
		}
	}
	const rawRammerheadServer = $("s-rammerhead-url").value.trim();
	if (rawRammerheadServer && !rammerheadServerURL(rawRammerheadServer)) {
		event.preventDefault();
		$("s-rammerhead-url").setCustomValidity("Use a trusted HTTPS Rammerhead server address.");
		$("s-rammerhead-url").reportValidity();
		return;
	}
	const rawAdriftServer = $("s-adrift-url").value.trim();
	if (!adriftPortalURL(rawAdriftServer)) {
		event.preventDefault();
		$("s-adrift-url").setCustomValidity("Use a trusted HTTPS Adrift portal (not this site's URL).");
		$("s-adrift-url").reportValidity();
		return;
	}
	const selectedWisp = validateWispAddress(wispUrlInput.value);
	if (!selectedWisp) {
		event.preventDefault();
		wispUrlInput.setCustomValidity("Enter a secure wss:// address without credentials or a URL fragment.");
		wispUrlInput.reportValidity();
		return;
	}
	wispUrlInput.setCustomValidity("");
	const fallbackValue = fallbackWispUrlInput.value.trim();
	const selectedFallbackWisp = fallbackValue ? validateWispAddress(fallbackValue) : "";
	if (fallbackValue && !selectedFallbackWisp) {
		event.preventDefault();
		fallbackWispUrlInput.setCustomValidity("Enter a secure wss:// fallback address or leave blank.");
		fallbackWispUrlInput.reportValidity();
		return;
	}
	if (selectedFallbackWisp && selectedFallbackWisp === selectedWisp) {
		event.preventDefault();
		fallbackWispUrlInput.setCustomValidity("Fallback must differ from the primary Wisp address.");
		fallbackWispUrlInput.reportValidity();
		return;
	}
	fallbackWispUrlInput.setCustomValidity("");
	const proxyEngineChanged = settings.proxyEngine !== $("s-proxy-engine").value;
	const nextAdminRelay = requestAdminRelay ? selectedAdminRelay : "";
	const wispChanged = settings.wisp !== selectedWisp ||
		(settings.fallbackWisp || "") !== selectedFallbackWisp ||
		adminRelaySession !== nextAdminRelay;
	adminRelaySession = nextAdminRelay;
	const transportChanged = settings.transport !== $("s-transport").value;
	const performanceChanged = settings.performanceMode !== $("s-performance").checked;
	settings.engine = $("s-engine").value;
	settings.embedSearchPages = $("s-embed-search").checked;
	settings.proxyEngine = ["seusslite","customloader","scramjet","rammerhead","ultraviolet","adrift"].includes($("s-proxy-engine").value)
		? $("s-proxy-engine").value : "scramjet";
	settings.rammerheadServer = rawRammerheadServer;
	settings.adriftServer = rawAdriftServer;
	settings.transport = TRANSPORT_OPTIONS.includes($("s-transport").value)
		? $("s-transport").value : DEFAULTS.transport;
	settings.wisp = selectedWisp;
	settings.fallbackWisp = selectedFallbackWisp;
	settings.background = $("s-background").value.trim();
	settings.accent = $("s-accent").value || DEFAULTS.accent;
	settings.theme = $("s-theme").value;
	settings.reducedMotion = $("s-motion").checked;
	settings.performanceMode = $("s-performance").checked;
	applyAppearance();
	window.dispatchEvent(new Event("dss-performance-mode-change"));
	save();
	syncLabel();
	$("retry-wisp").hidden = !["scramjet","ultraviolet"].includes(settings.proxyEngine);
	$("retry-proxy").hidden = $("retry-wisp").hidden;
	if (settings.proxyEngine === "seusslite") {
		setStatus("ok", "Seuss Browser ready. Native browser loading doesn't need Wisp or a service worker.");
	} else if (settings.proxyEngine === "customloader") {
		setStatus("ok", "Custom Loader ready: CORS-permitted HTTPS HTML, no service worker or Wisp.");
	} else if (settings.proxyEngine === "rammerhead") {
		setStatus("", "Rammerhead uses your separately hosted server.");
	} else if (settings.proxyEngine === "adrift") {
		setStatus("", "Adrift opens a third-party WebRTC portal inside a site tab. It requires moderator access and may reject iframe embedding.");
	} else if (settings.proxyEngine === "ultraviolet") {
		setStatus("", "Ultraviolet is unavailable on this GitHub Pages deployment. A compatibility explanation will be shown instead of navigating to a broken proxy URL.");
	} else if (settings.performanceMode && !ready) {
		setStatus("", "Performance Mode is on. The proxy engine will load when you browse.");
	} else if (wispChanged || transportChanged || proxyEngineChanged || (performanceChanged && !settings.performanceMode)) {
		checkWisp();
		if (ready) {
			try { await ready; await configureTransport(true); }
			catch (err) { setStatus("bad", "Couldn't update the proxy connection: " + (err && err.message || String(err))); }
		}
	}
	// Lightweight browsing can also launch Scramjet for iframe-blocked sites.
	// If Scramjet is already initialized, update its relay even when the
	// user leaves Seuss Browser selected as the default browsing engine.
	if (settings.proxyEngine === "seusslite" && ready && (wispChanged || transportChanged)) {
		try { await ready; await configureTransport(true); }
		catch (err) { setStatus("bad", "Couldn't update the proxy connection: " + (err && err.message || String(err))); }
	}
	if (requestAdminRelay && dlg.open) dlg.close();
});


/* ---------- Scramjet + bare-mux setup ---------- */
let scramjet = null;
let connection = null;
let runtimeLoading = null;
async function loadProxyRuntime() {
	if (scramjet && connection) return;
	if (!window.$scramjetLoadController) {
		if (!runtimeLoading) runtimeLoading = new Promise((resolve, reject) => {
			const script = document.createElement("script");
			script.src = at("scram/scramjet.all.js");
			script.async = true;
			script.onload = resolve;
			script.onerror = () => {
				runtimeLoading = null;
				script.remove();
				reject(new Error("The Scramjet runtime could not be downloaded."));
			};
			document.head.appendChild(script);
		});
		await runtimeLoading;
	}
	const { ScramjetController } = window.$scramjetLoadController();
	scramjet = new ScramjetController({
		prefix: at("scramjet/"),
		files: {
			wasm: at("scram/scramjet.wasm.wasm"),
			all: at("scram/scramjet.all.js"),
			sync: at("scram/scramjet.sync.js"),
		},
	});
	connection = new BareMux.BareMuxConnection(at("baremux/worker.js"));
}

// A ready registration is not necessarily controlling this page. An encoded
// /scramjet/ URL without the controlling service worker is served by GitHub
// Pages as a nonexistent static file, yielding the exact 404 seen in games.
const PROXY_WORKER_VERSION = "controller-takeover-fix-20261108";
const PROXY_WORKER_URL = at("sw.js") + "?v=" + PROXY_WORKER_VERSION;
// A different service-worker script URL does not imply broken routing. Browsers
// can continue using a healthy previous worker while a replacement activates.
// Verify behavior on the worker that ACTUALLY controls this tab.
async function checkControllingScramjetWorker(worker) {
	return new Promise((resolve, reject) => {
		const channel = new MessageChannel();
		let settled = false;
		const finish = (error, result) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			channel.port1.close();
			if (error) reject(error); else resolve(result);
		};
		const timeout = setTimeout(
			() => finish(new Error("The controlling service worker did not respond to its routing check.")),
			4500
		);
		channel.port1.onmessage = event => finish(null, event.data || {});
		try {
			worker.postMessage({ type:"dss-scramjet-route-check" }, [channel.port2]);
		} catch (error) { finish(error); }
	});
}
async function verifyProxyWorker() {
	const expectedPrefix = at("scramjet/");
	const deadline = Date.now() + 13000;
	let lastReason = "No active service worker controls this tab.";
	while (Date.now() < deadline) {
		const controller = navigator.serviceWorker.controller;
		if (controller && controller.state === "activated") {
			try {
				const response = await checkControllingScramjetWorker(controller);
				if (response.ok === true && response.prefix === expectedPrefix &&
					response.rewriterReady === true) return true;
				lastReason = response.error ||
					("Worker routing or rewrite configuration is outdated. " +
					"Expected " + expectedPrefix + ", received " + (response.prefix || "none") + ".");
			} catch (error) {
				lastReason = error?.message || String(error);
			}
		}
		if (Date.now() >= deadline) break;
		await new Promise(resolve => {
			let finished = false;
			const finish = () => {
				if (finished) return;
				finished = true;
				clearTimeout(timeout);
				navigator.serviceWorker.removeEventListener("controllerchange", finish);
				resolve();
			};
			navigator.serviceWorker.addEventListener("controllerchange", finish);
			const timeout = setTimeout(finish, 350);
		});
	}
	const reg = await navigator.serviceWorker.getRegistration(BASE.href);
	const diagnosis = reg?.active ? "An installed worker is active but this tab is not using a compatible one." :
		"Scramjet's service worker has not activated on this browser.";
	throw new Error(diagnosis + " " + lastReason +
		" Use the Repair Scramjet button below to refresh only this site's worker.");
}
let ready = null;
function boot() {
	if (ready) return ready;
	ready = (async () => {
		if (!("serviceWorker" in navigator)) {
			throw new Error(location.protocol !== "https:"
				? "Service workers need HTTPS. Open this site over https://."
				: "Your browser doesn't support service workers.");
		}
		await loadProxyRuntime();
		await scramjet.init();
		await navigator.serviceWorker.register(PROXY_WORKER_URL, {
			scope: BASE.pathname,
			updateViaCache: "none"
		});
		await navigator.serviceWorker.ready;
		await verifyProxyWorker();
		await configureTransport();
		// A controller can be replaced during a deployment while a tab stays open.
		// Reconfirm control immediately before creating each proxied frame.
	})();
	ready.catch(() => { ready = null; });
	return ready;
}
// getTransport() reports only the module path, not the Wisp URL currently in use.
// Keep the BareMux worker synchronized with the locally saved address on every
// page startup, even when the transport module is unchanged.
let appliedTransportSettings = null;
let activeWisp = null;
let selectedWispPair = "";
// Optional failover selects an alternative relay only on an actual failed
// Wisp handshake. No automatic relay probing when fallback is disabled.
async function chooseWispRelay(force = false) {
	if (adminRelaySession) {
		const candidate = validateWispAddress(adminRelaySession);
		const permitted = await canUseAdminRelay();
		if (permitted && candidate) {
			const signature = JSON.stringify(["admin-session", candidate]);
			if (!force && selectedWispPair === signature && activeWisp === candidate)
				return candidate;
			const outcome = await probeWispHandshake(candidate, 6500);
			if (!outcome.ok) {
				throw new Error("Admin Wisp relay did not respond: " + outcome.reason +
					" No public relay fallback was attempted.");
			}
			selectedWispPair = signature;
			activeWisp = candidate;
			setStatus("", "Using this session's admin Wisp relay in Scramjet. " +
				"The relay and your network can still see connection metadata.");
			return candidate;
		}
		// No permission or an invalid address: disable, never silently use
		// a stale/unauthorized admin relay value.
		adminRelaySession = "";
	}
	const primary = validateWispAddress(settings.wisp);
	const fallback = settings.fallbackWisp ?
		validateWispAddress(settings.fallbackWisp) : "";
	if (!primary || (settings.fallbackWisp && !fallback)) {
		throw new Error("Saved Wisp addresses are invalid. Check Settings.");
	}
	const pair = JSON.stringify([primary, fallback]);
	if (!fallback) {
		activeWisp = primary;
		selectedWispPair = pair;
		return primary;
	}
	if (!force && activeWisp && selectedWispPair === pair) return activeWisp;
	const primaryResult = await probeWispHandshake(primary, 6500);
	if (primaryResult.ok) {
		activeWisp = primary;
		selectedWispPair = pair;
		return primary;
	}
	const fallbackResult = await probeWispHandshake(fallback, 6500);
	if (!fallbackResult.ok) {
		throw new Error("Both Wisp handshakes failed. Primary: " +
			primaryResult.reason + " Fallback: " + fallbackResult.reason +
			" Check relay availability and network permissions.");
	}
	activeWisp = fallback;
	selectedWispPair = pair;
	setStatus("", "Primary Wisp handshake failed; using the saved fallback relay. " +
		"Website loading is not guaranteed.");
	return fallback;
}
// Serialize transport changes: a network retry and Settings save must not
// race and replace each other's working Wisp connection.
let transportChangeQueue = Promise.resolve();
function applyTransport(force = false, requestedTransport = preferredTransport(), relayOverride = "") {
	const transport = Object.hasOwn(TRANSPORTS, requestedTransport)
		? requestedTransport : "libcurl";
	const path = TRANSPORTS[transport];
	const relay = relayOverride || activeWisp || settings.wisp;
	const opts = transport === "epoxy" ? { wisp: relay } : { websocket: relay };
	const signature = JSON.stringify([path, opts]);
	const task = transportChangeQueue.catch(() => {}).then(async () => {
		if (!connection) throw new Error("The proxy transport has not initialized.");
		if (force || signature !== appliedTransportSettings) {
			await connection.setTransport(path, [opts]);
			appliedTransportSettings = signature;
		}
	});
	transportChangeQueue = task.catch(() => {});
	return task;
}
// Fallback only upon a transport initialization failure. Never switch the
// saved Wisp endpoint or site access policy, and never promise a working
// destination merely because an initialization call completed.
async function configureTransport(force = false) {
	await chooseWispRelay(force);
	const preference = transportPreference();
	const first = preferredTransport();
	try {
		await applyTransport(force, first);
		return first;
	} catch (primary) {
		if (preference === "epoxy") throw primary;
		const backup = first === "libcurl" ? "epoxy" : "libcurl";
		try {
			await applyTransport(true, backup);
		} catch (secondary) {
			throw new Error(TRANSPORT_LABELS[first] + " and " +
				TRANSPORT_LABELS[backup] + " could not initialize: " +
				String(secondary?.message || secondary).slice(0,160));
		}
		setStatus("", TRANSPORT_LABELS[first] + " failed to initialize; using " +
			TRANSPORT_LABELS[backup] + " with the selected Wisp relay.");
		return backup;
	}
}

// A site access/permission change must not retain the admin relay override.
window.addEventListener("seuss-site-access-change", () => {
	++adminRelayVisibilitySequence;
	adminRelayPermissionChecked = false;
	const hadOverride = !!adminRelaySession;
	adminRelaySession = "";
	$("s-admin-relay-panel").hidden = true;
	if (hadOverride && ready && requireSeussAccount()) {
		void configureTransport(true).catch(err =>
			setStatus("bad", "Couldn't restore normal Wisp settings: " +
				(err?.message || String(err))));
	}
});

/* ---------- URL / search parsing ---------- */
function toUrl(input) {
	const q = String(input || "").trim();
	if (!q) return null;
	try {
		const u = new URL(q);
		if (u.protocol === "http:" || u.protocol === "https:") return u.href;
	} catch {}
	if (/^[^\s]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(q) || /^localhost(:\d+)?/.test(q)) {
		try { return new URL("https://" + q).href; } catch {}
	}
	return settings.engine.replace("%s", encodeURIComponent(q));
}
// Plain words are searches, NOT destinations to display in an iframe.
// Browsers will reject embedded full search engines and YouTube pages.
function isSeussSearchQuery(input) {
	const q = String(input || "").trim();
	if (!q) return false;
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(q)) return false;
	if (/^(?:localhost|[^\s/.]+(?:\.[^\s/.]+)+)(?::\d+)?(?:[/?#]|$)/i.test(q)) return false;
	return true;
}
function prefersSupportedExternalPage(url) {
	const host = url.hostname.toLowerCase().replace(/^www\./, "");
	return ["youtube.com", "m.youtube.com", "music.youtube.com",
		"google.com", "bing.com", "duckduckgo.com", "search.brave.com"].includes(host);
}

/* ---------- Multi-tab browser view ---------- */
const loader = $("loader");
const proxyLoadStats = $("proxy-load-stats");
let proxyRequestSnapshot = { pending:0, handled:0, failed:0 };
function updateProxyLoadStats() {
	const tab = currentSiteTab();
	const loading = !!(tab && tab.type === "web" && tab.loading);
	proxyLoadStats.hidden = !loading;
	if (!loading) return;
	const elapsed = Math.max(0, Math.floor((Date.now() - (tab.loadStartedAt || Date.now())) / 1000));
	const received = Math.max(0, proxyRequestSnapshot.handled - (tab.loadStartHandled || 0));
	$("proxy-load-phase").textContent = elapsed > 20 ? "Still loading page…" : "Loading page…";
	$("proxy-load-inflight").textContent = "Requests awaiting response: " + proxyRequestSnapshot.pending;
	$("proxy-load-finished").textContent = "Responses handled: " + received;
	$("proxy-load-elapsed").textContent = "Elapsed: " + elapsed + "s";
}
// These counts cover the site's active Scramjet requests; resource totals and
// exact network packet counts are not knowable in advance.
if ("serviceWorker" in navigator) {
	navigator.serviceWorker.addEventListener("message", event => {
		const p = event.data;
		if (!p || p.type !== "dss-proxy-request-progress") return;
		if (![p.pending, p.handled, p.failed].every(Number.isFinite)) return;
		proxyRequestSnapshot = { pending:p.pending, handled:p.handled, failed:p.failed };
		updateProxyLoadStats();
	});
}
setInterval(updateProxyLoadStats, 1000);
const siteTabs = [];
let activeSiteTabId = null;
let previousSiteTabId = null;
let siteTabNumber = 0;

function siteTabTitle(url) {
	try {
		const host = new URL(url).hostname.replace(/^www\./i, "");
		return host || "New Tab";
	} catch { return "New Tab"; }
}
function currentSiteTab() {
	return siteTabs.find(tab => tab.id === activeSiteTabId) || null;
}
function stopBlockedProxyTab(tab) {
	if (!tab || (tab.type !== "web" && !tab.liteEngine && !tab.customEngine)) return;
	if (tab.customAbort) tab.customAbort.abort();
	if (tab.pane) tab.pane.remove();
	tab.frame = null;
	tab.directFrame = null;
	tab.pane = null;
	tab.liteEngine = false;
	tab.customEngine = false;
	tab.loading = false;
	tab.type = "home";
	tab.url = "";
	tab.title = "Blocked page";
	if (activeSiteTabId === tab.id) activateSiteTab(tab.id);
	else renderSiteTabs();
}
// Recheck the active site periodically so newly added admin rules apply
// without a refresh or another click inside the frame.
window.dssRecheckActiveSite = async () => {
	const tab = currentSiteTab();
	if (!tab || (tab.type !== "web" && !tab.liteEngine && !tab.customEngine) || !tab.url ||
		typeof window.dssSitePolicyCheck !== "function") return;
	const url = tab.url;
	const allowed = await window.dssSitePolicyCheck(url);
	if (!allowed && tab.url === url) stopBlockedProxyTab(tab);
};
// Report only the active site's domain/section, never a full URL or search query.
function publicActiveSiteView(tab = currentSiteTab()) {
	if (!tab || tab.type === "home") return "Home";
	if (tab.type === "talk") return "Seuss Talk";
	if (tab.type === "ai") return "Veloci AI";
	if (tab.type === "admin") return "Admin Dashboard";
	if (tab.type === "vm") return "VM";
	if (tab.rammerhead) return "Rammerhead";
	if (tab.searchPage) return tab.duckDuckGoSearch ? "DuckDuckGo search" :
		(tab.sourceNotice ? "External website notice" : "Seuss Search results");
	if (tab.customEngine) {
		try { return new URL(tab.url).hostname.toLowerCase().slice(0, 120); }
		catch { return "Other site page"; }
	}
	if (tab.liteEngine) {
		try { return new URL(tab.url).hostname.toLowerCase().slice(0, 120); }
		catch { return "Other site page"; }
	}
	if (tab.adrift) return "Other site page";
	if (tab.ultraviolet) {
		try { return new URL(tab.url).hostname.toLowerCase().slice(0, 120); }
		catch { return "Other site page"; }
	}
	if (tab.type === "direct") {
		return tab.url && /\/offline-pack\.html(?:[?#]|$)/i.test(tab.url) ?
			"Offline Games Pack" : "Other site page";
	}
	if (tab.type === "web") {
		try {
			const host = new URL(tab.url).hostname.toLowerCase();
			return host.slice(0, 120) || "Other site page";
		} catch { return "Other site page"; }
	}
	return "Other site page";
}
function announceActiveSiteView() {
	window.dispatchEvent(new CustomEvent("dss-active-view-change", {
		detail: { site: publicActiveSiteView() }
	}));
}
window.getSeussCurrentView = publicActiveSiteView;
function renderSiteTabs() {
	const list = $("site-tab-list");
	list.replaceChildren();
	for (const tab of siteTabs) {
		const item = document.createElement("div");
		item.className = "site-tab-item" + (tab.id === activeSiteTabId ? " active" : "");
		const select = document.createElement("button");
		select.type = "button";
		select.className = "site-tab-select";
		select.textContent = (tab.type === "talk" ? "💬 " : tab.type === "vm" ? "🖥 " : tab.type === "ai" ? "✦ " : "") + tab.title;
		select.title = tab.title;
		select.setAttribute("aria-current", tab.id === activeSiteTabId ? "page" : "false");
		select.addEventListener("click", () => activateSiteTab(tab.id));
		const close = document.createElement("button");
		close.type = "button";
		close.className = "site-tab-close";
		close.textContent = "×";
		close.title = "Close " + tab.title;
		close.setAttribute("aria-label", "Close " + tab.title);
		close.addEventListener("click", (event) => {
			event.stopPropagation();
			closeSiteTab(tab.id);
		});
		item.append(select, close);
		list.append(item);
	}
}
function createSiteTab(type = "home", title = "New Tab") {
	const tab = {
		id: "dss-tab-" + (++siteTabNumber),
		type,
		title,
		url: "",
		frame: null,
		pane: null,
		loading: false
	};
	siteTabs.push(tab);
	renderSiteTabs();
	activateSiteTab(tab.id);
	return tab;
}
function activateSiteTab(id) {
	const tab = siteTabs.find(item => item.id === id);
	if (!tab) return;
	if (activeSiteTabId && activeSiteTabId !== id) previousSiteTabId = activeSiteTabId;
	activeSiteTabId = id;

	$("site-tabbar").hidden = false;
	$("home").hidden = tab.type !== "home";
	$("browser").hidden = tab.type !== "web" && tab.type !== "direct";
	$("seuss-talk").hidden = tab.type !== "talk";
	$("ai-workspace").hidden = tab.type !== "ai";
	$("vm").hidden = tab.type !== "vm";
	$("admin-workspace").hidden = tab.type !== "admin";

	for (const item of siteTabs) {
		if (item.pane) item.pane.hidden = item.id !== id;
	}
	loader.classList.toggle("on", !!tab.loading && (tab.type === "web" || tab.liteEngine || tab.customEngine));
	updateProxyLoadStats();
	const uvBanner = $("uv-fallback-banner");
	uvBanner.hidden = !tab.uvFallback || !!tab.uvFallbackDismissed;
	const liteHelper = $("lite-helper");
	liteHelper.hidden = !tab.liteEngine || !!tab.liteTipDismissed || !!tab.searchPage;
	const wasmProxyHelper = $("wasm-proxy-helper");
	wasmProxyHelper.hidden = tab.type !== "web" || !tab.wasmRipGameUrl;
	if (!wasmProxyHelper.hidden) {
		const original = $("wasm-proxy-original");
		original.href = tab.wasmRipGameUrl;
	}
	$("lite-back-to-results").hidden = !tab.liteEngine || !tab.liteSearchQuery;
	if (tab.liteEngine) {
		$("lite-source-link").href = tab.url;
		$("lite-source-link").textContent = tab.gameEmbed ?
			"Play on original game website" : "Open original site";
		$("lite-helper-description").textContent = tab.gameEmbed ?
			"Game compatibility mode is enabled. If the game is blank or blocked, open its original website for the full WebGL, WebAssembly and save-data features." :
			"Seuss Browser loads directly without Wisp. If the page is blank or blocked, its host may forbid embedding; this mode cannot override network restrictions.";
	}
	if (tab.type === "web" || tab.type === "direct") $("bar-address").value =
		tab.searchPage ? (tab.searchQuery || tab.url || "") :
		tab.rammerhead || tab.adrift ? (tab.targetUrl || "") : (tab.url || "");
	const rhHelper = $("rammerhead-helper");
	const isPortal = !!(tab.rammerhead || tab.adrift);
	rhHelper.hidden = !isPortal;
	if (isPortal) {
		const name = tab.adrift ? "Adrift" : "Rammerhead";
		$("proxy-portal-title").textContent = name + " portal";
		$("proxy-portal-description").textContent = tab.adrift
			? "Adrift runs as a third-party WebRTC portal. Copy this destination into its search box. It cannot share Seuss Search's internal blocked-site reporting."
			: "Copy the destination, create or select a private Rammerhead session, and paste it into its address field.";
		$("rammerhead-target").value = tab.targetUrl || "";
		$("rammerhead-open").href = tab.adrift ? tab.adriftHost : tab.rammerheadHost;
		$("rammerhead-open").textContent = "Open " + name + " directly";
	}
	if (tab.type === "home") {
		document.title = "New Tab · Dr. Seuss Search";
	} else if (tab.type === "web" || tab.type === "direct") {
		document.title = (tab.title || "Browser") + " · Dr. Seuss Search";
	} else if (tab.type === "talk") {
		document.title = "Seuss Talk · Dr. Seuss Search";
		window.dispatchEvent(new Event("seuss-talk-tab-open"));
	} else if (tab.type === "ai") {
		document.title = "Veloci AI · Dr. Seuss Search";
	} else if (tab.type === "vm") {
		document.title = "VM · Dr. Seuss Search";
	} else if (tab.type === "admin") {
		document.title = "Admin Dashboard · Dr. Seuss Search";
	}
	renderSiteTabs();
	window.dispatchEvent(new CustomEvent("dss-site-tab-activated", { detail: { type: tab.type, id: tab.id } }));
	announceActiveSiteView();
}
function closeSiteTab(id) {
	const index = siteTabs.findIndex(tab => tab.id === id);
	if (index < 0) return;
	const tab = siteTabs[index];
	if (tab.type === "talk") window.dispatchEvent(new Event("seuss-talk-tab-close"));
	if (tab.type === "ai") $("ai-frame").removeAttribute("src");
	if (tab.searchAbort) tab.searchAbort.abort();
	if (tab.customAbort) tab.customAbort.abort();
	if (tab.pane) tab.pane.remove();
	const wasActive = activeSiteTabId === id;
	siteTabs.splice(index, 1);
	if (!siteTabs.length) {
		createSiteTab("home", "New Tab");
		return;
	}
	if (wasActive) {
		const replacement = siteTabs[Math.min(index, siteTabs.length - 1)];
		activateSiteTab(replacement.id);
	} else {
		renderSiteTabs();
	}
}
function openSeussTalkTab() {
	if (!requireSeussAccount()) return;
	let tab = siteTabs.find(item => item.type === "talk");
	if (!tab) tab = createSiteTab("talk", "Seuss Talk");
	else activateSiteTab(tab.id);
}
function switchAwayFromSeussTalk() {
	const other = [...siteTabs].reverse().find(item => item.type !== "talk");
	if (other) activateSiteTab(other.id);
	else createSiteTab("home", "New Tab");
}
// This is an independent third-party app; it never runs through Scramjet.
// Only start its iframe after the person explicitly opens the AI tab.
const VELOCI_AI_URL = "https://veloci-search-flow.base44.app/";
function openAITab() {
	if (!requireSeussAccount()) return;
	let tab = siteTabs.find(item => item.type === "ai");
	if (!tab) tab = createSiteTab("ai", "Veloci AI");
	else activateSiteTab(tab.id);
	const frame = $("ai-frame");
	if (!frame.getAttribute("src")) frame.src = VELOCI_AI_URL;
}
$("open-ai").addEventListener("click", openAITab);
$("ai-reload").addEventListener("click", () => {
	if (currentSiteTab()?.type === "ai") $("ai-frame").src = VELOCI_AI_URL;
});
$("ai-home").addEventListener("click", () => {
	const tab = siteTabs.find(item => item.type === "home");
	if (tab) activateSiteTab(tab.id);
	else createSiteTab("home", "New Tab");
});
window.openAITab = openAITab;
function openVMTab() {
	if (!requireSeussAccount()) return;
	let tab = siteTabs.find(item => item.type === "vm");
	if (!tab) tab = createSiteTab("vm", "VM");
	else activateSiteTab(tab.id);
}
function openAdminTab() {
	if (!requireSeussAccount()) return;
	let tab = siteTabs.find(item => item.type === "admin");
	if (!tab) tab = createSiteTab("admin", "Admin Dashboard");
	else activateSiteTab(tab.id);
	window.dispatchEvent(new Event("seuss-admin-dashboard-open"));
}
window.openAdminTab = openAdminTab;
$("open-admin").addEventListener("click", openAdminTab);
window.openSeussTalkTab = openSeussTalkTab;
window.switchAwayFromSeussTalk = switchAwayFromSeussTalk;
window.openVMTab = openVMTab;
window.closeActiveSiteTab = () => {
	const tab = currentSiteTab();
	if (tab) closeSiteTab(tab.id);
};
createSiteTab("home", "New Tab");
$("site-new-tab").addEventListener("click", () => createSiteTab("home", "New Tab"));
$("site-talk-tab").addEventListener("click", openSeussTalkTab);

function showError(title, detail) {
	$("error").hidden = false;
	$("error-title").textContent = title;
	$("error-detail").textContent = detail || "";
	$("repair-scramjet").hidden = !title.startsWith("Scramjet routing");
}
$("repair-scramjet").addEventListener("click", async () => {
	const button = $("repair-scramjet");
	button.disabled = true;
	button.textContent = "Repairing worker…";
	try {
		// Only this site's scope, not unrelated browser registrations or caches.
		const reg = await navigator.serviceWorker.getRegistration(BASE.href);
		if (reg) await reg.unregister();
		location.reload();
	} catch (error) {
		button.disabled = false;
		button.textContent = "Repair Scramjet";
		showError("Scramjet routing is not ready.",
			"Worker repair failed: " + (error?.message || String(error)) +
			". Try reloading this site manually.");
	}
});
function createFrameForTab(tab) {
	if (tab.frame) return tab.frame;
	const pane = document.createElement("div");
	pane.className = "site-frame-pane";
	pane.hidden = true;
	const instance = scramjet.createFrame();
	instance.frame.id = "sj-frame-" + tab.id;
	instance.frame.title = tab.wasmRipGameUrl ?
		"WASM.RIP game loaded through Scramjet" : "Proxied page";
	if (tab.wasmRipGameUrl) {
		// Fullscreen, gamepad and user-initiated audio are normal game
		// capabilities. Do not change Scramjet's sandbox or proxy routing.
		instance.frame.setAttribute("allow", "fullscreen; autoplay; gamepad");
		instance.frame.setAttribute("allowfullscreen", "");
	}
	pane.appendChild(instance.frame);
	$("frame-host").appendChild(pane);
	tab.frame = instance;
	tab.pane = pane;
	instance.addEventListener("urlchange", (event) => {
		if (tab.url !== event.url && !tab.loading) {
			tab.loading = true;
			tab.loadStartedAt = Date.now();
			tab.loadStartHandled = proxyRequestSnapshot.handled;
		}
		tab.url = event.url;
		tab.title = siteTabTitle(event.url);
		if (activeSiteTabId === tab.id) {
			$("bar-address").value = event.url;
			loader.classList.toggle("on", !!tab.loading);
			updateProxyLoadStats();
		}
		renderSiteTabs();
		if (activeSiteTabId === tab.id) announceActiveSiteView();
		// Also check internal navigations, e.g. links clicked inside a game
		// or a redirect from a search result. Stop the proxied frame on match.
		if (typeof window.dssSitePolicyCheck === "function") {
			window.dssSitePolicyCheck(event.url).then(allowed => {
				if (allowed || tab.frame !== instance) return;
				stopBlockedProxyTab(tab);
			}).catch(err => console.warn("Site rule check failed:", err));
		}
	});
	instance.frame.addEventListener("load", () => {
		tab.loading = false;
		if (activeSiteTabId === tab.id) {
			loader.classList.remove("on");
			updateProxyLoadStats();
			document.title = tab.title + " · Dr. Seuss Search";
		}
		renderSiteTabs();
	});
	return instance;
}
function createDirectFrameForTab(tab) {
	if (tab.directFrame) return tab.directFrame;
	const pane = document.createElement("div");
	pane.className = "site-frame-pane";
	pane.hidden = true;
	const iframe = document.createElement("iframe");
	iframe.id = "direct-frame-" + tab.id;
	iframe.title = tab.title || "In-site game";
	iframe.setAttribute("allow", "autoplay; fullscreen; gamepad");
	iframe.setAttribute("allowfullscreen", "");
	iframe.referrerPolicy = "strict-origin-when-cross-origin";
	pane.appendChild(iframe);
	$("frame-host").appendChild(pane);
	tab.directFrame = iframe;
	tab.pane = pane;
	iframe.addEventListener("load", () => {
		tab.loading = false;
		if (activeSiteTabId === tab.id) {
			loader.classList.remove("on");
			document.title = tab.title + " · Dr. Seuss Search";
		}
		renderSiteTabs();
	});
	iframe.addEventListener("error", () => {
		if (!tab.liteEngine || activeSiteTabId !== tab.id) return;
		tab.loading = false;
		loader.classList.remove("on");
		$("lite-helper").hidden = false;
		$("lite-helper-description").textContent =
			"The page could not load inside Seuss Browser. The host or your network may be blocking it.";
	});
	return iframe;
}
function openDirectSiteTab(inputUrl, title) {
	if (!requireSeussAccount()) return;
	let url;
	try {
		url = new URL(inputUrl, location.href);
		if (url.origin !== location.origin) throw new Error("Direct tabs are only for pages hosted on this site.");
	} catch (error) {
		showError("That in-site page could not be opened.", String(error && error.message || error));
		return;
	}
	const tab = createSiteTab("direct", title || siteTabTitle(url.href));
	tab.url = url.href;
	tab.title = title || siteTabTitle(url.href);
	tab.loading = true;
	const iframe = createDirectFrameForTab(tab);
	iframe.src = url.href;
	activateSiteTab(tab.id);
}
window.openDirectSiteTab = openDirectSiteTab;

/* ---------- Native Seuss Search results (not an embedded search site) ----------
   This is an in-site, lightweight view. Wikipedia's public Action API allows
   anonymous cross-origin queries with origin=*. It does NOT claim to offer
   unrestricted full-web indexing. Other search engines open in a regular
   browser tab with the user's own browser/network policies in place.
*/
function seussSearchButton(text, callback) {
	const button = document.createElement("button");
	button.type = "button";
	button.className = "seuss-result-action";
	button.textContent = text;
	button.addEventListener("click", callback);
	return button;
}
function seussSearchExternalLink(label, href) {
	const link = document.createElement("a");
	link.className = "seuss-result-action seuss-search-external";
	link.href = href;
	link.target = "_blank";
	link.rel = "noopener noreferrer";
	link.referrerPolicy = "no-referrer";
	link.textContent = label;
	return link;
}
function seussSearchNode(tag, className, value) {
	const el = document.createElement(tag);
	if (className) el.className = className;
	if (value != null) el.textContent = String(value);
	return el;
}
function createSeussSearchPane(options = {}) {
	let tab = !options.newTab && (currentSiteTab()?.searchPage || currentSiteTab()?.liteEngine)
		? currentSiteTab() : null;
	if (!tab) tab = createSiteTab("direct", "Seuss Search");
	if (tab.searchAbort) tab.searchAbort.abort();
	if (tab.pane) tab.pane.remove();
	const pane = document.createElement("div");
	pane.className = "site-frame-pane seuss-native-search-pane";
	pane.hidden = true;
	const main = seussSearchNode("main", "seuss-search-content");
	pane.append(main);
	$("frame-host").append(pane);
	tab.type = "direct";
	tab.title = options.title || "Seuss Search";
	tab.url = "";
	tab.pane = pane;
	tab.frame = null;
	tab.directFrame = null;
	tab.searchPage = true;
	tab.sourceNotice = false;
	tab.duckDuckGoSearch = false;
	tab.liteEngine = false;
	tab.loading = false;
	activateSiteTab(tab.id);
	return { tab, main };
}
function searchWebLink(query) {
	return settings.engine.replace("%s", encodeURIComponent(query));
}
function youtubeSearchLink(query) {
	return "https://www.youtube.com/results?search_query=" + encodeURIComponent(query);
}
// DuckDuckGo is a normal website, not a CORS-enabled Custom Loader HTML
// source. DuckDuckGo's frame restrictions cannot be fixed by a sandbox
// attribute; never create a broken DuckDuckGo iframe. Offer the real search
// results link and leave all site policies intact.
async function showDuckDuckGoSearch(query, options = {}) {
  if (!requireSeussAccount()) return;
  const q = String(query || "").trim().slice(0, 180);
  if (!q) return;
  const searchUrl = "https://duckduckgo.com/?q=" + encodeURIComponent(q);
  try {
    if (typeof window.dssSitePolicyCheck !== "function" ||
        !(await window.dssSitePolicyCheck(searchUrl))) return;
  } catch {
    showError("Couldn't verify DuckDuckGo access.",
      "Site rules must be available before opening a search destination.");
    return;
  }
  if (!requireSeussAccount()) return;
  const {tab,main} = createSeussSearchPane({
    ...options, title:"DuckDuckGo: " + q.slice(0,40)
  });
  tab.duckDuckGoSearch = true;
  tab.searchQuery = q;
  const heading = seussSearchNode("h1", "", "DuckDuckGo Search");
  const note = seussSearchNode("p", "seuss-search-note",
    "DuckDuckGo prevents other sites from displaying its search results inside " +
    "an iframe. Custom Loader can still send your search to DuckDuckGo; open " +
    "the results link below to view the real page without a connection error.");
  const form = document.createElement("form");
  form.className = "seuss-search-form";
  const input = document.createElement("input");
  input.type = "search"; input.value = q; input.maxLength = 180;
  input.setAttribute("aria-label", "Search DuckDuckGo");
  const submit = document.createElement("button");
  submit.type = "submit"; submit.textContent = "Search DuckDuckGo";
  form.append(input,submit);
  form.addEventListener("submit", event => {
    event.preventDefault(); void showDuckDuckGoSearch(input.value);
  });
  const actions = seussSearchNode("div", "seuss-search-actions");
  actions.append(
    seussSearchExternalLink("Search DuckDuckGo for: " + q, searchUrl)
  );
  const explanation = seussSearchNode("p", "seuss-search-note",
    "Opening search results in DuckDuckGo's own page is the reliable option. " +
    "This CORS-only loader cannot fetch full search results from sites that " +
    "don't grant cross-origin access. Entering a regular website URL still " +
    "uses the existing Custom Loader viewer.");
  main.append(heading,note,form,actions,explanation);
}
function showSeussSearch(query, options = {}) {
	if (!requireSeussAccount()) return;
	const q = String(query || "").trim().slice(0, 180);
	if (!q) return;
	const {tab,main} = createSeussSearchPane({ ...options, title:"Search: " + q.slice(0,40) });
	tab.searchQuery = q;
	activateSiteTab(tab.id);
	const heading = seussSearchNode("h1", "", "Seuss Search");
	const explainer = seussSearchNode("p", "seuss-search-note",
		"Read article results here or optionally try the selected search website inside an in-site tab. Sites that forbid embedding will still be blocked by Firefox.");
	const form = document.createElement("form");
	form.className = "seuss-search-form";
	const input = document.createElement("input");
	input.type = "search";
	input.value = q;
	input.maxLength = 180;
	input.placeholder = "Search for something";
	input.setAttribute("aria-label", "Search again");
	const button = document.createElement("button");
	button.type = "submit";
	button.textContent = "Search";
	form.append(input,button);
	form.addEventListener("submit", event => {
		event.preventDefault();
		showSeussSearch(input.value);
	});
	const actions = seussSearchNode("div", "seuss-search-actions");
	actions.append(
		seussSearchButton("Try embedding " + (ENGINE_NAMES[settings.engine] || "search") + " here", () => {
			go(searchWebLink(q), {
				forceLite:true, allowEmbeddedRestricted:true, newTab:true, embeddedQuery:q
			});
		}),
		seussSearchExternalLink("Search the full web (new tab)", searchWebLink(q)),
		seussSearchExternalLink("Search YouTube (new tab)", youtubeSearchLink(q))
	);
	const heading2 = seussSearchNode("h2", "", "Wikipedia article results");
	const status = seussSearchNode("p", "seuss-search-status", "Searching Wikipedia…");
	status.setAttribute("role", "status");
	const results = seussSearchNode("div", "seuss-search-results");
	main.append(heading,explainer,form,actions,heading2,status,results);
	tab.searchAbort = new AbortController();
	const controller = tab.searchAbort;
	// Admin-curated links are normal website navigations: no Render fetch,
	// proxy tunnel or bypass of the site's domain moderation.
	const approvedHeader = seussSearchNode("h2", "", "Admin-approved search websites");
	const approvedStatus = seussSearchNode("p", "seuss-search-note", "Loading approved search links…");
	const approvedLinks = seussSearchNode("div", "seuss-search-actions");
	main.append(approvedHeader, approvedStatus, approvedLinks);
	(async () => {
		try {
			const choices = typeof window.seussGetApprovedSearchSources === "function"
				? await window.seussGetApprovedSearchSources() : [];
			if (controller.signal.aborted || !siteTabs.includes(tab) ||
				!tab.pane?.contains(main)) return;
			const sources = {
				wikipedia: ["Wikipedia", "https://en.wikipedia.org/w/index.php?search="],
				bing: ["Bing", "https://www.bing.com/search?q="]
			};
			let count = 0;
			for (const item of choices) {
				if (!item || item.approved !== true ||
					!Object.hasOwn(sources, item.source)) continue;
				const [label, baseUrl] = sources[item.source];
				const address = baseUrl + encodeURIComponent(q);
				approvedLinks.append(seussSearchButton("Search with " + label, async () => {
					// Fail closed when the domain rules cannot be checked.
					if (!requireSeussAccount() ||
						typeof window.dssSitePolicyCheck !== "function") return;
					if (await window.dssSitePolicyCheck(address))
						await go(address, { forceLite:true, newTab:true });
				}));
				count++;
			}
			approvedStatus.textContent = count
				? "Only the links approved by site admins appear here. Your browser and network rules still apply."
				: "No search websites are currently approved by admins.";
		} catch {
			approvedStatus.textContent = "Approved search links are temporarily unavailable.";
		}
	})();
	const clock = setTimeout(() => controller.abort(), 12000);
	const apiUrl = new URL("https://en.wikipedia.org/w/api.php");
	for (const [key,value] of Object.entries({
		action:"query", list:"search", srsearch:q, srlimit:"8", format:"json", origin:"*"
	})) apiUrl.searchParams.set(key,value);
	(async () => {
		try {
			if (typeof window.dssSitePolicyCheck === "function" &&
				!(await window.dssSitePolicyCheck("https://en.wikipedia.org/"))) {
				status.textContent = "Wikipedia results aren't available under this site's rules.";
				return;
			}
			const response = await fetch(apiUrl.href, {
				method:"GET", credentials:"omit", mode:"cors",
				referrerPolicy:"no-referrer", signal:controller.signal
			});
			if (!response.ok) throw new Error("Search server returned HTTP " + response.status);
			const json = await response.json();
			if (controller.signal.aborted || tab.searchAbort !== controller) return;
			const hits = Array.isArray(json?.query?.search) ? json.query.search : [];
			status.textContent = hits.length ?
				hits.length + " Wikipedia results" : "No matching Wikipedia articles found.";
			for (const hit of hits) {
				if (typeof hit.title !== "string") continue;
				const article = seussSearchNode("article", "seuss-search-result");
				const linkUrl = "https://en.wikipedia.org/wiki/" +
					encodeURIComponent(hit.title.replaceAll(" ", "_"));
				article.append(seussSearchExternalLink(hit.title, linkUrl));
				if (typeof hit.snippet === "string") {
					// Wikipedia snippets contain highlighting HTML. Display as
					// plain text only; never inject third-party HTML.
					const preview = hit.snippet.replace(/<[^>]*>/g, "").slice(0,350);
					article.append(seussSearchNode("p", "", preview));
				}
				results.append(article);
			}
		} catch (error) {
			if (tab.searchAbort !== controller) return;
			status.textContent = "Wikipedia results couldn't be loaded on this connection. You can still use the external search links above.";
		} finally {
			clearTimeout(clock);
			if (tab.searchAbort === controller) tab.searchAbort = null;
		}
	})();
}
function showEmbeddingNotice(target, options = {}) {
	const {tab,main} = createSeussSearchPane({ ...options, title:target.hostname });
	tab.sourceNotice = true;
	tab.url = target.href;
	tab.searchQuery = "";
	activateSiteTab(tab.id);
	const host = target.hostname.toLowerCase().replace(/^www\./, "");
	const isYoutube = ["youtube.com","m.youtube.com","music.youtube.com"].includes(host);
	const title = isYoutube ? "YouTube can't show its full site here" : "This search site can't be embedded";
	main.append(
		seussSearchNode("h1", "", title),
		seussSearchNode("p", "seuss-search-note", "Firefox is respecting the website's embedding security policy. Seuss Search cannot override it. You can try a normal iframe or open the website in a separate browser tab."),
		seussSearchButton("Try embedding anyway (may be blocked)", () => {
			go(target.href, { forceLite:true, allowEmbeddedRestricted:true, newTab:true });
		}),
		seussSearchExternalLink("Open original website (new tab)", target.href)
	);
	const form = document.createElement("form");
	form.className = "seuss-search-form";
	const input = document.createElement("input");
	input.type = "search";
	input.placeholder = "Search inside Seuss Search";
	input.setAttribute("aria-label", "Search in Seuss Search");
	const submit = document.createElement("button");
	submit.type = "submit";submit.textContent = "Search";
	form.append(input,submit);
	form.addEventListener("submit", event => {
		event.preventDefault();
		showSeussSearch(input.value);
	});
	main.append(form);
	if (isYoutube) {
		main.append(seussSearchExternalLink("Go to YouTube search (new tab)",
			youtubeSearchLink(target.searchParams.get("search_query") || "")));
		const videoID = target.pathname === "/watch" ? target.searchParams.get("v") :
			target.pathname.startsWith("/shorts/") ? target.pathname.split("/")[2] : null;
		if (videoID && /^[a-zA-Z0-9_-]{11}$/.test(videoID)) {
			const player = seussSearchNode("div", "seuss-video-player");
			const play = seussSearchButton("Try YouTube's official embedded video player", () => {
				const iframe = document.createElement("iframe");
				iframe.src = "https://www.youtube-nocookie.com/embed/" + videoID;
				iframe.title = "Official YouTube embedded video";
				iframe.loading = "lazy";
				iframe.allow = "fullscreen; encrypted-media; picture-in-picture";
				iframe.referrerPolicy = "strict-origin-when-cross-origin";
				iframe.allowFullscreen = true;
				player.replaceChildren(iframe);
			});
			main.append(play,player);
		}
	}
}
const FIRST_PARTY_GAME_FILES = new Set([
	"nes-homebrew.html","console-emulators.html",
	"dos-arcade.html","offline-pack.html","duckmath-games.html"
]);
// Game pages often use WebAssembly fetch, WebGL, and IndexedDB on their own
// origin. An opaque sandbox origin breaks those APIs even for otherwise
// embeddable games (including the SM3DAS 64 port). Only URLs explicitly listed
// in the site's curated Games Library can request the compatibility sandbox.
// Arbitrary websites, search results and the Custom Loader stay isolated.
// Only entries sourced from the WASM.RIP game list are offered the explicit
// Scramjet launch path. Arbitrary site navigation does not gain game mode.
function isCuratedWasmRipGameUrl(url) {
  try {
    const target = new URL(url);
    return target.protocol === "https:" && Array.from(
      document.querySelectorAll("#wasm-rip-grid [data-proxy-url]")
    ).some(card => {
      try { return new URL(card.dataset.proxyUrl).href === target.href; }
      catch { return false; }
    });
  } catch { return false; }
}
function isCuratedRemoteGameUrl(url) {
	try {
		const target = new URL(url);
		if (target.protocol !== "https:" || target.origin === location.origin) return false;
		return Array.from(document.querySelectorAll("#games-dialog [data-proxy-url]"))
			.some(card => {
				try { return new URL(card.dataset.proxyUrl).href === target.href; }
				catch { return false; }
			});
	} catch { return false; }
}
/* ---------- Seuss Browser (optimized native, permitted embedding) ----------
   No relay, network rewriting, proxy URL, third-party library or additional
   service worker. Native browser caching and media loading are preserved.
   The external page remains subject to its own CSP/X-Frame-Options and the
   network's ordinary restrictions. A restrictive sandbox prevents top-level
   navigation, popups, and access to the site's signed-in storage.
*/
function seussLiteFrame(tab) {
	const frame = createDirectFrameForTab(tab);
	frame.title = tab.title || "Seuss Browser page";
	// Trusted first-party games need same-origin storage and WASM assets.
	// Every unrelated/external site retains an opaque-origin sandbox.
	const trustedCatalog = (() => {
		try {
			const u = new URL(tab.url);
			return u.origin === location.origin &&
				u.pathname.startsWith(BASE.pathname) &&
				FIRST_PARTY_GAME_FILES.has(u.pathname.slice(BASE.pathname.length));
		} catch { return false; }
	})();
	// For explicitly launched, curated cross-origin games only, preserve the
	// game's *own* origin so same-site .wasm, fonts, assets and saved-game data
	// can load. No such permission is granted for ordinary browsing.
	const supportedGame = !!tab.gameEmbed && isCuratedRemoteGameUrl(tab.url);
	frame.setAttribute("sandbox", trustedCatalog || supportedGame
		? "allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-modals allow-downloads"
		: "allow-scripts allow-forms allow-pointer-lock allow-modals allow-downloads");
	frame.setAttribute("allow", "fullscreen; autoplay; gamepad");
	frame.setAttribute("allowfullscreen", "");
	frame.referrerPolicy = "strict-origin-when-cross-origin";
	return frame;
}
function openSeussLite(targetUrl, options = {}) {
	if (!requireSeussAccount()) return;
	let target;
	try {
		target = new URL(targetUrl);
		if (!["https:","http:"].includes(target.protocol) || target.username ||
			target.password || !target.hostname) throw new Error("Invalid site address");
	} catch {
		showError("Invalid website address.", "Seuss Browser supports normal HTTP and HTTPS pages.");
		return;
	}
	let tab = !options.newTab && currentSiteTab()?.liteEngine ? currentSiteTab() : null;
	if (!tab) tab = createSiteTab("direct", options.title || siteTabTitle(target.href));
	if (!Array.isArray(tab.liteHistory)) {
		tab.liteHistory = [];
		tab.liteHistoryIndex = -1;
	}
	if (!Array.isArray(tab.liteHistoryGameModes))
		tab.liteHistoryGameModes = [];
	const eligibleGame = options.gameEmbed === true &&
		isCuratedRemoteGameUrl(target.href);
	if (!options.fromHistory) {
		// Keep the launch context per history entry so Back/Forward restores
		// the same WASM-compatible sandbox. Never enable it for arbitrary URLs.
		const end = tab.liteHistoryIndex + 1;
		tab.liteHistory = tab.liteHistory.slice(0, end);
		tab.liteHistoryGameModes = tab.liteHistoryGameModes.slice(0, end);
		tab.liteHistory.push(target.href);
		tab.liteHistoryGameModes.push(eligibleGame);
		if (tab.liteHistory.length > 30) {
			tab.liteHistory.shift();
			tab.liteHistoryGameModes.shift();
		}
		tab.liteHistoryIndex = tab.liteHistory.length - 1;
	}
	tab.liteEngine = true;
	tab.gameEmbed = (options.fromHistory
		? tab.liteHistoryGameModes[tab.liteHistoryIndex] === true
		: eligibleGame) && isCuratedRemoteGameUrl(target.href);
	tab.searchPage = false;
	if (options.embeddedQuery) tab.liteSearchQuery = String(options.embeddedQuery).slice(0, 180);
	tab.type = "direct";
	tab.url = target.href;
	tab.title = options.title || siteTabTitle(target.href);
	tab.loading = true;
	tab.liteTipDismissed = false;
	$("error").hidden = true;
	const frame = seussLiteFrame(tab);
	// Setting src starts the normal browser load without downloading Scramjet.
	frame.src = target.href;
	activateSiteTab(tab.id);
}
async function navigateSeussLiteHistory(tab, change) {
	if (!tab?.liteEngine || !Array.isArray(tab.liteHistory)) return;
	const next = tab.liteHistoryIndex + change;
	if (next < 0 || next >= tab.liteHistory.length) return;
	const destination = tab.liteHistory[next];
	if (typeof window.dssSitePolicyCheck === "function") {
		const allowed = await window.dssSitePolicyCheck(destination);
		if (!allowed) return;
	}
	tab.liteHistoryIndex = next;
	openSeussLite(destination, { fromHistory:true });
}
$("lite-hide-tip").addEventListener("click", () => {
	const tab = currentSiteTab();
	if (!tab?.liteEngine) return;
	tab.liteTipDismissed = true;
	$("lite-helper").hidden = true;
});
$("lite-back-to-results").addEventListener("click", () => {
	const tab = currentSiteTab();
	if (tab?.liteEngine && tab.liteSearchQuery) showSeussSearch(tab.liteSearchQuery);
});

/* ---------- Custom Loader: worker-free CORS HTML viewer ----------
 * This is not a Wisp tunnel, service-worker replacement or unrestricted
 * proxy. Retrieved scripts and forms are removed, leaving a sandboxed
 * static HTML page and a controlled, token-checked link handler.
 */
async function openCustomLoader(input, options = {}) {
	if (!requireSeussAccount()) return;
	let target;
	try {
		target = new URL(input);
		if (target.protocol !== "https:" || target.username || target.password)
			throw new Error("HTTPS required");
	} catch {
		showError("Custom Loader needs an HTTPS website address.",
			"Use an HTTPS URL or choose another browsing engine.");
		return;
	}
	if (typeof window.dssSitePolicyCheck !== "function" ||
		!(await window.dssSitePolicyCheck(target.href))) return;
	let tab = !options.newTab && currentSiteTab()?.customEngine ? currentSiteTab() : null;
	if (!tab) tab = createSiteTab("direct", siteTabTitle(target.href));
	if (tab.customAbort) tab.customAbort.abort();
	// Invalidate navigation messages from the old document while a new
	// navigation is pending. A stale frame must not change tab history.
	tab.customToken = "";
	const controller = new AbortController();
	tab.customAbort = controller;
	tab.customEngine = true;
	tab.liteEngine = false;
	tab.searchPage = false;
	tab.type = "direct";
	tab.loading = true;
	tab.url = target.href;
	tab.title = siteTabTitle(target.href);
	const frame = createDirectFrameForTab(tab);
	frame.title = "Custom Loader: CORS HTML viewer";
	frame.setAttribute("sandbox", "allow-scripts");
	frame.referrerPolicy = "no-referrer";
	$("error").hidden = true;
	activateSiteTab(tab.id);
	try {
		const page = await window.DSSCustomLoader.fetchPage(target.href, {
			signal: controller.signal
		});
		if (!siteTabs.includes(tab) || tab.customAbort !== controller ||
			controller.signal.aborted) return;
		tab.customToken = page.token;
		tab.title = page.title || siteTabTitle(target.href);
		if (Number.isInteger(options.historyIndex)) {
			tab.customHistoryIndex = options.historyIndex;
		} else if (!options.fromHistory) {
			tab.customHistory = (tab.customHistory || []).slice(0,
				(tab.customHistoryIndex ?? -1) + 1);
			tab.customHistory.push(target.href);
			if (tab.customHistory.length > 30) tab.customHistory.shift();
			tab.customHistoryIndex = tab.customHistory.length - 1;
		}
		frame.srcdoc = page.html;
		setStatus("ok", "Custom Loader displayed CORS-permitted HTML. " +
			"Original scripts and forms are disabled.");
	} catch (error) {
		if (error?.name === "AbortError" || controller.signal.aborted ||
			!siteTabs.includes(tab) || tab.customAbort !== controller) return;
		tab.loading = false;
		if (activeSiteTabId === tab.id) {
			activateSiteTab(tab.id);
			showError("Custom Loader could not display this page.",
				String(error?.message || error).slice(0,350) +
				" This mode cannot load pages that disallow CORS.");
		}
	}
}
async function navigateCustomHistory(tab, direction) {
	if (!tab?.customEngine || !Array.isArray(tab.customHistory)) return;
	const next = (tab.customHistoryIndex ?? -1) + direction;
	if (next < 0 || next >= tab.customHistory.length) return;
	const url = tab.customHistory[next];
	// The index changes only after a successful fetch. A denied or failed
	// destination should not corrupt Back/Forward navigation state.
	await openCustomLoader(url, { fromHistory:true, historyIndex:next });
}
// Only the intended sandboxed iframe can send a navigation request.
// The parent's go() independently checks the requested site's rules.
window.addEventListener("message", event => {
	const data = event.data;
	if (!data || data.type !== "dss-custom-loader-navigate" ||
		typeof data.url !== "string" || typeof data.token !== "string" ||
		!requireSeussAccount()) return;
	const tab = siteTabs.find(t => t.customEngine && t.customToken === data.token &&
		t.directFrame?.contentWindow === event.source);
	if (!tab) return;
	let url;
	try {
		url = new URL(data.url);
		if (url.protocol !== "https:" || url.username || url.password) return;
	} catch { return; }
	activateSiteTab(tab.id);
	void go(url.href);
});

/* ---------- Rammerhead portal launch (requires separately hosted Node server) ---------- */
function goRammerhead(targetUrl) {
	const base = rammerheadServerURL();
	if (!base) {
		openSettings();
		$("s-rammerhead-url").focus();
		return;
	}
	let tab = currentSiteTab();
	if (tab && tab.rammerhead && tab.rammerheadHost === base) {
		tab.targetUrl = targetUrl;
		activateSiteTab(tab.id);
		$("rammerhead-message").textContent = "Address updated. Copy it and paste it into your Rammerhead session.";
		return;
	}
	tab = createSiteTab("direct", "Rammerhead");
	tab.rammerhead = true;
	tab.rammerheadHost = base;
	tab.targetUrl = targetUrl;
	tab.url = base;
	tab.loading = true;
	const iframe = createDirectFrameForTab(tab);
	iframe.referrerPolicy = "no-referrer";
	iframe.title = "Rammerhead server — sign in to your private session";
	iframe.src = base;
	activateSiteTab(tab.id);
	$("rammerhead-message").textContent = "If the embedded portal is blank or blocked, click Open Rammerhead directly.";
}

// Ultraviolet requires a service worker for its /uv/service/* routes.
// Its opaque sandbox preserves the site's login credentials, but prevents
// its worker from controlling the iframe. Running the remote page as the
// authenticated origin instead would be a security risk. The prior "fallback"
// automatically used Scramjet, which can itself produce HTTP 404 when its
// separate service worker fails. Never silently navigate to either broken
// route: show a first-party compatibility view with safe, explicit choices.
function goUltraviolet(targetUrl) {
	if (!requireSeussAccount()) return;
	const { tab, main } = createSeussSearchPane({
		title: "Ultraviolet unavailable"
	});
	tab.uvFallback = true;
	tab.uvFallbackDismissed = true;
	tab.url = targetUrl;
	tab.searchQuery = "";
	tab.title = "Ultraviolet unavailable";
	activateSiteTab(tab.id);
	main.append(
		seussSearchNode("h1", "", "Ultraviolet isn't available on this site"),
		seussSearchNode("p", "seuss-search-note",
			"Ultraviolet needs an isolated origin and a controlling service worker. " +
			"This GitHub Pages deployment shares an origin with account sign-in, " +
			"so it cannot safely run the Ultraviolet iframe here. The earlier " +
			"automatic Scramjet fallback could still show a GitHub Pages 404."),
		seussSearchNode("p", "seuss-search-note",
			"Seuss Browser can load sites that permit embedding, without using " +
			"Ultraviolet or Scramjet. Some websites and networks may restrict access.")
	);
	const actions = seussSearchNode("div", "seuss-search-actions");
	actions.append(
		seussSearchButton("Try with Seuss Browser", () => {
			settings.proxyEngine = "seusslite";
			save();
			syncLabel();
			$("retry-wisp").hidden = true;
			$("retry-proxy").hidden = true;
			setStatus("ok", "Seuss Browser selected. It uses direct, permitted browser loading.");
			go(targetUrl, { forceLite:true, newTab:true });
		}),
		seussSearchButton("Select a different engine", openSettings),
		seussSearchButton("Back to home", goHome)
	);
	main.append(actions);
}
$("uv-fallback-dismiss").addEventListener("click", () => {
	const tab = currentSiteTab();
	if (tab?.uvFallback) tab.uvFallbackDismissed = true;
	$("uv-fallback-banner").hidden = true;
});
function goAdrift(targetUrl) {
	const base = adriftPortalURL();
	if (!base) {
		openSettings();
		$("s-adrift-url").focus();
		return;
	}
	let tab = currentSiteTab();
	if (tab && tab.adrift && tab.adriftHost === base) {
		tab.targetUrl = targetUrl;
		activateSiteTab(tab.id);
		$("rammerhead-message").textContent = "Destination updated. Copy and paste it into the Adrift portal.";
		return;
	}
	tab = createSiteTab("direct", "Adrift");
	tab.adrift = true;
	tab.adriftHost = base;
	tab.targetUrl = targetUrl;
	tab.url = base;
	tab.loading = true;
	const iframe = createDirectFrameForTab(tab);
	// A remote origin is isolated from the Seuss Search origin by the browser.
	iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals");
	iframe.referrerPolicy = "no-referrer";
	iframe.src = base;
	activateSiteTab(tab.id);
	$("rammerhead-message").textContent = "Adrift may block embedded portals. Use the direct link if it does.";
}

$("rammerhead-copy").addEventListener("click", async () => {
	const field = $("rammerhead-target");
	if (!field.value) return;
	try {
		await navigator.clipboard.writeText(field.value);
		$("rammerhead-message").textContent = "Destination copied. Paste it into Rammerhead's URL box.";
	} catch {
		field.focus();
		field.select();
		let copied = false;
		try { copied = document.execCommand("copy"); } catch {}
		$("rammerhead-message").textContent = copied ?
			"Destination copied." : "Select the address and copy it manually.";
	}
});

// This endpoint restricts every server-side CONNECT to wasm.rip TCP/443.
// The site catalog chooses when to use it; it is never a general Wisp preset.
const RESTRICTED_GAME_WISP = Object.freeze({
  wasm: "wss://seuss-wasmrip-wisp.onrender.com/game-wisp/",
  duckmath: "wss://seuss-curated-game-wisp.onrender.com/duckmath-wisp/",
  sm64: "wss://seuss-curated-game-wisp.onrender.com/sm64-wisp/"
});
let gameWispModeActive = "";
async function useCuratedGameTransport(mode = "") {
  if (mode) {
    const address = RESTRICTED_GAME_WISP[mode];
    if (!address) throw new Error("Unrecognized game relay.");
    if (gameWispModeActive === mode) return;
    const handshake = await probeWispHandshake(address, 18000);
    if (!handshake.ok) throw new Error("Restricted game Wisp unavailable: " + handshake.reason);
    // libcurl may fail TLS negotiations for these hosted browser games.
    // Use the independently bundled Epoxy Wisp transport for curated game
    // launches only; normal browsing retains the user's saved transport.
    const gameTransport = (mode === "sm64" || mode === "duckmath") ? "epoxy" : preferredTransport();
    await applyTransport(true, gameTransport, address);
    gameWispModeActive = mode;
  } else if (gameWispModeActive) {
    await configureTransport(true);
    gameWispModeActive = "";
  }
}
const DUCKMATH_GAME_TARGETS = Object.freeze({
  "2048.html": "https://ubg100.github.io/games/2048-master/index.html",
  "Doodle-Jump.html": "https://ubg100.github.io/games/doodlejump/index.html",
  "CookieClicker.html": "https://ubg100.github.io/games/cookie-clicker/index.html"
});
function isApprovedDuckMathWispGame(url) {
  try { return Object.values(DUCKMATH_GAME_TARGETS).includes(new URL(url).href); }
  catch { return false; }
}
function isApprovedSm64WispGame(url) {
  try { return new URL(url).href === "https://heyitsheart.github.io/sm3das/64/"; }
  catch { return false; }
}
async function go(input, options = {}) {
	if (!requireSeussAccount()) return;
	if (!options.forceScramjet && !options.nativeSearch &&
		settings.proxyEngine === "customloader" && isSeussSearchQuery(input)) {
		return showDuckDuckGoSearch(input, options);
	}
	if (!options.forceScramjet &&
		(options.forceLite || ["seusslite","customloader"].includes(settings.proxyEngine)) &&
		isSeussSearchQuery(input)) {
		if (!options.nativeSearch && settings.embedSearchPages) {
			const q = String(input).trim().slice(0, 180);
			return go(searchWebLink(q), {
				...options, forceLite:true, allowEmbeddedRestricted:true,
				embeddedQuery:q
			});
		}
		return showSeussSearch(input, options);
	}
	const url = toUrl(input);
	if (!url) return;
	// Game launchers must never proceed if the account's destination-rule
	// checker is unavailable. The ordinary browsing modes stay unchanged.
	if ((options.wasmRipProxy === true || options.duckmathProxy === true || options.sm64Proxy === true || options.gameEmbed === true) &&
		typeof window.dssSitePolicyCheck !== "function") {
		showError("Game site rules are unavailable.",
			"Reconnect to the site's safety checks before launching this game.");
		return;
	}
	// Check the hostname before any external navigation starts. The rule
	// service returns a block decision without reading the page contents.
	if (typeof window.dssSitePolicyCheck === "function") {
		const allowed = await window.dssSitePolicyCheck(url);
		if (!allowed) return;
	}
	if (!options.forceLite && !options.forceScramjet &&
		settings.proxyEngine === "customloader") return openCustomLoader(url, options);
	if (options.forceLite || (!options.forceScramjet && settings.proxyEngine === "seusslite")) {
		const u = new URL(url);
		if (prefersSupportedExternalPage(u) && !options.allowEmbeddedRestricted)
			return showEmbeddingNotice(u, options);
		return openSeussLite(url, options);
	}
	if (!options.forceScramjet) {
		if (settings.proxyEngine === "rammerhead") return goRammerhead(url);
		if (["ultraviolet","adrift"].includes(settings.proxyEngine)) {
			// Remote/opaque frames cannot consistently report internal domains;
			// require a fresh server-authorized moderator check for use.
			try {
				if (typeof window.seussCanUseExperimentalProxy !== "function" ||
					!(await window.seussCanUseExperimentalProxy())) {
					showError("This proxy option requires a site moderator.",
						"Use Scramjet for regular accounts. Experimental proxy modes cannot reliably enforce the site's per-domain content reporting.");
					return;
				}
			} catch (error) {
				showError("Could not verify moderator permission.", String(error && error.message || error));
				return;
			}
			return settings.proxyEngine === "ultraviolet"
				? goUltraviolet(url) : goAdrift(url);
		}
	}
	let tab = options.newTab ? createSiteTab("home", "Green Eggs and Ham game") : currentSiteTab();
	if (!tab || (tab.type !== "home" && tab.type !== "web")) tab = createSiteTab("home", "New Tab");
	$("error").hidden = true;
	try {
		await boot();
		// A cached ready promise only means startup passed previously. A newer
		// service worker (or a cleared registration) may no longer control us.
		await verifyProxyWorker();
	} catch (err) {
		ready = null;
		showError("Scramjet routing is not ready.", (err && err.message || String(err)) +
			" Reload this page and retry Scramjet; the website was not opened as a broken GitHub Pages file.");
		return;
	}
	// Only curated WASM.RIP launcher clicks use the destination-limited relay.
	// Normal Scramjet browsing restores the saved Wisp preference.
	try {
		const requestedGameRelay = options.wasmRipProxy === true && isCuratedWasmRipGameUrl(url) ? "wasm" :
			options.duckmathProxy === true && isApprovedDuckMathWispGame(url) ? "duckmath" :
			options.sm64Proxy === true && isApprovedSm64WispGame(url) ? "sm64" : "";
		await useCuratedGameTransport(requestedGameRelay);
	} catch (error) {
		showError("The restricted game Wisp tunnel is unavailable.",
			String(error && error.message || error) + " Try again or choose the original-site game option.");
		return;
	}
	tab.type = "web";
	tab.uvFallback = !!options.uvFallback;
	tab.uvFallbackDismissed = false;
	// The WASM.RIP game remains inside a genuine Scramjet frame. Keep the
	// source URL only for user-triggered retry/fallback controls.
	tab.wasmRipGameUrl = options.wasmRipProxy === true &&
		isCuratedWasmRipGameUrl(url) ? url : null;
	tab.url = url;
	tab.title = options.title || siteTabTitle(url);
	tab.loading = true;
	tab.loadStartedAt = Date.now();
	tab.loadStartHandled = proxyRequestSnapshot.handled;
	const instance = createFrameForTab(tab);
	activateSiteTab(tab.id);
	$("bar-address").value = url;
	loader.classList.add("on");
	updateProxyLoadStats();
	try {
		instance.go(url);
	} catch (err) {
		tab.loading = false;
		loader.classList.remove("on");
		updateProxyLoadStats();
		showError("That page couldn't be opened in the proxy.", String(err && err.message || err));
	}
}
// Server-requested navigation opens ONLY a new tab in Seuss Search.
window.openAdminDirectedSite = async (input) => {
	const url = new URL(String(input));
	if (url.protocol !== "https:" || url.username || url.password ||
		!url.hostname.includes(".") || url.port) {
		throw new Error("Admin navigation requires a normal HTTPS website.");
	}
	createSiteTab("home", "Admin link");
	await go(url.href, { forceScramjet:true });
	return url.hostname;
};
function goHome() {
	let tab = currentSiteTab();
	if (!tab) tab = createSiteTab("home", "New Tab");
	tab.type = "home";
	tab.title = "New Tab";
	tab.url = "";
	tab.loading = false;
	if (tab.customAbort) tab.customAbort.abort();
	if (tab.pane) tab.pane.remove();
	tab.pane = null;
	tab.frame = null;
	tab.directFrame = null;
	tab.liteEngine = false;
	tab.customEngine = false;
	tab.searchPage = false;
	tab.duckDuckGoSearch = false;
	tab.uvFallback = false;
	tab.wasmRipGameUrl = null;
	if (tab.searchAbort) tab.searchAbort.abort();
	activateSiteTab(tab.id);
	$("address").focus();
}
window.addEventListener("popstate", () => {
	const tab = currentSiteTab();
	if (tab && tab.type === "web") goHome();
});

/* ---------- Wire up UI ---------- */
$("search-form").addEventListener("submit", (e) => {
	e.preventDefault();
	go($("address").value);
});
$("bar-form").addEventListener("submit", (e) => { e.preventDefault(); go($("bar-address").value); $("bar-address").blur(); });
const gamesDialog = $("games-dialog");
$("open-games").addEventListener("click", () => gamesDialog.showModal());
// The first-party worker caches only the remaining console/VM pages.
// Custom Loader itself still needs no worker.
const offlineButton = $("library-enable-offline");
const offlineStatus = $("library-offline-status");
offlineButton.addEventListener("click", async () => {
  offlineButton.disabled = true;
  offlineStatus.textContent = "Saving three trusted console/VM pages to this browser…";
  try {
    if (!("serviceWorker" in navigator) || location.protocol !== "https:")
      throw new Error("Offline page caching requires a modern HTTPS browser.");
    const registration = await navigator.serviceWorker.register(PROXY_WORKER_URL, {
      scope: BASE.pathname, updateViaCache:"none"
    });
    await navigator.serviceWorker.ready;
    // On an update registration.active can still point at the old worker.
    // Wait until the exact new version is activated before posting a message.
    const expected = new URL(PROXY_WORKER_URL, location.origin).href;
    const worker = await new Promise((resolve,reject) => {
      const started = Date.now();
      const interval = setInterval(() => {
        const candidate = registration.active;
        if (candidate?.state === "activated" && candidate.scriptURL === expected) {
          clearInterval(interval);
          resolve(candidate);
        } else if (Date.now()-started>16000) {
          clearInterval(interval);
          reject(new Error("The updated offline worker did not activate. Reload and try again."));
        }
      }, 130);
    });
    const reply = await new Promise((resolve,reject) => {
      const channel = new MessageChannel();
      const timeout = setTimeout(() => {
        channel.port1.close();reject(new Error("Offline setup timed out. Try again."));
      }, 22000);
      channel.port1.onmessage = event => {
        clearTimeout(timeout);channel.port1.close();resolve(event.data||{});
      };
      worker.postMessage({type:"dss-install-offline-games"}, [channel.port2]);
    });
    if (!reply.ok) {
      const failed=(reply.files||[]).filter(x=>!x.ok).map(x=>x.file).join(", ");
      throw new Error(reply.error||("Couldn't cache "+(failed||"the game pages")+"."));
    }
    offlineStatus.textContent = "NES and console HTML pages saved, along with the existing VM DOS player. NES LJ65 runs offline; other console games need external runtimes or internet.";
  } catch (error) {
    offlineStatus.textContent = "Offline setup failed: "+(error?.message||String(error));
  } finally {
    offlineButton.disabled = false;
  }
});
// Remote-hosted library games cannot be made offline by caching an iframe.
// Label them clearly so they are not mistaken for local downloads.
for (const button of document.querySelectorAll("#games-dialog [data-proxy-url]")) {
  const detail = button.querySelector("span:last-child");
  if (detail && !detail.textContent.includes("Internet required"))
    detail.textContent += " · Internet required";
}

// These controls appear only while an actual WASM.RIP Scramjet game tab
// is active. All destinations still pass through the normal policy check.
$("wasm-proxy-embed").addEventListener("click", () => {
  const tab = currentSiteTab();
  if (!tab?.wasmRipGameUrl) return;
  void go(tab.wasmRipGameUrl, {
    forceLite:true,gameEmbed:true,newTab:true,title:tab.title
  });
});
$("wasm-proxy-retry").addEventListener("click", () => {
  const tab = currentSiteTab();
  if (!tab?.wasmRipGameUrl) return;
  void go(tab.wasmRipGameUrl, {
    forceScramjet:true,wasmRipProxy:true,newTab:true,title:tab.title
  });
});
$("wasm-proxy-original").addEventListener("click", async e => {
  e.preventDefault();
  const tab = currentSiteTab();
  if (!tab?.wasmRipGameUrl || !requireSeussAccount()) return;
  try {
    if (typeof window.dssSitePolicyCheck !== "function" ||
      !(await window.dssSitePolicyCheck(tab.wasmRipGameUrl))) return;
    window.location.assign(tab.wasmRipGameUrl);
  } catch {
    showError("Unable to check the game website.",
      "Please retry when site rules are available.");
  }
});
$("games-close").addEventListener("click", () => gamesDialog.close());
$("open-seuss-talk").addEventListener("click", openSeussTalkTab);

// WASM.RIP's public games.json snapshot is rendered as curated, inert
// HTML data. Existing game launch controls enforce account and site policy
// checks before any third-party site is opened.
const wasmView = $("wasm-rip-view");
const wasmMain = $("games-main-view");
const wasmLauncher = $("open-wasm-rip");
const wasmSearch = $("wasm-rip-search");
const wasmCards = Array.from($("wasm-rip-grid").querySelectorAll("[data-proxy-url]"));
const wasmFilters = Array.from(wasmView.querySelectorAll("[data-wasm-filter]"));
let wasmFilter = "all";
function filterWasmRipGames() {
  const words = wasmSearch.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
  let shown = 0;
  for(const card of wasmCards) {
    const haystack = card.dataset.wasmSearch || card.textContent.toLowerCase();
    const found = words.every(word => haystack.includes(word));
    const chosen = wasmFilter === "all" || card.dataset.wasmFeatured === "1";
    const visible = found && chosen;
    card.hidden = !visible;
    // addOriginalGameLinks wraps each card with a policy-checked fallback.
    const parent = card.parentElement;
    if(parent?.classList.contains("game-launch-choices")) parent.hidden = !visible;
    if(visible) shown++;
  }
  $("wasm-rip-count").textContent = shown + " of " + wasmCards.length + " browser ports";
  $("wasm-rip-empty").hidden = shown !== 0;
  for(const btn of wasmFilters)
    btn.setAttribute("aria-pressed",String(btn.dataset.wasmFilter === wasmFilter));
}
function showWasmRipGames() {
  if(!requireSeussAccount()) return;
  wasmMain.hidden = true;
  wasmView.hidden = false;
  wasmLauncher.setAttribute("aria-expanded","true");
  wasmSearch.value = "";
  wasmFilter = "all";
  filterWasmRipGames();
  wasmSearch.focus();
}
function leaveWasmRipGames(restoreFocus=true) {
  wasmView.hidden = true;
  wasmMain.hidden = false;
  wasmLauncher.setAttribute("aria-expanded","false");
  if(restoreFocus && gamesDialog.open) wasmLauncher.focus();
}
wasmLauncher.addEventListener("click",showWasmRipGames);
$("wasm-rip-back").addEventListener("click",()=>leaveWasmRipGames());
wasmSearch.addEventListener("input",filterWasmRipGames);
for(const btn of wasmFilters) btn.addEventListener("click",()=>{
  wasmFilter = btn.dataset.wasmFilter==="featured"?"featured":"all";
  filterWasmRipGames();
});
gamesDialog.addEventListener("close",()=>leaveWasmRipGames(false));
filterWasmRipGames();

// Every externally hosted game gets a visible original-host fallback.
// This is only a link to the game's own site; no third-party scripts, ROMs
// or game assets are copied into Seuss Search. Remote embedded play retains
// the site's existing destination-policy checks.
function addOriginalGameLinks() {
	for (const card of document.querySelectorAll("#games-dialog [data-proxy-url]")) {
		if (!card.closest(".library-grid")) continue;
		let url;
		try {
			url = new URL(card.dataset.proxyUrl);
			if (url.protocol !== "https:") continue;
		} catch { continue; }
		const group = document.createElement("div");
		group.className = "game-launch-choices";
		// WASM.RIP games launch in the actual Scramjet proxy by default.
		// Users can still try direct embedding in a separate in-site tab,
		// which may work better for large WebAssembly/browser-storage games.
		let embed = null;
		if (card.classList.contains("wasm-rip-game")) {
			embed = document.createElement("button");
			embed.type = "button";
			embed.className = "game-embed-link";
			embed.textContent = "Try direct embed (no proxy)";
			embed.addEventListener("click", event => {
				launchLibraryGame(event, url.href, {
					forceEmbed:true,
					title:card.querySelector("strong")?.textContent?.trim()
				});
			});
		}
		const fallback = document.createElement("a");
		fallback.className = "game-original-link";
		fallback.textContent = "Play on original website";
		fallback.href = url.href;
		fallback.target = "_blank";
		fallback.rel = "noopener noreferrer";
		fallback.title = "Opens the game on its original website after the site's usual safety check";
		fallback.target = "_self";
		// Do not preflight every game at page load: access-policy checks can
		// have moderation side effects and should occur only for a user-
		// selected destination. Never navigate until the check succeeds.
		fallback.addEventListener("click", async e => {
			e.preventDefault();
			if (!requireSeussAccount()) return;
			if (typeof window.dssSitePolicyCheck !== "function") return;
			try {
				if (!(await window.dssSitePolicyCheck(url.href))) return;
				window.location.assign(url.href);
			} catch {
				showError("Unable to check the game website.",
					"Please retry when the site's safety checks are available.");
			}
		});
		// Replace the mounted card before moving it into the wrapper.
		// Moving it first detaches it, making replaceWith() a no-op.
		card.replaceWith(group);
		group.append(card);
		if (embed) group.append(embed);
		group.append(fallback);
	}
}
addOriginalGameLinks();

function launchLibraryGame(event, url, options = {}) {
	event.preventDefault();
	event.stopPropagation();
	if (!requireSeussAccount()) return;
	const gameTitle = options.title ||
		event.currentTarget?.querySelector("strong")?.textContent?.trim() ||
		siteTabTitle(url);
	const isSm64Game = !options.forceEmbed && isApprovedSm64WispGame(url) &&
		event.currentTarget?.dataset?.proxyUrl === "https://heyitsheart.github.io/sm3das/64/";
	const isWasmGame = !options.forceEmbed &&
		event.currentTarget?.classList?.contains("wasm-rip-game") === true &&
		isCuratedWasmRipGameUrl(url);
	gamesDialog.close();
	// First-party offline games must not pass through external-site
	// moderation/network checks or an opaque sandbox.
	try {
		const page = new URL(url, BASE);
		if (page.origin === location.origin &&
			page.pathname.startsWith(BASE.pathname) &&
			FIRST_PARTY_GAME_FILES.has(page.pathname.slice(BASE.pathname.length))) {
			openDirectSiteTab(page.href, gameTitle);
			return;
		}
	} catch {}
	// WASM.RIP cards now use the genuine Scramjet request-rewriting proxy,
	// not an iframe pointed directly at the original host. An explicitly
	// chosen direct-embed fallback and original-site link remain available.
	// go() checks the destination site policy before either launch.
	if (isWasmGame) {
		void go(url, {
			forceScramjet:true,wasmRipProxy:true,newTab:true,title:gameTitle
		});
		return;
	}
	if (isSm64Game) {
		void go(url, {forceScramjet:true,sm64Proxy:true,newTab:true,title:gameTitle});
		return;
	}
	void go(url, { forceLite:true, gameEmbed:true, newTab:true, title:gameTitle });
}
// A game card in the first-party DuckMath catalog may request a narrowly
// approved launcher. Never accept arbitrary URLs from a postMessage sender.
window.addEventListener("message", event => {
  if (event.origin !== location.origin ||
      event.data?.type !== "dss-duckmath-wisp-launch") return;
  const tab = currentSiteTab();
  if (tab?.type !== "direct" ||
      !tab.url.endsWith("/duckmath-games.html") ||
      event.source !== tab.directFrame?.contentWindow) return;
  const file = event.data.file;
  if (!["2048.html","Doodle-Jump.html","CookieClicker.html"].includes(file)) return;
  const destination = DUCKMATH_GAME_TARGETS[file];
  if (!isApprovedDuckMathWispGame(destination)) return;
  void go(destination, {forceScramjet:true,duckmathProxy:true,newTab:true,
    title:"DuckMath · " + file.replace(/\\.html$/, "")});
});
document.querySelectorAll("[data-proxy-url]").forEach(button => {
	button.addEventListener("click", event => launchLibraryGame(event, button.dataset.proxyUrl));
});
document.querySelectorAll("[data-local-url]").forEach(button => {
	button.addEventListener("click", event => {
		const url = new URL(button.dataset.localUrl, BASE).href;
		launchLibraryGame(event, url);
	});
});
// Remote cloud sites may refuse embedding or require approved streaming
// integrations; don't pretend an iframe can remove their restrictions.
$("b-home").onclick = goHome;
$("b-back").onclick = () => {
	const tab = currentSiteTab();
	if (tab?.searchPage) { goHome(); return; }
	if (tab?.customEngine) navigateCustomHistory(tab, -1);
	else if (tab?.liteEngine) navigateSeussLiteHistory(tab, -1);
	else if (tab?.frame) tab.frame.back();
	else if (tab?.directFrame) { try { tab.directFrame.contentWindow.history.back(); } catch {} }
};
$("b-fwd").onclick = () => {
	const tab = currentSiteTab();
	if (tab?.customEngine) navigateCustomHistory(tab, 1);
	else if (tab?.liteEngine) navigateSeussLiteHistory(tab, 1);
	else if (tab?.frame) tab.frame.forward();
	else if (tab?.directFrame) { try { tab.directFrame.contentWindow.history.forward(); } catch {} }
};
$("b-reload").onclick = () => {
	const tab = currentSiteTab();
	if (!tab) return;
	if (tab.searchPage) {
		if (tab.duckDuckGoSearch) {
			void showDuckDuckGoSearch(tab.searchQuery);
			return;
		}
		if (tab.uvFallback) { goUltraviolet(tab.url); return; }
		if (tab.sourceNotice) showEmbeddingNotice(new URL(tab.url));
		else showSeussSearch(tab.searchQuery);
		return;
	}
	if (tab.customEngine) {
		void openCustomLoader(tab.url, { fromHistory:true });
		return;
	}
	if (tab.liteEngine) {
		tab.loading = true;
		loader.classList.add("on");
		tab.directFrame.src = tab.url;
		return;
	}
	if (tab.frame) {
		tab.loading = true;
		tab.loadStartedAt = Date.now();
		tab.loadStartHandled = proxyRequestSnapshot.handled;
		loader.classList.add("on");
		updateProxyLoadStats();
		tab.frame.reload();
	} else if (tab.directFrame) {
		tab.loading = true;
		loader.classList.add("on");
		try { tab.directFrame.contentWindow.location.reload(); }
		catch { tab.directFrame.src = tab.url; }
	}
};
$("b-full").onclick = () => { const el = $("frame-host"); (el.requestFullscreen || el.webkitRequestFullscreen).call(el); };

const tiles = $("tiles");
for (const [name, url, color] of TILES) {
	const li = document.createElement("li");
	const b = document.createElement("button");
	b.type = "button";
	b.className = "tile";
	b.innerHTML = `<span class="dot" style="background:${color}">${name[0]}</span>${name}`;
	b.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); go(url); });
	li.appendChild(b);
	tiles.appendChild(li);
}

document.addEventListener("keydown", (e) => {
	if (e.key === "/" && !$("home").hidden && document.activeElement.tagName !== "INPUT") {
		e.preventDefault();
		$("address").focus();
	}
});


/* ---------- Wisp WebSocket and handshake diagnostics ---------- */
function setStatus(state, message) {
	const indicator = $("status");
	indicator.className = "status " + state;
	indicator.lastElementChild.textContent = message;
}
// A Wisp v1 relay begins with CONTINUE (0x03) and v2 begins with INFO (0x05).
// A WebSocket 'open' event alone does not confirm a working Wisp relay.
let wispCheckSequence = 0;
let wispCheckSocket = null;
function checkWisp() {
	if (settings.proxyEngine === "rammerhead") return;
	const sequence = ++wispCheckSequence;
	if (wispCheckSocket) {
		try { wispCheckSocket.close(); } catch {}
		wispCheckSocket = null;
	}
	$("retry-wisp").disabled = false;
	let address;
	try {
		address = new URL(settings.wisp);
		if (!["wss:", "ws:"].includes(address.protocol)) throw new Error("Not a WebSocket address");
		if (location.protocol === "https:" && address.protocol !== "wss:") {
			throw new Error("An HTTPS website needs a secure wss:// relay");
		}
	} catch {
		setStatus("bad", "Wisp address invalid. Check Settings for a valid wss:// address.");
		return;
	}

	setStatus("", "Connecting to the Wisp relay…");
	let socket;
	try {
		socket = new WebSocket(address.href);
		socket.binaryType = "arraybuffer";
	} catch {
		setStatus("bad", "Couldn't start the WebSocket. Check the relay address in Settings.");
		return;
	}
	wispCheckSocket = socket;
	let opened = false;
	let finished = false;
	let timer;

	function finish(state, message) {
		if (finished || sequence !== wispCheckSequence) return;
		finished = true;
		clearTimeout(timer);
		if (wispCheckSocket === socket) wispCheckSocket = null;
		try { socket.close(); } catch {}
		setStatus(state, message);
	}
	timer = setTimeout(() => {
		finish("bad", opened
			? "Wisp socket opened, but no handshake arrived. Relay may be unhealthy; retry."
			: "Wisp timed out. Network restrictions or relay downtime may be responsible.");
	}, 11000);
	socket.addEventListener("open", () => {
		if (sequence !== wispCheckSequence || finished) return;
		opened = true;
		setStatus("", "WebSocket connected. Checking Wisp handshake…");
	});
	socket.addEventListener("message", (event) => {
		if (sequence !== wispCheckSequence || finished) return;
		const bytes = event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : null;
		// Both Wisp versions use five-byte headers; stream 0 is reserved for the handshake.
		if (bytes && bytes.length >= 5 && [3, 5].includes(bytes[0]) &&
			bytes[1] === 0 && bytes[2] === 0 && bytes[3] === 0 && bytes[4] === 0) {
			finish("ok", "Wisp protocol response received from " + address.host + " (page loading not yet tested)");
		} else {
			finish("bad", "WebSocket responded, but not with a Wisp handshake. Check your relay URL.");
		}
	});
	socket.addEventListener("error", () => {
		finish("bad", "Wisp WebSocket failed. The relay may be down or restricted by this network.");
	});
	socket.addEventListener("close", (event) => {
		if (sequence !== wispCheckSequence || finished) return;
		const reason = event.code === 1006 ? "" : " (code " + event.code + ")";
		finish("bad", "Wisp closed before replying" + reason + ". Retry or ask your network administrator.");
	});
}
// Test the Wisp handshake independently of Scramjet so browser service
// worker failures cannot be mistaken for blocked/broken WebSocket relays.
async function reconnectConfiguredWisp() {
	if (!["scramjet","ultraviolet"].includes(settings.proxyEngine)) return;
	if (!requireSeussAccount()) return;
	const retryButton = $("retry-proxy");
	retryButton.disabled = true;
	setStatus("", "Checking the Scramjet service worker and configured transport…");
	try {
		const alreadyInitialized = !!ready;
		await boot();
		// Boot already selected a Wisp and transport when it ran fresh.
		// Recheck explicitly only when retrying an existing connection.
		const chosen = await configureTransport(alreadyInitialized);
		const usingFallback = !!settings.fallbackWisp &&
			activeWisp === settings.fallbackWisp;
		setStatus("ok", "Scramjet initialized with " + TRANSPORT_LABELS[chosen] +
			" using the " + (usingFallback ? "fallback" : "primary") +
			" Wisp relay. Test Wisp checks the primary separately.");
	} catch (err) {
		setStatus("bad", "Scramjet initialization failed (not necessarily a Wisp failure): " +
			(err && err.message || String(err)));
	} finally {
		retryButton.disabled = false;
	}
}
$("retry-wisp").addEventListener("click", () => {
	if (!requireSeussAccount()) return;
	if (!["scramjet","ultraviolet"].includes(settings.proxyEngine)) {
		setStatus("", "Choose Scramjet or Ultraviolet to test Wisp.");
		return;
	}
	checkWisp();
});
$("retry-proxy").addEventListener("click", reconnectConfiguredWisp);
window.addEventListener("online", () => {
	if (requireSeussAccount() && ["scramjet","ultraviolet"].includes(settings.proxyEngine))
		checkWisp();
});

/* ---------- First-visit guide ---------- */
const tutorialDialog = $("tutorial");
function openTutorial() {
	if (!tutorialDialog.open) tutorialDialog.showModal();
}
$("s-tutorial").onclick = () => { dlg.close(); openTutorial(); };
tutorialDialog.addEventListener("close", () => {
	if ($("tutorial-again").checked || tutorialDialog.returnValue === "done") {
		try { localStorage.setItem("dss-tutorial-seen", "1"); } catch {}
	}
});
try {
	if (localStorage.getItem("dss-tutorial-seen") !== "1") openTutorial();
} catch { openTutorial(); }

/* ---------- Start ---------- */
applyAppearance();
syncLabel();
$("retry-wisp").hidden = !["scramjet","ultraviolet"].includes(settings.proxyEngine);
$("retry-proxy").hidden = $("retry-wisp").hidden;
if (settings.proxyEngine === "seusslite") {
	setStatus("ok", "Seuss Browser ready. Direct pages load without Wisp or a service worker.");
} else if (settings.proxyEngine === "customloader") {
	setStatus("ok", "Custom Loader selected. CORS-permitted HTTPS HTML only; no worker or Wisp.");
} else if (settings.proxyEngine === "rammerhead") {
	setStatus("", "Rammerhead is selected. Configure its server in Settings.");
} else if (settings.proxyEngine === "adrift") {
	setStatus("", "Adrift selected. Its remote portal must allow framing; moderator authorization is required.");
} else if (settings.proxyEngine === "ultraviolet") {
	setStatus("", "Ultraviolet is unavailable in this hosting setup. Opening a page will show safe alternatives instead of a 404.");
} else {
	setStatus("", "Ready to connect. Proxy setup begins after account approval.");
}
// Avoid downloading Scramjet/WASM and opening a Wisp probe while the
// site's account gate is still locked. Warm the shared runtime on idle
// after approval so the first browse has less startup delay.
let proxyWarmupScheduled = false;
function warmProxyAfterLogin() {
	if (proxyWarmupScheduled || !requireSeussAccount() ||
		!["scramjet","ultraviolet"].includes(settings.proxyEngine)) return;
	if (settings.performanceMode) return;
	proxyWarmupScheduled = true;
	const warm = async () => {
		if (!requireSeussAccount()) { proxyWarmupScheduled = false; return; }
		try {
			await boot();
			setStatus("ok", "Scramjet is initialized. The relay connection is checked when browsing.");
		} catch (err) {
			proxyWarmupScheduled = false;
			setStatus("bad", "Proxy warmup failed: " + (err && err.message || String(err)));
		}
	};
	if (typeof requestIdleCallback === "function")
		requestIdleCallback(warm, { timeout: 1800 });
	else setTimeout(warm, 350);
}
window.addEventListener("seuss-site-unlocked", warmProxyAfterLogin);

const params = new URLSearchParams(location.search);
const q = params.get("q") || params.get("goto");
if (q) {
	history.replaceState(null, "", BASE.pathname);
	$("address").value = q;
	// Don't load deep-link destinations before username account verification.
	window.addEventListener("seuss-site-unlocked", () => go(q), { once:true });
} else if (location.hash === "#browse") {
	history.replaceState(null, "", BASE.pathname);
}
