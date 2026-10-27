import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
const API = 'https://chromewebstore.googleapis.com';
const IN_PROGRESS = new Set(['IN_PROGRESS', 'UPLOAD_IN_PROGRESS']);

const b64url = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

export function signedJwt(key, now = Math.floor(Date.now() / 1000)) {
  const unsigned = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({
    iss: key.client_email,
    scope: SCOPE,
    aud: key.token_uri,
    iat: now,
    exp: now + 3600
  })}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key).toString('base64url');
  return `${unsigned}.${signature}`;
}

async function request(fetchImpl, label, url, init) {
  const res = await fetchImpl(url, init);
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

export async function accessToken(key, fetchImpl = fetch) {
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: signedJwt(key)
  }).toString();
  const json = await request(fetchImpl, 'token', key.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  return json.access_token;
}

export async function publishPackage({ token, publisherId, extensionId, zip, fetchImpl = fetch, pollMs = 5000, maxPolls = 60 }) {
  const item = `publishers/${publisherId}/items/${extensionId}`;
  const auth = { Authorization: `Bearer ${token}` };

  const upload = await request(fetchImpl, 'upload', `${API}/upload/v2/${item}:upload`, { method: 'POST', headers: auth, body: zip });
  let state = upload.uploadState;
  for (let polls = 0; IN_PROGRESS.has(state); polls++) {
    if (polls >= maxPolls) throw new Error(`upload still ${state} after ${maxPolls} polls`);
    await new Promise(r => setTimeout(r, pollMs));
    state = (await request(fetchImpl, 'fetchStatus', `${API}/v2/${item}:fetchStatus`, { method: 'GET', headers: auth })).lastAsyncUploadState;
  }
  if (state !== 'SUCCEEDED') throw new Error(`upload ${state}: ${JSON.stringify(upload)}`);

  const published = await request(fetchImpl, 'publish', `${API}/v2/${item}:publish`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: '{}'
  });
  return {
    version: upload.crxVersion,
    state: published.state,
    warnings: (published.warningInfo?.warnings ?? []).map(w => `${w.reason}: ${w.description}`)
  };
}

async function main([zipPath]) {
  const { CWS_SERVICE_ACCOUNT_KEY, CWS_PUBLISHER_ID, CWS_EXTENSION_ID } = process.env;
  if (!CWS_SERVICE_ACCOUNT_KEY || !CWS_PUBLISHER_ID || !CWS_EXTENSION_ID) {
    console.log('::warning::CWS_SERVICE_ACCOUNT_KEY secret or CWS_PUBLISHER_ID / CWS_EXTENSION_ID variables are not set; skipping Chrome Web Store publish.');
    return;
  }
  const token = await accessToken(JSON.parse(CWS_SERVICE_ACCOUNT_KEY));
  const result = await publishPackage({
    token,
    publisherId: CWS_PUBLISHER_ID,
    extensionId: CWS_EXTENSION_ID,
    zip: await readFile(zipPath)
  });
  console.log(`Submitted ${result.version} to the Chrome Web Store: ${result.state}`);
  for (const w of result.warnings) console.log(`::warning::Chrome Web Store: ${w}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
