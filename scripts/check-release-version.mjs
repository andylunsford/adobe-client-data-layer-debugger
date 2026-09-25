import { readFile } from 'node:fs/promises';

const tag = process.argv[2] ?? '';
const expected = tag.replace(/^v/, '');
const readVersion = async (file) => JSON.parse(await readFile(file, 'utf8')).version;
const pkgVersion = await readVersion('package.json');
const manifestVersion = await readVersion('manifest.json');

if (pkgVersion !== expected || manifestVersion !== expected) {
  console.error(`Tag "${tag}" does not match package.json (${pkgVersion}) and manifest.json (${manifestVersion}).`);
  console.error('Bump with `npm version <patch|minor|major>` and push the tag it creates.');
  process.exit(1);
}

console.log(`Version ${expected} matches tag ${tag}.`);
