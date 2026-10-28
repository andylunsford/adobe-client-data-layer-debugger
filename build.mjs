import { build, context } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { TARGETS, manifestForTarget } from './src/lib/target-manifest.js';

const watch = process.argv.includes('--watch');
const targetArg = process.argv.find(a => a.startsWith('--target='))?.slice('--target='.length);
const targets = targetArg ? [targetArg] : watch ? ['chrome'] : TARGETS;
if (targets.some(t => !TARGETS.includes(t))) throw new Error(`--target must be one of: ${TARGETS.join(', ')}`);

const entryPoints = {
  'inject':              'src/inject.js',
  'content':             'src/content.js',
  'background':          'src/background.js',
  'sidepanel/sidepanel': 'src/sidepanel/sidepanel.js',
  'sidepanel/theme':     'src/sidepanel/theme.js'
};

const esbuildTarget = { chrome: 'chrome120', firefox: 'firefox142', safari: 'safari17' };

const esbuildOptions = (target) => ({
  entryPoints,
  outdir: `dist/${target}`,
  bundle: true,
  format: 'iife',
  target: esbuildTarget[target],
  sourcemap: true,
  logLevel: 'info'
});

async function copyStatic(target) {
  const outdir = `dist/${target}`;
  const base = JSON.parse(await readFile('manifest.json', 'utf8'));
  await writeFile(`${outdir}/manifest.json`, JSON.stringify(manifestForTarget(base, target), null, 2) + '\n');
  const html = await readFile('src/sidepanel/index.html', 'utf8');
  await writeFile(`${outdir}/sidepanel/index.html`, html);
  if (target === 'safari') {
    await writeFile(`${outdir}/sidepanel/popup.html`, html.replace('<html lang="en">', '<html lang="en" class="popup">'));
  }
  await cp('src/sidepanel/sidepanel.css', `${outdir}/sidepanel/sidepanel.css`);
  if (existsSync('icons')) await cp('icons', `${outdir}/icons`, { recursive: true });
}

async function buildTarget(target) {
  await rm(`dist/${target}`, { recursive: true, force: true });
  await mkdir(`dist/${target}`, { recursive: true });
  await build(esbuildOptions(target));
  await copyStatic(target);
}

if (watch) {
  const [target] = targets;
  await mkdir(`dist/${target}/sidepanel`, { recursive: true });
  await copyStatic(target);
  const ctx = await context(esbuildOptions(target));
  await ctx.watch();
  console.log(`esbuild watching (${target})…`);
} else {
  for (const target of targets) await buildTarget(target);
}
