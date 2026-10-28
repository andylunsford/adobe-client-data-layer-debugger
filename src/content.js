import { ext } from './ext.js';
import { LAYER_NAMES_KEY } from './lib/layer-names.js';

(function inject() {
  const s = document.createElement('script');
  s.src = ext.runtime.getURL('inject.js');
  s.async = false;
  (document.head || document.documentElement).appendChild(s);
  s.remove();
})();

async function sendLayerNames() {
  try {
    const { [LAYER_NAMES_KEY]: names = [] } = await ext.storage.local.get(LAYER_NAMES_KEY);
    window.postMessage({ source: 'acdl-debugger-config', type: 'layers', names }, '*');
  } catch {
    // Extension context invalidated (e.g. extension reloaded); nothing to send.
  }
}

sendLayerNames();
ext.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[LAYER_NAMES_KEY]) sendLayerNames();
});

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (data?.source === 'acdl-debugger-config' && data.type === 'request') {
    sendLayerNames();
    return;
  }
  if (!data || data.source !== 'acdl-debugger') return;
  try {
    ext.runtime.sendMessage({ kind: 'page-message', type: data.type, payload: data.payload })?.catch?.(() => {});
  } catch {
    // Service worker may be evicting; messages will be retried via events anyway.
  }
});
