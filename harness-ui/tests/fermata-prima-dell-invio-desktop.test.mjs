/*
 * FERMATA-INVIO-03, a parte dal 16/10/2026 (revisione del bugfixer, R1): legge il dizionario del frontend desktop, che nell'albero
 * della CLI non c'è; nel file comune avrebbe fatto cadere al caricamento anche le prove del kernel che la CLI aveva chiesto.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { puntoNellaLingua } from '../frontend/src/components/errori.js';

test('FERMATA-INVIO-03 — la fase nuova ha la sua frase nella lingua dell interfaccia (non passa grezza in inglese)', async () => {
  const { impostaLingua } = await import('../frontend/src/components/lingua.js');
  impostaLingua('it');
  try { assert.equal(puntoNellaLingua('before the request was sent, at round 3'), 'prima che la richiesta partisse, al giro 3'); }
  finally { impostaLingua('en'); }
  assert.equal(puntoNellaLingua('before the request was sent, at round 3'), 'before the request was sent, at round 3');
});
