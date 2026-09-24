export function createEventStore({ maxEventsPerTab = 5000, trimChunk = 1000 } = {}) {
  const tabs = new Map();

  function ensure(tabId) {
    let cap = tabs.get(tabId);
    if (!cap) {
      cap = {
        tabId,
        captureStart: new Date().toISOString(),
        nextSeq: 1,
        pages: [],
        events: []
      };
      tabs.set(tabId, cap);
    }
    return cap;
  }

  return {
    appendEvent(tabId, event) {
      const cap = ensure(tabId);
      const seq = cap.nextSeq++;
      event.seq = seq;
      cap.events.push(event);
      if (cap.events.length > maxEventsPerTab) {
        cap.events.splice(0, trimChunk);
        return { trimmed: trimChunk, seq };
      }
      return { trimmed: 0, seq };
    },

    addPageLoad(tabId, pageLoad) {
      const cap = ensure(tabId);
      cap.pages.push(pageLoad);
    },

    getCapture(tabId) {
      return tabs.get(tabId);
    },

    clearTab(tabId) {
      tabs.delete(tabId);
    },

    dropTab(tabId) {
      tabs.delete(tabId);
    },

    replaceCapture(tabId, capture) {
      tabs.set(tabId, capture);
    },

    serializeAll() {
      const out = {};
      for (const [tabId, cap] of tabs) out[tabId] = cap;
      return out;
    }
  };
}
