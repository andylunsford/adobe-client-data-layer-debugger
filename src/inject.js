import { createLayerWatcher } from './lib/layer-watcher.js';
import { DEFAULT_LAYER, watchedLayers } from './lib/layer-names.js';
import { makePageLoadId } from './lib/ids.js';

const pageLoadId = makePageLoadId();
let nextIndex = 1;

function post(type, payload) {
  window.postMessage({ source: 'acdl-debugger', type, payload }, '*');
}

post('page-load', {
  pageLoadId,
  url: location.href,
  title: document.title,
  loadedAt: new Date().toISOString()
});

const watcher = createLayerWatcher({
  root: window,
  onCapture: (e) => {
    post('event', {
      ...e,
      index: nextIndex++,
      pageLoadId,
      pageURL: location.href,
      pageTitle: document.title
    });
  },
  onDetection: (result) => {
    post('detection', { pageLoadId, ...result });
  }
});

watcher.watch([DEFAULT_LAYER]);

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (data?.source !== 'acdl-debugger-config' || data.type !== 'layers') return;
  watcher.watch(watchedLayers(data.names));
});
window.postMessage({ source: 'acdl-debugger-config', type: 'request' }, '*');
