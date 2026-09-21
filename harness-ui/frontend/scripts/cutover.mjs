#!/usr/bin/env node
/*
 * Il CUTOVER della Fase 3 — a secco per default, si applica solo con `--applica`.
 *
 *   node scripts/cutover.mjs            → prova a secco: dice cosa farebbe, non tocca niente
 *   node scripts/cutover.mjs --applica  → esegue: `public/` diventa la build di `frontend/dist`
 *
 * Come (ricerca 05/09/2026 — Node.js `fs.rename` è atomico sullo stesso filesystem, ma la
 * rinomina SOPRA una cartella non vuota non lo è, node-fs-extra #835; il pattern giusto è
 * «costruisci a fianco, poi scambia i nomi»):
 *   1. si copia `dist/` in `public.nuovo-<data>/` accanto a `public/` (stesso filesystem);
 *   2. si rinomina `public/` in `public.prima-del-cutover-<data>/` — il backup RESTA, mai cancellato
 *      (regola del 22/8: ciò che è costato lavoro non si sovrascrive);
 *   3. si rinomina `public.nuovo-<data>/` in `public/`.
 * Il server legge `public/` dal disco a ogni richiesta: non serve riavviarlo per vedere la
 * build nuova. ⛔ Lo script NON tocca il contratto congelato né il codice di Opus: quelli si
 * sbloccano/cancellano con i loro commit, dopo il sì dell'owner (LEDGER-FASE-3-RICHIESTE).
 */
import { cpSync, existsSync, readdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(QUI, '..');
const HARNESS = path.resolve(FRONTEND, '..');
const DIST = path.join(FRONTEND, 'dist');
const PUBLIC = path.join(HARNESS, 'public');
const APPLICA = process.argv.includes('--applica');
const DATA = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const NUOVO = path.join(HARNESS, `public.nuovo-${DATA}`);
const BACKUP = path.join(HARNESS, `public.prima-del-cutover-${DATA}`);

function contaFile(dir) {
  let n = 0;
  for (const voce of readdirSync(dir, { withFileTypes: true })) {
    if (voce.isDirectory()) n += contaFile(path.join(dir, voce.name));
    else n += 1;
  }
  return n;
}

const errori = [];
if (!existsSync(DIST) || !statSync(DIST).isDirectory()) errori.push(`manca la build: ${DIST} (lancia prima \`npm run build\`)`);
for (const nome of ['index.html', 'app.js', 'styles.css']) {
  if (existsSync(DIST) && !existsSync(path.join(DIST, nome))) errori.push(`la build non ha ${nome}`);
}
if (!existsSync(PUBLIC) || !statSync(PUBLIC).isDirectory()) errori.push(`manca la cartella servita: ${PUBLIC}`);
if (existsSync(NUOVO) || existsSync(BACKUP)) errori.push('esistono già cartelle con la data di oggi: riprova fra un secondo');
if (errori.length > 0) {
  console.error('Cutover NON possibile:');
  for (const e of errori) console.error(`  - ${e}`);
  process.exit(1);
}

const fileDist = contaFile(DIST);
const filePublic = contaFile(PUBLIC);
console.log(`${APPLICA ? 'CUTOVER' : 'PROVA A SECCO'} — Fase 3`);
console.log(`  build   : ${DIST} (${fileDist} file)`);
console.log(`  servita : ${PUBLIC} (${filePublic} file)`);
console.log(`  1) copia della build in ${path.basename(NUOVO)}`);
console.log(`  2) ${path.basename(PUBLIC)} → ${path.basename(BACKUP)} (il backup resta)`);
console.log(`  3) ${path.basename(NUOVO)} → ${path.basename(PUBLIC)}`);

if (!APPLICA) {
  console.log('Niente è stato toccato. Con `--applica` si esegue.');
  process.exit(0);
}

cpSync(DIST, NUOVO, { recursive: true });
if (contaFile(NUOVO) !== fileDist) { console.error('La copia non è completa: mi fermo prima di scambiare.'); process.exit(1); }
renameSync(PUBLIC, BACKUP);
renameSync(NUOVO, PUBLIC);
console.log(`Fatto: ${path.basename(PUBLIC)} è la build (${contaFile(PUBLIC)} file); l'originale è in ${path.basename(BACKUP)} (${contaFile(BACKUP)} file).`);
console.log('Verifica adesso dal vivo: apri il server sulla sua porta e guarda ogni schermata contro il mockup.');
