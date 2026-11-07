/* Dr. Seuss Search Custom Loader: CORS-permitted HTTPS HTML viewer.
 * No Wisp tunnel, service worker, or arbitrary remote-script execution.
 */
(function () {
  "use strict";
  const LIMIT = 1_500_000;
  const TIMEOUT_MS = 15_000;
  const MAX_NODES = 15_000;
  const MAX_STYLE_BLOCKS = 8;
  const TAGS = new Set(("a abbr address article aside audio b bdi bdo blockquote br " +
    "caption cite code data dd del details dfn div dl dt em figcaption figure footer " +
    "h1 h2 h3 h4 h5 h6 header hgroup hr i img ins kbd li main mark menu meter nav " +
    "ol p pre progress q s samp section small source span strong sub summary sup " +
    "table tbody td tfoot th thead time tr track u ul var video wbr").split(" "));
  const ATTRS = new Set(("class id title lang dir role aria-label aria-hidden " +
    "aria-labelledby aria-describedby aria-current style").split(" "));
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
      if (url.protocol !== "https:" ||
          url.username || url.password ||
          (sameOrigin && url.origin !== base.origin))
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
    // <picture> is a safe layout wrapper but <source> picture choices may
    // reference other domains. Preserve the already-sanitized fallback <img>.
    if (tag === "picture") { el.replaceWith(...el.childNodes); return; }
    if (tag === "source" && el.parentElement?.localName === "picture") {
      el.remove(); return;
    }
    if (!TAGS.has(tag)) { el.remove(); return; }
    for (const a of [...el.attributes]) {
      const key = a.name.toLowerCase(), value = a.value;
      if (ATTRS.has(key)) continue;
      if (tag === "a" && key === "href") {
        // Do not retain an actual href: without the controller, links must
        // be inert rather than navigating around the site's access policy.
        const rawHref = value.trim();
        if (rawHref.startsWith("#")) {
          el.setAttribute("data-dss-fragment", rawHref.slice(1, 256));
        } else {
          const url = resolved(value, base);
          if (url) el.setAttribute("data-dss-href", url);
        }
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
      } else if (["audio", "video"].includes(tag) && ["src", "poster"].includes(key)) {
        const url = resolved(value, base, true);
        if (url) el.setAttribute(a.name, url);
        else el.removeAttribute(a.name);
      } else if (["source", "track"].includes(tag) && key === "src") {
        const url = resolved(value, base, true);
        if (url) el.setAttribute("src", url);
        else el.removeAttribute(a.name);
      } else if (["audio", "video"].includes(tag) &&
                 ["controls", "playsinline", "muted"].includes(key)) {
        // Explicit playback controls are safe; autoplay is removed.
      } else if (["audio", "video"].includes(tag) &&
                 key === "preload" && ["metadata", "none"].includes(value)) {
        // Avoid eager fetching of large media files.
      } else if (tag === "source" && key === "type" &&
                 /^(audio|video)\/[\w.+-]+$/i.test(value)) {
        // Mime type for explicitly allowed source files.
      } else if (tag === "track" && key === "kind" &&
                 ["subtitles", "captions", "descriptions", "chapters", "metadata"].includes(value)) {
        // Caption metadata has no script execution.
      } else if (tag === "track" && ["srclang", "label"].includes(key) && value.length <= 80) {
        // Human-readable caption label or language.
      } else if (tag === "time" && key === "datetime" && value.length <= 80) {
        // Keep structured publication dates.
      } else if (["img", "video", "audio"].includes(tag) &&
                 ["width", "height"].includes(key) &&
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
      if (el.hasAttribute("data-dss-href") ||
          el.hasAttribute("data-dss-fragment")) {
        el.setAttribute("role", "link");
        el.setAttribute("tabindex", "0");
      }
      el.setAttribute("rel", "noopener noreferrer");
    }
    if (["audio", "video"].includes(tag)) {
      el.setAttribute("controls", "");
      el.setAttribute("preload", "metadata");
      el.setAttribute("referrerpolicy", "no-referrer");
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
    const siteBase = parsed.head.querySelector('base[href]')?.getAttribute("href");
    const permittedBase = siteBase ? resolved(siteBase, base, true) : null;
    const assetBase = permittedBase ? new URL(permittedBase) : base;
    // A few publishers ship essential CSS in the body. Capture it before
    // removing all original <style> nodes; it remains constrained by CSP.
    const bodyCSS = [...parsed.body.querySelectorAll("style")].slice(0, 4)
      .map(el => (el.textContent || "").slice(0, 50_000));
    const nodes = [...parsed.body.querySelectorAll("*")];
    if (nodes.length > MAX_NODES) throw new Error("Page exceeds Custom Loader's HTML complexity limit.");
    for (const el of nodes.reverse()) cleanElement(el, assetBase);
    const articleIsEmpty = !parsed.body.textContent.trim() &&
      !parsed.body.querySelector("img,video,audio,table");
    if (articleIsEmpty) {
      parsed.body.innerHTML = '<main style="max-width:42rem;margin:4rem auto;' +
        'padding:1rem"><h2>This page requires JavaScript</h2><p>Custom Loader ' +
        'does not run website scripts. Try a permitted static article or use ' +
        'the original website directly.</p></main>';
    }
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    const token = [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
    let styles = '<style>body{margin:1rem;font:16px/1.55 system-ui,sans-serif;' +
      'overflow-wrap:break-word}img,video{max-width:100%;height:auto}' +
      'pre{max-width:100%;overflow:auto}table{max-width:100%;overflow-x:auto}' +
      'a[data-dss-href],a[data-dss-fragment]{color:#1456a0;text-decoration:underline;cursor:pointer}' +
      'a[data-dss-href]:focus-visible,a[data-dss-fragment]:focus-visible{outline:2px solid currentColor}</style>';
    for (const link of [...parsed.head.querySelectorAll('link[rel~="stylesheet"]')].slice(0, 8)) {
      const href = resolved(link.getAttribute("href"), assetBase, true);
      if (href) styles += '<link rel="stylesheet" href="' + escapeHTML(href) +
        '" referrerpolicy="no-referrer">';
    }
    for (const style of [...parsed.head.querySelectorAll("style")].slice(0, MAX_STYLE_BLOCKS)) {
      styles += "<style>" + (style.textContent || "").slice(0, 60_000)
        .replace(/<\/style/gi, "/* removed terminator */") + "</style>";
    }
    for (const css of bodyCSS) {
      styles += "<style>" + css.replace(/<\/style/gi, "/* removed terminator */") + "</style>";
    }
    const csp = [
      "default-src 'none'", "object-src 'none'", "frame-src 'none'",
      "form-action 'none'", "base-uri " + base.origin, "connect-src 'none'",
      "script-src 'nonce-" + token + "'",
      "style-src 'unsafe-inline' " + base.origin,
      "img-src " + base.origin + " data:",
      "font-src " + base.origin + " data:",
      "media-src " + base.origin
    ].join("; ");
    const navigatorScript = '(function(){document.addEventListener("click",function(e){' +
      'var a=e.target&&e.target.closest?e.target.closest("a[data-dss-href],a[data-dss-fragment]"):null;' +
      'if(!a)return;e.preventDefault();e.stopPropagation();' +
      'var hash=a.getAttribute("data-dss-fragment");' +
      'if(hash!==null){if(!hash){window.scrollTo(0,0);return;}' +
      'try{var id=decodeURIComponent(hash);var el=document.getElementById(id);' +
      'if(el)el.scrollIntoView({block:"start",behavior:"auto"});}catch(_){ }return;}' +
      'parent.postMessage({type:"dss-custom-loader-navigate",' +
      'url:a.getAttribute("data-dss-href"),token:"' + token + '"},"*");},true);' +
      'document.addEventListener("keydown",function(e){if(e.key!=="Enter")return;' +
      'var a=e.target&&e.target.closest?e.target.closest("a[data-dss-href],a[data-dss-fragment]"):null;' +
      'if(a){e.preventDefault();a.click();}},true);})();';
    const title = (parsed.title || base.hostname).slice(0, 120);
    return {
      token, title,
      html: '<!doctype html><html><head><meta charset="utf-8">' +
        '<meta name="referrer" content="no-referrer">' +
        '<meta http-equiv="Content-Security-Policy" content="' + escapeHTML(csp) + '">' +
        // srcdoc otherwise resolves relative CSS URLs against GitHub Pages.
        // Restrict the base to the visited site's HTTPS origin in CSP.
        '<base href="' + escapeHTML(assetBase.href) + '">' +
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
        const charset = /charset\s*=\s*["']?([\w-]+)/i.exec(mime)?.[1] || "utf-8";
        let decoder;
        try { decoder = new TextDecoder(charset); }
        catch { decoder = new TextDecoder(); }
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
