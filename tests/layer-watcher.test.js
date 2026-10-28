// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLayerWatcher } from '../src/lib/layer-watcher.js';

function makeFakeAcdl() {
  const arr = [];
  const listeners = [];
  const events = [];
  const instance = {
    addEventListener(type, handler) {
      listeners.push({ type, handler });
      for (const e of events) if (e.type === type) handler(e.item);
    },
    getState: () => ({})
  };
  arr.push = (item) => {
    if (typeof item === 'function') { item(instance); return arr.length; }
    const type = item.event ? 'adobeDataLayer:event' : 'adobeDataLayer:change';
    events.push({ type, item });
    for (const l of listeners) if (l.type === type) l.handler(item);
    return arr.length;
  };
  return arr;
}

describe('createLayerWatcher', () => {
  let root;
  let onCapture;
  let onDetection;
  beforeEach(() => {
    vi.useFakeTimers();
    root = {};
    onCapture = vi.fn();
    onDetection = vi.fn();
  });

  const watcher = () => createLayerWatcher({ root, onCapture, onDetection, timeoutMs: 1000 });

  it('captures from a renamed layer and tags each event with its source name', async () => {
    root.myDataLayer = makeFakeAcdl();
    watcher().watch(['adobeDataLayer', 'myDataLayer']);
    root.myDataLayer.push({ event: 'cta.click' });
    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(onCapture.mock.calls[0][0]).toMatchObject({ eventName: 'cta.click', dataLayer: 'myDataLayer' });
  });

  it('captures once when two names point at the same ACDL instance', async () => {
    root.adobeDataLayer = makeFakeAcdl();
    root.myDataLayer = root.adobeDataLayer;
    watcher().watch(['adobeDataLayer', 'myDataLayer']);
    root.myDataLayer.push({ event: 'cta.click' });
    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(onCapture.mock.calls[0][0].dataLayer).toBe('adobeDataLayer');
  });

  it('reports detected once, as soon as any watched name is found', async () => {
    root.myDataLayer = makeFakeAcdl();
    watcher().watch(['adobeDataLayer', 'myDataLayer']);
    await vi.advanceTimersByTimeAsync(2000);
    expect(onDetection).toHaveBeenCalledTimes(1);
    expect(onDetection).toHaveBeenCalledWith({ acdlDetected: true, dataLayer: 'myDataLayer' });
  });

  it('reports not detected only after every watched name has timed out', async () => {
    watcher().watch(['adobeDataLayer', 'myDataLayer']);
    await vi.advanceTimersByTimeAsync(1100);
    expect(onDetection).toHaveBeenCalledTimes(1);
    expect(onDetection).toHaveBeenCalledWith({ acdlDetected: false, reason: 'timeout' });
  });

  it('flips to detected when a name added later is found', async () => {
    const w = watcher();
    w.watch(['adobeDataLayer']);
    await vi.advanceTimersByTimeAsync(1100);
    root.lateLayer = makeFakeAcdl();
    w.watch(['adobeDataLayer', 'lateLayer']);
    expect(onDetection).toHaveBeenLastCalledWith({ acdlDetected: true, dataLayer: 'lateLayer' });
  });

  it('ignores names it already watches', async () => {
    root.adobeDataLayer = makeFakeAcdl();
    const w = watcher();
    w.watch(['adobeDataLayer']);
    w.watch(['adobeDataLayer']);
    root.adobeDataLayer.push({ event: 'x' });
    expect(onCapture).toHaveBeenCalledTimes(1);
  });
});
