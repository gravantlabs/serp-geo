// Builds the extension into dist/: JavaScript and CSS minified by esbuild
// (comments removed), other files copied as they are. Then packs dist/ into
// serp-geo-chrome.zip and serp-geo-firefox.xpi; both hold the same files.
//
// Usage: npm run build

import {execFileSync} from 'node:child_process';
import {copyFileSync, cpSync, mkdirSync, rmSync} from 'node:fs';

const MINIFY = [
  'geo.js',
  'popup.js',
  'compare.js',
  'background.js',
  'content.js',
  'popup.css',
  'compare.css',
];
const COPY = [
  'manifest.json',
  'popup.html',
  'compare.html',
  'icons',
  'logo.svg',
  'logo-dark.svg',
];

const PACKAGES = ['serp-geo-chrome.zip', 'serp-geo-firefox.xpi'];

rmSync('dist', {recursive: true, force: true});
mkdirSync('dist');
execFileSync('node_modules/.bin/esbuild', [
  ...MINIFY,
  '--minify',
  '--legal-comments=none',
  '--outdir=dist',
  '--log-level=warning',
]);
for (const f of COPY) cpSync(f, `dist/${f}`, {recursive: true});
rmSync(PACKAGES[0], {force: true});
// -X drops macOS file attributes; the -x patterns leave out dotfiles such as
// .DS_Store. Zip stores local times, so TZ=UTC keeps the time zone out.
execFileSync('zip', ['-qrX', `../${PACKAGES[0]}`, '.', '-x', '.*', '*/.*'],
    {cwd: 'dist', env: {...process.env, TZ: 'UTC'}});
copyFileSync(PACKAGES[0], PACKAGES[1]);
console.log(`built dist/, ${PACKAGES.join(', ')}`);
