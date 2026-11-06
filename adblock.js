"use strict";
/* Dr. Seuss Search — built-in light ad and tracker blocker. */
(() => {
	const toggle = document.getElementById("s-adblock");
	const settingsDialog = document.getElementById("settings");
	const frameHost = document.getElementById("frame-host");
	if (!toggle || !settingsDialog) return;
	if (typeof settings.adBlock !== "boolean") settings.adBlock = true;

	const COSMETIC_CSS = [
		"ins.adsbygoogle", "[data-ad-slot]", "[id^='google_ads_iframe_']",
		"[id^='div-gpt-ad']", "iframe[src*='doubleclick.net']",
		"[class~='ad-banner']", "[class~='ad-placeholder']",
		"[class~='adsbygoogle']"
	].join(",") + "{display:none!important;visibility:hidden!important;}";

	function updateDocument(doc) {
		try {
			if (!doc || !doc.documentElement) return;
			let style = doc.getElementById("dss-adblock-cosmetic");
			if (!settings.adBlock) {
				if (style) style.remove();
				return;
			}
			if (!style) {
				style = doc.createElement("style");
				style.id = "dss-adblock-cosmetic";
				(doc.head || doc.documentElement).appendChild(style);
			}
			style.textContent = COSMETIC_CSS;
		} catch {
			// Cross-origin pages or sandboxed iframes may disallow cosmetic styling.
		}
	}
	function updateFrames() {
		if (!frameHost) return;
		for (const frame of frameHost.querySelectorAll('iframe[id^="sj-frame-"]')) {
			try { updateDocument(frame.contentDocument); } catch {}
		}
	}
	const seen = new WeakSet();
	function watchFrames() {
		if (!frameHost) return;
		for (const frame of frameHost.querySelectorAll('iframe[id^="sj-frame-"]')) {
			if (!seen.has(frame)) {
				seen.add(frame);
				frame.addEventListener("load", () => updateDocument(frame.contentDocument));
			}
			updateDocument(frame.contentDocument);
		}
	}
	if (frameHost) {
		new MutationObserver(watchFrames).observe(frameHost, {childList:true,subtree:true});
		watchFrames();
	}

	async function syncWorker() {
		if (!("serviceWorker" in navigator)) return;
		try {
			const reg = await navigator.serviceWorker.ready;
			if (reg.active) reg.active.postMessage({
				type:"dss-adblock-setting",
				enabled:settings.adBlock
			});
		} catch {
			// The proxy might not have installed its worker yet.
		}
	}
	function syncSettings() {
		toggle.checked = !!settings.adBlock;
	}
	document.getElementById("open-settings").addEventListener("click",syncSettings);
	document.getElementById("engine-label").addEventListener("click",syncSettings);
	document.getElementById("s-reset").addEventListener("click",()=>{toggle.checked = true;});
	document.getElementById("settings-form").addEventListener("submit",()=>{
		settings.adBlock = toggle.checked;
		save();
		updateFrames();
		syncWorker();
	});
	syncSettings();
	syncWorker();
})();