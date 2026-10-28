import { describe, expect, it } from 'vitest';
import { findAmoVersion } from '../scripts/amo-version.mjs';

function fakeFetch(response) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url, ...init });
    const { status = 200, body = {} } = response;
    return { ok: status < 400, status, text: async () => JSON.stringify(body), json: async () => body };
  };
  return { impl, calls };
}

const args = { issuer: 'user:1:2', secret: 's', addonId: 'developer@acdl-debugger.com', version: '0.4.2' };

describe('findAmoVersion', () => {
  it('looks the version up by number on the add-on, authenticated as its author', async () => {
    const { impl, calls } = fakeFetch({ body: { version: '0.4.2', channel: 'unlisted', file: { status: 'public' } } });
    expect(await findAmoVersion({ ...args, fetchImpl: impl })).toEqual({ channel: 'unlisted', fileStatus: 'public' });
    expect(calls[0].url).toBe('https://addons.mozilla.org/api/v5/addons/addon/developer%40acdl-debugger.com/versions/v0.4.2/');
    expect(calls[0].headers.Authorization).toMatch(/^JWT [\w-]+\.[\w-]+\.[\w-]+$/);
  });

  it('returns null when AMO has no such version', async () => {
    const { impl } = fakeFetch({ status: 404, body: { detail: 'Not found.' } });
    expect(await findAmoVersion({ ...args, fetchImpl: impl })).toBeNull();
  });

  it('returns null when the add-on does not exist on AMO yet', async () => {
    const { impl } = fakeFetch({ status: 404 });
    expect(await findAmoVersion({ ...args, version: '9.9.9', fetchImpl: impl })).toBeNull();
  });

  it('throws on auth or server errors instead of guessing', async () => {
    const { impl } = fakeFetch({ status: 401, body: { detail: 'Unknown JWT iss (issuer).' } });
    await expect(findAmoVersion({ ...args, fetchImpl: impl })).rejects.toThrow(/HTTP 401.*Unknown JWT iss/);
  });
});
