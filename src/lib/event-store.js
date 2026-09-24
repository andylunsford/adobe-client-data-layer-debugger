const MAX_LABEL_LENGTH = 60;
const MAX_NOTE_LENGTH = 2000;

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

    setAnnotation(tabId, seq, { label = '', note = '' } = {}, now = new Date().toISOString()) {
      const event = tabs.get(tabId)?.events.find(e => e.seq === seq);
      if (!event) return null;
      const clean = {
        label: label.trim().slice(0, MAX_LABEL_LENGTH),
        note: note.trim().slice(0, MAX_NOTE_LENGTH)
      };
      if (!clean.label && !clean.note) {
        delete event.annotation;
        return { removed: true };
      }
      event.annotation = { ...clean, updatedAt: now };
      return event.annotation;
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
