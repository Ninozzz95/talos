#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const valueAfter = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const root = path.resolve(valueAfter('--root') || process.cwd());
const installedOnly = args.includes('--installed');
const payload = path.join(HERE, 'payload');
let failures = 0;
const ok = (label, condition, detail='') => {
  const good = Boolean(condition); if (!good) failures += 1;
  console.log(`${good ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

console.log(`Verifica TALOS Desktop Final UI\nRadice: ${root}`);
const required = [
  'harness-ui/frontend/src/main.js',
  'harness-ui/frontend/src/styles/main.css',
  'harness-ui/frontend/index.template.html',
  'harness-ui/public/index.html',
];
for (const rel of required) ok(`presente ${rel}`, existsSync(path.join(root, rel)));
if (failures) process.exit(2);

const main = read('harness-ui/frontend/src/main.js');
const cssEntry = read('harness-ui/frontend/src/styles/main.css');
const publicIndex = read('harness-ui/public/index.html');
if (!installedOnly) {
  ok('anchor main.js riconosciuta', main.includes("await import('./legacy/app.js');") || main.includes('TALOS-DESKTOP-FINAL-UI'));
  ok('catena tema/aspetto presente', cssEntry.includes("@import './temi.css';") && cssEntry.includes("@import './aspetto.css';"));
  ok('index pubblico riconosciuto', publicIndex.includes('./app.js'));
  for (const rel of [
    'harness-ui/frontend/src/motion/desktop-scenes.js',
    'harness-ui/frontend/src/motion/desktop-background.js',
    'harness-ui/frontend/src/styles/desktop-final.css',
    'harness-ui/public/talos-desktop-motion.js',
    'harness-ui/public/talos-desktop-final.css',
  ]) ok(`payload ${rel}`, existsSync(path.join(payload, rel)));
} else {
  ok('marker sorgente installato', main.includes('TALOS-DESKTOP-FINAL-UI'));
  ok('CSS finale importato per ultimo', cssEntry.trimEnd().endsWith("@import './desktop-final.css'; /* TALOS-DESKTOP-FINAL-UI */"));
  ok('CSS pubblico collegato', publicIndex.includes('talos-desktop-final.css'));
  ok('motion pubblico collegato', publicIndex.includes('talos-desktop-motion.js'));
  for (const rel of [
    'harness-ui/frontend/src/motion/desktop-scenes.js',
    'harness-ui/frontend/src/motion/desktop-background.js',
    'harness-ui/frontend/src/styles/desktop-final.css',
    'harness-ui/public/talos-desktop-motion.js',
    'harness-ui/public/talos-desktop-final.css',
  ]) {
    const target = path.join(root, rel), source = path.join(payload, rel);
    ok(`installato ${rel}`, existsSync(target) && existsSync(source) && sha(target) === sha(source));
  }
}
process.exit(failures ? 1 : 0);
