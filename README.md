# Dr. Seuss Search

A whimsical, fully static web proxy built on [Scramjet](https://github.com/MercuryWorkshop/scramjet) by Mercury Workshop. It runs entirely in your browser and is hosted on GitHub Pages.

**Live site:** https://damonrosshutchins-boop.github.io/dr-seuss-search/

## How it works

- **Scramjet 1.1.0** (the latest stable release) rewrites and sandboxes pages inside a service worker (`sw.js`).
- **bare-mux** routes the worker's traffic to a transport (**libcurl** by default, **epoxy** optional).
- The transport tunnels requests through a **Wisp** WebSocket relay. GitHub Pages can only serve static files, so the site uses the public relay `wss://wisp.mercurywork.shop/` by default. You can change it in **Settings**.

## Features

- Search or enter a URL (Brave by default; Bing, Google, and DuckDuckGo are also available)
- Browser bar with back, forward, reload, home, an editable address bar, and fullscreen
- Quick-link tiles
- Settings: search engine, transport, Wisp server, and an about:blank cloak
- Live Wisp relay health indicator
- **Built-in VM ("The Thing-a-ma-VM")**: a full x86 virtual machine that runs in your browser using [v86](https://github.com/copy/v86) (WebAssembly)
  - Bundled systems: Buildroot Linux, Linux 4 (live CD), KolibriOS, FreeDOS
  - Boot your own `.iso` or `.img` file from your device (ISO = CD, small images = floppy, larger images = hard disk)
  - Memory picker, Ctrl+Alt+Del, mouse lock, pause/resume, restart, power off, screenshot, fullscreen
- **Game Arcade**: a DOSBox gaming VM powered by [js-dos](https://js-dos.com) with Sound Blaster 16 audio and max CPU cycles
  - Bundled: DOOM, Heretic and Quake (shareware episodes), Tyrian 2000 (freeware), Digger
  - Play your own DOS game from a `.jsdos` or `.zip` bundle
- **Better fullscreen** for both VMs: the whole VM goes fullscreen with an auto-hiding floating toolbar, keyboard lock in Chromium browsers (hold Esc to exit) so game keys are not stolen by the browser, and a soft-fullscreen fallback on iPhone/iPad
- **Scaling modes**: Fit (smooth), Pixel (crisp integer scaling) and Stretch
- **Games section** on the home page with links to GeForce NOW and now.gg (these open directly in a new tab, since cloud-gaming streams use WebRTC and cannot run through the proxy)

## Self-hosting a Wisp relay (recommended)

Public relays are shared by many people, so search engines often show captchas. Running your own relay fixes that. For example, use [wisp-server-node](https://github.com/MercuryWorkshop/wisp-server-node) or [wisp-js](https://github.com/MercuryWorkshop/wisp-js) on any VPS, Render, Fly.io, or similar host. Then paste its `wss://.../` address into Settings.

## Run locally

```sh
python3 -m http.server 8080
# open http://localhost:8080
```

## Updating Scramjet

The files in `scram/`, `baremux/`, `libcurl/`, and `epoxy/` are copied from the npm packages `@mercuryworkshop/scramjet@1.1.0`, `@mercuryworkshop/bare-mux@2.1.9`, `@mercuryworkshop/libcurl-transport@1.5.2`, and `@mercuryworkshop/epoxy-transport@2.1.29`.

## VM files

`vm/libv86.js` and `vm/v86.wasm` come from the `v86@0.5.473` npm package (BSD-2-Clause; see `vm/LICENSE-v86`). The BIOS files (SeaBIOS, VGABIOS) are from the v86 repo. The OS images in `vm/images/` are free/open-source images published by the v86 project at copy.sh.

## Arcade files

`vm/jsdos/` is js-dos 8.5.3 (GPL-2.0), wrapped in a function so its globals do not clash with the page. The game bundles in `vm/games/` were built from the official shareware releases of DOOM 1.9, Heretic 1.2 and Quake 1.06 (id Software and Raven allow these to be freely distributed), the Tyrian 2000 freeware release, and the js-dos Digger sample bundle.

## License

AGPL-3.0, the same license as Scramjet. "Dr. Seuss Search" is a fan-made name and is not affiliated with Dr. Seuss Enterprises.


## Websites that refuse to connect
The lightweight Seuss Browser is a normal sandboxed iframe. Sites such as Reddit can prohibit iframe embedding with CSP or X-Frame-Options; the error does not mean the site is down. Common frame-blocking hosts are now routed to the existing Scramjet option, and other direct-browser pages offer **Try with Scramjet**. Search pages use Scramjet when in-site search is enabled. Scramjet requires its service worker and Wisp connection; if either fails, an in-site explanation and an external link are offered. This does not guarantee that every site or network will allow loading.


## Choosing a Wisp relay
In Settings, choose a preset Wisp relay or enter a custom secure `wss://` URL.
The selector includes `anura.pro`, `wisp.mercurywork.shop`,
`motor-cycle-part.org`, `mages.io`, `lichology.com`,
`definitelyscience.com`, and `wisp.terbiumon.top`.
Use **Test selected relay** to check a WebSocket Wisp handshake before saving.
If the selected relay fails, Scramjet tries `wss://mages.io/wisp/` as a backup.
The backup is distinct from the existing `wss://mages.io/` preset and can also
be selected manually. The user's preferred relay is kept in browser settings;
the backup is a runtime fallback, not a permanent change. If neither responds,
the site shows a connection error rather than claiming the proxy works.
These candidate endpoints are not guaranteed to be available. A Wisp handshake
does not establish that every destination website will load. The code does not
automatically cycle through all seven presets.


## Troubleshooting website connections
GUST fetches pages with libcurl directly, while this site uses Scramjet's
service-worker routing and BareMux transport. The two are not interchangeable.
Seuss Search now configures its transport without first blocking all navigation
on a separate, short Wisp handshake probe. The selected relay can therefore
start a real request even if its independent diagnostic WebSocket is slow.
The selected and backup relays are still available through Test Wisp, and the
home-page diagnostics work when Seuss Browser is the default.

**Test Wisp** checks for a valid protocol handshake; **Retry Scramjet** checks
service-worker initialization and transport configuration. Neither proves that
a particular destination site can load. Ordinary website security rules and
network policies still apply; some websites will not function in this view.

## GUST experimental browsing engine (admins only)

The site now offers **GUST (experimental · site admins only)** in Settings →
Browsing engine. The option is revealed only when the currently signed-in site
account passes the existing **server-side** `site_check_admin` verification.
The site checks again before saving the option and launching the browser.

The modified AGPL-3.0 GUST interface is served at `gust/site.svg` and opens
within an **origin-sandboxed internal Seuss Search tab**. GUST is separate from
Scramjet and does not require its service worker. The user's selected Wisp
relay is passed to the embedded engine for startup, while GUST retains its
own in-frame browser controls. Browsing requests, redirects, WebSockets and
streaming endpoints are checked through the parent site's server-backed
domain policy. When opened without that authorized parent, the adapted
GUST code fails closed instead of fetching arbitrary destinations.

Original project: [nautilus-os/GUST](https://github.com/nautilus-os/GUST),
distributed under the GNU Affero General Public License v3.0. See
[`gust/NOTICE.md`](gust/NOTICE.md) for source attribution and modifications;
the root `LICENSE` includes the AGPL-3.0 text. GUST's original external
dependency scripts are still fetched from CDNs; the connection may fail if
these or the selected relay are unavailable. The built-in browser sandbox may
also restrict a few features. Admin-only visibility does not make
GitHub Pages assets private, so the vendored engine independently requires
authorization from the parent page before making web requests.


## Seuss Browser search 404 repair

Lightweight **Seuss Browser** now always shows its native results for plain
search terms, instead of automatically routing provider search URLs into
Scramjet's service-worker namespace (which could generate a GitHub Pages 404).
It also shows an explanation for known iframe-blocking hosts rather than
silently retrying through the proxy. The old embed-search preference is
retained in a hidden field for compatibility with saved browser settings.

Search results now include Wikipedia and optional specialized sections for
Open Library books and Stack Overflow programming Q&A, using public JSON APIs
after the existing domain-policy checks. Individual sources can fail without
breaking the whole page. Brave/Google/Bing/DuckDuckGo remain external browser
links for genuine full-web results. These changes do not override network
restrictions, make all sites embeddable, or modify the separately selected
Scramjet and admin-only GUST engines.


## Proxy and full-web search builds

**Settings → Proxy and search build** groups the two real browsing builds first:
- **Scramjet** — the service-worker-based browser and configured BareMux/Wisp transport.
- **GUST** — an independent browser with its own libcurl HTTP session,
  available only to users verified as Seuss Search site administrators.

New accounts default to Scramjet; existing saved preferences are retained.
Typing an ordinary search into Seuss Search uses the configured search-provider
URL and opens that result in the **selected** build. Typing a direct HTTP(S)
website address opens that address with the same build. The search bar inside
the GUST browser has its own engine selection; the outer Seuss Search input
continues to use its own search-engine preference.

The GUST child now signals readiness only after the HTTPSession has been
initialized; before this change, the enclosing SVG iframe's load event could
trigger the first navigation too early. Failures are reported to the parent.
The Seuss Search Back/Forward/Reload controls forward to the actual GUST
session rather than the iframe shell. Site-admin authorization and
server-backed domain policy checks remain required for GUST, including
redirects and subrequests. Old native Seuss Browser and experimental options
are still available under **Other modes**.

This uses GUST's AGPL-3.0 source adapted under `gust/`, not a rewrite of
Scramjet. Individual sites may still fail due to browser sandbox limitations,
upstream network restrictions, relay availability, or unsupported features.
No paid hosting service is required by these changes.


## GUST loading engine inside the Seuss Search interface

When a verified site admin selects **Seuss Search — GUST loading engine**
from Settings, Seuss Search's own search box, address bar, tabs and toolbar
remain visible. The existing GUST libcurl request/rewriting runtime loads
websites behind that interface; its separate GUST browser chrome and new-tab
page are hidden. The Scramjet engine and native search mode remain selectable.

GUST's SVG viewer receives `seuss=1` to activate a presentation-only view.
Its network stack remains unchanged. Startup waits for GUST's internal
initialization to finish before accepting Seuss Search's first navigation,
and the child reports website navigations and redirects to keep the
Seuss Search address bar and tab title current. All network requests
still require the site's existing verified-admin and domain checks.

The upstream GUST project is AGPL-3.0. See `gust/NOTICE.md` for attribution.
The embedded engine is still subject to sandbox/browser support, individual
website behavior and connection/relay availability. These changes do not
guarantee that every destination can load.


## Search phrases use Seuss Search results even with the GUST engine

In administrator-only GUST mode, ordinary search phrases now render the
first-party Seuss Search results layout rather than navigating to GUST's
search bar or a GUST-proxied search-engine webpage. Wikipedia, Open Library
and Stack Overflow results are fetched through a hidden, sandboxed GUST
libcurl HTTP session using an explicitly restricted JSON-request bridge.
The GUST data engine asks the Seuss Search parent for a server-backed
site-domain decision on each request and redirect. The parent verifies the
site-admin permission. Requests are limited to the three existing source
API endpoints; arbitrary URLs and HTML are not exposed via the bridge.
Navigation to an explicit website address still uses the GUST page-rendering
engine inside the Seuss Search tab.

These source indexes are specialized, not a general whole-web index. The
first-party results page retains explicit full-web provider links for wider
coverage. If the GUST connection or an API source fails, the results page
shows a source-level error rather than opening the GUST browser. Existing
Scramjet search behavior remains unchanged.


## GUST loading method never displays the GUST browser UI

The previous engine-only CSS missed GUST's separate `.navbar`, leaving
GUST's own address bar visible when users opened a website. The embedded
entrypoint now starts with `seuss-engine-view` on its XHTML body before
external scripts load. Strict structural CSS paints **only** GUST's page
iframe, not its navigation bar, tabs, new-tab homepage, bookmarks, developer
panels, splash or vendor error screen. The user sees Seuss Search's search
bar, tabs, address bar, back/forward/reload and own error messages.

The GUST runtime still implements HTTP requests and page rewriting via
libcurl and Wisp, behind the isolated iframe. When that runtime fails, its
error flows to Seuss Search and fails closed, rather than opening a hidden
vendor action dialog. Seuss Search receives explicit page-loading,
page-loaded and page-error messages to update its first-party UI.
Search-result links (Wikipedia, books and programming Q&A) now open in
Seuss Search's own tab when Scramjet or GUST mode is selected; the site
applies the usual admin and blocked-domain checks before navigating.

No website filter, server-side admin check or other safety rule is disabled.
Unreliable relays, network restrictions and incompatible websites can still
cause a load error; this is an interface isolation and error-handling fix,
not a guarantee that all websites work.


## Scramjet search 404 correction

Plain search phrases entered while **Scramjet** is selected now open
Seuss Search's own Wikipedia/Open Library/Stack Overflow results page,
rather than trying to open a search-engine page in an encoded
`/dr-seuss-search/scramjet/` path. GitHub Pages has no physical file
at those encoded paths and returns its own 404 if a service worker
does not intercept the request.

Search result article links and full-web provider links in Scramjet
mode open in ordinary browser tabs instead of silently using a proxy
route that might return 404. Directly typed website URLs still follow
the existing Scramjet path, subject to its existing worker setup and
site-domain checks. This change does not install or circumvent network
filters, bypass site safety policies, or claim that all external
websites are embeddable. Other browsing engine modes and GUST's
admin restrictions remain unchanged.


## Scramjet full-web search and real worker route validation

Scramjet mode once again loads the configured full-web search engine and
explicit website URLs through the existing Scramjet v1 service worker and
BareMux transport (no new servers). GitHub Pages has no static files at
encoded `/dr-seuss-search/scramjet/...` URLs, so a missing or stale service
worker previously produced the GitHub Pages 404.

The service worker now answers a reserved, local `__dss_worker_probe_v2`
route with a no-store JSON response and a distinctive header. The browser
performs an actual `fetch` against that URL after registration and the
worker message handshake, before opening any encoded destination. It
refuses to navigate if the worker cannot intercept that request. A stale
configuration or failed network operation returns a first-party error page
rather than fetching a nonexistent GitHub Pages file.

If Scramjet cannot start, search phrases use the native Seuss Search results
with an explicit startup error. Website addresses show a compatibility
notice with the failure reason. It does not fake a working transport and
cannot guarantee every destination loads. The existing verified-admin
GUST restrictions and website-domain checks are preserved.
