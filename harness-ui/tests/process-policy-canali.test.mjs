/*
 * 29/10/2026 (L-2 del kit dello stress test desktop): su Windows git lanciato in una cartella di lavoro oltre i 260 caratteri non parte,
 * e il `read ENOTCONN` dei suoi canali, non ascoltato, faceva cadere l'INTERO server (punti di ripristino → process-policy). La prova
 * gira in un processo a parte: un errore non gestito lì dentro farebbe cadere il processo, ed è proprio quello che si misura.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const POLICY = pathToFileURL(join(import.meta.dirname, '..', 'src', 'process-policy.mjs')).href;

function corsa(t, metodo) {
  const base = mkdtempSync(join(tmpdir(), 'talos-canali-'));
  t.after(() => rimuoviCartellaDiProva(base));
  const script = join(base, 'figlio.mjs');
  writeFileSync(script, `
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createProcessPolicy } from ${JSON.stringify(POLICY)};
const base = process.argv[2];
const lungo = join(base, ...Array.from({ length: 8 }, (_, i) => 'cartella-molto-lunga-numero-' + i + '-xxxxxxxx'));
mkdirSync(lungo, { recursive: true });
process.on('uncaughtException', (e) => { console.log('NON-GESTITO ' + e.code); process.exit(3); });
const policy = createProcessPolicy({ allowedExecutables: ['git'], cwdRoot: base });
const metodo = process.argv[3];
if (metodo === 'execFile') policy.execFile('git', ['--version'], { cwd: lungo, windowsHide: true }, (err) => console.log('RICHIAMATA ' + (err?.code ?? 'ok')));
else { const f = policy.spawn('git', ['--version'], { cwd: lungo, windowsHide: true }); f.on('error', (e) => console.log('RICHIAMATA ' + e.code)); f.on('close', () => console.log('CHIUSO')); }
setTimeout(() => console.log('VIVO'), 1500);
`);
  return execFileSync(process.execPath, [script, base, metodo], { encoding: 'utf8', timeout: 20_000 });
}

for (const metodo of ['execFile', 'spawn']) {
  test(`CANALI-01 ${metodo}: git che non parte per la cartella troppo lunga fallisce in modo regolare e il processo resta vivo`, { skip: process.platform !== 'win32' && 'il limite dei 260 caratteri è di Windows' }, (t) => {
    const uscita = corsa(t, metodo);
    assert.match(uscita, /RICHIAMATA ENOENT/u, uscita);
    assert.match(uscita, /VIVO/u, `il processo deve sopravvivere: ${uscita}`);
    assert.doesNotMatch(uscita, /NON-GESTITO/u);
  });
}
