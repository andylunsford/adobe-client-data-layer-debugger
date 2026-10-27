import { createHmac, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { amoJwt, checkAmo, checkChromeWebStore } from '../scripts/check-store-credentials.mjs';

const decode = (part) => JSON.parse(Buffer.from(part, 'base64url').toString());

function fakeFetch(responses) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url, ...init });
    const { status = 200, body = {} } = responses.shift();
    return { ok: status < 400, status, text: async () => JSON.stringify(body), json: async () => body };
  };
  return { impl, calls };
}

describe('amoJwt', () => {
  it('builds an HS256 token with a short expiry, per the AMO API', () => {
    const jwt = amoJwt({ issuer: 'user:1:2', secret: 's3cret', now: 1000, jti: 'abc' });
    const [header, claims, signature] = jwt.split('.');
    expect(decode(header)).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(decode(claims)).toEqual({ iss: 'user:1:2', jti: 'abc', iat: 1000, exp: 1060 });
    expect(signature).toBe(createHmac('sha256', 's3cret').update(`${header}.${claims}`).digest('base64url'));
  });
});

describe('checkAmo', () => {
  const creds = { issuer: 'user:1:2', secret: 's', addonId: 'developer@acdl-debugger.com' };

  it('passes when the profile loads, and reports the add-on ID as unclaimed on 404', async () => {
    const { impl, calls } = fakeFetch([{ body: { id: 7, username: 'dev' } }, { status: 404 }]);
    expect(await checkAmo({ ...creds, fetchImpl: impl })).toEqual({ account: 'dev (id 7)', addon: 'not on AMO yet; the first signed release registers it' });
    expect(calls[0].url).toBe('https://addons.mozilla.org/api/v5/accounts/profile/');
    expect(calls[0].headers.Authorization).toMatch(/^JWT [\w-]+\.[\w-]+\.[\w-]+$/);
    expect(calls[1].url).toBe('https://addons.mozilla.org/api/v5/addons/addon/developer%40acdl-debugger.com/');
  });

  it('reports an existing add-on the account can see', async () => {
    const { impl } = fakeFetch([{ body: { id: 7, username: 'dev' } }, { body: { slug: 'acdl', current_version: { version: '0.4.1' } } }]);
    expect((await checkAmo({ ...creds, fetchImpl: impl })).addon).toBe('exists (slug acdl, current version 0.4.1)');
  });

  it('flags an add-on ID owned by another account', async () => {
    const { impl } = fakeFetch([{ body: { id: 7, username: 'dev' } }, { status: 403 }]);
    await expect(checkAmo({ ...creds, fetchImpl: impl })).rejects.toThrow(/belongs to another account/);
  });

  it('fails with the API response when the credentials are rejected', async () => {
    const { impl } = fakeFetch([{ status: 401, body: { detail: 'Unknown JWT iss (issuer).' } }]);
    await expect(checkAmo({ ...creds, fetchImpl: impl })).rejects.toThrow(/HTTP 401.*Unknown JWT iss/);
  });
});

describe('checkChromeWebStore', () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const key = {
    client_email: 'publisher@project.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    token_uri: 'https://oauth2.googleapis.com/token'
  };

  it('gets a token and reads the item status without uploading', async () => {
    const { impl, calls } = fakeFetch([
      { body: { access_token: 'tok' } },
      { body: { itemId: 'ext456', publishedItemRevisionStatus: { state: 'PUBLISHED', distributionChannels: [{ crxVersion: '0.4.0' }] } } }
    ]);
    const result = await checkChromeWebStore({ key, publisherId: 'pub123', extensionId: 'ext456', fetchImpl: impl });
    expect(result).toEqual({ serviceAccount: key.client_email, published: 'PUBLISHED 0.4.0', submitted: 'none' });
    expect(calls[1]).toMatchObject({
      method: 'GET',
      url: 'https://chromewebstore.googleapis.com/v2/publishers/pub123/items/ext456:fetchStatus',
      headers: { Authorization: 'Bearer tok' }
    });
    expect(calls).toHaveLength(2);
  });

  it('fails with the API response when the service account is not linked to the publisher', async () => {
    const { impl } = fakeFetch([{ body: { access_token: 'tok' } }, { status: 403, body: { error: { message: 'permission denied' } } }]);
    await expect(checkChromeWebStore({ key, publisherId: 'p', extensionId: 'e', fetchImpl: impl })).rejects.toThrow(/fetchStatus: HTTP 403.*permission denied/);
  });
});
