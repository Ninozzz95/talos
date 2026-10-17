/*
 * 13/10/2026, review avversaria di `28c973bdc` (copie identiche: il giro continua con una nota). La nota è un messaggio
 * `user` senza nessun segno, e la compattazione tiene «alla lettera» le ultime 3 richieste DELLA PERSONA: con due o più note
 * in un giro (fino a 5 con la guardia accesa) le richieste vere uscivano dalle tre, e al loro posto restava tre volte la
 * stessa riga di TALOS. Vale per ogni nota che il kernel scrive come `user` e che comincia con `[TALOS` (copie scartate,
 * risposta tagliata dal tetto, silenzio del fornitore).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { NOTA_CONTINUA_DOPO_SILENZIO, NOTA_CONTINUA_DOPO_TETTO, notaCopieScartate } from '../src/kernel/talosHarness.mjs';
import { dividiPerCompattazione, eNotaDiTalos, eRichiestaDellaPersona } from '../src/kernel/compattazione-desktop.mjs';
import { eRichiestaDellaPersonaPerIlRegistro } from '../src/context-runtime.mjs';

const NOTA = { role: 'user', content: notaCopieScartate({ nome: 'leggi', viste: 3 }) };
const scambio = (i) => [{ role: 'assistant', content: '', tool_calls: [{ id: `c${i}`, type: 'function', function: { name: 'leggi', arguments: '{}' } }] }, { role: 'tool', tool_call_id: `c${i}`, content: 'x'.repeat(50) }];

function storiaConNote(quante) {
  const storia = [{ role: 'system', content: 's' }, { role: 'user', content: 'RICHIESTA-VERA-1' }, { role: 'assistant', content: 'a' }, { role: 'user', content: 'RICHIESTA-VERA-2' }];
  for (let i = 0; i < quante; i += 1) storia.push(...scambio(i), NOTA);
  for (let i = quante; i < quante + 5; i += 1) storia.push(...scambio(i));
  return storia;
}

test('NOTA-DI-TALOS-01 — tre note di TALOS non prendono il posto delle richieste della persona tenute alla lettera', () => {
  const parti = dividiPerCompattazione(storiaConNote(3));
  const letterali = [...parti.richiesteLetterali, ...parti.coda.filter((m) => m.role === 'user')].map((m) => m.content);
  assert.ok(letterali.includes('RICHIESTA-VERA-1') && letterali.includes('RICHIESTA-VERA-2'), `le richieste vere restano alla lettera: ${JSON.stringify(letterali.map((t) => t.slice(0, 24)))}`);
  assert.equal(parti.richiesteLetterali.some(eNotaDiTalos), false, 'una nota di TALOS non è una richiesta della persona');
});

test('NOTA-DI-TALOS-02 — le tre note del kernel sono riconosciute; al contrario, una richiesta della persona no (nemmeno se parla di TALOS)', () => {
  for (const content of [NOTA.content, NOTA_CONTINUA_DOPO_TETTO, NOTA_CONTINUA_DOPO_SILENZIO]) {
    assert.equal(eNotaDiTalos({ role: 'user', content }), true, content.slice(0, 40));
    assert.equal(eRichiestaDellaPersonaPerIlRegistro({ role: 'user', content }), false, 'nemmeno nel registro del motore');
  }
  for (const content of ['Perché TALOS ha scritto [TALOS] nella chat?', 'TALOS: fai il build', ' [TALOS] con uno spazio davanti la scrive una persona']) {
    assert.equal(eNotaDiTalos({ role: 'user', content }), false, content);
    assert.equal(eRichiestaDellaPersonaPerIlRegistro({ role: 'user', content }), true);
  }
  assert.equal(eNotaDiTalos({ role: 'assistant', content: NOTA.content }), false);
  /* il confine degli scambi non cambia: per il taglio una nota resta un `user` come prima */
  assert.equal(eRichiestaDellaPersona(NOTA), true);
});

test('NOTA-DI-TALOS-03, al contrario — senza note la divisione è quella di sempre', () => {
  const parti = dividiPerCompattazione(storiaConNote(0));
  assert.deepEqual(parti.richiesteLetterali.map((m) => m.content), ['RICHIESTA-VERA-1', 'RICHIESTA-VERA-2']);
});
