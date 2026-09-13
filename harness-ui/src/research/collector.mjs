/*
 * PORTO FEDELE di AVM/mobile/src/lib/research/researchCollector.ts (155 righe, 11/09/2026).
 *
 * Raccogliere quanto vale una linea d'indagine, e tenerlo.
 *
 * R-3. La raccolta in sé non ha niente di notevole — cerca, leggi i primi
 * risultati, scrivi cos'hanno detto. La decisione che conta è che il TESTO
 * ESTRATTO SI TIENE, ed è l'unica cosa in questa fase che nessun altro fa.
 *
 * Ogni prodotto di ricerca sul mercato conserva link. Un link è una promessa su
 * una pagina, e le pagine marciscono: vengono modificate, messe dietro un
 * paywall, spostate, o semplicemente spente. Un dossier fatto di link degrada
 * in silenzio — le citazioni sembrano a posto finché qualcuno non ne clicca una
 * — e non si può ricontrollare affatto, perché la cosa che citava non c'è più.
 * Tenere il passaggio rende il dossier interrogabile un anno dopo, rende
 * possibile la ri-verifica di R12, ed è impossibile da copiare per chiunque il
 * cui prodotto sia un elenco di URL.
 *
 * L'altra regola qui è quella che questo progetto ha imparato a caro prezzo:
 * una fonte che non si è potuta leggere si REGISTRA, non si butta mai. Una
 * raccolta che torna in silenzio con quattro fonti invece di sei sembra un tema
 * povero invece di uno scaricamento rotto, e la differenza è tutto ciò che
 * decide se la risposta si possa credere.
 *
 * ⛔ L'I/O entra da `deps` (`search`, `read`): i test usano finti, mai la rete.
 *
 * ## L6 (11/09/2026) — la cache e il budget entrano dalla STESSA porta
 *
 * Due cose nuove, e nessuna delle due è logica di raccolta: sono I/O, quindi
 * arrivano da `deps` come `search` e `read`, e senza di loro questo file si
 * comporta ESATTAMENTE come il porto fedele dal mobile.
 *
 *   - `deps.cache` (`fetch-cache.mjs`): le linee d'indagine di una ricerca
 *     profonda partono dalla stessa domanda e aprono le stesse pagine. Con la
 *     cache la pagina si apre una volta per corsa; senza, ogni ramo ripaga.
 *   - `deps.budget` (`page-budget.mjs`): quanto di una pagina vede il modello,
 *     con il resto CONSERVATO e un riferimento leggibile.
 *
 * ⛔ Il testo INTERO resta in `source.text`, ed è deliberato: è il dossier, ed è
 * ciò che `talosResearchLocate` (`verification.mjs:201`) legge per decidere se
 * un passaggio citato esiste davvero. Cercare nella finestra farebbe risultare
 * INVENTATA una citazione onesta caduta nel mezzo tagliato — il verso peggiore.
 * Al modello va `source.window`, che è una cosa diversa e si chiama diversamente.
 */

/**
 * @typedef {import('./run.mjs').TalosResearchBranch} TalosResearchBranch
 * @typedef {import('./run.mjs').TalosResearchSpend} TalosResearchSpend
 * @typedef {import('./page-budget.mjs').TalosResearchPageReference} TalosResearchPageReference
 */

import { TALOS_RESEARCH_PAGE_BUDGET, TALOS_RESEARCH_HEAD_SHARE, talosResearchPageBudget } from './page-budget.mjs';

/**
 * @typedef {object} TalosResearchSource
 * @property {string} url
 * @property {string} title
 * @property {string | null} publishedAt Quello che dice la FONTE, o null. Mai la data di oggi, mai un'ipotesi.
 * @property {string} text
 *   Il testo leggibile, com'era il giorno in cui è stato letto. Questo È il
 *   dossier. Tutto quello che viene dopo — la sintesi, il controllo delle
 *   citazioni, la ri-verifica un anno dopo — legge questo e non la rete.
 * @property {'page' | 'snippet'} obtained
 *   Quanta parte della fonte è davvero qui. Uno snippet è quello che il motore
 *   di ricerca ha mostrato; una pagina è quello che la pagina ha detto.
 *   Dichiarato perché un'affermazione sostenuta solo da uno snippet è una prova
 *   più debole, e nasconderlo farebbe sembrare uguali le due cose.
 * @property {string} [window]
 *   L6. Quanto di `text` va al modello: testa + marcatore + coda quando la
 *   pagina supera il budget, `text` identico quando non lo supera o quando
 *   nessun budget è configurato. ⛔ Mai la fonte della verità: quella è `text`.
 * @property {number} [omitted] Caratteri che la finestra non mostra. Contati, mai stimati.
 * @property {boolean} [fromCache]
 *   L6. Questa pagina NON è stata riaperta: l'aveva già pagata un altro ramo
 *   della stessa corsa. Il registro la conta a parte da quelle aperte davvero —
 *   «9 pagine, 4 servite dalla cache» dice una cosa che «9 pagine» non dice.
 */

/**
 * @typedef {object} TalosResearchUnreachable
 * @property {string} url
 * @property {string} reason
 */

/**
 * @typedef {object} TalosResearchCollection
 * @property {string} branchId
 * @property {string} query
 * @property {readonly TalosResearchSource[]} sources
 * @property {readonly TalosResearchUnreachable[]} unreachable Mai vuota in silenzio: quello che non si è potuto leggere ha un nome.
 * @property {TalosResearchSpend} spend
 *   MISURATA, non stimata. Il piano indovina; il giro conta.
 *   ⛔ L6: è la SPESA, quindi ciò che la cache ha servito NON è qui dentro —
 *   una pagina non riaperta non è stata pagata, e contarla renderebbe invisibile
 *   il guadagno proprio nel numero fatto per mostrare il costo. Quanto è arrivato
 *   gratis sta in `fromCache`, così chi legge ha tutte e due le cifre e nessuna
 *   delle due mente.
 * @property {{searches: number, pages: number}} fromCache
 *   L6. Quante ricerche e quante pagine sono arrivate dalla cache della corsa.
 *   `spend.pages + fromCache.pages` è il numero di fonti ottenute.
 */

/**
 * @typedef {object} TalosResearchCollectorDeps
 * @property {(query: string, maxResults: number) => Promise<readonly {url:string, title:string, snippet:string, publishedAt:string|null}[]>} search
 * @property {(url: string) => Promise<{title:string, text:string, publishedAt:string|null} | null>} read
 * @property {import('./fetch-cache.mjs').TalosResearchFetchCache} [cache]
 *   L6. Se c'è, una ricerca o una pagina già viste in questa corsa non si
 *   ripagano. Se non c'è, questo file fa esattamente quello che faceva prima.
 * @property {string} [provider]
 *   Chi risponde. Entra nella chiave: due fornitori non danno la stessa pagina,
 *   e servire l'una per l'altra sarebbe una bugia silenziosa.
 * @property {object} [budget] L6. Se assente, nessuna finestra: `window === text`.
 * @property {number} [budget.cap] Caratteri mostrati al modello. Predefinito `TALOS_RESEARCH_PAGE_BUDGET`.
 * @property {number} [budget.headShare] Quota in testa. Predefinita `TALOS_RESEARCH_HEAD_SHARE`.
 * @property {number} [budget.keep]
 *   Quanto testo si CONSERVA per fonte. Predefinito `MAX_CHARS_PER_SOURCE`
 *   (20.000, il tetto del telefono). Sul desktop il dossier sta su disco e non
 *   in un database solo: chi lo sa alza questo, e il budget resta sotto.
 * @property {(url: string) => (TalosResearchPageReference | null)} [budget.reference]
 *   Dove il chiamante ha depositato il testo intero di quella pagina, e la
 *   chiamata esatta per sfogliarlo. ⛔ Non si inventa: chi non ha un deposito
 *   non passa niente e il marcatore tace invece di promettere un percorso.
 */

/**
 * Quanto si tiene di una pagina.
 *
 * Un articolo lungo sono decine di migliaia di caratteri e un telefono tiene
 * l'intero dossier in un database solo. Si taglia qui invece che al momento
 * della sintesi: quello che si tiene è quello che si potrà ri-verificare più
 * tardi, quindi il confine appartiene a dove la prova è CONSERVATA e non a dove
 * capita che venga letta.
 */
const MAX_CHARS_PER_SOURCE = 20_000;

/** Quattro caratteri per token è la regola pratica consueta per la prosa. */
const CHARS_PER_TOKEN = 4;

/**
 * @param {string} text
 * @param {number} [tetto]
 * @returns {string}
 */
function trim(text, tetto = MAX_CHARS_PER_SOURCE) {
  const squeezed = text.replace(/\s+/g, ' ').trim();
  return squeezed.length > tetto ? squeezed.slice(0, tetto) : squeezed;
}

/**
 * @param {TalosResearchCollectorDeps} deps
 * @param {TalosResearchBranch} branch
 * @returns {Promise<TalosResearchCollection>}
 */
export async function talosResearchCollect(deps, branch) {
  const wanted = Math.max(1, branch.estimate.pages);

  /*
   * ⛔ Senza cache questa è la funzione identità sul produttore: la porta è
   * sempre la stessa, quindi non ci sono due percorsi da tenere allineati — e
   * un ramo che esiste solo quando una dipendenza c'è è un ramo che nessun test
   * predefinito attraversa.
   */
  const cache = deps.cache ?? null;
  /**
   * @template T
   * @param {import('./fetch-cache.mjs').TalosResearchFetchDescriptor} descrittore
   * @param {() => Promise<T>} produttore
   * @returns {Promise<{value: T, fromCache: boolean}>}
   */
  const attorno = async (descrittore, produttore) => (
    cache ? cache.around(descrittore, produttore) : { value: await produttore(), fromCache: false }
  );

  const conserva = Math.max(1, Math.trunc(deps.budget?.keep ?? MAX_CHARS_PER_SOURCE));
  /** @param {string} testo @param {string} url */
  const finestra = (testo, url) => {
    if (!deps.budget) return { window: testo, omitted: 0 };
    const tagliata = talosResearchPageBudget(testo, {
      cap: deps.budget.cap ?? TALOS_RESEARCH_PAGE_BUDGET,
      headShare: deps.budget.headShare ?? TALOS_RESEARCH_HEAD_SHARE,
      reference: deps.budget.reference ? deps.budget.reference(url) : null,
    });
    return { window: tagliata.window, omitted: tagliata.omitted };
  };

  const ricerca = await attorno(
    { kind: 'search', query: branch.question, limit: wanted, provider: deps.provider },
    () => deps.search(branch.question, wanted),
  );
  const found = ricerca.value;

  /** @type {TalosResearchSource[]} */
  const sources = [];
  /** @type {TalosResearchUnreachable[]} */
  const unreachable = [];
  let pages = 0;
  let pagineDallaCache = 0;

  for (const result of found) {
    /** @type {{title:string, text:string, publishedAt:string|null} | null} */
    let extracted = null;
    let dallaCache = false;
    try {
      const letta = await attorno(
        { kind: 'extract', url: result.url, provider: deps.provider },
        () => deps.read(result.url),
      );
      extracted = letta.value;
      dallaCache = letta.fromCache;
    } catch (failure) {
      unreachable.push({
        url: result.url,
        reason: failure instanceof Error ? failure.message : 'unknown',
      });
    }

    if (extracted && extracted.text.trim().length > 0) {
      if (dallaCache) pagineDallaCache += 1;
      else pages += 1;
      const testo = trim(extracted.text, conserva);
      sources.push({
        url: result.url,
        title: extracted.title || result.title,
        // La data della pagina vince su quella del motore di ricerca: una è
        // l'editore che parla, l'altra è un indice che indovina.
        publishedAt: extracted.publishedAt ?? result.publishedAt,
        text: testo,
        obtained: 'page',
        ...finestra(testo, result.url),
        fromCache: dallaCache,
      });
      continue;
    }

    // Si ripiega sullo snippet invece di buttare la fonte. Un risultato di
    // ricerca che non si è potuto aprire dice comunque qualcosa, e dirlo con
    // `obtained: 'snippet'` è onesto in un modo in cui il silenzio non è.
    if (!extracted && unreachable.every((entry) => entry.url !== result.url)) {
      unreachable.push({ url: result.url, reason: 'unreadable' });
    }
    if (result.snippet.trim().length > 0) {
      const testo = trim(result.snippet, conserva);
      sources.push({
        url: result.url,
        title: result.title,
        publishedAt: result.publishedAt,
        text: testo,
        obtained: 'snippet',
        ...finestra(testo, result.url),
        fromCache: dallaCache,
      });
    }
  }

  /*
   * ⛔ Si conta la FINESTRA, non il testo conservato: i token si pagano su ciò
   * che arriva al modello, e conservare di più non costa un token. Senza budget
   * la finestra È il testo, quindi questo numero è identico a prima.
   */
  const characters = sources.reduce((total, source) => total + (source.window ?? source.text).length, 0);
  return {
    branchId: branch.id,
    query: branch.question,
    sources,
    unreachable,
    spend: {
      searches: ricerca.fromCache ? 0 : 1,
      pages,
      // Quello che è stato davvero assorbito, contato dal testo che è qui.
      tokens: Math.ceil(characters / CHARS_PER_TOKEN),
    },
    fromCache: { searches: ricerca.fromCache ? 1 : 0, pages: pagineDallaCache },
  };
}
