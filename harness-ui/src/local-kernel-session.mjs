/** Opt-in bridge into the existing desktop agent kernel, not an agent loop. */
import { LocalKernelError, localKernelStream, localCompletionStream, readLocalJson, validateLocalCompletion } from './local-kernel-stream.mjs';

const fail = (code, message) => { throw new LocalKernelError(message, code); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function localKernelRequest(body, modelId) {
  if (!object(body) || body.model !== `local:${modelId}` || !Array.isArray(body.messages)) {
    fail('LOCAL_KERNEL_DESTINATION', 'Questo giro può usare soltanto il modello locale selezionato.');
  }
  if (body.n !== undefined && body.n !== 1) fail('LOCAL_KERNEL_REQUEST_INVALID', 'Una sola scelta è consentita per giro agente.');
  const request = { ...body, model: modelId };
  // Remove only transport-specific annotations, preserving actual text and
  // native tool IDs/results. Never mutate the canonical conversation.
  request.messages = body.messages.map(message => {
    if (!object(message)) fail('LOCAL_KERNEL_REQUEST_INVALID', 'Messaggio locale non valido.');
    const { talos_provider_state, ...copy } = message;
    if (Array.isArray(copy.content)) copy.content = copy.content.map(part => {
      if (!object(part)) fail('LOCAL_KERNEL_REQUEST_INVALID', 'Blocco di contenuto locale non valido.');
      const { cache_control, ...content } = part;
      if (content.type === 'image_url' && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/u.test(content.image_url?.url ?? '')) {
        fail('LOCAL_KERNEL_IMAGE_UNRESOLVED', 'L’immagine deve essere risolta localmente prima dell’inferenza.');
      }
      return content;
    });
    return copy;
  });
  if (request.reasoning != null) {
    const reasoning = request.reasoning;
    if (!object(reasoning) || Object.keys(reasoning).some(k => !['effort', 'enabled'].includes(k))
        || (reasoning.effort !== undefined && (typeof reasoning.effort !== 'string' || reasoning.effort === ''))
        || (reasoning.enabled !== undefined && typeof reasoning.enabled !== 'boolean')) {
      fail('LOCAL_KERNEL_REASONING_UNSUPPORTED', 'Opzioni di ragionamento locali non traducibili senza perdita.');
    }
    const effort = reasoning.enabled === false ? 'none' : reasoning.effort;
    if ((reasoning.enabled === false && reasoning.effort !== undefined && reasoning.effort !== 'none')
        || (reasoning.enabled === true && effort === 'none')
        || (effort !== undefined && request.reasoning_effort !== undefined && request.reasoning_effort !== effort)
        || (reasoning.enabled === true && effort === undefined && request.reasoning_effort === undefined)) {
      fail('LOCAL_KERNEL_REASONING_UNSUPPORTED', 'Preferenze di ragionamento locali discordanti o non documentate.');
    }
    if (effort !== undefined) request.reasoning_effort = effort;
    delete request.reasoning;
  }
  // Sampling, token budgets, tool schemas, tool_choice and cache_prompt keep
  // the caller's values; no hidden max_tokens=512 or speculative tuning.
  return request;
}

export function createLocalKernelRunner({ getSupervisor, runSession, probeTimeoutMs = 10000 } = {}) {
  if (typeof getSupervisor !== 'function' || typeof runSession !== 'function'
      || !Number.isSafeInteger(probeTimeoutMs) || probeTimeoutMs < 1) throw new TypeError('Local kernel dependencies are required');
  return async function runLocalKernel({ runtimeId, modelId, sessionId, fallbackConsent, onRuntimeInvalidated, ...options }) {
    if (runtimeId !== 'llama.cpp' || typeof modelId !== 'string' || !modelId.trim()) {
      fail('LOCAL_KERNEL_REQUEST_INVALID', 'Runtime o modello locale non valido.');
    }
    if (fallbackConsent === true || (options.fallbackProviders?.length ?? 0) !== 0) {
      fail('LOCAL_KERNEL_FALLBACK_UNSUPPORTED', 'Il percorso kernel locale sperimentale non ritenta l’intero giro nel cloud. Disattiva il fallback per usarlo.');
    }
    const model = `local:${modelId}`;
    if (options.modelloPlanner && options.modelloPlanner !== model) {
      fail('LOCAL_KERNEL_PLANNER_UNSUPPORTED', 'Il planner deve usare lo stesso modello locale in questo percorso sperimentale.');
    }
    // External context compaction can invoke a separately configured model.
    // It needs its own local provider contract before combining the two trials.
    if (options.contextHooks) fail('LOCAL_KERNEL_CONTEXT_TRIAL_UNSUPPORTED', 'Il trial context-engine non è ancora qualificato con il kernel locale.');
    options.segnaleStop?.throwIfAborted();
    const supervisor = getSupervisor();
    if (typeof supervisor?.bindModel !== 'function') fail('LOCAL_KERNEL_BINDING_UNAVAILABLE', 'Il supervisore non espone l’associazione sicura al modello.');
    const binding = supervisor.bindModel(modelId);
    const signal = options.segnaleStop ? AbortSignal.any([options.segnaleStop, binding.signal]) : binding.signal;
    const invalidated = () => onRuntimeInvalidated?.(binding.signal.reason);
    binding.signal.addEventListener('abort', invalidated, { once: true });
    const unsupportedNested = async () => fail('LOCAL_KERNEL_NESTED_UNSUPPORTED', 'Non riesco ad avviare inferenza delegata o Deep Research in questo percorso locale sperimentale: nessuna sessione remota è stata creata.');
    try {
      const probeSignal = AbortSignal.any([signal, AbortSignal.timeout(probeTimeoutMs)]);
      const propsResponse = await binding.request('/props', { signal: probeSignal });
      if (!propsResponse.ok) fail('LOCAL_KERNEL_PROBE_FAILED', `La verifica del motore locale è fallita (HTTP ${propsResponse.status}).`);
      const props = await readLocalJson(propsResponse, { signal: probeSignal });
      binding.assertReady();
      const caps = props?.chat_template_caps;
      if (typeof props?.chat_template !== 'string' || !props.chat_template.trim()
          || !['supports_tools', 'supports_tool_calls', 'supports_system_role'].every(key => caps?.[key] === true)) {
        fail('LOCAL_KERNEL_TEMPLATE_UNSUPPORTED', 'Il template caricato non dichiara sistema e strumenti nativi: il giro non è stato avviato.');
      }
      const fetchLocal = async (_url, init = {}) => {
        signal.throwIfAborted(); binding.assertReady();
        // The kernel still names its abstract OpenRouter endpoint. It is never
        // contacted: this closure has exactly one destination, owned by binding.
        if (init.method !== 'POST' || typeof init.body !== 'string') fail('LOCAL_KERNEL_REQUEST_INVALID', 'Richiesta kernel locale non valida.');
        let body;
        try { body = JSON.parse(init.body); } catch { fail('LOCAL_KERNEL_REQUEST_INVALID', 'Richiesta kernel locale non JSON.'); }
        body = localKernelRequest(body, modelId);
        const requestSignal = init.signal ? AbortSignal.any([signal, init.signal]) : signal;
        const response = await binding.request('/v1/chat/completions', {
          method: 'POST', signal: requestSignal,
          headers: { 'Content-Type': 'application/json', Accept: body.stream === true ? 'text/event-stream' : 'application/json' },
          body: JSON.stringify(body),
        });
        if (!response.ok) return response;
        if (body.stream === true) {
          if (/^application\/json(?:;|$)/iu.test(response.headers.get('content-type') ?? '')) {
            return localCompletionStream(await readLocalJson(response, { signal: requestSignal }));
          }
          return localKernelStream(response, { signal: requestSignal });
        }
        const completion = validateLocalCompletion(await readLocalJson(response, { signal: requestSignal }));
        return Response.json(completion);
      };
      return await runSession({
        ...options, modello: model, chiave: undefined, segnaleStop: signal,
        localInference: Object.freeze({ fetch: fetchLocal }),
        onDelega: unsupportedNested, onRicercaAvvia: unsupportedNested,
        hookFn: async event => {
          signal.throwIfAborted(); binding.assertReady();
          const result = typeof options.hookFn === 'function' ? await options.hookFn(event) : { consentito: true };
          signal.throwIfAborted(); binding.assertReady();
          return result;
        },
        onEvento: (event, eventOptions) => options.onEvento?.({ ...event, provider: 'local', runtimeId, modelId, backend: runtimeId, at: event.at ?? new Date().toISOString() }, eventOptions),
      });
    } finally {
      binding.signal.removeEventListener('abort', invalidated);
      binding.release();
    }
  };
}
