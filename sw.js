/* Dr. Seuss Search service worker — routes proxied requests through Scramjet */
importScripts("scram/scramjet.all.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

/*
 * Conservative first-party ad and tracker filter for Scramjet-encoded requests.
 * Only requests routed through our own /scramjet/ prefix are inspected.
 * External lists are not loaded and normal site assets are never intercepted.
 */
const BLOCKED_DOMAINS = [
	"doubleclick.net", "googlesyndication.com", "googleadservices.com",
	"google-analytics.com", "adnxs.com", "adsrvr.org",
	"criteo.com", "criteo.net", "taboola.com", "outbrain.com",
	"pubmatic.com", "rubiconproject.com", "openx.net",
	"bidswitch.net", "smartadserver.com", "casalemedia.com",
	"adform.net", "quantserve.com", "scorecardresearch.com",
	"moatads.com", "amazon-adsystem.com", "adsafeprotected.com"
];
const AD_BLOCK_CACHE = "dss-adblock-settings-v1";
const AD_BLOCK_KEY = new URL("__dss_adblock_setting__", self.registration.scope).href;
let adBlockEnabled = null;

async function isAdBlockEnabled() {
	if (typeof adBlockEnabled === "boolean") return adBlockEnabled;
	try {
		const cache = await caches.open(AD_BLOCK_CACHE);
		const result = await cache.match(AD_BLOCK_KEY);
		adBlockEnabled = result ? (await result.text()) === "true" : true;
	} catch {
		adBlockEnabled = true;
	}
	return adBlockEnabled;
}

self.addEventListener("message", (event) => {
	if (!event.data || event.data.type !== "dss-adblock-setting" || typeof event.data.enabled !== "boolean") return;
	// Only the normal site page may change the preference, not a proxied page.
	if (!event.source || !event.source.url || new URL(event.source.url).pathname !== new URL(self.registration.scope).pathname) return;
	const desired = event.data.enabled;
	const update = (async () => {
		const cache = await caches.open(AD_BLOCK_CACHE);
		await cache.put(AD_BLOCK_KEY, new Response(String(desired)));
		adBlockEnabled = desired;
		if (event.ports && event.ports[0]) event.ports[0].postMessage({ok:true,enabled:desired});
	})().catch(() => {
		adBlockEnabled = desired;
		if (event.ports && event.ports[0]) event.ports[0].postMessage({ok:false});
	});
	event.waitUntil(update);
});

function blockedScramjetResource(request) {
	// Never block top-level destinations selected by a user.
	if (request.mode === "navigate") return false;
	const prefix = scramjet.config && scramjet.config.prefix;
	if (!prefix) return false;
	const parsed = new URL(request.url);
	if (parsed.origin !== self.location.origin || !parsed.pathname.startsWith(prefix)) return false;
	// This site's Scramjet build uses encodeURIComponent for the original URL.
	let target;
	try {
		target = new URL(decodeURIComponent(parsed.pathname.slice(prefix.length)));
	} catch { return false; }
	if (!["http:", "https:"].includes(target.protocol)) return false;
	const hostname = target.hostname.toLowerCase();
	return BLOCKED_DOMAINS.some(domain => hostname === domain || hostname.endsWith("." + domain));
}


self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

async function handleRequest(event) {
	await scramjet.loadConfig();
	if (scramjet.route(event)) {
		if (await isAdBlockEnabled() && blockedScramjetResource(event.request)) {
			return new Response(null, { status: 204, statusText: "No Content" });
		}
		return scramjet.fetch(event);
	}
	return fetch(event.request);
}

self.addEventListener("fetch", (event) => {
	event.respondWith(handleRequest(event));
});
