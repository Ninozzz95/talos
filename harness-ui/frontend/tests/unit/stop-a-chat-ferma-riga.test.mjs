/*
 * Owner 29/10/2026 sera, «Stop anche a chat ferma» (bozzetto approvato): una chat che ha risposto ma ha agenti al lavoro non è «conclusa»
 * per chi la guarda — la riga dell'elenco dice «N agenti al lavoro», col pallino vivo. Il numero lo dà il server (`discendentiAlLavoro`).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { impostaLingua } from '../../src/components/lingua.js';
import { statoSessione } from '../../src/components/session-item.js';

test('SAF-RIGA-01 conclusa con 2 agenti al lavoro: «2 agenti al lavoro», tono vivo; in inglese «2 agents working»; uno al singolare', () => {
  impostaLingua('it');
  const s = statoSessione({ conclusa: true, interrotta: false, ultimoEsito: 'successo', discendentiAlLavoro: 2 });
  assert.deepEqual([s.classe, s.testo, s.tono], ['agenti', '2 agenti al lavoro', 'live']);
  assert.equal(statoSessione({ conclusa: true, ultimoEsito: 'successo', discendentiAlLavoro: 1 }).testo, '1 agente al lavoro');
  impostaLingua('en');
  assert.equal(statoSessione({ conclusa: true, ultimoEsito: 'successo', discendentiAlLavoro: 2 }).testo, '2 agents working');
  impostaLingua('it');
});

test('SAF-RIGA-02 AL CONTRARIO: senza il campo resta «conclusa»; «aspetta te», «interrotta» e «in corso» vincono sugli agenti', () => {
  impostaLingua('it');
  assert.equal(statoSessione({ conclusa: true, ultimoEsito: 'successo' }).classe, 'successo');
  assert.equal(statoSessione({ conclusa: true, ultimoEsito: 'successo', discendentiAlLavoro: 0 }).classe, 'successo');
  assert.equal(statoSessione({ conclusa: true, ultimoEsito: 'successo', discendentiAlLavoro: 2, inAttesaDiscendente: true }).classe, 'attesa');
  assert.equal(statoSessione({ conclusa: false, interrotta: true, discendentiAlLavoro: 2 }).classe, 'interrotto');
  assert.equal(statoSessione({ conclusa: false, discendentiAlLavoro: 2 }).classe, 'vivo');
});
