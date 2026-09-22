/*
 * PORTO FEDELE di AVM/mobile/src/lib/research/researchPlan.ts (271 righe, 11/09/2026).
 *
 * Il piano, il suo costo, e il rifiuto di inventare un numero.
 *
 * R-2. Gemini mostra un piano e lo lascia modificare, e il campo si ferma lì:
 * nessuno dice quanto costerà il giro PRIMA che parta. Con BYOK l'utente paga
 * di tasca sua, quindi dirlo non è un fronzolo — è dovuto.
 *
 * La parte scomoda è che non ci è permesso conoscere il prezzo. I prezzi
 * cambiano, e un listino cotto dentro un pacchetto è una bugia con una data di
 * rilascio sopra — la regola contro le liste statiche esiste esattamente per
 * questo. OpenRouter pubblica le tariffe per token nella sua lista modelli, che
 * è una fonte viva che possiamo leggere; gli altri fornitori non pubblicano
 * niente di leggibile a macchina.
 *
 * Quindi il costo ha due metà e si trattano diversamente. Il LAVORO — ricerche,
 * pagine, minuti, token — è aritmetica sul piano e si mostra sempre. Il DENARO
 * si mostra solo dove un prezzo pubblicato è stato davvero ottenuto, e dove non
 * lo è stato la risposta è «non conoscibile da qui» invece di una cifra
 * plausibile. Un prezzo inventato è peggio di nessun prezzo: verrebbe creduto.
 *
 * ⛔ Porto meccanico: stesse semantiche, stessi casi limite, stessi nomi
 * esportati. I tipi sono in JSDoc (`@typedef`), non in TypeScript — vedi
 * https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html.
 * `TalosResearchBranch` e `TalosResearchDepth` vivono in `./run.mjs` e qui
 * entrano SOLO come tipi: nessun import a runtime, quindi nessun ciclo.
 */

/**
 * @typedef {import('./run.mjs').TalosResearchBranch} TalosResearchBranch
 * @typedef {import('./run.mjs').TalosResearchDepth} TalosResearchDepth
 */

/**
 * @typedef {object} TalosResearchDepthProfile
 * @property {TalosResearchDepth} depth
 * @property {number} branches  Quante linee d'indagine apre il piano di default.
 * @property {number} sources   Fonti che l'intero giro si aspetta di leggere. Distribuite sui rami.
 * @property {number} minutes   Tempo d'orologio grossolano, per chi decide se partire adesso.
 */

/**
 * I tre livelli, coi numeri delle misure sui concorrenti: OpenAI legge 50-200
 * fonti in 10-30 minuti, Gemini 30-150 in 5-15, Claude 20-100 in 5-20,
 * Perplexity finisce in 2-4. Questi stanno di proposito in fondo a quella
 * forbice — qui si gira su una batteria di telefono, non in un datacentre.
 *
 * Default, non gabbie: il piano resta modificabile, che è il punto di R-2.
 *
 * @type {Readonly<Record<TalosResearchDepth, TalosResearchDepthProfile>>}
 */
export const TALOS_RESEARCH_DEPTHS = Object.freeze({
  quick: Object.freeze({ depth: 'quick', branches: 2, sources: 10, minutes: 3 }),
  deep: Object.freeze({ depth: 'deep', branches: 4, sources: 30, minutes: 10 }),
  exhaustive: Object.freeze({ depth: 'exhaustive', branches: 6, sources: 80, minutes: 25 }),
});

/**
 * Quanto testo costa assorbire una fonte.
 *
 * Una pagina ridotta alla sua parte leggibile sono qualche migliaio di parole;
 * a circa quattro caratteri per token si arriva vicino a questa cifra. È una
 * stima, ed è etichettata come tale ovunque esca — il numero vero si conosce
 * solo dopo che la pagina è stata scaricata.
 */
const TOKENS_PER_SOURCE = 1_500;

/** Quanto spende il modello forte a tirare insieme un ramo, alla fine. */
const TOKENS_PER_BRANCH_SYNTHESIS = 2_000;

/** Le facce lungo cui si apre una domanda, nell'ordine in cui vale aprirle. */
const FACETS = [
  'fatti e numeri',
  'fonti contrarie',
  'chi lo dice e con quale interesse',
  'quanto è recente',
  'casi reali',
  'cosa resta incerto',
];

/**
 * Quante fonti per ramo regge un autore che gira SUL TELEFONO.
 *
 * Il rapporto si scrive leggendo tutte le fonti raccolte in un colpo solo,
 * quindi la profondità non decide solo quanto si cerca: decide la lunghezza
 * del prompt finale. Misurato sul OnePlus Pad 3 il 2026-08-04 — dieci pagine
 * facevano 11009 token, e un 3B con quel prompt macinava mezz'ora senza
 * consegnare. Non è un limite del contesto (quello è 16384): è il tempo.
 *
 * Il tetto è sul TOTALE, non sul singolo ramo, e la differenza non è un
 * dettaglio: la sintesi legge tutti i rami insieme. Col tetto per ramo,
 * «Esaustiva» restava a 39.000 token — sei rami da tre fonti — cioè oltre il
 * doppio del contesto, esattamente il difetto che si voleva chiudere.
 *
 * Sei fonti in tutto tengono la sintesi in un prompt che un modello sul
 * dispositivo scrive in minuti, non in decine di minuti, a QUALSIASI
 * profondità. Il numero è basso di proposito: un rapporto che arriva vale
 * più di uno più ricco che non arriva.
 */
const TALOS_LOCAL_SOURCES_TOTAL = 6;

/**
 * Un primo piano per una domanda. Ci si aspetta che l'utente lo cambi.
 *
 * Le domande dei rami sono la domanda stessa vista da un altro lato, perché un
 * piano i cui rami sono parafrasi l'uno dell'altro spende quattro volte per
 * imparare una cosa sola. Le facce sono ordinate per quanto spesso cambiano una
 * risposta, così un giro rapido a due rami prende le due che contano di più.
 *
 * @param {string} question
 * @param {TalosResearchDepth} depth
 * @param {boolean} [localAuthor=false] L'autore gira sul dispositivo: il piano si adatta a lui.
 * @returns {readonly TalosResearchBranch[]}
 */
export function talosResearchPlanFor(question, depth, localAuthor = false) {
  const profile = TALOS_RESEARCH_DEPTHS[depth];
  const chiesto = Math.max(1, Math.round(profile.sources / profile.branches));
  // Si ABBASSA soltanto: se la profondità chiede già meno di così, quella
  // vince — nessuno ha chiesto di gonfiare una ricerca rapida.
  /*
   * Il totale si DISTRIBUISCE, non si divide e basta.
   *
   * Dividere e arrotondare per difetto perdeva fonti a ogni ramo: sei fonti
   * su quattro rami facevano uno per ramo, cioè quattro — e sulle linguette
   * «Approfondita» mostrava 4 dove «Rapida» mostrava 6. Più profonda che
   * rende meno non è una scelta discutibile: sembra rotta, e lo era.
   *
   * Il resto va ai primi rami, quindi il totale è esatto a qualsiasi
   * profondità e le linguette dicono tutte lo stesso numero.
   */
  const perBranch = localAuthor
    ? Math.max(1, Math.min(chiesto, Math.floor(TALOS_LOCAL_SOURCES_TOTAL / profile.branches)))
    : chiesto;
  const avanzo = localAuthor && perBranch * profile.branches < TALOS_LOCAL_SOURCES_TOTAL
    ? Math.min(TALOS_LOCAL_SOURCES_TOTAL - perBranch * profile.branches, profile.branches)
    : 0;
  return Array.from({ length: profile.branches }, (_, index) => ({
    id: `b${index + 1}`,
    question: `${question.trim()} — ${FACETS[index % FACETS.length]}`,
    estimate: {
      searches: 1,
      pages: perBranch + (index < avanzo ? 1 : 0),
      tokens: (perBranch + (index < avanzo ? 1 : 0)) * TOKENS_PER_SOURCE + TOKENS_PER_BRANCH_SYNTHESIS,
    },
  }));
}

/**
 * @typedef {object} TalosResearchPlanTotals
 * @property {number} branches
 * @property {number} searches
 * @property {number} pages
 * @property {number} tokens
 * @property {number} minutes
 */

/**
 * Quanto tempo ci vuole in tutto, una volta noti i rami.
 *
 * Una pagina costa circa questo tempo d'orologio per essere scaricata e ridotta
 * su un telefono: la rete è la maggior parte, e l'analisi non è gratis.
 * Moltiplicato per le pagine, è quello su cui l'utente sta davvero decidendo
 * quando sceglie una profondità.
 */
const SECONDS_PER_PAGE = 6;

/**
 * @param {readonly TalosResearchBranch[]} plan
 * @returns {TalosResearchPlanTotals}
 */
export function talosResearchPlanTotals(plan) {
  const totals = plan.reduce(
    (sum, branch) => ({
      searches: sum.searches + branch.estimate.searches,
      pages: sum.pages + branch.estimate.pages,
      tokens: sum.tokens + branch.estimate.tokens,
    }),
    { searches: 0, pages: 0, tokens: 0 },
  );
  return {
    branches: plan.length,
    ...totals,
    // Arrotondato PER ECCESSO, e mai a zero per un piano che ha lavoro dentro:
    // un giro annunciato come «0 minuti» che ne prende quaranta di secondi ha
    // mentito sull'unica cosa che l'utente aveva chiesto.
    minutes: plan.length === 0 ? 0 : Math.max(1, Math.ceil((totals.pages * SECONDS_PER_PAGE) / 60)),
  };
}

/**
 * Un prezzo che il FORNITORE ha pubblicato, per milione di token. Mai
 * assemblato qui dentro.
 *
 * Diviso perché le due tariffe differiscono di un ordine di grandezza sulla
 * maggior parte dei modelli, e un giro di ricerca è sbilanciato: legge molto
 * più di quanto scriva, quindi usare una tariffa sola per entrambe
 * sbaglierebbe il totale nella direzione in cui il modello è tariffato.
 *
 * @typedef {object} TalosResearchPrice
 * @property {string} currency
 * @property {number} promptPerMillion
 * @property {number} completionPerMillion
 */

/**
 * `{known:false}` NON è un errore, e non è uno zero.
 *
 * @typedef {{known:true, currency:string, amount:number} | {known:false}} TalosResearchCost
 */

/**
 * Quanto costerà il giro, quando lo si può dire del tutto.
 *
 * La quota scritta rispetto a quella letta non è un'ipotesi tirata fuori dal
 * nulla: un giro di ricerca legge pagine e scrive un riassunto, quindi l'uscita
 * è una piccola frazione dell'ingresso. Sbagliarla sposta la stima di qualche
 * punto percentuale; fingere di conoscere un prezzo che non ci è mai stato
 * detto la sposterebbe da stima a finzione.
 */
const COMPLETION_SHARE = 0.15;

/**
 * @param {TalosResearchPlanTotals} totals
 * @param {TalosResearchPrice | null} price
 * @returns {TalosResearchCost}
 */
export function talosResearchPlanCost(totals, price) {
  if (!price) return { known: false };
  const completion = totals.tokens * COMPLETION_SHARE;
  const prompt = totals.tokens - completion;
  const amount = (prompt * price.promptPerMillion + completion * price.completionPerMillion) / 1_000_000;
  return { known: true, currency: price.currency, amount };
}

/**
 * Togliere una linea d'indagine. Gli id degli altri non si muovono.
 *
 * @param {readonly TalosResearchBranch[]} plan
 * @param {string} branchId
 * @returns {readonly TalosResearchBranch[]}
 */
export function talosResearchPlanWithout(plan, branchId) {
  return plan.filter((branch) => branch.id !== branchId);
}

/**
 * Aggiungerne uno, con una stima presa in prestito dal piano a cui si unisce.
 *
 * Un ramo nuovo costa quanto costano gli altri — è ciò che vuol dire «un altro
 * di questi» — e un piano i cui rami portassero stime selvaggiamente diverse
 * per lo stesso tipo di lavoro renderebbe il totale illeggibile. L'id NON è di
 * proposito un contatore sulla lunghezza corrente: togliere b2 e poi
 * aggiungerne uno produrrebbe un secondo b2, e un id doppio è un passo che
 * sovrascrive il posto di un altro nel giornale.
 *
 * @param {readonly TalosResearchBranch[]} plan
 * @param {string} question
 * @param {TalosResearchDepth} depth
 * @returns {readonly TalosResearchBranch[]}
 */
export function talosResearchPlanWith(plan, question, depth) {
  const highest = plan.reduce((top, branch) => {
    const parsed = Number.parseInt(branch.id.replace(/^b/, ''), 10);
    return Number.isFinite(parsed) && parsed > top ? parsed : top;
  }, 0);
  const template = plan[0]?.estimate ?? talosResearchPlanFor(question, depth)[0].estimate;
  return [...plan, { id: `b${highest + 1}`, question: question.trim(), estimate: template }];
}

/**
 * Riformularne uno. La stima non cambia: il lavoro ha la stessa forma.
 *
 * @param {readonly TalosResearchBranch[]} plan
 * @param {string} branchId
 * @param {string} question
 * @returns {readonly TalosResearchBranch[]}
 */
export function talosResearchPlanReworded(plan, branchId, question) {
  return plan.map((branch) => (
    branch.id === branchId ? { ...branch, question: question.trim() } : branch
  ));
}

/**
 * Quanto DEVE LEGGERE IN UNA VOLTA chi scrive il rapporto.
 *
 * Non è il totale della ricerca — quello comprende le ricerche e le sintesi
 * per ramo, che sono chiamate separate. Il prompt finale porta il testo di
 * tutte le fonti raccolte, e basta.
 *
 * La differenza conta perché è quella che un avviso mostra all'utente: dire
 * 21.000 quando il modello ne legge 9.000 è una cifra plausibile invece che
 * vera, ed è esattamente ciò che la disciplina sul costo vieta.
 *
 * @param {readonly TalosResearchBranch[]} plan
 * @returns {number}
 */
export function talosResearchSynthesisLoad(plan) {
  return plan.reduce((sum, branch) => sum + branch.estimate.pages, 0) * TOKENS_PER_SOURCE;
}
