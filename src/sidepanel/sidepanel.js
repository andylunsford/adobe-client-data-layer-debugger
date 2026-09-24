const els = {
  status: document.getElementById('status'),
  clear: document.getElementById('clear'),
  export: document.getElementById('export'),
  list: document.getElementById('event-list'),
  empty: document.getElementById('empty'),
  detailMessage: document.getElementById('detail-message'),
  detailState: document.getElementById('detail-state'),
  tabs: document.querySelectorAll('.tab')
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

let port = null;
let activeTabId = null;
let panelWindowId = null;
let capture = null;
let selectedIndex = null;

function setStatus(text) { els.status.textContent = text; }

function renderAll() {
  els.list.innerHTML = '';
  if (!capture || capture.events.length === 0) {
    els.empty.classList.remove('hidden');
    els.detailMessage.textContent = '';
    els.detailState.textContent = '';
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
  if (selectedIndex !== null) selectByIndex(selectedIndex);
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
  li.dataset.index = String(ev.index);
  const name = document.createElement('span');
  name.className = 'event-name';
  name.textContent = ev.eventName ? ev.eventName : `(${ev.eventType})`;
  const meta = document.createElement('span');
  meta.className = 'event-meta';
  meta.textContent = `#${ev.index} · ${formatTime(ev.timestamp)}${ev.stateSerialization === 'fallback' ? ' · fallback' : ''}`;
  li.append(name, meta);
  li.addEventListener('click', () => selectByIndex(ev.index));
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

function highlightJson(value) {
  const escaped = JSON.stringify(value, null, 2)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.replace(
    /("(?:\\u[0-9a-fA-F]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false)\b|\bnull\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      if (match.startsWith('"')) return `<span class="${match.endsWith(':') ? 'jk' : 'js'}">${match}</span>`;
      if (match === 'true' || match === 'false') return `<span class="jb">${match}</span>`;
      if (match === 'null') return `<span class="jl">${match}</span>`;
      return `<span class="jn">${match}</span>`;
    }
  );
}

function selectByIndex(index) {
  selectedIndex = index;
  for (const li of els.list.querySelectorAll('li[data-index]')) {
    li.classList.toggle('is-selected', li.dataset.index === String(index));
  }
  const ev = capture.events.find(e => e.index === index);
  if (!ev) return;
  els.detailMessage.innerHTML = highlightJson(ev.message);
  els.detailState.innerHTML = highlightJson(ev.state);
}

function formatTime(iso) {
  return iso.slice(11, 23);
}

function connectAndSubscribe(tabId) {
  if (port) port.disconnect();
  port = chrome.runtime.connect({ name: 'acdl-debugger-sidepanel' });
  port.onMessage.addListener(handleMessage);
  port.onDisconnect.addListener(() => { port = null; });
  port.postMessage({ type: 'subscribe', tabId });
}

function handleMessage(msg) {
  if (msg.type === 'snapshot') {
    capture = msg.capture || { tabId: msg.tabId, captureStart: '', pages: [], events: [] };
    selectedIndex = null;
    hideBanner();
    setStatus(capture.events.length ? `${capture.events.length} events captured` : 'Listening…');
    renderAll();
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
    capture = { tabId: activeTabId, captureStart: new Date().toISOString(), pages: [], events: [] };
    selectedIndex = null;
    setStatus('Listening…');
    renderAll();
  } else if (msg.type === 'tab-closed') {
    capture = null;
    setStatus('Tab closed.');
    renderAll();
  } else if (msg.type === 'trimmed') {
    setStatus(`${capture.events.length} events captured · trimmed ${msg.count} oldest`);
    showBanner(`Capture trimmed: ${msg.count} oldest events dropped to stay under memory limits.`);
    setTimeout(hideBanner, 8000);
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
  await chrome.runtime.sendMessage({ type: 'clear', tabId: activeTabId });
});

els.export.addEventListener('click', async () => {
  if (activeTabId === null) return;
  const resp = await chrome.runtime.sendMessage({ type: 'export', tabId: activeTabId });
  if (!resp || !resp.ok) {
    setStatus('Nothing to export.');
    return;
  }
  const blob = new Blob([JSON.stringify(resp.envelope, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const host = safeHostFromCapture(resp.envelope) || 'capture';
  const stamp = resp.envelope.exportedAt.replace(/[:.]/g, '-');
  await chrome.downloads.download({
    url,
    filename: `acdl-capture-${host}-${stamp}.json`,
    saveAs: true
  });
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
});

function safeHostFromCapture(env) {
  const firstPage = env.pages[0];
  if (!firstPage || !firstPage.url) return null;
  try { return new URL(firstPage.url).hostname.replace(/^www\./, ''); }
  catch { return null; }
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    setStatus('No active tab.');
    return;
  }
  panelWindowId = tab.windowId;
  activeTabId = tab.id;
  connectAndSubscribe(activeTabId);
}

chrome.tabs.onActivated.addListener(async (info) => {
  if (panelWindowId !== null && info.windowId !== panelWindowId) return;
  activeTabId = info.tabId;
  connectAndSubscribe(activeTabId);
});

init();
