import { createVerify, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { accessToken, publishPackage, signedJwt } from '../scripts/chrome-web-store.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const serviceAccount = {
  client_email: 'publisher@project.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  token_uri: 'https://oauth2.googleapis.com/token'
};

const decode = (part) => JSON.parse(Buffer.from(part, 'base64url').toString());

function fakeFetch(responses) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url, ...init });
    const next = responses.shift();
    if (!next) throw new Error(`unexpected request ${url}`);
    const { status = 200, body } = next;
    return { ok: status < 400, status, text: async () => JSON.stringify(body), json: async () => body };
  };
  return { impl, calls };
}

const ITEM = 'https://chromewebstore.googleapis.com/v2/publishers/pub123/items/ext456';
const UPLOAD = 'https://chromewebstore.googleapis.com/upload/v2/publishers/pub123/items/ext456:upload';
const publishArgs = (fetchImpl) => ({
  token: 'tok', publisherId: 'pub123', extensionId: 'ext456', zip: Buffer.from('zip'), fetchImpl, pollMs: 0
});

describe('signedJwt', () => {
  it('builds an RS256 assertion for the chromewebstore scope, valid for an hour', () => {
    const jwt = signedJwt(serviceAccount, 1_000_000);
    const [header, claims, signature] = jwt.split('.');
    expect(decode(header)).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(decode(claims)).toEqual({
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/chromewebstore',
      aud: serviceAccount.token_uri,
      iat: 1_000_000,
      exp: 1_003_600
    });
    const ok = createVerify('RSA-SHA256').update(`${header}.${claims}`).verify(publicKey, Buffer.from(signature, 'base64url'));
    expect(ok).toBe(true);
  });
});

describe('accessToken', () => {
  it('exchanges the JWT at the token endpoint', async () => {
    const { impl, calls } = fakeFetch([{ body: { access_token: 'abc' } }]);
    expect(await accessToken(serviceAccount, impl)).toBe('abc');
    expect(calls[0].url).toBe(serviceAccount.token_uri);
    const form = new URLSearchParams(calls[0].body);
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    expect(form.get('assertion').split('.')).toHaveLength(3);
  });

  it('throws with the response body when the exchange fails', async () => {
    const { impl } = fakeFetch([{ status: 400, body: { error: 'invalid_grant' } }]);
    await expect(accessToken(serviceAccount, impl)).rejects.toThrow(/400.*invalid_grant/);
  });
});

describe('publishPackage', () => {
  it('uploads the zip, then submits it for publishing', async () => {
    const { impl, calls } = fakeFetch([
      { body: { uploadState: 'SUCCEEDED', crxVersion: '0.4.1' } },
      { body: { state: 'PENDING_REVIEW' } }
    ]);
    expect(await publishPackage(publishArgs(impl))).toEqual({ version: '0.4.1', state: 'PENDING_REVIEW', warnings: [] });
    expect(calls.map(c => [c.method, c.url])).toEqual([['POST', UPLOAD], ['POST', `${ITEM}:publish`]]);
    expect(calls[0].headers.Authorization).toBe('Bearer tok');
    expect(calls[0].body).toEqual(Buffer.from('zip'));
  });

  it('polls fetchStatus while the upload is still processing', async () => {
    const { impl, calls } = fakeFetch([
      { body: { uploadState: 'UPLOAD_IN_PROGRESS' } },
      { body: { lastAsyncUploadState: 'IN_PROGRESS' } },
      { body: { lastAsyncUploadState: 'SUCCEEDED' } },
      { body: { state: 'PENDING_REVIEW' } }
    ]);
    await publishPackage(publishArgs(impl));
    expect(calls.map(c => c.url)).toEqual([UPLOAD, `${ITEM}:fetchStatus`, `${ITEM}:fetchStatus`, `${ITEM}:publish`]);
    expect(calls[1].method).toBe('GET');
  });

  it('does not publish when the upload fails', async () => {
    const { impl, calls } = fakeFetch([{ body: { uploadState: 'FAILED' } }]);
    await expect(publishPackage(publishArgs(impl))).rejects.toThrow(/upload FAILED/);
    expect(calls).toHaveLength(1);
  });

  it('gives up after maxPolls if processing never finishes', async () => {
    const { impl } = fakeFetch([
      { body: { uploadState: 'IN_PROGRESS' } },
      { body: { lastAsyncUploadState: 'IN_PROGRESS' } },
      { body: { lastAsyncUploadState: 'IN_PROGRESS' } }
    ]);
    await expect(publishPackage({ ...publishArgs(impl), maxPolls: 2 })).rejects.toThrow(/still IN_PROGRESS/);
  });

  it('surfaces API errors such as a version that was not bumped', async () => {
    const { impl } = fakeFetch([{ status: 400, body: { error: { message: 'version must be greater' } } }]);
    await expect(publishPackage(publishArgs(impl))).rejects.toThrow(/upload: HTTP 400.*version must be greater/);
  });

  it('returns publish warnings', async () => {
    const { impl } = fakeFetch([
      { body: { uploadState: 'SUCCEEDED', crxVersion: '0.4.1' } },
      { body: { state: 'PENDING_REVIEW', warningInfo: { warnings: [{ reason: 'X', description: 'careful' }] } } }
    ]);
    expect((await publishPackage(publishArgs(impl))).warnings).toEqual(['X: careful']);
  });
});
