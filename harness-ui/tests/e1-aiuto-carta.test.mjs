/*
 * E1, D10 (Desktop review 04/11, rule 21: the help page travels with the code). The guide ships `aiuto/index.json`, built from the
 * site (`scripts/costruisci-aiuto.mjs`, never edited by hand): the emulated card must have its section in
 * `desktop/concepts/permissions`, and the section must use the SAME words the card shows (the English texts of the UI), so a
 * renamed button cannot leave the help behind. Text: `Downloads/TALOS/motore-locale/in-corso/AIUTO-E1-CARTA-EMULATA-2026-11-04.md`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import testi from '../frontend/src/i18n/testi/chat.js';

const indice = JSON.parse(readFileSync(new URL('../aiuto/index.json', import.meta.url), 'utf8'));
const pagina = indice.pagine.find((p) => p.percorso === 'desktop/concepts/permissions');
const sezione = pagina?.sezioni.find((s) => s.id === 'models-without-tools-of-their-own');
const en = testi.en;

test('E1-AIUTO-01: the permissions page of the guide has the section on models without tools of their own', () => {
  assert.ok(pagina, 'premise: the guide has desktop/concepts/permissions');
  assert.ok(sezione, 'the section models-without-tools-of-their-own is in the guide (rebuilt from the site, never by hand)');
  assert.equal(sezione.titolo, 'Models without tools of their own');
});

test('E1-AIUTO-02: the section uses the words of the card, as the UI shows them', () => {
  for (const chiave of ['approval.allowOnce', 'approval.forThisToolSession', 'approval.deny', 'approval.emulated.note']) {
    assert.ok(en[chiave], `premise: the UI has ${chiave}`);
    assert.ok(sezione?.testo.includes(en[chiave]), `the help says «${en[chiave]}» (${chiave})`);
  }
  assert.match(sezione?.testo ?? '', /emulated/u, 'the help names the badge of the card');
  assert.match(sezione?.testo ?? '', /Full access/u, 'the help says the card asks even with Full access');
});

test('E1-AIUTO-03: AL CONTRARIO, the section is one, and only on that page', () => {
  const dove = indice.pagine.flatMap((p) => p.sezioni.filter((s) => s.id === 'models-without-tools-of-their-own').map(() => p.percorso));
  assert.deepEqual(dove, ['desktop/concepts/permissions']);
});
