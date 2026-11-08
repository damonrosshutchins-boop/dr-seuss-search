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



## Choosing a Wisp relay
In Settings, choose a preset Wisp relay or enter a custom secure `wss://` URL.
The selector includes `anura.pro`, `wisp.mercurywork.shop`,
`motor-cycle-part.org`, `mages.io`, `lichology.com`,
`definitelyscience.com`, and `wisp.terbiumon.top`.
Use **Test selected relay** to check a WebSocket Wisp handshake before saving.
Endpoints are candidate addresses provided by the site owner, not guarantees of
availability or compatibility. After saving, the selected relay is remembered in
the browser and applied to the Scramjet transport, including when the default
browsing engine is Seuss Browser. No automatic multi-relay probing occurs.


## Transport choices (existing modules)

Settings now has four choices backed by the two locally installed Wisp
transports, libcurl and Epoxy: libcurl (with its existing Epoxy startup
fallback), Epoxy only, Automatic libcurl-then-Epoxy, and Automatic
Epoxy-then-libcurl. Automatic entries are fallback strategies rather than
new transports. They try one other bundled module only if initialization
fails, never switch Wisp servers, and do not override website restrictions.
The saved preference is not overwritten by fallback. Network availability
and compatibility with external websites are not guaranteed.


## Primary and optional fallback Wisp

The current site already includes BareMux with two supported Wisp transports
(libcurl and Epoxy). Settings now provides a saved **primary Wisp relay**
(the existing `settings.wisp` field) and a separate, optional
**fallback Wisp relay** (`settings.fallbackWisp`, disabled by default).

When a fallback is configured, Scramjet performs a short WebSocket/Wisp
protocol handshake check on the primary before configuring BareMux. If it
fails, the site checks the fallback once and uses it for this session only
when it provides a valid handshake. The configured primary is never
overwritten. If both fail, the site reports the handshake failures.
Without a fallback, previous startup behavior is unchanged. Tests are
on-demand or performed when configuring the browser, not periodic scanning.
The two distinct Settings buttons let you test each address directly.
Transport initialization and successful handshakes are not guarantees a
remote website will load. Site-domain permission checks remain active.

**Service worker limitation:** BareMux is a transport selection API; it
does not replace Scramjet's request-intercepting service worker. The
existing Seuss Browser mode does not use a worker or Wisp, but ordinary
iframe restrictions still apply. This change does not remove Scramjet's
service worker, add a workerless proxy, or circumvent network controls.


## Optional Custom Loader (CORS HTML mode)

**Settings → Browsing engine → Custom Loader** is a separate, opt-in
worker-free HTML viewer. It uses the browser's normal HTTPS `fetch()`
with `mode: "cors"`, omitted credentials/referrers, and rejected
redirects. Only pages that **explicitly permit cross-origin reads** can
load; it does not replace Scramjet or guarantee compatibility.

The loaded HTML is reduced to a safe, readable set of elements. Basic
links and same-origin images/stylesheets receive absolute URLs, while
original scripts, forms, embedded frames, and active content are removed.
A nonce-authorized navigation controller operates inside an opaque-origin,
CSP-restricted iframe; every requested navigation is checked against
Seuss Search's existing website access policy. Internal tabs, browsing
history, reload, and useful failure messages are supported. Requests time out after
15 seconds, and downloaded HTML is capped at 1.5 MB even when the server does
not send a Content-Length header. Responsive image `srcset` and common lazy
image attributes are supported when their URLs stay HTTPS and same-origin.
The viewer also preserves static picture fallbacks, semantic article elements,
same-origin audio/video with user controls, responsive viewport metadata,
safe body/html CSS classes, and relative CSS URLs resolved
against the original HTTPS page rather than the GitHub Pages host (including
permitted same-origin `<base href>` declarations). In-page anchors scroll
without refetching, and a limited number of inline body styles are retained.
A JavaScript-only empty page now displays a clear explanation. Back/Forward
history moves only after a page successfully loads. These are best-effort
HTML-reading improvements, not a replacement for the site's JavaScript engine.

The new mode does not require a service worker and does not use BareMux
or Wisp. Traffic is **not concealed or tunneled**: the browser and
network provider can still observe connections to permitted sites.
The original Scramjet transport and primary/fallback Wisp settings
remain available and unchanged.


## Verified admin-only temporary Wisp relay

Settings includes an optional **Admin Relay Session** area, visible only
after the existing `site_check_admin` permission is confirmed by the
site's server. An admin may enter a trusted `wss://` relay used by the
already-bundled Scramjet/BareMux transport. The choice lives only in page
memory, is not written into saved settings, is rechecked on activation,
and is cleared on site access changes or closing the page.

A failing private relay stops with a clear message rather than silently
switching to a public relay. It does **not** affect the worker-free
CORS Custom Loader, skip any domain moderation, or remove Scramjet's
service worker. Neither this UI nor the Wisp protocol conceals traffic
from the browser, local network, or relay operator; it is not anonymity
or covert browsing technology. Normal account users retain the
existing non-admin Scramjet and Wisp settings.


## Play offline: Games Library

Open **Games → Enable offline access** while connected. This installs/updates
the existing same-origin service worker and caches only two local HTML pages:
\`offline-arcade.html\` and \`offline-pack.html\`. These remain available at
their direct URLs without Wi-Fi after the browser finishes saving them and
while the browser retains its cached site data. The Custom Loader is unchanged.

**Always-offline built-in games (five):** Snake, Merge Tiles, Paddle Rally,
Memory Match, and 15 Puzzle. They have no external assets, and the standalone
\`offline-arcade.html\` can also be downloaded as a single HTML file and opened
locally without any service worker.

The **352-game HTML catalog** does not automatically download 352 large files.
Open \`offline-pack.html\`, select a game, and choose **Save offline** while
online. Each explicitly saved HTML file is kept in IndexedDB on that device.
Select **Saved only** to see which are available. Unavailable storage, quota
limits, network services embedded in some HTML games, and sandbox restrictions
mean individual game compatibility is not guaranteed. Clearing website data
deletes those saved copies; a browser/profile change does not transfer them.

Other remote-hosted games (including Green Eggs and Ham collection, multiplayer
games, cloud games like GeForce NOW/now.gg) still require an internet connection.
No third-party games, videos, or copyrighted external game assets are mirrored
into this GitHub Pages repository. The offline page cache does not proxy traffic
or alter Scramjet routing.


## Retro Arcade & Emulators (no ROMs or setup)

Open **Games → Retro Arcade & Emulators**. Two subcategories:

- **Offline Arcade**: 22 new original, self-contained arcade-style mini-games
  from \`retro-arcade.html\`, plus five games already in \`offline-arcade.html\`.
  Both pages are standalone and use no external assets or services. Use
  **Enable offline access** while online or download the single HTML file.
- **Ready-to-Play Emulators**: js-dos/DOSBox with Digger, Tyrian 2000,
  DOOM shareware, Heretic shareware, and Quake shareware (all already
  bundled in \`vm/games/\`), and the existing FreeDOS and KolibriOS v86 images.
  \`dos-arcade.html\` is a dedicated launcher that does not require a
  manual ROM/BIOS upload, login with a third-party vendor, or game setup.
  The existing VM emulator is also available from the site's VM button.

To run the DOS arcade **without internet**, choose **Prepare DOS games for
offline play** once while online. It caches the first-party DOSBox runtime,
five game bundles, and emulator launcher (roughly 23 MB). Offline support
still depends on the browser retaining its CacheStorage data; browsers may
evict it. Some browser/iframe setups may restrict WebAssembly workers.

The new retro-style games are original implementations of arcade mechanics,
not copies of commercial ROMs or artwork. We do not supply game console ROMs
that would otherwise need to be acquired or configured.


## NES, Nintendo 64 and PlayStation 1 emulator games

NES LJ65 also appears in the Offline Arcade subcategory, bringing its directly
launchable offline games from 27 to **28**.

A **Console Games** subcategory is available under **Games → Retro Arcade &
Emulators**, and the main Games grid also links to a standalone
\`console-emulators.html\` page.

- **NES LJ65**: \`nes-homebrew.html\` is a complete MIT-licensed, single-file
  NES emulator adapted from TrevorS/nes.html with its included LJ65 homebrew
  game by Damian Yerrick. It launches automatically and needs **no internet,
  ROM file or BIOS**; save the HTML file to use independently of site caching.
- **NES 2048**: a free MIT-licensed NES homebrew from the
  Mylittlestories/recalbox-os-web free-games collection, launched with
  EmulatorJS/FCEUmm. Requires first-time online loading of the core and ROM.
- **Nintendo 64**: **Kumi-Daiko Beatoff 64**, a CC0 homebrew game-jam
  cartridge by Team Riistahillo, launched in EmulatorJS/Mupen64Plus Next.
  Requires first-time online loading. Compatibility varies by browser/device.
- **PlayStation 1**: the official [PSoXide browser demo disc](https://bonnie-studios.itch.io/psoxide)
  supplies real homebrew PS1 games and runs without manual BIOS/game uploads,
  **but requires internet** and may refuse iframe embedding. A separate
  open-source PSX test program can be attempted using EmulatorJS/PCSX ReARMed;
  it is a diagnostic, not a complete PS1 game, and BIOS-free compatibility
  is not guaranteed.

The source ROM assets for the last three EmulatorJS demos are requested from a
fixed revision of Mylittlestories/recalbox-os-web; they are *not copied into
this repository*. The official EmulatorJS assets come from its stable CDN.
**Prepare offline console files** explicitly downloads the relevant browser
emulation assets and the pinned sample programs into service-worker CacheStorage.
The current offline cache covers a fixed allowlist of public, licensed files.
It does not proxy arbitrary websites or copy commercial cartridge/disc images.
Offline WASM boot after caching is experimental and may fail if a core requests
an uncached dependency, the upstream server lacks CORS, or the browser clears
site storage. The PSoXide externally hosted demo remains online-only.
