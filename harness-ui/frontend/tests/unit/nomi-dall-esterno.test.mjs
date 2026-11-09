/*
 * Il nome di un attrezzo lo decide il modello o un server MCP: `constructor` o `__proto__` non devono trovare una proprietà di Object nelle
 * tabelle del pannello (Mobile, 31/10/2026, dopo la revisione D-7: «vale la pena guardare la stessa cosa nelle mappe che ricevono nomi dall'esterno»).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { esitoDichiaraFallimento } from '../../src/components/esito-comando.js';
import { iconaAttrezzo } from '../../src/components/conversazione.js';
import { verboAttrezzo } from '../../src/components/nomi-attrezzi.js';

test('NOMI-01 a tool named like an Object property does not break the reading of its outcome', () => {
  for (const nome of ['constructor', 'toString', '__proto__']) {
    assert.equal(esitoDichiaraFallimento(nome, 'tutto bene'), false, nome);
    assert.equal(esitoDichiaraFallimento(nome, `${nome} failed: no`), true, nome);
  }
});

test('NOMI-02 such a tool takes the generic icon', () => {
  for (const nome of ['constructor', 'toString', '__proto__']) assert.equal(iconaAttrezzo(nome), 'i-wrench', nome);
  assert.notEqual(iconaAttrezzo('remote_control'), 'i-wrench', 'CONTROLLO: a known tool keeps its icon');
});

test('NOMI-03 such a tool takes its readable name as verb, not a phrase built on a function', () => {
  for (const nome of ['constructor', 'toString']) {
    const [passato, presente] = verboAttrezzo(nome);
    assert.equal(passato, presente, nome);
    assert.doesNotMatch(passato, /undefined|function|native code/u, nome);
    assert.ok(passato.length > 0, nome);
  }
  const [noto] = verboAttrezzo('leggi');
  assert.notEqual(noto, 'leggi', 'CONTROLLO: a known tool keeps its verb');
});
