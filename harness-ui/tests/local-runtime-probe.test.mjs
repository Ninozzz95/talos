import assert from 'node:assert/strict';
import test from 'node:test';

import { createLocalRuntimeProbe } from '../src/local-runtime-probe.mjs';

/*
 * ⛔⛔⛔ 02/9 (sera) — questa fixture era INFEDELE, ed è per questo che un
 * difetto vero è sopravvissuto ai test: aveva
 * `path: 'models/qwen-local.gguf'`, cioè trattava `path` come il FILE. Nel
 * manifest vero (`local-model-store.mjs` lo valida, la rotta di import lo
 * scrive) `path` è la CARTELLA del modello e il nome del file sta in
 * `files[0].path` — `files` è obbligatorio e non vuoto.
 * Con la fixture sbagliata, `readHeader(manifest.path)` sembrava corretto,
 * e sul disco vero leggeva una DIRECTORY: `/fit` falliva sempre con
 * MODEL_HEADER_UNREADABLE. È emerso solo dopo aver importato due GGUF
 * veri, mai dai test.
 * ⇒ Ora la fixture ha la forma REALE, e c'è un test sul percorso esatto
 * che `readHeader` riceve.
 */
const manifest = Object.freeze({
  id: 'qwen-local',
  repo: 'local-upload',
  revision: 'a'.repeat(64),
  files: [{ path: 'qwen-local.gguf', bytes: 4_000, sha256: 'a'.repeat(64) }],
  bytes: 4_000,
  sha256: 'a'.repeat(64),
  license: 'unknown',
  path: 'qwen-local',
  state: 'ready',
  updatedAt: '2026-08-31T10:00:00.000Z',
});

const header = Object.freeze({
  magic: 'GGUF',
  version: 3,
  trainedContext: 131_072,
  estimatedWorkingBytes: 8_000,
});

const capacity = Object.freeze({
  memory: { totalBytes: 32_000, freeBytes: 16_000 },
  storage: { allocatableBytes: 20_000 },
});

function makeProbe({
  props = {
    default_generation_settings: { n_ctx: 65_536 },
    chat_template: 'private template source',
    chat_template_caps: {
      supports_tools: false,
      supports_tool_calls: false,
      supports_system_role: true,
    },
  },
  headerValue = header,
  readHeader = async () => headerValue,
  machine = capacity,
  generateStream,
  metrics = async () => '',
  clockMs = () => 0,
  /** ⭐ 02/9 — per provare forme di manifest diverse da quella buona (es. senza file). */
  manifestOverride = null,
  /** ⭐ 02/9 — runtime locale SPENTO: `probe()` lancia, come fa davvero quando llama-server non gira. */
  probeThrows = false,
} = {}) {
  let generations = 0;
  const manifestUsato = manifestOverride || manifest;
  const runtime = {
    probe: async () => { if (probeThrows) throw new Error('connessione rifiutata'); return structuredClone(props); },
    metrics,
    generateStream: generateStream ?? (async function* () {
      generations += 1;
      yield { type: 'text', value: 'ok' };
      yield { type: 'done' };
    }),
  };
  const probe = createLocalRuntimeProbe({
    runtime,
    modelStore: { inspect: async (id) => id === manifestUsato.id ? structuredClone(manifestUsato) : null },
    readHeader,
    measureMachine: async () => structuredClone(machine),
    now: () => new Date('2026-08-31T10:00:00.000Z'),
    clockMs,
  });
  return { probe, generations: () => generations };
}

test('LOCAL-RUNTIME-PROBE-GGUF-01 segnala un header illeggibile', async () => {
  const { probe } = makeProbe({ readHeader: async () => { throw new Error('disk failure'); } });
  await assert.rejects(probe.inspectModel(manifest.id), { code: 'MODEL_HEADER_UNREADABLE' });
});

test('LOCAL-RUNTIME-PROBE-GGUF-02 rifiuta magic, versione o misure GGUF invalidi', async () => {
  const { probe } = makeProbe({ headerValue: { ...header, version: 2 } });
  await assert.rejects(probe.inspectModel(manifest.id), { code: 'MODEL_HEADER_INVALID' });
});

test('LOCAL-RUNTIME-PROBE-CAPS-01 conserva capability false osservate senza esporre il template', async () => {
  const { probe } = makeProbe();
  const result = await probe.inspectModel(manifest.id);
  assert.deepEqual(result.capabilities, {
    tools: { state: 'observed', value: false },
    toolCalls: { state: 'observed', value: false },
    systemRole: { state: 'observed', value: true },
  });
  assert.deepEqual(result.template, { state: 'observed', value: true });
  assert.equal(JSON.stringify(result).includes('private template source'), false);
  assert.deepEqual(result.context, {
    trainedTokens: { state: 'declared', value: 131_072 },
    runtimeTokens: { state: 'observed', value: 65_536 },
    effectiveTokens: { state: 'observed', value: 65_536 },
  });
  const fit = await probe.fit(manifest.id);
  assert.equal(fit.state, 'chat-only');
  assert.equal(fit.reason, 'template');
});

test('LOCAL-RUNTIME-PROBE-CAPS-02 lascia unknown le capability non osservate', async () => {
  const { probe } = makeProbe({ props: { default_generation_settings: { n_ctx: 65_536 } } });
  const result = await probe.inspectModel(manifest.id);
  assert.deepEqual(result.capabilities, {
    tools: { state: 'unknown', value: null },
    toolCalls: { state: 'unknown', value: null },
    systemRole: { state: 'unknown', value: null },
  });
  assert.deepEqual(result.template, { state: 'unknown', value: null });
  const fit = await probe.fit(manifest.id);
  assert.equal(fit.state, 'unknown');
  assert.equal(fit.reason, 'capabilities');
});

test('LOCAL-RUNTIME-PROBE-CONTEXT-01 classifica chat-only un profilo agente sotto 65536 token', async () => {
  const { probe } = makeProbe({ props: { default_generation_settings: { n_ctx: 32_768 } } });
  const result = await probe.fit(manifest.id, { profile: 'agent', contextTokens: 65_536 });
  assert.equal(result.state, 'chat-only');
  assert.equal(result.reason, 'context');
  assert.equal(result.context.availableTokens, 32_768);
});

test('LOCAL-RUNTIME-PROBE-MEMORY-01 blocca prima storage e poi RAM insufficienti', async () => {
  const storage = makeProbe({ machine: { memory: { totalBytes: 32_000, freeBytes: 4_000 }, storage: { allocatableBytes: 3_999 } } });
  const storageFit = await storage.probe.fit(manifest.id);
  assert.equal(storageFit.state, 'blocked');
  assert.equal(storageFit.reason, 'storage');

  const memory = makeProbe({ machine: { memory: { totalBytes: 32_000, freeBytes: 7_999 }, storage: { allocatableBytes: 20_000 } } });
  const memoryFit = await memory.probe.fit(manifest.id);
  assert.equal(memoryFit.state, 'blocked');
  assert.equal(memoryFit.reason, 'memory');
});

test('LOCAL-RUNTIME-PROBE-BACKEND-01 non inventa backend o segnale termico assenti', async () => {
  const { probe } = makeProbe();
  assert.deepEqual(await probe.measureBackend(), {
    backend: { state: 'unknown', value: null },
    thermal: { state: 'unknown', value: null },
    observedAt: '2026-08-31T10:00:00.000Z',
  });
});

test('LOCAL-RUNTIME-PROBE-CONSENT-01 qualifica solo con consenso e misura TTFT e tok/s upstream', async () => {
  const ticks = [100, 350, 1_100];
  const { probe, generations } = makeProbe({
    props: {
      default_generation_settings: { n_ctx: 131_072 },
      chat_template: 'template',
      chat_template_caps: { supports_tools: true, supports_tool_calls: true, supports_system_role: true },
      backend: 'CUDA',
      build: 'llama.cpp-b1234',
    },
    metrics: async () => 'llamacpp:predicted_tokens_seconds 12.5\n',
    clockMs: () => ticks.shift(),
  });

  await assert.rejects(probe.qualify({ modelId: manifest.id, consent: false }), { code: 'PROBE_CONSENT_REQUIRED' });
  assert.equal(generations(), 0);

  const result = await probe.qualify({ modelId: manifest.id, consent: true });
  assert.equal(generations(), 1);
  assert.deepEqual(result.performance, {
    ttftMs: { state: 'observed', value: 250 },
    tokensPerSecond: { state: 'observed', value: 12.5 },
  });
  assert.deepEqual(result.backend, { state: 'observed', value: 'CUDA' });
  assert.deepEqual(result.build, { state: 'observed', value: 'llama.cpp-b1234' });
});

test('LOCAL-RUNTIME-PROBE-PERCORSO-01 — readHeader riceve CARTELLA + FILE, non la sola cartella', async () => {
  /*
   * ⛔⛔⛔ Il test che mancava, e che avrebbe preso il difetto del 02/9:
   * `inspectModel` passava `manifest.path` da solo — la CARTELLA — quindi
   * sul disco vero il lettore riceveva una directory e falliva sempre.
   * La vecchia fixture, che metteva il nome del file dentro `path`, lo
   * rendeva invisibile. Qui si guarda l'argomento REALE.
   */
  const visti = [];
  const { probe } = makeProbe({ readHeader: async (percorso) => { visti.push(percorso); return header; } });
  await probe.fit('qwen-local', { profile: 'chat', contextTokens: 4_096 });
  assert.equal(visti.length, 1);
  assert.equal(visti[0], 'qwen-local/qwen-local.gguf');
});

test('LOCAL-RUNTIME-PROBE-PERCORSO-02 — AL CONTRARIO: un manifest senza file non passa per buono', async () => {
  const { probe } = makeProbe({ manifestOverride: { ...manifest, files: [] } });
  await assert.rejects(() => probe.fit('qwen-local'), (errore) => errore.code === 'MODEL_HEADER_UNREADABLE');
});

test('LOCAL-RUNTIME-PROBE-RUNTIME-SPENTO-01 — con il runtime giù /fit degrada a unknown, non fallisce', async () => {
  /*
   * ⛔⛔ 02/9 (sera): `readRuntimeProps()` lanciava e faceva abortire tutta
   * `inspectModel`, quindi `/fit` rispondeva RUNTIME_PROBE_FAILED anche
   * quando aveva già letto l'header e poteva dire cose vere su spazio,
   * memoria e contesto addestrato. Un runtime spento non è un errore
   * della lettura: è un fatto NON OSSERVATO. `fit` ha lo stato `unknown`
   * esattamente per questo.
   */
  const { probe } = makeProbe({ probeThrows: true });
  const esito = await probe.fit('qwen-local', { profile: 'chat', contextTokens: 4_096 });
  assert.equal(esito.state, 'unknown');
  assert.equal(esito.reason, 'context');
  // ⭐ I fatti VERI restano, non si perdono con il runtime:
  assert.equal(esito.storage.requiredBytes, manifest.bytes);
  assert.equal(esito.context.availableTokens, header.trainedContext);
});

test('LOCAL-RUNTIME-PROBE-RUNTIME-SPENTO-02 — AL CONTRARIO: qualify NON degrada, si rifiuta', async () => {
  // Un giro di generazione vero senza runtime non deve neanche essere tentato.
  const { probe } = makeProbe({ probeThrows: true });
  await assert.rejects(() => probe.qualify({ modelId: 'qwen-local', consent: true, profile: 'chat', contextTokens: 4_096 }), (errore) => errore.code === 'MODEL_NOT_COMPATIBLE');
});
