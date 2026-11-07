# GUST attribution and changes

Source: https://github.com/nautilus-os/GUST
Original license: GNU Affero General Public License v3.0 (AGPL-3.0)
Original copyright belongs to GUST's contributors.
The Dr. Seuss Search root LICENSE contains the AGPL-3.0 text.

Vendored from upstream files:
- svg/site.svg -> gust/site.svg
- svg/static/js.js -> gust/static/js.js
- svg/static/css.css -> gust/static/css.css

Modifications in gust/static/js.js:
- a fail-closed message bridge validates each HTTP(S), WebSocket, redirect,
  streaming, and navigated destination with Seuss Search's server-backed
  domain rules and verified administrator permissions
- accepts the parent's selected secure Wisp relay
- accepts a parent-initiated destination within the sandboxed tab

The upstream GUST interface loads the upstream libcurl.js script, fonts, and
icons from public CDNs. Those external scripts are not bundled in this repo.
