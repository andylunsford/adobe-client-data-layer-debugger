# Adobe Client Data Layer Debugger

A Chrome (Manifest V3) extension that passively captures every push to `window.adobeDataLayer`, deep-clones the full `getState()` snapshot per push, surfaces the timeline in a Chrome **Side Panel**, and exports it as a self-describing JSON file for post-recording debugging.

Built for debugging ACDL-instrumented sites.

## Features

- Captures every `adobeDataLayer.push(...)` with a deep-cloned state snapshot per event
- Replays events pushed before the extension loaded (`scope: 'all'`)
- Per-tab timeline in a Side Panel — list + detail view
- One-click **Clear** and **Export** (downloads a documented JSON envelope)
- Survives MV3 service-worker eviction via `chrome.storage.session`
- Zero runtime dependencies — vanilla JS + CSS

## Prerequisites

- **Google Chrome 120+** (or any Chromium browser with Side Panel support)
- To build from source: **Node.js 20.9+** and npm (CI uses Node 22 — see `.nvmrc`)

## Install (from a release)

1. Download `acdl-debugger-vX.Y.Z.zip` from the [latest release](https://github.com/andylunsford/adobe-client-data-layer-debugger/releases/latest) and unzip it
2. Open `chrome://extensions` and enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the unzipped folder

To update, replace that folder's contents with the newer release and click the reload icon on the extension's card.

## Install (from source, unpacked)

```bash
npm install
npm run icons    # regenerate icons from assets/icon-source.png (already committed)
npm run build    # produces ./dist
```

Then load it into Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the `dist/` directory
4. Open any page and click the **Adobe Data Layer Debugger** toolbar action to open the Side Panel

The panel always reflects the **active** tab. Switching tabs re-subscribes automatically.

### Quick verification

- **Has ACDL** — visit a site that uses `window.adobeDataLayer`; events appear in the panel.
- **No ACDL** — visit `https://example.com/`; the panel shows a "not detected" banner.
- **Trim test** — in the page console: `for (let i = 0; i < 6000; i++) adobeDataLayer.push({ event: 'load.test', n: i })` — the store FIFO-trims at 5000.

## Contributing / building

All non-trivial logic lives in `src/lib/` as pure modules (no Chrome APIs) so it can be unit-tested in Node. The four entry files — `inject.js`, `content.js`, `background.js`, `sidepanel/sidepanel.js` — are the only places that touch `chrome.*` / `window.*`.

```bash
npm install          # install dev dependencies (esbuild, vitest, jsdom, sharp)
npm test             # run unit tests (50 tests across 7 lib modules)
npm run test:watch   # re-run tests on change
npm run build        # one-off bundle into ./dist
npm run build:watch  # rebuild on file change
npm run icons        # regenerate icons/ from assets/icon-source.png
```

**Conventions:**

- **TDD** — write a failing test under `tests/` before adding behavior to a `src/lib/` module.
- **No runtime framework** — vanilla JS + CSS for the side panel.
- **`inject.js` must be self-contained** — it runs in the page MAIN world and cannot `import`. esbuild emits IIFE bundles targeting `chrome120`.
- **Minimize comments** — prefer self-documenting code.

After editing, run `npm run build` and reload the extension at `chrome://extensions`.

CI (`.github/workflows/ci.yml`) runs the tests and a build on every push to `main` and every pull request.

## Releasing

Releases are built and published by GitHub Actions (`.github/workflows/release.yml`) when a version tag is pushed:

```bash
npm version minor -m "chore: release v%s"   # or patch / major — bumps package.json + manifest.json, commits, tags
git push --follow-tags                      # pushes the commit and tag; the workflow publishes the release
```

The workflow checks that the tag matches the version in `package.json` and `manifest.json`, runs the tests, builds, and attaches `acdl-debugger-vX.Y.Z.zip` to a new GitHub release.

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
manifest.json            # MV3 manifest (copied into dist/)
build.mjs                # esbuild bundle script
vitest.config.js         # test config
.github/workflows/       # CI (test + build) and tag-driven releases
scripts/                 # icon generation + release version helpers
assets/icon-source.png   # source artwork (not shipped in dist/)
src/
  inject.js              # page-world entry (self-contained IIFE)
  content.js             # isolated-world bridge
  background.js          # service worker
  lib/                   # pure, unit-tested modules
  sidepanel/             # Side Panel UI (html/js/css)
tests/                   # vitest, one file per lib module
icons/                   # generated by `npm run icons` (committed)
dist/                    # build output — load this unpacked (git-ignored)
```

## License

Copyright 2026 Andy Lunsford. Licensed under the [Apache License, Version 2.0](LICENSE).
