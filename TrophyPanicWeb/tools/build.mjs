// Builds the game into artifact-ready HTML:
//   dist/trophy-panic.html  page content for the claude.ai Artifact publisher
//                           (no doctype/html/head/body: the publisher wraps it)
//   dist/dev.html           the same content as a full standalone document
// three.js loads as the r159 UMD build from jsdelivr (allowed by the
// artifact CSP); everything else is inlined.

import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });

export const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.min.js';

const minify = !process.argv.includes('--dev');
const result = await esbuild.build({
  entryPoints: [join(root, 'src', 'main.js')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify,
  sourcemap: false,
  write: false,
  legalComments: 'none',
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString().slice(0, 16)) },
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync(join(root, 'src', 'ui', 'style.css'), 'utf8');
const markup = readFileSync(join(root, 'src', 'ui', 'markup.html'), 'utf8');

const content = `<title>Trophy Panic</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;700;800&family=Nunito:wght@600;800&family=VT323&display=swap">
<style>
${css}
</style>
${markup}
<script src="${THREE_CDN}"></script>
<script>
${js}
</script>
`;

writeFileSync(join(dist, 'trophy-panic.html'), content);
writeFileSync(join(dist, 'dev.html'), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${content}</body></html>`);
const kb = (Buffer.byteLength(content) / 1024).toFixed(0);
console.log(`built dist/trophy-panic.html (${kb} KB, ${minify ? 'minified' : 'dev'})`);
