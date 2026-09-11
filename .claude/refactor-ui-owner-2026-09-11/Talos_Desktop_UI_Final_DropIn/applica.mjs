#!/usr/bin/env node
/** TALOS Desktop Final UI — applicatore drop-in, idempotente e reversibile. */
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const valueAfter = (name) => { const i=args.indexOf(name); return i>=0 ? args[i+1] : null; };
const root = path.resolve(valueAfter('--root') || process.cwd());
const dryRun = args.includes('--dry-run');
const payload = path.join(HERE, 'payload');
const harness = path.join(root, 'harness-ui');
const frontend = path.join(harness, 'frontend');
const stamp = new Date().toISOString().replace(/[:.]/g,'-');
const backupRoot = path.join(root, '.talos', 'ui-backups', stamp);
const manifest = { schema:'talos.desktop-ui-backup.v1', createdAt:new Date().toISOString(), root, files:[] };

const required = [
  'harness-ui/frontend/src/main.js',
  'harness-ui/frontend/src/styles/main.css',
  'harness-ui/frontend/index.template.html',
  'harness-ui/public/index.html',
];
for (const rel of required) if (!existsSync(path.join(root, rel))) throw new Error(`Manca ${rel}. Esegui lo script dalla radice del repository TALOS.`);

function sha(file){ return createHash('sha256').update(readFileSync(file)).digest('hex'); }
function remember(rel){
  const target=path.join(root,rel); const existed=existsSync(target); const entry={rel,existed,sha256:existed?sha(target):null}; manifest.files.push(entry);
  if(existed&&!dryRun){ const dst=path.join(backupRoot,'files',rel); mkdirSync(path.dirname(dst),{recursive:true}); cpSync(target,dst); }
}
function write(rel, content){ remember(rel); if(dryRun)return; const target=path.join(root,rel); mkdirSync(path.dirname(target),{recursive:true}); writeFileSync(target,content); }
function copy(rel){ const src=path.join(payload,rel); if(!existsSync(src))throw new Error(`Payload mancante: ${rel}`); remember(rel); if(dryRun)return; const dst=path.join(root,rel); mkdirSync(path.dirname(dst),{recursive:true}); cpSync(src,dst); }
function patch(rel, transform){ const target=path.join(root,rel); const before=readFileSync(target,'utf8'); const after=transform(before); if(after===before)return; write(rel,after); }

console.log(`${dryRun?'PROVA A SECCO':'APPLICA'} — TALOS Desktop Final UI`);
console.log(`Radice: ${root}`);

for (const rel of [
  'harness-ui/frontend/src/motion/desktop-scenes.js',
  'harness-ui/frontend/src/motion/desktop-background.js',
  'harness-ui/frontend/src/styles/desktop-final.css',
  'harness-ui/public/talos-desktop-motion.js',
  'harness-ui/public/talos-desktop-final.css',
]) copy(rel);

patch('harness-ui/frontend/src/main.js',(s)=>{
  if(s.includes('TALOS-DESKTOP-FINAL-UI'))return s;
  const anchor="await import('./legacy/app.js');";
  if(!s.includes(anchor))throw new Error('Anchor main.js non riconosciuta: nessuna modifica applicata a quel file.');
  return s.replace(anchor, `${anchor}\n\n/* TALOS-DESKTOP-FINAL-UI */\nconst { initTalosDesktopBackground } = await import('./motion/desktop-background.js');\ninitTalosDesktopBackground();`);
});
patch('harness-ui/frontend/src/styles/main.css',(s)=>{
  if(s.includes("@import './desktop-final.css'"))return s;
  return `${s.trimEnd()}\n@import './desktop-final.css'; /* TALOS-DESKTOP-FINAL-UI */\n`;
});
patch('harness-ui/public/index.html',(s)=>{
  let out=s;
  if(!out.includes('talos-desktop-final.css')){
    const tag='    <link rel="stylesheet" href="./talos-desktop-final.css" data-talos-final-ui>\n';
    if(!/<\/head\s*>/i.test(out))throw new Error('index.html senza </head>');
    out=out.replace(/([ \t]*)<\/head\s*>/i, (_, indent) => `${tag}${indent}</head>`);
  }
  if(!out.includes('talos-desktop-motion.js')){
    const appScript=/(^[ \t]*<script\s+type=["']module["']\s+src=["']\.\/app\.js["']><\/script>\s*$)/mi;
    if(!appScript.test(out))throw new Error('index.html: script module ./app.js non riconosciuto');
    out=out.replace(appScript, `$1\n    <script type="module" src="./talos-desktop-motion.js" data-talos-final-ui></script>`);
  }
  return out;
});

if(!dryRun){
  mkdirSync(backupRoot,{recursive:true});
  writeFileSync(path.join(backupRoot,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  writeFileSync(path.join(root,'.talos','ui-backups','ULTIMO.txt'),backupRoot+'\n');
}

const checks = [
  ['scene source', path.join(frontend,'src/motion/desktop-scenes.js')],
  ['runtime source', path.join(frontend,'src/motion/desktop-background.js')],
  ['final css source', path.join(frontend,'src/styles/desktop-final.css')],
  ['runtime public', path.join(harness,'public/talos-desktop-motion.js')],
  ['final css public', path.join(harness,'public/talos-desktop-final.css')],
];
for(const [label,file] of checks) console.log(`  ${existsSync(file)||dryRun?'✓':'✗'} ${label}`);
console.log(dryRun ? 'Niente è stato toccato.' : `Fatto. Backup: ${backupRoot}`);
console.log('Il public corrente funziona subito; la sorgente frontend è pronta anche per una build/cutover successiva.');
