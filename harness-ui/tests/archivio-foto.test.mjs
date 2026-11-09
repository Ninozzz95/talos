import assert from 'node:assert/strict';
import test from 'node:test';
import { DISCO_MINIMO, GB, chiaveDelloStrato, creaArchivioFoto, identitaFoto, stessaIdentita } from '../src/archivio-foto.mjs';

const ID = identitaFoto({ modello: 'qwen', ggufSha256: 'a'.repeat(64), build: 11669, finestra: 16384, tipoKv: 'q8_0', motore: 'vulkan', livelli: 99 });

test('AF-1 identity: any field that differs makes it another snapshot (Jan; Performance 4; Mobile 1-3); key order does not matter', () => {
  assert.equal(stessaIdentita(ID, identitaFoto({ livelli: 99, motore: 'vulkan', tipoKv: 'q8_0', finestra: 16384, build: 11669, ggufSha256: 'a'.repeat(64), modello: 'qwen' })), true);
  for (const diverso of [{ build: 11960 }, { finestra: 32768 }, { motore: 'cpu' }, { livelli: 40 }, { proiettoreSha256: 'b'.repeat(64) }, { speculativa: 'ngram-mod' }, { ggufSha256: 'c'.repeat(64) }]) {
    const altro = identitaFoto({ modello: 'qwen', ggufSha256: 'a'.repeat(64), build: 11669, finestra: 16384, tipoKv: 'q8_0', motore: 'vulkan', livelli: 99, ...diverso });
    assert.equal(stessaIdentita(ID, altro), false, JSON.stringify(diverso));
  }
  assert.deepEqual(identitaFoto({ modello: 'x', ggufBytes: 5, ggufData: 'd' }).gguf, { bytes: 5, data: 'd' }, 'the date only without a sha (Mobile 2)');
  assert.equal(stessaIdentita(null, ID), false);
});

test('AF-2 the layer key: only the messages before the person, the tools and the template options', () => {
  const sis = [{ role: 'system', content: 'S' }];
  const a = chiaveDelloStrato({ messaggi: [...sis, { role: 'user', content: 'uno' }], attrezzi: ['t'] });
  assert.equal(a, chiaveDelloStrato({ messaggi: [...sis, { role: 'user', content: 'due' }], attrezzi: ['t'] }), 'what the person writes is not in the key');
  assert.notEqual(a, chiaveDelloStrato({ messaggi: [{ role: 'system', content: 'S2' }], attrezzi: ['t'] }));
  assert.notEqual(a, chiaveDelloStrato({ messaggi: sis, attrezzi: ['t', 'u'] }));
  assert.notEqual(a, chiaveDelloStrato({ messaggi: sis, attrezzi: ['t'], opzioniTemplate: { enable_thinking: false } }));
  assert.equal(chiaveDelloStrato({ messaggi: sis, opzioniTemplate: { a: 1, b: 2 } }), chiaveDelloStrato({ messaggi: sis, opzioniTemplate: { b: 2, a: 1 } }), 'the order of the options does not make another key');
});

test('AF-3 put back only on the same identity; a missing one is a normal miss (Mobile 4); a wrong one is deleted', () => {
  const ar = creaArchivioFoto();
  assert.deepEqual(ar.daRimettere('c1', ID), { rimetti: false, motivo: 'assente' });
  ar.registra({ nome: 'c1', tipo: 'conversazione', bytes: GB, identita: ID });
  assert.deepEqual(ar.daRimettere('c1', ID), { rimetti: true });
  assert.deepEqual(ar.daRimettere('c1', { ...ID, build: 1 }), { rimetti: false, motivo: 'identita-diversa', cancella: ['c1'] });
});

test('AF-4 caps: 8 GB of conversations, least recently used first; 10 GB in all; the common one never goes', () => {
  let t = 0;
  const ar = creaArchivioFoto({ adesso: () => (t += 1) });
  ar.registra({ nome: 'comune', tipo: 'comune', bytes: 1 * GB, identita: ID });
  for (let i = 1; i <= 8; i += 1) ar.registra({ nome: `c${i}`, tipo: 'conversazione', bytes: 1 * GB, identita: ID });
  ar.daRimettere('c1', ID); // c1 used again: c2 is now the oldest
  const r = ar.ammetti({ nome: 'c9', tipo: 'conversazione', bytes: GB, identita: ID });
  assert.deepEqual(r, { scrivi: true, cancella: ['c2'], motivo: null });
  ar.registra({ nome: 'progetto', tipo: 'progetto', bytes: 0.5 * GB, identita: ID });
  const grande = ar.ammetti({ nome: 'p2', tipo: 'progetto', bytes: 1.5 * GB, identita: ID });
  assert.equal(grande.cancella.includes('comune'), false, 'the common snapshot is never deleted');
  assert.equal(grande.scrivi, true);
  const troppo = creaArchivioFoto().ammetti({ nome: 'x', tipo: 'conversazione', bytes: 9 * GB, identita: ID });
  assert.deepEqual(troppo, { scrivi: false, cancella: [], motivo: 'non-entra' });
});

test('AF-5 the other way: memory off, disk under 20 GB, the same prefix again, too short, empty — nothing is written', () => {
  assert.equal(creaArchivioFoto({ tettoConversazioni: 0 }).ammetti({ nome: 'c', tipo: 'conversazione', bytes: GB, identita: ID }).motivo, 'spenta');
  assert.equal(creaArchivioFoto({ tettoConversazioni: 0 }).ammetti({ nome: 'p', tipo: 'comune', bytes: GB, identita: ID }).scrivi, true, 'off is the conversations, not the common layer');
  assert.equal(creaArchivioFoto().ammetti({ nome: 'c', tipo: 'conversazione', bytes: GB, identita: ID, discoLibero: DISCO_MINIMO - 1 }).motivo, 'disco-pieno');
  const ar = creaArchivioFoto();
  ar.registra({ nome: 'comune', tipo: 'comune', bytes: GB, identita: ID, chiave: 'k' });
  assert.equal(ar.ammetti({ nome: 'comune', tipo: 'comune', bytes: GB, identita: ID, chiave: 'k' }).motivo, 'uguale', 'Performance 3: no rewrite');
  assert.equal(ar.ammetti({ nome: 'comune', tipo: 'comune', bytes: GB, identita: ID, chiave: 'k2' }).scrivi, true, 'a changed prefix is written again');
  assert.equal(creaArchivioFoto().ammetti({ nome: 'c', tipo: 'conversazione', bytes: GB, identita: ID, token: 100 }).motivo, 'troppo-corta');
  assert.equal(creaArchivioFoto().ammetti({ nome: 'c', tipo: 'conversazione', bytes: 0, identita: ID }).motivo, 'vuota');
});
