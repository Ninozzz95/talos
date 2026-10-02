/*
 * ⛔⛔⛔ T-15 (audit ZIP revisione, 28/09/2026; owner: «Sì, nella 19») — l'append FONDEVA
 * l'ultima riga del file con la prima del pezzo nuovo.
 *
 * `scrivi` con mode:"append" passa il pezzo com'è a `disco.scrivi(…, 'accoda')` (flag 'a' di
 * Node): se il file non finisce con `\n` e il pezzo non inizia con `\n`, il risultato è
 * «TOKEN_OK_V4LINEA_APPEND_V4» — 26 caratteri fusi in una riga sola. Nessun parser a righe
 * (diff, git, log) leggerebbe più le due cose come due righe: è il marker «No newline at end
 * of file» di GNU diff3/freebsd cgit, la ragione per cui un append responsabile separa.
 *
 * Cura (piano 0.1.19 §1.2): PRIMA della scrittura, se il file esiste, non è vuoto, non finisce
 * con `\n` e il pezzo non inizia con `\n`, si antepongono UN `\n` al pezzo e si fa UNA sola
 * append (`'\n' + contenuto`: atomicità per chiamata conservata). L'ultimo byte si legge con un
 * handle a posizione `size-1` (stessa API di `leggiTestoLimitato`), MAI leggendo il file intero.
 * Il conteggio nell'esito usa il pezzo effettivo e lo DICE: «incl. 1 newline separator».
 * UNA implementazione (`src/kernel/accoda-con-a-capo.mjs`), due chiamanti: l'attrezzo `scrivi`
 * del kernel e `document_create` (via `workspace-files.mjs`), dove però vale SOLO per il testo:
 * su byte binari un `0x0A` in mezzo sarebbe corruzione, non una riga nuova.
 *
 * Fonti (28/09/2026): GNU diffutils/freebsd-cgit, marker «No newline at end of file»;
 * GitHub, issue sull'Edit tool di Claude Code (read-before-edit: il file va riletto prima di
 * scrivere accanto). Concorrenti letti nel codice (nessuno espone un append al modello:
 * opencode `packages/opencode/src/tool/write.ts` — write piena con diff, righe 46-64;
 * Hermes `tools/file_tools.py:853` write e `:948` patch str_replace; claude-code
 * `package/sdk-tools.d.ts` — solo Edit; codex `ext/history-notes` ha `append_to_file` ma
 * delegato a un servizio remoto non nel clone): il separatore non ha precedenti da copiare,
 * la best practice viene dal diff stesso.
 *
 * ⛔ Queste prove girano nei DUE VERSI: che la cura morda sul file senza a-capo finale, e che
 * tutti i casi che non devono cambiare (file che già finisce con `\n`, pezzo che inizia con
 * `\n`, file vuoto, append binario) restino byte per byte com'erano.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { creaFileWorkspace } from '../src/workspace-files.mjs';

function cartellaDiProva(t) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-t15-append-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  return cartella;
}

/* Uno sportello finto che risponde con la sequenza data, una risposta per chiamata. */
function sportello(...risposte) {
  let indice = 0;
  return async () => {
    const scelta = risposte[Math.min(indice, risposte.length - 1)];
    indice += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: scelta }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
      text: async () => '',
    };
  };
}
const TASK = { consegna: 'una prova di T-15' };
const FINE = { role: 'assistant', content: 'fatto', tool_calls: [] };
const chiamaScrivi = (argomenti, id = 'call_1') => ({
  role: 'assistant',
  content: '',
  tool_calls: [{ id, function: { name: 'scrivi', arguments: JSON.stringify(argomenti) } }],
});
const esitiDelTool = (esito) => esito.messaggiFinali.filter((m) => m.role === 'tool').map((m) => m.content);

/* ───────────────────── il difetto, dal kernel vero con un disco vero ─────────────────────── */

test('⭐⭐⭐ T-15-01 — un file senza a-capo finale non FONDE la riga nuova con l\'ultima vecchia', async (t) => {
  const cartella = cartellaDiProva(t);
  writeFileSync(join(cartella, 'token.txt'), 'TOKEN_OK_V4');
  await talosLavora({
    cartella, task: TASK, modello: 'x', chiave: 'y',
    fetchDiRete: sportello(
      chiamaScrivi({ percorso: 'token.txt', contenuto: 'LINEA_APPEND_V4', mode: 'append' }),
      FINE,
    ),
  });
  assert.equal(readFileSync(join(cartella, 'token.txt'), 'utf8'), 'TOKEN_OK_V4\nLINEA_APPEND_V4',
    '⛔ prima della cura qui stava «TOKEN_OK_V4LINEA_APPEND_V4»: due righe saldate in una');
});

test('⭐⭐⭐ T-15-02 — l\'esito conta il pezzo VERO e dichiara il separatore, non lo nasconde', async (t) => {
  const cartella = cartellaDiProva(t);
  writeFileSync(join(cartella, 'token.txt'), 'TOKEN_OK_V4');
  const esito = await talosLavora({
    cartella, task: TASK, modello: 'x', chiave: 'y',
    fetchDiRete: sportello(
      chiamaScrivi({ percorso: 'token.txt', contenuto: 'LINEA_APPEND_V4', mode: 'append' }),
      FINE,
    ),
  });
  const [detto] = esitiDelTool(esito);
  assert.match(detto, /\(\+16 bytes incl\. 1 newline separator; the file is now 27 bytes\)/,
    'il conteggio è del pezzo effettivamente scritto (15 + il \\n separatore) e lo dice');
});

/* ─────────────────────────────── i contrari, che non devono cambiare ─────────────────────── */

test('⛔ T-15-03 — un file che GIÀ finisce con \\n non prende un secondo a-capo', async (t) => {
  const cartella = cartellaDiProva(t);
  writeFileSync(join(cartella, 'ok.txt'), 'prima riga\n');
  const esito = await talosLavora({
    cartella, task: TASK, modello: 'x', chiave: 'y',
    fetchDiRete: sportello(
      chiamaScrivi({ percorso: 'ok.txt', contenuto: 'seconda riga', mode: 'append' }),
      FINE,
    ),
  });
  assert.equal(readFileSync(join(cartella, 'ok.txt'), 'utf8'), 'prima riga\nseconda riga',
    '⛔ un a-capo doppio fra due append sarebbe un file che cresce di una riga vuota a ogni pezzo');
  assert.match(esitiDelTool(esito)[0], /\(\+12 bytes; the file is now 23 bytes\)/,
    '11 + 12, nessun separatore: e l\'esito non parla di separatori che non ha scritto');
});

test('⛔ T-15-04 — un pezzo che INIZIA con \\n è già separato: nessun separatore aggiunto', async (t) => {
  const cartella = cartellaDiProva(t);
  writeFileSync(join(cartella, 'manca.txt'), 'TOKEN_OK_V4');
  await talosLavora({
    cartella, task: TASK, modello: 'x', chiave: 'y',
    fetchDiRete: sportello(
      chiamaScrivi({ percorso: 'manca.txt', contenuto: '\nLINEA_APPEND_V4', mode: 'append' }),
      FINE,
    ),
  });
  assert.equal(readFileSync(join(cartella, 'manca.txt'), 'utf8'), 'TOKEN_OK_V4\nLINEA_APPEND_V4',
    '⛔ il \\n che serve c\'è già: aggiungerne un altro sarebbe il doppio a-capo del caso precedente');
});

test('⛔ T-15-05 — un file VUOTO non prende un a-capo in testa: non c\'è riga da separare', async (t) => {
  const cartella = cartellaDiProva(t);
  writeFileSync(join(cartella, 'vuoto.txt'), '');
  await talosLavora({
    cartella, task: TASK, modello: 'x', chiave: 'y',
    fetchDiRete: sportello(
      chiamaScrivi({ percorso: 'vuoto.txt', contenuto: 'prima riga', mode: 'append' }),
      FINE,
    ),
  });
  assert.equal(readFileSync(join(cartella, 'vuoto.txt'), 'utf8'), 'prima riga',
    '⛔ un file che inizia con una riga vuota è un difetto nuovo, non una cura (come il file che non c\'è)');
});

test('⛔ T-15-06 — una scrittura PIENA non entra in questa cura: il default non cambia di un byte', async (t) => {
  const cartella = cartellaDiProva(t);
  writeFileSync(join(cartella, 'p.txt'), 'com\'era');
  await talosLavora({
    cartella, task: TASK, modello: 'x', chiave: 'y',
    // T25/B09 (30/09): il modello legge il file prima di sostituirlo, come deve
    fetchDiRete: sportello({ role: 'assistant', content: '', tool_calls: [{ id: 'call_0', function: { name: 'leggi', arguments: JSON.stringify({ percorso: 'p.txt' }) } }] }, chiamaScrivi({ percorso: 'p.txt', contenuto: 'nuovo, sempre senza a-capo' }), FINE),
  });
  assert.equal(readFileSync(join(cartella, 'p.txt'), 'utf8'), 'nuovo, sempre senza a-capo',
    'solo mode:"append" separa: la sostituzione intera resta quella di sempre');
});

/* ──────────────── document_create: la STESSA cura, attraverso l'altro chiamante ───────────── */

test('⭐⭐⭐ T-15-07 — document_create append separa il testo e conta i byte veri', async (t) => {
  const cartella = cartellaDiProva(t);
  await creaFileWorkspace({ cartella, nome: 'documento.md', bytes: 'PRIMA', modalita: 'nuovo' });
  const secondo = await creaFileWorkspace({ cartella, nome: 'documento.md', bytes: 'DOPO', modalita: 'accoda' });
  assert.equal(readFileSync(join(cartella, 'documento.md'), 'utf8'), 'PRIMA\nDOPO',
    '⛔ anche l\'altra strada che accoda fondeva le righe: stessa cura, una implementazione sola');
  assert.deepEqual([secondo.accodato, secondo.byteTotali], [true, 10],
    'il totale conta il \\n separatore: 5 + 1 + 4');
});

test('⛔ T-15-08 — document_create append su BINARIO non infila nessun 0x0A: sarebbero byte corrotti', async (t) => {
  const cartella = cartellaDiProva(t);
  await creaFileWorkspace({ cartella, nome: 'dati.bin', bytes: Buffer.from('BIN1'), modalita: 'nuovo' });
  const secondo = await creaFileWorkspace({ cartella, nome: 'dati.bin', bytes: Buffer.from('BIN2'), modalita: 'accoda' });
  assert.ok(Buffer.compare(readFileSync(join(cartella, 'dati.bin')), Buffer.from('BIN1BIN2')) === 0,
    '⛔ su byte binari un «a-capo» in mezzo non separa righe: le inventa e corrompe');
  assert.equal(secondo.byteTotali, 8);
});

test('⛔ T-15-09 — document_create append su file che finisce già con \\n: nessun doppio a-capo', async (t) => {
  const cartella = cartellaDiProva(t);
  await creaFileWorkspace({ cartella, nome: 'nota.md', bytes: 'riga\n', modalita: 'nuovo' });
  await creaFileWorkspace({ cartella, nome: 'nota.md', bytes: 'altra', modalita: 'accoda' });
  assert.equal(readFileSync(join(cartella, 'nota.md'), 'utf8'), 'riga\naltra');
});
