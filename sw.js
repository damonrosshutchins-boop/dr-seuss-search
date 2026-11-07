/* Dr. Seuss Search service worker — routes proxied requests through Scramjet */
importScripts("scram/scramjet.all.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();
const SCRAMJET_PATH = new URL("scramjet/", self.registration.scope).pathname;
const FETCH_PROBE_PATH = SCRAMJET_PATH + "__dss_worker_probe_v2";
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
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));


// A request may reach this worker with missing/stale Scramjet configuration.
// Never fall through to GitHub Pages for an encoded URL: Pages has no
// physical /scramjet/... file and otherwise responds with its own 404.
function unavailableResponse(status = 503) {
  const home = new URL(self.registration.scope).pathname;
  const markup = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<title>Seuss Search — page unavailable</title></head>' +
    '<body style="font:16px system-ui,sans-serif;margin:3rem auto;max-width:35rem;padding:1rem">' +
    '<h1>Seuss Search could not load this page</h1>' +
    '<p>The Scramjet browser worker or network connection is unavailable. ' +
    'Please return to Seuss Search and use its Retry Scramjet control.</p>' +
    '<p><a href="' + home + '">Return to Seuss Search</a></p></body></html>';
  return new Response(markup, {
    status,
    headers: {
      "Content-Type":"text/html; charset=utf-8",
      "Cache-Control":"no-store",
      "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options":"nosniff"
    }
  });
}
// This response must come from the fetch handler, not a postMessage,
// so it verifies actual interception of a URL that GitHub Pages lacks.
async function scramjetFetchProbe() {
  try {
    await ensureScramjetConfig();
    const prefix = scramjet.config && scramjet.config.prefix;
    const example = new URL(
      SCRAMJET_PATH + encodeURIComponent("https://example.org/"),
      self.location.origin).href;
    const working = prefix === SCRAMJET_PATH &&
      !!scramjet.route({ request:new Request(example) });
    return new Response(JSON.stringify({
      ok:working, prefix:prefix || "", expected:SCRAMJET_PATH
    }), {
      status:working ? 200 : 503,
      headers:{
        "Content-Type":"application/json; charset=utf-8",
        "Cache-Control":"no-store",
        "X-DSS-Scramjet-Worker":"active"
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      ok:false,error:String(error?.message || error).slice(0,160)
    }), {
      status:503,
      headers:{
        "Content-Type":"application/json; charset=utf-8",
        "Cache-Control":"no-store",
        "X-DSS-Scramjet-Worker":"active"
      }
    });
  }
}
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
			console.warn("Seuss Search Scramjet request failed:", error);
			return unavailableResponse(502);
		} finally {
			dssPending = Math.max(0, dssPending - 1);
			dssHandled++;
			scheduleDssProgress();
		}
	}
	return unavailableResponse(503);
}

self.addEventListener("fetch", (event) => {
	// Don't intercept the site's own HTML, images, Supabase auth scripts,
	// games catalog or other first-party assets. Native browser networking
	// can fetch/cache them faster than a JS service-worker pass-through.
	const url = new URL(event.request.url);
	if (url.origin !== self.location.origin || !url.pathname.startsWith(SCRAMJET_PATH)) return;
	if (url.pathname === FETCH_PROBE_PATH) {
		event.respondWith(scramjetFetchProbe());
		return;
	}
	event.respondWith(handleRequest(event));
});
