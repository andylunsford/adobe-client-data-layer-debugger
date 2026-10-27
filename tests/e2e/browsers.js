import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import puppeteer from 'puppeteer-core';

const distDir = (target) => resolve('dist', target);
const GECKO_ID = 'acdl-debugger@andylunsford';
const FIREFOX_UUID = '7c1d3a52-5b8e-4f43-9d0a-acd1de0bbe90';

async function waitUntil(check, { timeoutMs = 10_000, intervalMs = 100 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check().catch(() => false)) return;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error('waitUntil timed out');
}

async function launchChrome() {
  const ext = distDir('chrome');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`]
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  return {
    newPage: () => context.newPage(),
    async openPanel() {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/sidepanel/index.html`);
      return page;
    },
    close: () => context.close()
  };
}

function firefoxExecutable() {
  if (process.env.FIREFOX_BIN) return process.env.FIREFOX_BIN;
  try {
    return realpathSync(execFileSync('which', ['firefox'], { encoding: 'utf8' }).trim());
  } catch {
    throw new Error('Firefox not found: install it or set FIREFOX_BIN');
  }
}

// System access lets WebDriver BiDi open and script moz-extension:// pages.
// Firefox 159 dropped the -remote-allow-system-access flag for this env var; the flag covers older releases.
async function launchFirefox() {
  const browser = await puppeteer.launch({
    browser: 'firefox',
    executablePath: firefoxExecutable(),
    headless: true,
    args: ['-remote-allow-system-access'],
    env: { ...process.env, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: '1' },
    extraPrefsFirefox: { 'extensions.webextensions.uuids': JSON.stringify({ [GECKO_ID]: FIREFOX_UUID }) }
  });
  await browser.installExtension(distDir('firefox'));
  return {
    newPage: () => browser.newPage(),
    async openPanel() {
      const page = await browser.newPage();
      // BiDi never reports the load event for extension pages, so poll for the extension context instead.
      page.goto(`moz-extension://${FIREFOX_UUID}/sidepanel/index.html`).catch(() => {});
      await waitUntil(() => page.evaluate(() => location.protocol === 'moz-extension:' && document.readyState === 'complete'));
      return page;
    },
    close: () => browser.close()
  };
}

export const launchers = { chrome: launchChrome, firefox: launchFirefox };
export { waitUntil };
