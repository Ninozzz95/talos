import { ID_MOTORI_LOCALI_OPENAI, REGISTRO_FORNITORI } from './provider-registry.mjs';
import { createStreamPartitioner } from './stream-partition.mjs';

/*
 * ⛔ 12/09 — P-A: l'ottavo dei tredici elenchi. Era l'UNICO posto del repo che conoscesse
 *   `lmstudio`, e proprio per questo LM Studio era scoperto, sondato, caricabile e scaricabile —
 *   e non sceglibile in chat. Adesso i due motori locali su wire OpenAI li nomina il registro.
 */
const PROVIDERS = Object.freeze(Object.fromEntries(ID_MOTORI_LOCALI_OPENAI
  .map((id) => [id, Object.freeze({ baseUrl: REGISTRO_FORNITORI[id].baseUrl, listPath: REGISTRO_FORNITORI[id].catalogo.percorso })])));

export class OpenAiCompatibleRuntimeError extends Error {
  constructor(message, code = 'RUNTIME_FAILED') {
    super(message);
    this.name = 'OpenAiCompatibleRuntimeError';
    this.code = code;
  }
}

function fail(message, code = 'RUNTIME_INVALID') {
  throw new OpenAiCompatibleRuntimeError(message, code);
}

/**
 * P-D, 12/09/2026: adatta il corpo HTTP secondo il profilo del registro.
 * `extra_body` appartiene agli SDK Python: sul wire i campi sono al primo livello.
 * Gli avvisi sono dati locali da rendere al chiamante, mai campi inviati al modello.
 * Il chiamante di produzione richiede l'aggancio in runtime-owner-adapter.mjs:
 * diff non applicato nel rapporto P-D, perché fuori dal perimetro assegnato.
 */
export function preparaRichiestaCompatibile(provider, corpo) {
  const record = REGISTRO_FORNITORI[provider];
  if (record?.richiestaCompatibile) return preparaProfiloCompatibile(record, corpo);
  if (record?.ragionamento?.formato !== 'thinking') return { corpo, avvisi: [] };
  const oggetto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!oggetto(corpo) || typeof corpo.model !== 'string') fail(`Richiesta ${record.etichetta} non valida.`);
  if (corpo.extra_body !== undefined && !oggetto(corpo.extra_body)) fail(`Opzioni ${record.etichetta} non valide.`);
  const unito = { ...corpo, ...(corpo.extra_body ?? {}) };
  const { extra_body, reasoning, reasoning_effort, thinking, ...resto } = unito;
  if (thinking !== undefined && (!oggetto(thinking) || !['enabled', 'disabled'].includes(thinking.type))) fail(`Controllo del ragionamento ${record.etichetta} non valido.`);
  const id = corpo.model.startsWith(`${provider}:`) ? corpo.model.slice(provider.length + 1) : corpo.model;
  const modello = record.modelliNoti.find(m => m.id === id);
  const opzioni = modello?.ragionamento;
  const avvisi = [];
  const effort = reasoning_effort ?? reasoning?.effort;
  const richiesto = typeof effort === 'string' ? effort.trim().toLowerCase() : effort;
  const preferenza = thinking?.type ?? (reasoning?.enabled === false || richiesto === 'none' ? 'disabled' : reasoning?.enabled === true || richiesto != null ? 'enabled' : undefined);
  // L'involucro extra non può cambiare la destinazione o il contenuto dell'utente.
  const risultato = { ...resto, model: corpo.model, ...(corpo.messages !== undefined ? { messages: corpo.messages } : {}) };
  if (preferenza !== undefined && opzioni?.thinking?.length) {
    let tipo = preferenza;
    if (!opzioni.thinking.includes(tipo)) {
      tipo = 'enabled';
      avvisi.push(`${record.etichetta} · ${modello.nome}: il modello non consente di disattivare il ragionamento; resta attivo.`);
    }
    risultato.thinking = { type: tipo, ...(typeof thinking?.clear_thinking === 'boolean' ? { clear_thinking: thinking.clear_thinking } : {}) };
  } else if (preferenza !== undefined && richiesto == null) {
    avvisi.push(`${record.etichetta}: controllo del ragionamento non documentato per questo modello; non inviato.`);
  }
  if (richiesto != null) {
    if (!opzioni?.livelli.includes(richiesto)) {
      avvisi.push(`${record.etichetta}: livello di ragionamento richiesto non previsto dal profilo P-D per questo modello; non inviato.`);
    } else if (risultato.thinking?.type !== 'disabled') {
      risultato.reasoning_effort = richiesto;
    } else {
      avvisi.push(`${record.etichetta}: livello di ragionamento non inviato perché il ragionamento è disattivato.`);
    }
  }
  return { corpo: risultato, avvisi };
}

/** P-G, 12/09/2026: sole differenze documentate nel record, senza confronti sui fornitori. */
function preparaProfiloCompatibile(record, corpo) {
  const oggetto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!oggetto(corpo) || typeof corpo.model !== 'string' || !corpo.model.trim()) fail(`Richiesta ${record.etichetta} non valida.`);
  const profilo = record.richiestaCompatibile;
  const id = corpo.model.startsWith(`${record.id}:`) ? corpo.model.slice(record.id.length + 1) : corpo.model;
  const modello = Object.hasOwn(profilo.modelli, id) ? profilo.modelli[id] : null;
  const risultato = { ...corpo };
  const avvisi = [];

  if (modello?.strumentiConFormato === false && corpo.tools != null && corpo.response_format != null) {
    fail(`${record.etichetta}: questo modello non consente strumenti e formato di risposta vincolato nella stessa richiesta.`);
  }
  if (profilo.limiteUscita === 'max_completion_tokens' && Object.hasOwn(corpo, 'max_tokens')) {
    if (corpo.max_tokens != null && corpo.max_completion_tokens != null && corpo.max_completion_tokens !== corpo.max_tokens) {
      fail(`${record.etichetta}: sono stati indicati due limiti di uscita diversi.`);
    }
    risultato.max_completion_tokens = corpo.max_completion_tokens ?? corpo.max_tokens;
    delete risultato.max_tokens;
  }

  if (profilo.ragionamento === 'effort' && corpo.reasoning != null) {
    if (!oggetto(corpo.reasoning)) fail(`Opzioni di ragionamento ${record.etichetta} non valide.`);
    const { effort, enabled, ...altre } = corpo.reasoning;
    if (effort != null && typeof effort !== 'string') fail(`Livello di ragionamento ${record.etichetta} non valido.`);
    if (enabled !== undefined && typeof enabled !== 'boolean') fail(`Controllo del ragionamento ${record.etichetta} non valido.`);
    const richiesto = enabled === false ? 'none' : effort;
    if ((enabled === false && effort != null && effort !== 'none')
      || (richiesto != null && corpo.reasoning_effort != null && corpo.reasoning_effort !== richiesto)) {
      fail(`${record.etichetta}: sono state indicate preferenze di ragionamento discordanti.`);
    }
    delete risultato.reasoning;
    if (richiesto != null) risultato.reasoning_effort = richiesto;
    if (Object.keys(altre).length || (enabled === true && richiesto == null && corpo.reasoning_effort == null)) {
      avvisi.push(`${record.etichetta}: alcune opzioni di ragionamento non hanno una traduzione documentata; non inviate.`);
    }
  }
  // Un modello futuro o non documentato conserva i parametri: nessuna incompatibilità dedotta.
  if (risultato.reasoning_effort != null && modello?.livelliRagionamento
    && !modello.livelliRagionamento.includes(risultato.reasoning_effort)) {
    delete risultato.reasoning_effort;
    avvisi.push(`${record.etichetta}: il livello di ragionamento richiesto non è documentato per questo modello; non inviato.`);
  }
  return { corpo: risultato, avvisi };
}

function capability(value) {
  return typeof value === 'boolean' ? { state: 'observed', value } : { state: 'unknown', value: null };
}

function context(value) {
  return Number.isSafeInteger(value) && value > 0
    ? { state: 'observed', value }
    : { state: 'unknown', value: null };
}

async function readJson(response) {
  if (!response?.ok) throw new OpenAiCompatibleRuntimeError(`runtime returned HTTP ${response?.status ?? 0}`, 'RUNTIME_HTTP_ERROR');
  try { return await response.json(); } catch { throw new OpenAiCompatibleRuntimeError('runtime returned invalid JSON', 'RUNTIME_RESPONSE_INVALID'); }
}

async function* readStreamLines(response) {
  if (!response?.ok) throw new OpenAiCompatibleRuntimeError(`runtime returned HTTP ${response?.status ?? 0}`, 'RUNTIME_HTTP_ERROR');
  if (!response.body || typeof response.body.getReader !== 'function') fail('runtime stream body is unavailable', 'RUNTIME_RESPONSE_INVALID');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/u);
      buffer = lines.pop() ?? '';
      yield* lines;
      if (done) break;
    }
    if (buffer.trim() !== '') yield buffer;
  } finally { await reader.cancel().catch(() => {}); }
}

function normalizeOllamaModel(raw, observedAt) {
  const id = typeof raw?.name === 'string' && raw.name.trim() ? raw.name : '';
  if (!id) return null;
  const details = raw.details ?? {};
  return {
    id,
    name: id,
    source: 'ollama',
    context: context(details.context_length),
    verifiedContext: Number.isSafeInteger(details.context_length) && details.context_length > 0,
    capabilities: {
      vision: capability(Array.isArray(details.families) && details.families.some((family) => /(?:clip|vision|llava)/iu.test(family))),
      toolUse: { state: 'unknown', value: null },
      reasoning: { state: 'unknown', value: null },
    },
    sizeBytes: Number.isSafeInteger(raw.size) ? raw.size : null,
    quantization: typeof details.quantization_level === 'string' ? details.quantization_level : null,
    observedAt,
  };
}

function normalizeLmModel(raw, observedAt) {
  if (raw?.type !== 'llm' || typeof raw.key !== 'string' || raw.key.trim() === '') return null;
  const reasoning = raw.capabilities?.reasoning;
  const allowedReasoning = Array.isArray(reasoning?.allowed_options) ? reasoning.allowed_options : [];
  return {
    id: raw.key,
    name: typeof raw.display_name === 'string' && raw.display_name ? raw.display_name : raw.key,
    source: 'lmstudio',
    context: context(raw.max_context_length),
    verifiedContext: Number.isSafeInteger(raw.max_context_length) && raw.max_context_length > 0,
    capabilities: {
      vision: capability(raw.capabilities?.vision),
      toolUse: capability(raw.capabilities?.trained_for_tool_use),
      reasoning: allowedReasoning.length > 0 ? { state: 'observed', value: true } : { state: 'observed', value: false },
    },
    sizeBytes: Number.isSafeInteger(raw.size_bytes) ? raw.size_bytes : null,
    quantization: typeof raw.quantization?.name === 'string' ? raw.quantization.name : null,
    observedAt,
  };
}

export function createOpenAiCompatibleRuntime({
  fetchImpl = fetch,
  now = () => new Date(),
  endpoints = {},
} = {}) {
  const activeRequests = new Map();
  /*
   * ⛔ 12/09 — L'INDIRIZZO SI RILEGGE A OGNI CHIAMATA, e non si fotografa all'avvio.
   *
   *   `endpoints[id]` può essere un oggetto (com'era) oppure una FUNZIONE che lo torna adesso. La
   *   differenza conta: chi cambia l'indirizzo di LM Studio nel pannello Provider a server acceso
   *   lo cambia per la chat (`model-destination.mjs` legge il portachiavi a ogni richiesta) — se
   *   il catalogo restasse sull'indirizzo di partenza, la scheda elencherebbe i modelli di un
   *   motore e la chat ne chiamerebbe un altro, senza un errore da nessuna parte.
   *   ⛔ Un override che lancia non spegne il motore: si torna al valore del registro.
   */
  function config(provider) {
    if (!Object.hasOwn(PROVIDERS, provider)) fail(`unknown local provider: ${provider}`);
    const override = endpoints[provider];
    let scelto = override;
    if (typeof override === 'function') { try { scelto = override(); } catch { scelto = null; } }
    return { ...PROVIDERS[provider], ...(scelto && typeof scelto === 'object' ? scelto : {}) };
  }

  async function request(provider, path, options = {}) {
    const target = `${config(provider).baseUrl}${path}`;
    try { return await fetchImpl(target, { ...options, headers: { Accept: 'application/json', ...(options.headers ?? {}) } }); }
    catch (error) {
      if (error?.name === 'AbortError') throw error;
      throw new OpenAiCompatibleRuntimeError(`runtime ${provider} unreachable: ${error.message}`, 'RUNTIME_UNREACHABLE');
    }
  }

  async function detect(provider) {
    const observedAt = now().toISOString();
    try {
      const body = await readJson(await request(provider, config(provider).listPath));
      const valid = provider === 'ollama' ? Array.isArray(body?.models) : Array.isArray(body?.models);
      if (!valid) return { provider, state: 'unknown', baseUrl: config(provider).baseUrl, observedAt, failureReason: 'INVALID_RESPONSE' };
      return { provider, state: 'observed', baseUrl: config(provider).baseUrl, observedAt };
    } catch (error) {
      return { provider, state: 'unknown', baseUrl: config(provider).baseUrl, observedAt, failureReason: error.code || 'RUNTIME_FAILED' };
    }
  }

  async function listModels(provider) {
    const body = await readJson(await request(provider, config(provider).listPath));
    if (!Array.isArray(body?.models)) fail('runtime model list is invalid', 'RUNTIME_RESPONSE_INVALID');
    const observedAt = now().toISOString();
    const normalize = provider === 'ollama' ? normalizeOllamaModel : normalizeLmModel;
    return body.models.map((model) => normalize(model, observedAt)).filter(Boolean);
  }

  async function inspect(provider, modelId) {
    const model = (await listModels(provider)).find(({ id }) => id === modelId);
    if (!model) fail(`model ${modelId} not found in ${provider}`, 'MODEL_NOT_FOUND');
    return model;
  }

  async function load(provider, modelId, { contextLength } = {}) {
    if (provider !== 'lmstudio') fail('Ollama manages loading through its own lifecycle', 'RUNTIME_OPERATION_UNSUPPORTED');
    const body = await readJson(await request(provider, '/api/v1/models/load', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: modelId, ...(contextLength ? { context_length: contextLength } : {}) }) }));
    if (!['loaded', 'already_loaded'].includes(body?.status)) fail('LM Studio did not confirm model load', 'MODEL_LOAD_UNCONFIRMED');
    return { state: 'loaded', provider, modelId, observedAt: now().toISOString() };
  }

  async function unload(provider, modelId) {
    if (provider !== 'lmstudio') fail('Ollama manages unloading through its own lifecycle', 'RUNTIME_OPERATION_UNSUPPORTED');
    const body = await readJson(await request(provider, '/api/v1/models/unload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: modelId }) }));
    if (!['unloaded', 'already_unloaded'].includes(body?.status)) fail('LM Studio did not confirm model unload', 'MODEL_UNLOAD_UNCONFIRMED');
    return { state: 'unloaded', provider, modelId, observedAt: now().toISOString() };
  }

  async function* generateStream({ provider, modelId, messages, tools, signal, requestId } = {}) {
    if (!Array.isArray(messages) || typeof modelId !== 'string' || modelId.trim() === '') fail('stream request is invalid');
    const controller = new AbortController();
    if (signal?.aborted) controller.abort(signal.reason);
    const combinedSignal = signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    if (signal && typeof AbortSignal.any !== 'function') signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
    if (requestId) activeRequests.set(requestId, controller);
    const isOllama = provider === 'ollama';
    const body = isOllama
      ? { model: modelId, messages, stream: true, ...(tools ? { tools } : {}) }
      : { model: modelId, messages, stream: true, ...(tools ? { tools } : {}) };
    let taggedEvents = [];
    const taggedContent = createStreamPartitioner({
      onText: (value) => taggedEvents.push({ type: 'text', value }),
      onReasoning: (value) => taggedEvents.push({ type: 'reasoning', value }),
      onToolCall: (value) => taggedEvents.push({ type: 'tool_call', ...value }),
    });
    const flushTaggedEvents = function* () {
      const events = taggedEvents;
      taggedEvents = [];
      for (const event of events) yield event;
    };
    try {
      const response = await request(provider, isOllama ? '/api/chat' : '/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: isOllama ? 'application/x-ndjson' : 'text/event-stream' }, body: JSON.stringify(body), signal: combinedSignal });
      for await (const line of readStreamLines(response)) {
      const trimmed = line.trim();
      if (!trimmed || (!isOllama && !trimmed.startsWith('data:'))) continue;
      const payload = isOllama ? trimmed : trimmed.slice(5).trim();
      if (payload === '[DONE]') { taggedContent.finish(); yield* flushTaggedEvents(); yield { type: 'done' }; return; }
      let chunk;
      try { chunk = JSON.parse(payload); } catch { yield { type: 'error', code: 'RUNTIME_RESPONSE_INVALID', message: 'runtime emitted malformed stream JSON' }; continue; }
      if (isOllama) {
        if (typeof chunk.message?.thinking === 'string' && chunk.message.thinking) yield { type: 'reasoning', value: chunk.message.thinking };
        if (typeof chunk.message?.content === 'string' && chunk.message.content) {
          taggedContent.push(chunk.message.content);
          yield* flushTaggedEvents();
        }
        for (const call of chunk.message?.tool_calls ?? []) yield { type: 'tool_call', name: call.function?.name ?? '', arguments: call.function?.arguments ?? {} };
        if (chunk.done === true) yield { type: 'done' };
      } else {
        const delta = chunk.choices?.[0]?.delta ?? {};
        const reasoning = delta.reasoning_content ?? delta.reasoning;
        if (typeof reasoning === 'string' && reasoning) yield { type: 'reasoning', value: reasoning };
        if (typeof delta.content === 'string' && delta.content) {
          taggedContent.push(delta.content);
          yield* flushTaggedEvents();
        }
        for (const call of delta.tool_calls ?? []) yield { type: 'tool_call', id: call.id, name: call.function?.name ?? '', arguments: call.function?.arguments ?? '' };
      }
      }
      taggedContent.finish();
      yield* flushTaggedEvents();
    } finally {
      if (requestId) activeRequests.delete(requestId);
    }
  }

  function cancel(requestId) {
    const controller = activeRequests.get(requestId);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  async function health(provider) {
    const response = await request(provider, provider === 'ollama' ? '/' : '/api/v1/models');
    return { provider, ok: Boolean(response.ok), observedAt: now().toISOString() };
  }

  return Object.freeze({ detect, listModels, inspect, load, unload, generateStream, cancel, health });
}
