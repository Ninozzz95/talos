/*
 * K3 (F-Y-002 dello stress test della CLI 0.6.7, S4 dopo il triage, 16/10/2026) — in una cartella VUOTA il preambolo spariva tutto, e
 * con lui la riga «Turn permission» che dice al modello se una domanda o un piano saranno rifiutati (invariante R84). Il tester l'ha
 * vista mancare in 5 corse `-p` su 5, tutte in cartelle vuote. Cura: la sola riga del permesso, col marcatore della scheda; il resto
 * resta spento. AL CONTRARIO: senza permesso, nessun preambolo come prima; con un file, la scheda intera come prima.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contestoDelProgetto, preamboloVistoDa, INIZIO_SCHEDA } from '../src/contesto-del-progetto.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const PERMESSO = 'Ask before edits, with nobody here to answer: what would be asked is refused';

function cartellaVuota(t) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-k3-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  return cartella;
}

test('K3-01: an empty folder with a turn permission gets ONE line, the permission, marked as the working sheet', async (t) => {
  const esito = await contestoDelProgetto({ cartella: cartellaVuota(t), permesso: PERMESSO });
  assert.ok(esito, 'the permission is a TALOS fact: it is said even with nothing in the folder');
  assert.equal(esito.testo, `${INIZIO_SCHEDA}Turn permission: ${PERMESSO}.`);
  assert.equal(esito.blocchi.scheda, null, 'the rest of the sheet stays off');
  assert.equal(esito.blocchi.mappa, null);
  assert.equal(esito.sospetto, null);
  assert.equal(preamboloVistoDa([{ role: 'system', content: esito.testo }]), esito.testo, 'recognised as the preamble on the next turn');
});

test('K3-02: AL CONTRARIO — no permission ⇒ no preamble, as before; one file ⇒ the whole sheet, as before', async (t) => {
  assert.equal(await contestoDelProgetto({ cartella: cartellaVuota(t) }), null);
  const conUnFile = cartellaVuota(t);
  writeFileSync(join(conUnFile, 'note.txt'), 'ciao');
  const esito = await contestoDelProgetto({ cartella: conUnFile, permesso: PERMESSO });
  assert.ok(esito.blocchi.scheda, 'with a file the working sheet is there');
  assert.ok(esito.testo.includes(`Turn permission: ${PERMESSO}.`));
  assert.notEqual(esito.testo, `${INIZIO_SCHEDA}Turn permission: ${PERMESSO}.`, 'not the one-line form');
});
