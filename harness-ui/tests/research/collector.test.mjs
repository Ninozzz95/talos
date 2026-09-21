/*
 * Traduzione fedele di AVM/mobile/tests/unit/research/researchCollector.test.ts.
 *
 * ⛔ Unica differenza dichiarata: il mobile usava `vi.fn()` di vitest per la
 * spia sull'ultimo caso. Qui la spia è una chiusura che registra le chiamate —
 * niente dipendenze nuove, e l'asserzione è la stessa.
 *
 * ⛔ La rete non viene MAI toccata: `search` e `read` arrivano da `deps`, ed è
 * esattamente la ragione per cui questo file è portabile nel kernel Node.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { talosResearchCollect } from '../../src/research/collector.mjs';

/** @type {import('../../src/research/run.mjs').TalosResearchBranch} */
const BRANCH = {
  id: 'b1',
  question: 'quale tablet conviene — fonti contrarie',
  estimate: { searches: 1, pages: 2, tokens: 5_000 },
};

/**
 * @param {string} url
 * @param {string} [snippet]
 */
function result(url, snippet = 'uno stralcio dal motore di ricerca') {
  return { url, title: `titolo ${url}`, snippet, publishedAt: '2026-07-01' };
}

test('raccogliere quanto vale una linea d\'indagine', async (t) => {
  /*
   * LA decisione per cui questo modulo esiste.
   *
   * Tutti gli altri conservano link. Un link è una promessa su una pagina, e le
   * pagine marciscono — modificate, dietro un paywall, spostate, spente —
   * quindi un dossier fatto di link degrada in silenzio e non si può
   * ricontrollare affatto, perché la cosa che citava non c'è più. Il passaggio
   * si tiene così il dossier resta interrogabile un anno dopo.
   */
  await t.test('tiene il testo, non solo l\'indirizzo', async () => {
    const collection = await talosResearchCollect({
      search: async () => [result('https://a.example')],
      read: async () => ({ title: 'Il pezzo vero', text: 'Il passaggio che conta.', publishedAt: '2026-06-30' }),
    }, BRANCH);

    assert.equal(collection.sources[0].url, 'https://a.example');
    assert.equal(collection.sources[0].text, 'Il passaggio che conta.');
    assert.equal(collection.sources[0].obtained, 'page');
  });

  await t.test('crede alla pagina sulla sua data, non all\'indice di ricerca', async () => {
    const collection = await talosResearchCollect({
      search: async () => [result('https://a.example')],
      read: async () => ({ title: 't', text: 'x', publishedAt: '2026-06-30' }),
    }, BRANCH);

    // Una è l'editore che parla, l'altra è un indice che indovina.
    assert.equal(collection.sources[0].publishedAt, '2026-06-30');
  });

  /*
   * La lezione che questo progetto ha pagato, in un componente diverso: un
   * guasto che arriva come una lista vuota è un guasto che è stato nascosto.
   * Quattro fonti invece di sei non devono sembrare un tema povero.
   */
  await t.test('dà un nome a quello che non ha potuto leggere invece di tornare in silenzio con meno', async () => {
    const collection = await talosResearchCollect({
      search: async () => [result('https://ok.example'), result('https://dead.example')],
      read: async (url) => {
        if (url === 'https://dead.example') throw new Error('403');
        return { title: 't', text: 'testo intero', publishedAt: null };
      },
    }, BRANCH);

    assert.deepEqual(collection.unreachable, [{ url: 'https://dead.example', reason: '403' }]);
    // E lo snippet viene comunque portato, marcato per quello che è: una
    // affermazione che si appoggia a uno snippet è una prova più debole, e
    // nasconderlo farebbe sembrare uguali le due cose.
    assert.deepEqual(collection.sources.map((source) => source.obtained), ['page', 'snippet']);
  });

  await t.test('conta quello che ha davvero assorbito, invece di ripetere la stima', async () => {
    const text = 'x'.repeat(4_000);
    const collection = await talosResearchCollect({
      search: async () => [result('https://a.example')],
      read: async () => ({ title: 't', text, publishedAt: null }),
    }, BRANCH);

    // Il piano indovina (5000 token su questo ramo); il giro conta.
    assert.equal(collection.spend.tokens, 1_000);
    assert.notEqual(collection.spend.tokens, BRANCH.estimate.tokens);
    assert.equal(collection.spend.pages, 1);
    assert.equal(collection.spend.searches, 1);
  });

  await t.test('non lascia mai che una pagina sola si mangi il dossier', async () => {
    const collection = await talosResearchCollect({
      search: async () => [result('https://a.example')],
      read: async () => ({ title: 't', text: 'y'.repeat(500_000), publishedAt: null }),
    }, BRANCH);

    // Un telefono tiene l'intero dossier in un database solo. Il taglio
    // appartiene a dove la prova è CONSERVATA, così quello che si tiene è
    // quello che si potrà ri-verificare più tardi.
    assert.equal(collection.sources[0].text.length, 20_000);
  });

  await t.test('chiede tanti risultati quanti il ramo approvato aveva detto', async () => {
    /** @type {[string, number][]} */
    const chiamate = [];
    const search = async (query, maxResults) => { chiamate.push([query, maxResults]); return []; };

    await talosResearchCollect({ search, read: async () => null }, { ...BRANCH, estimate: { searches: 1, pages: 7, tokens: 1 } });

    // L'utente ha approvato una dimensione in R-2. Chiederne un'altra
    // renderebbe una decorazione la stima su cui era d'accordo.
    assert.deepEqual(chiamate, [[BRANCH.question, 7]]);
  });
});
