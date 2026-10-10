/**
 * Dove vive un modello, e come gli si parla.
 *
 * ## Perché esiste
 *
 * Owner, 03/9: «se non riesco ad aggiungere più provider oltre a OpenRouter e
 * soprattutto usare i modelli locali, l'applicazione è spacciata». E prima:
 * «non è un limite quello che mi hai detto tu, è un finto limite».
 *
 * Aveva ragione, e la misura lo dimostra: nel kernel c'era UNA sola chiamata
 * cablata (riga 406 della copia caricata dal desktop, 392 di quella mobile) —
 * una stringa, non un'architettura. E sulla macchina dell'owner erano già
 * salvate CINQUE credenziali funzionanti, misurate il 03/9 contro i servizi
 * veri: OpenRouter 424 modelli, OpenAI 124, Gemini 50, Anthropic 11,
 * DeepSeek 3. Cinque provider pagati e fermi, perché nessuno li chiamava.
 *
 * ## Il fatto che rende la cura piccola
 *
 * Quasi tutti parlano GIÀ lo stesso protocollo: `POST /v1/chat/completions`
 * con `Authorization: Bearer`, stesso corpo. Vale per OpenAI, DeepSeek,
 * OpenRouter, Ollama e — verificato in `local-runtime-llama-server.mjs`, che
 * chiama esattamente quell'endpoint — anche per llama.cpp in locale.
 * ⇒ Per i modelli LOCALI e altri quattro provider basta cambiare indirizzo e
 * intestazioni. Nessuna traduzione del corpo, nessun adattatore nuovo.
 *
 * Anthropic e Gemini usano native-provider-adapter con SDK fissati nel lock:
 * /v1/messages e :generateContent, immagini e firme di ragionamento native.
 *
 * ## La convenzione sul nome, e perché i DUE PUNTI
 *
 * Gli id OpenRouter sono già `autore/modello` (`deepseek/deepseek-v4-flash`),
 * quindi lo slash è occupato e non può separare la fonte. Si usa il carattere
 * `:` come prefisso — `local:qwen3-0.6b-…`, `ollama:llama3.2` — e
 * **nessun prefisso significa OpenRouter**, così tutto ciò che esiste oggi
 * continua a funzionare identico, senza migrare una sola sessione salvata.
 */

import { ID_DESTINAZIONE_CHAT, ID_NATIVI_SDK, REGISTRO_FORNITORI, idPerWire } from './provider-registry.mjs';
// P-K
import { destinazioneCloud } from './provider-auth-cloud.mjs';
// P-K — fine
import { OpenAiCompatibleRuntimeError, preparaRichiestaCompatibile } from './openai-compatible-runtime.mjs'; // A9: il livello del filo lo misura il traduttore stesso

export class ModelDestinationError extends Error {
  constructor(message, code = 'MODEL_DESTINATION_INVALID') {
    super(message);
    this.name = 'ModelDestinationError';
    this.code = code;
  }
}

/**
 * Le fonti riconosciute nel prefisso. ⛔ Tutto il resto è un id OpenRouter.
 *
 * ⛔ 12/09 — P-A: era un array scritto a mano, e `config.mjs:186` ne teneva una **copia dentro una
 *   stringa di regex**. Adesso tutte e due si derivano dal registro: aggiungere `lmstudio` è stata
 *   una riga di dato, non sette modifiche sparse (P-C).
 */
export const FONTI_MODELLO = ID_DESTINAZIONE_CHAT;

/**
 * Spacca `fonte:modello`. ⛔ Solo sul PRIMO due punti, e solo se ciò che sta
 * davanti è una fonte conosciuta: un id che contenesse un `:` per altri motivi
 * non deve essere dirottato su un provider inesistente.
 */
export function separaFonteModello(modello) {
  if (typeof modello !== 'string' || modello.trim() === '') {
    throw new ModelDestinationError('model id is missing', 'MODEL_DESTINATION_INVALID');
  }
  const taglio = modello.indexOf(':');
  if (taglio > 0) {
    const fonte = modello.slice(0, taglio);
    if (FONTI_MODELLO.includes(fonte)) return { fonte, modelloRemoto: modello.slice(taglio + 1) };
  }
  return { fonte: 'openrouter', modelloRemoto: modello };
}

/**
 * ⛔ BUG-7 cura3 (05/10/2026, revisore D2): i livelli di ragionamento documentati per le
 * sessioni DIRETTE si leggono dal REGISTRO dei fornitori, non dal catalogo OpenRouter —
 * che dichiarava «low» per glm-5.3-flash mentre il profilo AVM lo rifiutava di proposito:
 * la pillola ricreava il sintomo. ⛔ BUG-18 (05/10): il profilo ora DOCUMENTA «low»
 * (['low','high','max'], fonte docs.z.ai) — la divergenza col catalogo è svanita e la fonte
 * resta il registro. Forma:
 * `{ zai: { '*': ['low','high','max'], 'glm-5.3-flash': ['low','high','max'] }, … }` — `'*'` è il livello
 * documentato a livello di PROFILO (il vincolo P-D), vale per i modelli senza voce propria.
 * Solo fonti che il nostro traduttore traduce davvero (`COMPATIBILI_OPENAI`): per le altre
 * la UI non può promettere livelli. Servita accanto al catalogo su `/api/v1/models`
 * (http-app.mjs) così il frontend fa UNA sola GET.
 */
export function livelliRagionamentoDiretti() {
  const mappa = {};
  for (const fonte of COMPATIBILI_OPENAI) {
    if (fonte === 'openrouter') continue; // i suoi livelli restano nel catalogo
    const record = REGISTRO_FORNITORI[fonte];
    if (!record) continue;
    const perModello = {};
    const profilo = record.ragionamento?.livelli;
    if (Array.isArray(profilo) && profilo.length) perModello['*'] = Object.freeze([...profilo]);
    const modelli = record.richiestaCompatibile?.modelli;
    if (modelli && typeof modelli === 'object') {
      for (const [id, m] of Object.entries(modelli)) {
        const livelli = m?.livelliRagionamento;
        if (Array.isArray(livelli) && livelli.length) perModello[id] = Object.freeze([...livelli]);
      }
    }
    for (const m of record.modelliNoti ?? []) {
      const livelli = m?.ragionamento?.livelli;
      if (Array.isArray(livelli) && livelli.length && typeof m?.id === 'string') perModello[m.id] = Object.freeze([...livelli]);
    }
    if (Object.keys(perModello).length) mappa[fonte] = Object.freeze(perModello);
  }
  return mappa;
}

/* Un id che nessun registro conosce: la voce `'*'` si misura come la vede il traduttore per un modello senza voce propria. */
const ID_SENZA_VOCE = '\u0000senza-voce';
const LIVELLI_DA_MISURARE = Object.freeze(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);

/**
 * ⛔ A9 (owner 09/10/2026, «la pillola mostra il livello INVIATO al fornitore») — per ogni modello di
 * `livelliRagionamentoDiretti()`, che cosa arriva DAVVERO sul filo per ogni livello chiesto: lo dice il
 * traduttore stesso (`preparaRichiestaCompatibile`, lo stesso che il ponte chiama prima della rete), mai
 * una seconda copia delle regole. Misurato il 09/10 su r4: «xhigh» su glm-5.3-flash parte «max» (alias)
 * mentre la pillola mostrava «Alto»; «Spento» parte «low» (il modello non si spegne); un modello Z.AI senza
 * voce propria non riceve nessun livello mentre la pillola ne offriva tre. Forma:
 * `{ zai: { 'glm-5.3-flash': { none: 'low', xhigh: 'max', … }, '*': { high: null, … } }, … }` — `null` =
 * nessun livello inviato (decide il fornitore). Come Hermes, che calcola sul server il livello del filo e
 * lo dà alla pillola (`tui_gateway/server.py:2381-2387`, `reasoning_effort_wire`). Servita accanto a
 * `livelliDiretti` su `/api/v1/models`.
 */
export function filoRagionamentoDiretti() {
  const mappa = {};
  for (const [fonte, perModello] of Object.entries(livelliRagionamentoDiretti())) {
    const filo = {};
    for (const modello of Object.keys(perModello)) {
      const perLivello = {};
      for (const chiesto of LIVELLI_DA_MISURARE) {
        let corpo;
        try {
          ({ corpo } = preparaRichiestaCompatibile(fonte, { model: modello === '*' ? ID_SENZA_VOCE : modello, messages: [], reasoning: { effort: chiesto } }));
        } catch (errore) {
          /* il traduttore RIFIUTA questo livello: nessuna promessa. ⛔ Solo il suo rifiuto (review A9 del desktop, «il catch giusto
             nasconde il bug sbagliato»): un altro errore è un guasto vero, e trasformarlo in «Automatico» su ogni pillola lo
             nasconderebbe. */
          if (errore instanceof OpenAiCompatibleRuntimeError) continue;
          throw errore;
        }
        const effort = corpo?.reasoning_effort ?? corpo?.reasoning?.effort;
        perLivello[chiesto] = typeof effort === 'string' ? effort : corpo?.thinking?.type === 'disabled' ? 'none' : null;
      }
      filo[modello] = Object.freeze(perLivello);
    }
    mappa[fonte] = Object.freeze(filo);
  }
  return mappa;
}

/** Lista di sessione: solo identificatori, mai indirizzi, chiavi o capacità dichiarate dal client. */
export function validaFallbackProviders(lista = [], { usaAttrezzi = false } = {}) {
  const invalida = () => { throw new ModelDestinationError('Check the providers and models chosen to continue the session.', 'PROVIDER_FALLBACK_INVALID'); };
  if (!Array.isArray(lista) || lista.length > 8) invalida();
  const viste = new Set();
  return lista.map(voce => {
    if (!voce || typeof voce !== 'object' || Array.isArray(voce) || Object.keys(voce).some(k => !['provider', 'model'].includes(k))) invalida();
    const { provider, model } = voce;
    const record = Object.hasOwn(REGISTRO_FORNITORI, provider) ? REGISTRO_FORNITORI[provider] : null;
    if (!record?.destinazioneChat || !record.credenziale || typeof model !== 'string' || model.length > 200 || !/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]*$/u.test(model) || model.includes('://') || FONTI_MODELLO.some(p => model.startsWith(`${p}:`))) invalida();
    const id = `${provider}:${model}`;
    if (viste.has(id)) invalida();
    viste.add(id);
    if (usaAttrezzi && record.modelliDiRiserva?.find(m => m.id === model)?.toolCalling !== true) {
      throw new ModelDestinationError('The fallback model does not declare support for the session tools.', 'PROVIDER_FALLBACK_TOOLS_UNSUPPORTED');
    }
    return Object.freeze({ provider, model });
  });
}

/**
 * Chi parla `POST {base}{percorso}` con Bearer: il corpo non si tocca.
 * ⛔ `wire: 'locale'` sta qui dentro perché il supervisore espone lo stesso protocollo — ma esce
 *   prima, sulla sua strada: la sua chiave non deve passare da questo file.
 */
const COMPATIBILI_OPENAI = Object.freeze([...idPerWire('openai-chat'), ...idPerWire('locale')]);

/**
 * Chi NON lo parla, e cosa gli servirebbe. ⛔ Il messaggio dice la cosa vera —
 * la credenziale può essere ottima, manca la traduzione dalla nostra parte —
 * perché un errore che sembra colpa della chiave manda a rigenerarne una buona.
 *
 * ⛔ Sono i tre wire serviti dagli SDK fissati nel lock (`native-provider-adapter.mjs`): il
 *   registro li nomina uno per uno, così «nativo» smette di essere una lista da ricordare.
 */
const NATIVI = ID_NATIVI_SDK;

/**
 * @param {string} modello id, con o senza prefisso di fonte
 * @param {object} deps
 * @param {(fonte: string) => string|null} deps.leggiChiave dal portachiavi
 * @param {(fonte: string) => {endpoint?: string|null}} deps.leggiRuntime indirizzo configurato
 * @param {() => boolean} [deps.localePronto] il motore locale è acceso adesso?
 * @returns {{fonte: string, url: string, headers: Record<string,string>, modelloRemoto: string}}
 */
export function risolviDestinazioneModello(modello, { leggiChiave, leggiRuntime, localePronto = () => false } = {}) {
  if (typeof leggiChiave !== 'function' || typeof leggiRuntime !== 'function') {
    throw new ModelDestinationError('destination dependencies are invalid', 'MODEL_DESTINATION_MISCONFIGURED');
  }
  const { fonte, modelloRemoto } = separaFonteModello(modello);

  // P-L · nessuna chiave, nessun endpoint scelto dal browser e nessun ripiego remoto.
  if (REGISTRO_FORNITORI[fonte]?.wire === 'acp') {
    let runtime = null;
    try { runtime = leggiRuntime(fonte); }
    catch (e) { if (e?.code !== 'PROVIDER_INVALID') throw e; }
    return { fonte, modelloRemoto, esterno: true, runtime };
  }
  // P-L · fine destinazione agente esterno.

  if (!COMPATIBILI_OPENAI.includes(fonte) && !NATIVI.includes(fonte)) throw new ModelDestinationError(`Model source not recognized: ${fonte}`, 'MODEL_DESTINATION_INVALID');

  if (fonte === 'local') {
    /*
     * ⛔⛔ IL MOTORE LOCALE VUOLE UNA CHIAVE — misurato, non dedotto.
     *
     * La prima stesura costruiva l'URL a mano e non mandava credenziali,
     * ragionando che «127.0.0.1 non ha autenticazione». Provato dal vivo
     * contro il runtime acceso: **HTTP 401, "Invalid API Key" in 4 ms**.
     * `llama-server-supervisor.mjs` genera `randomBytes(32)` a ogni avvio e
     * lo passa come `--api-key`; la chiave vive solo lì dentro, e `status()`
     * NON la espone — giustamente, perché quella risposta finisce nel
     * browser.
     *
     * ⇒ Non si copia il segreto qui: si passa dal `request()` del
     * supervisore, che è il punto in cui la chiave già sta. Il risolutore
     * dice SOLO che la destinazione è locale e che il motore è pronto; a
     * spedire ci pensa chi possiede la credenziale.
     */
    if (typeof localePronto !== 'function' || !localePronto()) {
      throw new ModelDestinationError('The local engine is not running: load it from the Model Lab before using it in chat.', 'LOCAL_RUNTIME_NOT_READY');
    }
    return { fonte, modelloRemoto, locale: true, percorso: REGISTRO_FORNITORI[fonte].endpoint.chat };
  }

  const runtime = leggiRuntime(fonte) || {};
  const record = REGISTRO_FORNITORI[fonte];
  const base = typeof runtime.endpoint === 'string' && runtime.endpoint.trim() !== '' ? runtime.endpoint.replace(/\/+$/u, '') : null;
  if (!base) throw new ModelDestinationError(`The address for ${record.etichetta} is missing.`, 'PROVIDER_RUNTIME_INVALID');

  const chiave = leggiChiave(fonte);
  /*
   * ⛔ Ollama e LM Studio girano in casa e non hanno account: pretendere una
   * chiave li escluderebbe per una regola che non li riguarda. Gli altri sì, e
   * senza si dice CHE COSA manca invece di partire e prendersi un 401.
   * ⛔ 12/09 — la domanda non è più «è ollama?»: è `chiaveObbligatoria` sul record. Erano due
   *   verità diverse (`requiresKey` nel portachiavi diceva già `false` per Ollama, e qui c'era un
   *   confronto per nome), e ora è una sola.
   */
  if (record.chiaveObbligatoria === true && (typeof chiave !== 'string' || chiave.trim() === '')) {
    throw new ModelDestinationError(`The key for ${record.etichetta} is missing: enter it in Model Lab → Providers.`, 'PROVIDER_KEY_MISSING');
  }

  // P-K — lo stesso contratto di autenticazione per chat e sonda.
  if (record.cloud) return destinazioneCloud(fonte, runtime, chiave, modelloRemoto);
  // P-K — fine
  if (NATIVI.includes(fonte)) return { fonte, modelloRemoto, native: true, baseURL: base, apiKey: chiave };
  const headers = { 'Content-Type': 'application/json' };
  if (chiave) headers.Authorization = `Bearer ${chiave}`;
  /* ⛔ Ollama e LM Studio espongono il protocollo OpenAI sotto /v1, il loro indirizzo base no:
     è il record a dire dove bussare (`endpoint.chat`), non un `if` sul nome. */
  return { fonte, modelloRemoto, url: `${base}${record.endpoint.chat}`, headers };
}
