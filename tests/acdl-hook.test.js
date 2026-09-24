// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { installAcdlHook } from '../src/lib/acdl-hook.js';

function makeFakeAcdl() {
  const arr = [];
  const listeners = [];
  const events = [];
  let state = {};

  arr.push = function(item) {
    if (typeof item === 'function') {
      item({
        addEventListener(type, handler, options = {}) {
          const scope = options.scope || 'all';
          listeners.push({ type, handler, scope });
          if (scope === 'past' || scope === 'all') {
            for (const e of events) {
              if (e._type === type || (type === 'adobeDataLayer:change' && e._type === 'adobeDataLayer:change')) {
                handler(e._payload);
              }
            }
          }
        },
        getState() { return state; }
      });
      return arr.length;
    }
    const isEvent = !!item.event;
    const type = isEvent ? 'adobeDataLayer:event' : 'adobeDataLayer:change';
    state = { ...state, ...item };
    events.push({ _type: type, _payload: item });
    for (const l of listeners) {
      if (l.type === type && (l.scope === 'future' || l.scope === 'all')) {
        l.handler(item);
      }
    }
    return arr.length;
  };

  return {
    arr,
    setState(s) { state = s; },
    pushEvent(item) { return arr.push(item); }
  };
}

describe('installAcdlHook', () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it('registers and reports detection when ACDL is present immediately', async () => {
    const fake = makeFakeAcdl();
    fake.setState({ user: { id: 1 } });
    const onCapture = vi.fn();
    const onDetection = vi.fn();
    installAcdlHook({
      getDataLayer: () => fake.arr,
      onCapture, onDetectionResult: onDetection
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(onDetection).toHaveBeenCalledWith({ acdlDetected: true });
    expect(onCapture).not.toHaveBeenCalled();
  });

  it('replays past events via scope=all', async () => {
    const fake = makeFakeAcdl();
    fake.pushEvent({ event: 'page.view', page: { name: 'home' } });
    fake.pushEvent({ event: 'cart.add', cart: { items: 1 } });
    const onCapture = vi.fn();
    installAcdlHook({
      getDataLayer: () => fake.arr,
      onCapture, onDetectionResult: () => {}
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(onCapture).toHaveBeenCalledTimes(2);
    expect(onCapture.mock.calls[0][0].eventName).toBe('page.view');
    expect(onCapture.mock.calls[1][0].eventName).toBe('cart.add');
    // getState() returns the accumulated state at replay time (both pushes merged in the fake ACDL).
    // In a real browser each event sees the state at the moment it originally fired.
    const accumulated = { event: 'cart.add', page: { name: 'home' }, cart: { items: 1 } };
    expect(onCapture.mock.calls[0][0].state).toEqual(accumulated);
    expect(onCapture.mock.calls[1][0].state).toEqual(accumulated);
  });

  it('captures future events as they happen', async () => {
    const fake = makeFakeAcdl();
    const onCapture = vi.fn();
    installAcdlHook({
      getDataLayer: () => fake.arr,
      onCapture, onDetectionResult: () => {}
    });
    await vi.advanceTimersByTimeAsync(0);
    fake.pushEvent({ event: 'cta.click', cta: 'subscribe' });
    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(onCapture.mock.calls[0][0].eventType).toBe('adobeDataLayer:event');
    expect(onCapture.mock.calls[0][0].message).toEqual({ event: 'cta.click', cta: 'subscribe' });
  });

  it('reports acdlDetected:false after timeout when ACDL never appears', async () => {
    const onDetection = vi.fn();
    installAcdlHook({
      getDataLayer: () => undefined,
      onCapture: () => {},
      onDetectionResult: onDetection,
      timeoutMs: 1000
    });
    await vi.advanceTimersByTimeAsync(1100);
    expect(onDetection).toHaveBeenCalledWith({ acdlDetected: false, reason: 'timeout' });
  });

  it('detects ACDL that appears after a delay', async () => {
    const fake = makeFakeAcdl();
    let dl = undefined;
    const onDetection = vi.fn();
    const onCapture = vi.fn();
    installAcdlHook({
      getDataLayer: () => dl,
      onCapture, onDetectionResult: onDetection,
      timeoutMs: 5000
    });
    await vi.advanceTimersByTimeAsync(200);
    expect(onDetection).not.toHaveBeenCalled();
    dl = fake.arr;
    await vi.advanceTimersByTimeAsync(200);
    expect(onDetection).toHaveBeenCalledWith({ acdlDetected: true });
  });
});
