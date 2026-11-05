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

## Self-hosting a Wisp relay (recommended)

Public relays are shared by many people, so search engines often show captchas. Running your own relay fixes that. For example, use [wisp-server-node](https://github.com/MercuryWorkshop/wisp-server-node) or [wisp-js](https://github.com/MercuryWorkshop/wisp-js) on any VPS, Render, Fly.io, or similar host. Then paste its `wss://.../` address into Settings.

## Run locally

```sh
python3 -m http.server 8080
# open http://localhost:8080
```

## Updating Scramjet

The files in `scram/`, `baremux/`, `libcurl/`, and `epoxy/` are copied from the npm packages `@mercuryworkshop/scramjet@1.1.0`, `@mercuryworkshop/bare-mux@2.1.9`, `@mercuryworkshop/libcurl-transport@1.5.2`, and `@mercuryworkshop/epoxy-transport@2.1.29`.

## License

AGPL-3.0, the same license as Scramjet. "Dr. Seuss Search" is a fan-made name and is not affiliated with Dr. Seuss Enterprises.
