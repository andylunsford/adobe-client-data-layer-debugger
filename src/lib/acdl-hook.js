import { safeClone } from './safe-clone.js';

export function installAcdlHook({ getDataLayer, onCapture, onDetectionResult, claim = () => true, timeoutMs = 5000, pollIntervalMs = 100 }) {
  let installed = false;
  let detected = false;
  let elapsed = 0;

  function tryInstall() {
    if (installed) return true;
    const dl = getDataLayer();
    if (!dl || typeof dl.push !== 'function') return false;

    dl.push(function (acdl) {
      if (!claim(acdl)) return;
      const capture = (event, eventType) => {
        const eventClone = safeClone(event);
        const stateClone = safeClone(acdl.getState());
        onCapture({
          eventType,
          eventName: event && event.event ? event.event : null,
          message: eventClone.value,
          state: stateClone.value,
          stateSerialization: stateClone.mode,
          timestamp: new Date().toISOString()
        });
      };
      acdl.addEventListener('adobeDataLayer:event', (event) => {
        capture(event, 'adobeDataLayer:event');
      }, { scope: 'all', path: '' });
      acdl.addEventListener('adobeDataLayer:change', (event) => {
        // Skip event-type pushes — already handled by the :event listener above.
        if (event && event.event) return;
        capture(event, 'adobeDataLayer:change');
      }, { scope: 'all' });
    });

    installed = true;
    detected = true;
    onDetectionResult({ acdlDetected: true });
    return true;
  }

  if (tryInstall()) return;

  const interval = setInterval(() => {
    elapsed += pollIntervalMs;
    if (tryInstall()) {
      clearInterval(interval);
      return;
    }
    if (elapsed >= timeoutMs) {
      clearInterval(interval);
      if (!detected) onDetectionResult({ acdlDetected: false, reason: 'timeout' });
    }
  }, pollIntervalMs);
}
