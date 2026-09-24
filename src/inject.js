import { installAcdlHook } from './lib/acdl-hook.js';
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

installAcdlHook({
  getDataLayer: () => window.adobeDataLayer,
  onCapture: (e) => {
    post('event', {
      ...e,
      index: nextIndex++,
      pageLoadId,
      pageURL: location.href,
      pageTitle: document.title
    });
  },
  onDetectionResult: (result) => {
    post('detection', { pageLoadId, ...result });
  }
});
