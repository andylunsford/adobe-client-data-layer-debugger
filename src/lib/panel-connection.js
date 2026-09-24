export function createPanelConnection({
  connect,
  onMessage,
  onReconnecting = () => {},
  heartbeatMs = 20_000,
  retryDelaysMs = [0, 250, 1000, 2000, 5000]
}) {
  let port = null;
  let tabId = null;
  let heartbeat = null;
  let attempt = 0;

  function post(msg) {
    if (!port) return;
    try {
      port.postMessage(msg);
    } catch {
      // Port died between checks; onDisconnect will reconnect.
    }
  }

  function open() {
    try {
      port = connect();
    } catch {
      scheduleRetry();
      return;
    }
    port.onMessage.addListener((msg) => {
      attempt = 0;
      onMessage(msg);
    });
    port.onDisconnect.addListener(handleDisconnect);
    heartbeat = setInterval(() => post({ type: 'ping' }), heartbeatMs);
    if (tabId !== null) post({ type: 'subscribe', tabId });
  }

  function handleDisconnect() {
    clearInterval(heartbeat);
    heartbeat = null;
    port = null;
    onReconnecting();
    scheduleRetry();
  }

  function scheduleRetry() {
    const delay = retryDelaysMs[Math.min(attempt, retryDelaysMs.length - 1)];
    attempt += 1;
    setTimeout(open, delay);
  }

  open();

  return {
    subscribe(nextTabId) {
      tabId = nextTabId;
      post({ type: 'subscribe', tabId });
    }
  };
}
