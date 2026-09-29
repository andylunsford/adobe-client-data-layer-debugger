import { ext } from './ext.js';

(function inject() {
  const s = document.createElement('script');
  s.src = ext.runtime.getURL('inject.js');
  s.async = false;
  (document.head || document.documentElement).appendChild(s);
  s.remove();
})();

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== 'acdl-debugger') return;
  try {
    ext.runtime.sendMessage({ kind: 'page-message', type: data.type, payload: data.payload })?.catch?.(() => {});
  } catch {
    // Service worker may be evicting; messages will be retried via events anyway.
  }
});
