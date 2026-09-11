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
 */

/**
 * @typedef {import('./run.mjs').TalosResearchBranch} TalosResearchBranch
 * @typedef {import('./run.mjs').TalosResearchSpend} TalosResearchSpend
 */

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
 * @property {TalosResearchSpend} spend MISURATA, non stimata. Il piano indovina; il giro conta.
 */

/**
 * @typedef {object} TalosResearchCollectorDeps
 * @property {(query: string, maxResults: number) => Promise<readonly {url:string, title:string, snippet:string, publishedAt:string|null}[]>} search
 * @property {(url: string) => Promise<{title:string, text:string, publishedAt:string|null} | null>} read
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
 * @returns {string}
 */
function trim(text) {
  const squeezed = text.replace(/\s+/g, ' ').trim();
  return squeezed.length > MAX_CHARS_PER_SOURCE ? squeezed.slice(0, MAX_CHARS_PER_SOURCE) : squeezed;
}

/**
 * @param {TalosResearchCollectorDeps} deps
 * @param {TalosResearchBranch} branch
 * @returns {Promise<TalosResearchCollection>}
 */
export async function talosResearchCollect(deps, branch) {
  const wanted = Math.max(1, branch.estimate.pages);
  const found = await deps.search(branch.question, wanted);

  /** @type {TalosResearchSource[]} */
  const sources = [];
  /** @type {TalosResearchUnreachable[]} */
  const unreachable = [];
  let pages = 0;

  for (const result of found) {
    /** @type {{title:string, text:string, publishedAt:string|null} | null} */
    let extracted = null;
    try {
      extracted = await deps.read(result.url);
    } catch (failure) {
      unreachable.push({
        url: result.url,
        reason: failure instanceof Error ? failure.message : 'unknown',
      });
    }

    if (extracted && extracted.text.trim().length > 0) {
      pages += 1;
      sources.push({
        url: result.url,
        title: extracted.title || result.title,
        // La data della pagina vince su quella del motore di ricerca: una è
        // l'editore che parla, l'altra è un indice che indovina.
        publishedAt: extracted.publishedAt ?? result.publishedAt,
        text: trim(extracted.text),
        obtained: 'page',
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
      sources.push({
        url: result.url,
        title: result.title,
        publishedAt: result.publishedAt,
        text: trim(result.snippet),
        obtained: 'snippet',
      });
    }
  }

  const characters = sources.reduce((total, source) => total + source.text.length, 0);
  return {
    branchId: branch.id,
    query: branch.question,
    sources,
    unreachable,
    spend: {
      searches: 1,
      pages,
      // Quello che è stato davvero assorbito, contato dal testo che è qui.
      tokens: Math.ceil(characters / CHARS_PER_TOKEN),
    },
  };
}
