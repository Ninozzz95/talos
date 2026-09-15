/*
 * Traduzione fedele di AVM/mobile/tests/unit/research/researchRecheck.test.ts.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  talosResearchRecheckReport,
  talosResearchRecheckStanding,
  talosResearchSurvival,
} from '../../src/research/recheck.mjs';

const KEPT_A = 'La FIAT fu fondata l’11 luglio 1899 a Torino da Giovanni Agnelli e altri investitori del tempo.';
const KEPT_B = 'Il Monte Bianco misura 4805,59 metri secondo la misurazione francese del 2023 fatta in settembre.';

/** @type {import('../../src/research/report.mjs').TalosResearchReportRecord} */
const REPORT = {
  version: 1,
  question: 'q',
  summary: 's',
  judge: 'local:qwen',
  claims: [
    {
      text: 'La FIAT è del 1899.',
      sourceIndex: 1,
      passage: 'La FIAT fu fondata l’11 luglio 1899 a Torino',
      checks: {
        resolved: 'page',
        quotePresent: true,
        quoteSpan: { from: 0, to: 43 },
        claimSupported: 'yes',
        supportReason: '',
        judge: 'local:qwen',
        judgedAt: '2026-08-02T00:00:00.000Z',
      },
    },
    {
      text: 'Il Monte Bianco misura 4805,59 metri.',
      sourceIndex: 2,
      passage: 'Il Monte Bianco misura 4805,59 metri',
      checks: {
        resolved: 'page',
        quotePresent: true,
        quoteSpan: { from: 0, to: 36 },
        claimSupported: 'yes',
        supportReason: '',
        judge: 'local:qwen',
        judgedAt: '2026-08-02T00:00:00.000Z',
      },
    },
  ],
  sources: [
    { url: 'https://a.it', title: 'A', publishedAt: null, obtained: 'page' },
    { url: 'https://b.it', title: 'B', publishedAt: null, obtained: 'page' },
  ],
};

const KEPT = new Map([['https://a.it', KEPT_A], ['https://b.it', KEPT_B]]);

test('quanto di ciò che abbiamo letto è ancora lì', async (t) => {
  await t.test('conta come intatta una pagina che è solo cresciuta', () => {
    // La domanda è «quello su cui ci appoggiavamo è ancora lì», non «queste due
    // pagine sono identiche». Un sito che ha aggiunto un paragrafo non ha tolto
    // niente, e chiamarlo un cambiamento farebbe scattare un allarme su ogni
    // pagina viva.
    assert.equal(talosResearchSurvival(KEPT_A, `${KEPT_A} Nel 1923 iniziò la produzione al Lingotto.`), 1);
  });

  await t.test('si accorge quando il testo è stato riscritto', () => {
    assert.ok(talosResearchSurvival(KEPT_A, 'Pagina non più disponibile. Consulta l’archivio storico aziendale.') < 0.5);
  });
});

test('ricontrollare un dossier un anno dopo', async (t) => {
  await t.test('separa intatta, cambiata e irraggiungibile', async () => {
    const recheck = await talosResearchRecheckReport({
      at: () => '2027-01-01T00:00:00.000Z',
      read: async (url) => (url === 'https://a.it'
        ? { text: `${KEPT_A} Aggiornato nel 2027.` }
        : null),
    }, REPORT, KEPT);

    assert.equal(recheck.sources[0].state, 'intact');
    assert.equal(recheck.sources[1].state, 'unreachable');
    assert.deepEqual(talosResearchRecheckStanding(recheck), {
      total: 2, intact: 1, changed: 0, unreachable: 1, passagesLost: 0,
    });
  });

  /*
   * La misura che decide se il rapporto regge ancora.
   *
   * Una pagina può essere riscritta da cima a fondo; se le frasi che abbiamo
   * citato sono sopravvissute, le citazioni valgono quanto il giorno in cui
   * sono state fatte. E una pagina che si limita a sembrare simile mentre il
   * numero citato è cambiato è il caso che ogni controllore di link sul mercato
   * fa passare in silenzio.
   */
  await t.test('distingue una pagina cambiata ATTORNO alla citazione da una che l\'ha persa', async () => {
    const recheck = await talosResearchRecheckReport({
      at: () => '2027-01-01T00:00:00.000Z',
      read: async (url) => (url === 'https://a.it'
        // Riscritta, ma la frase citata è sopravvissuta parola per parola.
        ? { text: 'Storia dell’azienda. La FIAT fu fondata l’11 luglio 1899 a Torino. Altro testo nuovo.' }
        // Stessa forma, ma il numero che avevamo citato non è più quel numero.
        : { text: 'Il Monte Bianco misura 4808,00 metri secondo la misurazione francese del 2023 fatta in settembre.' }),
    }, REPORT, KEPT);

    assert.equal(recheck.sources[0].state, 'changed');
    assert.equal(recheck.sources[0].passagesStanding, 1);
    assert.equal(recheck.sources[0].passagesLost, 0);

    assert.equal(recheck.sources[1].passagesLost, 1);
    assert.equal(talosResearchRecheckStanding(recheck).passagesLost, 1);
  });

  await t.test('non conta i passaggi come persi su una pagina che non ha potuto leggere', async () => {
    const recheck = await talosResearchRecheckReport({
      at: () => '2027-01-01T00:00:00.000Z',
      read: async () => { throw new Error('403'); },
    }, REPORT, KEPT);

    // «Non abbiamo potuto guardare» e «abbiamo guardato e non ci sono più» sono
    // due ammissioni diverse, e il testo tenuto rende questo dossier ancora
    // leggibile — che è tutta la ragione per cui era stato tenuto.
    assert.equal(recheck.sources.every((entry) => entry.passagesLost === 0), true);
    assert.equal(recheck.sources[0].reason, '403');
    assert.equal(talosResearchRecheckStanding(recheck).unreachable, 2);
  });
});
