/**
 * ⭐⭐⭐ 04/9 — R-03, LA FONTE DELLA RICERCA WEB si sceglie dalle Impostazioni
 * (parità col mobile, `TalosMobileSearchSourcePanel.vue` / `searchSources.ts`),
 * non più solo dalle variabili d'ambiente all'avvio.
 *
 * Cinque fonti: le quattro del mobile (Tavily, Brave, SearXNG, endpoint
 * custom) più una che il mobile non ha, **DuckDuckGo senza chiave** — il +1 del
 * desktop: la ricerca funziona anche a chiave zero, dichiarando che è una
 * pagina pubblica letta senza accordo (vedi `duckduckgo-search.mjs`).
 *
 * Dove vivono le cose:
 * - la scelta (fonte, indirizzo) in un file JSON accanto al server, come
 *   `.provider-runtime.json`; mai nel browser;
 * - la chiave nel portachiavi del sistema (`@napi-rs/keyring`, servizio
 *   `talos-harness-search`), un account per fonte; mai su disco in chiaro;
 * - le variabili `TALOS_HARNESS_SEARCH_*` restano il SEME quando il file non
 *   esiste ancora (chi le usa oggi non perde niente); appena si sceglie dalla
 *   UI, comanda il file.
 *
 * Senza niente di configurato la fonte è DuckDuckGo: il modello può cercare
 * subito. Chi non vuole nessuna ricerca la spegne («off») ed è una scelta
 * registrata, non un'assenza.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

export const KEYRING_SERVICE_RICERCA = 'talos-harness-search';
const MAX_KEY_LENGTH = 4096;
const FONTI = Object.freeze({
  duckduckgo: Object.freeze({ id: 'duckduckgo', label: 'DuckDuckGo (no key)', labelChiave: 'server.search.label.duckduckgo', needsKey: false, needsEndpoint: false, keyless: true,
    nota: 'No key and no account: TALOS reads the public DuckDuckGo results page. It is not an official API: under heavy use it can answer with a block, and then the outcome says so. Only the query leaves this computer.' }),
  tavily: Object.freeze({ id: 'tavily', label: 'Tavily', needsKey: true, needsEndpoint: false, keyless: false,
    nota: '1,000 searches a month at no cost and with no card. It is built for agents, so it returns clean results.', link: 'https://app.tavily.com' }),
  brave: Object.freeze({ id: 'brave', label: 'Brave Search', needsKey: true, needsEndpoint: false, keyless: false,
    nota: 'An independent index. A credit card is required and Brave offers spending limits. Brave does not allow storing the results without a separate agreement: TALOS opens the sources with naviga before saving them.', link: 'https://api-dashboard.search.brave.com' }),
  searxng: Object.freeze({ id: 'searxng', label: 'SearXNG (your instance)', labelChiave: 'server.search.label.searxng', needsKey: false, needsEndpoint: true, keyless: false,
    nota: 'Your own SearXNG instance: no third party sees the query. A Docker container is enough. JSON output is off at the start: turn it on in the instance settings, or TALOS will receive an HTML page.' }),
  custom: Object.freeze({ id: 'custom', label: 'Custom endpoint', labelChiave: 'server.search.label.custom', needsKey: false, needsEndpoint: true, keyless: false,
    nota: 'Any other search API that returns a «results» array at the top level (optional key, sent as Bearer).' }),
});
export const FONTI_RICERCA_IDS = Object.freeze(Object.keys(FONTI));

export class SearchSourceError extends Error {
  constructor(code, message) { super(message || code); this.name = 'SearchSourceError'; this.code = code; }
}

function normalizzaEndpoint(valore) {
  const testo = typeof valore === 'string' ? valore.trim().replace(/\/+$/, '') : '';
  if (!testo) return '';
  let u;
  try { u = new URL(testo); } catch { throw new SearchSourceError('SEARCH_ENDPOINT_INVALID', 'Invalid address: a full http(s) URL is required.'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new SearchSourceError('SEARCH_ENDPOINT_INVALID', 'Invalid address: only http or https.');
  return u.toString().replace(/\/+$/, '');
}

function leggiFile(percorso) {
  if (!percorso || !existsSync(percorso)) return null;
  try {
    const dati = JSON.parse(readFileSync(percorso, 'utf8'));
    return dati && typeof dati === 'object' ? dati : null;
  } catch { return null; }
}
function scriviFile(percorso, dati) {
  if (!percorso) return;
  const tmp = `${percorso}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(dati, null, 2)}\n`);
  renameSync(tmp, percorso);
}

/**
 * @param {object} deps
 * @param {NodeJS.ProcessEnv} [deps.env] seme: TALOS_HARNESS_SEARCH_PROVIDER / _API_KEY / _ENDPOINT
 * @param {{get,set,remove}|null} [deps.keyring] stesso contratto del portachiavi provider (server.mjs)
 * @param {string|null} [deps.file] percorso del JSON di scelta (fonte, endpoint)
 */
export function createSearchSourceStore({ env = process.env, keyring = null, file = null, ignoraSemiAmbiente = false } = {}) {
  const chiavi = new Map();
  let scelta = { source: 'duckduckgo', endpoint: '' };

  const salvato = leggiFile(file);
  if (salvato && typeof salvato.source === 'string' && (FONTI[salvato.source] || salvato.source === 'off')) {
    scelta = { source: salvato.source, endpoint: typeof salvato.endpoint === 'string' ? salvato.endpoint : '' };
  } else if (!ignoraSemiAmbiente) {
    /*
     * ⛔ (16/09/2026) — i semi d'ambiente (`TALOS_HARNESS_SEARCH_*`) valgono solo per lo sviluppo:
     * con lo scope desktop l'app installata salta l'intero ramo (fonte, endpoint e chiave) e la
     * scelta arriva dalla UI, poi persiste in `.search-source.json`. Stessa scelta del negozio
     * provider (`ignoraSemiAmbiente`): un semi d'ambiente non deve mai far comparire una fonte
     * «collegate» nell'app installata.
     */
    const provider = typeof env.TALOS_HARNESS_SEARCH_PROVIDER === 'string' ? env.TALOS_HARNESS_SEARCH_PROVIDER.trim().toLowerCase() : '';
    const chiaveEnv = typeof env.TALOS_HARNESS_SEARCH_API_KEY === 'string' ? env.TALOS_HARNESS_SEARCH_API_KEY.trim() : '';
    const endpointEnv = typeof env.TALOS_HARNESS_SEARCH_ENDPOINT === 'string' ? env.TALOS_HARNESS_SEARCH_ENDPOINT.trim() : '';
    if ((chiaveEnv || endpointEnv) && FONTI[provider || 'tavily']) {
      scelta = { source: provider || 'tavily', endpoint: endpointEnv };
      if (chiaveEnv) chiavi.set(scelta.source, chiaveEnv);
    }
  }
  if (keyring && typeof keyring.get === 'function') {
    for (const id of FONTI_RICERCA_IDS) {
      try {
        const v = keyring.get(KEYRING_SERVICE_RICERCA, id);
        if (typeof v === 'string' && v.trim() && v.length <= MAX_KEY_LENGTH) chiavi.set(id, v.trim());
      } catch { /* il portachiavi che non risponde non è una chiave */ }
    }
  }

  function definizione(id) {
    if (id === 'off') return null;
    const d = FONTI[id];
    if (!d) throw new SearchSourceError('SEARCH_SOURCE_INVALID', `Unknown source: ${id}`);
    return d;
  }
  function prontezza() {
    if (scelta.source === 'off') return 'spenta';
    const d = FONTI[scelta.source];
    if (d.needsKey && !chiavi.has(scelta.source)) return 'chiave-mancante';
    if (d.needsEndpoint && !scelta.endpoint) return 'indirizzo-mancante';
    return 'pronta';
  }
  function keyringOp(op, id, valore) {
    if (!keyring || typeof keyring[op] !== 'function') throw new SearchSourceError('SEARCH_STORE_UNAVAILABLE', 'The system keychain is not available.');
    try { return op === 'set' ? keyring.set(KEYRING_SERVICE_RICERCA, id, valore) : keyring.remove(KEYRING_SERVICE_RICERCA, id); }
    catch { throw new SearchSourceError('SEARCH_STORE_UNAVAILABLE', 'The system keychain is not available.'); }
  }

  /** Vista pubblica: mai una chiave, solo se c'è. */
  function listPublic() {
    return {
      source: scelta.source,
      endpoint: scelta.endpoint || '',
      readiness: prontezza(),
      fonti: FONTI_RICERCA_IDS.map((id) => ({ ...FONTI[id], keyConfigured: chiavi.has(id) })),
    };
  }
  function setSource({ source, endpoint } = {}) {
    if (source !== 'off') definizione(source);
    const endpointNorm = source === 'off' ? '' : normalizzaEndpoint(endpoint ?? (source === scelta.source ? scelta.endpoint : ''));
    const precedente = scelta;
    scelta = { source, endpoint: endpointNorm };
    try { scriviFile(file, scelta); } catch (errore) { scelta = precedente; throw new SearchSourceError('SEARCH_STORE_UNAVAILABLE', `Choice not saved: ${errore.message}`); }
    return listPublic();
  }
  function setKey(source, valore) {
    const d = definizione(source);
    if (!d) throw new SearchSourceError('SEARCH_SOURCE_INVALID', 'No source chosen.');
    if (typeof valore !== 'string' || valore.trim() === '') throw new SearchSourceError('SEARCH_KEY_REQUIRED', 'Paste a key first.');
    const chiave = valore.trim();
    if (chiave.length > MAX_KEY_LENGTH) throw new SearchSourceError('SEARCH_KEY_INVALID', 'Key too long.');
    keyringOp('set', source, chiave);
    chiavi.set(source, chiave);
    return listPublic();
  }
  function clearKey(source) {
    definizione(source);
    keyringOp('remove', source);
    chiavi.delete(source);
    return listPublic();
  }
  /**
   * Ciò che il kernel riceve. `ricercaWeb` è la config di `talosLavora`;
   * `richiediRicercaFn` è il trasporto iniettato SOLO per la fonte senza
   * chiave (per le fonti con chiave il kernel usa il proprio, con la sua
   * guardia DNS pubblica). `undefined` quando spenta o non pronta: il kernel
   * dichiara «not configured», mai un tentativo senza credenziali.
   */
  function perKernel({ trasportoSenzaChiave = null, sentinellaDuckDuckGo = 'https://ricerca-senza-chiave.talos.invalid/duckduckgo' } = {}) {
    if (prontezza() !== 'pronta') return { ricercaWeb: undefined, richiediRicercaFn: undefined };
    if (scelta.source === 'duckduckgo') {
      return { ricercaWeb: Object.freeze({ provider: 'custom', endpoint: sentinellaDuckDuckGo }), richiediRicercaFn: trasportoSenzaChiave ?? undefined };
    }
    const chiave = chiavi.get(scelta.source);
    return {
      ricercaWeb: Object.freeze({ provider: scelta.source, ...(chiave ? { apiKey: chiave } : {}), ...(scelta.endpoint ? { endpoint: scelta.endpoint } : {}) }),
      richiediRicercaFn: undefined,
    };
  }

  return Object.freeze({ listPublic, setSource, setKey, clearKey, perKernel, prontezza, fonte: () => scelta.source });
}
