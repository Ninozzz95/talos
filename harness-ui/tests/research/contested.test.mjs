/*
 * Traduzione fedele di AVM/mobile/tests/unit/research/researchContested.test.ts.
 *
 * ⛔⛔ CONTESA-01 — «contesa» non è «parziale», e confonderle mente.
 *
 * ## La distinzione, e perché non è una sfumatura
 *
 * - **parziale**: la fonte dice una parte di quello che l'affermazione afferma.
 *   Una fonte, un verdetto a metà.
 * - **contesa**: una fonte dice di sì e un'altra dice di no. Due fonti, due
 *   verdetti opposti, e nessuna metà da nessuna parte.
 *
 * Registrarle come la stessa cosa lusinga il rapporto **proprio dove è più
 * fragile**: una contesa segnalata come «parziale» si legge come «quasi
 * sostenuta», mentre vuol dire che il mondo non è d'accordo.
 *
 * ## Cosa dice la ricerca (2026-08-20)
 *
 * I conflitti sono di **tre tipi** distinti — conflitto nelle prove, conflitto
 * fra fonti sulle prove, conflitto dentro la stessa fonte — e la pratica
 * concorde è: **si mostrano entrambe le versioni**, con il perché differiscono
 * (metodo, portata, data, disciplina). Non si media, e non si sceglie in
 * silenzio la più comoda.
 *
 * ⇒ Il contratto porta le fonti contrarie col loro passaggio, così la scheda
 * può metterle a fianco invece di riassumerle in una parola sola.
 *
 * ⛔ Il file sta qui, e non in `verification.test.mjs`, perché prova due moduli
 * insieme: il verdetto (`verification.mjs`, mio) e la PAROLA che il lettore
 * vede (`report.mjs`, portato in parallelo da un altro agente). È lo stesso
 * confine che aveva nel mobile.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  talosResearchContestedVerdict,
  talosResearchVerifiedStanding,
} from '../../src/research/verification.mjs';
import { talosResearchSupportLabel } from '../../src/research/report.mjs';

const SPAN = { from: 0, to: 4 };

/**
 * @param {Partial<import('../../src/research/verification.mjs').TalosResearchChecks>} [over]
 * @returns {import('../../src/research/verification.mjs').TalosResearchChecks}
 */
function checks(over = {}) {
  return {
    resolved: 'page',
    quotePresent: true,
    quoteSpan: SPAN,
    claimSupported: 'yes',
    supportReason: '',
    judge: 'giudice',
    judgedAt: '2026-08-20T00:00:00.000Z',
    opposing: [],
    ...over,
  };
}

const CONTRARIA = {
  url: 'https://contraria.example/a',
  title: 'Dice il contrario',
  passage: 'La fonte contraria dice che no.',
  span: SPAN,
};

test('CONTESA-01 il verdetto quando le fonti non concordano', async (t) => {
  await t.test('⛔ una fonte a favore e una contraria fanno CONTESA, non «sostenuta»', () => {
    assert.equal(talosResearchContestedVerdict('yes', [CONTRARIA]), 'contested');
  });

  await t.test('⛔ e nemmeno «parziale»: sono due cose diverse', () => {
    assert.equal(talosResearchContestedVerdict('partial', [CONTRARIA]), 'contested');
  });

  await t.test('senza fonti contrarie il verdetto resta quello del giudice', () => {
    assert.equal(talosResearchContestedVerdict('yes', []), 'yes');
    assert.equal(talosResearchContestedVerdict('partial', []), 'partial');
    assert.equal(talosResearchContestedVerdict('no', []), 'no');
  });

  await t.test('⛔ e al contrario: se il giudice ha già detto NO, una contraria CONFERMA', () => {
    // Contesa vuol dire disaccordo. Una fonte che dice «no» accanto a un
    // verdetto «no» non è un disaccordo: è la stessa cosa detta due volte.
    assert.equal(talosResearchContestedVerdict('no', [CONTRARIA]), 'no');
  });

  await t.test('⛔ una NON verificata non diventa contesa: nessuno ha giudicato', () => {
    assert.equal(talosResearchContestedVerdict('unchecked', [CONTRARIA]), 'unchecked');
  });
});

test('CONTESA-01 il conto e la parola', async (t) => {
  await t.test('le contese si contano a parte, non dentro le parziali', () => {
    const standing = talosResearchVerifiedStanding([
      { claim: {}, passage: 'a', checks: checks({ claimSupported: 'yes' }) },
      { claim: {}, passage: 'b', checks: checks({ claimSupported: 'partial' }) },
      { claim: {}, passage: 'c', checks: checks({ claimSupported: 'contested', opposing: [CONTRARIA] }) },
      { claim: {}, passage: 'd', checks: checks({ claimSupported: 'contested', opposing: [CONTRARIA] }) },
    ]);

    assert.equal(standing.total, 4);
    assert.equal(standing.supported, 1);
    assert.equal(standing.partial, 1);
    assert.equal(standing.contested, 2);
  });

  await t.test('⛔ una contesa NON viene contata fra le sostenute', () => {
    const standing = talosResearchVerifiedStanding([
      { claim: {}, passage: 'c', checks: checks({ claimSupported: 'contested', opposing: [CONTRARIA] }) },
    ]);

    assert.equal(standing.supported, 0);
    assert.equal(standing.unsupported, 0);
    assert.equal(standing.contested, 1);
  });

  await t.test('la parola lo dice, e dice anche PERCHÉ', () => {
    const parola = talosResearchSupportLabel(
      checks({ claimSupported: 'contested', opposing: [CONTRARIA] }),
    );
    assert.match(parola, /contesa/i);
    assert.match(parola, /non concordano|contrari/i);
  });

  await t.test('le altre parole non cambiano', () => {
    assert.equal(talosResearchSupportLabel(checks({ claimSupported: 'yes' })), 'sostenuta dalla fonte');
    assert.equal(talosResearchSupportLabel(checks({ claimSupported: 'partial' })), 'sostenuta solo in parte');
    assert.equal(talosResearchSupportLabel(checks({ claimSupported: 'no' })), 'NON sostenuta dalla fonte');
  });
});
