/* Ultraviolet runtime, isolated under its own /uv/ service-worker scope.
   Paths are derived at runtime for username.github.io/repository-name/ hosting. */
(() => {
  const scriptUrl = typeof document !== "undefined" && document.currentScript
    ? document.currentScript.src : self.location.href;
  const base = new URL("./", scriptUrl).pathname;
  self.__uv$config = {
    prefix: base + "service/",
    bare: base + "bare/",
    encodeUrl: Ultraviolet.codec.xor.encode,
    decodeUrl: Ultraviolet.codec.xor.decode,
    handler: base + "uv.handler.js",
    client: base + "uv.client.js",
    bundle: base + "uv.bundle.js",
    config: base + "uv.config.js",
    sw: base + "uv.sw.js"
  };
})();
