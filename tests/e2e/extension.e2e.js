import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startFixtureServer } from './fixture-server.js';
import { launchers, waitUntil } from './browsers.js';

function exportCapture(panel, urlPrefix) {
  return panel.evaluate(async (prefix) => {
    const api = globalThis.browser ?? globalThis.chrome;
    for (const tab of await api.tabs.query({})) {
      const resp = await api.runtime.sendMessage({ type: 'export', tabId: tab.id });
      if (resp?.ok && resp.envelope.pages.some(p => p.url.startsWith(prefix))) return resp.envelope;
    }
    return null;
  }, urlPrefix);
}

async function waitForEvents(panel, urlPrefix, count) {
  let envelope = null;
  await waitUntil(async () => {
    envelope = await exportCapture(panel, urlPrefix);
    return envelope?.events.length >= count;
  });
  return envelope;
}

async function openFixture(page, url) {
  await page.goto(url);
  await page.waitForFunction(() => typeof window.adobeDataLayer?.getState === 'function');
}

describe.each(Object.keys(launchers))('%s', (target) => {
  let server;
  let browser;
  let panel;

  beforeAll(async () => {
    server = await startFixtureServer();
    browser = await launchers[target]();
    panel = await browser.openPanel();
  });

  afterAll(async () => {
    await browser?.close();
    server?.close();
  });

  it('captures queued and live pushes with state snapshots across navigation', async () => {
    const page = await browser.newPage();
    await openFixture(page, `${server.origin}/?nav1`);
    await page.evaluate(() => window.adobeDataLayer.push({ event: 'cta.click', cta: { id: 'apply' } }));
    await openFixture(page, `${server.origin}/?nav2`);

    const envelope = await waitForEvents(panel, `${server.origin}/?nav1`, 3);
    expect(envelope.events.map(e => e.eventName)).toEqual(['page.view', 'cta.click', 'page.view']);
    expect(envelope.pages.map(p => p.acdlDetected)).toEqual([true, true]);
    expect(envelope.events[1].state).toEqual({ page: { name: '?nav1' }, cta: { id: 'apply' } });
    expect(envelope.events[2].state).toEqual({ page: { name: '?nav2' } });
  });

  it('captures on a page with a strict script-src CSP', async () => {
    const page = await browser.newPage();
    await openFixture(page, `${server.origin}/?csp`);

    const envelope = await waitForEvents(panel, `${server.origin}/?csp`, 1);
    expect(envelope.events[0].eventName).toBe('page.view');
  });

  it('panel follows the active tab, lists its events, and clears them', async () => {
    const page = await browser.newPage();
    await openFixture(page, `${server.origin}/?ui`);
    await page.evaluate(() => window.adobeDataLayer.push({ event: 'cta.click' }));
    await page.bringToFront();

    const rowNames = () => panel.evaluate(() =>
      [...document.querySelectorAll('#event-list li[data-seq] .event-name')].map(el => el.textContent));
    await waitUntil(async () => (await rowNames()).length === 2);
    expect(await rowNames()).toEqual(['page.view', 'cta.click']);

    const detail = await panel.evaluate(() => {
      document.querySelector('#event-list li[data-seq]:last-child').click();
      const el = document.getElementById('detail-message');
      return { text: el.textContent, key: el.querySelector('.jk')?.textContent, value: el.querySelector('.js')?.textContent };
    });
    expect(JSON.parse(detail.text)).toEqual({ event: 'cta.click' });
    expect(detail).toMatchObject({ key: '"event":', value: '"cta.click"' });

    await panel.evaluate(() => document.getElementById('clear').click());
    await waitUntil(async () => (await rowNames()).length === 0);
    expect(await exportCapture(panel, `${server.origin}/?ui`)).toBeNull();
  });

  async function saveLayerNames(value) {
    await panel.evaluate((v) => {
      document.getElementById('layer-names').value = v;
      document.getElementById('settings').requestSubmit();
    }, value);
    await waitUntil(() => panel.evaluate(() => document.getElementById('layer-names-status').textContent.startsWith('Watching')));
  }

  it('captures a layer that only exists under a custom name once it is added in Settings', async () => {
    const page = await browser.newPage();
    await page.goto(`${server.origin}/?renamed=only`);
    await page.waitForFunction(() => typeof window.myDataLayer?.getState === 'function' && !('adobeDataLayer' in window));
    await page.evaluate(() => window.myDataLayer.push({ event: 'cta.click', cta: { id: 'apply' } }));
    expect((await exportCapture(panel, `${server.origin}/?renamed=only`))?.events ?? []).toHaveLength(0);

    await saveLayerNames('myDataLayer');
    const envelope = await waitForEvents(panel, `${server.origin}/?renamed=only`, 2);
    expect(envelope.events.map(e => [e.eventName, e.dataLayer])).toEqual([['page.view', 'myDataLayer'], ['cta.click', 'myDataLayer']]);
    expect(envelope.pages[0].acdlDetected).toBe(true);
  });

  it('captures each event once when the custom name and adobeDataLayer are the same instance', async () => {
    await saveLayerNames('myDataLayer');
    const page = await browser.newPage();
    await page.goto(`${server.origin}/?renamed=both`);
    await page.waitForFunction(() => window.myDataLayer === window.adobeDataLayer && typeof window.myDataLayer.getState === 'function');
    await page.evaluate(() => window.myDataLayer.push({ event: 'cta.click' }));
    await waitForEvents(panel, `${server.origin}/?renamed=both`, 2);
    await new Promise(r => setTimeout(r, 500));
    const envelope = await exportCapture(panel, `${server.origin}/?renamed=both`);
    expect(envelope.events.map(e => e.eventName)).toEqual(['page.view', 'cta.click']);
    await saveLayerNames('');
  });
});
