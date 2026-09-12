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
 * La sonda ordinaria chiede l'ELENCO DEI MODELLI, quando documentato, senza
 * generare token. P-J: quando manca, lo dichiara; la sonda minima di generazione
 * si può eseguire solo passando consentiGenerazione: true. Può consumare quota
 * o credito e non viene attivata dalla rotta HTTP ordinaria.
 *
 * ⛔ Non prova che una GENERAZIONE riuscirà: una chiave valida può avere
 * credito esaurito o un modello negato. Prova che il provider ci riconosce, e
 * la UI non dice più di questo.
 *
 * ⛔ La chiave non esce mai da qui verso il browser: entra dal portachiavi,
 * viaggia nell'intestazione, e di ritorno va solo l'esito.
 */

import { ID_CON_CREDENZIALE, REGISTRO_FORNITORI, catalogoDiRiservaPer } from './provider-registry.mjs';
// P-K
import { destinazioneCloud } from './provider-auth-cloud.mjs';

/**
 * Come si chiede l'elenco dei modelli a ciascuno.
 *
 * ⛔ Una tabella e non un `if` per provider: quando se ne aggiunge uno, il
 * posto dove scriverlo è uno solo e si vede subito cosa manca. E ogni riga
 * dice come si autentica QUEL provider — sono tre schemi diversi (Bearer,
 * `x-api-key`, chiave in query), e confonderli è il modo tipico di ottenere
 * un 401 che sembra «chiave sbagliata» quando è «intestazione sbagliata».
 *
 * ⛔⛔ 12/09 — P-A: la tabella era GIÀ la forma giusta, e per questo non si riscrive: le si toglie
 *   il suo elenco e le si dà quello del registro (§6c dell'inventario). Il commento qui sopra
 *   prometteva «il posto dove scriverlo è uno solo» — era vero dentro questo file, e falso nel
 *   repo: gli stessi sette nomi stavano in altri dodici posti. Adesso la promessa è mantenuta.
 */
export const SONDE_PROVIDER = Object.freeze(Object.fromEntries(ID_CON_CREDENZIALE.map((id) => {
  const sonda = REGISTRO_FORNITORI[id].sonda;
  return [id, Object.freeze({
    ...(sonda.urlAssoluto ? { urlAssoluto: sonda.urlAssoluto } : { percorso: sonda.percorso }),
    auth: sonda.auth,
    attiva: sonda.attiva !== false,
    conta: sonda.conta,
    ...(sonda.dallaRadice ? { dallaRadice: true } : {}),
    ...(sonda.catalogoPubblico ? { catalogoPubblico: true } : {}),
    // P-J — descrizione della sonda minima, mai un'autorizzazione implicita a generare.
    ...(sonda.richiestaMinima ? { richiestaMinima: sonda.richiestaMinima } : {}),
  })];
})));

/**
 * Gli esiti che la UI sa disegnare. Nessun altro valore esce da qui.
 *
 * ⛔ `non-sondabile` è il sesto, aggiunto il 12/09 col registro: è il fornitore il cui elenco
 *   modelli risponde 401 **anche con una chiave buona** (in Hermes è il caso Xiaomi MiMo,
 *   `supports_health_check=False`). Senza quello stato la sonda **accuserebbe una chiave valida**
 *   — cioè esattamente il difetto contro cui questa sonda è nata. Oggi nessuno dei nostri lo
 *   dichiara: la riga esiste perché il primo che lo farà non debba inventarsi uno stato.
 */
export const ESITI_SONDA = Object.freeze(['collegato', 'non-autorizzato', 'irraggiungibile', 'non-provabile', 'non-sondabile', 'errore']);

/**
 * I fornitori il cui catalogo si chiede **a loro**, e che hanno una scheda propria nel selettore.
 *
 * ⛔ Era un array letterale dentro la funzione — `['openai','anthropic','gemini']`, il terzo dei
 *   tredici elenchi. Adesso è il registro a dirlo: `catalogo.inUI` (ha una scheda) più
 *   `catalogo.fonte === 'fornitore'` (il catalogo arriva dalla sua API, non da un motore locale —
 *   LM Studio ha la scheda ma il suo elenco lo dà il runtime che lo carica e lo scarica già).
 */
export const CATALOGHI_DIRETTI = Object.freeze(
  Object.values(REGISTRO_FORNITORI).filter((r) => r.catalogo?.inUI === true && r.catalogo?.fonte === 'fornitore').map((r) => r.id),
);

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
  if (sonda.dallaRadice) return new URL(sonda.percorso, endpoint).toString();
  return `${endpoint.replace(/\/+$/u, '')}${sonda.percorso}`;
}

/** P-I: catalogo nativo DashScope v1; HTTP 200 non basta se il corpo dichiara un errore. */
function paginaDashScope(corpo, numero = 1) {
  const p = corpo?.output;
  if (corpo?.success !== true || !p || !Number.isSafeInteger(p.total) || p.total < 0
    || p.page_no !== numero || !Number.isSafeInteger(p.page_size) || p.page_size < 1
    || !Array.isArray(p.models) || p.models.length > p.page_size || p.models.length > p.total
    || (p.total > 0 && !p.models.length)
    || p.models.some(m => !m || typeof m.model !== 'string' || !m.model.trim())
    || new Set(p.models.map(m => m.model)).size !== p.models.length) {
    throw new ProviderProbeError('Qwen: pagina del catalogo non valida o incompleta.', 'CATALOG_UPSTREAM_ERROR');
  }
  return p;
}

/**
 * @param {object} deps
 * @param {(provider: string) => string|null} deps.leggiChiave dal portachiavi, mai dal browser
 * @param {(provider: string) => {endpoint: string|null, timeoutSeconds: number}} deps.leggiRuntime
 * @param {typeof fetch} [deps.fetchImpl]
 * @param {() => number} [deps.orologio] millisecondi monotoni, per la latenza
 * @param {Record<string,object>} [deps.sonde] la tabella delle sonde. ⛔ Iniettabile per UNA
 *   ragione sola: lo stato `non-sondabile` deve poter essere provato PRIMA che esista un
 *   fornitore che lo dichiara — una guardia che nessuno sa far scattare è una guardia che nessuno
 *   sa se funziona. In produzione resta sempre quella del registro.
 */
export function createProviderProbe({ leggiChiave, leggiRuntime, fetchImpl = fetch, orologio = () => performance.now(), sonde = SONDE_PROVIDER } = {}) {
  if (typeof leggiChiave !== 'function' || typeof leggiRuntime !== 'function') {
    throw new ProviderProbeError('probe dependencies are invalid', 'PROVIDER_PROBE_MISCONFIGURED');
  }

  async function prova(provider, { consentiGenerazione = false } = {}) { // P-J: opzione solo esplicita.
    const sonda = sonde[provider];
    if (!sonda) throw new ProviderProbeError(`unknown provider ${provider}`, 'PROVIDER_INVALID');
    const record = REGISTRO_FORNITORI[provider];
    const etichetta = record?.etichetta ?? 'Il fornitore';

    /*
     * ⛔ Chi dichiara di non essere sondabile NON viene chiamato: zero richieste, e lo si dice.
     *   Una sonda che parte comunque su un `/models` che risponde 401 per progetto restituirebbe
     *   «credenziale rifiutata» su una chiave buona.
     */
    if (sonda.attiva === false && !sonda.richiestaMinima) {
      return { provider, esito: 'non-sondabile', motivo: 'Questo fornitore non espone un elenco modelli su cui provare la credenziale.', modelli: null, millisecondi: null };
    }

    const chiave = leggiChiave(provider);
    /*
     * ⛔ Senza chiave NON si chiama e NON si dice «non autorizzato»: non c'è
     * niente da autorizzare. «non-provabile» è un terzo stato, e serve —
     * confonderlo con un rifiuto manderebbe la persona a cercare una chiave
     * sbagliata invece di inserirne una.
     */
    if (sonda.auth !== 'nessuna' && sonda.auth !== 'bearer-facoltativo' && !chiave) {
      return { provider, esito: 'non-provabile', motivo: `Nessuna chiave salvata per ${etichetta}.`, modelli: null, millisecondi: null };
    }

    // P-J — l'azione ordinaria resta senza generazione. Solo il chiamante che dichiara
    // il consenso può eseguire il POST minimo della sonda, separato dalle chat del kernel.
    const minima = sonda.richiestaMinima;
    if (minima && consentiGenerazione !== true) {
      return { provider, esito: 'non-sondabile', motivo: `${etichetta}: non è documentato un elenco modelli per verificare la chiave. La prova minima richiede una generazione con limite di un token e può consumare credito o quota; occorre richiederla esplicitamente.`, modelli: null, millisecondi: null };
    }

    const runtime = leggiRuntime(provider) || {};
    let url;
    // P-K — la costruzione è condivisa con il trasporto, compresa l'eventuale scadenza.
    let cloud;
    if (record?.cloud) {
      try { cloud = destinazioneCloud(provider, runtime, chiave, null, { catalogo: true }); }
      catch (errore) { return { provider, esito: 'non-provabile', motivo: errore.message, codice: errore.code, modelli: null, millisecondi: null }; }
    }
    // P-K — fine
    try {
      url = cloud?.url ?? urlDellaSonda(minima ?? sonda, runtime.endpoint); // P-J (richiesta minima) + P-K (indirizzo cloud)
    } catch (errore) {
      return { provider, esito: 'non-provabile', motivo: `Manca l'indirizzo di ${etichetta}.`, modelli: null, millisecondi: null, codice: errore.code };
    }

    const intestazioni = { Accept: 'application/json' };
    if (sonda.auth === 'bearer' || (sonda.auth === 'bearer-facoltativo' && chiave)) intestazioni.Authorization = `Bearer ${chiave}`;
    if (sonda.auth === 'x-api-key') { intestazioni['x-api-key'] = chiave; intestazioni['anthropic-version'] = '2023-06-01'; }
    // P-J — versione anche per la porta Anthropic autenticata con Bearer.
    if (record?.wire === 'anthropic-messages') intestazioni['anthropic-version'] = '2023-06-01';
    if (minima) intestazioni['Content-Type'] = 'application/json';
    if (sonda.auth === 'query') url += `${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(chiave)}`;
    // P-K — una chiave Azure e un token Entra usano intestazioni diverse.
    if (cloud) { for (const key of Object.keys(intestazioni)) delete intestazioni[key]; Object.assign(intestazioni, { Accept: 'application/json' }, cloud.headers); }
    // P-K — fine

    const secondi = Number.isFinite(runtime.timeoutSeconds) && runtime.timeoutSeconds > 0 ? runtime.timeoutSeconds : 60;
    // ⛔ Il tempo massimo è quello che la persona ha impostato per questo
    // provider, non una costante nostra: un pannello che ignora il proprio
    // campo insegna che quel campo non serve.
    const stop = AbortSignal.timeout(Math.min(secondi, 30) * 1_000);
    const partito = orologio();
    let risposta;
    try {
      risposta = await fetchImpl(url, { method: minima ? 'POST' : 'GET', ...(minima ? { body: JSON.stringify(minima.corpo) } : {}), headers: intestazioni, signal: stop, redirect: 'error' }); // P-J
    } catch (errore) {
      return {
        provider,
        esito: 'irraggiungibile',
        motivo: errore?.name === 'TimeoutError' ? `${etichetta}: nessuna risposta entro ${Math.min(secondi, 30)} secondi.` : `Non è stato possibile raggiungere ${etichetta}.`,
        modelli: null,
        millisecondi: Math.round(orologio() - partito),
      };
    }
    const millisecondi = Math.round(orologio() - partito);
    if (risposta.status === 401 || risposta.status === 403) {
      // P-K — un 403 non dimostra una chiave errata; può essere il permesso del progetto/modello.
      if (record?.cloud) return { provider, esito: 'non-autorizzato', motivo: risposta.status === 401
        ? `${etichetta}: credenziale non accettata (HTTP 401).`
        : `${etichetta}: accesso negato (HTTP 403); controlla i permessi.`, modelli: null, millisecondi, httpStatus: risposta.status };
      // P-K — fine
      return { provider, esito: 'non-autorizzato', motivo: `${etichetta} ha rifiutato la credenziale (HTTP ${risposta.status}).`, modelli: null, millisecondi, httpStatus: risposta.status };
    }
    if (!risposta.ok) {
      const motivo = risposta.status === 404
        ? `${etichetta}: ${minima ? 'endpoint di verifica' : 'elenco modelli'} non trovato (HTTP 404). La validità della chiave non è verificata da questa risposta.`
        : `${etichetta} ha risposto HTTP ${risposta.status}.`;
      return { provider, esito: 'errore', motivo, modelli: null, millisecondi, httpStatus: risposta.status };
    }
    let corpo = null;
    try { corpo = await risposta.json(); } catch { corpo = null; }
    // P-J — 200 senza una risposta Messages riconoscibile non verifica la chiave.
    if (minima) {
      const valida = corpo?.type === 'message' && corpo.role === 'assistant' && typeof corpo.id === 'string'
        && Array.isArray(corpo.content) && typeof corpo.usage?.input_tokens === 'number' && Number.isFinite(corpo.usage.input_tokens);
      return { provider, esito: valida ? 'collegato' : 'errore',
        motivo: valida ? `${etichetta}: richiesta minima di generazione riuscita; elenco modelli non verificato.` : `${etichetta}: risposta HTTP ${risposta.status} senza un messaggio valido; credenziale non verificata.`,
        modelli: null, millisecondi, httpStatus: risposta.status };
    }
    let catalogoValido = true;
    if (record?.catalogo.forma === 'dashscope-output') {
      try { paginaDashScope(corpo); } catch { catalogoValido = false; }
    } else if (record?.sonda.richiedeCatalogoValido) {
      catalogoValido = Array.isArray(corpo?.data) && corpo.data.every(m => m && typeof m.id === 'string' && m.id.trim());
    }
    if (!catalogoValido) {
      return { provider, esito: 'errore', motivo: `${etichetta}: risposta HTTP ${risposta.status} senza un elenco modelli valido; credenziale non verificata.`, modelli: null, millisecondi, httpStatus: risposta.status };
    }
    const modelli = Number(sonda.conta(corpo));
    return {
      provider,
      esito: 'collegato',
      ...(sonda.catalogoPubblico ? { credenzialeVerificata: false } : {}),
      motivo: sonda.catalogoPubblico
        ? `${etichetta}: catalogo pubblico raggiunto, ${modelli} modelli visibili; chiave non verificata. La generazione non è stata provata.`
        : Number.isFinite(modelli) && modelli >= 0
        ? `${etichetta}: catalogo raggiunto, ${modelli} modelli visibili${record?.catalogo.forma === 'dashscope-output' ? ' nella prima pagina' : ''}. La generazione non è stata provata.`
        : `${etichetta}: credenziale accettata.`,
      modelli: Number.isFinite(modelli) ? modelli : null,
      millisecondi,
      httpStatus: risposta.status,
    };
  }

  async function elencaModelli(provider) {
    if (!CATALOGHI_DIRETTI.includes(provider)) throw new ProviderProbeError('Catalogo diretto non disponibile.', 'PROVIDER_INVALID');
    const record = REGISTRO_FORNITORI[provider];
    const etichetta = record.etichetta;
    const key = leggiChiave(provider);
    if (!key) throw new ProviderProbeError(`Inserisci la chiave ${etichetta} nel pannello Provider.`, 'PROVIDER_KEY_MISSING');
    // P-J — nessun catalogo remoto documentato: nessuna generazione o GET sostitutivo.
    if (record.sonda.richiestaMinima) {
      const riserva = catalogoDiRiservaPer(provider);
      return { provider, fonte: 'documentazione', credenzialeVerificata: false,
        avviso: `${etichetta}: elenco dalla documentazione del ${record.data}; accesso ai modelli non verificato.`,
        modelli: riserva.modelli };
    }
    const runtime = leggiRuntime(provider);
    // P-J — il wire governa auth/paginazione anche quando il nome non è «anthropic».
    const catalogoAnthropic = record.wire === 'anthropic-messages';
    // P-K — il catalogo Azure elenca modelli base, non i nomi delle distribuzioni dell'owner.
    // Vertex non documenta GET /models sul percorso compatibile: non si inventa una sonda.
    if (record.cloud && provider !== 'bedrock') throw new ProviderProbeError(provider === 'azure'
      ? 'Azure AI Foundry: indica il nome della distribuzione configurata nella tua risorsa; il catalogo dei modelli non elenca le tue distribuzioni.'
      : 'Google Vertex AI: indica un modello abilitato nel progetto; il catalogo non è disponibile da questo collegamento.', 'CATALOG_CONFIGURATION_REQUIRED');
    const cloud = record.cloud ? destinazioneCloud(provider, runtime, key, null, { catalogo: true }) : null;
    // P-K — fine
    const headers = { Accept: 'application/json' };
    if (catalogoAnthropic) {
      if (record.auth.tipo === 'bearer') headers.Authorization = `Bearer ${key}`;
      else headers[record.auth.header] = key;
      headers['anthropic-version'] = '2023-06-01';
    }
    else if (provider === 'gemini') headers['x-goog-api-key'] = key;
    else headers.Authorization = `Bearer ${key}`;
    // P-K
    if (cloud) Object.assign(headers, cloud.headers);
    const signal = AbortSignal.timeout(Math.min(runtime.timeoutSeconds || 30, 30) * 1000);
    const rows = []; const cursors = new Set(); let cursor;
    const dashscope = record.catalogo.forma === 'dashscope-output';
    let numeroPagina = 1; let totaleAtteso;
    do {
      const url = new URL(cloud?.url ?? urlDellaSonda(SONDE_PROVIDER[provider], runtime.endpoint));
      if (dashscope) url.searchParams.set('page_no', String(numeroPagina));
      if (provider === 'gemini') { url.searchParams.set('pageSize', '1000'); if (cursor) url.searchParams.set('pageToken', cursor); }
      if (catalogoAnthropic) { url.searchParams.set('limit', '1000'); if (cursor) url.searchParams.set('after_id', cursor); }
      let response;
      try { response = await fetchImpl(url.toString(), { headers, signal, redirect: 'error' }); }
      catch { throw new ProviderProbeError(`Catalogo ${etichetta} non raggiungibile.`, 'CATALOG_UNREACHABLE'); }
      if (response.status === 404 && record.catalogo.ripiegoSu404 === 'documentazione') {
        return { provider, fonte: 'documentazione', credenzialeVerificata: false,
          avviso: `${etichetta}: catalogo remoto HTTP 404; elenco dalla documentazione del ${record.prezzi.data}, accesso ai modelli non verificato.`,
          modelli: record.modelliNoti.map(m => ({ ...metadatiNoti(record, m.id), id: `${provider}:${m.id}`, provider, nome: `${m.nome} · catalogo documentato`, fonte: 'documentazione' })),
        };
      }
      if (!response.ok) throw new ProviderProbeError(`Catalogo ${etichetta}: HTTP ${response.status}.`, 'CATALOG_UPSTREAM_ERROR');
      let data;
      try { data = await response.json(); }
      catch { throw new ProviderProbeError(`Catalogo ${etichetta} non valido.`, 'CATALOG_UPSTREAM_ERROR'); }
      if (dashscope) {
        const pagina = paginaDashScope(data, numeroPagina);
        if ((totaleAtteso !== undefined && totaleAtteso !== pagina.total)
          || rows.length + pagina.models.length > pagina.total
          || pagina.models.some(m => rows.some(r => r.id === m.model))) {
          throw new ProviderProbeError('Qwen: paginazione del catalogo incoerente.', 'CATALOG_UPSTREAM_ERROR');
        }
        totaleAtteso = pagina.total;
        rows.push(...pagina.models.map(m => ({ id: m.model, display_name: m.name })));
        cursor = rows.length < totaleAtteso ? ++numeroPagina : null;
        if (cursor > 20) throw new ProviderProbeError('Qwen: catalogo incompleto dopo venti pagine.', 'CATALOG_UPSTREAM_ERROR');
        continue;
      }
      const page = provider === 'gemini' ? data?.models : data?.data;
      if (!Array.isArray(page) || page.some(row => !row || typeof (provider === 'gemini' ? row.name : row.id) !== 'string')) throw new ProviderProbeError(`Catalogo ${etichetta} non valido.`, 'CATALOG_UPSTREAM_ERROR');
      if (catalogoAnthropic && data.has_more === true && (typeof data.last_id !== 'string' || !data.last_id)) throw new ProviderProbeError('Paginazione del catalogo incompleta.', 'CATALOG_UPSTREAM_ERROR');
      rows.push(...page);
      cursor = provider === 'gemini' ? data.nextPageToken : catalogoAnthropic && data.has_more ? data.last_id : null;
      if (cursor && (cursors.has(cursor) || cursors.size >= 20)) throw new ProviderProbeError('Paginazione del catalogo non valida.', 'CATALOG_UPSTREAM_ERROR');
      cursors.add(cursor);
    } while (cursor);
    const modelli = rows.filter(row => provider === 'gemini' ? row.supportedGenerationMethods?.includes('generateContent') && !/(tts|image)/u.test(row.name) : provider === 'openai' ? /^(gpt-|chatgpt-|o[1-9])/u.test(row.id) && !/(audio|realtime|transcribe|tts|image|codex|instruct)/u.test(row.id) : typeof row.id === 'string').map(row => {
      const id = provider === 'gemini' ? row.name.replace(/^models\//u, '') : row.id;
      const noti = metadatiNoti(record, id);
      return { ...noti, id: `${provider}:${id}`, nome: row.display_name || row.displayName || noti.nome || id, provider,
        contextLength: row.max_input_tokens ?? row.inputTokenLimit ?? noti.contextLength ?? null,
        ...(row.capabilities?.image_input ? { inputModalities: row.capabilities.image_input.supported ? ['text','image'] : ['text'] } : {}),
      };
    });
    return { provider, modelli };
  }
  return Object.freeze({ prova, elencaModelli });
}

/** Metadati dichiarati, mai trasformati in misure della chiamata o prezzi osservati. */
function metadatiNoti(record, id) {
  const modello = record.modelliNoti?.find(m => m.id === id);
  if (!modello) return {};
  return { nome: modello.nome, contextLength: modello.contextLength, contestoDichiarato: modello.contestoDichiarato,
    fonteMetadati: modello.fonte, dataMetadati: modello.data, maxOutputTokens: modello.maxOutputTokens,
    prezzi: { ...record.prezzi, ...modello.prezzi }, ragionamento: modello.ragionamento, cache: record.cache.etichetta,
    reasoning: { supportedEfforts: modello.ragionamento.livelli,
      defaultEffort: modello.ragionamento.livelli.includes('max') ? 'max' : null,
      defaultEnabled: true, mandatory: !modello.ragionamento.thinking.includes('disabled') },
  };
}
