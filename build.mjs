import { build, context } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const outdir = 'dist';

const entryPoints = {
  'inject':              'src/inject.js',
  'content':             'src/content.js',
  'background':          'src/background.js',
  'sidepanel/sidepanel': 'src/sidepanel/sidepanel.js',
  'sidepanel/theme':     'src/sidepanel/theme.js'
};

async function buildAll() {
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });

  await build({
    entryPoints,
    outdir,
    bundle: true,
    format: 'iife',
    target: 'chrome120',
    sourcemap: true,
    logLevel: 'info'
  });

  await cp('manifest.json', `${outdir}/manifest.json`);
  await cp('src/sidepanel/index.html', `${outdir}/sidepanel/index.html`);
  await cp('src/sidepanel/sidepanel.css', `${outdir}/sidepanel/sidepanel.css`);
  if (existsSync('icons')) await cp('icons', `${outdir}/icons`, { recursive: true });
}

if (watch) {
  const ctx = await context({
    entryPoints,
    outdir, bundle: true, format: 'iife', target: 'chrome120', sourcemap: true, logLevel: 'info'
  });
  await ctx.watch();
  console.log('esbuild watching…');
} else {
  await buildAll();
}
