/* Dr. Seuss Search Custom Loader: CORS-permitted HTTPS HTML viewer.
 * No Wisp tunnel, service worker, or arbitrary remote-script execution.
 */
(function () {
  "use strict";
  const LIMIT = 1_500_000;
  const TIMEOUT_MS = 15_000;
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
  // Rebuild responsive image candidates rather than trusting arbitrary srcset
  // entries. Images remain HTTPS-only and same-origin with the viewed page.
  function cleanSrcset(raw, base) {
    return String(raw || "").split(",").slice(0, 12).map(entry => {
      const parts = entry.trim().split(/\s+/);
      if (!parts[0] || parts.length > 2) return "";
      const url = resolved(parts[0], base, true);
      const descriptor = parts[1] || "";
      if (!url || (descriptor &&
          !/^(?:\d+(?:\.\d+)?x|[1-9]\d{0,4}w)$/.test(descriptor))) return "";
      return url + (descriptor ? " " + descriptor : "");
    }).filter(Boolean).join(", ");
  }
  function cleanElement(el, base) {
    const tag = el.localName;
    const lazySrc = tag === "img" ? el.getAttribute("data-src") : null;
    const lazySrcset = tag === "img" ? el.getAttribute("data-srcset") : null;
    if (!TAGS.has(tag)) { el.remove(); return; }
    for (const a of [...el.attributes]) {
      const key = a.name.toLowerCase(), value = a.value;
      if (ATTRS.has(key)) continue;
      if (tag === "a" && key === "href") {
        // Do not retain an actual href: without the controller, links must
        // be inert rather than navigating around the site's access policy.
        const url = resolved(value, base);
        if (url) el.setAttribute("data-dss-href", url);
        el.removeAttribute(a.name);
      } else if (tag === "img" && key === "src") {
        const url = resolved(value, base, true);
        if (url) el.setAttribute("src", url);
        else el.removeAttribute(a.name);
      } else if (tag === "img" && key === "srcset") {
        const safe = cleanSrcset(value, base);
        if (safe) el.setAttribute("srcset", safe);
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
    if (tag === "a") {
      if (el.hasAttribute("data-dss-href")) {
        el.setAttribute("role", "link");
        el.setAttribute("tabindex", "0");
      }
      el.setAttribute("rel", "noopener noreferrer");
    }
    if (tag === "img") {
      // Many modern sites keep image URLs in lazy-loading attributes.
      if (!el.hasAttribute("src")) {
        const src = resolved(lazySrc, base, true);
        if (src) el.setAttribute("src", src);
      }
      if (!el.hasAttribute("srcset")) {
        const srcset = cleanSrcset(lazySrcset, base);
        if (srcset) el.setAttribute("srcset", srcset);
      }
      el.setAttribute("referrerpolicy", "no-referrer");
    }
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
    let styles = '<style>a[data-dss-href]{color:#1456a0;text-decoration:underline;' +
      'cursor:pointer}a[data-dss-href]:focus-visible{outline:2px solid currentColor}</style>';
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
      'var a=e.target&&e.target.closest?e.target.closest("a[data-dss-href]"):null;' +
      'if(!a)return;e.preventDefault();e.stopPropagation();' +
      'parent.postMessage({type:"dss-custom-loader-navigate",' +
      'url:a.getAttribute("data-dss-href"),token:"' + token + '"},"*");},true);' +
      'document.addEventListener("keydown",function(e){if(e.key!=="Enter")return;' +
      'var a=e.target&&e.target.closest?e.target.closest("a[data-dss-href]"):null;' +
      'if(a){e.preventDefault();a.click();}},true);})();';
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
    const controller = new AbortController();
    let timedOut = false;
    const cancel = () => controller.abort();
    if (options.signal?.aborted) controller.abort();
    else options.signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, TIMEOUT_MS);
    try {
      let response;
      try {
        response = await fetch(url.href, {
          mode: "cors", credentials: "omit", redirect: "error",
          referrerPolicy: "no-referrer", signal: controller.signal
        });
      } catch (error) {
        if (error?.name === "AbortError") throw error;
        throw new Error("Could not fetch this page. It may block CORS, redirect, or be offline.");
      }
      if (!response.ok) {
        if (response.status === 429)
          throw new Error("The website is rate-limiting requests (HTTP 429). Try again later.");
        throw new Error("The website returned HTTP " + response.status + ".");
      }
      const mime = (response.headers.get("content-type") || "").toLowerCase();
      if (!mime.includes("text/html") && !mime.includes("application/xhtml+xml"))
        throw new Error("Only HTML documents are supported.");
      if (Number(response.headers.get("content-length") || 0) > LIMIT)
        throw new Error("The HTML document is too large.");

      // Read with a byte cap. response.text() alone could buffer an
      // unbounded response when a server omits Content-Length.
      let html = "";
      if (response.body && typeof response.body.getReader === "function") {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let received = 0;
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            received += chunk.value.byteLength;
            if (received > LIMIT) {
              await reader.cancel();
              throw new Error("The HTML document is too large.");
            }
            html += decoder.decode(chunk.value, { stream: true });
          }
          html += decoder.decode();
        } finally {
          reader.releaseLock();
        }
      } else {
        // Fallback for browsers without streamed fetch responses.
        html = await response.text();
        if (new Blob([html]).size > LIMIT)
          throw new Error("The HTML document is too large.");
      }
      return makeDocument(html, url.href);
    } catch (error) {
      if (options.signal?.aborted)
        throw new DOMException("Navigation canceled.", "AbortError");
      if (timedOut)
        throw new Error("Loading timed out after 15 seconds. Press Reload to retry.");
      throw error;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", cancel);
    }
  }
  window.DSSCustomLoader = Object.freeze({ fetchPage, makeDocument });
})();
