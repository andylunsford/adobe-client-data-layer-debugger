import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const acdlLibrary = readFileSync(require.resolve('@adobe/adobe-client-data-layer/dist/adobe-client-data-layer.min.js'));

const bootScript = `window.adobeDataLayer = window.adobeDataLayer || [];
adobeDataLayer.push({ event: 'page.view', page: { name: location.search || 'home' } });`;

const page = `<!doctype html><title>ACDL fixture</title>
<script src="/boot.js"></script><script src="/acdl.js"></script><h1>fixture</h1>`;

// One script, so the extension's 100 ms poll can't observe the layer mid-rename.
const renamedScript = (mode) => `${bootScript}
${acdlLibrary}
window.myDataLayer = window.adobeDataLayer;
${mode === 'only' ? 'delete window.adobeDataLayer;' : ''}`;

const renamedPage = (mode) => `<!doctype html><title>ACDL renamed fixture</title>
<script src="/renamed.js?mode=${mode}"></script><h1>renamed</h1>`;

export function startFixtureServer() {
  const server = createServer((req, res) => {
    const { pathname, searchParams } = new URL(req.url, 'http://localhost');
    if (pathname === '/renamed.js') {
      res.setHeader('content-type', 'text/javascript');
      return res.end(renamedScript(searchParams.get('mode')));
    }
    if (pathname === '/acdl.js' || pathname === '/boot.js') {
      res.setHeader('content-type', 'text/javascript');
      return res.end(pathname === '/acdl.js' ? acdlLibrary : bootScript);
    }
    if (searchParams.has('csp')) res.setHeader('content-security-policy', "script-src 'self'");
    res.setHeader('content-type', 'text/html');
    res.end(searchParams.has('renamed') ? renamedPage(searchParams.get('renamed')) : page);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() });
    });
  });
}
