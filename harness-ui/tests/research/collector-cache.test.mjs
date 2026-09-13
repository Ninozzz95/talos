/*
 * L6 — LA MISURA, con dipendenze finte che CONTANO le chiamate.
 *
 * ⛔ Nessuna rete, nessun 4174, nessun giro col modello: `search` e `read` sono
 * chiusure che incrementano un contatore. Il numero che questo lotto promette è
 * esattamente quel contatore, quindi qui non c'è niente da credere sulla parola.
 *
 * ⛔ E la misura vera su `cached_tokens` — quella che chiude il lotto — NON si
 * fa qui: vuole un giro a pagamento sul 4174 e la lancia solo l'owner. Il
 * comando esatto è nel rapporto `.claude/RAPPORTO-RICERCA-L6-2026-09-11.md`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { talosResearchCollect } from '../../src/research/collector.mjs';
import { talosResearchFetchCache } from '../../src/research/fetch-cache.mjs';
import { TALOS_RESEARCH_KEPT_CAP } from '../../src/research/page-budget.mjs';
import { talosResearchLocate } from '../../src/research/verification.mjs';
import { talosResearchSynthesisPrompt } from '../../src/research/synthesis.mjs';
import { talosResearchLedger } from '../../src/research/ledger.mjs';

/*
 * Quattro linee d'indagine sulla stessa domanda, com'è fatto un piano `deep`:
 * quattro rami, sei pagine in tutto, e le sovrapposizioni che nascono da sole
 * perché i rami partono tutti dalla stessa domanda. Il quarto ramo ripete la
 * domanda del primo — succede quando due rami sono parafrasi l'uno dell'altro,
 * ed è il caso che `plan.mjs` avvisa di temere.
 */
const RAMI = [
  { id: 'b1', question: 'quale tablet conviene', estimate: { searches: 1, pages: 4, tokens: 5_000 }, urls: ['u1', 'u2', 'u3', 'u4'] },
  { id: 'b2', question: 'quale tablet dura di più', estimate: { searches: 1, pages: 4, tokens: 5_000 }, urls: ['u2', 'u3', 'u5', 'u6'] },
  { id: 'b3', question: 'chi dice il contrario sui tablet', estimate: { searches: 1, pages: 4, tokens: 5_000 }, urls: ['u1', 'u3', 'u5', 'u6'] },
  { id: 'b4', question: 'quale tablet conviene', estimate: { searches: 1, pages: 4, tokens: 5_000 }, urls: ['u1', 'u2', 'u3', 'u4'] },
];

const PAGINE = {
  u1: 'la prima pagina, lunga il giusto. '.repeat(60),
  u2: 'la seconda pagina, con numeri dentro. '.repeat(60),
  u3: 'la terza pagina, quella che citano tutti. '.repeat(60),
  u4: 'la quarta pagina. '.repeat(60),
  u5: 'la quinta pagina, contraria. '.repeat(60),
  u6: 'la sesta pagina, un comunicato. '.repeat(60),
};

/** Le dipendenze finte, e i due contatori che SONO la misura. */
function banco() {
  const conto = { ricerche: 0, letture: 0 };
  return {
    conto,
    search: async (query, maxResults) => {
      conto.ricerche += 1;
      const ramo = RAMI.find((r) => r.question === query);
      return ramo.urls.slice(0, maxResults).map((nome) => ({
        url: `https://esempio.test/${nome}`,
        title: `titolo ${nome}`,
        snippet: `stralcio ${nome}`,
        publishedAt: '2026-07-01',
      }));
    },
    read: async (url) => {
      conto.letture += 1;
      const nome = url.split('/').pop();
      return { title: `titolo ${nome}`, text: PAGINE[nome], publishedAt: '2026-06-30' };
    },
  };
}

/** @param {object} extra dipendenze in più (cache, budget) */
async function unaCorsa(extra = {}) {
  const finte = banco();
  const collezioni = [];
  for (const ramo of RAMI) {
    collezioni.push(await talosResearchCollect({ search: finte.search, read: finte.read, ...extra }, ramo));
  }
  return { collezioni, conto: finte.conto };
}

test('L6 — la misura: quattro rami che si sovrappongono', async (t) => {
  await t.test('SENZA cache ogni ramo ripaga: 4 ricerche e 16 letture', async () => {
    const { conto, collezioni } = await unaCorsa();

    assert.equal(conto.ricerche, 4);
    assert.equal(conto.letture, 16);
    assert.equal(conto.ricerche + conto.letture, 20);
    // Sei pagine distinte pagate sedici volte: è il buco, con un numero sopra.
    assert.equal(new Set(collezioni.flatMap((c) => c.sources.map((s) => s.url))).size, 6);
  });

  await t.test('CON la cache: 3 ricerche e 6 letture — 20 chiamate diventano 9', async () => {
    const { conto, collezioni } = await unaCorsa({ cache: talosResearchFetchCache() });

    // La quarta ricerca è la domanda del primo ramo: una sola voce per due rami.
    assert.equal(conto.ricerche, 3);
    // Sei pagine distinte, sei letture. Non una in più.
    assert.equal(conto.letture, 6);
    assert.equal(conto.ricerche + conto.letture, 9);

    // E il dossier è lo STESSO: stesse fonti, stesso testo, stesso ordine.
    const senza = await unaCorsa();
    assert.deepEqual(
      collezioni.map((c) => c.sources.map((s) => [s.url, s.text, s.obtained])),
      senza.collezioni.map((c) => c.sources.map((s) => [s.url, s.text, s.obtained])),
    );
  });

  await t.test('la spesa è al NETTO della cache, e il gratis si conta a parte', async () => {
    const { collezioni } = await unaCorsa({ cache: talosResearchFetchCache() });

    const spesePagine = collezioni.reduce((t2, c) => t2 + c.spend.pages, 0);
    const gratisPagine = collezioni.reduce((t2, c) => t2 + c.fromCache.pages, 0);
    const speseRicerche = collezioni.reduce((t2, c) => t2 + c.spend.searches, 0);
    const gratisRicerche = collezioni.reduce((t2, c) => t2 + c.fromCache.searches, 0);

    assert.equal(spesePagine, 6);
    assert.equal(gratisPagine, 10);
    // ⛔ 16 fonti ottenute, 6 pagate: è la riga che il registro deve mostrare.
    assert.equal(spesePagine + gratisPagine, 16);
    assert.equal(speseRicerche, 3);
    assert.equal(gratisRicerche, 1);

    // Il primo ramo paga tutto, il quarto niente: le sue quattro pagine le
    // avevano già pagate gli altri.
    assert.equal(collezioni[0].spend.pages, 4);
    assert.equal(collezioni[3].spend.pages, 0);
    assert.equal(collezioni[3].fromCache.pages, 4);
  });

  await t.test('ogni fonte sa da sola se è stata riaperta: il registro non deve dedurlo', async () => {
    const { collezioni } = await unaCorsa({ cache: talosResearchFetchCache() });

    assert.deepEqual(collezioni[0].sources.map((s) => s.fromCache), [false, false, false, false]);
    assert.deepEqual(collezioni[3].sources.map((s) => s.fromCache), [true, true, true, true]);
  });

  /*
   * ⛔ L'AGGANCIO AL REGISTRO, provato senza toccarlo.
   *
   * `ledger.mjs` conta le PROVE, non i tipi di passo: `read` sono le fonti con
   * `obtained: 'page'`. Il campo nuovo arriva dentro la stessa evidenza, quindi
   * il registro di oggi continua a dire la verità che diceva — «16 pagine
   * ottenute» — e il campo per dire «di cui 10 dalla cache» è già lì, pronto.
   * Il diff proposto sta nel rapporto: NON l'ho applicato, non è un file mio.
   */
  await t.test('il registro può contare le servite senza cambiare quello che già conta', async () => {
    const { collezioni } = await unaCorsa({ cache: talosResearchFetchCache() });
    const sources = collezioni.flatMap((c) => c.sources);
    const registro = talosResearchLedger([], { sources });

    assert.equal(registro.summary.read, 16, 'la semantica di `read` non è cambiata');
    assert.equal(sources.filter((s) => s.obtained === 'page' && s.fromCache).length, 10);
    assert.equal(sources.filter((s) => s.obtained === 'page' && !s.fromCache).length, 6);
  });
});

test('L6 — il budget per pagina, e la verifica che NON deve leggerlo', async (t) => {
  const PASSAGGIO = 'la frase esatta che il modello citera a meta pagina';
  const lunga = `${'apertura della pagina. '.repeat(1_200)}${PASSAGGIO}${' coda della pagina. '.repeat(1_200)}`;

  /** @param {object} extra */
  async function unaPagina(extra) {
    const ramo = { id: 'b1', question: 'q', estimate: { searches: 1, pages: 1, tokens: 1 } };
    return talosResearchCollect({
      search: async () => [{ url: 'https://esempio.test/lunga', title: 't', snippet: 's', publishedAt: null }],
      read: async () => ({ title: 't', text: lunga, publishedAt: null }),
      ...extra,
    }, ramo);
  }

  await t.test('la finestra taglia, il testo conservato no', async () => {
    const raccolta = await unaPagina({ budget: { keep: TALOS_RESEARCH_KEPT_CAP } });
    const fonte = raccolta.sources[0];

    assert.ok(fonte.text.length > 15_000, 'il testo intero doveva restare intero');
    assert.ok(fonte.window.length <= 15_400, `la finestra è ${fonte.window.length}`);
    assert.equal(fonte.omitted, fonte.text.length - (fonte.window.length - fonte.window.match(/… \[[^\]]+\] …/)[0].length - 4));
  });

  /*
   * ⛔⛔ LA PROVA AL CONTRARIO che il brief chiede per nome.
   *
   * Un passaggio che cade nel mezzo tagliato: `talosResearchLocate` lo trova nel
   * testo INTERO e non lo trova nella finestra. Se la verifica delle citazioni
   * guardasse la finestra, una citazione ONESTA uscirebbe «non trovata» — cioè
   * il prodotto accuserebbe di invenzione un modello che ha copiato bene. È il
   * verso peggiore in cui si possa sbagliare, e per questo `source.text` resta
   * il testo intero e il budget vive in un campo diverso.
   */
  await t.test('il passaggio nel mezzo si trova nel TESTO, mai nella finestra', async () => {
    const raccolta = await unaPagina({ budget: { keep: TALOS_RESEARCH_KEPT_CAP } });
    const fonte = raccolta.sources[0];

    const nelTesto = talosResearchLocate(fonte.text, PASSAGGIO);
    assert.notEqual(nelTesto, null, 'la citazione onesta non è stata ritrovata nel testo intero');
    assert.equal(fonte.text.slice(nelTesto.from, nelTesto.to), PASSAGGIO);

    assert.equal(talosResearchLocate(fonte.window, PASSAGGIO), null);
  });

  /*
   * ⛔ IL VINCOLO TROVATO PER STRADA, e vale più del resto di questo file.
   *
   * Col tetto di conservazione del TELEFONO (20.000, `MAX_CHARS_PER_SOURCE`) la
   * stessa citazione non si ritrova NEMMENO nel testo conservato: la pagina è
   * già stata tagliata prima. ⇒ sul desktop, dove il dossier sta su disco e non
   * in un database solo, `budget.keep` DEVE essere alzato, altrimenti il budget
   * per pagina peggiora la verifica invece di lasciarla intatta.
   */
  await t.test('col tetto del telefono la citazione si perde PRIMA: sul desktop `keep` va alzato', async () => {
    const raccolta = await unaPagina({ budget: {} });
    const fonte = raccolta.sources[0];

    assert.equal(fonte.text.length, 20_000);
    assert.equal(talosResearchLocate(fonte.text, PASSAGGIO), null);
  });

  await t.test('senza budget non c\'è nessuna finestra: `window` è il testo, punto', async () => {
    const raccolta = await unaPagina({});
    const fonte = raccolta.sources[0];

    assert.equal(fonte.window, fonte.text);
    assert.equal(fonte.omitted, 0);
  });
});

/*
 * ⛔ LA REGRESSIONE CHE MI INTERESSA DI PIÙ: finché il costruttore del prompt
 * non legge `window` (diff proposto nel rapporto, NON applicato), il modello
 * deve ricevere ESATTAMENTE ciò che riceve oggi. Un lotto di ottimizzazione che
 * cambia in silenzio quello che il modello vede è un lotto che non si può
 * misurare, perché due variabili si muovono insieme.
 */
test('L6 — quello che il modello riceve oggi non cambia di un byte', async (t) => {
  await t.test('il prompt della sintesi è identico con e senza cache e budget', async () => {
    const prima = await unaCorsa();
    const dopo = await unaCorsa({
      cache: talosResearchFetchCache(),
      budget: { keep: TALOS_RESEARCH_KEPT_CAP },
    });

    const a = talosResearchSynthesisPrompt('quale tablet conviene', prima.collezioni).prompt;
    const b = talosResearchSynthesisPrompt('quale tablet conviene', dopo.collezioni).prompt;

    assert.equal(b, a);
    assert.equal(b.length, a.length);
  });
});
