/* Ultraviolet is scoped to /uv/ only, separate from Seuss Scramjet.
   Only requests below __uv$config.prefix are passed to its runtime. */
importScripts("./uv.bundle.js", "./uv.config.js", "./uv.sw.js");
const ultravioletWorker = new UVServiceWorker();
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {
  if (new URL(event.request.url).pathname.startsWith(self.__uv$config.prefix)) {
    event.respondWith(ultravioletWorker.fetch(event));
  }
});
