import assert from 'node:assert/strict';
import test from 'node:test';

import { processiDagliEventi } from '../../src/components/inspector.js';

/*
 * ⛔ A5 (08/10/2026, bugfixer) — «processi duplicati» nella scheda Processi. NON riprodotto dal vivo sulla 4176 (fornitore finto, due
 *   comandi e un comando lungo da 25 s: prima apertura, ricarica, cambio sessione, riconnessione, a giro finito — sempre una riga
 *   per comando). L'owner (08/10, sera) non ricorda la scena e ha scelto la protezione: lo stesso comando, cioè lo stesso
 *   `toolCallId`, non diventa mai due righe.
 * Lo stesso id che arriva due volte succede nelle pile vere: l'SDK degli agenti OpenAI emetteva due volte la stessa `call_id`
 *   (openai/openai-agents-python#1862), LocalAI rimandava le chiamate a ogni frammento (commit e1a6010); la regola comune è che
 *   la chiave è l'id e vince il primo.
 */
const avvio = (id, extra = {}) => ({ type: 'ToolCallStart', toolCallId: id, toolCallName: 'shell', ricevutoA: 1000, ...extra });
const argomenti = (id, comando) => ({ type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify({ comando }) });
const esito = (id) => ({ type: 'ToolCallResult', toolCallId: id, esito: 'ok', ricevutoA: 2000 });

test('A5-01 — lo stesso comando arrivato due volte è UNA riga, col suo comando e il suo esito', () => {
  const righe = processiDagliEventi([avvio('c1'), argomenti('c1', 'echo primo'), avvio('c1'), esito('c1')], { adesso: 3000 });
  assert.equal(righe.length, 1, `righe: ${JSON.stringify(righe.map((r) => r.comando))}`);
  assert.equal(righe[0].comando, 'echo primo', 'il secondo avvio ha cancellato il comando del primo');
});

test('A5-02 — AL CONTRARIO: due comandi diversi restano due righe', () => {
  const righe = processiDagliEventi([avvio('c1'), argomenti('c1', 'echo primo'), avvio('c2'), argomenti('c2', 'echo secondo')], { adesso: 3000 });
  assert.deepEqual(righe.map((r) => r.comando).sort(), ['echo primo', 'echo secondo']);
});

/* A5 R2 (review desktop, 08/10/2026) — i tre casi misurati dal revisore sulla funzione vera, uno per prova. */
const conSeq = (e, s) => ({ ...e, _sequenza: s });
const esitoRiuscito = (id, s) => ({ type: 'ToolCallResult', toolCallId: id, errore: false, uscita: 0, durataMs: 300, comando: null, cwd: null, ricevutoA: 2000, _sequenza: s });

test('A5-03 — avvio doppio con sequenze DIVERSE: una riga, «echo primo», riuscito', () => {
  const righe = processiDagliEventi([conSeq(avvio('c1'), 1), conSeq(argomenti('c1', 'echo primo'), 2), conSeq(avvio('c1'), 3), esitoRiuscito('c1', 4)], { adesso: 3000 });
  assert.equal(righe.length, 1);
  assert.equal(righe[0].comando, 'echo primo');
  assert.equal(righe[0].stato, 'riuscito');
});

test('A5-04 — BLOCCO INTERO doppio con le stesse sequenze (rigiocata sovrapposta al vivo): una riga, «echo primo», riuscito', () => {
  const blocco = [conSeq(avvio('c1'), 1), conSeq(argomenti('c1', 'echo primo'), 2)];
  const righe = processiDagliEventi([...blocco, ...blocco, esitoRiuscito('c1', 3)], { adesso: 3000 });
  assert.equal(righe.length, 1);
  assert.equal(righe[0].comando, 'echo primo', 'gli argomenti raddoppiati sono finiti nel comando');
  assert.equal(righe[0].stato, 'riuscito');
});

test('A5-05 — argomenti a pezzi arrivati due volte con le stesse sequenze: il comando resta intero e una volta sola', () => {
  const pezzi = [{ type: 'ToolCallArgs', toolCallId: 'c1', delta: '{"comando":"echo', _sequenza: 2 }, { type: 'ToolCallArgs', toolCallId: 'c1', delta: ' primo"}', _sequenza: 3 }];
  const righe = processiDagliEventi([conSeq(avvio('c1'), 1), ...pezzi, ...pezzi, esitoRiuscito('c1', 4)], { adesso: 3000 });
  assert.equal(righe.length, 1);
  assert.equal(righe[0].comando, 'echo primo');
  assert.equal(righe[0].stato, 'riuscito');
});
