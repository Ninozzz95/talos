/*
 * L6 — LA CACHE DEI RISULTATI WEB, DENTRO LA CORSA.
 *
 * ## Il difetto che chiude, col numero
 *
 * Baseline vera del desktop, corsa `deep` (sessione `d2a453a8` del 4174,
 * 11/09/2026): 484.171 token in ingresso, `cached_tokens: 0`, 9 ricerche e 14
 * navigazioni. Le linee d'indagine di una ricerca profonda partono dalla stessa
 * domanda: cercano le stesse cose e aprono le stesse pagine, e oggi ognuna paga
 * per conto suo. È l'UNICO punto in cui Hermes — l'obiettivo da battere — è
 * avanti a noi E al mobile (§4.2 del disegno, righe C21/C22).
 *
 * ## Che cosa questa cache risparmia, e che cosa NO
 *
 * ⛔ Va detto con precisione, perché confonderlo farebbe promettere il numero
 * sbagliato:
 *
 *   - risparmia CHIAMATE DI RETE e attese: la stessa pagina si apre una volta;
 *   - risparmia GIRI: un attrezzo in meno è un giro in meno, e in una
 *     conversazione che cresce ogni giro rispedisce TUTTO il prefisso — quindi
 *     il risparmio in token è più che proporzionale al risultato evitato;
 *   - NON risparmia da sola i token della sintesi: il testo di una pagina entra
 *     nel prompt anche quando arriva dalla cache. Quelli li tagliano il budget
 *     per pagina (`page-budget.mjs`) e la cache del PROMPT del fornitore, che è
 *     un'altra cosa e sta altrove.
 *
 * ⇒ `cached_tokens: 0` è un guasto della cache del PROMPT (prefisso esatto);
 * questa cache attacca il numeratore — 484.171 — riducendo i giri. Le due si
 * moltiplicano, e per moltiplicarsi vogliono la stessa cosa: che una chiamata
 * identica produca byte IDENTICI. Per questo un risultato servito dalla cache
 * torna uguale all'originale, e il fatto che venisse dalla cache si scrive nel
 * registro — mai dentro il testo che legge il modello.
 *
 * ## Le regole, e da dove vengono
 *
 * Fonte primaria: `website/docs/user-guide/features/web-search.md:59-80` del
 * clone `%LOCALAPPDATA%\Temp\talos-competitor\hermes-agent-v21` (Hermes v0.21
 * «Pantheon»), letta l'11/09/2026 — «Result caching»:
 *
 *   - `web_search`: stessa query (insensibile a maiuscole e spazi), stesso
 *     fornitore; i limiti richiesti sono raggruppati a 10/20/50/100 «so
 *     near-identical requests share one entry, with each caller receiving its
 *     requested count»;
 *   - `web_extract`: stesso URL, stesso formato, stesso fornitore;
 *   - ricerche identiche CONCORRENTI «are coalesced into a single backend
 *     request — the first caller pays; the rest share the response»;
 *   - «Only successful responses are cached. Failures always retry the backend»;
 *   - mai in cache gli indirizzi locali: «dev servers, hot-reload builds … a
 *     cached copy would show you a stale build».
 *
 * ⛔ Quest'ultima per noi non è un'ipotesi di comodo: il 4174 è `localhost`, e
 * una copia vecchia di una pagina del nostro stesso prodotto è esattamente il
 * genere di bugia che costa una giornata.
 *
 * ## Perché la scadenza, di default, è LA CORSA
 *
 * Hermes tiene 20 minuti. Noi no, e per una ragione che riguarda il prodotto:
 * un dossier dev'essere COERENTE. Due rami che citano la stessa pagina con due
 * testi diversi perché in mezzo è passata mezz'ora producono un rapporto che si
 * contraddice da solo, e la contraddizione non sarebbe nemmeno visibile. La
 * freschezza è il mestiere di `recheck.mjs`, che rilegge apposta e dice cos'è
 * cambiato. ⇒ dentro una corsa la pagina è quella; `ttlMs` resta configurabile
 * per chi vuole il comportamento di Hermes.
 *
 * ## Vive per corsa e sopravvive alla pausa
 *
 * Questo modulo NON scrive su disco: la persistenza è dell'orchestratore, che
 * salva accanto al giornale. Qui si dichiara solo il contratto —
 * `snapshot()`/`restore()` su un oggetto JSON-serializzabile — perché una
 * ripresa che ripaga ciò che era già stato pagato è il difetto che il giornale
 * esiste per impedire.
 */

import { TALOS_RESEARCH_KEPT_CAP } from './page-budget.mjs';

/** La versione dell'istantanea. Un numero diverso si ignora invece di indovinare. */
export const TALOS_RESEARCH_CACHE_SNAPSHOT_VERSION = 1;

/**
 * I gruppi dei limiti di ricerca, da Hermes: `limit=5` e `limit=8` condividono
 * una voce, e ognuno riceve il numero che aveva chiesto.
 */
export const TALOS_RESEARCH_LIMIT_BUCKETS = [10, 20, 50, 100];

/**
 * L'indirizzo ridotto a ciò che identifica la PAGINA.
 *
 * Schema e host minuscoli, porta di default via, frammento via (`#sezione` è un
 * punto della stessa pagina), query ORDINATA per chiave — `?b=2&a=1` e
 * `?a=1&b=2` sono la stessa richiesta — ma MAI tolta: su moltissimi siti `?id=12`
 * e `?id=13` sono due articoli diversi, e fonderli sarebbe peggio di un doppione.
 *
 * ⛔ La barra finale si toglie per stare d'accordo con `chiaveDi` in
 * `synthesis.mjs:124-133`, che deduplica le fonti allo stesso modo: due
 * identità diverse per la stessa pagina farebbero cadere la cache proprio dove
 * la sintesi ha già deciso che si tratta di una pagina sola.
 *
 * Un indirizzo illeggibile resta sé stesso, ripulito: meglio un doppione che
 * un'eccezione in mezzo a una raccolta.
 *
 * @param {string} grezzo
 * @returns {string}
 */
export function talosResearchNormalizeUrl(grezzo) {
  const testo = String(grezzo ?? '').trim();
  let letto;
  try {
    letto = new URL(testo);
  } catch {
    return testo;
  }

  letto.hash = '';
  letto.protocol = letto.protocol.toLowerCase();
  letto.hostname = letto.hostname.toLowerCase();
  if ((letto.protocol === 'http:' && letto.port === '80') || (letto.protocol === 'https:' && letto.port === '443')) {
    letto.port = '';
  }

  const coppie = [...letto.searchParams.entries()].sort((a, b) => (
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0
  ));
  letto.search = '';
  for (const [chiave, valore] of coppie) letto.searchParams.append(chiave, valore);

  const finale = letto.toString();
  return finale.endsWith('/') && !letto.search ? finale.slice(0, -1) : finale;
}

/**
 * La query ridotta a ciò che la identifica: spazi compattati, maiuscole via.
 * «Insensibile a maiuscole e spazi», come Hermes.
 *
 * @param {string} grezza
 * @returns {string}
 */
export function talosResearchNormalizeQuery(grezza) {
  return String(grezza ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Il gruppo di appartenenza di un limite richiesto.
 * @param {number} quanti
 * @returns {number}
 */
export function talosResearchLimitBucket(quanti) {
  const n = Number(quanti);
  if (!Number.isFinite(n) || n <= 0) return TALOS_RESEARCH_LIMIT_BUCKETS[0];
  for (const gruppo of TALOS_RESEARCH_LIMIT_BUCKETS) if (n <= gruppo) return gruppo;
  return TALOS_RESEARCH_LIMIT_BUCKETS[TALOS_RESEARCH_LIMIT_BUCKETS.length - 1];
}

/**
 * @typedef {object} TalosResearchFetchDescriptor
 * @property {'search' | 'extract'} kind
 * @property {string} [url] Per `extract`.
 * @property {string} [query] Per `search`.
 * @property {number} [limit] Per `search`: raggruppato, non usato alla lettera.
 * @property {string} [provider] Chi risponde. Due fornitori non danno la stessa pagina.
 * @property {string} [format] Il formato chiesto a chi estrae, quando ne ha più d'uno.
 */

/**
 * La chiave.
 *
 * ⛔ Le parti a vocabolario chiuso (tipo, fornitore, formato, gruppo) stanno
 * PRIMA e non contengono mai il separatore; la parte libera — URL o query — sta
 * ULTIMA. Così un `|` dentro una query non può fingersi un confine: non c'è
 * nessun campo dopo di lei da confondere.
 *
 * @param {TalosResearchFetchDescriptor} descrittore
 * @returns {string}
 */
export function talosResearchFetchKey(descrittore) {
  const tipo = descrittore.kind === 'search' ? 'search' : 'extract';
  const fornitore = String(descrittore.provider ?? '').replace(/\|/g, '').trim().toLowerCase() || '-';
  const formato = String(descrittore.format ?? '').replace(/\|/g, '').trim().toLowerCase() || '-';
  return tipo === 'search'
    ? `search|${fornitore}|${talosResearchLimitBucket(descrittore.limit ?? 0)}|${talosResearchNormalizeQuery(descrittore.query ?? '')}`
    : `extract|${fornitore}|${formato}|${talosResearchNormalizeUrl(descrittore.url ?? '')}`;
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * Gli indirizzi che non si mettono MAI in cache: locali, di rete privata, o
 * senza punti (un nome a etichetta sola è un host di LAN).
 *
 * ⛔ Il 4174 cade qui dentro, ed è voluto: una pagina del nostro prodotto
 * servita da una copia vecchia è il modo più efficiente di perdere una giornata.
 *
 * @param {string} grezzo
 * @returns {boolean}
 */
export function talosResearchNeverCached(grezzo) {
  let host;
  try {
    host = new URL(String(grezzo ?? '')).hostname.toLowerCase();
  } catch {
    // Un indirizzo che non si legge non si può nemmeno giudicare pubblico.
    return true;
  }
  if (!host) return true;

  const nudo = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  if (nudo === 'localhost' || nudo === '::1' || nudo.endsWith('.localhost')) return true;
  if (nudo.endsWith('.local') || nudo.endsWith('.internal') || nudo.endsWith('.home.arpa')) return true;
  if (!nudo.includes('.') && !nudo.includes(':')) return true;

  const quattro = IPV4.exec(nudo);
  if (quattro) {
    const [a, b] = [Number(quattro[1]), Number(quattro[2])];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
  }
  if (nudo.startsWith('fe80:') || nudo.startsWith('fc') || nudo.startsWith('fd')) return true;
  return false;
}

/**
 * @typedef {object} TalosResearchCacheStats
 * @property {number} calls Quante volte è stata chiesta una cosa. `calls === fetched + served + coalesced`.
 * @property {number} fetched Quante volte si è dovuto chiamare davvero il produttore.
 * @property {number} served Quante volte ha risposto la cache.
 * @property {number} coalesced Quante si sono accodate a una chiamata identica già in volo.
 * @property {number} skipped Indirizzi mai da mettere in cache (sottoinsieme di `fetched`).
 * @property {number} failed Produttori che hanno lanciato o non hanno prodotto: nulla è stato conservato.
 * @property {number} oversize Risposte troppo grandi per essere conservate.
 * @property {number} evicted Voci sfrattate per fare posto.
 * @property {number} entries Voci vive adesso.
 * @property {number} chars Caratteri conservati adesso.
 */

/**
 * @typedef {object} TalosResearchCacheSnapshot
 * @property {number} version
 * @property {number | null} savedAt
 * @property {readonly {key: string, storedAt: number, chars: number, value: unknown}[]} entries
 */

/**
 * Quanto pesa una risposta. `JSON.stringify` invece di indovinare dal campo
 * `text`: una risposta di ricerca è un elenco, e il peso vero è tutto l'oggetto.
 *
 * @param {unknown} valore
 * @returns {number}
 */
function pesa(valore) {
  try {
    return JSON.stringify(valore)?.length ?? 0;
  } catch {
    // Un valore non serializzabile non è conservabile: peso infinito lo esclude
    // dalla conservazione senza un ramo speciale.
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * ⛔ Il tipo è il RITORNO della fabbrica, non un'interfaccia scritta due volte:
 * `harness-ui/` non ha un `tsconfig.json`, quindi un `@typedef` copiato a mano
 * che si scosta dal codice non farebbe rosso nessun test — e diventerebbe una
 * bugia silenziosa esattamente nel punto in cui gli altri file lo leggono.
 *
 * @typedef {ReturnType<typeof talosResearchFetchCache>} TalosResearchFetchCache
 */

/**
 * La cache di una corsa.
 *
 * @param {{now?: () => number, ttlMs?: number | null, maxEntries?: number, maxChars?: number, entryMaxChars?: number}} [opzioni]
 */
export function talosResearchFetchCache(opzioni = {}) {
  const adesso = opzioni.now ?? (() => Date.now());
  const ttlMs = opzioni.ttlMs ?? null;
  const maxVoci = Math.max(1, Math.trunc(opzioni.maxEntries ?? 500));
  const maxCaratteri = Math.max(1, Math.trunc(opzioni.maxChars ?? 64 * 1024 * 1024));
  const maxPerVoce = Math.max(1, Math.trunc(opzioni.entryMaxChars ?? TALOS_RESEARCH_KEPT_CAP));

  /** @type {Map<string, {storedAt: number, chars: number, value: unknown}>} */
  const voci = new Map();
  /** @type {Map<string, Promise<unknown>>} */
  const inVolo = new Map();
  let caratteri = 0;

  const conto = { calls: 0, fetched: 0, served: 0, coalesced: 0, skipped: 0, failed: 0, oversize: 0, evicted: 0 };

  /** @param {string} chiave */
  function scaduta(chiave) {
    if (ttlMs === null) return false;
    const voce = voci.get(chiave);
    return voce ? adesso() - voce.storedAt >= ttlMs : false;
  }

  /** @param {string} chiave */
  function togli(chiave) {
    const voce = voci.get(chiave);
    if (!voce) return;
    caratteri -= voce.chars;
    voci.delete(chiave);
  }

  function sfratta() {
    // La `Map` conserva l'ordine di inserimento e ogni lettura ri-inserisce in
    // fondo: la prima chiave è la meno usata di recente.
    while ((voci.size > maxVoci || caratteri > maxCaratteri) && voci.size > 0) {
      const primo = voci.keys().next().value;
      togli(primo);
      conto.evicted += 1;
    }
  }

  /**
   * @param {string} chiave
   * @param {unknown} valore
   */
  function conserva(chiave, valore) {
    const peso = pesa(valore);
    if (peso > maxPerVoce) {
      conto.oversize += 1;
      return;
    }
    togli(chiave);
    voci.set(chiave, { storedAt: adesso(), chars: peso, value: valore });
    caratteri += peso;
    sfratta();
  }

  return {
    /** @param {TalosResearchFetchDescriptor} descrittore */
    key: (descrittore) => talosResearchFetchKey(descrittore),

    /**
     * Il solo modo di passare di qui: si chiede il valore, e la cache decide se
     * chiamare il produttore, servire quello che ha, o accodarsi a una chiamata
     * identica già in volo.
     *
     * ⛔ `fromCache` NON deve finire nel testo che legge il modello: due giri
     * identici devono produrre gli stessi byte, o la cache del prompt del
     * fornitore (prefisso esatto) si azzera proprio mentre la stiamo cercando.
     * Va nel registro.
     *
     * @template T
     * @param {TalosResearchFetchDescriptor} descrittore
     * @param {() => Promise<T>} produttore
     * @returns {Promise<{value: T, fromCache: boolean, key: string}>}
     */
    async around(descrittore, produttore) {
      conto.calls += 1;
      const chiave = talosResearchFetchKey(descrittore);

      const mai = descrittore.kind === 'extract' && talosResearchNeverCached(descrittore.url ?? '');
      if (mai) {
        conto.fetched += 1;
        conto.skipped += 1;
        try {
          return { value: await produttore(), fromCache: false, key: chiave };
        } catch (rotto) {
          conto.failed += 1;
          throw rotto;
        }
      }

      if (scaduta(chiave)) togli(chiave);

      if (voci.has(chiave)) {
        const voce = voci.get(chiave);
        // Ri-inserita in fondo: è la mossa che rende l'ordine una LRU.
        voci.delete(chiave);
        voci.set(chiave, voce);
        conto.served += 1;
        return { value: /** @type {T} */ (voce.value), fromCache: true, key: chiave };
      }

      const giaInVolo = inVolo.get(chiave);
      if (giaInVolo) {
        conto.coalesced += 1;
        // Il primo paga, gli altri condividono la risposta. Se il primo fallisce
        // falliscono anche loro: è la stessa chiamata, e fingere il contrario
        // vorrebbe dire chiamare di nuovo un fornitore che ha appena detto di no.
        return { value: /** @type {T} */ (await giaInVolo), fromCache: true, key: chiave };
      }

      conto.fetched += 1;
      const promessa = (async () => produttore())();
      inVolo.set(chiave, promessa);
      try {
        const valore = await promessa;
        // Solo le risposte riuscite si conservano, come Hermes. `null`/`undefined`
        // è «non si è potuto leggere»: un fallimento si ritenta, non si incide.
        if (valore === null || valore === undefined) conto.failed += 1;
        else conserva(chiave, valore);
        return { value: /** @type {T} */ (valore), fromCache: false, key: chiave };
      } catch (rotto) {
        conto.failed += 1;
        throw rotto;
      } finally {
        inVolo.delete(chiave);
      }
    },

    /** @returns {TalosResearchCacheStats} */
    stats() {
      return { ...conto, entries: voci.size, chars: caratteri };
    },

    /**
     * Il contratto per chi persiste: un oggetto JSON-serializzabile, che
     * l'orchestratore salva accanto al giornale. ⛔ Questo modulo non scrive
     * niente su disco.
     *
     * @returns {TalosResearchCacheSnapshot}
     */
    snapshot() {
      return {
        version: TALOS_RESEARCH_CACHE_SNAPSHOT_VERSION,
        savedAt: adesso(),
        entries: [...voci.entries()].map(([key, voce]) => ({
          key,
          storedAt: voce.storedAt,
          chars: voce.chars,
          value: voce.value,
        })),
      };
    },

    /**
     * Rimette dentro ciò che una corsa in pausa aveva già pagato.
     *
     * ⛔ Tollerante in lettura, come il giornale: una versione che non conosce
     * si ignora, una voce malformata si salta. Un formato più nuovo non deve
     * impedire a una ricerca di RIPARTIRE — al massimo la fa ripagare.
     *
     * @param {TalosResearchCacheSnapshot | null | undefined} istantanea
     * @returns {number} quante voci sono rientrate
     */
    restore(istantanea) {
      if (!istantanea || istantanea.version !== TALOS_RESEARCH_CACHE_SNAPSHOT_VERSION) return 0;
      if (!Array.isArray(istantanea.entries)) return 0;
      let rientrate = 0;
      for (const voce of istantanea.entries) {
        if (!voce || typeof voce.key !== 'string') continue;
        if (voce.value === null || voce.value === undefined) continue;
        const peso = typeof voce.chars === 'number' && voce.chars >= 0 ? voce.chars : pesa(voce.value);
        if (peso > maxPerVoce) { conto.oversize += 1; continue; }
        togli(voce.key);
        voci.set(voce.key, {
          storedAt: typeof voce.storedAt === 'number' ? voce.storedAt : adesso(),
          chars: peso,
          value: voce.value,
        });
        caratteri += peso;
        rientrate += 1;
      }
      sfratta();
      return rientrate;
    },

    clear() {
      voci.clear();
      caratteri = 0;
    },
  };
}
