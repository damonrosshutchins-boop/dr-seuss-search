"use strict";
/* Dr. Seuss Search — a Scramjet-powered web proxy that runs on static hosting (GitHub Pages). */

const BASE = new URL("./", location.href); // works at / or /repo-name/
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
function syncLabel() {
	$("engine-label").textContent = settings.proxyEngine === "seusslite" ?
		"Seuss Search" : (ENGINE_NAMES[settings.engine] || "custom engine");
}
function openSettings() {
	$("s-engine").value = settings.engine;
	$("s-embed-search").checked = !!settings.embedSearchPages;
	$("s-proxy-engine").value =
		["seusslite","scramjet","rammerhead","ultraviolet","adrift"].includes(settings.proxyEngine)
			? settings.proxyEngine : "scramjet";
	$("s-rammerhead-url").value = settings.rammerheadServer || "";
	$("s-adrift-url").value = settings.adriftServer || "";
	$("s-transport").value = settings.transport;
	$("s-wisp").value = settings.wisp;
	$("s-background").value = settings.background || "";
	$("s-accent").value = settings.accent || DEFAULTS.accent;
	$("s-theme").value = settings.theme || "light";
	$("s-motion").checked = !!settings.reducedMotion;
	$("s-performance").checked = !!settings.performanceMode;
	if (typeof dlg.showModal === "function") { if (!dlg.open) dlg.showModal(); } else { dlg.setAttribute("open", ""); }
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
	$("s-wisp").value = DEFAULTS.wisp;
	$("s-background").value = DEFAULTS.background;
	$("s-accent").value = DEFAULTS.accent;
	$("s-theme").value = DEFAULTS.theme;
	$("s-motion").checked = DEFAULTS.reducedMotion;
	$("s-performance").checked = DEFAULTS.performanceMode;
};
$("s-rammerhead-url").addEventListener("input", () => $("s-rammerhead-url").setCustomValidity(""));
$("s-adrift-url").addEventListener("input", () => $("s-adrift-url").setCustomValidity(""));
$("settings-form").addEventListener("submit", async (event) => {
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
	const proxyEngineChanged = settings.proxyEngine !== $("s-proxy-engine").value;
	const wispChanged = settings.wisp !== ($("s-wisp").value.trim() || DEFAULTS.wisp);
	const transportChanged = settings.transport !== $("s-transport").value;
	const performanceChanged = settings.performanceMode !== $("s-performance").checked;
	settings.engine = $("s-engine").value;
	settings.embedSearchPages = $("s-embed-search").checked;
	settings.proxyEngine = ["seusslite","scramjet","rammerhead","ultraviolet","adrift"].includes($("s-proxy-engine").value)
		? $("s-proxy-engine").value : "scramjet";
	settings.rammerheadServer = rawRammerheadServer;
	settings.adriftServer = rawAdriftServer;
	settings.transport = $("s-transport").value;
	settings.wisp = $("s-wisp").value.trim() || DEFAULTS.wisp;
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
	} else if (settings.proxyEngine === "rammerhead") {
		setStatus("", "Rammerhead uses your separately hosted server.");
	} else if (settings.proxyEngine === "adrift") {
		setStatus("", "Adrift opens a third-party WebRTC portal inside a site tab. It requires moderator access and may reject iframe embedding.");
	} else if (settings.proxyEngine === "ultraviolet") {
		setStatus("", "Ultraviolet is currently unavailable in a safe same-origin iframe. Browsing uses the Scramjet fallback.");
	} else if (settings.performanceMode && !ready) {
		setStatus("", "Performance Mode is on. The proxy engine will load when you browse.");
	} else if (wispChanged || transportChanged || proxyEngineChanged || (performanceChanged && !settings.performanceMode)) {
		checkWisp();
		if (ready) {
			try { await ready; await applyTransport(true); }
			catch (err) { setStatus("bad", "Couldn't update the proxy connection: " + (err && err.message || String(err))); }
		}
	}
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
const PROXY_WORKER_VERSION = "greeneggs-404fix-1";
const PROXY_WORKER_URL = at("sw.js") + "?v=" + PROXY_WORKER_VERSION;
async function verifyProxyWorker() {
	const expected = new URL(PROXY_WORKER_URL, location.origin).href;
	const timeoutMs = 14000;
	const worker = await new Promise((resolve, reject) => {
		const active = () => {
			const controller = navigator.serviceWorker.controller;
			return controller && controller.state === "activated" &&
				controller.scriptURL === expected ? controller : null;
		};
		const now = active();
		if (now) { resolve(now); return; }
		let done = false;
		const cleanup = () => {
			navigator.serviceWorker.removeEventListener("controllerchange", check);
			clearInterval(interval);
			clearTimeout(timeout);
		};
		const check = () => {
			if (done) return;
			const current = active();
			if (!current) return;
			done = true;
			cleanup();
			resolve(current);
		};
		navigator.serviceWorker.addEventListener("controllerchange", check);
		const interval = setInterval(check, 150);
		const timeout = setTimeout(() => {
			if (done) return;
			done = true;
			cleanup();
			reject(new Error("The updated Scramjet worker did not take control. Reload the page once and try again."));
		}, timeoutMs);
		check();
	});
	return new Promise((resolve, reject) => {
		const channel = new MessageChannel();
		const timeout = setTimeout(() => {
			channel.port1.close();
			reject(new Error("Scramjet did not respond to its route check. Reload the site."));
		}, 6000);
		channel.port1.onmessage = (event) => {
			clearTimeout(timeout);
			channel.port1.close();
			const response = event.data || {};
			if (response.ok && response.prefix === at("scramjet/")) resolve(true);
			else reject(new Error(
				"Scramjet route does not match this GitHub Pages repository path. " +
				(response.error || "Expected " + at("scramjet/") + ", received " + (response.prefix || "none"))
			));
		};
		try {
			worker.postMessage({ type:"dss-scramjet-route-check" }, [channel.port2]);
		} catch (err) {
			clearTimeout(timeout);
			channel.port1.close();
			reject(err);
		}
	});
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
		try {
			await applyTransport();
		} catch (primary) {
			// Epoxy is a separate Wisp transport already bundled with the site.
			// Fall back only when the configured transport cannot initialize.
			if (settings.transport !== "libcurl") throw primary;
			settings.transport = "epoxy";
			try {
				await applyTransport(true);
				save();
				setStatus("", "libcurl could not start; switched to Epoxy. Loading websites may now work more reliably.");
			} catch {
				settings.transport = "libcurl";
				throw primary;
			}
		}
	})();
	ready.catch(() => { ready = null; });
	return ready;
}
// getTransport() reports only the module path, not the Wisp URL currently in use.
// Keep the BareMux worker synchronized with the locally saved address on every
// page startup, even when the transport module is unchanged.
let appliedTransportSettings = null;
// Serialize transport changes: a network retry and Settings save must not
// race and replace each other's working Wisp connection.
let transportChangeQueue = Promise.resolve();
function applyTransport(force = false) {
	const transport = settings.transport === "epoxy" ? "epoxy" : "libcurl";
	const path = TRANSPORTS[transport];
	const opts = transport === "epoxy" ? { wisp: settings.wisp } : { websocket: settings.wisp };
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
	if (!tab || (tab.type !== "web" && !tab.liteEngine)) return;
	if (tab.pane) tab.pane.remove();
	tab.frame = null;
	tab.directFrame = null;
	tab.pane = null;
	tab.liteEngine = false;
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
	if (!tab || (tab.type !== "web" && !tab.liteEngine) || !tab.url ||
		typeof window.dssSitePolicyCheck !== "function") return;
	const url = tab.url;
	const allowed = await window.dssSitePolicyCheck(url);
	if (!allowed && tab.url === url) stopBlockedProxyTab(tab);
};
// Report only the active site's domain/section, never a full URL or search query.
function publicActiveSiteView(tab = currentSiteTab()) {
	if (!tab || tab.type === "home") return "Home";
	if (tab.type === "talk") return "Seuss Talk";
	if (tab.type === "admin") return "Admin Dashboard";
	if (tab.type === "vm") return "VM";
	if (tab.rammerhead) return "Rammerhead";
	if (tab.searchPage) return tab.sourceNotice ? "External website notice" : "Seuss Search results";
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
		select.textContent = (tab.type === "talk" ? "💬 " : tab.type === "vm" ? "🖥 " : "") + tab.title;
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
	$("vm").hidden = tab.type !== "vm";
	$("admin-workspace").hidden = tab.type !== "admin";

	for (const item of siteTabs) {
		if (item.pane) item.pane.hidden = item.id !== id;
	}
	loader.classList.toggle("on", !!tab.loading && (tab.type === "web" || tab.liteEngine));
	updateProxyLoadStats();
	const uvBanner = $("uv-fallback-banner");
	uvBanner.hidden = !tab.uvFallback || !!tab.uvFallbackDismissed;
	const liteHelper = $("lite-helper");
	liteHelper.hidden = !tab.liteEngine || !!tab.liteTipDismissed || !!tab.searchPage;
	$("lite-back-to-results").hidden = !tab.liteEngine || !tab.liteSearchQuery;
	if (tab.liteEngine) {
		$("lite-source-link").href = tab.url;
		$("lite-helper-description").textContent =
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
	if (tab.searchAbort) tab.searchAbort.abort();
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
}
function createFrameForTab(tab) {
	if (tab.frame) return tab.frame;
	const pane = document.createElement("div");
	pane.className = "site-frame-pane";
	pane.hidden = true;
	const instance = scramjet.createFrame();
	instance.frame.id = "sj-frame-" + tab.id;
	instance.frame.title = "Proxied page";
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
	// The first-party offline catalog is maintained as part of this site's
	// trusted code and needs its own normal origin for loading game assets.
	// All third-party game pages stay in an opaque-origin sandbox.
	const trustedCatalog = tab.url === new URL("offline-pack.html", BASE).href;
	frame.setAttribute("sandbox", trustedCatalog
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
	if (!options.fromHistory) {
		tab.liteHistory = tab.liteHistory.slice(0, tab.liteHistoryIndex + 1);
		tab.liteHistory.push(target.href);
		// Keep only the latest 30 top-level destinations to minimize memory.
		if (tab.liteHistory.length > 30) tab.liteHistory.shift();
		tab.liteHistoryIndex = tab.liteHistory.length - 1;
	}
	tab.liteEngine = true;
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

// Ultraviolet depends on a service worker controlling its navigated page.
// Sandboxing the frame into an opaque origin safely isolates account tokens,
// but also prevents the worker from controlling it. Without the worker GitHub
// Pages returns HTTP 404 for /uv/service/ encoded URLs. Adding
// "allow-same-origin" with "allow-scripts" would expose this site's Supabase
// login storage to remote pages rewritten as same-origin content.
// Keep the restriction and use the existing working Scramjet path instead.
// Full Ultraviolet requires hosting the proxy on an isolated origin.
function goUltraviolet(targetUrl) {
	return go(targetUrl, { forceScramjet:true, uvFallback:true });
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

async function go(input, options = {}) {
	if (!requireSeussAccount()) return;
	if (!options.forceScramjet &&
		(options.forceLite || settings.proxyEngine === "seusslite") &&
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
	// Check the hostname before any external navigation starts. The rule
	// service returns a block decision without reading the page contents.
	if (typeof window.dssSitePolicyCheck === "function") {
		const allowed = await window.dssSitePolicyCheck(url);
		if (!allowed) return;
	}
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
	} catch (err) {
		showError("Oh dear, the proxy couldn't start.", String(err && err.stack || err));
		return;
	}
	tab.type = "web";
	tab.uvFallback = !!options.uvFallback;
	tab.uvFallbackDismissed = false;
	tab.url = url;
	tab.title = siteTabTitle(url);
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
	if (tab.pane) tab.pane.remove();
	tab.pane = null;
	tab.frame = null;
	tab.directFrame = null;
	tab.liteEngine = false;
	tab.searchPage = false;
	tab.uvFallback = false;
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

$("games-close").addEventListener("click", () => gamesDialog.close());
$("open-seuss-talk").addEventListener("click", openSeussTalkTab);

// Green Eggs and Ham has instant filtering. Library games use the lean
// native Seuss Browser frame; the original host must allow embedding.
const greenEggsMain = $("games-main-view");
const greenEggsView = $("green-eggs-view");
const greenEggsSearch = $("green-eggs-search");
const greenEggsCards = [...$("green-eggs-grid").querySelectorAll("[data-proxy-url]")];
const greenEggsLauncher = $("open-green-eggs");
function filterGreenEggs() {
	const words = greenEggsSearch.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
	let visible = 0;
	for (const card of greenEggsCards) {
		const haystack = (card.textContent + " " + (card.dataset.search || "")).toLowerCase();
		const matches = words.every(word => haystack.includes(word));
		card.hidden = !matches;
		if (matches) visible++;
	}
	$("green-eggs-count").textContent = visible + " of " + greenEggsCards.length +
		(visible === 1 ? " game" : " games");
	$("green-eggs-empty").hidden = visible !== 0;
}
function showGreenEggs() {
	if (!requireSeussAccount()) return;
	greenEggsMain.hidden = true;
	greenEggsView.hidden = false;
	gamesDialog.classList.add("green-eggs-open");
	greenEggsLauncher.setAttribute("aria-expanded", "true");
	greenEggsSearch.value = "";
	filterGreenEggs();
	greenEggsSearch.focus();
}
function showRegularGames(restoreFocus = true) {
	greenEggsView.hidden = true;
	greenEggsMain.hidden = false;
	gamesDialog.classList.remove("green-eggs-open");
	greenEggsLauncher.setAttribute("aria-expanded", "false");
	if (restoreFocus && gamesDialog.open) greenEggsLauncher.focus();
}
greenEggsLauncher.addEventListener("click", showGreenEggs);
$("green-eggs-back").addEventListener("click", () => showRegularGames());
greenEggsSearch.addEventListener("input", filterGreenEggs);
gamesDialog.addEventListener("close", () => showRegularGames(false));
filterGreenEggs();

function launchLibraryGame(event, url) {
	event.preventDefault();
	event.stopPropagation();
	if (!requireSeussAccount()) return;
	const gameTitle = event.currentTarget?.querySelector("strong")?.textContent?.trim() || siteTabTitle(url);
	gamesDialog.close();
	// All Games Library tiles (including Green Eggs and Ham) open in a new
	// Seuss Browser tab, independently of the general search engine choice.
	// go() still checks site policy BEFORE the native iframe is created.
	go(url, { forceLite:true, newTab:true, title:gameTitle });
}
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
$("library-nowgg").addEventListener("click", event => launchLibraryGame(event, "https://now.gg/"));
$("library-geforce").addEventListener("click", event => launchLibraryGame(event, "https://play.geforcenow.com/"));
$("b-home").onclick = goHome;
$("b-back").onclick = () => {
	const tab = currentSiteTab();
	if (tab?.searchPage) { goHome(); return; }
	if (tab?.liteEngine) navigateSeussLiteHistory(tab, -1);
	else if (tab?.frame) tab.frame.back();
	else if (tab?.directFrame) { try { tab.directFrame.contentWindow.history.back(); } catch {} }
};
$("b-fwd").onclick = () => {
	const tab = currentSiteTab();
	if (tab?.liteEngine) navigateSeussLiteHistory(tab, 1);
	else if (tab?.frame) tab.frame.forward();
	else if (tab?.directFrame) { try { tab.directFrame.contentWindow.history.forward(); } catch {} }
};
$("b-reload").onclick = () => {
	const tab = currentSiteTab();
	if (!tab) return;
	if (tab.searchPage) {
		if (tab.sourceNotice) showEmbeddingNotice(new URL(tab.url));
		else showSeussSearch(tab.searchQuery);
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
		await boot();
		await applyTransport(true);
		setStatus("ok", "Scramjet worker and transport initialized. Select Test Wisp to check relay connectivity.");
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
} else if (settings.proxyEngine === "rammerhead") {
	setStatus("", "Rammerhead is selected. Configure its server in Settings.");
} else if (settings.proxyEngine === "adrift") {
	setStatus("", "Adrift selected. Its remote portal must allow framing; moderator authorization is required.");
} else if (settings.proxyEngine === "ultraviolet") {
	setStatus("", "Ultraviolet selected: pages will use a secure Scramjet fallback to avoid GitHub Pages 404 errors.");
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
