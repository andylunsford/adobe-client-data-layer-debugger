import { ext } from '../ext.js';
import { highlightJsonTokens } from '../lib/json-highlight.js';
import { createPanelConnection } from '../lib/panel-connection.js';
import { applyTheme, loadTheme, nextTheme, saveTheme } from '../lib/theme.js';

const els = {
  status: document.getElementById('status'),
  theme: document.getElementById('theme'),
  clear: document.getElementById('clear'),
  export: document.getElementById('export'),
  list: document.getElementById('event-list'),
  empty: document.getElementById('empty'),
  detailMessage: document.getElementById('detail-message'),
  detailState: document.getElementById('detail-state'),
  tabs: document.querySelectorAll('.tab'),
  annForm: document.getElementById('annotation'),
  annLabel: document.getElementById('ann-label'),
  annNote: document.getElementById('ann-note'),
  eventsPane: document.querySelector('.events')
};

els.banner = document.getElementById('banner');

function showBanner(text) {
  els.banner.textContent = text;
  els.banner.classList.remove('hidden');
}
function hideBanner() {
  els.banner.classList.add('hidden');
  els.banner.textContent = '';
}

let connection = null;
let activeTabId = null;
let panelWindowId = null;
let capture = null;
let selectedSeq = null;

function setStatus(text) { els.status.textContent = text; }

const ANNOTATION_SAVE_DEBOUNCE_MS = 400;
let saveTimer = null;
let lastSaved = { label: '', note: '' };

function formValues() {
  return { label: els.annLabel.value.trim(), note: els.annNote.value.trim() };
}

function isEditingAnnotation() {
  return document.activeElement === els.annLabel || document.activeElement === els.annNote;
}

function loadAnnotationForm(ev) {
  lastSaved = { label: ev?.annotation?.label || '', note: ev?.annotation?.note || '' };
  els.annLabel.value = lastSaved.label;
  els.annNote.value = lastSaved.note;
  els.annLabel.disabled = els.annNote.disabled = !ev;
  els.annLabel.placeholder = ev ? 'Label (e.g. clicked Apply CTA)' : 'Select an event to annotate';
  els.annNote.placeholder = ev ? 'Note — what triggered this event?' : '';
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, ANNOTATION_SAVE_DEBOUNCE_MS);
}

async function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
  const seq = selectedSeq;
  const tabId = activeTabId;
  if (seq === null || tabId === null) return;
  const values = formValues();
  if (values.label === lastSaved.label && values.note === lastSaved.note) return;
  const previous = lastSaved;
  lastSaved = values;
  try {
    const resp = await ext.runtime.sendMessage({ type: 'annotate', tabId, seq, ...values });
    if (!resp?.ok) setStatus('Event no longer in capture.');
  } catch {
    setStatus('Annotation save failed — edit again to retry.');
    if (selectedSeq === seq && activeTabId === tabId) lastSaved = previous;
  }
}

function renderRowAnnotation(li, ev) {
  li.querySelector('.event-annotation')?.remove();
  li.title = ev.annotation?.note || '';
  if (!ev.annotation) return;
  const tag = document.createElement('span');
  tag.className = 'event-annotation';
  tag.textContent = ev.annotation.label || '📝 note';
  li.insertBefore(tag, li.querySelector('.event-meta'));
}

els.annForm.addEventListener('submit', (e) => { e.preventDefault(); flushSave(); });
els.annLabel.addEventListener('input', scheduleSave);
els.annNote.addEventListener('input', scheduleSave);
els.annLabel.addEventListener('blur', flushSave);
els.annNote.addEventListener('blur', flushSave);

function renderAll() {
  els.list.innerHTML = '';
  if (!capture || capture.events.length === 0) {
    els.empty.classList.remove('hidden');
    els.detailMessage.textContent = '';
    els.detailState.textContent = '';
    loadAnnotationForm(null);
    return;
  }
  els.empty.classList.add('hidden');

  const pageMap = new Map(capture.pages.map(p => [p.pageLoadId, p]));
  const seenPages = new Set();
  for (const ev of capture.events) {
    if (!seenPages.has(ev.pageLoadId)) {
      seenPages.add(ev.pageLoadId);
      const page = pageMap.get(ev.pageLoadId);
      if (page) appendPageDivider(page);
    }
    appendEventRow(ev);
  }
  if (selectedSeq !== null) selectBySeq(selectedSeq);
}

function appendPageDivider(page) {
  const li = document.createElement('li');
  li.className = 'page-divider';
  li.dataset.pageLoadId = page.pageLoadId;
  li.textContent = `${page.title || page.url} ${page.acdlDetected ? '' : '(no ACDL detected)'}`.trim();
  els.list.appendChild(li);
}

function updatePageDivider(page) {
  const li = els.list.querySelector(`li.page-divider[data-page-load-id="${page.pageLoadId}"]`);
  if (li) li.textContent = `${page.title || page.url} ${page.acdlDetected ? '' : '(no ACDL detected)'}`.trim();
}

function appendEventRow(ev) {
  const li = document.createElement('li');
  li.dataset.seq = String(ev.seq);
  const name = document.createElement('span');
  name.className = 'event-name';
  name.textContent = ev.eventName ? ev.eventName : `(${ev.eventType})`;
  const meta = document.createElement('span');
  meta.className = 'event-meta';
  meta.textContent = `#${ev.index} · ${formatTime(ev.timestamp)}${ev.stateSerialization === 'fallback' ? ' · fallback' : ''}`;
  li.append(name, meta);
  li.addEventListener('click', () => selectBySeq(ev.seq));
  renderRowAnnotation(li, ev);
  els.list.appendChild(li);
}

function appendNewEvent(ev) {
  const pageMap = new Map(capture.pages.map(p => [p.pageLoadId, p]));
  const lastEv = capture.events[capture.events.length - 2];
  if (!lastEv || lastEv.pageLoadId !== ev.pageLoadId) {
    const page = pageMap.get(ev.pageLoadId);
    if (page) appendPageDivider(page);
  }
  appendEventRow(ev);
  els.empty.classList.add('hidden');
}

function renderJson(el, value) {
  const frag = document.createDocumentFragment();
  for (const { text, cls } of highlightJsonTokens(value)) {
    if (!cls) {
      frag.append(text);
      continue;
    }
    const span = document.createElement('span');
    span.className = cls;
    span.textContent = text;
    frag.append(span);
  }
  el.replaceChildren(frag);
}

function selectBySeq(seq) {
  const reselecting = seq === selectedSeq;
  if (!reselecting) flushSave();
  selectedSeq = seq;
  for (const li of els.list.querySelectorAll('li[data-seq]')) {
    li.classList.toggle('is-selected', li.dataset.seq === String(seq));
  }
  const ev = capture.events.find(e => e.seq === seq);
  if (!ev || !(reselecting && isEditingAnnotation())) loadAnnotationForm(ev);
  if (!ev) {
    selectedSeq = null;
    els.detailMessage.textContent = '';
    els.detailState.textContent = '';
    return;
  }
  renderJson(els.detailMessage, ev.message);
  renderJson(els.detailState, ev.state);
}

function formatTime(iso) {
  return iso.slice(11, 23);
}

function handleMessage(msg) {
  if (msg.tabId !== undefined && msg.tabId !== activeTabId) return;
  if (msg.type === 'snapshot') {
    const isResync = capture?.tabId === msg.tabId;
    const scrollTop = isResync ? els.eventsPane.scrollTop : 0;
    if (!isResync) {
      clearTimeout(saveTimer);
      saveTimer = null;
      selectedSeq = null;
      loadAnnotationForm(null);
    }
    capture = msg.capture || { tabId: msg.tabId, captureStart: '', pages: [], events: [] };
    hideBanner();
    setStatus(capture.events.length ? `${capture.events.length} events captured` : 'Listening…');
    renderAll();
    els.eventsPane.scrollTop = scrollTop;
  } else if (msg.type === 'event-appended') {
    if (!capture) return;
    capture.events.push(msg.event);
    setStatus(`${capture.events.length} events captured`);
    appendNewEvent(msg.event);
  } else if (msg.type === 'page-load-added') {
    if (!capture) return;
    capture.pages.push({ ...msg.pageLoad, acdlDetected: false });
  } else if (msg.type === 'detection-updated') {
    if (!capture) return;
    const page = capture.pages.find(p => p.pageLoadId === msg.payload.pageLoadId);
    if (page) {
      page.acdlDetected = !!msg.payload.acdlDetected;
      updatePageDivider(page);
    }
    if (msg.payload.acdlDetected === false) {
      setStatus('No Adobe Client Data Layer detected on this page.');
      showBanner('No Adobe Client Data Layer detected on this page.');
    } else {
      hideBanner();
    }
  } else if (msg.type === 'cleared') {
    clearTimeout(saveTimer);
    saveTimer = null;
    capture = { tabId: activeTabId, captureStart: new Date().toISOString(), pages: [], events: [] };
    selectedSeq = null;
    loadAnnotationForm(null);
    setStatus('Listening…');
    renderAll();
  } else if (msg.type === 'tab-closed') {
    clearTimeout(saveTimer);
    saveTimer = null;
    capture = null;
    selectedSeq = null;
    loadAnnotationForm(null);
    setStatus('Tab closed.');
    renderAll();
  } else if (msg.type === 'trimmed') {
    if (!capture) return;
    capture.events.splice(0, msg.count);
    renderAll();
    setStatus(`${capture.events.length} events captured · trimmed ${msg.count} oldest`);
    showBanner(`Capture trimmed: ${msg.count} oldest events dropped to stay under memory limits.`);
    setTimeout(hideBanner, 8000);
  } else if (msg.type === 'annotation-updated') {
    if (!capture) return;
    const ev = capture.events.find(e => e.seq === msg.seq);
    if (!ev) return;
    if (msg.annotation) ev.annotation = msg.annotation;
    else delete ev.annotation;
    const li = els.list.querySelector(`li[data-seq="${msg.seq}"]`);
    if (li) renderRowAnnotation(li, ev);
    if (msg.seq === selectedSeq && !isEditingAnnotation()) loadAnnotationForm(ev);
  }
}

els.tabs.forEach((btn) => {
  btn.addEventListener('click', () => {
    const which = btn.dataset.tab;
    els.tabs.forEach(b => b.classList.toggle('is-active', b === btn));
    els.detailMessage.classList.toggle('hidden', which !== 'message');
    els.detailState.classList.toggle('hidden', which !== 'state');
  });
});

els.clear.addEventListener('click', async () => {
  if (activeTabId === null) return;
  await ext.runtime.sendMessage({ type: 'clear', tabId: activeTabId });
});

els.export.addEventListener('click', async () => {
  if (activeTabId === null) return;
  const resp = await ext.runtime.sendMessage({ type: 'export', tabId: activeTabId });
  if (!resp || !resp.ok) {
    setStatus('Nothing to export.');
    return;
  }
  const blob = new Blob([JSON.stringify(resp.envelope, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const host = safeHostFromCapture(resp.envelope) || 'capture';
  const stamp = resp.envelope.exportedAt.replace(/[:.]/g, '-');
  const filename = `acdl-capture-${host}-${stamp}.json`;
  if (ext.downloads) {
    await ext.downloads.download({ url, filename, saveAs: true });
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
});

function safeHostFromCapture(env) {
  const firstPage = env.pages[0];
  if (!firstPage || !firstPage.url) return null;
  try { return new URL(firstPage.url).hostname.replace(/^www\./, ''); }
  catch { return null; }
}

const THEME_LABELS = { system: 'System', light: 'Light', dark: 'Dark' };
let theme = loadTheme(localStorage);

function renderThemeButton() {
  const label = `Theme: ${THEME_LABELS[theme]}`;
  els.theme.dataset.choice = theme;
  els.theme.title = `${label} (click to change)`;
  els.theme.setAttribute('aria-label', label);
}

els.theme.addEventListener('click', () => {
  theme = nextTheme(theme);
  saveTheme(localStorage, theme);
  applyTheme(document.documentElement, theme);
  renderThemeButton();
});

renderThemeButton();

async function init() {
  connection = createPanelConnection({
    connect: () => {
      const port = ext.runtime.connect({ name: 'acdl-debugger-sidepanel' });
      port.onDisconnect.addListener(() => void ext.runtime.lastError);
      return port;
    },
    onMessage: handleMessage,
    onReconnecting: () => setStatus('Reconnecting…')
  });
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    setStatus('No active tab.');
    return;
  }
  panelWindowId = tab.windowId;
  activeTabId = tab.id;
  connection.subscribe(activeTabId);
}

ext.tabs.onActivated.addListener((info) => {
  if (panelWindowId !== null && info.windowId !== panelWindowId) return;
  flushSave();
  activeTabId = info.tabId;
  connection.subscribe(activeTabId);
});

init();
