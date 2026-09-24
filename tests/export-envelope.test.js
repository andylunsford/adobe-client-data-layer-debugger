import { describe, it, expect } from 'vitest';
import { buildExportEnvelope } from '../src/lib/export-envelope.js';

const sampleCapture = {
  tabId: 42,
  captureStart: '2026-04-27T15:29:00.000Z',
  pages: [
    { pageLoadId: 'pl_a', url: 'https://example.com/a', title: 'A', loadedAt: '2026-04-27T15:29:00.000Z', acdlDetected: true }
  ],
  events: [
    { index: 1, timestamp: '2026-04-27T15:29:30.000Z', pageLoadId: 'pl_a', pageURL: 'https://example.com/a', message: {}, state: {} }
  ]
};

describe('buildExportEnvelope', () => {
  it('produces the documented shape', () => {
    const env = buildExportEnvelope({
      capture: sampleCapture,
      extensionVersion: '0.1.0',
      userAgent: 'Mozilla/5.0',
      exportedAt: '2026-04-27T15:31:42.000Z'
    });
    expect(env).toEqual({
      schemaVersion: '1.0',
      extensionVersion: '0.1.0',
      exportedAt: '2026-04-27T15:31:42.000Z',
      captureStart: '2026-04-27T15:29:00.000Z',
      captureEnd:   '2026-04-27T15:31:42.000Z',
      userAgent: 'Mozilla/5.0',
      tabId: 42,
      pages: sampleCapture.pages,
      events: sampleCapture.events
    });
  });

  it('captureEnd equals captureStart when events array is empty', () => {
    const env = buildExportEnvelope({
      capture: { ...sampleCapture, events: [] },
      extensionVersion: '0.1.0',
      userAgent: 'ua',
      exportedAt: '2026-04-27T15:31:42.000Z'
    });
    expect(env.captureEnd).toBe('2026-04-27T15:29:00.000Z');
  });
});
