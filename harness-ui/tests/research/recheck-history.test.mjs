/*
 * Traduzione fedele di AVM/mobile/tests/unit/research/researchRecheckHistory.test.ts.
 *
 * ⛔ TENUTA-NEL-TEMPO-01 — la storia dei ricontrolli si RILEGGE, non si
 * ricostruisce dall'italiano stampato nel documento.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  talosResearchParseRecheckBlock,
  talosResearchRecheckBlock,
  talosResearchRecheckStoria,
} from '../../src/research/recheck-history.mjs';

/**
 * @param {Partial<import('../../src/research/recheck.mjs').TalosResearchSourceRecheck>} over
 * @returns {import('../../src/research/recheck.mjs').TalosResearchSourceRecheck}
 */
function fonte(over) {
  return {
    url: 'https://a.example',
    title: 'A',
    state: 'intact',
    survived: 1,
    reason: null,
    passagesStanding: 2,
    passagesLost: 0,
    ...over,
  };
}

/**
 * @param {Partial<import('../../src/research/recheck-history.mjs').TalosResearchRecheckTappa>} over
 * @returns {import('../../src/research/recheck-history.mjs').TalosResearchRecheckTappa}
 */
function tappa(over) {
  return {
    at: '2026-08-19T10:00:00.000Z',
    total: 2,
    intact: 2,
    changed: 0,
    unreachable: 0,
    passagesStanding: 4,
    passagesLost: 0,
    tenuta: 1,
    ...over,
  };
}

test('il blocco che rende rileggibile un ricontrollo', async (t) => {
  await t.test('va e torna identico', () => {
    /** @type {import('../../src/research/recheck.mjs').TalosResearchRecheck} */
    const recheck = {
      at: '2026-09-03T08:00:00.000Z',
      sources: [fonte({}), fonte({ url: 'https://b.example', state: 'changed', survived: 0.6, passagesStanding: 1, passagesLost: 1 })],
    };
    const documento = ['# Ricontrollo — domanda', '', 'prosa per una persona', '', talosResearchRecheckBlock('run-7', recheck)].join('\n');

    const letto = talosResearchParseRecheckBlock(documento);
    assert.equal(letto?.runId, 'run-7');
    assert.equal(letto?.at, '2026-09-03T08:00:00.000Z');
    assert.equal(letto?.passagesStanding, 3);
    assert.equal(letto?.passagesLost, 1);
    // ⛔ La tenuta si conta sui PASSAGGI, non sulle pagine: 3 su 4 reggono,
    //   anche se una delle due pagine risulta «cambiata».
    assert.ok(Math.abs(letto.tenuta - 0.75) < 1e-5);
  });

  await t.test('⛔ e AL CONTRARIO: un documento SENZA blocco torna null, non uno zero', () => {
    // Uno zero finirebbe nella storia come un crollo, e sarebbe un crollo
    // inventato dal nostro formato.
    assert.equal(talosResearchParseRecheckBlock('# Ricontrollo\n\nsolo prosa'), null);
    assert.equal(talosResearchParseRecheckBlock(''), null);
    assert.equal(talosResearchParseRecheckBlock(null), null);
  });

  await t.test('⛔ e un blocco ROTTO è un blocco che non c\'è', () => {
    assert.equal(talosResearchParseRecheckBlock('```talos-research-recheck\n{non json\n```'), null);
    assert.equal(talosResearchParseRecheckBlock('```talos-research-recheck\n{"at":"2026-01-01"}\n```'), null);
    assert.equal(talosResearchParseRecheckBlock('```talos-research-recheck\n{"runId":"r"}\n```'), null);
  });

  await t.test('niente passaggi da controllare = tenuta ignota, non tenuta zero', () => {
    /** @type {import('../../src/research/recheck.mjs').TalosResearchRecheck} */
    const vuoto = {
      at: '2026-09-03T08:00:00.000Z',
      sources: [fonte({ passagesStanding: 0, passagesLost: 0 })],
    };
    assert.equal(talosResearchParseRecheckBlock(talosResearchRecheckBlock('r', vuoto))?.tenuta, null);
  });
});

test('la storia, tappa per tappa', async (t) => {
  await t.test('mette in ordine di tempo e misura il salto', () => {
    const storia = talosResearchRecheckStoria([
      tappa({ at: '2026-09-03T08:00:00.000Z', tenuta: 0.86 }),
      tappa({ at: '2026-08-19T10:00:00.000Z', tenuta: 1 }),
    ]);

    assert.deepEqual(storia.map((passo) => passo.at), [
      '2026-08-19T10:00:00.000Z',
      '2026-09-03T08:00:00.000Z',
    ]);
    assert.equal(storia[0].primo, true);
    assert.equal(storia[0].delta, null);
    assert.ok(Math.abs(storia[1].delta - (-0.14)) < 1e-5);
  });

  await t.test('⛔ da «non misurata» a 0,86 NON è un guadagno dell\'86%', () => {
    const storia = talosResearchRecheckStoria([
      tappa({ at: '2026-08-19T10:00:00.000Z', tenuta: null }),
      tappa({ at: '2026-09-03T08:00:00.000Z', tenuta: 0.86 }),
    ]);
    assert.equal(storia[1].delta, null);
  });

  await t.test('lo stesso istante due volte è lo stesso ricontrollo, non due', () => {
    const storia = talosResearchRecheckStoria([tappa({}), tappa({}), tappa({ at: '2026-09-03T08:00:00.000Z' })]);
    assert.equal(storia.length, 2);
  });

  await t.test('una data illeggibile non entra in una linea del tempo', () => {
    assert.equal(talosResearchRecheckStoria([tappa({ at: 'ieri' })]).length, 0);
    assert.equal(talosResearchRecheckStoria([]).length, 0);
  });
});
