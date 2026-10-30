/*
 * Revisione del Desktop su R-26 (29/10/2026): `statoDelRepository` lancia git con `spawn` proprio. In una cartella oltre i 260
 * caratteri git non parte, e i canali del figlio non ascoltati (stdin aperto, nessun 'error' su stdout/stderr) facevano cadere il
 * processo — la stessa causa di L-2, curata in `process-policy` (e6abdadbd). La prova gira in un processo a parte: un errore non
 * gestito lì dentro farebbe cadere il processo, ed è proprio quello che si misura.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const GUARDIE = pathToFileURL(join(import.meta.dirname, '..', 'src', 'kernel', 'guardie-attese-e-lavoro.mjs')).href;

test('R26-LUNGA git che non parte per la cartella troppo lunga: lo stato si dice non leggibile e il processo resta vivo', { skip: process.platform !== 'win32' && 'il limite dei 260 caratteri è di Windows' }, (t) => {
  const base = mkdtempSync(join(tmpdir(), 'talos-r26-lunga-'));
  t.after(() => rimuoviCartellaDiProva(base));
  const script = join(base, 'figlio.mjs');
  writeFileSync(script, `
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { statoDelRepository } from ${JSON.stringify(GUARDIE)};
const lungo = join(process.argv[2], ...Array.from({ length: 8 }, (_, i) => 'cartella-molto-lunga-numero-' + i + '-xxxxxxxx'));
mkdirSync(lungo, { recursive: true });
process.on('uncaughtException', (e) => { console.log('NON-GESTITO ' + e.code); process.exit(3); });
statoDelRepository(lungo).then((s) => console.log('ESITO ' + JSON.stringify(s)), (e) => console.log('RIFIUTATO ' + (e?.code ?? e?.message)));
setTimeout(() => console.log('VIVO'), 1500);
`);
  const uscita = execFileSync(process.execPath, [script, base], { encoding: 'utf8', timeout: 20_000 });
  assert.match(uscita, /VIVO/u, `il processo deve sopravvivere: ${uscita}`);
  assert.doesNotMatch(uscita, /NON-GESTITO/u, uscita);
});
