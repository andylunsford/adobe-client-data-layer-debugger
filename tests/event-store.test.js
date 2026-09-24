import { describe, it, expect, beforeEach } from 'vitest';
import { createEventStore } from '../src/lib/event-store.js';

const evt = (i) => ({
  index: i,
  timestamp: '2026-04-27T15:30:42.123Z',
  pageLoadId: 'pl_a1b2c3',
  pageURL: 'https://example.com/',
  pageTitle: 'Example',
  eventType: 'adobeDataLayer:event',
  eventName: 'cart.add',
  message: { event: 'cart.add' },
  state: { cart: { items: 1 } },
  stateSerialization: 'structuredClone'
});

const evtOnPage = (i, pageLoadId) => ({ ...evt(i), pageLoadId });

describe('eventStore', () => {
  let store;
  beforeEach(() => {
    store = createEventStore({ maxEventsPerTab: 5, trimChunk: 2 });
  });

  it('creates a TabCapture on first append', () => {
    const r = store.appendEvent(7, evt(1));
    expect(r).toEqual({ trimmed: 0, seq: 1 });
    const cap = store.getCapture(7);
    expect(cap.tabId).toBe(7);
    expect(cap.events).toHaveLength(1);
    expect(cap.pages).toEqual([]);
    expect(typeof cap.captureStart).toBe('string');
  });

  it('appends multiple events in order', () => {
    store.appendEvent(7, evt(1));
    store.appendEvent(7, evt(2));
    store.appendEvent(7, evt(3));
    expect(store.getCapture(7).events.map(e => e.index)).toEqual([1, 2, 3]);
  });

  it('keeps tabs isolated', () => {
    store.appendEvent(7, evt(1));
    store.appendEvent(8, evt(99));
    expect(store.getCapture(7).events).toHaveLength(1);
    expect(store.getCapture(8).events[0].index).toBe(99);
  });

  it('FIFO-trims oldest events when exceeding cap', () => {
    for (let i = 1; i <= 5; i++) store.appendEvent(7, evt(i));
    const r = store.appendEvent(7, evt(6));
    expect(r).toEqual({ trimmed: 2, seq: 6 });
    const cap = store.getCapture(7);
    expect(cap.events.map(e => e.index)).toEqual([3, 4, 5, 6]);
  });

  it('addPageLoad appends to pages and creates capture if missing', () => {
    store.addPageLoad(7, { pageLoadId: 'pl_x', url: 'u', title: 't', loadedAt: 'now', acdlDetected: true });
    const cap = store.getCapture(7);
    expect(cap.pages).toHaveLength(1);
    expect(cap.events).toEqual([]);
  });

  it('clearTab drops the entry', () => {
    store.appendEvent(7, evt(1));
    store.clearTab(7);
    expect(store.getCapture(7)).toBeUndefined();
  });

  it('replaceCapture installs a hydrated capture', () => {
    const hydrated = {
      tabId: 7, captureStart: 'now', pages: [{ pageLoadId: 'pl_h' }], events: [evt(50)]
    };
    store.replaceCapture(7, hydrated);
    expect(store.getCapture(7)).toEqual(hydrated);
  });

  it('serializeAll returns a snapshot object keyed by tabId', () => {
    store.appendEvent(7, evt(1));
    store.appendEvent(8, evt(2));
    const snap = store.serializeAll();
    expect(Object.keys(snap).sort()).toEqual(['7', '8']);
    expect(snap[7].events[0].index).toBe(1);
  });

  it('assigns a tab-wide seq that keeps increasing across page loads', () => {
    store = createEventStore();
    store.appendEvent(7, evtOnPage(1, 'pl_a'));
    store.appendEvent(7, evtOnPage(2, 'pl_a'));
    store.appendEvent(7, evtOnPage(1, 'pl_b'));
    const events = store.getCapture(7).events;
    expect(events.map(e => e.seq)).toEqual([1, 2, 3]);
    expect(events.map(e => e.index)).toEqual([1, 2, 1]);
  });

  it('keeps seq independent per tab', () => {
    store.appendEvent(7, evt(1));
    store.appendEvent(7, evt(2));
    expect(store.appendEvent(8, evt(1)).seq).toBe(1);
  });

  it('restarts seq at 1 after clearTab', () => {
    store.appendEvent(7, evt(1));
    store.appendEvent(7, evt(2));
    store.clearTab(7);
    expect(store.appendEvent(7, evt(1)).seq).toBe(1);
  });

  it('continues seq after a serialize/replaceCapture round-trip', () => {
    store.appendEvent(7, evt(1));
    store.appendEvent(7, evt(2));
    const persisted = JSON.parse(JSON.stringify(store.getCapture(7)));
    const revived = createEventStore();
    revived.replaceCapture(7, persisted);
    expect(revived.appendEvent(7, evt(3)).seq).toBe(3);
  });
});
