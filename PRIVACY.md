# Privacy Policy – Adobe Client Data Layer Debugger

*Last updated: 2026-10-01*

Adobe Client Data Layer Debugger does not collect, transmit, sell, or share any personal or user data. It makes no network requests and contains no analytics, telemetry, advertising, or remote code.

## What the extension accesses

On each page you visit, the extension reads that page's Adobe Client Data Layer (`window.adobeDataLayer`), along with the page URL and title, and shows them to you in Chrome's side panel. The data layer can contain anything the website owner puts in it, such as page details, event data, or identifiers.

## How that data is handled

All data is processed and kept locally in your browser, only to show it to you. It is never sent to the developer or to any third party.

## Local storage

- **Captured events**, including any labels or notes you add to them, are held in `chrome.storage.session`. This storage is in memory only, never written to disk, and cleared when you close the browser. Captures for a tab are also removed when you click **Clear** or close the tab. They persist while you navigate within the same tab so you can debug multi-page flows.
- **Your theme preference** (System, Light, or Dark) is saved in the side panel's local storage on your device.
- **Data layer names** you add under Settings are saved in `chrome.storage.local` on your device, so the extension knows which page variables to watch. They stay until you change them.

## Exports

When you click **Export**, the extension saves the current tab's captured events as a JSON file to a location you choose on your computer, using Chrome's download prompt. Nothing is exported unless you click the button, and the file goes nowhere else.

## Contact

Questions or concerns: <https://github.com/andylunsford/adobe-client-data-layer-debugger/issues>
