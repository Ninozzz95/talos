/**
 * «Questa chiave funziona davvero?» — la domanda che il pannello Provider non
 * sapeva porre.
 *
 * ## Perché esiste
 *
 * Owner, 03/9: la scheda Provider «è bruttissima», e guardandola è emerso un
 * difetto più grave dell'estetica: si poteva salvare una chiave e non sapere
 * MAI se era buona. Lo stato diceva «Chiave presente sul server» — cioè che
 * una stringa era stata scritta da qualche parte, non che il provider la
 * accetti. Sono due cose diverse, e la seconda è l'unica che interessa a chi
 * sta per lanciare una sessione.
 *
 * ⭐ Ricerca 03/9 (docs.openwebui.com — «Connect a provider»; auth0 «check
 * connection status»): il pattern affermato è una verifica esplicita che
 * chiama davvero il provider e riporta l'esito con le sue parole — 200 =
 * credenziale sufficiente, 401 = non autorizzata. Non un controllo di forma
 * sulla stringa.
 *
 * ## Cosa fa, e cosa NON fa
 *
 * Chiede l'ELENCO DEI MODELLI al provider, con la credenziale salvata. È la
 * chiamata più economica che dimostri l'autenticazione: non genera token, non
 * costa nulla su nessuno dei provider qui elencati, e la risposta dice anche
 * quanti modelli quella chiave può vedere — che è l'altra metà della domanda.
 *
 * ⛔ Non prova che una GENERAZIONE riuscirà: una chiave valida può avere
 * credito esaurito o un modello negato. Prova che il provider ci riconosce, e
 * la UI non dice più di questo.
 *
 * ⛔ La chiave non esce mai da qui verso il browser: entra dal portachiavi,
 * viaggia nell'intestazione, e di ritorno va solo l'esito.
 */

/**
 * Come si chiede l'elenco dei modelli a ciascuno.
 *
 * ⛔ Una tabella e non un `if` per provider: quando se ne aggiunge uno, il
 * posto dove scriverlo è uno solo e si vede subito cosa manca. E ogni riga
 * dice come si autentica QUEL provider — sono tre schemi diversi (Bearer,
 * `x-api-key`, chiave in query), e confonderli è il modo tipico di ottenere
 * un 401 che sembra «chiave sbagliata» quando è «intestazione sbagliata».
 */
export const SONDE_PROVIDER = Object.freeze({
  openai: Object.freeze({ percorso: '/models', auth: 'bearer', conta: (c) => c?.data?.length }),
  deepseek: Object.freeze({ percorso: '/models', auth: 'bearer', conta: (c) => c?.data?.length }),
  openrouter: Object.freeze({ percorso: '/models', auth: 'bearer', conta: (c) => c?.data?.length }),
  anthropic: Object.freeze({ percorso: '/models', auth: 'x-api-key', conta: (c) => c?.data?.length }),
  gemini: Object.freeze({ percorso: '/models', auth: 'query', conta: (c) => c?.models?.length }),
  ollama: Object.freeze({ percorso: '/api/tags', auth: 'nessuna', conta: (c) => c?.models?.length }),
  huggingface: Object.freeze({ urlAssoluto: 'https://huggingface.co/api/whoami-v2', auth: 'bearer-facoltativo', conta: () => null }),
});

/** Gli esiti che la UI sa disegnare. Nessun altro valore esce da qui. */
export const ESITI_SONDA = Object.freeze(['collegato', 'non-autorizzato', 'irraggiungibile', 'non-provabile', 'errore']);

export class ProviderProbeError extends Error {
  constructor(message, code = 'PROVIDER_PROBE_FAILED') {
    super(message);
    this.name = 'ProviderProbeError';
    this.code = code;
  }
}

function urlDellaSonda(sonda, endpoint) {
  if (sonda.urlAssoluto) return sonda.urlAssoluto;
  if (typeof endpoint !== 'string' || endpoint.trim() === '') {
    throw new ProviderProbeError('provider endpoint is missing', 'PROVIDER_RUNTIME_INVALID');
  }
  return `${endpoint.replace(/\/+$/u, '')}${sonda.percorso}`;
}

/**
 * @param {object} deps
 * @param {(provider: string) => string|null} deps.leggiChiave dal portachiavi, mai dal browser
 * @param {(provider: string) => {endpoint: string|null, timeoutSeconds: number}} deps.leggiRuntime
 * @param {typeof fetch} [deps.fetchImpl]
 * @param {() => number} [deps.orologio] millisecondi monotoni, per la latenza
 */
export function createProviderProbe({ leggiChiave, leggiRuntime, fetchImpl = fetch, orologio = () => performance.now() } = {}) {
  if (typeof leggiChiave !== 'function' || typeof leggiRuntime !== 'function') {
    throw new ProviderProbeError('probe dependencies are invalid', 'PROVIDER_PROBE_MISCONFIGURED');
  }

  async function prova(provider) {
    const sonda = SONDE_PROVIDER[provider];
    if (!sonda) throw new ProviderProbeError(`unknown provider ${provider}`, 'PROVIDER_INVALID');

    const chiave = leggiChiave(provider);
    /*
     * ⛔ Senza chiave NON si chiama e NON si dice «non autorizzato»: non c'è
     * niente da autorizzare. «non-provabile» è un terzo stato, e serve —
     * confonderlo con un rifiuto manderebbe la persona a cercare una chiave
     * sbagliata invece di inserirne una.
     */
    if (sonda.auth !== 'nessuna' && sonda.auth !== 'bearer-facoltativo' && !chiave) {
      return { provider, esito: 'non-provabile', motivo: 'Nessuna chiave salvata per questo provider.', modelli: null, millisecondi: null };
    }

    const runtime = leggiRuntime(provider) || {};
    let url;
    try {
      url = urlDellaSonda(sonda, runtime.endpoint);
    } catch (errore) {
      return { provider, esito: 'non-provabile', motivo: 'Manca l\'indirizzo del provider.', modelli: null, millisecondi: null, codice: errore.code };
    }

    const intestazioni = { Accept: 'application/json' };
    if (sonda.auth === 'bearer' || (sonda.auth === 'bearer-facoltativo' && chiave)) intestazioni.Authorization = `Bearer ${chiave}`;
    if (sonda.auth === 'x-api-key') { intestazioni['x-api-key'] = chiave; intestazioni['anthropic-version'] = '2023-06-01'; }
    if (sonda.auth === 'query') url += `${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(chiave)}`;

    const secondi = Number.isFinite(runtime.timeoutSeconds) && runtime.timeoutSeconds > 0 ? runtime.timeoutSeconds : 60;
    // ⛔ Il tempo massimo è quello che la persona ha impostato per questo
    // provider, non una costante nostra: un pannello che ignora il proprio
    // campo insegna che quel campo non serve.
    const stop = AbortSignal.timeout(Math.min(secondi, 30) * 1_000);
    const partito = orologio();
    let risposta;
    try {
      risposta = await fetchImpl(url, { method: 'GET', headers: intestazioni, signal: stop });
    } catch (errore) {
      return {
        provider,
        esito: 'irraggiungibile',
        motivo: errore?.name === 'TimeoutError' ? `Nessuna risposta entro ${Math.min(secondi, 30)} secondi.` : 'Non è stato possibile raggiungere il provider.',
        modelli: null,
        millisecondi: Math.round(orologio() - partito),
      };
    }
    const millisecondi = Math.round(orologio() - partito);
    if (risposta.status === 401 || risposta.status === 403) {
      return { provider, esito: 'non-autorizzato', motivo: `Il provider ha rifiutato la credenziale (HTTP ${risposta.status}).`, modelli: null, millisecondi };
    }
    if (!risposta.ok) {
      return { provider, esito: 'errore', motivo: `Il provider ha risposto HTTP ${risposta.status}.`, modelli: null, millisecondi };
    }
    let corpo = null;
    try { corpo = await risposta.json(); } catch { corpo = null; }
    const modelli = Number(sonda.conta(corpo));
    return {
      provider,
      esito: 'collegato',
      motivo: Number.isFinite(modelli) && modelli >= 0
        ? `Credenziale accettata: ${modelli} modelli visibili.`
        : 'Credenziale accettata.',
      modelli: Number.isFinite(modelli) ? modelli : null,
      millisecondi,
    };
  }

  async function elencaModelli(provider) {
    if (!['openai', 'anthropic', 'gemini'].includes(provider)) throw new ProviderProbeError('Catalogo diretto non disponibile.', 'PROVIDER_INVALID');
    const key = leggiChiave(provider);
    if (!key) throw new ProviderProbeError('Inserisci la chiave nel pannello Provider.', 'PROVIDER_KEY_MISSING');
    const runtime = leggiRuntime(provider);
    const headers = { Accept: 'application/json' };
    if (provider === 'anthropic') { headers['x-api-key'] = key; headers['anthropic-version'] = '2023-06-01'; }
    else if (provider === 'gemini') headers['x-goog-api-key'] = key;
    else headers.Authorization = `Bearer ${key}`;
    const signal = AbortSignal.timeout(Math.min(runtime.timeoutSeconds || 30, 30) * 1000);
    const rows = []; const cursors = new Set(); let cursor;
    do {
      const url = new URL(urlDellaSonda(SONDE_PROVIDER[provider], runtime.endpoint));
      if (provider === 'gemini') { url.searchParams.set('pageSize', '1000'); if (cursor) url.searchParams.set('pageToken', cursor); }
      if (provider === 'anthropic') { url.searchParams.set('limit', '1000'); if (cursor) url.searchParams.set('after_id', cursor); }
      let response;
      try { response = await fetchImpl(url.toString(), { headers, signal, redirect: 'error' }); }
      catch { throw new ProviderProbeError('Catalogo del provider non raggiungibile.', 'CATALOG_UNREACHABLE'); }
      if (!response.ok) throw new ProviderProbeError(`Catalogo ${provider}: HTTP ${response.status}.`, 'CATALOG_UPSTREAM_ERROR');
      let data;
      try { data = await response.json(); }
      catch { throw new ProviderProbeError('Catalogo del provider non valido.', 'CATALOG_UPSTREAM_ERROR'); }
      const page = provider === 'gemini' ? data?.models : data?.data;
      if (!Array.isArray(page) || page.some(row => !row || typeof (provider === 'gemini' ? row.name : row.id) !== 'string')) throw new ProviderProbeError('Catalogo del provider non valido.', 'CATALOG_UPSTREAM_ERROR');
      if (provider === 'anthropic' && data.has_more === true && (typeof data.last_id !== 'string' || !data.last_id)) throw new ProviderProbeError('Paginazione del catalogo incompleta.', 'CATALOG_UPSTREAM_ERROR');
      rows.push(...page);
      cursor = provider === 'gemini' ? data.nextPageToken : provider === 'anthropic' && data.has_more ? data.last_id : null;
      if (cursor && (cursors.has(cursor) || cursors.size >= 20)) throw new ProviderProbeError('Paginazione del catalogo non valida.', 'CATALOG_UPSTREAM_ERROR');
      cursors.add(cursor);
    } while (cursor);
    const modelli = rows.filter(row => provider === 'gemini' ? row.supportedGenerationMethods?.includes('generateContent') && !/(tts|image)/u.test(row.name) : provider === 'openai' ? /^(gpt-|chatgpt-|o[1-9])/u.test(row.id) && !/(audio|realtime|transcribe|tts|image|codex|instruct)/u.test(row.id) : typeof row.id === 'string').map(row => {
      const id = provider === 'gemini' ? row.name.replace(/^models\//u, '') : row.id;
      return { id: `${provider}:${id}`, nome: row.display_name || row.displayName || id, provider,
        contextLength: row.max_input_tokens ?? row.inputTokenLimit ?? null,
        ...(row.capabilities?.image_input ? { inputModalities: row.capabilities.image_input.supported ? ['text','image'] : ['text'] } : {}),
      };
    });
    return { provider, modelli };
  }
  return Object.freeze({ prova, elencaModelli });
}
