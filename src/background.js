import { ext } from './ext.js';
import { createEventStore } from './lib/event-store.js';
import { buildExportEnvelope } from './lib/export-envelope.js';

const store = createEventStore();

const STORAGE_KEY_PREFIX = 'capture:';
const FLUSH_DEBOUNCE_MS = 1000;
const dirtyTabs = new Set();
let flushTimer = null;

function markDirty(tabId) {
  dirtyTabs.add(tabId);
  if (flushTimer) return;
  flushTimer = setTimeout(flushDirty, FLUSH_DEBOUNCE_MS);
}

async function flushDirty() {
  flushTimer = null;
  const tabs = Array.from(dirtyTabs);
  dirtyTabs.clear();
  const items = {};
  const removeKeys = [];
  for (const tabId of tabs) {
    const cap = store.getCapture(tabId);
    if (cap) items[`${STORAGE_KEY_PREFIX}${tabId}`] = cap;
    else removeKeys.push(`${STORAGE_KEY_PREFIX}${tabId}`);
  }
  try {
    if (Object.keys(items).length) await ext.storage.session.set(items);
    if (removeKeys.length) await ext.storage.session.remove(removeKeys);
  } catch (e) {
    console.warn('[acdl-debugger] session storage flush failed', e);
  }
}

async function rehydrate() {
  try {
    const all = await ext.storage.session.get(null);
    for (const [key, value] of Object.entries(all)) {
      if (!key.startsWith(STORAGE_KEY_PREFIX)) continue;
      const tabId = Number(key.slice(STORAGE_KEY_PREFIX.length));
      if (Number.isFinite(tabId)) store.replaceCapture(tabId, value);
    }
  } catch (e) {
    console.warn('[acdl-debugger] rehydrate failed', e);
  }
}

const ready = rehydrate();

/** @type {Map<number, Set<chrome.runtime.Port>>} */
const panelPorts = new Map();

function broadcast(tabId, msg) {
  const set = panelPorts.get(tabId);
  if (!set) return;
  for (const port of set) {
    try { port.postMessage(msg); } catch { /* port closed */ }
  }
}

// Toolbar action opens the panel: Chrome side panel, Firefox sidebar (Safari uses a popup).
ext.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});
if (ext.sidebarAction) ext.action.onClicked.addListener(() => ext.sidebarAction.toggle());

// Drop captures when a tab closes.
ext.tabs.onRemoved.addListener((tabId) => {
  ready.then(() => {
    store.dropTab(tabId);
    markDirty(tabId);
    broadcast(tabId, { type: 'tab-closed', tabId });
    panelPorts.delete(tabId);
  });
});

function handlePageMessage(tabId, msg) {
  if (msg.type === 'event') {
    const r = store.appendEvent(tabId, msg.payload);
    markDirty(tabId);
    broadcast(tabId, { type: 'event-appended', tabId, event: msg.payload });
    if (r.trimmed > 0) broadcast(tabId, { type: 'trimmed', tabId, count: r.trimmed });
  } else if (msg.type === 'page-load') {
    store.addPageLoad(tabId, { ...msg.payload, acdlDetected: false });
    markDirty(tabId);
    broadcast(tabId, { type: 'page-load-added', tabId, pageLoad: msg.payload });
  } else if (msg.type === 'detection') {
    const cap = store.getCapture(tabId);
    if (cap) {
      const page = cap.pages.find(p => p.pageLoadId === msg.payload.pageLoadId);
      if (page) page.acdlDetected = !!msg.payload.acdlDetected;
    }
    markDirty(tabId);
    broadcast(tabId, { type: 'detection-updated', tabId, payload: msg.payload });
  }
}

// Receive page-world messages forwarded by content.js
ext.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.kind !== 'page-message') return;
  const tabId = sender?.tab?.id;
  if (typeof tabId !== 'number') return;
  ready.then(() => handlePageMessage(tabId, msg));
});

// Side panel connects via long-lived port to receive live updates.
// Its periodic 'ping' messages need no reply; receiving them keeps this worker alive.
ext.runtime.onConnect.addListener((port) => {
  if (port.name !== 'acdl-debugger-sidepanel') return;

  let subscribedTabId = null;
  let disconnected = false;

  port.onMessage.addListener((msg) => {
    if (msg.type !== 'subscribe') return;
    ready.then(() => {
      if (disconnected) return;
      if (subscribedTabId !== null) panelPorts.get(subscribedTabId)?.delete(port);
      subscribedTabId = msg.tabId;
      if (!panelPorts.has(subscribedTabId)) panelPorts.set(subscribedTabId, new Set());
      panelPorts.get(subscribedTabId).add(port);
      port.postMessage({ type: 'snapshot', tabId: subscribedTabId, capture: store.getCapture(subscribedTabId) || null });
    });
  });

  port.onDisconnect.addListener(() => {
    disconnected = true;
    if (subscribedTabId !== null) panelPorts.get(subscribedTabId)?.delete(port);
  });
});

const requestHandlers = {
  clear({ tabId }) {
    store.clearTab(tabId);
    markDirty(tabId);
    broadcast(tabId, { type: 'cleared', tabId });
    return { ok: true };
  },

  annotate({ tabId, seq, label, note }) {
    const result = store.setAnnotation(tabId, seq, { label, note });
    if (!result) return { ok: false, error: 'not-found' };
    markDirty(tabId);
    broadcast(tabId, { type: 'annotation-updated', tabId, seq, annotation: result.removed ? null : result });
    return { ok: true };
  },

  export({ tabId }) {
    const cap = store.getCapture(tabId);
    if (!cap) return { ok: false, error: 'no-capture' };
    const envelope = buildExportEnvelope({
      capture: cap,
      extensionVersion: ext.runtime.getManifest().version,
      userAgent: navigator.userAgent,
      exportedAt: new Date().toISOString()
    });
    return { ok: true, envelope };
  }
};

// Requests from the side panel. Page-forwarded messages are ignored: pages can post arbitrary types.
ext.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.kind === 'page-message' || !Object.hasOwn(requestHandlers, msg.type)) return;
  ready.then(() => sendResponse(requestHandlers[msg.type](msg)));
  return true;
});
