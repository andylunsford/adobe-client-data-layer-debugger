export function buildExportEnvelope({ capture, extensionVersion, userAgent, exportedAt }) {
  const captureEnd = capture.events.length === 0 ? capture.captureStart : exportedAt;
  return {
    schemaVersion: '1.0',
    extensionVersion,
    exportedAt,
    captureStart: capture.captureStart,
    captureEnd,
    userAgent,
    tabId: capture.tabId,
    pages: capture.pages,
    events: capture.events
  };
}
