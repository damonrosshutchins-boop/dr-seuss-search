"use strict";
/* Dr. Seuss Search — built-in virtual machine powered by v86 (x86 emulator in WebAssembly). */

(() => {
	const VM_BASE = new URL("vm/", document.baseURI);
	const vmAt = (p) => new URL(p, VM_BASE).href;

	const SYSTEMS = [
		{
			id: "buildroot", name: "Buildroot Linux", badge: "L", color: "#1aa6a0",
			desc: "A tiny modern Linux kernel with a BusyBox shell. Boots in seconds.",
			size: "10 MB", mem: 128,
			opts: { bzimage: { url: vmAt("images/buildroot-bzimage68.bin") }, cmdline: "tsc=reliable mitigations=off random.trust_cpu=on" },
		},
		{
			id: "linux4", name: "Linux 4 (CD)", badge: "4", color: "#d8262f",
			desc: "Boots a Linux 4 live CD image, with a console and handy tools.",
			size: "7.7 MB", mem: 128,
			opts: { cdrom: { url: vmAt("images/linux4.iso") } },
		},
		{
			id: "kolibri", name: "KolibriOS", badge: "K", color: "#f06aa8",
			desc: "A whole graphical desktop written in assembly, on a single floppy.",
			size: "1.4 MB", mem: 128,
			opts: { fda: { url: vmAt("images/kolibri.img") } },
		},
		{
			id: "freedos", name: "FreeDOS", badge: "D", color: "#ffb627",
			desc: "A free DOS-compatible system. Type DIR and feel like it's 1994.",
			size: "720 KB", mem: 64,
			opts: { fda: { url: vmAt("images/freedos722.img") } },
		},
	];

	const $ = (id) => document.getElementById(id);
	const ui = {
		view: $("vm"), picker: $("vm-picker"), stage: $("vm-stage"), grid: $("os-grid"),
		status: $("vm-status"), statusText: $("vm-status-text"), screen: $("screen_container"),
		mem: $("vm-mem"), file: $("vm-file"), title: document.querySelector(".vm-title"),
		tools: ["vm-cad", "vm-mouse", "vm-shot", "vm-pause", "vm-restart", "vm-power"].map($),
	};

	let emulator = null;
	let libPromise = null;

	function loadLib() {
		if (window.V86) return Promise.resolve();
		if (libPromise) return libPromise;
		libPromise = new Promise((resolve, reject) => {
			const s = document.createElement("script");
			s.src = vmAt("libv86.js");
			s.onload = resolve;
			s.onerror = () => { libPromise = null; reject(new Error("Couldn't load the emulator files.")); };
			document.head.appendChild(s);
		});
		return libPromise;
	}

	function setStatus(text, done = false) {
		ui.statusText.textContent = text;
		ui.status.classList.toggle("done", done);
	}
	function setTools(on) { ui.tools.forEach((b) => (b.disabled = !on)); }

	/* ---------- Picker ---------- */
	for (const sys of SYSTEMS) {
		const li = document.createElement("li");
		const b = document.createElement("button");
		b.type = "button";
		b.className = "os-card";
		b.innerHTML = `<span class="badge" style="background:${sys.color}">${sys.badge}</span><strong></strong><span class="desc"></span><span class="meta">${sys.size} &middot; boot</span>`;
		b.querySelector("strong").textContent = sys.name;
		b.querySelector(".desc").textContent = sys.desc;
		b.onclick = () => boot(sys.name, sys.opts, Math.max(sys.mem, +ui.mem.value));
		li.appendChild(b);
		ui.grid.appendChild(li);
	}

	ui.file.addEventListener("change", () => {
		const f = ui.file.files && ui.file.files[0];
		ui.file.value = "";
		if (!f) return;
		const ext = f.name.split(".").pop().toLowerCase();
		let opts;
		if (ext === "iso") opts = { cdrom: { buffer: f } };
		else if (f.size <= 2949120) opts = { fda: { buffer: f } };
		else opts = { hda: { buffer: f } };
		boot(f.name, opts, +ui.mem.value);
	});

	/* ---------- Boot / power ---------- */
	async function boot(name, osOpts, memMB) {
		await powerOff();
		ui.picker.hidden = true;
		ui.stage.hidden = false;
		ui.title.textContent = name;
		setTools(false);
		setStatus("Fetching the emulator…");
		try {
			await loadLib();
		} catch (err) {
			setStatus("Oh dear: " + err.message, true);
			return;
		}
		setStatus("Loading " + name + "…");
		emulator = new window.V86({
			wasm_path: vmAt("v86.wasm"),
			bios: { url: vmAt("seabios.bin") },
			vga_bios: { url: vmAt("vgabios.bin") },
			memory_size: memMB * 1024 * 1024,
			vga_memory_size: 8 * 1024 * 1024,
			screen_container: ui.screen,
			autostart: true,
			acpi: false,
			...osOpts,
		});
		emulator.add_listener("download-progress", (e) => {
			if (e.lengthComputable && e.total) {
				const pct = Math.round((e.loaded / e.total) * 100);
				setStatus(`Downloading ${e.file_name ? e.file_name.split("/").pop() : "files"}… ${pct}%`);
			}
		});
		emulator.add_listener("download-error", () => setStatus("A file failed to download. Try again in a moment.", true));
		emulator.add_listener("emulator-ready", () => {
			setStatus(name + " is running", true);
			setTools(true);
			setPauseIcon(true);
			ui.screen.focus();
		});
	}

	async function powerOff() {
		if (!emulator) return;
		const e = emulator;
		emulator = null;
		try { await e.destroy(); } catch {}
		const text = ui.screen.querySelector(".vm-text");
		const canvas = ui.screen.querySelector("canvas");
		if (text) text.textContent = "";
		if (canvas) { canvas.style.display = "none"; canvas.width = canvas.height = 0; }
		setTools(false);
	}

	function backToPicker() {
		powerOff();
		ui.stage.hidden = true;
		ui.picker.hidden = false;
		ui.title.textContent = "The Thing-a-ma-VM";
	}

	const PAUSE_SVG = '<svg viewBox="0 0 24 24"><path d="M9 5v14M15 5v14"/></svg>';
	const PLAY_SVG = '<svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg>';
	function setPauseIcon(running) {
		const b = $("vm-pause");
		b.innerHTML = running ? PAUSE_SVG : PLAY_SVG;
		b.title = running ? "Pause" : "Resume";
	}

	$("vm-cad").onclick = () => emulator && emulator.keyboard_send_scancodes([0x1d, 0x38, 0x53, 0x9d, 0xb8, 0xd3]);
	$("vm-mouse").onclick = () => emulator && emulator.lock_mouse();
	$("vm-restart").onclick = () => { if (emulator) { emulator.restart(); setStatus("Restarting…", true); setPauseIcon(true); } };
	$("vm-power").onclick = backToPicker;
	$("vm-pause").onclick = async () => {
		if (!emulator) return;
		if (emulator.is_running()) { await emulator.stop(); setPauseIcon(false); setStatus("Paused", true); }
		else { await emulator.run(); setPauseIcon(true); setStatus(ui.title.textContent + " is running", true); }
	};
	$("vm-shot").onclick = () => {
		if (!emulator) return;
		try {
			const img = emulator.screen_make_screenshot();
			const a = document.createElement("a");
			a.href = img.src;
			a.download = "dr-seuss-vm.png";
			a.click();
		} catch { setStatus("Screenshots only work in graphics mode", true); }
	};
	$("vm-full").onclick = () => {
		const el = ui.stage.hidden ? ui.view : ui.stage;
		(el.requestFullscreen || el.webkitRequestFullscreen).call(el);
	};
	ui.screen.tabIndex = 0;
	setTools(false);

	/* ---------- View routing ---------- */
	function showVM() {
		$("home").hidden = true;
		$("browser").hidden = true;
		ui.view.hidden = false;
		document.title = "VM · Dr. Seuss Search";
	}
	function hideVM() { ui.view.hidden = true; }

	$("open-vm").onclick = () => { showVM(); if (location.hash !== "#vm") history.pushState({ vm: true }, "", "#vm"); };
	$("vm-home").onclick = () => {
		if (location.hash === "#vm") history.back();
		else { hideVM(); $("home").hidden = false; document.title = "Dr. Seuss Search"; }
	};
	window.addEventListener("popstate", () => {
		if (location.hash === "#vm") showVM();
		else hideVM();
	});
	if (location.hash === "#vm") showVM();

	window.DSSVM = { boot, powerOff, SYSTEMS };
})();
