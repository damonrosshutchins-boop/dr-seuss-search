"use strict";
/* Dr. Seuss Search — a Scramjet-powered web proxy that runs on static hosting (GitHub Pages). */

const BASE = new URL("./", location.href); // works at / or /repo-name/
const at = (p) => new URL(p, BASE).pathname;

const DEFAULTS = {
	engine: "https://search.brave.com/search?q=%s",
	transport: "libcurl",
	wisp: "wss://wisp.mercurywork.shop/",
	background: "",
	accent: "#d8262f",
	theme: "light",
	reducedMotion: false,
	proxyEngine: "scramjet",
	rammerheadServer: "",
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
const save = () => {
	try { localStorage.setItem("dss-settings", JSON.stringify(settings)); }
	catch { showError("Settings could not be saved.", "Your browser may have local storage disabled or full."); }
};

function applyAppearance() {
	const accent = /^#[0-9a-f]{6}$/i.test(settings.accent) ? settings.accent : DEFAULTS.accent;
	document.documentElement.style.setProperty("--red", accent);
	document.documentElement.dataset.theme = settings.theme === "dark" ? "dark" : "light";
	document.documentElement.classList.toggle("reduce-motion", !!settings.reducedMotion);
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

/* ---------- Settings dialog ---------- */
const dlg = $("settings");
function syncLabel() { $("engine-label").textContent = ENGINE_NAMES[settings.engine] || "custom engine"; }
function openSettings() {
	$("s-engine").value = settings.engine;
	$("s-proxy-engine").value = settings.proxyEngine === "rammerhead" ? "rammerhead" : "scramjet";
	$("s-rammerhead-url").value = settings.rammerheadServer || "";
	$("s-transport").value = settings.transport;
	$("s-wisp").value = settings.wisp;
	$("s-background").value = settings.background || "";
	$("s-accent").value = settings.accent || DEFAULTS.accent;
	$("s-theme").value = settings.theme || "light";
	$("s-motion").checked = !!settings.reducedMotion;
	if (typeof dlg.showModal === "function") { if (!dlg.open) dlg.showModal(); } else { dlg.setAttribute("open", ""); }
}
$("open-settings").onclick = openSettings;
$("engine-label").onclick = openSettings;
$("s-reset").onclick = () => {
	$("s-engine").value = DEFAULTS.engine;
	$("s-proxy-engine").value = DEFAULTS.proxyEngine;
	$("s-rammerhead-url").value = DEFAULTS.rammerheadServer;
	$("s-transport").value = DEFAULTS.transport;
	$("s-wisp").value = DEFAULTS.wisp;
	$("s-background").value = DEFAULTS.background;
	$("s-accent").value = DEFAULTS.accent;
	$("s-theme").value = DEFAULTS.theme;
	$("s-motion").checked = DEFAULTS.reducedMotion;
};
$("s-rammerhead-url").addEventListener("input", () => $("s-rammerhead-url").setCustomValidity(""));
$("settings-form").addEventListener("submit", async (event) => {
	const rawRammerheadServer = $("s-rammerhead-url").value.trim();
	if (rawRammerheadServer && !rammerheadServerURL(rawRammerheadServer)) {
		event.preventDefault();
		$("s-rammerhead-url").setCustomValidity("Use a trusted HTTPS Rammerhead server address.");
		$("s-rammerhead-url").reportValidity();
		return;
	}
	const proxyEngineChanged = settings.proxyEngine !== $("s-proxy-engine").value;
	const wispChanged = settings.wisp !== ($("s-wisp").value.trim() || DEFAULTS.wisp);
	const transportChanged = settings.transport !== $("s-transport").value;
	settings.engine = $("s-engine").value;
	settings.proxyEngine = $("s-proxy-engine").value === "rammerhead" ? "rammerhead" : "scramjet";
	settings.rammerheadServer = rawRammerheadServer;
	settings.transport = $("s-transport").value;
	settings.wisp = $("s-wisp").value.trim() || DEFAULTS.wisp;
	settings.background = $("s-background").value.trim();
	settings.accent = $("s-accent").value || DEFAULTS.accent;
	settings.theme = $("s-theme").value;
	settings.reducedMotion = $("s-motion").checked;
	applyAppearance();
	save();
	syncLabel();
	$("retry-wisp").hidden = settings.proxyEngine === "rammerhead";
	if (settings.proxyEngine === "rammerhead") {
		setStatus("", "Rammerhead is selected. It uses your separately hosted server.");
	} else if (wispChanged || transportChanged || proxyEngineChanged) {
		checkWisp();
		if (ready) {
			try { await ready; await applyTransport(true); }
			catch (err) { setStatus("bad", "Couldn't update the proxy connection: " + (err && err.message || String(err))); }
		}
	}
});


/* ---------- Scramjet + bare-mux setup ---------- */
const { ScramjetController } = $scramjetLoadController();
const scramjet = new ScramjetController({
	prefix: at("scramjet/"),
	files: {
		wasm: at("scram/scramjet.wasm.wasm"),
		all: at("scram/scramjet.all.js"),
		sync: at("scram/scramjet.sync.js"),
	},
});
const connection = new BareMux.BareMuxConnection(at("baremux/worker.js"));

let ready = null;
function boot() {
	if (ready) return ready;
	ready = (async () => {
		if (!("serviceWorker" in navigator)) {
			throw new Error(location.protocol !== "https:"
				? "Service workers need HTTPS. Open this site over https://."
				: "Your browser doesn't support service workers.");
		}
		await scramjet.init();
		await navigator.serviceWorker.register(at("sw.js"), { scope: BASE.pathname });
		await navigator.serviceWorker.ready;
		await applyTransport();
	})();
	ready.catch(() => { ready = null; });
	return ready;
}
// getTransport() reports only the module path, not the Wisp URL currently in use.
// Keep the BareMux worker synchronized with the locally saved address on every
// page startup, even when the transport module is unchanged.
let appliedTransportSettings = null;
async function applyTransport(force = false) {
	const path = TRANSPORTS[settings.transport] || TRANSPORTS.libcurl;
	const opts = settings.transport === "epoxy" ? { wisp: settings.wisp } : { websocket: settings.wisp };
	const signature = JSON.stringify([path, opts]);
	if (force || signature !== appliedTransportSettings) {
		await connection.setTransport(path, [opts]);
		appliedTransportSettings = signature;
	}
}

/* ---------- URL / search parsing ---------- */
function toUrl(input) {
	const q = input.trim();
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

/* ---------- Multi-tab browser view ---------- */
const loader = $("loader");
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

	for (const item of siteTabs) {
		if (item.pane) item.pane.hidden = item.id !== id;
	}
	loader.classList.toggle("on", !!tab.loading && tab.type === "web");
	if (tab.type === "web" || tab.type === "direct") $("bar-address").value = tab.rammerhead ? (tab.targetUrl || "") : (tab.url || "");
	const rhHelper = $("rammerhead-helper");
	rhHelper.hidden = !tab.rammerhead;
	if (tab.rammerhead) {
		$("rammerhead-target").value = tab.targetUrl || "";
		$("rammerhead-open").href = tab.rammerheadHost;
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
	}
	renderSiteTabs();
	window.dispatchEvent(new CustomEvent("dss-site-tab-activated", { detail: { type: tab.type, id: tab.id } }));
}
function closeSiteTab(id) {
	const index = siteTabs.findIndex(tab => tab.id === id);
	if (index < 0) return;
	const tab = siteTabs[index];
	if (tab.type === "talk") window.dispatchEvent(new Event("seuss-talk-tab-close"));
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
	let tab = siteTabs.find(item => item.type === "vm");
	if (!tab) tab = createSiteTab("vm", "VM");
	else activateSiteTab(tab.id);
}
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
		tab.url = event.url;
		tab.title = siteTabTitle(event.url);
		if (activeSiteTabId === tab.id) {
			$("bar-address").value = event.url;
			loader.classList.remove("on");
			tab.loading = false;
		}
		renderSiteTabs();
	});
	instance.frame.addEventListener("load", () => {
		tab.loading = false;
		if (activeSiteTabId === tab.id) {
			loader.classList.remove("on");
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
	return iframe;
}
function openDirectSiteTab(inputUrl, title) {
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

async function go(input) {
	const url = toUrl(input);
	if (!url) return;
	if (settings.proxyEngine === "rammerhead") return goRammerhead(url);
	let tab = currentSiteTab();
	if (!tab || (tab.type !== "home" && tab.type !== "web")) tab = createSiteTab("home", "New Tab");
	$("error").hidden = true;
	try {
		await boot();
	} catch (err) {
		showError("Oh dear, the proxy couldn't start.", String(err && err.stack || err));
		return;
	}
	tab.type = "web";
	tab.url = url;
	tab.title = siteTabTitle(url);
	tab.loading = true;
	const instance = createFrameForTab(tab);
	activateSiteTab(tab.id);
	$("bar-address").value = url;
	loader.classList.add("on");
	try {
		instance.go(url);
	} catch (err) {
		tab.loading = false;
		loader.classList.remove("on");
		showError("That page couldn't be opened in the proxy.", String(err && err.message || err));
	}
}
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

function launchLibraryGame(event, url, useLibcurl = false) {
	event.preventDefault();
	event.stopPropagation();
	gamesDialog.close();
	if (useLibcurl && settings.proxyEngine !== "rammerhead") {
		settings.transport = "libcurl";
		save();
		boot().then(() => applyTransport(true)).then(() => go(url)).catch((err) =>
			showError("The proxy connection could not be prepared.", String(err && err.stack || err)));
		return;
	}
	go(url);
}
document.querySelectorAll("[data-proxy-url]").forEach((button) => {
	button.addEventListener("click", (event) => launchLibraryGame(event, button.dataset.proxyUrl));
});
document.querySelectorAll("[data-local-url]").forEach((button) => {
	button.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		gamesDialog.close();
		const title = button.querySelector("strong")?.textContent?.trim() || "Game";
		openDirectSiteTab(button.dataset.localUrl, title);
	});
});

async function launchWithEpoxy(event, url) {
	event.preventDefault();
	event.stopPropagation();
	gamesDialog.close();
	if (settings.proxyEngine === "rammerhead") return go(url);
	settings.transport = "epoxy";
	save();
	try {
		await boot();
		await applyTransport(true);
		go(url);
	} catch (err) {
		showError("The proxy couldn't switch to the alternate connection.", String(err && err.stack || err));
	}
}
$("library-nowgg").addEventListener("click", (event) =>
	launchWithEpoxy(event, "https://now.gg/"));
$("library-geforce").addEventListener("click", (event) =>
	launchWithEpoxy(event, "https://play.geforcenow.com/"));
$("b-home").onclick = goHome;
$("b-back").onclick = () => { const tab = currentSiteTab(); if (tab && tab.frame) tab.frame.back(); else if (tab && tab.directFrame) tab.directFrame.contentWindow.history.back(); };
$("b-fwd").onclick = () => { const tab = currentSiteTab(); if (tab && tab.frame) tab.frame.forward(); else if (tab && tab.directFrame) tab.directFrame.contentWindow.history.forward(); };
$("b-reload").onclick = () => { const tab = currentSiteTab(); if (tab && tab.frame) { tab.loading = true; loader.classList.add("on"); tab.frame.reload(); } else if (tab && tab.directFrame) { tab.loading = true; loader.classList.add("on"); tab.directFrame.contentWindow.location.reload(); } };
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
// A standalone WebSocket probe does not reconfigure the transport the proxy
// actually uses. Retry refreshes that transport first, then checks the relay.
async function reconnectConfiguredWisp() {
	if (settings.proxyEngine !== "scramjet") return;
	const retryButton = $("retry-wisp");
	retryButton.disabled = true;
	setStatus("", "Refreshing Scramjet's saved Wisp connection…");
	try {
		await boot();
		await applyTransport(true);
		checkWisp();
	} catch (err) {
		setStatus("bad", "Scramjet connection setup failed: " + (err && err.message || String(err)));
	} finally {
		retryButton.disabled = false;
	}
}
$("retry-wisp").addEventListener("click", () => {
	if (settings.proxyEngine !== "scramjet") {
		setStatus("", "Rammerhead uses a separate server. Select Scramjet to test Wisp.");
		return;
	}
	reconnectConfiguredWisp();
});
window.addEventListener("online", () => {
	if (settings.proxyEngine === "scramjet") reconnectConfiguredWisp();
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
$("retry-wisp").hidden = settings.proxyEngine === "rammerhead";
if (settings.proxyEngine === "rammerhead") {
	setStatus("", "Rammerhead is selected. Configure its server in Settings.");
} else {
	checkWisp();
	boot().catch((err) => showError("Oh dear, the proxy couldn't start.", String(err && err.stack || err)));
}

const params = new URLSearchParams(location.search);
const q = params.get("q") || params.get("goto");
if (q) {
	history.replaceState(null, "", BASE.pathname);
	$("address").value = q;
	go(q);
} else if (location.hash === "#browse") {
	history.replaceState(null, "", BASE.pathname);
}
