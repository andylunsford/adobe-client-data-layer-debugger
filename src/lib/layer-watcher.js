import { installAcdlHook } from './acdl-hook.js';

export function createLayerWatcher({ root, onCapture, onDetection, timeoutMs }) {
  const status = new Map();
  const claimed = new WeakSet();
  let reportedDetected = false;
  let reportedMissing = false;

  function settle(name) {
    if (!reportedDetected && status.get(name) === 'detected') {
      reportedDetected = true;
      onDetection({ acdlDetected: true, dataLayer: name });
    } else if (!reportedDetected && !reportedMissing && [...status.values()].every(s => s === 'missing')) {
      reportedMissing = true;
      onDetection({ acdlDetected: false, reason: 'timeout' });
    }
  }

  function claim(acdl) {
    if (claimed.has(acdl)) return false;
    claimed.add(acdl);
    return true;
  }

  function watch(names) {
    for (const name of names) {
      if (status.has(name)) continue;
      status.set(name, 'pending');
      installAcdlHook({
        getDataLayer: () => root[name],
        claim,
        timeoutMs,
        onCapture: (e) => onCapture({ ...e, dataLayer: name }),
        onDetectionResult: ({ acdlDetected }) => {
          status.set(name, acdlDetected ? 'detected' : 'missing');
          settle(name);
        }
      });
    }
  }

  return { watch };
}
