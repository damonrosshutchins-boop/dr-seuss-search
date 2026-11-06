"use strict";
/* Extra appearance controls for Dr. Seuss Search.
 * All cursor drawings are original doodles, not illustrations copied from books.
 */
(() => {
	const options = ["normal", "cartoon", "red-fish", "blue-fish", "striped-hat", "green-egg"];
	const $ = id => document.getElementById(id);
	const controls = {
		bg: $("s-interactive-bg"),
		cursor: $("s-cursor"),
		home: $("home"),
		canvas: $("home-particles"),
		frameHost: $("frame-host")
	};
	if (!controls.bg || !controls.cursor || !controls.canvas || !controls.home) return;
	if (!["dots", "aurora", "off"].includes(settings.interactiveBgStyle)) {
		settings.interactiveBgStyle = settings.interactiveNewTab === false ? "off" : "dots";
	}
	if (!options.includes(settings.cursorStyle)) settings.cursorStyle = "cartoon";

	/* Tiny SVG cursors with the real pointer hotspot at the top-left arrow tip. */
	function cursorSVG(preset) {
		const ink = "#24202a";
		const arrow = '<path d="M3 2 L3 25 L9 19 L15 32 L20 29 L14 17 L24 17 Z" fill="#fffdf1" stroke="'+ink+'" stroke-width="2.6" stroke-linejoin="round"/>';
		let art = "";
		switch (preset) {
			case "cartoon":
				art = '<circle cx="30" cy="12" r="9" fill="#ffbe43" stroke="'+ink+'" stroke-width="2.4"/><path d="M30 7v10m-5-5h10" stroke="'+ink+'" stroke-width="2.2" stroke-linecap="round"/><circle cx="35" cy="30" r="4" fill="#54bbb9" stroke="'+ink+'" stroke-width="1.8"/>';
				break;
			case "red-fish":
			case "blue-fish": {
				const body = preset === "red-fish" ? "#f36c6c" : "#48b5ed";
				const fin = preset === "red-fish" ? "#ffc089" : "#bde9fc";
				art = '<path d="M21 22L16 14L29 20Z" fill="'+fin+'" stroke="'+ink+'" stroke-width="1.9"/>'+
					'<path d="M36 23L44 16L44 34L36 28Z" fill="'+body+'" stroke="'+ink+'" stroke-width="2" stroke-linejoin="round"/>'+
					'<path d="M17 25Q28 13 36 22Q39 28 35 31Q25 36 17 25Z" fill="'+body+'" stroke="'+ink+'" stroke-width="2.2"/>'+
					'<circle cx="23" cy="24" r="2.5" fill="#fff"/><circle cx="22.8" cy="23.5" r="1.2" fill="'+ink+'"/>'+
					'<path d="M24 30q4 3 7-1" fill="none" stroke="'+ink+'" stroke-width="1.5" stroke-linecap="round"/>';
				break;
			}
			case "striped-hat":
				art = '<path d="M21 36L23 13L38 13L40 36Z" fill="#fff" stroke="'+ink+'" stroke-width="2.3"/>'+
					'<path d="M22 19h17l-1 6H22Z" fill="#ef5b63"/><path d="M21 30h19v6H21Z" fill="#ef5b63"/>'+
					'<path d="M18 36q12 7 27 0" fill="none" stroke="'+ink+'" stroke-width="3" stroke-linecap="round"/>'+
					'<path d="M23 13q8-4 15 0" fill="none" stroke="'+ink+'" stroke-width="2.3"/>';
				break;
			case "green-egg":
				art = '<ellipse cx="30" cy="25" rx="14" ry="10" transform="rotate(-13 30 25)" fill="#fffef5" stroke="'+ink+'" stroke-width="2.4"/>'+
					'<ellipse cx="31" cy="25" rx="6.2" ry="5.1" fill="#72cf83" stroke="'+ink+'" stroke-width="1.9"/>';
				break;
		}
		return '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">'+art+arrow+'</svg>';
	}
	function cursorRule() {
		if (settings.cursorStyle === "normal") return "";
		const uri = "data:image/svg+xml," + encodeURIComponent(cursorSVG(settings.cursorStyle));
		return '*, *::before, *::after { cursor: url("' + uri + '") 3 2, auto !important; }'+
			'input:not([type=button]):not([type=submit]):not([type=reset]):not([type=checkbox]):not([type=radio]), textarea, [contenteditable=true], [role=textbox] {cursor: text !important;}';
	}
	function styleDocument(doc, cssText) {
		try {
			if (!doc || !doc.documentElement) return;
			let el = doc.getElementById("dss-cursor-style");
			if (!cssText) { if (el) el.remove(); return; }
			if (!el) {
				el = doc.createElement("style");
				el.id = "dss-cursor-style";
				(doc.head || doc.documentElement).appendChild(el);
			}
			if (el.textContent !== cssText) el.textContent = cssText;
		} catch { /* Respect iframe origin/sandbox restrictions. */ }
	}
	function styleFrame(frame) {
		try { styleDocument(frame.contentDocument, cursorRule()); }
		catch { /* Some pages aren't same-origin; their native cursor remains. */ }
	}
	function applyCursors() {
		const css = cursorRule();
		styleDocument(document, css);
		if (controls.frameHost) {
			controls.frameHost.querySelectorAll("iframe").forEach(styleFrame);
		}
	}

	/* Each frame is watched once so a new proxied page gets the selected cursor. */
	const seenFrames = new WeakSet();
	function watchFrames() {
		if (!controls.frameHost) return;
		for (const frame of controls.frameHost.querySelectorAll("iframe")) {
			if (seenFrames.has(frame)) continue;
			seenFrames.add(frame);
			frame.addEventListener("load", () => styleFrame(frame));
			styleFrame(frame);
		}
	}
	if (controls.frameHost) {
		new MutationObserver(watchFrames).observe(controls.frameHost, {childList: true, subtree: true});
		watchFrames();
	}

	/* Home-only, reduced-motion-aware springy floating particles. */
	const ctx = controls.canvas.getContext("2d");
	const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
	const palette = ["#ef83ad", "#5ac5bf", "#edbf5b", "#8ca9e4", "#a6d888", "#f4a575"];
	const pointer = {x: -1000, y: -1000};
	let dots = [], width = 0, height = 0, frameId = 0, running = false;
	function resize() {
		if (!ctx) return;
		const rect = controls.canvas.getBoundingClientRect();
		width = Math.max(1, rect.width);
		height = Math.max(1, rect.height);
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		controls.canvas.width = Math.round(width * dpr);
		controls.canvas.height = Math.round(height * dpr);
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		dots = Array.from({length: Math.max(28, Math.min(64, Math.round(width * height / 24000)))}, (_, i) => {
			const x = Math.random() * width, y = Math.random() * height;
			return {x, y, originX:x, originY:y, vx:0, vy:0, color:palette[i % palette.length], phase:Math.random()*6.28, radius:3.5+Math.random()*5};
		});
	}
	function paint(timestamp) {
		if (!running) return;
		ctx.clearRect(0, 0, width, height);
		if (settings.interactiveBgStyle === "aurora") {
			const pointerX = pointer.x < 0 ? width * .5 : pointer.x;
			const pointerY = pointer.y < 0 ? height * .5 : pointer.y;
			for (let band = 0; band < 6; band++) {
				const phase = timestamp * (.00016 + band * .000018) + band * 1.35;
				const baseY = height * (.22 + band * .105);
				const influence = Math.max(0, 1 - Math.abs(pointerX - width / 2) / Math.max(1, width / 2));
				const sway = (pointerY - height / 2) * .055 * influence;
				const gradient = ctx.createLinearGradient(0, baseY - 100, width, baseY + 100);
				gradient.addColorStop(0, "rgba(65, 224, 190, 0)");
				gradient.addColorStop(.45, band % 2 ? "rgba(106, 125, 255, .34)" : "rgba(66, 230, 190, .38)");
				gradient.addColorStop(1, "rgba(196, 103, 255, 0)");
				ctx.beginPath();
				ctx.moveTo(0, baseY);
				for (let x = 0; x <= width + 24; x += 24) {
					const y = baseY + Math.sin(x * .006 + phase) * (34 + band * 5) +
						Math.sin(x * .0025 - phase * 1.7) * 25 + sway;
					ctx.lineTo(x, y);
				}
				ctx.strokeStyle = gradient;
				ctx.lineWidth = 34 + band * 5;
				ctx.globalAlpha = .8;
				ctx.shadowBlur = 24;
				ctx.shadowColor = band % 2 ? "#7d82ff" : "#45e0c0";
				ctx.stroke();
			}
			ctx.shadowBlur = 0;
		} else {
			for (const d of dots) {
				d.vx += (d.originX + Math.sin(timestamp * .0006 + d.phase) * 13 - d.x) * .013;
				d.vy += (d.originY + Math.cos(timestamp * .0005 + d.phase) * 11 - d.y) * .013;
				const dx = d.x - pointer.x, dy = d.y - pointer.y;
				const distance = Math.hypot(dx, dy) || 1;
				if (distance < 145) {
					const force = (1 - distance / 145) * 3.1;
					d.vx += dx / distance * force;
					d.vy += dy / distance * force;
				}
				d.vx *= .88; d.vy *= .88;
				d.x += d.vx; d.y += d.vy;
				ctx.beginPath();
				ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
				ctx.fillStyle = d.color;
				ctx.globalAlpha = .7;
				ctx.fill();
				ctx.strokeStyle = "#655864";
				ctx.globalAlpha = .55;
				ctx.lineWidth = 1.2;
				ctx.stroke();
			}
		}
		ctx.globalAlpha = 1;
		frameId = requestAnimationFrame(paint);
	}
	function refreshBackground() {
		const active = !!ctx && settings.interactiveBgStyle !== "off" && !settings.reducedMotion &&
			!settings.performanceMode && !reduced.matches && !controls.home.hidden;
		controls.home.classList.toggle("interactive-bg", !!active);
		if (active && !running) {
			running = true;
			resize();
			frameId = requestAnimationFrame(paint);
		} else if (!active && running) {
			running = false;
			cancelAnimationFrame(frameId);
			ctx.clearRect(0, 0, width, height);
			pointer.x = pointer.y = -1000;
		}
	}
	controls.home.addEventListener("pointermove", e => {
		const rect = controls.canvas.getBoundingClientRect();
		pointer.x = e.clientX - rect.left;
		pointer.y = e.clientY - rect.top;
	}, {passive:true});
	controls.home.addEventListener("pointerleave", () => { pointer.x = pointer.y = -1000; });
	window.addEventListener("resize", () => { if (running) resize(); }, {passive:true});
	new MutationObserver(refreshBackground).observe(controls.home, {attributes:true, attributeFilter:["hidden"]});
	if (reduced.addEventListener) reduced.addEventListener("change", refreshBackground);
	else reduced.addListener(refreshBackground);

	function populateSettings() {
		controls.bg.value = settings.interactiveBgStyle;
		controls.cursor.value = options.includes(settings.cursorStyle) ? settings.cursorStyle : "cartoon";
	}
	$("open-settings").addEventListener("click", populateSettings);
	$("s-reset").addEventListener("click", () => {
		controls.bg.value = "dots";
		controls.cursor.value = "cartoon";
	});
	$("settings-form").addEventListener("submit", () => {
		settings.interactiveBgStyle = ["dots", "aurora", "off"].includes(controls.bg.value) ? controls.bg.value : "dots";
		settings.interactiveNewTab = settings.interactiveBgStyle !== "off";
		settings.cursorStyle = options.includes(controls.cursor.value) ? controls.cursor.value : "cartoon";
		save();
		applyCursors();
		refreshBackground();
	});
	populateSettings();
	applyCursors();
	refreshBackground();
})();
