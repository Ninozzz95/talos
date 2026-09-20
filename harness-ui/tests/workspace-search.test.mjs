/*
 * PO-30, fetta 1 (17/09/2026) — cercare un file in TUTTA la cartella della sessione. Disco vero, cartelle temporanee.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { cercaNelWorkspace, CARTELLE_SALTATE } from '../src/workspace-search.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function progetto(t) {
  const cartella = mkdtempSync(join(tmpdir(), 'ws-search-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  for (const d of ['src/profondo/ancora', 'tests', 'node_modules/pacco', '.git/objects']) mkdirSync(join(cartella, d), { recursive: true });
  for (const f of ['README.md', 'src/registro.mjs', 'src/profondo/ancora/registro-vecchio.mjs', 'tests/registro.test.mjs', 'node_modules/pacco/registro.js', '.git/objects/registro']) writeFileSync(join(cartella, f), 'x');
  return cartella;
}

test('WS-SEARCH-01 — trova un file in una cartella MAI aperta, e mette prima chi porta la parola nel nome', async (t) => {
  const cartella = progetto(t);
  const r = await cercaNelWorkspace({ cartella, query: 'Registro' });
  assert.deepEqual(r.risultati.map((x) => x.percorso), ['src/registro.mjs', 'tests/registro.test.mjs', 'src/profondo/ancora/registro-vecchio.mjs']);
  assert.equal(r.troncato, false);
  assert.ok(r.risultati.every((x) => x.cartella === false));
});

test('WS-SEARCH-02 — `.git` e `node_modules` si saltano, e la risposta LO DICE', async (t) => {
  const cartella = progetto(t);
  const r = await cercaNelWorkspace({ cartella, query: 'registro' });
  assert.ok(!r.risultati.some((x) => x.percorso.startsWith('node_modules/') || x.percorso.startsWith('.git/')));
  assert.deepEqual(r.saltate, [...CARTELLE_SALTATE].sort());
});

test('WS-SEARCH-03 — la parola nel PERCORSO trova anche le cartelle, e una query vuota o enorme è rifiutata', async (t) => {
  const cartella = progetto(t);
  const r = await cercaNelWorkspace({ cartella, query: 'profondo' });
  assert.deepEqual(r.risultati[0], { percorso: 'src/profondo', nome: 'profondo', cartella: true });
  assert.ok(r.risultati.some((x) => x.percorso === 'src/profondo/ancora/registro-vecchio.mjs'));
  await assert.rejects(() => cercaNelWorkspace({ cartella, query: '   ' }), { code: 'QUERY_INVALID' });
  await assert.rejects(() => cercaNelWorkspace({ cartella, query: 'a'.repeat(300) }), { code: 'PAYLOAD_LIMIT' });
  await assert.rejects(() => cercaNelWorkspace({ cartella: 'relativa', query: 'x' }), { code: 'QUERY_INVALID' });
});

test('WS-SEARCH-04 — i tetti MORDONO e lo dicono: mai un elenco tagliato che sembra completo', async (t) => {
  const cartella = progetto(t);
  const pochi = await cercaNelWorkspace({ cartella, query: 'registro' }, { limiti: { risultati: 2 } });
  assert.equal(pochi.risultati.length, 2);
  assert.equal(pochi.troncato, true);
  assert.match(pochi.motivo, /più risultati/);
  const grande = await cercaNelWorkspace({ cartella, query: 'registro' }, { limiti: { vociVisitate: 3 } });
  assert.equal(grande.troncato, true);
  assert.match(grande.motivo, /molto grande/);
});

test('WS-SEARCH-05 — un collegamento non si segue: la ricerca non esce dalla cartella e non gira in tondo', async (t) => {
  const cartella = progetto(t);
  const fuori = mkdtempSync(join(tmpdir(), 'ws-search-fuori-'));
  t.after(() => rimuoviCartellaDiProva(fuori));
  writeFileSync(join(fuori, 'registro-segreto.txt'), 'x');
  try { symlinkSync(fuori, join(cartella, 'uscita'), 'junction'); symlinkSync(cartella, join(cartella, 'src', 'anello'), 'junction'); }
  catch (errore) { t.skip(`questa macchina non lascia creare giunzioni (${errore.code})`); return; }
  const r = await cercaNelWorkspace({ cartella, query: 'registro' });
  assert.ok(!r.risultati.some((x) => x.percorso.includes('segreto')), '⛔ la ricerca è uscita dalla cartella della sessione');
  assert.ok(!r.risultati.some((x) => x.percorso.includes('anello')), '⛔ la ricerca ha seguito un anello');
  assert.equal(r.troncato, false);
});
