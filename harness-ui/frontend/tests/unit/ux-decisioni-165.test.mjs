/*
 * Decisione dell'owner 165 (04/11/2026, variante A di `variante-19-seguito.html`, riga 19 della revisione d'uso della candidata): il
 * messaggio mandato a giro in corso o dopo una risposta si chiama «Seguito» (en «Follow-up») DAL DIZIONARIO, la stessa parola delle
 * conversazioni figlie (`chat.child.followUp`, owner 24/10); via la scritta a mano «Follow-up» in `legacy/app.js`. Campo: «Scrivi il
 * seguito…»; trascrizione: «**Seguito:** ». Ogni prova anche al contrario: in italiano «follow-up» non c'è più.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { impostaLingua, t } from '../../src/components/lingua.js';
import { AREE } from '../../src/i18n/testi/index.js';

const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
const codice = app.split('\n').filter((r) => !/^\s*(\*|\/\/|\/\*)/u.test(r)).join('\n'); // le righe di commento raccontano la storia, non parlano a schermo

test('UXD165-01 — la testata e la trascrizione prendono la parola dal dizionario: niente «Follow-up» scritto a mano nel codice della chat', () => {
  assert.doesNotMatch(codice, /'Follow-up'/u, 'AL CONTRARIO: la testata «Follow-up» scritta a mano');
  assert.doesNotMatch(codice, /'\*\*Follow-up:\*\* '/u, 'AL CONTRARIO: la trascrizione «**Follow-up:**» scritta a mano');
  assert.match(codice, /const etichettaBase = state\.realSession\.taskBubbleMostrata \? tr\('chat\.child\.followUp'\) : tr\('app\.composer\.freeTask'\);/u);
  assert.match(codice, /input\.seguito \? `\*\*\$\{tr\('chat\.child\.followUp'\)\}:\*\* ` : ''/u);
  assert.ok((codice.match(/dataset\.etichettaBase \?\? tr\('chat\.child\.followUp'\)/gu) ?? []).length >= 2, 'le due testate completate col permesso confrontano la stessa parola');
});

test('UXD165-02 — «Seguito» in italiano, «Follow-up» in inglese: testata, campo, coda e trascrizione', () => {
  try {
    impostaLingua('it');
    assert.equal(t('chat.child.followUp'), 'Seguito');
    assert.equal(t('app.composer.followUpRedirect'), 'Scrivi il seguito… Invio indirizza, Ctrl+Invio accoda');
    assert.equal(t('app.composer.followUpChoose'), 'Scrivi il seguito… Invio per scegliere, Ctrl+Invio accoda');
    assert.equal(t('app.queue.followUpQueued'), 'Il seguito è già in coda');
    assert.match(t('app.queue.noActiveSessionBody'), /^Il seguito si mette in coda/u);
    assert.equal(t('app.transcript.queuedFollowUp'), '⏭️ **Seguito dalla coda:**');
    const italiano = Object.values(AREE).flatMap((area) => Object.values(area.it ?? {})).filter((v) => typeof v === 'string');
    assert.deepEqual(italiano.filter((v) => /follow-up/iu.test(v)), [], 'AL CONTRARIO: «follow-up» inglese in un testo italiano');
    impostaLingua('en');
    assert.equal(t('chat.child.followUp'), 'Follow-up');
    assert.equal(t('app.composer.followUpRedirect'), 'Write a follow-up… Enter redirects, Ctrl+Enter queues');
    assert.equal(t('app.transcript.queuedFollowUp'), '⏭️ **Follow-up from the queue:**');
  } finally { impostaLingua('it'); }
});
