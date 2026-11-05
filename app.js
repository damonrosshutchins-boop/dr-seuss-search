"use strict";
/* Dr. Seuss Search — a Scramjet-powered web proxy that runs on static hosting (GitHub Pages). */

const BASE = new URL("./", location.href); // works at / or /repo-name/
const at = (p) => new URL(p, BASE).pathname;

const DEFAULTS = {
	engine: "https://search.brave.com/search?q=%s",
	transport: "libcurl",
	wisp: "wss://wisp.mercurywork.shop/",
	cloak: false,
	background: "",
	accent: "#d8262f",
	theme: "light",
	reducedMotion: false,
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
async function applyTransport(force = false) {
	const path = TRANSPORTS[settings.transport] || TRANSPORTS.libcurl;
	const opts = settings.transport === "epoxy" ? { wisp: settings.wisp } : { websocket: settings.wisp };
	if (force || (await connection.getTransport()) !== path) {
		await connection.setTransport(path, [opts]);
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

/* ---------- Browser view ---------- */
let frame = null;
const loader = $("loader");
function showError(title, detail) {
	$("error").hidden = false;
	$("error-title").textContent = title;
	$("error-detail").textContent = detail || "";
}

async function go(input) {
	const url = toUrl(input);
	if (!url) return;
	$("error").hidden = true;
	try {
		await boot();
	} catch (err) {
		showError("Oh dear, the proxy couldn't start.", String(err && err.stack || err));
		return;
	}
	if (!frame) {
		frame = scramjet.createFrame();
		frame.frame.id = "sj-frame";
		frame.frame.title = "Proxied page";
		$("frame-host").appendChild(frame.frame);
		frame.addEventListener("urlchange", (e) => {
			$("bar-address").value = e.url;
			loader.classList.remove("on");
		});
		frame.frame.addEventListener("load", () => {
			loader.classList.remove("on");
			try { const t = frame.frame.contentDocument && frame.frame.contentDocument.title; if (t) document.title = t + " · Dr. Seuss Search"; } catch {}
		});
	}
	$("home").hidden = true;
	$("browser").hidden = false;
	$("bar-address").value = url;
	loader.classList.add("on");
	try {
		frame.go(url);
		if (location.hash !== "#browse") history.pushState({ browse: true }, "", "#browse");
	} catch (err) {
		loader.classList.remove("on");
		showError("That page couldn't be opened in the proxy.", String(err && err.message || err));
	}
}

function goHome() {
	$("browser").hidden = true;
	$("home").hidden = false;
	document.title = "Dr. Seuss Search";
	$("address").focus();
}
window.addEventListener("popstate", () => { if (location.hash !== "#browse") goHome(); });

/* ---------- Wire up UI ---------- */
$("search-form").addEventListener("submit", (e) => {
	e.preventDefault();
	if (settings.cloak && window.top === window.self) return cloak($("address").value);
	go($("address").value);
});
$("bar-form").addEventListener("submit", (e) => { e.preventDefault(); go($("bar-address").value); $("bar-address").blur(); });
$("open-geforce-proxy").onclick = () => go("https://play.geforcenow.com/");
$("b-home").onclick = () => history.back();
$("b-back").onclick = () => frame && frame.back();
$("b-fwd").onclick = () => frame && frame.forward();
$("b-reload").onclick = () => { if (frame) { loader.classList.add("on"); frame.reload(); } };
$("b-full").onclick = () => { const el = $("frame-host"); (el.requestFullscreen || el.webkitRequestFullscreen).call(el); };

const tiles = $("tiles");
for (const [name, url, color] of TILES) {
	const li = document.createElement("li");
	const b = document.createElement("button");
	b.type = "button";
	b.className = "tile";
	b.innerHTML = `<span class="dot" style="background:${color}">${name[0]}</span>${name}`;
	b.onclick = () => (settings.cloak && window.top === window.self ? cloak(url) : go(url));
	li.appendChild(b);
	tiles.appendChild(li);
}

document.addEventListener("keydown", (e) => {
	if (e.key === "/" && !$("home").hidden && document.activeElement.tagName !== "INPUT") {
		e.preventDefault();
		$("address").focus();
	}
});

/* ---------- about:blank cloak ---------- */
function cloak(input) {
	const w = window.open("about:blank", "_blank");
	if (!w) { go(input); return; }
	const target = new URL(BASE);
	if (input) target.searchParams.set("q", input);
	w.document.title = "Google Docs";
	const f = w.document.createElement("iframe");
	f.src = target.href;
	f.style.cssText = "position:fixed;inset:0;width:100%;height:100%;border:0;margin:0";
	w.document.body.style.margin = "0";
	w.document.body.appendChild(f);
}

/* ---------- Settings dialog ---------- */
const dlg = $("settings");
function syncLabel() { $("engine-label").textContent = ENGINE_NAMES[settings.engine] || "custom engine"; }
function openSettings() {
	$("s-engine").value = settings.engine;
	$("s-transport").value = settings.transport;
	$("s-wisp").value = settings.wisp;
	$("s-background").value = settings.background || "";
	$("s-accent").value = settings.accent || DEFAULTS.accent;
	$("s-theme").value = settings.theme || "light";
	$("s-motion").checked = !!settings.reducedMotion;
	$("s-cloak").checked = settings.cloak;
	dlg.showModal();
}
$("open-settings").onclick = openSettings;
$("engine-label").onclick = openSettings;
$("s-reset").onclick = () => {
	$("s-engine").value = DEFAULTS.engine;
	$("s-transport").value = DEFAULTS.transport;
	$("s-wisp").value = DEFAULTS.wisp;
	$("s-background").value = DEFAULTS.background;
	$("s-accent").value = DEFAULTS.accent;
	$("s-theme").value = DEFAULTS.theme;
	$("s-motion").checked = DEFAULTS.reducedMotion;
	$("s-cloak").checked = DEFAULTS.cloak;
};
$("settings-form").addEventListener("submit", async () => {
	const wispChanged = settings.wisp !== ($("s-wisp").value.trim() || DEFAULTS.wisp);
	const transportChanged = settings.transport !== $("s-transport").value;
	settings.engine = $("s-engine").value;
	settings.transport = $("s-transport").value;
	settings.wisp = $("s-wisp").value.trim() || DEFAULTS.wisp;
	settings.cloak = $("s-cloak").checked;
	settings.background = $("s-background").value.trim();
	settings.accent = $("s-accent").value || DEFAULTS.accent;
	settings.theme = $("s-theme").value;
	settings.reducedMotion = $("s-motion").checked;
	applyAppearance();
	save();
	syncLabel();
	if (wispChanged || transportChanged) {
		checkWisp();
		if (ready) { try { await ready; await applyTransport(true); } catch {} }
	}
});

/* ---------- Wisp health check ---------- */
function setStatus(state, text) {
	const s = $("status");
	s.className = "status " + state;
	s.lastElementChild.textContent = text;
}
function checkWisp() {
	setStatus("", "Checking the Wisp relay…");
	let done = false;
	try {
		const ws = new WebSocket(settings.wisp);
		ws.binaryType = "arraybuffer";
		const t = setTimeout(() => { if (!done) { done = true; ws.close(); setStatus("bad", "Wisp relay isn't answering — try another in Settings"); } }, 6000);
		ws.onmessage = () => { if (done) return; done = true; clearTimeout(t); ws.close(); setStatus("ok", "Relay ready: " + new URL(settings.wisp).host); };
		ws.onerror = () => { if (done) return; done = true; clearTimeout(t); setStatus("bad", "Can't reach the Wisp relay — check Settings"); };
	} catch {
		setStatus("bad", "That Wisp address doesn't look right");
	}
}

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
checkWisp();
boot().catch((err) => showError("Oh dear, the proxy couldn't start.", String(err && err.stack || err)));

const params = new URLSearchParams(location.search);
const q = params.get("q") || params.get("goto");
if (q) {
	history.replaceState(null, "", BASE.pathname);
	$("address").value = q;
	go(q);
} else if (location.hash === "#browse") {
	history.replaceState(null, "", BASE.pathname);
}
