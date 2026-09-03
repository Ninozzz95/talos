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
 * ⛔ Anthropic e Gemini NO: vogliono una forma di richiesta diversa
 * (`/v1/messages` con `x-api-key`; `:generateContent` con la chiave in query,
 * e ruoli/contenuti strutturati altrimenti). Qui vengono RIFIUTATI con un
 * messaggio che dice perché e cosa manca — mai instradati su un URL che
 * risponderebbe 404 lasciando credere a una chiave sbagliata.
 *
 * ## La convenzione sul nome, e perché i DUE PUNTI
 *
 * Gli id OpenRouter sono già `autore/modello` (`deepseek/deepseek-v4-flash`),
 * quindi lo slash è occupato e non può separare la fonte. Si usa il carattere
 * `:` come prefisso — `local:qwen3-0.6b-…`, `ollama:llama3.2` — e
 * **nessun prefisso significa OpenRouter**, così tutto ciò che esiste oggi
 * continua a funzionare identico, senza migrare una sola sessione salvata.
 */

export class ModelDestinationError extends Error {
  constructor(message, code = 'MODEL_DESTINATION_INVALID') {
    super(message);
    this.name = 'ModelDestinationError';
    this.code = code;
  }
}

/** Le fonti riconosciute nel prefisso. ⛔ Tutto il resto è un id OpenRouter. */
export const FONTI_MODELLO = Object.freeze(['local', 'ollama', 'openai', 'deepseek', 'openrouter', 'anthropic', 'gemini']);

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

/** Chi parla `POST {base}/chat/completions` con Bearer: il corpo non si tocca. */
const COMPATIBILI_OPENAI = Object.freeze(['openrouter', 'openai', 'deepseek', 'ollama', 'local']);

/**
 * Chi NON lo parla, e cosa gli servirebbe. ⛔ Il messaggio dice la cosa vera —
 * la credenziale può essere ottima, manca la traduzione dalla nostra parte —
 * perché un errore che sembra colpa della chiave manda a rigenerarne una buona.
 */
const DA_TRADURRE = Object.freeze({
  anthropic: 'Anthropic usa /v1/messages con un formato di richiesta diverso: la traduzione non è ancora scritta.',
  gemini: 'Gemini usa :generateContent con un formato di richiesta diverso: la traduzione non è ancora scritta.',
});

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

  if (DA_TRADURRE[fonte]) throw new ModelDestinationError(DA_TRADURRE[fonte], 'MODEL_PROVIDER_NOT_SUPPORTED_YET');
  if (!COMPATIBILI_OPENAI.includes(fonte)) throw new ModelDestinationError(`Fonte del modello non riconosciuta: ${fonte}`, 'MODEL_DESTINATION_INVALID');

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
      throw new ModelDestinationError('Il motore locale non è acceso: caricalo dal Laboratorio modelli prima di usarlo in chat.', 'LOCAL_RUNTIME_NOT_READY');
    }
    return { fonte, modelloRemoto, locale: true, percorso: '/v1/chat/completions' };
  }

  const runtime = leggiRuntime(fonte) || {};
  const base = typeof runtime.endpoint === 'string' && runtime.endpoint.trim() !== '' ? runtime.endpoint.replace(/\/+$/u, '') : null;
  if (!base) throw new ModelDestinationError(`Manca l'indirizzo del provider ${fonte}.`, 'PROVIDER_RUNTIME_INVALID');

  const chiave = leggiChiave(fonte);
  /*
   * ⛔ Ollama gira in casa e non ha account: pretendere una chiave lo
   * escluderebbe per una regola che non lo riguarda. Gli altri sì, e senza si
   * dice CHE COSA manca invece di partire e prendersi un 401.
   */
  if (fonte !== 'ollama' && (typeof chiave !== 'string' || chiave.trim() === '')) {
    throw new ModelDestinationError(`Manca la chiave per ${fonte}: inseriscila in Laboratorio modelli → Provider.`, 'PROVIDER_KEY_MISSING');
  }

  const headers = { 'Content-Type': 'application/json' };
  if (chiave) headers.Authorization = `Bearer ${chiave}`;
  // ⛔ Ollama espone il protocollo OpenAI sotto /v1, il suo indirizzo base no.
  const percorso = fonte === 'ollama' ? '/v1/chat/completions' : '/chat/completions';
  return { fonte, modelloRemoto, url: `${base}${percorso}`, headers };
}
