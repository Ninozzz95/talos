/*
 * Decision 398 (owner, 08/11/2026), cure 1: a Choices block already answered says so. The note under it stops promising «a click sends
 * your choice» and says the choice was already sent (a second click used to be silent). Hermes answers a second response to the same
 * prompt with `already_resolved` (`gateway/session_pending_controls.py:71`).
 * Cure 2 (the title of a v2) has its own file: `blocchi-titolo-versioni-398.test.mjs`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documento, clic } from './aiuto-dom-blocchi.mjs';
import { impostaLingua, t } from '../../src/components/lingua.js';
import { disegnaScelte } from '../../src/components/blocchi/scelte.js';
import { statoAzione } from '../../src/components/blocchi/azione.js';
import { leggi } from '../../../src/blocchi/lettore.mjs';

const fixture = (n) => readFileSync(new URL(`../../../tests/fixtures/blocchi/${n}`, import.meta.url), 'utf8').trim();

function scelte() {
  const doc = documento();
  const blocco = leggi(fixture('03-scelte.txt')).blocco;
  const stato = statoAzione();
  const inviati = [];
  const nodo = disegnaScelte(blocco, { document: doc, interattivo: true, stato, quandoScelto: (a) => inviati.push(a.valore) });
  doc.body.append(nodo);
  const tasto = (testo) => nodo.querySelectorAll('.gu-scelte button').find((b) => b.dataset.scelta === testo);
  const nota = () => nodo.querySelector('.gu-scelte__nota')?.textContent;
  return { nodo, stato, inviati, tasto, nota };
}

for (const lingua of ['en', 'it']) {
  test(`D398-1 (${lingua}) a Choices block already answered says the choice was already sent; the second click still sends nothing`, () => {
    impostaLingua(lingua);
    const x = scelte();
    assert.equal(x.nota(), t('blocchi.choices.note'), 'before the click: the usual note');
    clic(x.tasto('Continua'));
    assert.deepEqual(x.inviati, ['Continua']);
    assert.notEqual(t('blocchi.choices.sent'), 'blocchi.choices.sent', 'the sentence is in the dictionary');
    assert.equal(x.nota(), t('blocchi.choices.sent'), 'after the click: the note says the choice was sent');
    clic(x.tasto('Fermati qui'));
    clic(x.tasto('Continua'));
    assert.deepEqual(x.inviati, ['Continua'], 'the block answers once');
    assert.equal(x.nota(), t('blocchi.choices.sent'));
  });
}

test('D398-1 the exact sentences, English first and Italian', () => {
  impostaLingua('en');
  assert.equal(t('blocchi.choices.sent'), 'Choice already sent. A block answers only once.');
  impostaLingua('it');
  assert.equal(t('blocchi.choices.sent'), 'Scelta già mandata. Un blocco risponde una volta sola.');
});

test('D398-1 a block drawn already answered (reload) says so at once; a send taken back says «not sent», never «already sent»', () => {
  impostaLingua('it');
  const doc = documento();
  const blocco = leggi(fixture('03-scelte.txt')).blocco;
  const risposto = disegnaScelte(blocco, { document: doc, interattivo: true, stato: statoAzione({ valore: 'Continua' }) });
  assert.equal(risposto.querySelector('.gu-scelte__nota').textContent, t('blocchi.choices.sent'));
  const ripreso = disegnaScelte(blocco, { document: doc, interattivo: true, stato: { azione: null, nonInviata: true } });
  assert.equal(ripreso.querySelector('.gu-scelte__nota').textContent, t('blocchi.choices.notSent'));
  const soloLettura = disegnaScelte(blocco, { document: doc, interattivo: false, soloLettura: true, stato: statoAzione({ valore: 'Continua' }) });
  assert.equal(soloLettura.querySelector('.gu-scelte__nota'), null, 'read-only: still no sentence at all');
});
