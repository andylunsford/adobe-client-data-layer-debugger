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
    if (Object.keys(items).length) await chrome.storage.session.set(items);
    if (removeKeys.length) await chrome.storage.session.remove(removeKeys);
  } catch (e) {
    console.warn('[acdl-debugger] session storage flush failed', e);
  }
}

async function rehydrate() {
  try {
    const all = await chrome.storage.session.get(null);
    for (const [key, value] of Object.entries(all)) {
      if (!key.startsWith(STORAGE_KEY_PREFIX)) continue;
      const tabId = Number(key.slice(STORAGE_KEY_PREFIX.length));
      if (Number.isFinite(tabId)) store.replaceCapture(tabId, value);
    }
  } catch (e) {
    console.warn('[acdl-debugger] rehydrate failed', e);
  }
}

rehydrate();

/** @type {Map<number, Set<chrome.runtime.Port>>} */
const panelPorts = new Map();

function broadcast(tabId, msg) {
  const set = panelPorts.get(tabId);
  if (!set) return;
  for (const port of set) {
    try { port.postMessage(msg); } catch { /* port closed */ }
  }
}

// Allow opening side panel by clicking the toolbar action.
chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});

// Drop captures when a tab closes.
chrome.tabs.onRemoved.addListener((tabId) => {
  store.dropTab(tabId);
  markDirty(tabId);
  broadcast(tabId, { type: 'tab-closed' });
  panelPorts.delete(tabId);
});

// Clear capture on each new top-level navigation so each page starts fresh.
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) return;
  store.clearTab(details.tabId);
  markDirty(details.tabId);
  broadcast(details.tabId, { type: 'cleared', tabId: details.tabId });
});

// Receive page-world messages forwarded by content.js
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.kind !== 'page-message') return;
  const tabId = sender?.tab?.id;
  if (typeof tabId !== 'number') return;

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
});

// Side panel connects via long-lived port to receive live updates.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'acdl-debugger-sidepanel') return;

  let subscribedTabId = null;

  port.onMessage.addListener((msg) => {
    if (msg.type === 'subscribe') {
      if (subscribedTabId !== null) {
        panelPorts.get(subscribedTabId)?.delete(port);
      }
      subscribedTabId = msg.tabId;
      if (!panelPorts.has(subscribedTabId)) panelPorts.set(subscribedTabId, new Set());
      panelPorts.get(subscribedTabId).add(port);
      port.postMessage({ type: 'snapshot', tabId: subscribedTabId, capture: store.getCapture(subscribedTabId) || null });
    }
  });

  port.onDisconnect.addListener(() => {
    if (subscribedTabId !== null) {
      panelPorts.get(subscribedTabId)?.delete(port);
    }
  });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg) return;

  if (msg.type === 'clear') {
    const { tabId } = msg;
    store.clearTab(tabId);
    markDirty(tabId);
    broadcast(tabId, { type: 'cleared', tabId });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'export') {
    const { tabId } = msg;
    const cap = store.getCapture(tabId);
    if (!cap) {
      sendResponse({ ok: false, error: 'no-capture' });
      return true;
    }
    const envelope = buildExportEnvelope({
      capture: cap,
      extensionVersion: chrome.runtime.getManifest().version,
      userAgent: navigator.userAgent,
      exportedAt: new Date().toISOString()
    });
    sendResponse({ ok: true, envelope });
    return true;
  }
});
