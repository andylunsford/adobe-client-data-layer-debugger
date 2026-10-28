import { pathToFileURL } from 'node:url';
import { amoJwt } from './check-store-credentials.mjs';

const AMO = 'https://addons.mozilla.org/api/v5';
const ADDON_ID = 'developer@acdl-debugger.com';

export async function findAmoVersion({ issuer, secret, addonId = ADDON_ID, version, fetchImpl = fetch }) {
  const res = await fetchImpl(`${AMO}/addons/addon/${encodeURIComponent(addonId)}/versions/v${version}/`, {
    headers: { Authorization: `JWT ${amoJwt({ issuer, secret })}` }
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`AMO version lookup: HTTP ${res.status} ${await res.text()}`);
  const { channel, file } = await res.json();
  return { channel, fileStatus: file?.status ?? null };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [version] = process.argv.slice(2);
  findAmoVersion({ issuer: process.env.AMO_JWT_ISSUER, secret: process.env.AMO_JWT_SECRET, version })
    .then((found) => console.log(found ? found.channel : ''))
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
