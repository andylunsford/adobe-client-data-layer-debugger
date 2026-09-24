import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPanelConnection } from '../src/lib/panel-connection.js';

function makeFakePort() {
  const messageListeners = [];
  const disconnectListeners = [];
  return {
    sent: [],
    disconnected: false,
    postMessage(msg) {
      if (this.disconnected) throw new Error('Attempting to use a disconnected port object');
      this.sent.push(msg);
    },
    onMessage: { addListener: (fn) => messageListeners.push(fn) },
    onDisconnect: { addListener: (fn) => disconnectListeners.push(fn) },
    receive(msg) { messageListeners.forEach(fn => fn(msg)); },
    drop() {
      this.disconnected = true;
      disconnectListeners.forEach(fn => fn(this));
    }
  };
}

describe('createPanelConnection', () => {
  let ports, connect, onMessage, onReconnecting;

  beforeEach(() => {
    vi.useFakeTimers();
    ports = [];
    connect = vi.fn(() => {
      const port = makeFakePort();
      ports.push(port);
      return port;
    });
    onMessage = vi.fn();
    onReconnecting = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const create = () => createPanelConnection({
    connect, onMessage, onReconnecting, heartbeatMs: 1000, retryDelaysMs: [0, 100, 500]
  });

  it('connects immediately and subscribes to a tab', () => {
    const conn = create();
    expect(connect).toHaveBeenCalledTimes(1);
    conn.subscribe(5);
    expect(ports[0].sent).toEqual([{ type: 'subscribe', tabId: 5 }]);
  });

  it('forwards incoming messages', () => {
    create();
    ports[0].receive({ type: 'snapshot', tabId: 5 });
    expect(onMessage).toHaveBeenCalledWith({ type: 'snapshot', tabId: 5 });
  });

  it('sends a ping every heartbeat interval', () => {
    create();
    vi.advanceTimersByTime(2500);
    expect(ports[0].sent).toEqual([{ type: 'ping' }, { type: 'ping' }]);
  });

  it('reconnects after a disconnect and re-subscribes the current tab', () => {
    const conn = create();
    conn.subscribe(5);
    ports[0].drop();
    expect(onReconnecting).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(0);
    expect(connect).toHaveBeenCalledTimes(2);
    expect(ports[1].sent).toEqual([{ type: 'subscribe', tabId: 5 }]);
  });

  it('stops pinging a dropped port', () => {
    create();
    ports[0].drop();
    vi.advanceTimersByTime(0);
    vi.advanceTimersByTime(1000);
    expect(ports[0].sent).toEqual([]);
    expect(ports[1].sent).toEqual([{ type: 'ping' }]);
  });

  it('remembers a tab subscribed while disconnected', () => {
    const conn = create();
    ports[0].drop();
    conn.subscribe(9);
    vi.advanceTimersByTime(0);
    expect(ports[1].sent).toEqual([{ type: 'subscribe', tabId: 9 }]);
  });

  it('backs off between failed reconnects and resets after a message', () => {
    create();
    ports[0].drop();
    vi.advanceTimersByTime(0);
    expect(connect).toHaveBeenCalledTimes(2);

    ports[1].drop();
    vi.advanceTimersByTime(99);
    expect(connect).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    expect(connect).toHaveBeenCalledTimes(3);

    ports[2].drop();
    vi.advanceTimersByTime(500);
    expect(connect).toHaveBeenCalledTimes(4);

    ports[3].drop();
    vi.advanceTimersByTime(500);
    expect(connect).toHaveBeenCalledTimes(5);

    ports[4].receive({ type: 'snapshot' });
    ports[4].drop();
    vi.advanceTimersByTime(0);
    expect(connect).toHaveBeenCalledTimes(6);
  });

  it('retries when connect throws', () => {
    connect.mockImplementationOnce(() => { throw new Error('Extension context invalidated'); });
    create();
    expect(ports).toHaveLength(0);
    vi.advanceTimersByTime(0);
    expect(ports).toHaveLength(1);
  });
});
