import { createHash } from 'node:crypto';
import { buildPreparedProviderRequest } from './context-provider-adapter.mjs';
import { adattaRichiestaConDescrizioneComando, normalizzaReasoningPerModello } from './runtime-owner-adapter.mjs';
import { ID_NATIVI_SDK, REGISTRO_FORNITORI } from './provider-registry.mjs';
import { imageMessageContent } from './chat-image-attachments.mjs';
import { conImmaginiDegliAttrezzi, senzaCampoImmagini } from './kernel/immagine-da-guardare.mjs';

const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
/* ⛔ 12/09 — P-A: era il decimo dei tredici elenchi, tre indirizzi ricopiati a mano. Se uno
   divergeva da quello del portachiavi, il conteggio dei token veniva chiesto a un endpoint diverso
   da quello che poi risponde davvero — e nessuno se ne sarebbe accorto, perche il numero c'era. */
const defaults = Object.fromEntries(Object.values(REGISTRO_FORNITORI).filter((r) => r.catalogo?.inUI === true && r.catalogo?.fonte === 'fornitore').map((r) => [r.id, r.baseUrl]));
const pick = (body, keys) => Object.fromEntries(keys.filter(key => body[key] !== undefined).map(key => [key, body[key]]));

/** Reuse desktop transforms before public SDK serialization. Profiles for chat
 * carry requestOptions; summary profiles deliberately omit those chat options. */
export async function buildPreparedDesktopContextRequest({ messages, tools = [], model, signal }, { resolveImages, readModelCapabilities } = {}) {
  signal?.throwIfAborted();
  const chat = Object.hasOwn(model, 'requestOptions');
  let preparedMessages = structuredClone(messages);
  /* view_image (owner 27/10/2026, CLI punto 1): il corpo CONTATO è il corpo SPEDITO — l'immagine guardata si traduce come all'invio del
     nucleo (`conImmaginiDegliAttrezzi`), così si conta; un modello che il catalogo dice cieco la riceve come nota, un catalogo che non
     sa conta l'immagine (meglio contare un po' di più che sfondare la finestra). Un riassunto non porta immagini: solo il campo via. */
  if (chat) {
    const capacita = await Promise.resolve(readModelCapabilities?.(model.model)).catch(() => null);
    const vede = Array.isArray(capacita?.inputModalities) && capacita.inputModalities.length ? capacita.inputModalities.includes('image') : true;
    preparedMessages = conImmaginiDegliAttrezzi(preparedMessages, { vedeImmagini: vede, contenutoImmagini: imageMessageContent });
  } else preparedMessages = senzaCampoImmagini(preparedMessages);
  if (chat && resolveImages) preparedMessages = await resolveImages(preparedMessages);
  signal?.throwIfAborted();
  let preparedTools = structuredClone(tools);
  const requestOptions = { ...(chat ? structuredClone(model.requestOptions) : {}), max_tokens: model.responseReserve, ...(chat && tools.length ? { tool_choice: 'auto' } : {}) };
  if (chat && model.provider === 'openrouter') {
    preparedTools = adattaRichiestaConDescrizioneComando({ tools: preparedTools }).tools;
    const capability = await Promise.resolve(readModelCapabilities?.(model.model)).catch(() => null);
    const reasoning = normalizzaReasoningPerModello(requestOptions.reasoning, capability);
    if (reasoning !== undefined) requestOptions.reasoning = reasoning;
  } else if (!chat && model.provider === 'openrouter') {
    /* 09/09 — una SINTESI chiede poco ragionamento (vedi callContextModel nell'adapter: misurato sul giro
       vero D1, senza questo campo glm-5.3-flash si mangiava il budget nel pensiero). Il corpo contato deve
       portare lo stesso campo del corpo inviato, o la misura non è quella della richiesta. */
    const capability = await Promise.resolve(readModelCapabilities?.(model.model)).catch(() => null);
    requestOptions.reasoning = normalizzaReasoningPerModello({ effort: 'low' }, capability);
  } else if (!chat) {
    Object.assign(requestOptions, opzioniRagionamentoPerSintesi(model.provider));
  }
  const compiled = await buildPreparedProviderRequest({ messages: preparedMessages, tools: preparedTools, model, signal, requestOptions });
  if (!ID_NATIVI_SDK.includes(model.provider) && !preparedTools.length) compiled.body.tools = [];
  if (model.provider === 'openrouter') {
    compiled.body.plugins = [{ id: 'context-compression', enabled: false }];
    if (!chat) compiled.body.transforms = [];
  }
  return compiled;
}

/*
 * 24/09/2026 — F4, punto 4: `reasoning` basso per la SINTESI anche fuori OpenRouter (il 09/09 era curato solo
 * là). Solo chiavi che `buildPreparedProviderRequest` sa compilare (`reasoning_effort`, `reasoning`): il campo
 * `thinking` di DeepSeek/Z.ai non è fra quelle, quindi là il pensiero resta acceso a sforzo basso.
 * Fonti, lette il 24/09/2026:
 * - OpenAI, guida «Reasoning» (developers.openai.com/api/docs/guides/reasoning): `reasoning_effort` accetta
 *   `none, minimal, low, medium, high, xhigh, max`; «Setting … to `none` returns HTTP 400» su GPT-6 Astra ⇒ `low`.
 *   Sul wire Responses il pinned SDK lo traduce in `reasoning.effort` (prova `CTX-WIRE-OPTIONS-openai`).
 * - DeepSeek, «Thinking mode» (api-docs.deepseek.com/guides/thinking_mode): formato OpenAI con
 *   `reasoning_effort` «low/high/max»; «Thinking mode is enabled by default, with the default effort being high».
 * - llama.cpp, `tools/server/README.md`: `reasoning_effort` — «If `none`, reasoning/thinking is disabled».
 * - Hermes `agent/context_compressor.py:3730-3733` (clone `65ad529`): «NO max_tokens: … a hard cap truncates
 *   summaries (thinking models burn it on reasoning)» — loro tolgono il tetto, noi lo teniamo (decisione 09/09,
 *   misurata sul giro D1) e abbassiamo il pensiero.
 * Fornitori non documentati (zai, qwen, kimi, minimax, anthropic, gemini) ⇒ nessun campo: ignoto vuol dire niente.
 * ⛔ Chi INVIA la sintesi (`runtime-owner-adapter.mjs::callContextModel`) deve portare le stesse opzioni, o il
 * corpo contato non è quello inviato: la funzione è esportata apposta per quel file (non di questa corsia).
 */
export function opzioniRagionamentoPerSintesi(provider) {
  if (provider === 'openai' || provider === 'deepseek') return { reasoning_effort: 'low' };
  if (provider === 'local' || provider === 'llama.cpp' || provider === 'llamacpp') return { reasoning_effort: 'none' };
  return {};
}

/*
 * 24/09/2026 — F4, punto 5: L'ANCORA DEL FORNITORE. Il numero vero di `prompt_tokens` riportato dal fornitore
 * nella risposta vale più del contatore separato (una chiamata in più; per OpenRouter, che non ha un endpoint
 * di conteggio, una stima byte/3,5). Si ricorda per (fornitore, modello) insieme all'impronta di OGNI messaggio
 * della richiesta contata; alla misura dopo, se il prefisso combacia messaggio per messaggio, il risultato è
 * `prompt_tokens` (+ `completion_tokens` per la risposta del modello, che è il primo messaggio nuovo) + la stima
 * dei SOLI messaggi aggiunti — `method: 'provider'`, `exact: false`. Prefisso diverso, modello diverso o richiesta
 * più corta ⇒ si delega al contatore di sempre: nessun numero preso a caso. Come Hermes `agent/usage_anchor.py`
 * (`65ad529`): `capture_usage_anchor(prompt_tokens, completion_tokens, messages)` (`:46-60`) e
 * `anchored_context_tokens` — «Anchored prompt+completion tokens plus a rough estimate of ONLY the messages
 * appended since; None when the anchor is missing or stale» (`:93-107`). Loro riconoscono il prefisso dall'impronta
 * dell'ultimo messaggio; qui da tutte, che costa poco e non sbaglia su una storia riscritta in mezzo.
 */
export function conAncoraDelFornitore(counter) {
  if (typeof counter?.countPreparedContext !== 'function') fail('CTX_TOKEN_PORT_INVALID', 'A counter to wrap is required.');
  const impronta = message => createHash('sha256').update(JSON.stringify(message)).digest('hex');
  const stima = messages => Math.ceil(Buffer.byteLength(JSON.stringify(messages), 'utf8') / 3.5) + messages.length * 4; // la stessa euristica del contatore
  const ancore = new Map();
  const chiave = (provider, model) => `${provider}\n${model}`;
  return Object.freeze({
    registraAncora({ provider, model, messages, usage }) {
      const prompt = Number(usage?.prompt_tokens ?? usage?.input_tokens);
      if (typeof provider !== 'string' || typeof model !== 'string' || !Array.isArray(messages) || !messages.length || !Number.isSafeInteger(prompt) || prompt <= 0) return false;
      const completion = Number(usage.completion_tokens ?? usage.output_tokens);
      ancore.set(chiave(provider, model), { impronte: messages.map(impronta), promptTokens: prompt, completionTokens: Number.isSafeInteger(completion) && completion > 0 ? completion : 0 });
      return true;
    },
    async countPreparedContext(request) {
      const { messages, tools = [], model, signal } = request ?? {};
      const ancora = model && typeof model.provider === 'string' && typeof model.model === 'string' ? ancore.get(chiave(model.provider, model.model)) : undefined;
      const valida = ancora && Array.isArray(messages) && messages.length >= ancora.impronte.length && Number.isSafeInteger(model.windowTokens) && model.windowTokens > 0 && Number.isSafeInteger(model.responseReserve) && model.responseReserve >= 0 && model.responseReserve < model.windowTokens && ancora.impronte.every((hash, index) => hash === impronta(messages[index]));
      if (!valida) return counter.countPreparedContext(request);
      signal?.throwIfAborted();
      let delta = messages.slice(ancora.impronte.length);
      let inputTokens = ancora.promptTokens;
      if (delta[0]?.role === 'assistant') { inputTokens += ancora.completionTokens || stima([delta[0]]); delta = delta.slice(1); }
      const aggiunti = delta.length ? stima(delta) : 0;
      inputTokens += aggiunti;
      const requestHash = createHash('sha256').update(JSON.stringify({ provider: model.provider, model: model.model, messages, tools })).digest('hex');
      return { schema: 'talos.context.tokens.v1', inputTokens, windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'provider', exact: false, requestHash, provider: model.provider, model: model.model, estimatedMarginTokens: Math.max(64, Math.ceil(aggiunti * 0.15)) };
    },
  });
}

/*
 * 11/10/2026 — indirizzo e chiave che il contatore usa per un fornitore, presi dal negozio. Stava scritto dentro `server.mjs`
 *   (`resolveProfile`) e chiedeva `getRuntime`/`getKey` per QUALUNQUE fornitore: per uno che non ha una chiave nel negozio
 *   (`credenziale: false` nel registro — il piano ChatGPT, che entra con un accesso) il negozio lancia `PROVIDER_INVALID`, e il primo
 *   giro col piano moriva prima di spedire niente. Trovato dal vivo col piano dell'owner; lo stack è nella prova
 *   `tests/chatgpt-contatore-contesto.test.mjs`. Per quel fornitore il contatore non chiama nessun servizio (non sta fra i `defaults`):
 *   stima, e si ancora ai `prompt_tokens` veri delle risposte (`conAncoraDelFornitore`) — quindi non gli serve nessuna credenziale.
 * ⛔ Un nome che il registro NON conosce continua a lanciare: tacere lì nasconderebbe un modello scritto male.
 */
export function credenzialeDelContatore(provider, { leggiRuntime, leggiChiave, baseLocale, contaOspite = null }) {
  if (provider === 'local') return { baseURL: baseLocale };
  /* 21/10/2026: il motore dell'APP conta da sé il prompt esatto (`POST /tokenize`, contratto del Mobile: lo stesso corpo della chat,
     risposta `{count, max_model_len}`). La chiave e il socket li ha l'accesso: qui passa solo la funzione che lo chiama. */
  if (provider === 'locale-ospite') return typeof contaOspite === 'function' ? { contaOspite } : {};
  if (REGISTRO_FORNITORI[provider]?.credenziale === false) return {};
  const runtime = leggiRuntime(provider);
  /* ⛔ 14/10/2026, revisione del bugfixer (REV-ZAI-01): il contatore gira in `contextHooks.prepare`, PRIMA della destinazione del
     modello, e con un indirizzo non ancora scelto mandava la chiave Z.AI all'indirizzo di serie (il saldo a consumo). La stessa
     regola della destinazione (`model-destination.mjs`): la chiave va solo all'indirizzo scelto, e lo si dice col codice della
     carta gialla. */
  if (runtime?.endpointDaScegliere === true) {
    throw Object.assign(new Error(`Choose where your ${REGISTRO_FORNITORI[provider]?.etichetta ?? provider} key goes: Model Lab → Providers → Configure.`), { code: 'PROVIDER_ENDPOINT_NOT_CHOSEN' });
  }
  return { baseURL: runtime.endpoint, apiKey: leggiChiave(provider) };
}

/*
 * Revisione del bugfixer, 16/10/2026 (CONTA-REV-01): un contatore che accetta la connessione e non risponde teneva fermo il giro —
 *   il conteggio aveva solo il segnale del giro, e il client HTTP aspetta le intestazioni fino a 300 s. Un conteggio è una misura di
 *   supporto: oltre questo tempo vale la stima dichiarata (`fallback: 'CTX_TOKEN_TIMEOUT'`), come per ogni altro guasto del contatore.
 */
export const TEMPO_MASSIMO_DEL_CONTEGGIO_MS = 10_000;

export function createContextTokenCounter({ fetchFn, resolveProfile, hashFn = text => createHash('sha256').update(text).digest('hex'), tempoMassimoMs = TEMPO_MASSIMO_DEL_CONTEGGIO_MS } = {}) {
  if (typeof resolveProfile !== 'function' || typeof fetchFn !== 'function') fail('CTX_TOKEN_PORT_INVALID', 'Profile resolution and transport must be injected.');
  return {
    async countPreparedContext({ messages, tools = [], model, signal }) {
      signal?.throwIfAborted();
      if (!model?.provider || !model.model || !Number.isSafeInteger(model.windowTokens) || model.windowTokens < 1 || !Number.isSafeInteger(model.responseReserve) || model.responseReserve < 0 || model.responseReserve >= model.windowTokens) fail('CTX_TOKEN_MODEL_INVALID', 'A valid model context window and reserve are required.');
      const profile = await resolveProfile(structuredClone(model)) ?? {};
      signal?.throwIfAborted();
      const compiled = await (profile.nativeRequestBuilder ?? buildPreparedProviderRequest)({ messages: structuredClone(messages), tools: structuredClone(tools), model: structuredClone(model), signal });
      if (!compiled?.body || typeof compiled.body !== 'object' || Array.isArray(compiled.body)) fail('CTX_TOKEN_REQUEST_INVALID', 'The request builder must return a JSON body.');
      const provider = model.provider;
      const body = provider === 'openai'
        ? pick(compiled.body, ['model', 'input', 'instructions', 'tools', 'tool_choice', 'text', 'reasoning', 'parallel_tool_calls'])
        : provider === 'anthropic'
          ? pick(compiled.body, ['model', 'messages', 'system', 'tools', 'tool_choice', 'thinking', 'output_config'])
          : provider === 'gemini' ? { generateContentRequest: { ...compiled.body, model: `models/${model.model.replace(/^models\//u, '')}` } } : compiled.body;
      const requestHash = await hashFn(JSON.stringify({ provider, model: model.model, body }));
      const base = { schema: 'talos.context.tokens.v1', windowTokens: model.windowTokens, responseReserve: model.responseReserve, requestHash, provider, model: model.model };
      const heuristic = () => {
        /*
         * ⛔ 09/09/2026 — fino a oggi qui si contavano i BYTE come token («deliberately conservative»):
         *   sul giro vero D1 un corpo di 39.513 byte, che OpenRouter ha misurato in 10.073 token, valeva
         *   70.903 — 3,9 volte il vero, sopra una finestra di 16.384. Effetto: ogni richiesta sembrava un
         *   overflow, la compattazione partiva forzata a ogni giro e il giro moriva. «Prudente» non vuol
         *   dire quadruplo: vuol dire un po' sopra il vero, con il margine dichiarato a parte.
         *   Misurato (z-ai/glm-5.3-flash, italiano, JSON del corpo): 3,92 byte/token, 3,64 caratteri/token.
         *   Byte/3,5 sta al +12% sul vero; `estimatedMarginTokens` (15%) copre testi più densi (codice,
         *   JSON di strumenti). Resta una stima, e resta dichiarata tale — chi ha un conteggio del
         *   fornitore lo usa.
         */
        const inputTokens = Math.ceil(Buffer.byteLength(JSON.stringify(body), 'utf8') / 3.5) + messages.length * 4;
        return { ...base, inputTokens, method: 'heuristic', exact: false, estimatedMarginTokens: Math.max(256, Math.ceil(inputTokens * 0.15)) };
      };
      /*
       * ⛔ 16/10/2026 (segnalato dalla CLI, stress test della 0.6.6, riprodotto sulla 0.6.6 pubblicata) — UN CONTEGGIO CHE NON SI PUÒ
       *   LEGGERE È UNA STIMA, MAI UN GIRO FALLITO. Un proxy o un server locale compatibile OpenAI che risponde 200 a
       *   `/responses/input_tokens` senza implementarlo, un 429 o un 5xx del contatore, una rete che non risponde: il conteggio è una
       *   MISURA di supporto del giro, e fino a ieri il suo guasto faceva fallire il giro intero. Hermes non chiede mai un conteggio al
       *   fornitore: stima sempre (`agent/model_metadata.py`, `estimate_tokens_rough`) e corregge coi numeri veri della risposta.
       * ⇒ Questi tre guasti diventano la stima dichiarata (`method: 'heuristic'`, `exact: false`), con `fallback` che dice da quale
       *   guasto nasce. Restano errori quelli di CONFIGURAZIONE — credenziale rifiutata, indirizzo malformato — e uno Stop.
       */
      const stimaDopoUnGuasto = (codice) => ({ ...heuristic(), fallback: codice });
      /*
       * 21/10/2026 — il CONTEGGIO ESATTO del motore dell'app (contratto del Mobile del 21/10, adattato da vLLM `TokenizeChatRequest`):
       *   `POST /tokenize` col corpo della chat ⇒ `{count, max_model_len}`, il prompt che il motore genererebbe davvero (template e
       *   tokenizer sull'attore). Dal vivo sul Pad (giro 16 della sessione lunga) il prompt era 23.851 token esatti contro un limite
       *   d'ingresso di 23.756: decisioni così vicine al confine vanno prese col numero vero, non con la stima. Un'app vecchia (404/405/501) ⇒ la stima, come per un contatore che non c'è; un motore occupato, lento o
       *   che risponde male ⇒ la stima dichiarata col suo `fallback`, mai un giro fallito (la regola qui sopra).
       */
      if (provider === 'locale-ospite') {
        if (typeof profile.contaOspite !== 'function') return heuristic();
        const tetto = AbortSignal.timeout(tempoMassimoMs);
        const conTetto = signal ? AbortSignal.any([signal, tetto]) : tetto;
        let risposta;
        try { risposta = await profile.contaOspite(compiled.body, conTetto); }
        catch { signal?.throwIfAborted(); return stimaDopoUnGuasto(tetto.aborted ? 'CTX_TOKEN_TIMEOUT' : 'CTX_TOKEN_NETWORK'); }
        signal?.throwIfAborted();
        if ([404, 405, 501].includes(risposta?.status)) return heuristic();
        if (!risposta?.ok) return stimaDopoUnGuasto('CTX_TOKEN_HTTP');
        let esito;
        try { esito = await risposta.json(); } catch { return stimaDopoUnGuasto('CTX_TOKEN_RESPONSE_INVALID'); }
        if (!Number.isSafeInteger(esito?.count) || esito.count < 0) return stimaDopoUnGuasto('CTX_TOKEN_RESPONSE_INVALID');
        return { ...base, inputTokens: esito.count, method: 'runtime', exact: true };
      }
      const cloud = Object.hasOwn(defaults, provider);
      const runtime = provider === 'local' || provider === 'llama.cpp' || provider === 'llamacpp';
      if (!cloud && !runtime) return heuristic();
      if (cloud && (typeof profile.apiKey !== 'string' || !profile.apiKey.trim())) fail('CTX_TOKEN_AUTH', 'The selected provider has no injected credential.');
      if (runtime && !profile.baseURL) return heuristic();
      let url;
      try { url = new URL(profile.baseURL ?? defaults[provider]); } catch { fail('CTX_TOKEN_PROFILE_INVALID', 'The selected provider URL is invalid.'); }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) fail('CTX_TOKEN_PROFILE_INVALID', 'The provider URL must be an HTTP base without credentials or query parameters.');
      const endpoint = provider === 'openai' ? '/responses/input_tokens' : provider === 'anthropic' ? '/messages/count_tokens' : provider === 'gemini' ? `/models/${encodeURIComponent(model.model.replace(/^models\//u, ''))}:countTokens` : '/chat/completions/input_tokens';
      url.pathname = url.pathname.replace(/\/$/u, '') + endpoint;
      const headers = { 'content-type': 'application/json' };
      if (provider === 'anthropic') {
        headers['x-api-key'] = profile.apiKey;
        headers['anthropic-version'] = compiled.headers?.['anthropic-version'] ?? '2023-06-01';
        if (compiled.headers?.['anthropic-beta']) headers['anthropic-beta'] = compiled.headers['anthropic-beta'];
      } else if (provider === 'gemini') headers['x-goog-api-key'] = profile.apiKey;
      else if (profile.apiKey) headers.authorization = `Bearer ${profile.apiKey}`;
      signal?.throwIfAborted();
      let response;
      const tetto = AbortSignal.timeout(tempoMassimoMs);
      const conTetto = signal ? AbortSignal.any([signal, tetto]) : tetto;
      const guasto = (codice) => { signal?.throwIfAborted(); return stimaDopoUnGuasto(tetto.aborted ? 'CTX_TOKEN_TIMEOUT' : codice); };
      try { response = await fetchFn(url.href, { method: 'POST', headers, body: JSON.stringify(body), signal: conTetto, redirect: 'error' }); }
      catch { return guasto('CTX_TOKEN_NETWORK'); }
      signal?.throwIfAborted();
      if ([404, 405, 501].includes(response.status)) return heuristic();
      if ([401, 403].includes(response.status)) fail('CTX_TOKEN_AUTH', 'The token counter rejected the injected credential.');
      if (!response.ok) return stimaDopoUnGuasto('CTX_TOKEN_HTTP');
      let result;
      try { result = await response.json(); } catch { return guasto('CTX_TOKEN_RESPONSE_INVALID'); }
      const inputTokens = provider === 'gemini' ? result?.totalTokens : result?.input_tokens;
      if (!Number.isSafeInteger(inputTokens) || inputTokens < 0) return stimaDopoUnGuasto('CTX_TOKEN_RESPONSE_INVALID');
      // Provider preflight is a measurement, not a promise of later billed usage.
      return { ...base, inputTokens, method: runtime ? 'runtime' : 'provider', exact: runtime };
    },
  };
}

export async function countPreparedContext(request, ports) {
  return createContextTokenCounter(ports).countPreparedContext(request);
}
