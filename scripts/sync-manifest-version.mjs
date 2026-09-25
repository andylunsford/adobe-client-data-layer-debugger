import { readFile, writeFile } from 'node:fs/promises';

const VERSION_FIELD = /("version"\s*:\s*")[^"]*(")/;

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const manifest = await readFile('manifest.json', 'utf8');
if (!VERSION_FIELD.test(manifest)) throw new Error('manifest.json has no "version" field');

await writeFile('manifest.json', manifest.replace(VERSION_FIELD, `$1${version}$2`));
console.log(`manifest.json version -> ${version}`);
