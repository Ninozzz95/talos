import assert from 'node:assert/strict';
import test from 'node:test';

const { codiceBrevePc } = await import('../../src/components/remoto.js');

test('REMOTO-CODICE-PC (24/10, contratto col Mobile): i primi 4 caratteri dell\'id, in minuscolo; senza id niente codice', () => {
  assert.equal(codiceBrevePc('31ABcdef0123'), '31ab');
  assert.equal(codiceBrevePc('9f0c'), '9f0c');
  /* AL CONTRARIO: remoto spento (id null), id corto o non stringa ⇒ nessun codice, mai un pezzo inventato */
  for (const id of [null, undefined, '', 'abc', 42, {}]) assert.equal(codiceBrevePc(id), '', String(id));
});
