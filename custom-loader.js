/* Dr. Seuss Search Custom Loader: CORS-permitted HTTPS HTML viewer.
 * No Wisp tunnel, service worker, or arbitrary remote-script execution.
 */
(function () {
  "use strict";
  const LIMIT = 1_500_000;
  const MAX_NODES = 15_000;
  const TAGS = new Set(("a abbr article aside b blockquote br caption code dd details " +
    "div dl dt em figcaption figure footer h1 h2 h3 h4 h5 h6 header hr i " +
    "img kbd li main mark nav ol p pre q s samp section small span strong " +
    "sub summary sup table tbody td tfoot th thead time tr u ul var").split(" "));
  const ATTRS = new Set(("class id title lang dir role aria-label aria-hidden style").split(" "));
  const escapeHTML = value => String(value).replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  function normalize(raw) {
    const url = new URL(String(raw));
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password)
      throw new Error("Custom Loader supports HTTPS pages without embedded credentials.");
    return url;
  }
  function resolved(raw, base, sameOrigin = false) {
    if (!raw) return null;
    try {
      const url = new URL(raw, base);
      if (!["https:", "http:"].includes(url.protocol) ||
          url.username || url.password ||
          (sameOrigin && (url.origin !== base.origin || url.protocol !== "https:")))
        return null;
      return url.href;
    } catch { return null; }
  }
  function cleanElement(el, base) {
    const tag = el.localName;
    if (!TAGS.has(tag)) { el.remove(); return; }
    for (const a of [...el.attributes]) {
      const key = a.name.toLowerCase(), value = a.value;
      if (ATTRS.has(key)) continue;
      if (tag === "a" && key === "href") {
        const url = resolved(value, base);
        if (url) el.setAttribute("href", url);
        else el.removeAttribute(a.name);
      } else if (tag === "img" && key === "src") {
        const url = resolved(value, base, true);
        if (url) el.setAttribute("src", url);
        else el.removeAttribute(a.name);
      } else if (tag === "img" && ["alt", "loading"].includes(key)) {
        // Readable descriptions are preserved.
      } else if (tag === "img" && ["width", "height"].includes(key) &&
                 /^\d{1,4}$/.test(value)) {
        // Constrained dimensions are safe.
      } else if (["td", "th"].includes(tag) &&
                 ["rowspan", "colspan"].includes(key) &&
                 /^\d{1,2}$/.test(value)) {
        // Constrained table layout is safe.
      } else {
        el.removeAttribute(a.name);
      }
    }
    if (tag === "a") el.setAttribute("rel", "noopener noreferrer");
    if (tag === "img") el.setAttribute("referrerpolicy", "no-referrer");
  }
  function makeDocument(html, rawUrl) {
    const base = normalize(rawUrl);
    const parsed = new DOMParser().parseFromString(html, "text/html");
    if (!parsed.body || !parsed.head) throw new Error("No HTML document body.");
    const nodes = [...parsed.body.querySelectorAll("*")];
    if (nodes.length > MAX_NODES) throw new Error("Page exceeds Custom Loader's HTML complexity limit.");
    for (const el of nodes.reverse()) cleanElement(el, base);
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    const token = [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
    let styles = "";
    for (const link of [...parsed.head.querySelectorAll('link[rel~="stylesheet"]')].slice(0, 8)) {
      const href = resolved(link.getAttribute("href"), base, true);
      if (href) styles += '<link rel="stylesheet" href="' + escapeHTML(href) +
        '" referrerpolicy="no-referrer">';
    }
    for (const style of [...parsed.head.querySelectorAll("style")].slice(0, 6)) {
      styles += "<style>" + (style.textContent || "").slice(0, 60_000)
        .replace(/<\/style/gi, "/* removed terminator */") + "</style>";
    }
    const csp = [
      "default-src 'none'", "object-src 'none'", "frame-src 'none'",
      "form-action 'none'", "base-uri 'none'", "connect-src 'none'",
      "script-src 'nonce-" + token + "'",
      "style-src 'unsafe-inline' " + base.origin,
      "img-src " + base.origin + " data:",
      "font-src " + base.origin + " data:",
      "media-src " + base.origin
    ].join("; ");
    const navigatorScript = '(function(){document.addEventListener("click",function(e){' +
      'var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;' +
      'if(!a)return;e.preventDefault();e.stopPropagation();' +
      'parent.postMessage({type:"dss-custom-loader-navigate",url:a.href,' +
      'token:"' + token + '"},"*");},true);})();';
    const title = (parsed.title || base.hostname).slice(0, 120);
    return {
      token, title,
      html: '<!doctype html><html><head><meta charset="utf-8">' +
        '<meta name="referrer" content="no-referrer">' +
        '<meta http-equiv="Content-Security-Policy" content="' + escapeHTML(csp) + '">' +
        '<title>' + escapeHTML(title) + '</title>' + styles +
        '<script nonce="' + token + '">' + navigatorScript + '<\/script>' +
        '</head><body>' + parsed.body.innerHTML + '</body></html>'
    };
  }
  async function fetchPage(raw, options = {}) {
    const url = normalize(raw);
    let response;
    try {
      response = await fetch(url.href, {
        mode: "cors", credentials: "omit", redirect: "error",
        referrerPolicy: "no-referrer", signal: options.signal
      });
    } catch (e) {
      if (e?.name === "AbortError") throw e;
      throw new Error("Fetch failed. The site may reject CORS, redirect, or be unavailable.");
    }
    if (!response.ok) throw new Error("The website returned HTTP " + response.status + ".");
    const mime = (response.headers.get("content-type") || "").toLowerCase();
    if (!mime.includes("text/html") && !mime.includes("application/xhtml+xml"))
      throw new Error("Only HTML documents are supported.");
    if (Number(response.headers.get("content-length") || 0) > LIMIT)
      throw new Error("The HTML document is too large.");
    const html = await response.text();
    if (html.length > LIMIT) throw new Error("The HTML document is too large.");
    return makeDocument(html, url.href);
  }
  window.DSSCustomLoader = Object.freeze({ fetchPage, makeDocument });
})();
