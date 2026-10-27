# Changelog

Format: `component: change`. Versions follow [SemVer](https://semver.org/).

## 0.2.0 - 2026-10-27

### Added
- `popup.js`: place search (Photon), saved and starred places, Google interface language setting; place results cached per query in `storage.session`.
- `background.js`: `uule`, `hl` and `gl` added to `google.com/search`, `Accept-Language` and `X-Geo` headers set, all by `declarativeNetRequest` session rules; `UULE` cookie removed when the place changes; rules refreshed every 60 min (`alarms`).
- `background.js`: toolbar icon in colour when a place is on, grey when off; tooltip names the place.
- `compare.html`: one search, one iframe per place, each with its own `uule`, `hl` and `gl`; `x-frame-options` and `content-security-policy` removed on `google.com` sub-frames of compare tabs only.
- `content.js`: reads the location line in the Google results footer; popup and compare pages show ✓ or ✗.
- `manifest.json`: Chrome and Firefox from one manifest: `background.service_worker` and `background.scripts`; `browser_specific_settings.gecko` with ID `serp-geo@gravantlabs.com`, `strict_min_version` 128.0.
- `popup.css`, `compare.css`: light and dark mode.
- `build.mjs`: optional `npm run build` writes a minified copy to `dist/` (esbuild, no comments) and packs it into `serp-geo-chrome.zip` and `serp-geo-firefox.xpi`.
- `LICENSE`: GPL-3.0, copyright GRAVANT LABS LLC.
