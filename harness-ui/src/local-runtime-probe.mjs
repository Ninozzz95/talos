/**
 * Unisce cartella e file del manifest. ⛔ Non usa `node:path.join`: i
 * percorsi del manifest sono relativi e sempre con `/` (validati così da
 * `local-model-store.mjs`), e su Windows `join` li riscriverebbe con `\`,
 * cambiando una stringa che il chiamante potrebbe confrontare. Il
 * chiamante ci antepone la radice assoluta con il join vero.
 */
function joinPosix(cartella, file) {
  return `${String(cartella).replace(/[/\\]+$/u, '')}/${String(file).replace(/^[/\\]+/u, '')}`;
}

export class LocalRuntimeProbeError extends Error {
  constructor(message, code = 'LOCAL_RUNTIME_PROBE_FAILED') {
    super(message);
    this.name = 'LocalRuntimeProbeError';
    this.code = code;
  }
}

const unknown = () => ({ state: 'unknown', value: null });
const fact = (state, value) => ({ state, value });
const positiveInteger = (value) => Number.isSafeInteger(value) && value > 0;

function observedString(value) {
  return typeof value === 'string' && value.trim() !== '' ? fact('observed', value) : unknown();
}

function observedBoolean(value) {
  return typeof value === 'boolean' ? fact('observed', value) : unknown();
}

function validateHeader(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || value.magic !== 'GGUF' || value.version !== 3
    || !positiveInteger(value.trainedContext)
    || !positiveInteger(value.estimatedWorkingBytes)) {
    throw new LocalRuntimeProbeError('GGUF header is invalid', 'MODEL_HEADER_INVALID');
  }
  return value;
}

function parseTokensPerSecond(value) {
  if (typeof value !== 'string') return unknown();
  for (const line of value.split(/\r?\n/u)) {
    const match = line.match(/^llamacpp:predicted_tokens_seconds(?:\{[^}]*\})?\s+([^\s]+)$/u);
    const number = match ? Number(match[1]) : NaN;
    if (Number.isFinite(number) && number >= 0) return fact('observed', number);
  }
  return unknown();
}

export function createLocalRuntimeProbe({
  runtime,
  modelStore,
  readHeader,
  measureMachine,
  now = () => new Date(),
  clockMs = () => performance.now(),
} = {}) {
  if (!runtime || typeof runtime.probe !== 'function' || typeof runtime.generateStream !== 'function'
    || !modelStore || typeof modelStore.inspect !== 'function'
    || typeof readHeader !== 'function' || typeof measureMachine !== 'function') {
    throw new LocalRuntimeProbeError('probe dependencies are invalid', 'LOCAL_RUNTIME_PROBE_MISCONFIGURED');
  }

  async function readRuntimeProps() {
    try {
      const props = await runtime.probe();
      if (!props || typeof props !== 'object' || Array.isArray(props)) throw new Error('invalid response');
      return props;
    } catch (error) {
      if (error instanceof LocalRuntimeProbeError) throw error;
      throw new LocalRuntimeProbeError(`runtime probe failed: ${error?.message || 'unknown error'}`, 'RUNTIME_PROBE_FAILED');
    }
  }

  /**
   * @param {string} modelId
   * @param {{contextTokens?: number}} [opzioni] `contextTokens` = il contesto
   *   per cui si vuole la stima di memoria. ⛔ Assente = si usa quello
   *   ADDESTRATO, che per un modello a contesto lungo è enormemente più
   *   grande di quello che si userà davvero (sul Qwen3 27B: 262.144 token
   *   invece dei 65.536 richiesti, un fattore 4 di sovrastima). `fit()` lo
   *   passa sempre; resta opzionale per non rompere chi chiama
   *   `inspectModel` da solo per sapere cosa dichiara il file.
   */
  async function inspectModel(modelId, { contextTokens } = {}) {
    const manifest = await modelStore.inspect(modelId);
    if (!manifest) throw new LocalRuntimeProbeError(`model ${modelId} not found`, 'MODEL_NOT_FOUND');
    if (manifest.state !== 'ready') throw new LocalRuntimeProbeError(`model ${modelId} is not ready`, 'MODEL_NOT_READY');

    let header;
    try {
      /*
       * ⛔⛔⛔ 02/9 (sera) — QUI si passava `manifest.path` da solo, e
       * `manifest.path` è la CARTELLA del modello, non il file: il lettore
       * riceveva una directory e falliva sempre con
       * `MODEL_HEADER_UNREADABLE`. Il difetto è mio, del collegamento
       * scritto stamattina, e non era emerso perché i test iniettano un
       * `readHeader` finto (a cui il percorso non importa) e sulla macchina
       * non c'era NESSUN modello registrato con cui provarlo dal vivo:
       * è saltato fuori solo dopo aver reimportato due GGUF veri.
       * ⇒ Il percorso si compone qui, dove si conosce la forma del
       * manifest (cartella + primo file), esattamente come già faceva
       * `load` in `server.mjs`; la radice assoluta la mette il chiamante,
       * che è l'unico a conoscerla.
       */
      const file = Array.isArray(manifest.files) ? manifest.files[0] : null;
      if (!file || typeof file.path !== 'string') throw new LocalRuntimeProbeError(`model ${modelId} has no file to inspect`, 'MODEL_HEADER_UNREADABLE');
      header = validateHeader(await readHeader(joinPosix(manifest.path, file.path)));
    } catch (error) {
      if (error instanceof LocalRuntimeProbeError) throw error;
      throw new LocalRuntimeProbeError(`cannot read model header: ${error?.message || 'unknown error'}`, 'MODEL_HEADER_UNREADABLE');
    }

    /*
     * ⛔⛔ 02/9 (sera) — `readRuntimeProps()` LANCIA se il runtime locale
     * non risponde, e faceva abortire tutta `inspectModel`: `/fit`
     * rispondeva `RUNTIME_PROBE_FAILED` anche quando aveva già letto
     * l'header e poteva dire cose vere su spazio, memoria e contesto
     * addestrato. Incoerente col disegno di questo stesso file: tutto ciò
     * che segue è GIÀ scritto per degradare (`unknown()`,
     * `observedBoolean(caps?.…)`), e `fit()` ha lo stato `unknown` con
     * motivo `context` esattamente per questo caso.
     * ⇒ Un runtime spento non è un errore della lettura: è un fatto NON
     * OSSERVATO, e si dichiara come tale invece di rifiutare la risposta.
     * ⛔ `qualify()` resta severo: chiede `fit()` compatibile e con
     * `unknown` si ferma da solo — un giro di generazione vero senza
     * runtime non deve neanche essere tentato.
     */
    let props = {};
    try {
      props = await readRuntimeProps();
    } catch (error) {
      if (!(error instanceof LocalRuntimeProbeError) || error.code !== 'RUNTIME_PROBE_FAILED') throw error;
    }
    const runtimeTokens = props.default_generation_settings?.n_ctx;
    const runtimeContext = positiveInteger(runtimeTokens) ? fact('observed', runtimeTokens) : unknown();
    const caps = props.chat_template_caps;
    return {
      modelId: manifest.id,
      format: { state: 'observed', magic: 'GGUF', version: 3 },
      storageBytes: { state: 'declared', value: manifest.bytes },
      /*
       * ⛔ 02/9 (sera) — si stima sul contesto RICHIESTO quando il lettore
       * espone il costo per token; senza quel dato (header vecchio o file
       * che non dichiara le teste) si ricade sulla stima del file, che usa
       * il contesto addestrato. Il tetto è il contesto addestrato: chiedere
       * più di quanto il modello sa fare non costa più memoria, semmai è il
       * controllo sul contesto a bocciarlo, e con un motivo suo.
       */
      workingMemoryBytes: {
        state: 'declared',
        // ⛔ Math.ceil come nel lettore: il consumatore a valle pretende interi.
        value: (Number.isSafeInteger(header.kvCacheBytesPerToken) && Number.isSafeInteger(contextTokens) && contextTokens > 0)
          ? Math.ceil((header.estimatedWorkingBytes - header.kvCacheBytesPerToken * header.trainedContext)
            + header.kvCacheBytesPerToken * Math.min(contextTokens, header.trainedContext))
          : header.estimatedWorkingBytes,
      },
      context: {
        trainedTokens: fact('declared', header.trainedContext),
        runtimeTokens: runtimeContext,
        effectiveTokens: runtimeContext.state === 'observed'
          ? fact('observed', Math.min(header.trainedContext, runtimeContext.value))
          : fact('declared', header.trainedContext),
      },
      template: typeof props.chat_template === 'string' && props.chat_template !== ''
        ? fact('observed', true)
        : unknown(),
      capabilities: {
        tools: observedBoolean(caps?.supports_tools),
        toolCalls: observedBoolean(caps?.supports_tool_calls),
        systemRole: observedBoolean(caps?.supports_system_role),
      },
      backend: observedString(props.backend),
      build: observedString(props.build),
      observedAt: now().toISOString(),
    };
  }

  async function measureBackend() {
    const props = await readRuntimeProps();
    return {
      backend: observedString(props.backend),
      thermal: unknown(),
      observedAt: now().toISOString(),
    };
  }

  async function fit(modelId, { profile = 'agent', contextTokens = profile === 'agent' ? 65_536 : 4_096 } = {}) {
    if (!['agent', 'chat'].includes(profile) || !positiveInteger(contextTokens)) {
      throw new LocalRuntimeProbeError('fit request is invalid', 'FIT_INVALID');
    }
    // ⛔ Il contesto RICHIESTO arriva fin qui: è quello per cui la memoria va stimata.
    const inspection = await inspectModel(modelId, { contextTokens });
    let machine;
    try {
      machine = await measureMachine();
    } catch {
      return { modelId, profile, state: 'unknown', reason: 'measurement', inspection };
    }
    const storageAvailable = machine?.storage?.allocatableBytes;
    const memoryAvailable = machine?.memory?.freeBytes;
    const base = {
      modelId,
      profile,
      context: { requestedTokens: contextTokens, availableTokens: inspection.context.effectiveTokens.value },
      storage: { requiredBytes: inspection.storageBytes.value, availableBytes: storageAvailable ?? null },
      memory: { requiredBytes: inspection.workingMemoryBytes.value, availableBytes: memoryAvailable ?? null },
      inspection,
    };
    if (!Number.isSafeInteger(storageAvailable) || !Number.isSafeInteger(memoryAvailable)) return { ...base, state: 'unknown', reason: 'measurement' };
    if (inspection.storageBytes.value > storageAvailable) return { ...base, state: 'blocked', reason: 'storage' };
    if (inspection.workingMemoryBytes.value > memoryAvailable) return { ...base, state: 'blocked', reason: 'memory' };
    if (inspection.context.runtimeTokens.state !== 'observed') return { ...base, state: 'unknown', reason: 'context' };
    if (inspection.context.effectiveTokens.value < contextTokens) {
      return { ...base, state: profile === 'agent' && inspection.context.effectiveTokens.value < 65_536 ? 'chat-only' : 'blocked', reason: 'context' };
    }
    if (profile === 'agent') {
      const capabilityValues = Object.values(inspection.capabilities);
      if (capabilityValues.some(({ state }) => state !== 'observed')) return { ...base, state: 'unknown', reason: 'capabilities' };
      if (capabilityValues.some(({ value }) => value !== true)) return { ...base, state: 'chat-only', reason: 'template' };
    }
    return { ...base, state: 'compatible', reason: 'fits' };
  }

  async function qualify({ modelId, consent, profile = 'agent', contextTokens = profile === 'agent' ? 65_536 : 4_096 } = {}) {
    if (consent !== true) throw new LocalRuntimeProbeError('qualification requires explicit consent', 'PROBE_CONSENT_REQUIRED');
    const fitResult = await fit(modelId, { profile, contextTokens });
    if (fitResult.state !== 'compatible') throw new LocalRuntimeProbeError(`model fit is ${fitResult.state}`, 'MODEL_NOT_COMPATIBLE');

    const startedAt = clockMs();
    let firstTokenAt = null;
    let completed = false;
    for await (const event of runtime.generateStream({
      runId: `qualification-${modelId}`,
      turnId: 'qualification',
      modelId,
      messages: [{ role: 'user', content: 'Reply with OK.' }],
      parseToolCalls: false,
    })) {
      if (firstTokenAt === null && (event.type === 'text' || event.type === 'reasoning')) firstTokenAt = clockMs();
      if (event.type === 'error') throw new LocalRuntimeProbeError(event.message || 'qualification stream failed', 'PROBE_GENERATION_FAILED');
      if (event.type === 'done') completed = true;
    }
    const endedAt = clockMs();
    if (!completed || firstTokenAt === null) throw new LocalRuntimeProbeError('qualification produced no complete response', 'PROBE_GENERATION_INCOMPLETE');

    let tokensPerSecond = unknown();
    if (typeof runtime.metrics === 'function') {
      try { tokensPerSecond = parseTokensPerSecond(await runtime.metrics()); } catch { /* metric remains unknown */ }
    }
    return {
      modelId,
      state: 'qualified',
      backend: fitResult.inspection.backend,
      build: fitResult.inspection.build,
      contextTokens: fitResult.context.availableTokens,
      performance: {
        ttftMs: fact('observed', Math.max(0, firstTokenAt - startedAt)),
        tokensPerSecond,
      },
      durationMs: Math.max(0, endedAt - startedAt),
      measuredAt: now().toISOString(),
    };
  }

  return Object.freeze({ inspectModel, measureBackend, fit, qualify });
}
