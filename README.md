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
