/*
 * Traduzione fedele di AVM/mobile/tests/unit/research/researchOpenCards.test.ts.
 *
 * ⛔ SCHEDE-APERTE-01 — il mockup approvato tiene DUE schede aperte sul
 * rapporto: la contesa e quella che eccede la sua fonte. Qui si prova chi
 * viene scelto, e soprattutto QUANDO NON si sceglie nessuno.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  talosResearchContestedCard,
  talosResearchMarkedPassage,
  talosResearchOverreachingCard,
} from '../../src/research/open-cards.mjs';

/** @type {import('../../src/research/verification.mjs').TalosResearchChecks} */
const CHECKS = {
  resolved: 'page',
  quotePresent: true,
  quoteSpan: null,
  claimSupported: 'yes',
  supportReason: '',
  judge: 'qwen3-1.7b',
  judgedAt: '2026-08-20T10:00:00.000Z',
};

/**
 * @param {Partial<import('../../src/research/verification.mjs').TalosResearchChecks>} over
 * @param {string} [testo]
 * @param {string} [passage]
 * @returns {import('../../src/research/open-cards.mjs').TalosResearchOpenClaim}
 */
function claim(over, testo = 'una affermazione', passage = 'un passaggio') {
  return { text: testo, passage, checks: { ...CHECKS, ...over } };
}

test('il passaggio evidenziato', async (t) => {
  await t.test('spezza in tre sul pezzo riconosciuto', () => {
    assert.deepEqual(
      talosResearchMarkedPassage('abcdefgh', { from: 2, to: 5 }),
      { before: 'ab', quote: 'cde', after: 'fgh' },
    );
  });

  await t.test('senza span il testo resta intero, e niente si evidenzia', () => {
    assert.deepEqual(talosResearchMarkedPassage('abc', null), { before: 'abc', quote: '', after: '' });
    assert.deepEqual(talosResearchMarkedPassage('abc', undefined), { before: 'abc', quote: '', after: '' });
  });

  await t.test('⛔ e AL CONTRARIO: uno span fuori misura non evidenzia il pezzo SBAGLIATO', () => {
    // Lo span viene dalla lettura, il passaggio dal disco: possono
    // disallinearsi. Evidenziare a caso sposta la fiducia su una parola che
    // nessun giudice ha guardato — peggio che non evidenziare.
    for (const span of [{ from: -1, to: 3 }, { from: 2, to: 99 }, { from: 5, to: 2 }, { from: 3, to: 3 }]) {
      assert.deepEqual(talosResearchMarkedPassage('abcdefgh', span), { before: 'abcdefgh', quote: '', after: '' });
    }
  });

  await t.test('un passaggio assente non fa esplodere niente', () => {
    assert.deepEqual(talosResearchMarkedPassage(null, { from: 0, to: 2 }), { before: '', quote: '', after: '' });
  });
});

test('la scheda della contesa', async (t) => {
  const contro = { url: 'https://b.example', title: 'B', passage: 'dice il contrario', span: null };

  await t.test('prende la prima contesa che ha i passaggi contrari', () => {
    const claims = [
      claim({ claimSupported: 'yes' }),
      claim({ claimSupported: 'contested', opposing: [contro] }, 'contesa vera'),
      claim({ claimSupported: 'contested', opposing: [contro] }, 'la seconda'),
    ];
    assert.equal(talosResearchContestedCard(claims)?.claim.text, 'contesa vera');
    assert.equal(talosResearchContestedCard(claims)?.index, 1);
  });

  await t.test('⛔ e AL CONTRARIO: una contesa SENZA i contrari non apre niente', () => {
    // Disegnerebbe due colonne di cui una vuota. `opposing` assente vuol
    // dire «una verifica vecchia non li ha guardati», non «non ce ne sono».
    assert.equal(talosResearchContestedCard([claim({ claimSupported: 'contested' })]), null);
    assert.equal(talosResearchContestedCard([claim({ claimSupported: 'contested', opposing: [] })]), null);
    assert.equal(talosResearchContestedCard([
      claim({ claimSupported: 'contested', opposing: [{ ...contro, passage: '   ' }] }),
    ]), null);
  });

  await t.test('un rapporto senza contese non ne inventa una', () => {
    assert.equal(talosResearchContestedCard([claim({ claimSupported: 'yes' }), claim({ claimSupported: 'partial' })]), null);
    assert.equal(talosResearchContestedCard([]), null);
    assert.equal(talosResearchContestedCard(null), null);
  });
});

test('la scheda che eccede la fonte', async (t) => {
  await t.test('prende la prima parziale col motivo e il passaggio', () => {
    const claims = [
      claim({ claimSupported: 'yes' }),
      claim({ claimSupported: 'partial', supportReason: 'la fonte non lega la quantizzazione ad alcuna versione' }, 'eccede'),
    ];
    assert.equal(talosResearchOverreachingCard(claims)?.claim.text, 'eccede');
    assert.equal(talosResearchOverreachingCard(claims)?.index, 1);
  });

  await t.test('⛔ e AL CONTRARIO: senza il MOTIVO la scheda ripeterebbe la riga dell\'elenco', () => {
    assert.equal(talosResearchOverreachingCard([claim({ claimSupported: 'partial' })]), null);
    assert.equal(talosResearchOverreachingCard([claim({ claimSupported: 'partial', supportReason: '  ' })]), null);
  });

  await t.test('⛔ e senza il PASSAGGIO non c\'è niente da mostrare sotto il motivo', () => {
    assert.equal(talosResearchOverreachingCard([
      claim({ claimSupported: 'partial', supportReason: 'eccede' }, 'x', ''),
    ]), null);
  });

  await t.test('una contesa non finisce nella scheda sbagliata', () => {
    const contesa = claim({ claimSupported: 'contested', supportReason: 'le fonti non concordano' });
    assert.equal(talosResearchOverreachingCard([contesa]), null);
  });
});
