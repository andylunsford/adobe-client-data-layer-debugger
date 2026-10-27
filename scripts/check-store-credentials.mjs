import { createHmac, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { accessToken, fetchItemStatus } from './chrome-web-store.mjs';

const AMO = 'https://addons.mozilla.org/api/v5';
const ADDON_ID = 'developer@acdl-debugger.com';

const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

export function amoJwt({ issuer, secret, now = Math.floor(Date.now() / 1000), jti = randomUUID() }) {
  const unsigned = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ iss: issuer, jti, iat: now, exp: now + 60 })}`;
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
}

export async function checkAmo({ issuer, secret, addonId = ADDON_ID, fetchImpl = fetch }) {
  const get = (path) => fetchImpl(`${AMO}${path}`, { headers: { Authorization: `JWT ${amoJwt({ issuer, secret })}` } });

  const profile = await get('/accounts/profile/');
  if (!profile.ok) throw new Error(`profile: HTTP ${profile.status} ${await profile.text()}`);
  const { id, username } = await profile.json();

  const addon = await get(`/addons/addon/${encodeURIComponent(addonId)}/`);
  if (addon.status === 404) return { account: `${username} (id ${id})`, addon: 'not on AMO yet; the first signed release registers it' };
  if (addon.status === 401 || addon.status === 403) throw new Error(`add-on ID ${addonId} belongs to another account (HTTP ${addon.status})`);
  if (!addon.ok) throw new Error(`addon: HTTP ${addon.status} ${await addon.text()}`);
  const { slug, current_version: version } = await addon.json();
  return { account: `${username} (id ${id})`, addon: `exists (slug ${slug}, current version ${version?.version ?? 'none'})` };
}

const revision = (status) =>
  status ? `${status.state} ${status.distributionChannels?.map(c => c.crxVersion).join(', ') ?? ''}`.trim() : 'none';

export async function checkChromeWebStore({ key, publisherId, extensionId, fetchImpl = fetch }) {
  const token = await accessToken(key, fetchImpl);
  const status = await fetchItemStatus({ token, publisherId, extensionId, fetchImpl });
  return {
    serviceAccount: key.client_email,
    published: revision(status.publishedItemRevisionStatus),
    submitted: revision(status.submittedItemRevisionStatus)
  };
}

async function main() {
  const env = process.env;
  const checks = {
    'AMO (Firefox signing)': {
      required: ['AMO_JWT_ISSUER', 'AMO_JWT_SECRET'],
      run: () => checkAmo({ issuer: env.AMO_JWT_ISSUER, secret: env.AMO_JWT_SECRET })
    },
    'Chrome Web Store': {
      required: ['CWS_SERVICE_ACCOUNT_KEY', 'CWS_PUBLISHER_ID', 'CWS_EXTENSION_ID'],
      run: () => {
        let key;
        try { key = JSON.parse(env.CWS_SERVICE_ACCOUNT_KEY); } catch { throw new Error('CWS_SERVICE_ACCOUNT_KEY is not valid JSON; paste the whole key file'); }
        return checkChromeWebStore({ key, publisherId: env.CWS_PUBLISHER_ID, extensionId: env.CWS_EXTENSION_ID });
      }
    }
  };
  let failed = false;
  for (const [name, { required, run }] of Object.entries(checks)) {
    const missing = required.filter(k => !env[k]);
    if (missing.length) {
      failed = true;
      console.log(`::error::${name}: not set: ${missing.join(', ')}`);
      continue;
    }
    try {
      const result = await run();
      console.log(`::notice::${name}: OK; ${Object.entries(result).map(([k, v]) => `${k}: ${v}`).join('; ')}`);
    } catch (e) {
      failed = true;
      console.log(`::error::${name}: ${e.message}`);
    }
  }
  process.exit(failed ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
