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

  async function inspectModel(modelId) {
    const manifest = await modelStore.inspect(modelId);
    if (!manifest) throw new LocalRuntimeProbeError(`model ${modelId} not found`, 'MODEL_NOT_FOUND');
    if (manifest.state !== 'ready') throw new LocalRuntimeProbeError(`model ${modelId} is not ready`, 'MODEL_NOT_READY');

    let header;
    try {
      header = validateHeader(await readHeader(manifest.path));
    } catch (error) {
      if (error instanceof LocalRuntimeProbeError) throw error;
      throw new LocalRuntimeProbeError(`cannot read model header: ${error?.message || 'unknown error'}`, 'MODEL_HEADER_UNREADABLE');
    }

    const props = await readRuntimeProps();
    const runtimeTokens = props.default_generation_settings?.n_ctx;
    const runtimeContext = positiveInteger(runtimeTokens) ? fact('observed', runtimeTokens) : unknown();
    const caps = props.chat_template_caps;
    return {
      modelId: manifest.id,
      format: { state: 'observed', magic: 'GGUF', version: 3 },
      storageBytes: { state: 'declared', value: manifest.bytes },
      workingMemoryBytes: { state: 'declared', value: header.estimatedWorkingBytes },
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
    const inspection = await inspectModel(modelId);
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
