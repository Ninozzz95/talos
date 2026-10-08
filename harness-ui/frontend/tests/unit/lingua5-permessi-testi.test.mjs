/*
 * LINGUA-5 (08/10/2026, bugfixer) — i testi della finestra «Quanto può fare TALOS qui» e dintorni, visti nelle foto:
 *  - i titoli delle righe «per attrezzo» minuscoli («scrittura di un file») accanto a «Modo di lavoro»;
 *  - parole interne a schermo («passa dal cancello semantico», «cancello per-attrezzo»): regola dell'owner del 04/09,
 *    niente nomi tecnici nell'interfaccia;
 *  - il toast «Policy aggiornata», una parola inglese nell'interfaccia italiana;
 *  - `etichettaPermesso('Research')` restituito crudo (il perché della carta di una figlia di ricerca).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import testiApp from '../../src/i18n/testi/app.js';
import { etichettaPermesso } from '../../src/components/chat-foot.js';
import { impostaLingua } from '../../src/components/lingua.js';

test('L5-01 «Research» ha il suo nome nelle due lingue; le quattro politiche e il ripiego non cambiano', () => {
  impostaLingua('it');
  assert.equal(etichettaPermesso('Research'), 'Solo ricerca');
  assert.equal(etichettaPermesso('Read only'), 'Solo lettura');
  assert.equal(etichettaPermesso(null), 'Permesso non scelto');
  impostaLingua('en');
  assert.equal(etichettaPermesso('Research'), 'Research only');
  assert.equal(etichettaPermesso('Read only'), 'Read only');
  impostaLingua('it');
  assert.equal(etichettaPermesso('Qualcosa di sconosciuto'), 'Qualcosa di sconosciuto', 'al contrario: un valore ignoto resta com è');
});

test('L5-02 la finestra dei permessi non dice parole interne, e il toast non dice «Policy»', () => {
  const chiavi = ['sheets.permissions.toolWrite', 'sheets.permissions.toolEdit', 'sheets.permissions.toolEditList',
    'sheets.permissions.toolImage', 'sheets.permissions.toolImageList'];
  for (const lingua of ['it', 'en']) {
    for (const k of chiavi) {
      const testo = testiApp[lingua][k];
      assert.equal(typeof testo, 'string', `${lingua} ${k} esiste`);
      assert.doesNotMatch(testo, /cancello|semantic|per-tool|gate\b/iu, `${lingua} ${k}: «${testo}»`);
    }
  }
  assert.equal(testiApp.it['permissions.policyUpdated'], 'Permessi aggiornati');
  assert.equal(testiApp.en['permissions.policyUpdated'], 'Permissions updated');
});

test('L5-03 il nome di un attrezzo diventa titolo con la maiuscola (nella lingua dell interfaccia), e solo lì', () => {
  const APP = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  const riga = APP.match(/  const comeTitolo = \([^\n]*\n/)?.[0];
  assert.ok(riga, 'comeTitolo esiste');
  const comeTitolo = vm.runInNewContext(`${riga.replace('const comeTitolo =', 'comeTitolo =')}; comeTitolo`, { localeUI: () => 'it-IT', String });
  assert.equal(comeTitolo('scrittura di un file'), 'Scrittura di un file');
  assert.equal(comeTitolo('modifica di un file'), 'Modifica di un file');
  assert.equal(comeTitolo(''), '');
  assert.equal(comeTitolo(null), '');
  // le due righe che disegnano i titoli lo usano; il titolo nativo con l'id tecnico non c'è più
  assert.match(APP, /talos-list-row__title">\$\{comeTitolo\(nomeUmanoAttrezzo\(attrezzo\)\)\}/);
  assert.match(APP, /<strong>\$\{comeTitolo\(nomeUmanoAttrezzo\(tool\)\)\}<\/strong>/);
  assert.doesNotMatch(APP, /<strong title="\$\{tool\}">/, 'al contrario: nessun id tecnico come suggerimento');
});
