/* Dr. Seuss Search service worker — routes proxied requests through Scramjet */
importScripts("scram/scramjet.all.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();
const SCRAMJET_PATH = new URL("scramjet/", self.registration.scope).pathname;
// Cache ONLY the two first-party, self-contained offline game pages.
// Never try to mirror third-party game hosts, authentication APIs, or
// Scramjet-encoded websites.
const OFFLINE_GAME_CACHE = "dss-offline-games-pages-v1";
const OFFLINE_GAME_FILES = ["offline-arcade.html", "offline-pack.html"];
const OFFLINE_GAME_URLS = OFFLINE_GAME_FILES.map(file =>
  new URL(file, self.registration.scope).href
);
const OFFLINE_GAME_PATHS = new Set(OFFLINE_GAME_URLS.map(url => new URL(url).pathname));

async function prepareOfflineGames() {
  const cache = await caches.open(OFFLINE_GAME_CACHE);
  const results = [];
  for (const url of OFFLINE_GAME_URLS) {
    try {
      const response = await fetch(url, {cache:"reload", credentials:"same-origin"});
      if (!response.ok || response.type !== "basic")
        throw new Error("HTTP " + response.status);
      await cache.put(url, response);
      results.push({file:new URL(url).pathname.split("/").pop(),ok:true});
    } catch (err) {
      results.push({file:new URL(url).pathname.split("/").pop(),ok:false,
        error:String(err?.message||err).slice(0,120)});
    }
  }
  return results;
}
async function serveOfflineGamePage(request) {
  const cache = await caches.open(OFFLINE_GAME_CACHE);
  const url = new URL(request.url);
  const canonicalUrl = new URL(url.pathname, url.origin).href;
  const saved = await cache.match(canonicalUrl);
  if (saved) return saved;
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic")
      await cache.put(canonicalUrl, response.clone());
    return response;
  } catch {
    return new Response("This game page was not saved while online. Reconnect and select Enable offline access in Games.", {
      status: 503, headers: {"Content-Type":"text/plain; charset=utf-8"}
    });
  }
}
self.addEventListener("message", event => {
  if (event.data?.type !== "dss-install-offline-games") return;
  const port = event.ports?.[0];
  if (!port || !event.source?.url) return;
  try {
    const source = new URL(event.source.url);
    const scope = new URL(self.registration.scope);
    if (source.origin !== scope.origin || !source.pathname.startsWith(scope.pathname)) return;
  } catch { return; }
  event.waitUntil((async () => {
    try {
      const files = await prepareOfflineGames();
      port.postMessage({ok:files.every(item=>item.ok),files});
    } catch (error) {
      port.postMessage({ok:false,error:String(error?.message||error).slice(0,140)});
    }
  })());
});
// One configuration read per service-worker lifetime, not per image, CSS,
// script and other resource request. If it fails, allow a clean retry.
let scramjetConfigReady = null;
function ensureScramjetConfig() {
	if (!scramjetConfigReady) {
		scramjetConfigReady = Promise.resolve().then(() => scramjet.loadConfig())
			.catch(error => { scramjetConfigReady = null; throw error; });
	}
	return scramjetConfigReady;
}

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


// The browser does not disclose TCP/WebSocket packet totals or future
// resources. These are honest counts of Scramjet requests awaiting a response.
let dssPending = 0, dssHandled = 0, dssFailed = 0, dssBroadcastTimer = null;
function scheduleDssProgress() {
  if (dssBroadcastTimer !== null) return;
  dssBroadcastTimer = setTimeout(async () => {
    dssBroadcastTimer = null;
    try {
      const rootPath = new URL(self.registration.scope).pathname;
      const windows = await self.clients.matchAll({ type:"window", includeUncontrolled:true });
      const payload = {
        type:"dss-proxy-request-progress",
        pending:dssPending, handled:dssHandled, failed:dssFailed
      };
      for (const client of windows) {
        try {
          if (new URL(client.url).pathname === rootPath) client.postMessage(payload);
        } catch {}
      }
    } catch {}
  }, 360);
}
// Confirm that this worker is actually in charge of the encoded game URL
// BEFORE navigation. Without an active controller GitHub Pages itself sees
// /dr-seuss-search/scramjet/... as a nonexistent file and returns HTTP 404.
self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "dss-scramjet-route-check") return;
  const reply = event.ports && event.ports[0];
  if (!reply) return;
  const check = (async () => {
    try {
      await ensureScramjetConfig();
      const prefix = scramjet.config && scramjet.config.prefix;
      const testUrl = new URL(
        SCRAMJET_PATH + encodeURIComponent("https://example.org/"),
        self.location.origin
      ).href;
      const matches = prefix === SCRAMJET_PATH &&
        scramjet.route({ request: new Request(testUrl) });
      reply.postMessage({ ok:matches, prefix:prefix || "", expected:SCRAMJET_PATH });
    } catch (err) {
      reply.postMessage({ ok:false, error:err && err.message || "Config unavailable" });
    }
  })();
  event.waitUntil(check);
});
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    // Network failure must not block Scramjet's worker from installing.
    try { await prepareOfflineGames(); } catch {}
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

async function handleRequest(event) {
	await ensureScramjetConfig();
	if (scramjet.route(event)) {
		dssPending++;
		scheduleDssProgress();
		try {
			if (await isAdBlockEnabled() && blockedScramjetResource(event.request)) {
				return new Response(null, { status: 204, statusText: "No Content" });
			}
			return await scramjet.fetch(event);
		} catch (error) {
			dssFailed++;
			throw error;
		} finally {
			dssPending = Math.max(0, dssPending - 1);
			dssHandled++;
			scheduleDssProgress();
		}
	}
	return fetch(event.request);
}

self.addEventListener("fetch", (event) => {
	// Don't intercept the site's own HTML, images, Supabase auth scripts,
	// games catalog or other first-party assets. Native browser networking
	// can fetch/cache them faster than a JS service-worker pass-through.
	const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.method === "GET" && OFFLINE_GAME_PATHS.has(url.pathname)) {
    event.respondWith(serveOfflineGamePage(event.request));
    return;
  }
	if (!url.pathname.startsWith(SCRAMJET_PATH)) return;
	event.respondWith(handleRequest(event));
});
