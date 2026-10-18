import { generateText, streamText, jsonSchema, stepCountIs } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';

import { ID_NATIVI_SDK, fornitore } from './provider-registry.mjs';
import { tokenDaCache, tokenScrittiInCache } from './usage-cache.mjs';
import { argomentiVuoti } from './argomenti-vuoti.mjs';

// Only this adapter knows the SDK message format. The kernel owns tool execution.
export function stripNativeMetadata(messages) {
  return messages.map(({ talos_provider_state, talos_recovery, ...message }) => message);
}

/*
 * ⛔ CLI 0.6.10 (17/10/2026), dal vivo sul piano ChatGPT: HTTP 400 `invalid_value` «Invalid value: 'text'. Supported values are:
 *   'input_text', …», `param: input[3].content[0].type`. Il kernel marca per la cache l'ULTIMO messaggio di sistema come
 *   `[{ type: 'text', text, cache_control }]` quando il prefisso fino a lì supera 16.000 caratteri (`talosHarness.mjs`,
 *   `ultimoSistema`). Dopo un cambio del progetto l'ultimo sistema è l'aggiornamento appeso in coda («Project context update:»), il
 *   prefisso è tutta la chat, e una chat lunga lo supera: qui il contenuto a pezzi passava così com'era, l'SDK lo spediva come
 *   `developer` con un pezzo `text`, e il filo Responses lo rifiuta. Da lì ogni giro della chat falliva (dal 16/10, 7 su 7 nei
 *   giornali dell'owner, «did not complete»/«sign-in failed»). Una chat corta resta sotto la soglia: per questo non si vedeva.
 * ⇒ Un messaggio di sistema dell'SDK è una STRINGA (AI SDK «SystemModelMessage»). Su OGNI filo nativo un sistema a pezzi diventa il
 *   suo testo: Responses e Gemini mettono in cache da soli il prefisso, e il marcatore lì non vuol dire niente. Sul filo Anthropic
 *   (Anthropic, Z.AI e MiniMax compatibili) il marcatore passa nel posto che l'SDK legge, `providerOptions.anthropic.cacheControl`
 *   (`@ai-sdk/anthropic` 4.0.49, `getCacheControl` sul blocco di sistema): prima l'SDK metteva l'ARRAY intero dentro `text` (revisione
 *   del bugfixer, 17/10, corpo catturato), cioè una richiesta storta anche lì, e il marcatore si perdeva.
 *   Un pezzo che non è testo (un'immagine in un sistema) non si scarta in silenzio: si ferma, come per gli altri ruoli.
 */
function sistemaNativo(content, { anthropic }) {
  if (!Array.isArray(content)) return { role: 'system', content };
  const testi = content.map(parte => {
    if (typeof parte === 'string') return parte;
    if (parte?.type === 'text' && typeof parte.text === 'string') return parte.text;
    throw new Error(`Content not supported by the provider: ${parte?.type ?? typeof parte}`);
  });
  const marcatore = content.find(parte => parte && typeof parte === 'object' && parte.cache_control)?.cache_control;
  return { role: 'system', content: testi.join('\n'), ...(anthropic && marcatore ? { providerOptions: { anthropic: { cacheControl: { ...marcatore } } } } : {}) };
}

export function toNativeMessages(messages, { provider, model }) {
  const toolNames = new Map(messages.flatMap(m => (m.tool_calls ?? []).map(t => [t.id, t.function.name])));
  const anthropic = fornitore(provider)?.wire === 'anthropic-messages';
  return messages.map(message => {
    if (message.role === 'system' || message.role === 'developer') return sistemaNativo(message.content, { anthropic });
    if (message.role === 'tool') {
      const toolName = toolNames.get(message.tool_call_id);
      if (!toolName) throw new Error('Tool result without a matching call.');
      return { role: 'tool', content: [{ type: 'tool-result', toolCallId: message.tool_call_id, toolName, output: { type: 'text', value: typeof message.content === 'string' ? message.content : JSON.stringify(message.content) } }] };
    }
    const state = message.talos_provider_state;
    if (message.role === 'assistant' && state?.version === 1 && state.provider === provider && state.model === model && Array.isArray(state.content)) {
      return { role: 'assistant', content: structuredClone(state.content) };
    }
    const content = [];
    if (typeof message.content === 'string' && message.content) content.push({ type: 'text', text: message.content });
    else if (Array.isArray(message.content)) for (const part of message.content) {
      if (part.type === 'text') content.push({ type: 'text', text: part.text });
      else if (part.type === 'image_url') {
        // The upload resolver already verified these bytes. Never let SDK download arbitrary URLs.
        if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/u.test(part.image_url?.url ?? '')) throw new Error('Image reference not resolved or not allowed.');
        content.push({ type: 'file', data: part.image_url.url, mediaType: part.image_url.url.slice(5, part.image_url.url.indexOf(';')) });
      } else throw new Error(`Content not supported by the provider: ${part.type}`);
    }
    for (const call of message.tool_calls ?? []) content.push({ type: 'tool-call', toolCallId: call.id, toolName: call.function.name, input: argomentiVuoti(call.function.arguments) ? {} : JSON.parse(call.function.arguments) });
    return { role: message.role, content };
  });
}

/*
 * ⛔⛔ 12/09 — P-B: QUESTO LETTORE CONOSCEVA UN NOME SOLO.
 *
 * `usage.inputTokenDetails?.cacheReadTokens` è il nome che l'AI SDK espone quando l'adattatore
 * fissato nel lock mappa il campo nativo. Quando NON lo mappa — ed è ❓ non verificato che lo
 * faccia per `cachedContentTokenCount` di Gemini (§7.8 dell'inventario) — qui usciva `undefined`,
 * che a valle diventa zero: «non dichiarato» scritto come «nessuno», che è la lezione del 22/8.
 *
 * ⇒ Prima si chiede all'SDK, poi si chiede al fornitore con TUTTI i nomi che quel wire può usare
 *   (`usage-cache.mjs`, alimentato dal record). Un nome in più non fa mai danno; uno in meno fa
 *   sparire il 93% del costo dal pannello.
 */
function canonicalUsage(usage = {}, provider) {
  // P-J — l'SDK 4.0.49 trasforma campi cache assenti in zero. Per i terzi il dato
  // grezzo è la prova; il totale SDK include già letture e scritture, senza risommarle.
  const terzoAnthropic = provider !== 'anthropic' && fornitore(provider)?.wire === 'anthropic-messages';
  const dallSdk = Number.isFinite(usage.inputTokenDetails?.cacheReadTokens) ? usage.inputTokenDetails.cacheReadTokens : null;
  const letti = terzoAnthropic ? tokenDaCache(usage.raw, provider) : dallSdk ?? tokenDaCache(usage, provider);
  const scritti = terzoAnthropic ? tokenScrittiInCache(usage.raw, provider) : Number.isFinite(usage.inputTokenDetails?.cacheWriteTokens)
    ? usage.inputTokenDetails.cacheWriteTokens
    : tokenScrittiInCache(usage, provider);
  return {
    prompt_tokens: usage.inputTokens,
    completion_tokens: usage.outputTokens,
    total_tokens: usage.totalTokens,
    prompt_tokens_details: {
      /* ⛔ `undefined` e non `null` quando non si sa: è la forma che questo campo ha sempre avuto,
         e i lettori a valle distinguono già «assente» da «zero». */
      cached_tokens: letti ?? undefined,
      ...(scritti !== null && scritti !== undefined ? { cache_write_tokens: scritti } : {}),
    },
    completion_tokens_details: { reasoning_tokens: usage.outputTokenDetails?.reasoningTokens },
  };
}

/*
 * ⛔ C5 (17/10/2026) — I NOMI CHE IL FILO RESPONSES RISERVA. OpenAI Responses (api.openai.com e il servizio Codex del piano ChatGPT)
 *   ha un suo Tool Search e rifiuta una funzione del cliente che si chiami `tool_search` («Function 'tool_search.tool_search' not
 *   allowed in reserved namespace 'tool_search'»): il ponte degli attrezzi differiti la dichiara proprio così. Come Hermes
 *   (`agent/transports/codex.py:83-86` i nomi, `:126-151` l'alias con suffisso se già preso, `:269-271` solo dove il filo lo
 *   riserva, `:836-843` il ritorno al nome vero nelle chiamate del modello): sul filo va `talos_tool_search`, il kernel vede sempre
 *   `tool_search`. Gli altri fili non cambiano.
 * ⛔ Revisione L (owner 17/10, «Rinominare anche la storia»): Hermes lascia il nome vero nelle chiamate già in storia, e il 400
 *   documentato è sulla dichiarazione; ma se OpenAI rifiutasse anche una chiamata in storia col nome riservato, una conversazione
 *   riaperta senza lo stato salvato (o su un altro fornitore Responses) cadrebbe. Sul filo Responses la storia usa lo stesso alias
 *   della dichiarazione: coerente comunque la pensi il servizio, e il kernel vede sempre il nome vero.
 */
function storiaConAlias(messaggi, verso) {
  if (!verso.size) return messaggi;
  const sulFilo = (nome) => verso.get(nome) ?? nome;
  return messaggi.map((m) => (Array.isArray(m.content) && m.content.some((p) => (p.type === 'tool-call' || p.type === 'tool-result') && verso.has(p.toolName))
    ? { ...m, content: m.content.map((p) => ((p.type === 'tool-call' || p.type === 'tool-result') && verso.has(p.toolName) ? { ...p, toolName: sulFilo(p.toolName) } : p)) }
    : m));
}
const RISERVATI_SUL_FILO_RESPONSES = Object.freeze(['tool_search']);
export function aliasDelFilo(nomi, wireResponses) {
  const verso = new Map(), indietro = new Map();
  if (!wireResponses) return { verso, indietro };
  const presi = new Set(nomi);
  for (const nome of nomi) {
    if (!RISERVATI_SUL_FILO_RESPONSES.includes(nome)) continue;
    let alias = `talos_${nome}`;
    for (let n = 2; presi.has(alias); n += 1) alias = `talos_${nome}_${n}`;
    presi.add(alias); verso.set(nome, alias); indietro.set(alias, nome);
  }
  return { verso, indietro };
}

function responseMessage(response, provider, model, finishReason, nomiVeri = new Map()) {
  if (!['stop', 'tool-calls'].includes(finishReason)) {
    // P-J — nei nuovi profili lo schermo usa il nome umano, senza codici del protocollo.
    const record = fornitore(provider);
    const error = new Error(provider !== 'anthropic' && record?.wire === 'anthropic-messages'
      ? `${record.etichetta} response incomplete. Try again: the previous history is kept.`
      : `${provider} response incomplete (${finishReason}). Try again: the previous history is kept.`);
    error.code = 'NATIVE_RESPONSE_INCOMPLETE';
    if (provider !== 'anthropic' && record?.wire === 'anthropic-messages') { error.chiave = 'server.nativeAdapter.incompleteNamed'; error.params = { label: record.etichetta }; }
    else { error.chiave = 'server.nativeAdapter.incompleteWithReason'; error.params = { provider, reason: finishReason }; }
    throw error;
  }
  const assistant = response.messages.findLast(m => m.role === 'assistant');
  const content = assistant?.content ?? [];
  const text = content.filter(p => p.type === 'text').map(p => p.text).join('');
  const calls = content.filter(p => p.type === 'tool-call').map(p => ({ id: p.toolCallId, type: 'function', function: { name: nomiVeri.get(p.toolName) ?? p.toolName, arguments: JSON.stringify(p.input) } }));
  const reasoning = content.filter(p => p.type === 'reasoning').map(p => p.text).join('');
  return {
    role: 'assistant', content: text || null,
    ...(calls.length ? { tool_calls: calls } : {}),
    ...(reasoning ? { reasoning_content: reasoning } : {}),
    // Incomplete signatures must never become a checkpoint for the next request.
    ...(['stop', 'tool-calls'].includes(finishReason) ? { talos_provider_state: { version: 1, provider, model, content } } : {}),
  };
}

export async function nativeProviderResponse({ provider, model, apiKey, baseURL, body, fetchFn = fetch, signal }) {
  signal?.throwIfAborted();
  /* ⛔ 12/09 — P-A: la mappa resta (un pacchetto npm non si deriva da un dato), ma il registro
     dichiara CHI passa di qui: se le due divergono, si ferma subito invece di costruire un client
     per un fornitore che il resto del sistema instrada altrove. Il test di parità le confronta. */
  // P-J — INIZIO scelta del trasporto dal registro; nessun secondo client Messages.
  const record = fornitore(provider);
  const wireAnthropic = record?.wire === 'anthropic-messages';
  // 11/10/2026: il piano ChatGPT è lo stesso SDK e lo stesso wire di OpenAI; cambia chi paga (il Bearer è il token del piano).
  const wireResponses = record?.wire === 'openai-responses';
  const factory = wireAnthropic ? createAnthropic : wireResponses ? createOpenAI : { gemini: createGoogleGenerativeAI }[provider];
  if (!factory || !ID_NATIVI_SDK.includes(provider)) throw new Error('Native provider not recognized.');
  if (wireAnthropic && (typeof apiKey !== 'string' || !apiKey.trim())) {
    throw Object.assign(new Error(`The key for ${record.etichetta} is missing.`), { code: 'PROVIDER_KEY_MISSING' });
  }
  const credenziale = wireAnthropic && record.auth.tipo === 'bearer' ? { authToken: apiKey } : { apiKey };
  const client = factory({ ...credenziale, ...(wireAnthropic ? { baseURL: baseURL || record.baseUrl } : baseURL ? { baseURL } : {}), fetch: fetchFn });
  // P-J — FINE scelta del trasporto.
  const languageModel = wireResponses ? client.responses(model) : client.chat(model);
  /* ⛔ R-01 (12/10/2026, S1): sul filo Responses un attrezzo senza `strict` viene NORMALIZZATO in strict, dove ogni campo è
     obbligatorio (developers.openai.com/api/docs/guides/function-calling, letta il 12/10/2026). Col piano ChatGPT il modello
     mandava `""` in ogni campo facoltativo (trascritto dell'owner: `modello` 31 volte, `cartella` 21, `model` 18) e delega e
     Workflow lo rifiutavano. I nostri schemi hanno campi facoltativi per contratto: si dichiarano non strict, come Codex
     (`codex-rs/core/src/tools/handlers/multi_agents_spec.rs:92`). Gli altri fili non conoscono il campo e restano com'erano. */
  const alias = aliasDelFilo((body.tools ?? []).map(t => t.function.name), wireResponses);
  const sulFilo = (nome) => alias.verso.get(nome) ?? nome;
  const tools = Object.fromEntries((body.tools ?? []).map(t => [sulFilo(t.function.name), { description: t.function.description, inputSchema: jsonSchema(t.function.parameters), ...(wireResponses ? { strict: false } : {}) }]));
  const effort = body.reasoning_effort ?? body.reasoning?.effort;
  const providerOptions = wireResponses ? { openai: { store: false, include: ['reasoning.encrypted_content'] } }
    : provider === 'anthropic' ? opzioniAnthropicNative(provider, model, body) : opzioniAnthropicTerzi(provider, model, body);
  /* Con le opzioni esplicite (ragionamento adattivo + livello) il livello NON passa anche dal `reasoning` comune dell'SDK, che non conosce «max». */
  const sforzoEsplicito = provider === 'anthropic' && providerOptions.anthropic?.thinking != null;
  const nativeMessages = storiaConAlias(toNativeMessages(body.messages, { provider, model }), alias.verso);
  /*
   * ⛔ Cache del piano fra un giro e l'altro (CLI, 15/10/2026: 91% in cache dentro un giro, 0 fra due giri). Sul filo Responses un
   *   messaggio di sistema arrivato DOPO la storia (l'aggiornamento del preambolo che l'agent-service APPENDE apposta per non toccare il
   *   prefisso, `agent-service.mjs` «IL CONTESTO SI APPENDE, NON SI RISCRIVE») finiva in `instructions`, cioè IN TESTA: il prefisso
   *   cambiava, e con lui la chiave della cache del piano e il riuso del servizio. Responses accetta i messaggi `developer` in qualunque
   *   punto dell'`input` (l'SDK li converte al loro posto, `@ai-sdk/openai` 4.0.61 `convert-to-openai-responses-input.ts:393-420`):
   *   in `instructions` vanno solo quelli INIZIALI, gli altri restano dove sono (`allowSystemInMessages`, AI SDK «ModelMessage»,
   *   ai-sdk.dev/v7/docs/reference/ai-sdk-core/model-message, letto il 15/10/2026: per rigiocare storie che contengono messaggi di
   *   sistema). ⛔ Solo su Responses: Anthropic rifiuta messaggi di sistema separati dalla conversazione, e lì resta com'era.
   */
  const primoNonDiSistema = nativeMessages.findIndex(m => m.role !== 'system');
  const iniziali = primoNonDiSistema < 0 ? nativeMessages.length : primoNonDiSistema;
  const sistemaAlSuoPosto = wireResponses && nativeMessages.slice(iniziali).some(m => m.role === 'system');
  // SDK common reasoning maps support/model differences in the pinned adapters.
  const common = {
    model: languageModel,
    ...(sistemaAlSuoPosto
      ? { messages: nativeMessages.slice(iniziali), instructions: nativeMessages.slice(0, iniziali), allowSystemInMessages: true }
      : { messages: nativeMessages.filter(m => m.role !== 'system'), instructions: nativeMessages.filter(m => m.role === 'system') }),
    ...(Object.keys(tools).length ? { tools } : {}),
    ...(body.tool_choice ? { toolChoice: typeof body.tool_choice === 'string' ? body.tool_choice : { type: 'tool', toolName: sulFilo(body.tool_choice.function.name) } } : {}),
    ...(body.temperature != null ? { temperature: body.temperature } : {}),
    ...(body.top_p != null ? { topP: body.top_p } : {}),
    ...(body.stop ? { stopSequences: Array.isArray(body.stop) ? body.stop : [body.stop] } : {}),
    ...(effort && !(wireAnthropic && provider !== 'anthropic') && !sforzoEsplicito ? { reasoning: effort } : {}), // P-J: opzioni esplicite per i terzi.
    maxOutputTokens: body.max_completion_tokens ?? body.max_tokens ?? 8192,
    providerOptions, maxRetries: 0, stopWhen: stepCountIs(1), abortSignal: signal,
    // The caller owns retries, stop, tools and traces. No telemetry or automatic downloads.
    experimental_download: async urls => { if (urls.length) throw new Error('Implicit image download is not allowed.'); return []; },
  };
  if (!body.stream) {
    let usageDelloStep; // P-J — evento nominato, senza dipendere dalla posizione negli array SDK.
    const result = await generateText({ ...common, onStepFinish: step => { usageDelloStep = step.usage; } });
    // P-J — l'aggregato perde raw anche con un solo step; lo step mantiene la misura originale.
    const usage = wireAnthropic && provider !== 'anthropic' ? usageDelloStep : result.usage;
    return Response.json({ choices: [{ index: 0, message: responseMessage(result.response, provider, model, result.finishReason, alias.indietro), finish_reason: result.finishReason === 'tool-calls' ? 'tool_calls' : result.finishReason }], usage: canonicalUsage(usage, provider) });
  }
  const abort = new AbortController();
  const combinedSignal = signal ? AbortSignal.any([signal, abort.signal]) : abort.signal;
  const result = streamText({ ...common, abortSignal: combinedSignal, onError: () => {} });
  const encoder = new TextEncoder();
  /*
   * F-H-002 (stress test della CLI 0.5.3, curato il 12/10/2026) — PRIMA DI RISPONDERE SI LEGGE IL PRIMO EVENTO. Misurato: un 429 o un
   * 400 del fornitore (OpenAI Responses, Anthropic) diventava una risposta 200 col flusso che poi falliva, e chi chiama non vedeva né
   * lo stato né `Retry-After` (un 400 finiva fra gli «esiti incerti»). Il filo compatibile OpenAI dà lo stato vero; ora anche questo:
   * se il primo evento è un errore HTTP del fornitore (`APICallError`, con `statusCode`), la risposta porta QUELLO stato, le sue
   * intestazioni e il suo corpo. Gli eventi di apertura (`start`, `start-step`) non dicono niente: si saltano (il flusso li ignorerebbe comunque).
   */
  const grezzo = result.fullStream[Symbol.asyncIterator]();
  const letti = [];
  let primo = await grezzo.next();
  while (!primo.done && (primo.value?.type === 'start' || primo.value?.type === 'start-step')) primo = await grezzo.next();
  const erroreIniziale = !primo.done && primo.value?.type === 'error' ? primo.value.error : null;
  if (erroreIniziale && Number.isInteger(erroreIniziale.statusCode) && erroreIniziale.statusCode >= 400) {
    abort.abort();
    await grezzo.return?.();
    const intestazioni = new Headers(erroreIniziale.responseHeaders ?? {});
    intestazioni.delete('content-length'); intestazioni.delete('content-encoding'); intestazioni.delete('transfer-encoding');
    if (!intestazioni.has('content-type')) intestazioni.set('content-type', 'application/json');
    const corpo = typeof erroreIniziale.responseBody === 'string' && erroreIniziale.responseBody ? erroreIniziale.responseBody
      : JSON.stringify({ error: { message: String(erroreIniziale.message ?? 'Provider error.') } });
    return new Response(corpo, { status: erroreIniziale.statusCode, headers: intestazioni });
  }
  letti.push(primo);
  const iterator = { next: () => (letti.length ? Promise.resolve(letti.shift()) : grezzo.next()), return: (...a) => grezzo.return?.(...a) };
  const callIndices = new Map();
  const conArgomenti = new Set(); // F-Y-001: gli id che hanno già ricevuto almeno un pezzo di argomenti
  let completed = false;
  let usageDelloStep; // P-J — conserva raw senza consumare due volte il flusso SDK.
  const stream = new ReadableStream({
    async pull(controller) {
      const emit = (delta, extra = {}, finishReason) => controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ index: 0, delta, ...(finishReason ? { finish_reason: finishReason === 'tool-calls' ? 'tool_calls' : finishReason } : {}) }], ...extra })}\n\n`));
      try {
        while (!completed) {
          const { value: part, done } = await iterator.next();
          if (done) throw new Error('Provider stream interrupted before completion.');
          if (part.type === 'error') throw part.error;
          if (part.type === 'abort') throw new Error('Response cancelled.');
          if (part.type === 'text-delta') { emit({ content: part.text }); return; }
          if (part.type === 'reasoning-delta') { emit({ reasoning_content: part.text }); return; }
          if (part.type === 'tool-input-start') {
            callIndices.set(part.id, callIndices.size);
            emit({ tool_calls: [{ index: callIndices.get(part.id), id: part.id, type: 'function', function: { name: alias.indietro.get(part.toolName) ?? part.toolName, arguments: '' } }] }); return;
          }
          if (part.type === 'tool-input-delta') {
            if (typeof part.delta === 'string' && part.delta !== '') conArgomenti.add(part.id);
            emit({ tool_calls: [{ index: callIndices.get(part.id), function: { arguments: part.delta } }] }); return;
          }
          /*
           * ⛔ K2 (S2, stress test della CLI 0.6.7, 16/10/2026) — UNA CHIAMATA NON VALIDA NON È UNA CONNESSIONE CADUTA. Qui prima si
           *   LANCIAVA il `tool-call` con `invalid: true` (attrezzo che non esiste, o argomenti che non sono JSON): il kernel lo leggeva
           *   come flusso interrotto («The connection to the provider dropped…») e il giro finiva, mentre sui fili compatibili la stessa
           *   chiamata arriva al dispatch, che la rifiuta col perché («X is not available in this session.», o gli argomenti incompleti)
           *   e il modello si corregge. `ai` 7.0.93 (`dist/index.js:4169-4185`, `parseToolCall`) mette in `input` l'oggetto se il JSON
           *   è valido e il testo grezzo se no ⇒ la chiamata prosegue nel ramo qui sotto come una chiamata chiusa qualsiasi. È quello
           *   che fa opencode (`session/llm.ts:296-312`, clone 2026-09-24): nessun lancio, l'errore torna al modello come esito.
           */
          /*
           * ⛔ CLI 0.6.6, F-Y-001 (bugfixer, 15/10/2026) — GLI ARGOMENTI CHE ARRIVANO SOLO A CHIAMATA CHIUSA. Sul filo Responses
           *   `@ai-sdk/openai` (4.0.61, `dist/index.js:8600-8612` e `:8104-8125`) emette `tool-input-delta` solo per gli eventi
           *   `response.function_call_arguments.delta`; un servizio che porta gli argomenti SOLO in `response.output_item.done` dà
           *   `tool-input-start` e poi il `tool-call` con l'`input` intero. Prima quel `tool-call` si ignorava, e al kernel arrivava
           *   `arguments: ''`, cioè `{}`: `chatgpt_account {"action":"status"}` rispondeva «needs action» (prova F-Y-001 in
           *   `tests/indagine-cli-066.test.mjs`). Codex legge la voce CHIUSA (`codex-rs/codex-api/src/sse/responses.rs:358`, `:498`).
           * ⇒ Se per quell'id non è passato nessun pezzo di argomenti, l'input intero diventa l'UNICO pezzo; se ne sono passati, niente
           *   (mai due volte gli stessi argomenti). Una chiamata senza `tool-input-start` riceve prima la sua apertura.
           */
          if (part.type === 'tool-call' && typeof part.toolCallId === 'string' && !conArgomenti.has(part.toolCallId)) {
            const intero = typeof part.input === 'string' ? part.input : part.input === undefined ? '' : JSON.stringify(part.input);
            if (!callIndices.has(part.toolCallId)) {
              callIndices.set(part.toolCallId, callIndices.size);
              emit({ tool_calls: [{ index: callIndices.get(part.toolCallId), id: part.toolCallId, type: 'function', function: { name: alias.indietro.get(part.toolName) ?? part.toolName, arguments: '' } }] });
            }
            conArgomenti.add(part.toolCallId);
            if (intero !== '') { emit({ tool_calls: [{ index: callIndices.get(part.toolCallId), function: { arguments: intero } }] }); return; }
          }
          if (part.type === 'finish-step') usageDelloStep = part.usage; // P-J
          if (part.type === 'finish') {
            const message = responseMessage(await result.response, provider, model, part.finishReason, alias.indietro);
            // P-J — una sola chiamata/step: gli aggregati scartano raw, finish-step lo conserva.
            const usage = wireAnthropic && provider !== 'anthropic' ? usageDelloStep : part.totalUsage;
            emit(message.talos_provider_state ? { talos_provider_state: message.talos_provider_state } : {}, { usage: canonicalUsage(usage, provider) }, part.finishReason);
            controller.enqueue(encoder.encode('data: [DONE]\n\n')); completed = true; controller.close(); return;
          }
        }
      } catch (error) { completed = true; abort.abort(); controller.error(error); }
    },
    async cancel() { completed = true; abort.abort(); await iterator.return?.(); },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
}

// P-J — opzioni dei nuovi profili nel medesimo SDK; nessuna traduzione HTTP proprietaria.
/*
 * ⭐ 08/10/2026 (owner: «impossibile che su Anthropic 5.x non si possa aggiustare il ragionamento») — Anthropic nativo, ragionamento adattivo.
 *
 * Due cose che l'SDK da solo non fa per noi, entrambe provate dal vivo sulla chiave dell'owner:
 *  1. IL LIVELLO. Il `reasoning` comune dell'SDK (4.0.49, anthropic-language-model.ts:2990-3026) non conosce «max» e manda «xhigh» come «max» sui
 *     modelli che non la dichiarano: una persona che sceglie «max» avrebbe ricevuto il default. Qui il livello va per nome, nei cinque che Anthropic
 *     dichiara (`output_config.effort`), insieme a `thinking:{type:"adaptive", display:"summarized"}` (i modelli nuovi altrimenti restituiscono blocchi
 *     di pensiero VUOTI: OpenCode transform.ts:902-906).
 *  2. IL PREFISSO. Dal Fable 5.1 ogni blocco di pensiero firmato vale solo finché `system`, `tools` e i messaggi prima di lui restano uguali; per gli
 *     account creati dal 31/08/2026 un prefisso cambiato è un 400 su ogni richiesta successiva (la sessione resta incastrata). TALOS ricostruisce il
 *     prefisso tra un turno e l'altro (ripresa, compattazione, strumenti diversi): si chiede ad Anthropic di SCARTARE il blocco invalido invece di
 *     rifiutare (`thinking.block_binding.prefix_mismatch_behavior:"drop_block"`, header beta aggiunto dall'SDK). Stessa scelta di OpenCode
 *     (transform.ts:690-739, stesso motivo: «re-renders parts of that prefix between turns»). Vale per i modelli 5.1+ (misurato, binding-scope).
 *     Senza pensiero richiesto ma con blocchi firmati già in storia, si manda il solo `block_binding` (forma «recovery» dell'SDK).
 * I modelli a budget (prima del 4.6) restano sul percorso dell'SDK, come prima.
 */
const LIVELLI_ANTHROPIC = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']);
function versioneAnthropic(modello) {
  const v = /claude-(?:([a-z]+)-)?(\d+)(?:[.-](\d{1,2}))?(?:-([a-z]+))?(?:[.@-]|$)/iu.exec(String(modello ?? ''));
  return v ? { linea: (v[1] ?? v[4] ?? '').toLowerCase(), maggiore: Number(v[2]), minore: Number(v[3] ?? 0) } : null;
}
/** Ragionamento adattivo (e livello nominato): dal 4.6 in poi, e un id senza versione leggibile si tratta da moderno. */
export function anthropicPensaAdattivo(modello) {
  const v = versioneAnthropic(modello);
  return !v || v.maggiore > 4 || (v.maggiore === 4 && v.minore >= 6);
}
/** «xhigh» esiste dal 4.7 (Opus 4.7+, Sonnet 5, Fable 5): Opus/Sonnet 4.6 rispondono 400 «does not support effort level 'xhigh'» (misurato 08/10/2026). Id senza versione = moderno. */
export function anthropicAccettaXhigh(modello) {
  const v = versioneAnthropic(modello);
  return !v || v.maggiore > 4 || (v.maggiore === 4 && v.minore >= 7);
}
/** I blocchi di pensiero si legano al prefisso dal 5.1 (Mythos 5.1 no: non fa il controllo di prefisso — OpenCode transform.ts:690-701). */
export function anthropicLegaIlPensiero(modello) {
  const v = versioneAnthropic(modello);
  if (!v) return false;
  if (v.maggiore === 5 && v.minore === 1 && v.linea === 'mythos') return false;
  return v.maggiore > 5 || (v.maggiore === 5 && v.minore >= 1);
}
function opzioniAnthropicNative(provider, model, body) {
  if (!anthropicPensaAdattivo(model)) return {};
  const richiesto = body.reasoning_effort ?? body.reasoning?.effort;
  if (richiesto === 'none' || body.reasoning?.enabled === false) return {}; // lo spegnimento resta all'SDK
  const livello = LIVELLI_ANTHROPIC.includes(richiesto) ? richiesto : null;
  /* Un livello che il modello non ha non è un errore per la persona: «xhigh» su un 4.6 va come «max» (come faceva l'SDK prima, e come fanno Hermes, Pi e OpenCode).
     ⛔ Non è un clamp verso l'alto: nel kernel «xhigh» e «max» sono lo STESSO livello con due grafie (`aliasGrafiaRagionamento`, alias canonico: la vecchia etichetta
     «Massimo» del desktop mandava «xhigh»). Decisione dell'owner l'08/10/2026: una scelta salvata come «Massimo» «resta a Max». Il catalogo vivo dice già alla
     persona quali livelli ha il modello. */
  const effort = livello === 'xhigh' && !anthropicAccettaXhigh(model) ? 'max' : livello;
  if (richiesto && !effort) return {};                                       // un livello che Anthropic non conosce non si inventa
  const pensa = Boolean(effort) || body.reasoning?.enabled === true;
  const lega = anthropicLegaIlPensiero(model);
  const haBlocchi = (body.messages ?? []).some((m) => m?.role === 'assistant' && m.talos_provider_state?.provider === provider && m.talos_provider_state?.model === model
    && Array.isArray(m.talos_provider_state?.content) && m.talos_provider_state.content.some((p) => p?.type === 'reasoning'));
  if (!pensa && !(lega && haBlocchi)) return {};
  const blockBinding = lega ? { prefixMismatchBehavior: 'drop_block' } : null;
  const thinking = pensa ? { type: 'adaptive', display: 'summarized', ...(blockBinding ? { blockBinding } : {}) } : { blockBinding };
  return { anthropic: { thinking, ...(effort ? { effort } : {}) } };
}

function opzioniAnthropicTerzi(provider, model, body) {
  const record = fornitore(provider);
  if (provider === 'anthropic' || record?.wire !== 'anthropic-messages') return {};
  const effort = body.reasoning_effort ?? body.reasoning?.effort;
  const rifiuta = motivo => { throw Object.assign(new Error(`${record.etichetta}: ${motivo}`), { code: 'PROVIDER_REASONING_UNSUPPORTED' }); };
  if (provider === 'zai-anthropic') {
    /* ⛔ 05/10/2026, BUG-18 gen.2 — riconciliazione con la fonte datata
       docs.z.ai/devpack/latest-model (riletta 05/10/2026, HTTP 200): sulla porta Anthropic
       «reasoning_effort» minimal/light/low → effort «low», medium/high → «high»,
       xhigh/max/ultra → «max», e «Disabling the thinking configuration is converted to `low`
       and does not switch to another model». Dunque: «low» È documentato (il vecchio rifiuto
       del 12/09, nato quando il registro diceva ['high','max'], cede al dato); lo spegnimento
       si traduce nel floor «low» della porta, non si rifiuta; «medium» NON passa perché la
       conversione della porta la porterebbe a «high» — mai più caro del chiesto (regola 24/09). */
    const livelli = record.ragionamento.livelli;
    if (body.reasoning?.enabled === false) {
      return { anthropic: { thinking: { type: 'adaptive' }, effort: 'low' } };
    }
    if (effort && !livelli.includes(effort)) {
      rifiuta(`the level "${effort}" is not documented on this port (documented: ${livelli.join(', ')} — docs.z.ai/devpack/latest-model, 05/10/2026).`);
    }
    return effort || body.reasoning?.enabled === true ? { anthropic: { thinking: { type: 'adaptive' }, ...(effort ? { effort } : {}) } } : {};
  }
  if (provider === 'minimax-anthropic') {
    if (body.stop) rifiuta('stop sequences are not supported on this route.');
    if (effort) rifiuta('reasoning effort levels are not documented on this route.');
    if (typeof body.reasoning?.enabled === 'boolean') {
      if (model !== 'MiniMax-M3') rifiuta('this model does not declare reasoning control.');
      return { anthropic: { thinking: { type: body.reasoning.enabled ? 'adaptive' : 'disabled' } } };
    }
  }
  return {};
}
// P-J — FINE opzioni dei profili.
