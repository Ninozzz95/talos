/*
 * Traduzione fedele di AVM/mobile/tests/unit/research/researchSynthesis.test.ts,
 * più due casi miei su `talosResearchFollowUpPrompt`, che il mobile esportava
 * senza provare.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  talosResearchDistinctSources,
  talosResearchFollowUpPrompt,
  talosResearchParseSynthesis,
  talosResearchReportStanding,
  talosResearchSynthesisPrompt,
} from '../../src/research/synthesis.mjs';

/**
 * @param {Partial<import('../../src/research/collector.mjs').TalosResearchSource>} [overrides]
 * @returns {import('../../src/research/collector.mjs').TalosResearchSource}
 */
function source(overrides = {}) {
  return {
    url: 'https://a.example',
    title: 'Il pezzo',
    publishedAt: '2026-07-01',
    text: 'Il prezzo di listino è sceso a 499 euro a luglio.',
    obtained: 'page',
    ...overrides,
  };
}

/**
 * @param {import('../../src/research/collector.mjs').TalosResearchSource[]} sources
 * @returns {import('../../src/research/collector.mjs').TalosResearchCollection}
 */
function collection(sources) {
  return {
    branchId: 'b1',
    query: 'quanto costa',
    sources,
    unreachable: [],
    spend: { searches: 1, pages: sources.length, tokens: 10 },
  };
}

test('trasformare il raccolto in un rapporto controllabile', async (t) => {
  await t.test('numera le fonti e dice al modello che la citazione verrà verificata', () => {
    const { prompt, sources } = talosResearchSynthesisPrompt('quanto costa', [collection([source()])]);

    assert.ok(prompt.includes('[1] Il pezzo'));
    // Detto perché è vero, e perché un modello che sa che la citazione è
    // controllata smette di inventare citazioni.
    assert.ok(prompt.includes('meccanicamente'));
    assert.equal(sources.length, 1);
  });

  await t.test('avvisa il modello quando una fonte è solo un estratto del motore di ricerca', () => {
    const { prompt } = talosResearchSynthesisPrompt('quanto costa', [
      collection([source({ obtained: 'snippet' })]),
    ]);

    assert.ok(prompt.includes('solo estratto dal motore di ricerca'));
  });

  /*
   * IL controllo per cui questo modulo esiste.
   *
   * Il guasto misurato del campo non è «troppo poche citazioni», sono citazioni
   * che non si possono verificare: 0,94 per sembrare ancorata contro 0,61 per
   * esserlo davvero. Abbiamo tenuto il testo della pagina, quindi la categoria
   * peggiore — la citazione che non c'è mai stata — costa un confronto fra
   * sottostringhe e nessun modello.
   */
  await t.test('prende la citazione che non è mai stata sulla pagina', () => {
    const sources = [source()];

    const report = talosResearchParseSynthesis([
      'SINTESI: costa meno di prima.',
      'Il prezzo è sceso a 499 euro | 1 | "sceso a 499 euro a luglio"',
      'Le vendite sono raddoppiate | 1 | "le vendite sono raddoppiate"',
    ].join('\n'), sources);

    assert.equal(report.claims[0].quotePresent, 'yes');
    assert.equal(report.claims[1].quotePresent, 'no');
    // Tenuta, non buttata: un rapporto che toglie in silenzio le sue
    // affermazioni più deboli dice al lettore che non ne aveva.
    assert.equal(report.claims.length, 2);
  });

  await t.test('non lascia che virgolette curve o spazi vaganti facciano fallire una citazione onesta', () => {
    const report = talosResearchParseSynthesis(
      'Il prezzo è sceso | 1 | "sceso   a 499 euro"',
      [source({ text: 'Il prezzo di listino è sceso\na 499 euro a luglio.' })],
    );

    // La pagina e il modello non sono d'accordo sugli spazi, mai sul
    // significato.
    assert.equal(report.claims[0].quotePresent, 'yes');
  });

  await t.test('chiama non verificata, non promossa, la citazione di una fonte che nessuno ha consegnato', () => {
    const report = talosResearchParseSynthesis('Qualcosa | 7 | "qualunque cosa"', [source()]);

    assert.equal(report.claims[0].quotePresent, 'unchecked');
    // E conta contro il bilancio: non controllata non è sopravvissuta.
    assert.deepEqual(talosResearchReportStanding(report), { total: 1, supported: 0, unsupported: 1 });
  });

  await t.test('ignora una riga che non riesce a leggere invece di indovinare cosa volesse dire', () => {
    const report = talosResearchParseSynthesis([
      'SINTESI: eccola.',
      'una riga senza fonte né passaggio',
      'Affermazione buona | 1 | "sceso a 499 euro"',
    ].join('\n'), [source()]);

    // Un analizzatore che salva una citazione malformata è un analizzatore che
    // inventa attribuzioni, che è il guasto a cui questo file mira.
    assert.equal(report.claims.length, 1);
    assert.equal(report.summary, 'eccola.');
  });

  await t.test('dice quanto ne ha retto, per affermazione invece che come un numero solo', () => {
    const report = talosResearchParseSynthesis([
      'Vera | 1 | "sceso a 499 euro"',
      'Inventata | 1 | "mai scritto"',
      'Anche vera | 1 | "a luglio"',
    ].join('\n'), [source()]);

    assert.deepEqual(talosResearchReportStanding(report), { total: 3, supported: 2, unsupported: 1 });
  });
});

test('il modello restituito al posto di una risposta', async (t) => {
  /*
   * Un giro vero sul tablet: il modello ha restituito sei righe che
   * cominciavano ciascuna con la parola AFFERMAZIONE, e il rapporto archiviava
   * sei affermazioni il cui testo era il nome del campo. Buttarle lascia
   * niente, il che fa fallire il passo — l'esito onesto, perché non era stato
   * affermato niente.
   */
  await t.test('non viene letto come un\'affermazione', () => {
    const report = talosResearchParseSynthesis([
      'SINTESI: il monte è alto 4808 metri.',
      'AFFERMAZIONE | 1 | "alto 4808 metri"',
      '<l’affermazione> | 1 | "alto 4808 metri"',
      'Il monte è alto 4808 metri | 1 | "alto 4808 metri"',
    ].join('\n'), [{
      url: 'https://x.it',
      title: 'x',
      publishedAt: null,
      text: 'Il monte è alto 4808 metri sul livello del mare.',
      obtained: 'page',
    }]);

    assert.equal(report.claims.length, 1);
    assert.equal(report.claims[0].text, 'Il monte è alto 4808 metri');
  });
});

/*
 * ⛔⛔ DOPPIONI-01 — la stessa pagina, contata una volta per linea d'indagine.
 *
 * FOTOGRAFATO sul Pad il 2026-08-20: il rapporto diceva «10 fonti» e l'elenco
 * portava wikipedia.org due volte, ultralytics.com due volte, ibm.com due
 * volte, huggingface.co due volte. Sei pagine contate dieci — e la misura
 * dell'indipendenza, che esiste per non gonfiare i numeri, era la prima
 * gonfiata.
 */
test('la stessa pagina non si conta due volte', async (t) => {
  /**
   * @param {string} url
   * @param {string} text
   * @param {string} [title]
   */
  const pagina = (url, text, title = 'T') => ({
    url, title, publishedAt: null, text, obtained: 'page',
  });
  /** @param {ReturnType<typeof pagina>[]} sources */
  const linea = (...sources) => ({ query: 'q', sources, characters: 0, truncated: false });

  await t.test('due linee che trovano la stessa pagina la portano UNA volta', () => {
    const uscita = talosResearchDistinctSources([
      linea(pagina('https://a.example/x', 'testo'), pagina('https://b.example/y', 'altro')),
      linea(pagina('https://a.example/x', 'testo')),
    ]);
    assert.deepEqual(uscita.map((f) => f.url), ['https://a.example/x', 'https://b.example/y']);
  });

  await t.test('⛔ e si tiene la copia col TESTO PIÙ LUNGO, non la prima', () => {
    // Due rami possono aver letto la stessa pagina con fortuna diversa,
    // e la copia più povera toglierebbe passaggi che l'altra aveva.
    const uscita = talosResearchDistinctSources([
      linea(pagina('https://a.example/x', 'corto')),
      linea(pagina('https://a.example/x', 'un testo molto piu lungo e completo')),
    ]);
    assert.equal(uscita.length, 1);
    assert.equal(uscita[0].text, 'un testo molto piu lungo e completo');
  });

  await t.test('il frammento e la barra finale non fanno due pagine', () => {
    const uscita = talosResearchDistinctSources([
      linea(
        pagina('https://a.example/x', 't'),
        pagina('https://a.example/x/', 't'),
        pagina('https://a.example/x#dove', 't'),
      ),
    ]);
    assert.equal(uscita.length, 1);
  });

  await t.test('⛔ e AL CONTRARIO: la QUERY resta, perché distingue due articoli', () => {
    // Su moltissimi siti ?id=12 e ?id=13 sono due pagine diverse:
    // toglierla fonderebbe fonti che non c'entrano niente.
    const uscita = talosResearchDistinctSources([
      linea(pagina('https://a.example/p?id=12', 't'), pagina('https://a.example/p?id=13', 't')),
    ]);
    assert.equal(uscita.length, 2);
  });

  await t.test('un indirizzo illeggibile resta sé stesso', () => {
    const uscita = talosResearchDistinctSources([
      linea(pagina('non-un-indirizzo', 't'), pagina('nemmeno-questo', 't')),
    ]);
    assert.equal(uscita.length, 2);
  });

  await t.test('e la numerazione che vede il modello non salta', () => {
    // Il catalogo numera da 1 in avanti sulla lista deduplicata: un [6]
    // che punta alla stessa pagina di [1] è il modo esatto in cui due
    // affermazioni «da fonti diverse» vengono dalla stessa.
    const { prompt } = talosResearchSynthesisPrompt('q', [
      linea(pagina('https://a.example/x', 'testo', 'Uno')),
      linea(pagina('https://a.example/x', 'testo', 'Uno')),
    ]);
    assert.ok(prompt.includes('[1] Uno'));
    assert.ok(!prompt.includes('[2]'));
  });
});

/*
 * ⭐ MIO — `talosResearchFollowUpPrompt` è esportata e il mobile non aveva
 * nessun test che la nominasse. Porta due impegni distinti, e il secondo è
 * quello che la rende onesta: «qui si risponde solo con le fonti».
 */
test('⭐ MIO — la domanda di seguito dichiara che nessuna ricerca nuova è avvenuta', () => {
  const { prompt, sources } = talosResearchFollowUpPrompt('e in Francia?', [collection([source()])]);

  // Le due righe che cambiano la risposta: non c'è stata ricerca, e se le fonti
  // non bastano lo si SCRIVE invece di rispondere a memoria.
  assert.ok(prompt.includes('NON è stata fatta nessuna ricerca nuova'));
  assert.ok(prompt.includes('invece di rispondere da quello che sai'));
  // Le fonti sono le stesse della sintesi: una domanda di seguito che ne
  // vedesse altre starebbe facendo una ricerca senza dirlo.
  assert.deepEqual(sources, talosResearchSynthesisPrompt('e in Francia?', [collection([source()])]).sources);
});

test('⭐ MIO — e resta la STESSA forma della sintesi, così si controlla uguale', () => {
  // «Una domanda di seguito le cui citazioni nessuno ha verificato sarebbe
  // l'anello debole di un dossier per il resto verificato»: il formato a tre
  // colonne e l'avviso sulla verifica meccanica devono esserci entrambi.
  const { prompt } = talosResearchFollowUpPrompt('e in Francia?', [collection([source()])]);

  assert.ok(prompt.includes('affermazione | numero della fonte | "passaggio copiato dalla fonte"'));
  assert.ok(prompt.includes('meccanicamente'));
  assert.ok(prompt.includes('[1] Il pezzo'));
});
