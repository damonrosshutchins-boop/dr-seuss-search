/* Dr. Seuss Search service worker — routes proxied requests through Scramjet */
importScripts("scram/scramjet.all.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();
const SCRAMJET_PATH = new URL("scramjet/", self.registration.scope).pathname;
// Cache only real console-game HTML and the separately maintained PC VM
// player. The AI-made arcade pages were retired and deleted from the repo.
// Never mirror third-party game hosts, authentication APIs, or proxied sites.
const OFFLINE_GAME_CACHE = "dss-offline-games-pages-v5";
const PREVIOUS_OFFLINE_GAME_CACHE = "dss-offline-games-pages-v4";
const LEGACY_OFFLINE_GAME_CACHE = "dss-offline-games-pages-v3";
const OLDEST_OFFLINE_GAME_CACHE = "dss-offline-games-pages-v2";
const EARLIEST_OFFLINE_GAME_CACHE = "dss-offline-games-pages-v1";
const OFFLINE_GAME_FILES = ["nes-homebrew.html", "console-emulators.html", "dos-arcade.html"];
// Retired homemade mini-games should not remain available via older caches.
const RETIRED_AI_GAME_URLS = ["retro-arcade.html","offline-arcade.html","offline-games.html"]
  .map(name=>new URL(name,self.registration.scope).href);
const OFFLINE_GAME_URLS = OFFLINE_GAME_FILES.map(file =>
  new URL(file, self.registration.scope).href
);
const OFFLINE_GAME_PATHS = new Set(OFFLINE_GAME_URLS.map(url => new URL(url).pathname));

async function prepareOfflineGames() {
  const cache = await caches.open(OFFLINE_GAME_CACHE);
  const previous = await caches.open(PREVIOUS_OFFLINE_GAME_CACHE);
  const legacy = await caches.open(LEGACY_OFFLINE_GAME_CACHE);
  const oldest = await caches.open(OLDEST_OFFLINE_GAME_CACHE);
  const earliest = await caches.open(EARLIEST_OFFLINE_GAME_CACHE);
  const results = [];
  for (const url of OFFLINE_GAME_URLS) {
    const file = new URL(url).pathname.split("/").pop();
    try {
      // Online refresh should use the latest game; don't throw away a saved
      // copy if the network fails while the browser is already offline.
      const response = await fetch(url, {cache:"reload", credentials:"same-origin"});
      if (!response.ok || response.type !== "basic")
        throw new Error("HTTP " + response.status);
      await cache.put(url, response);
      results.push({file,ok:true});
    } catch (err) {
      try {
        const saved = await cache.match(url) || await previous.match(url) || await legacy.match(url) || await oldest.match(url) || await earliest.match(url);
        if (!saved) throw err;
        await cache.put(url, saved.clone());
        results.push({file,ok:true,cached:true});
      } catch {
        results.push({file,ok:false,error:String(err?.message||err).slice(0,120)});
      }
    }
  }
  return results;
}
async function serveOfflineGamePage(request) {
  const cache = await caches.open(OFFLINE_GAME_CACHE);
  const previous = await caches.open(PREVIOUS_OFFLINE_GAME_CACHE);
  const legacy = await caches.open(LEGACY_OFFLINE_GAME_CACHE);
  const oldest = await caches.open(OLDEST_OFFLINE_GAME_CACHE);
  const earliest = await caches.open(EARLIEST_OFFLINE_GAME_CACHE);
  const url = new URL(request.url);
  const canonicalUrl = new URL(url.pathname, url.origin).href;
  const saved = await cache.match(canonicalUrl) || await previous.match(canonicalUrl) || await legacy.match(canonicalUrl) || await oldest.match(canonicalUrl) || await earliest.match(canonicalUrl);
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

// Optional preloaded DOSBox emulation pack. These assets are all committed to
// this same GitHub Pages repository and are downloaded only on user request.
// No third-party ROM repositories, anonymous relays, or other hosts are used.
const DOS_CACHE = "dss-offline-dos-bundles-v1";
const DOS_FILES = [
 "vm/jsdos/js-dos.js","vm/jsdos/js-dos.css",
 "vm/jsdos/emulators/emulators.js","vm/jsdos/emulators/file-explorer.css",
 "vm/jsdos/emulators/file-explorer.js","vm/jsdos/emulators/fileexplorer_actions.woff",
 "vm/jsdos/emulators/fileexplorer_sprites.png","vm/jsdos/emulators/wdosbox.js",
 "vm/jsdos/emulators/wdosbox.wasm","vm/jsdos/emulators/webrtcnet.mjs",
 "vm/jsdos/emulators/webrtcnet.wasm","vm/jsdos/emulators/wlibzip.js",
 "vm/jsdos/emulators/wlibzip.wasm",
 "vm/games/digger.jsdos","vm/games/doom.jsdos","vm/games/heretic.jsdos",
 "vm/games/quake.jsdos","vm/games/tyrian.jsdos"
];
const DOS_URLS = DOS_FILES.map(file=>new URL(file,self.registration.scope).href);
const DOS_PATHS = new Set(DOS_URLS.map(url=>new URL(url).pathname));
async function prepareOfflineDos(port) {
 const cache=await caches.open(DOS_CACHE);
 const failed=[];
 for(let i=0;i<DOS_URLS.length;i++){
  const url=DOS_URLS[i],file=DOS_FILES[i];
  try{
   const cached=await cache.match(url);
   if(!cached){
    const response=await fetch(url,{credentials:"same-origin",cache:"reload"});
    if(!response.ok||response.type!=="basic")throw Error("HTTP "+response.status);
    await cache.put(url,response);
   }
  }catch(error){failed.push({file,error:String(error?.message||error).slice(0,100)})}
  try{port.postMessage({type:"progress",completed:i+1,total:DOS_URLS.length,file})}catch{}
 }
 return failed;
}
async function serveCachedDos(request) {
 const url=new URL(request.url),canonical=new URL(url.pathname,url.origin).href;
 const cache=await caches.open(DOS_CACHE);
 const response=await cache.match(canonical);
 if(response)return response;
 return fetch(request);
}
self.addEventListener("message",event=>{
 if(event.data?.type!=="dss-install-offline-dos")return;
 const port=event.ports?.[0];
 if(!port||!event.source?.url)return;
 try{
  const source=new URL(event.source.url),scope=new URL(self.registration.scope);
  if(source.origin!==scope.origin||!source.pathname.startsWith(scope.pathname))return;
 }catch{return}
 event.waitUntil((async()=>{
  try{
   const failed=await prepareOfflineDos(port);
   port.postMessage({type:"done",ok:failed.length===0,failed});
  }catch(error){
   port.postMessage({type:"done",ok:false,error:String(error?.message||error)});
  }
 })());
});


// Optional offline cache for official EmulatorJS cores and a small, fixed list
// of license-compatible homebrew cartridge files. No full ROM mirrors and no
// general-purpose cross-origin proxying.
const CONSOLE_CACHE = "dss-console-homebrew-v2";
const CONSOLE_CDN = "https://cdn.emulatorjs.org/stable/data/";
const CONSOLE_CORE_VARIANTS = ["fceumm","mupen64plus_next","pcsx_rearmed"];
const CONSOLE_CORE_SUFFIXES = ["wasm","legacy-wasm","thread-wasm","thread-legacy-wasm"];
const CONSOLE_DATA_ASSETS = [
  "emulator.min.js","emulator.min.css","cores/cores.json",
  ...CONSOLE_CORE_VARIANTS.flatMap(name=>
    CONSOLE_CORE_SUFFIXES.map(suffix=>"cores/"+name+"-"+suffix+".data"))
].map(file=>CONSOLE_CDN+file);
const CONSOLE_GAMES = [
  "https://raw.githubusercontent.com/Mylittlestories/recalbox-os-web/35252504279bdc946156b1a002ce0de9f8b9d01b/www/roms/2048.nes",
  "https://raw.githubusercontent.com/Mylittlestories/recalbox-os-web/35252504279bdc946156b1a002ce0de9f8b9d01b/www/roms/kumi-daiko.n64",
  "https://raw.githubusercontent.com/Mylittlestories/recalbox-os-web/35252504279bdc946156b1a002ce0de9f8b9d01b/www/roms/psxtest.exe",
  "https://raw.githubusercontent.com/Mylittlestories/recalbox-os-web/35252504279bdc946156b1a002ce0de9f8b9d01b/www/roms/nova-the-squirrel.nes",
  "https://raw.githubusercontent.com/Mylittlestories/recalbox-os-web/35252504279bdc946156b1a002ce0de9f8b9d01b/www/roms/alter-ego.nes",
  "https://raw.githubusercontent.com/Mylittlestories/recalbox-os-web/35252504279bdc946156b1a002ce0de9f8b9d01b/www/roms/spacegulls.nes"
];
// The small official GPLv3 loader is now hosted locally, to avoid an
// unnecessary third-party script request during console startup.
const CONSOLE_LOCAL_LOADER = new URL("emujs-loader.js",self.registration.scope).href;
const CONSOLE_URLS = [CONSOLE_LOCAL_LOADER, ...CONSOLE_DATA_ASSETS, ...CONSOLE_GAMES];
const CONSOLE_URL_SET = new Set(CONSOLE_URLS);
async function cacheConsoleAssets(port) {
 const store=await caches.open(CONSOLE_CACHE),failures=[];
 let completed=0;
 for(const url of CONSOLE_URLS) {
  try {
    if(!await store.match(url)) {
      const response=await fetch(url,{
        credentials:"omit",mode:"cors",redirect:"follow",cache:"no-store"
      });
      if(!response.ok||response.type==="opaque")
        throw new Error("File did not allow cross-origin loading (HTTP "+response.status+")");
      await store.put(url,response);
    }
  }catch(error){failures.push({file:url.split("/").pop(),message:String(error?.message||error).slice(0,110)})}
  completed++;
  try{port.postMessage({type:"progress",done:completed,total:CONSOLE_URLS.length,failures:failures.length})}catch{}
 }
 return failures;
}
async function serveConsoleAsset(request) {
 const store=await caches.open(CONSOLE_CACHE);
 const cached=await store.match(request.url);
 if(cached)return cached;
 const response=await fetch(request);
 if(response.ok&&response.type!=="opaque") {
  try{await store.put(request.url,response.clone())}catch{}
 }
 return response;
}
self.addEventListener("message",event=>{
 if(event.data?.type!=="dss-install-console-homebrew")return;
 const port=event.ports?.[0];
 if(!port||!event.source?.url)return;
 try{
   const source=new URL(event.source.url),scope=new URL(self.registration.scope);
   if(source.origin!==scope.origin||!source.pathname.startsWith(scope.pathname))return;
 }catch{return}
 event.waitUntil((async()=>{
  try{
   const failures=await cacheConsoleAssets(port);
   port.postMessage({type:"done",ok:failures.length===0,failures,total:CONSOLE_URLS.length});
  }catch(error){port.postMessage({type:"done",ok:false,error:String(error?.message||error).slice(0,150)})}
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
self.addEventListener("activate", event => event.waitUntil((async()=>{
  // Remove only the three retired AI arcade HTML pages; preserve saved
  // legitimate NES and VM game resources and unrelated browser caches.
  const oldCaches = [OFFLINE_GAME_CACHE,PREVIOUS_OFFLINE_GAME_CACHE,
    LEGACY_OFFLINE_GAME_CACHE,OLDEST_OFFLINE_GAME_CACHE,EARLIEST_OFFLINE_GAME_CACHE];
  for(const name of oldCaches){
    try{
      const cache=await caches.open(name);
      if(typeof cache.delete!=="function")continue;
      for(const url of RETIRED_AI_GAME_URLS)await cache.delete(url);
    }catch{}
  }
  await self.clients.claim();
})()));

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
  // A closed allowlist, not a general relay: cache only official emulator
  // runtime files and the three identified free homebrew/test programs.
  if(event.request.method==="GET"&&CONSOLE_URL_SET.has(event.request.url)) {
    event.respondWith(serveConsoleAsset(event.request));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (event.request.method === "GET" && OFFLINE_GAME_PATHS.has(url.pathname)) {
    event.respondWith(serveOfflineGamePage(event.request));
    return;
  }
  if (event.request.method === "GET" && DOS_PATHS.has(url.pathname)) {
    event.respondWith(serveCachedDos(event.request));
    return;
  }
	if (!url.pathname.startsWith(SCRAMJET_PATH)) return;
	event.respondWith(handleRequest(event));
});
