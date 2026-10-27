# CLAUDE.md — Adobe Client Data Layer Debugger

AI assistant instructions for this project. Inherits parent `CLAUDE.md` style: concise, actionable, minimal comments, follow existing patterns.

## Purpose

Manifest V3 browser extension (Chrome, Firefox, Safari) that passively captures every push to `window.adobeDataLayer`, deep-clones `getState()` per push, surfaces the timeline in a panel (Chrome Side Panel / Firefox sidebar / Safari popup), and exports it as a self-describing JSON file. Goal is debugging ACDL-instrumented sites.

## Source of truth

The original design spec and implementation plan live in the authoring workspace (not in this repo). This file plus the inline code are the source of truth for the extracted repository. If you have access to the original `docs/superpowers/` spec/plan and it conflicts with this file, reconcile and update this file to match.

## Current status

**Implemented (v0.3.0).** All four pieces and eight lib modules are built; 62 unit tests pass (`npm test`). `npm run build` produces loadable `dist/chrome`, `dist/firefox`, `dist/safari`. Events can carry a label + note (event annotations), and captures now persist across top-level page navigation within a tab. The side panel now reconnects to the service worker after MV3 eviction (heartbeat + backoff, resync without losing selection/scroll/typing), has a System/Light/Dark theme toggle, and ships the real extension icon. Firefox and Safari builds are derived from the Chrome manifest at build time; Chrome and Firefox are exercised end to end by `npm run test:e2e` (6 tests, also in CI); Safari has never been run.

Next work is v0.3+ — see **Out of scope (v1)** below for the deferred backlog.

## Architecture (4 pieces)

```
Page MAIN world           Isolated world         Extension
─────────────────         ──────────────         ─────────
inject.js          ──▶    content.js      ──▶   background.js  ◀──▶  sidepanel/
(hooks ACDL,             (bridge:               (service worker:      (UI: list,
 deep-clones state,       window.postMessage     per-tab store +       detail,
 posts events)            → chrome.runtime)      session storage       Clear/Export)
                                                 persistence)
```

**Why four:** ACDL lives on `window` and is invisible to isolated-world content scripts. Page-world script (`inject.js`) hooks ACDL via its documented `addEventListener` API (`scope: 'all'` replays past + future events). Isolated-world `content.js` is the only piece that can call `chrome.runtime`. SW owns the canonical `Map<tabId, TabCapture>` and persists to `chrome.storage.session` to survive MV3 SW eviction.

## File layout

```
manifest.json                    # MV3 manifest for Chrome; Firefox/Safari derived by target-manifest.js
package.json                     # esbuild + vitest + sharp devDeps
build.mjs                        # esbuild bundle script (IIFE format), one dist/<target> per browser
vitest.config.js                 # node default, jsdom for acdl-hook
vitest.e2e.config.js             # e2e only: tests/e2e/**/*.e2e.js, 60 s timeouts, serial
.nvmrc                           # Node version for CI (22)
.github/workflows/
  ci.yml                         # test + build + web-ext lint (Firefox) on push to main and PRs
  release.yml                    # on v*.*.* tag: verify version, test, build, zip each dist/<target>, GitHub release
scripts/make-icons.mjs           # resizes assets/icon-source.png with sharp
scripts/sync-manifest-version.mjs  # npm `version` hook: copies package.json version into manifest.json
scripts/check-release-version.mjs  # release guard: tag must equal package.json + manifest.json version
assets/
  icon-source.png                # 1300×1300 source artwork (not shipped in dist/)
src/
  inject.js                      # page-world entry (must be self-contained IIFE)
  content.js                     # isolated-world bridge
  background.js                  # service worker (Firefox: event page via background.scripts)
  ext.js                         # `browser ?? chrome` namespace shim used by all entry files
  lib/
    safe-clone.js                # structuredClone + JSON fallback w/ markers
    ids.js                       # makePageLoadId() → "pl_<10-hex>"
    event-store.js               # per-tab Map + FIFO trim (5000 cap, 1000 chunk)
    export-envelope.js           # builds documented JSON envelope
    acdl-hook.js                 # installs ACDL listeners onto a given object
    panel-connection.js          # single port, heartbeat, reconnect/backoff
    theme.js                     # normalize/next/load/save/apply theme
    target-manifest.js           # derives firefox/safari manifests from manifest.json
  sidepanel/
    index.html                   # build also emits popup.html (class="popup") for Safari
    sidepanel.js
    sidepanel.css
    theme.js                     # head script: applies stored theme before paint
tests/                           # vitest, one file per lib module
  e2e/                           # real-browser tests: fixture-server, browsers (launchers), extension.e2e.js
icons/                           # generated by make-icons (committed)
screenshots/                     # raw captures; store/ = 1280×800 Web Store uploads
dist/<chrome|firefox|safari>/    # build output — load unpacked
```

All non-trivial logic lives in `src/lib/` so it can be unit-tested in Node without Chrome APIs.

## Build & test

```bash
npm install
npm run icons      # regenerate icons from assets/icon-source.png
npm run build      # produces dist/chrome, dist/firefox, dist/safari (--target=<name> for one)
npm test           # 62 unit tests across 8 lib modules
npm run build:watch  # dist/chrome only unless -- --target=<name>
npm run test:e2e   # builds, then runs tests/e2e in headless Chromium + Firefox (needs Firefox installed)
```

Chrome: load `dist/chrome` unpacked at `chrome://extensions`. Firefox: `about:debugging` → Load Temporary Add-on → `dist/firefox/manifest.json`. Safari: `xcrun safari-web-extension-converter dist/safari` on macOS (see README).

## Releasing

```bash
npm version <patch|minor|major> -m "chore: release v%s"   # bumps package.json + lockfile + manifest.json, commits, tags
git push --follow-tags                                    # tag push triggers .github/workflows/release.yml
```

The release workflow fails fast if the tag doesn't match both versions. It publishes `acdl-debugger-vX.Y.Z-{chrome,firefox,safari}.zip` (contents of each `dist/<target>`, no source maps) with notes built from commit subjects since the previous tag. Actions are pinned by commit SHA; bump the SHA and `# vX` comment together. Chrome Web Store, AMO, and App Store publishing are not set up.

## Implementation conventions

- **TDD.** Lib modules (`src/lib/`) follow strict red→green→commit. Don't add behavior without a failing test first.
- **No runtime framework.** Vanilla JS + CSS for the side panel. Preact is the v2 upgrade path if complexity grows.
- **No bundler tricks.** esbuild emits IIFE bundles targeting `chrome120`. `inject.js` MUST be self-contained — page-world cannot import.
- **Pure modules under `src/lib/`** — no Chrome API references. Entry files (`inject.js`, `content.js`, `background.js`, `sidepanel.js`) are the only places that touch extension APIs or `window.*`, and they go through `ext` from `src/ext.js`, never `chrome.*` directly.
- **Minimize comments** (per parent CLAUDE.md). Self-documenting code preferred.

## Known gotchas

- **ACDL `scope`:** use `'all'` so registration order vs. page init doesn't matter. `inject.js` runs at `document_start` to minimize the gap.
- **`structuredClone` in jsdom:** partial support — that's why `safe-clone.js` has a fallback path with `[Function]`, `[HTMLElement: <tag>]`, `[Circular →path]` markers. Tests exercise both branches.
- **MV3 service worker eviction:** Chrome suspends the worker after ~30 s idle, which disconnects panel ports. The panel's `panel-connection` pings every 20 s (port messages keep the worker alive, Chrome 114+) and reconnects with backoff, re-subscribing the active tab; a same-tab snapshot is treated as a resync (selection/scroll/typing preserved). In the worker every listener waits on `ready` (the `rehydrate()` promise) so nothing reads the store before session storage is loaded. Mutations mark the tab dirty; a 1 s debounced flush writes to `chrome.storage.session` (10 MB quota; failures log `[acdl-debugger] session storage flush failed`).
- **Theme:** preference in side-panel `localStorage` (`acdl-debugger:theme`), applied as `data-theme` on `<html>` by `sidepanel/theme.js` in `<head>` (no flash). CSS tokens use `light-dark()` + `color-scheme`.
- **Side panel always reflects the *active* tab,** not the tab it was opened from. `chrome.tabs.onActivated` triggers re-subscribe.
- **Page-load entries are authored by `inject.js`,** not `webNavigation`.
- **`crypto.getRandomValues`** is used in `ids.js` — works in both Node 18+ and browsers.
- **Captures persist across top-level navigation;** only Clear, tab close, or browser close drop them.
- **Permissions are minimal for Web Store review:** `storage` (session persistence), `sidePanel`, `downloads` (Export). No `host_permissions` — the `<all_urls>` content script grants its own access. `tabs`/`webNavigation` were dropped as unused (tab IDs and `onActivated`/`onRemoved` need no permission). Re-add only with a real call site, and update `PRIVACY.md` + store justifications.
- **`seq` vs `index`:** `index` is per page load (assigned in `inject.js`, restarts at 1). `seq` is tab-wide and assigned by `event-store`; the side panel and `annotate` message key on `seq`.

- **Cross-browser:** `manifest.json` stays Chrome-shaped; per-browser differences live in `src/lib/target-manifest.js` (tested). Firefox: `background.scripts` (no MV3 service workers), `sidebar_action` instead of `side_panel` (action click → `sidebarAction.toggle()` in background.js), gecko id `acdl-debugger@andylunsford` (permanent once on AMO), `data_collection_permissions: none` (required by AMO for new add-ons). Safari: no side panel/sidebar API → action `default_popup` = `sidepanel/popup.html`; no `downloads` API → Export falls back to an `<a download>` click. Guard any new API with optional chaining if it isn't in all three.

- **E2E harness:** Chromium via Playwright (`channel: 'chromium'`; branded Chrome 137+ ignores `--load-extension`), pinned to 1.56.1 to match the browsers preinstalled in Claude cloud sessions; bump both together. The CI `e2e` job runs on `ubuntu-24.04` because 1.56 refuses to install Chromium on Ubuntu 26.04 (`ubuntu-latest`); move it to `ubuntu-latest` only after a Playwright upgrade. Firefox via `puppeteer-core` over WebDriver BiDi, using the system Firefox (`FIREFOX_BIN` overrides). Firefox needs system access to open and script `moz-extension://` pages: `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1` (Firefox 159+, which dropped the flag) plus `-remote-allow-system-access` (older releases); CI installs the latest Firefox, so a harness break there may be a Firefox change rather than an extension bug, and BiDi never reports their load event, so `openPanel()` polls instead of awaiting `goto`. The moz-extension UUID is fixed via the `extensions.webextensions.uuids` pref. Tests find a tab's capture by exporting every tab and matching `pages[].url`, so give each test its own query string. The "no ACDL" path is not covered (detection waits 5 s).

## Out of scope (v1)

Cross-origin iframe ACDL capture · search/filter · state diffs · replay · annotating page dividers · exempting annotated events from trim. All deferred to v0.3+.

## Manual smoke test sites

- **Has ACDL:** `https://www.creditacceptance.com/`
- **No ACDL:** `https://example.com/` (verify "not detected" banner)
- **Trim test:** browser console — `for(let i=0;i<6000;i++) adobeDataLayer.push({event:'load.test',n:i})`
