# Adobe Client Data Layer Debugger

![Browsers](https://img.shields.io/badge/browsers-Chrome%20%7C%20Firefox%20%7C%20Safari-lightgrey)
[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/copbbelofncpohiigmpoagkaoflcejlp?label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/adobe-client-data-layer-d/copbbelofncpohiigmpoagkaoflcejlp) [![Firefox Add-ons](https://img.shields.io/amo/v/acdl-debugger?label=Firefox%20Add-ons)](https://addons.mozilla.org/en-US/firefox/addon/acdl-debugger/) [![Release](https://img.shields.io/github/v/release/andylunsford/adobe-client-data-layer-debugger)](https://github.com/andylunsford/adobe-client-data-layer-debugger/releases/latest) [![CI](https://github.com/andylunsford/adobe-client-data-layer-debugger/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/andylunsford/adobe-client-data-layer-debugger/actions/workflows/ci.yml) [![License](https://img.shields.io/badge/license-Apache_2.0-blue)](LICENSE)

A browser extension for **Chrome, Firefox and Safari** that passively captures every push to `window.adobeDataLayer`, deep-clones the full `getState()` snapshot per push, surfaces the timeline in a panel (Chrome **Side Panel**, Firefox **Sidebar**, Safari toolbar **popup**), and exports it as a self-describing JSON file for post-recording debugging.

Built for debugging ACDL-instrumented sites.

![Side panel showing captured events and a state snapshot](screenshots/store/full-state-preview-1280x800.png)

## Features

- Captures every `adobeDataLayer.push(...)` with a deep-cloned state snapshot per event
- Replays events pushed before the extension loaded (`scope: 'all'`)
- Per-tab timeline — list + detail view; captures persist across page navigations in the same tab
- Watches renamed data layers too — add the names under **Settings** (see below)
- Label and note any event to record what triggered it; labels and notes are included in exports
- One-click **Clear** and **Export** (downloads a documented JSON envelope)
- Survives MV3 background eviction via `storage.session`
- System, Light, or Dark theme
- Zero runtime dependencies — vanilla JS + CSS

## Prerequisites

- **Google Chrome 120+** (or any Chromium browser with Side Panel support)
- **Firefox 142+** (desktop only — Firefox for Android has no sidebar)
- **Safari 17.5+** on macOS, plus **Xcode** to wrap the extension in the app Safari requires
- To build from source: **Node.js 22.12+** and npm (CI uses Node 22 — see `.nvmrc`)

## Install

### Store Links
- [Chrome](https://chromewebstore.google.com/detail/adobe-client-data-layer-d/copbbelofncpohiigmpoagkaoflcejlp)
- [Firefox](https://addons.mozilla.org/en-US/firefox/addon/acdl-debugger/)
- Safari (TBD based on interest)


### Packaged Releases

Each [release](https://github.com/andylunsford/adobe-client-data-layer-debugger/releases/latest) attaches one zip per browser: `acdl-debugger-vX.Y.Z-chrome.zip`, `-firefox.zip` and `-safari.zip`. Releases also go to the Chrome Web Store and Firefox Add-ons automatically, and appear there once each store's review approves them, so the store links above are the easiest way to install and stay up to date. The zips are for loading the extension unpacked, for testing or where the stores aren't an option.

#### Chrome

1. Download the `-chrome.zip` and unzip it
2. Open `chrome://extensions` and enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the unzipped folder

To update, replace that folder's contents with the newer release and click the reload icon on the extension's card.

#### Firefox

- **Install:** use [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/acdl-debugger/) (Firefox 142+). Firefox only installs Mozilla-signed add-ons permanently, and releases no longer attach a signed `.xpi`.
- **Try it unsigned:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on**, and pick the `-firefox.zip` (or `dist/firefox/manifest.json`). Temporary add-ons are removed when Firefox restarts.
- Click the toolbar button (or **View → Sidebar**) to open the sidebar.

#### Safari

Safari only runs web extensions that ship inside a native macOS app, so the zip is the input to Apple's converter, not something you install directly. On a Mac with Xcode:

```bash
unzip acdl-debugger-vX.Y.Z-safari.zip -d acdl-safari   # or use dist/safari from a local build
xcrun safari-web-extension-converter acdl-safari --macos-only --app-name "ACDL Debugger" --bundle-identifier com.example.acdl-debugger
```

Build and run the generated Xcode project, then enable the extension in **Safari → Settings → Extensions**. To load an unsigned build, first turn on **Develop → Developer Settings → Allow unsigned extensions** (resets each time Safari quits). Grant the extension access to the sites you debug when Safari asks. Distributing to other Macs requires an Apple Developer account (App Store or notarized app).

Safari has no side panel or sidebar API, so the panel opens as a toolbar **popup** and closes when you click back into the page. Capture keeps running in the background; reopen the popup to see new events. Safari has no `downloads` API, so **Export** saves through a regular download link.

## Settings

Click the gear button in the panel header to open **Settings**.

**Data layer names:** the extension always watches `window.adobeDataLayer`. If a site exposes its data layer under another name, add that name here (comma-separated, e.g. `myDataLayer`). This covers a self-hosted or modified ACDL build, or a page that pushes into its own custom-named array. Adobe's Client Data Layer Tags extension can also rename the data layer, but it still creates `adobeDataLayer`, so those sites are usually captured without any setting. Adding the custom name there doesn't hurt: if two names point at the same data layer, each event is captured only once.

- Names must be plain JavaScript identifiers (letters, digits, `_` and `$`), up to 10 extra names.
- Changes apply to open tabs right away, without a reload. Events pushed before you added the name are still captured.
- Events from a non-default name show it in the event list (e.g. `#2 · 10:14:03.512 · myDataLayer`), and every exported event includes its `dataLayer` name.
- Names are stored locally in your browser (see [PRIVACY.md](PRIVACY.md)).

## Install (from source, unpacked)

```bash
npm install
npm run icons    # regenerate icons from assets/icon-source.png (already committed)
npm run build    # produces dist/chrome, dist/firefox, dist/safari
```

Then load it into Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the `dist/chrome` directory
4. Open any page and click the **Adobe Data Layer Debugger** toolbar action to open the Side Panel

For Firefox and Safari, use `dist/firefox` / `dist/safari` as described above.

The panel always reflects the **active** tab. Switching tabs re-subscribes automatically.

### Quick verification

- **Has ACDL** — visit a site that uses `window.adobeDataLayer`; events appear in the panel.
- **No ACDL** — visit `https://example.com/`; the panel shows a "not detected" banner.
- **Renamed layer** — on a page whose data layer only exists as, say, `myDataLayer`, nothing appears until you add `myDataLayer` under **Settings**; then its events appear without reloading.
- **Trim test** — in the page console: `for (let i = 0; i < 6000; i++) adobeDataLayer.push({ event: 'load.test', n: i })` — the store FIFO-trims at 5000.

## Contributing / building

All non-trivial logic lives in `src/lib/` as pure modules (no extension APIs) so it can be unit-tested in Node. The four entry files — `inject.js`, `content.js`, `background.js`, `sidepanel/sidepanel.js` — are the only places that touch extension APIs / `window.*`. They use `ext` from `src/ext.js` (`browser` in Firefox/Safari, `chrome` in Chrome) rather than `chrome.*` directly.

`manifest.json` is the Chrome manifest; `src/lib/target-manifest.js` derives the Firefox and Safari manifests from it at build time.

```bash
npm install          # install dev dependencies (esbuild, vitest, jsdom, sharp)
npm test             # run unit tests (103 tests: 11 lib modules + the store scripts)
npm run test:watch   # re-run tests on change
npm run test:e2e     # build, then run real-browser tests in headless Chromium + Firefox
npm run build        # one-off bundle into dist/<chrome|firefox|safari>
npm run build -- --target=firefox   # build a single target
npm run build:watch  # rebuild dist/chrome on change (add -- --target=firefox for Firefox)
npm run icons        # regenerate icons/ from assets/icon-source.png
```

**Conventions:**

- **TDD** — write a failing test under `tests/` before adding behavior to a `src/lib/` module.
- **No runtime framework** — vanilla JS + CSS for the side panel.
- **`inject.js` must be self-contained** — it runs in the page MAIN world and cannot `import`. esbuild emits IIFE bundles targeting `chrome120` / `firefox142` / `safari17`.
- **Minimize comments** — prefer self-documenting code.

After editing, run `npm run build` and reload the extension (`chrome://extensions`, or **Reload** in `about:debugging` for Firefox).

CI (`.github/workflows/ci.yml`) runs the tests, builds all three targets, runs Mozilla's `web-ext lint` (the AMO validator) on the Firefox build, and runs the e2e suite in Chromium and Firefox on every push to `main` and every pull request.

**E2E tests** (`tests/e2e/`) load the built extension into headless Chromium (Playwright) and Firefox (puppeteer-core over WebDriver BiDi), serve a local page running the real ACDL library, and check that captures, state snapshots, navigation, strict-CSP pages, the panel's event list and detail view, Clear, and renamed data layers all work. Chromium comes from `npx playwright install chromium`. Firefox must be installed on the machine; set `FIREFOX_BIN` if it isn't on `PATH`. Safari isn't covered: it only runs on macOS.

## Architecture

```
Page MAIN world           Isolated world         Extension
─────────────────         ──────────────         ─────────
inject.js          ──▶    content.js      ──▶   background.js  ◀──▶  sidepanel/
(hooks ACDL,             (bridge:               (service worker:      (UI: list,
 deep-clones state,       window.postMessage     per-tab store +       detail,
 posts events)            → chrome.runtime)      session storage       Clear/Export)
                                                 persistence)
```

ACDL lives on `window` and is invisible to isolated-world content scripts, so a page-world script (`inject.js`) hooks it via its documented `addEventListener` API. The isolated-world `content.js` bridges page messages to `chrome.runtime`. The service worker owns the canonical `Map<tabId, capture>` and persists to `chrome.storage.session` to survive MV3 eviction.

See `CLAUDE.md` for the full architecture notes, file layout, and known gotchas.

## Project layout

```
manifest.json            # MV3 manifest for Chrome (Firefox/Safari variants derived at build)
build.mjs                # esbuild bundle script
vitest.config.js         # unit test config (vitest.e2e.config.js for e2e)
.github/workflows/       # CI (test + build) and tag-driven releases
scripts/                 # icon generation, release version checks, store publishing helpers
assets/icon-source.png   # source artwork (not shipped in dist/)
src/
  inject.js              # page-world entry (self-contained IIFE)
  content.js             # isolated-world bridge
  background.js          # service worker (event page in Firefox)
  ext.js                 # browser/chrome namespace shim
  lib/                   # pure, unit-tested modules
  sidepanel/             # panel UI (html/js/css): side panel / sidebar / popup
tests/                   # vitest, one file per lib module; e2e/ = real-browser tests
icons/                   # generated by `npm run icons` (committed)
dist/<target>/           # build output per browser — load unpacked (git-ignored)
```

## License

Copyright 2026 Andy Lunsford. Licensed under the [Apache License, Version 2.0](LICENSE).
