"use strict";
/* Dr. Seuss Search — built-in virtual machines.
 *  - Game Arcade: js-dos (DOSBox in WebAssembly) — sound, fast graphics, made for games
 *  - Full PCs:    v86 (x86 PC emulator in WebAssembly) — boots whole operating systems
 */
(() => {
	const VM_BASE = new URL("vm/", document.baseURI);
	const vmAt = (p) => new URL(p, VM_BASE).href;

	const GAMES = [
        { name: "Digger", badge: "D", color: "#c28b34", desc: "A tiny ready-to-play DOS maze and treasure game, already bundled locally.", size: "27 KB", url: "games/digger.jsdos", tip: "Use the arrow keys to move." },
		{ name: "DOOM", badge: "D", color: "#a8161e", desc: "Episode 1, Knee-Deep in the Dead. The 1993 shooter that started it all.", size: "2.4 MB", url: "games/doom.jsdos", tip: "Arrows move, Ctrl fires, Space opens doors." },
		{ name: "Quake", badge: "Q", color: "#6b4f2a", desc: "id Software's 1996 3D shooter, shareware episode. Heavier, so it may run choppy.", size: "9 MB", url: "games/quake.jsdos", tip: "Press Esc for the menu. Arrows move, Ctrl fires." },
		{ name: "Heretic", badge: "H", color: "#3d6b2a", desc: "Dark-fantasy shooter on the DOOM engine, shareware episode.", size: "2.9 MB", url: "games/heretic.jsdos", tip: "Arrows move, Ctrl fires, Space opens doors." },
		{ name: "Tyrian 2000", badge: "T", color: "#1aa6a0", desc: "A full vertical space shooter, released free by its makers.", size: "5 MB", url: "games/tyrian.jsdos", tip: "Arrows fly, Space fires, Enter selects." },
	];

	const SYSTEMS = [
		{ name: "Buildroot Linux", badge: "L", color: "#1aa6a0", desc: "A tiny modern Linux kernel with a BusyBox shell. Boots in seconds.", size: "10 MB", mem: 128,
			opts: { bzimage: { url: vmAt("images/buildroot-bzimage68.bin") }, cmdline: "tsc=reliable mitigations=off random.trust_cpu=on" } },
		{ name: "Linux 4 (CD)", badge: "4", color: "#d8262f", desc: "Boots a Linux 4 live CD image, with a console and handy tools.", size: "7.7 MB", mem: 128,
			opts: { cdrom: { url: vmAt("images/linux4.iso") } } },
		{ name: "KolibriOS", badge: "K", color: "#f06aa8", desc: "A whole graphical desktop written in assembly, on a single floppy.", size: "1.4 MB", mem: 128,
			opts: { fda: { url: vmAt("images/kolibri.img") } } },
		{ name: "FreeDOS", badge: "F", color: "#ffb627", desc: "A free DOS system with built-in invaders, snake and tetris.", size: "720 KB", mem: 64,
			opts: { fda: { url: vmAt("images/freedos722.img") } } },
	];


	const WEB_SYSTEMS = [
		{ name: "TerbiumOS v2", badge: "Tb", color: "#32ae62",
			desc: "A modern browser desktop with a window manager and app store, hosted by TerbiumOS.",
			size: "Web app", url: "https://terbiumon.top/" },
	];

	const $ = (id) => document.getElementById(id);
	const ui = {
		view: $("vm"), picker: $("vm-picker"), stage: $("vm-stage"),
		status: $("vm-status"), statusText: $("vm-status-text"), hint: $("vm-hint"),
		screen: $("screen_container"), fit: $("vm-fit"), fitInner: $("vm-fit-inner"), dosHost: $("dos-host"),
		mem: $("vm-mem"), title: document.querySelector(".vm-title"), toast: $("vm-toast"),
		webHost: $("vm-web-host"), webFallback: $("vm-web-fallback"),
	};
	const BTN = { cad: $("vm-cad"), mouse: $("vm-mouse"), shot: $("vm-shot"), pause: $("vm-pause"), restart: $("vm-restart"), power: $("vm-power") };

	let engine = null;   // "v86" | "dos" | null
	let emulator = null; // v86 instance
	let dos = null;      // js-dos props
	let webFrame = null; // hosted browser desktop iframe
	let current = null;  // last boot request (for restart)
	let paused = false;
	let bootGeneration = 0;

	/* ---------- helpers ---------- */
	function loadScript(src) {
		return new Promise((resolve, reject) => {
			const s = document.createElement("script");
			s.src = src; s.onload = resolve;
			s.onerror = () => reject(new Error("Couldn't load " + src.split("/").pop()));
			document.head.appendChild(s);
		});
	}
	let v86Lib = null, dosLib = null;
	const loadV86 = () => window.V86 ? Promise.resolve() : (v86Lib ||= loadScript(vmAt("libv86.js")).catch((e) => { v86Lib = null; throw e; }));
	const loadDos = () => window.Dos ? Promise.resolve() : (dosLib ||= loadScript(vmAt("jsdos/js-dos.js")).catch((e) => { dosLib = null; throw e; }));

	function setStatus(text, done = false) { ui.statusText.textContent = text; ui.status.classList.toggle("done", done); }
	function setTools(map) { for (const k in BTN) BTN[k].disabled = !map[k]; }
	let toastTimer;
	function toast(msg, ms = 3200) {
		ui.toast.textContent = msg; ui.toast.hidden = false;
		clearTimeout(toastTimer); toastTimer = setTimeout(() => (ui.toast.hidden = true), ms);
	}

	function card(item, onClick) {
		const li = document.createElement("li");
		const b = document.createElement("button");
		b.type = "button"; b.className = "os-card";
		b.innerHTML = `<span class="badge" style="background:${item.color}">${item.badge}</span><strong></strong><span class="desc"></span><span class="meta">${item.size} &middot; play</span>`;
		b.querySelector("strong").textContent = item.name;
		b.querySelector(".desc").textContent = item.desc;
		b.onclick = onClick;
		li.appendChild(b);
		return li;
	}
	for (const g of GAMES) $("game-grid").appendChild(card(g, () => bootDos({ name: g.name, url: vmAt(g.url), tip: g.tip })));
	for (const s of SYSTEMS) $("os-grid").appendChild(card(s, () => bootV86({ name: s.name, opts: s.opts, mem: Math.max(s.mem, +ui.mem.value) })));
	for (const s of WEB_SYSTEMS) $("web-os-grid").appendChild(card(s, () => bootWeb(s)));
	const localDesktop = SYSTEMS.find(system => system.name === "KolibriOS");
	$("vm-try-local-desktop").addEventListener("click", () => {
		if (!localDesktop) return;
		bootV86({
			name:localDesktop.name,
			opts:localDesktop.opts,
			mem:Math.max(localDesktop.mem, +ui.mem.value)
		});
	});
	document.querySelectorAll("#web-os-grid .meta").forEach((m) => (m.textContent = m.textContent.replace("play", "launch")));
	document.querySelectorAll("#os-grid .meta").forEach((m) => (m.innerHTML = m.innerHTML.replace("play", "boot")));

	$("vm-file").addEventListener("change", (e) => {
		const f = e.target.files && e.target.files[0]; e.target.value = "";
		if (!f) return;
		const ext = f.name.split(".").pop().toLowerCase();
		const opts = ext === "iso" ? { cdrom: { buffer: f } } : f.size <= 2949120 ? { fda: { buffer: f } } : { hda: { buffer: f } };
		bootV86({ name: f.name, opts, mem: +ui.mem.value });
	});
	$("vm-game-file").addEventListener("change", (e) => {
		const f = e.target.files && e.target.files[0]; e.target.value = "";
		if (!f) return;
		bootDos({ name: f.name, url: URL.createObjectURL(f), tip: "Your game is loading. If it opens a DOS prompt, type the game's .EXE name." });
	});

	/* ---------- shutdown ---------- */
	async function shutdown(invalidate = true) {
		if (invalidate) bootGeneration++;
		const e = emulator, d = dos;
		emulator = null; dos = null; engine = null; paused = false;
		if (e) { try { await e.destroy(); } catch {} }
		if (d) { try { await d.stop(); } catch {} }
		const text = ui.screen.querySelector(".vm-text");
		const canvas = ui.screen.querySelector("canvas");
		if (text) text.textContent = "";
		// v86 owns the graphics canvas, including its display-mode changes and
		// pixel dimensions. Reset only after the old emulator is destroyed.
		if (canvas) {
			canvas.style.display = "none";
			canvas.style.removeProperty("width");
			canvas.style.removeProperty("height");
			canvas.style.removeProperty("image-rendering");
			canvas.width = canvas.height = 0;
		}
		ui.screen.style.transform = "";
		ui.fitInner.style.width = "";
		ui.fitInner.style.height = "";
		ui.dosHost.innerHTML = ""; ui.dosHost.hidden = true;
		if (webFrame) { webFrame.src = "about:blank"; webFrame.remove(); webFrame = null; }
		ui.webHost.replaceChildren(); ui.webHost.hidden = true; ui.webFallback.hidden = true;
		ui.stage.classList.remove("dos", "web");
		setTools({});
	}

	function enterStage(name) {
		ui.picker.hidden = true; ui.stage.hidden = false;
		ui.title.textContent = name;
		setPauseIcon(true);
	}

	/* ---------- v86 (Full PCs) ---------- */
	async function bootV86(req) {
		const generation = ++bootGeneration;
		await shutdown(false);
		if (generation !== bootGeneration) return;
		current = { kind: "v86", req };
		enterStage(req.name);
		engine = "v86";
		ui.hint.textContent = "Click the screen to type. Use the mouse button to capture the pointer; press Esc to release it.";
		setStatus("Fetching the emulator…");
		try { await loadV86(); } catch (err) { if (generation === bootGeneration) setStatus("Couldn't load the PC emulator: " + err.message, true); return; }
		if (generation !== bootGeneration || engine !== "v86") return;
		setStatus("Loading " + req.name + "…");
		try {
		emulator = new window.V86({
			wasm_path: vmAt("v86.wasm"),
			bios: { url: vmAt("seabios.bin") },
			vga_bios: { url: vmAt("vgabios.bin") },
			memory_size: req.mem * 1024 * 1024,
			vga_memory_size: 8 * 1024 * 1024,
			screen_container: ui.screen,
			autostart: true,
			acpi: false,
			...req.opts,
		});
		emulator.add_listener("download-progress", (e) => {
			if (generation !== bootGeneration) return;
			if (e.lengthComputable && e.total) setStatus(`Downloading ${e.file_name ? e.file_name.split("/").pop() : "files"}… ${Math.round((e.loaded / e.total) * 100)}%`);
		});
		emulator.add_listener("download-error", () => { if (generation === bootGeneration) setStatus("A system file failed to download. Check your connection and retry.", true); });
		emulator.add_listener("emulator-ready", () => {
			if (generation !== bootGeneration) return;
			// Do not show/resize the canvas here! v86 switches between its
			// text DIV and graphics canvas itself. Forcing display:block causes
			// blank/overlapping frames when a guest changes video modes.
			setStatus(req.name + " is running", true);
			setTools({ cad: 1, mouse: 1, shot: 1, pause: 1, restart: 1, power: 1 });
			requestAnimationFrame(() => {
				if (generation !== bootGeneration) return;
				refit();
				requestAnimationFrame(() => {
					if (generation === bootGeneration) refit();
				});
			});
		});
		emulator.add_listener("emulator-error", (err) => { if (generation === bootGeneration) setStatus("VM error: " + (err && err.message || "unknown emulator error"), true); });
		emulator.add_listener("screen-set-size", () => {
			// The adapter already changed its own canvas dimensions and display
			// mode. Only the outer viewport should be fitted to the available
			// space; doing another canvas resize can corrupt its backing buffer.
			requestAnimationFrame(() => {
				if (generation !== bootGeneration) return;
				requestAnimationFrame(() => {
					if (generation === bootGeneration) refit();
				});
			});
		});
		} catch (err) {
			if (generation === bootGeneration) {
				setStatus("Couldn't start " + req.name + ": " + (err && err.message || err), true);
				setTools({});
			}
		}
	}

	/* ---------- js-dos (Game Arcade) ---------- */
	async function bootDos(req) {
		const generation = ++bootGeneration;
		await shutdown(false);
		if (generation !== bootGeneration) return;
		current = { kind: "dos", req };
		enterStage(req.name);
		engine = "dos";
		ui.stage.classList.add("dos");
		ui.hint.textContent = (req.tip ? req.tip + " " : "") + "Click the game to capture the mouse.";
		setStatus("Fetching DOSBox…");
		try { await loadDos(); } catch (err) { if (generation === bootGeneration) setStatus("Couldn't load the arcade emulator: " + err.message, true); return; }
		if (generation !== bootGeneration || engine !== "dos") return;
		ui.dosHost.hidden = false;
		const el = document.createElement("div");
		el.style.cssText = "width:100%;height:100%";
		ui.dosHost.appendChild(el);
		const mode = SCALE_MODES[scaleIdx];
		try {
		dos = window.Dos(el, {
			url: req.url,
			pathPrefix: vmAt("jsdos/emulators/"),
			theme: "dark",
			backend: "dosbox",
			backendLocked: true,
			noCloud: true,
			autoStart: true,
			countDownStart: 0,
			kiosk: true,
			autoSave: false,
			workerThread: true,
			mouseCapture: true,
			imageRendering: mode.dosRender,
			renderAspect: mode.dosAspect,
			volume: 0.8,
		});
		if (generation !== bootGeneration) { try { dos && dos.stop(); } catch {} return; }
		setStatus(req.name + " is running · click it to play", true);
		setTools({ pause: 1, restart: 1, power: 1, mouse: 1 });
		} catch (err) {
			if (generation === bootGeneration) {
				setStatus("Couldn't start " + req.name + ": " + (err && err.message || err), true);
				setTools({});
			}
		}
	}

	/* ---------- hosted browser desktops ---------- */
	async function bootWeb(req) {
		const generation = ++bootGeneration;
		await shutdown(false);
		if (generation !== bootGeneration) return;
		current = { kind: "web", req };
		enterStage(req.name);
		engine = "web";
		ui.stage.classList.add("web");
		ui.hint.textContent = "This is a hosted browser desktop, not a PC emulator. Some embedded browser features may be limited.";
		ui.webFallback.hidden = false;
		ui.webHost.hidden = false;
		setStatus("Opening TerbiumOS v2…");
		const frame = document.createElement("iframe");
		frame.title = req.name;
		frame.referrerPolicy = "no-referrer";
		frame.allow = "fullscreen; clipboard-read; clipboard-write";
		frame.addEventListener("load", () => {
			if (generation === bootGeneration && engine === "web")
				setStatus("TerbiumOS iframe response received. If you see a browser block message, its host or network does not allow embedding. Try the local desktop below.", true);
		});
		frame.addEventListener("error", () => {
			if (generation === bootGeneration && engine === "web")
				setStatus("The external TerbiumOS website could not be embedded. Use the built-in KolibriOS desktop instead.", true);
		});
		webFrame = frame;
		ui.webHost.appendChild(frame);
		setTools({ restart: 1, power: 1 });
		frame.src = req.url;
	}

	/* ---------- scaling ---------- */
	const SCALE_MODES = [
		{ id: "fit", label: "Fit", cls: "smooth", dosRender: "smooth", dosAspect: "4/3" },
		{ id: "pixel", label: "Pixel", cls: "pixel", dosRender: "pixelated", dosAspect: "4/3" },
		{ id: "stretch", label: "Stretch", cls: "smooth", dosRender: "smooth", dosAspect: "Fit" },
	];
	let scaleIdx = Math.max(0, SCALE_MODES.findIndex((m) => m.id === localStorage.getItem("dss-vm-scale")));
	function applyScaleButton() {
		const m = SCALE_MODES[scaleIdx];
		$("vm-scale").textContent = m.label;
		$("vm-scale").title = "Scaling: " + m.label + " (click to change)";
		ui.fit.classList.remove("smooth", "pixel");
		ui.fit.classList.add(m.cls);
	}
	$("vm-scale").onclick = () => {
		scaleIdx = (scaleIdx + 1) % SCALE_MODES.length;
		localStorage.setItem("dss-vm-scale", SCALE_MODES[scaleIdx].id);
		applyScaleButton();
		const m = SCALE_MODES[scaleIdx];
		if (dos) { try { dos.setImageRendering(m.dosRender); dos.setRenderAspect(m.dosAspect); } catch {} }
		refit();
		toast("Scaling: " + m.label);
	};
	applyScaleButton();

	function refit() {
		if (engine !== "v86") return;
		const sw = ui.screen.offsetWidth, sh = ui.screen.offsetHeight;
		const aw = ui.fit.clientWidth, ah = ui.fit.clientHeight;
		if (!sw || !sh || !aw || !ah) return;
		const mode = SCALE_MODES[scaleIdx].id;
		let sx = Math.min(1, aw / sw, ah / sh), sy = sx;
		if (mode === "pixel") {
			// Integer upscale only if there's actually room. Fractional
			// downscales are unavoidable on smaller displays.
			const fitted = Math.min(aw / sw, ah / sh);
			sx = sy = fitted >= 1 ? Math.max(1, Math.floor(fitted)) : fitted;
		}
		if (mode === "stretch") { sx = aw / sw; sy = ah / sh; }
		// Don't repeatedly mutate the transform on every ResizeObserver tick:
		// Firefox can re-composite an actively updating canvas otherwise.
		const transform = `scale(${sx}, ${sy})`;
		if (ui.screen.style.transform !== transform) ui.screen.style.transform = transform;
		const width = Math.round(sw * sx) + "px", height = Math.round(sh * sy) + "px";
		if (ui.fitInner.style.width !== width) ui.fitInner.style.width = width;
		if (ui.fitInner.style.height !== height) ui.fitInner.style.height = height;
	}
	if ("ResizeObserver" in window) {
		new ResizeObserver(() => requestAnimationFrame(refit)).observe(ui.fit);
		new ResizeObserver(() => requestAnimationFrame(refit)).observe(ui.screen);
	} else {
		window.addEventListener("resize", () => requestAnimationFrame(refit), { passive: true });
	}

	/* ---------- toolbar ---------- */
	const PAUSE_SVG = '<svg viewBox="0 0 24 24"><path d="M9 5v14M15 5v14"/></svg>';
	const PLAY_SVG = '<svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg>';
	function setPauseIcon(running) { BTN.pause.innerHTML = running ? PAUSE_SVG : PLAY_SVG; BTN.pause.title = running ? "Pause" : "Resume"; }

	BTN.cad.onclick = () => emulator && emulator.keyboard_send_scancodes([0x1d, 0x38, 0x53, 0x9d, 0xb8, 0xd3]);
	BTN.mouse.onclick = () => {
		if (emulator) emulator.lock_mouse();
		else if (dos) { const c = ui.dosHost.querySelector("canvas"); if (c && c.requestPointerLock) c.requestPointerLock(); }
	};
	BTN.restart.onclick = () => {
		if (emulator) { emulator.restart(); setPauseIcon(true); toast("Restarting…"); }
		else if (current && current.kind === "dos") bootDos(current.req);
		else if (current && current.kind === "web") bootWeb(current.req);
	};
	BTN.power.onclick = backToPicker;
	BTN.pause.onclick = async () => {
		if (emulator) {
			if (emulator.is_running()) { await emulator.stop(); setPauseIcon(false); setStatus("Paused", true); }
			else { await emulator.run(); setPauseIcon(true); setStatus(ui.title.textContent + " is running", true); }
		} else if (dos) {
			paused = !paused; dos.setPaused(paused); setPauseIcon(!paused);
			setStatus(paused ? "Paused" : ui.title.textContent + " is running", true);
		}
	};
	BTN.shot.onclick = () => {
		if (!emulator) return;
		try {
			const img = emulator.screen_make_screenshot();
			const a = document.createElement("a"); a.href = img.src; a.download = "dr-seuss-vm.png"; a.click();
		} catch { toast("Screenshots only work in graphics mode"); }
	};

	async function backToPicker() {
		await exitFull();
		await shutdown();
		ui.stage.hidden = true; ui.picker.hidden = false;
		ui.title.textContent = "The Thing-a-ma-VM";
	}

	/* ---------- fullscreen ---------- */
	const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
	let barTimer;
	document.addEventListener("pointerlockchange", () => { if (!document.pointerLockElement && ui.view.classList.contains("is-full")) showBar(); });
	function showBar() {
		ui.view.classList.add("show-bar");
		clearTimeout(barTimer);
		barTimer = setTimeout(() => ui.view.classList.remove("show-bar"), 2200);
	}
	function setFullUI(on, soft) {
		ui.view.classList.toggle("is-full", on);
		ui.view.classList.toggle("soft-full", on && soft);
		$("vm-full").title = on ? "Exit fullscreen" : "Fullscreen";
		$("vm-full").innerHTML = on
			? '<svg viewBox="0 0 24 24"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>'
			: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
		if (on) showBar();
		requestAnimationFrame(refit);
	}
	async function enterFull() {
		const el = ui.view;
		const req = el.requestFullscreen || el.webkitRequestFullscreen;
		let soft = !req;
		if (req) {
			try { await req.call(el, { navigationUI: "hide" }); } catch { soft = true; }
		}
		setFullUI(true, soft);
		if (!soft && navigator.keyboard && navigator.keyboard.lock) {
			try { await navigator.keyboard.lock(); toast("Fullscreen · hold Esc to exit · move the mouse to the top for controls", 4000); }
			catch { toast("Fullscreen · press Esc to exit · move the mouse to the top for controls", 4000); }
		} else {
			toast(soft ? "Fullscreen · tap the top edge for controls" : "Fullscreen · press Esc to exit", 3500);
		}
	}
	async function exitFull() {
		if (navigator.keyboard && navigator.keyboard.unlock) { try { navigator.keyboard.unlock(); } catch {} }
		if (fsEl()) { try { await (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch {} }
		setFullUI(false, false);
	}
	$("vm-full").onclick = () => (ui.view.classList.contains("is-full") ? exitFull() : enterFull());
	const onFsChange = () => { if (!fsEl() && !ui.view.classList.contains("soft-full")) setFullUI(false, false); };
	document.addEventListener("fullscreenchange", onFsChange);
	document.addEventListener("webkitfullscreenchange", onFsChange);
	ui.view.addEventListener("mousemove", (e) => { if (ui.view.classList.contains("is-full") && e.clientY < 90) showBar(); });
	ui.view.addEventListener("touchstart", (e) => { if (ui.view.classList.contains("is-full") && e.touches[0].clientY < 90) showBar(); }, { passive: true });
	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && ui.view.classList.contains("soft-full")) exitFull();
	});

	ui.screen.tabIndex = 0;
	setTools({});

	/* ---------- view routing ---------- */
	function showVM() {
		ui.view.hidden = false;
		document.title = "VM · Dr. Seuss Search";
		requestAnimationFrame(refit);
	}
	function hideVM() {
		ui.view.hidden = true;
	}
	function openVM(scrollToArcade) {
		if (typeof window.openVMTab === "function") window.openVMTab();
		else showVM();
		if (scrollToArcade) $("game-grid").scrollIntoView({ block: "start" });
	}
	$("open-vm").onclick = () => openVM(false);
	document.querySelectorAll("[data-arcade]").forEach((b) => (b.onclick = () => openVM(true)));
	$("vm-home").onclick = () => {
		if (!ui.stage.hidden) { backToPicker(); return; }
		if (typeof window.closeActiveSiteTab === "function") window.closeActiveSiteTab();
		else hideVM();
	};
	window.addEventListener("dss-site-tab-activated", (event) => {
		if (event.detail && event.detail.type === "vm") showVM();
		else hideVM();
	});

	window.DSSVM = { bootDos, bootV86, bootWeb, shutdown, GAMES, SYSTEMS, WEB_SYSTEMS };
})();
