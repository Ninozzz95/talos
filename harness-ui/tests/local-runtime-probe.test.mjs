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
  /**
   * ⭐ 02/9 — QUALE modello è caricato adesso. `undefined` = l'adattatore non
   * sa rispondere (come i doppi più vecchi); una stringa = quel modello è
   * quello acceso, e il suo `n_ctx` vale solo per lui.
   */
  loadedModelId,
} = {}) {
  let generations = 0;
  const manifestUsato = manifestOverride || manifest;
  const runtime = {
    probe: async () => { if (probeThrows) throw new Error('connessione rifiutata'); return structuredClone(props); },
    ...(loadedModelId === undefined ? {} : { loadedModelId: () => loadedModelId }),
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

test('LOCAL-RUNTIME-PROBE-CONTESTO-MEMORIA-01 — la memoria si stima sul contesto RICHIESTO, non su quello addestrato', async () => {
  /*
   * ⛔⛔⛔ 02/9 (sera) — `inspectModel` usava sempre `estimatedWorkingBytes`,
   * calcolato dal lettore sul contesto ADDESTRATO. Sul Qwen3 27B
   * dell'owner sono 262.144 token invece dei 65.536 richiesti: un fattore
   * 4 di sovrastima, sopra a quello (già corretto) della GQA. Il verdetto
   * usciva "non compatibile" per un motivo che non esisteva.
   */
  const headerConPerToken = { ...header, kvCacheBytesPerToken: 10, trainedContext: 1_000, estimatedWorkingBytes: 500 + 10 * 1_000 };
  const { probe } = makeProbe({ headerValue: headerConPerToken, machine: { memory: { totalBytes: 1e9, freeBytes: 1e9 }, storage: { allocatableBytes: 1e9 } } });

  const stretto = await probe.fit('qwen-local', { profile: 'chat', contextTokens: 100 });
  const largo = await probe.fit('qwen-local', { profile: 'chat', contextTokens: 1_000 });
  // pesi (500) + 10 byte/token × il contesto chiesto
  assert.equal(stretto.memory.requiredBytes, 500 + 10 * 100);
  assert.equal(largo.memory.requiredBytes, 500 + 10 * 1_000);
  assert.ok(stretto.memory.requiredBytes < largo.memory.requiredBytes, 'un contesto più corto deve costare meno memoria');
});

test('LOCAL-RUNTIME-PROBE-CONTESTO-MEMORIA-02 — AL CONTRARIO: chiedere PIÙ del contesto addestrato non gonfia la stima', async () => {
  // Il tetto è ciò che il modello sa fare: oltre, a bocciare è il controllo
  // sul contesto, con un motivo suo — non una memoria inventata più grande.
  const headerConPerToken = { ...header, kvCacheBytesPerToken: 10, trainedContext: 1_000, estimatedWorkingBytes: 500 + 10 * 1_000 };
  const { probe } = makeProbe({ headerValue: headerConPerToken, machine: { memory: { totalBytes: 1e9, freeBytes: 1e9 }, storage: { allocatableBytes: 1e9 } } });
  const oltre = await probe.fit('qwen-local', { profile: 'chat', contextTokens: 50_000 });
  assert.equal(oltre.memory.requiredBytes, 500 + 10 * 1_000);
});

test('LOCAL-RUNTIME-PROBE-CONTESTO-MEMORIA-03 — un header SENZA costo per token resta valido: si usa la stima del file', async () => {
  // Retrocompatibilità dichiarata: nessun campo nuovo obbligatorio.
  const { probe } = makeProbe({ machine: { memory: { totalBytes: 1e9, freeBytes: 1e9 }, storage: { allocatableBytes: 1e9 } } });
  const esito = await probe.fit('qwen-local', { profile: 'chat', contextTokens: 100 });
  assert.equal(esito.memory.requiredBytes, header.estimatedWorkingBytes);
});

/*
 * ⛔⛔⛔ L'`n_ctx` È DEL MODELLO CARICATO, NON DELLA MACCHINA — 02/9.
 *
 * Debito trovato dal vivo il 02/9 e registrato in «Cosa rimane»: con un
 * runtime acceso, la riga di OGNI ALTRO modello mostrava come «contesto
 * disponibile» l'`n_ctx` di quello caricato. `/props` descrive la sessione in
 * corso, non la macchina.
 *
 * ⭐ Ricerca 02/9: llama.cpp tiene separati `n_ctx` (caricato) e `n_ctx_train`
 * (del modello) e avvisa quando divergono — noi usavamo un numero solo per
 * rispondere a due domande diverse.
 */
test('LOCAL-RUNTIME-PROBE-CTX-01 — l\'n_ctx osservato vale per il modello CARICATO', async () => {
  const { probe } = makeProbe({ loadedModelId: 'qwen-local' });
  const esito = await probe.inspectModel('qwen-local');
  assert.deepEqual(esito.context.runtimeTokens, { state: 'observed', value: 65_536 });
  assert.deepEqual(esito.context.effectiveTokens, { state: 'observed', value: 65_536 });
});

test('LOCAL-RUNTIME-PROBE-CTX-02 — con un ALTRO modello caricato il runtime non ha osservato niente', async () => {
  const { probe } = makeProbe({ loadedModelId: 'un-altro-modello' });
  const esito = await probe.inspectModel('qwen-local');
  assert.equal(esito.context.runtimeTokens.state, 'unknown');
  // Il contesto torna a essere quello ADDESTRATO, dichiarato dall'header.
  assert.deepEqual(esito.context.effectiveTokens, { state: 'declared', value: 131_072 });
});

test('LOCAL-RUNTIME-PROBE-CTX-03 — AL CONTRARIO: un piccolo n_ctx altrui non fa BOCCIARE per contesto', async () => {
  /*
   * ⛔ L'errore andava in ENTRAMBE le direzioni, e questa è quella che fa più
   * danno: con caricato un modello da 4.096 token, un modello da 131.072
   * veniva dichiarato inadatto al profilo agente (65.536) — cioè si negava
   * una capacità che il modello ha davvero. Il caso gemello (un n_ctx altrui
   * GRANDE che gonfia un modello piccolo) è coperto da CTX-02.
   */
  const { probe } = makeProbe({
    loadedModelId: 'un-altro-modello',
    props: { default_generation_settings: { n_ctx: 4_096 }, chat_template: 't', chat_template_caps: {} },
  });
  const esito = await probe.fit('qwen-local', { profile: 'agent', contextTokens: 65_536 });
  assert.equal(esito.context.availableTokens, 131_072);
  assert.notEqual(esito.reason, 'context');
});

test('LOCAL-RUNTIME-PROBE-CTX-04 — un adattatore che non sa rispondere non perde l\'osservazione', async () => {
  // ⛔ Retrocompatibilità dichiarata: senza `loadedModelId` non c'è un modello
  // ALTRO a cui attribuire il numero, quindi il comportamento resta quello di
  // prima invece di degradare in silenzio a `unknown`.
  const { probe } = makeProbe();
  const esito = await probe.inspectModel('qwen-local');
  assert.deepEqual(esito.context.runtimeTokens, { state: 'observed', value: 65_536 });
});

test('LOCAL-RUNTIME-PROBE-CTX-05 — con un ALTRO modello caricato NON si ereditano template e attrezzi', async () => {
  /*
   * ⛔⛔⛔ La metà più grave dello stesso difetto, trovata allargando la cura:
   * `chat_template` e `chat_template_caps` vengono dallo stesso `/props`, e
   * descrivono la sessione in corso. Con un modello che supporta gli attrezzi
   * caricato, la riga di OGNI altro modello dichiarava di supportarli — una
   * capacità inventata, che si scopre solo a metà di una sessione agentica.
   */
  const { probe } = makeProbe({
    loadedModelId: 'un-altro-modello',
    props: {
      default_generation_settings: { n_ctx: 131_072 },
      chat_template: 'il template dell\'ALTRO modello',
      chat_template_caps: { supports_tools: true, supports_tool_calls: true, supports_system_role: true },
    },
  });
  const esito = await probe.inspectModel('qwen-local');
  assert.equal(esito.template.state, 'unknown');
  assert.deepEqual(esito.capabilities, {
    tools: { state: 'unknown', value: null },
    toolCalls: { state: 'unknown', value: null },
    systemRole: { state: 'unknown', value: null },
  });
  // ⇒ e il profilo agente si ferma onestamente sulle CAPACITÀ, non sul contesto.
  const fit = await probe.fit('qwen-local', { profile: 'agent', contextTokens: 65_536 });
  assert.equal(fit.state, 'unknown');
  assert.equal(fit.reason, 'capabilities');
});

test('LOCAL-RUNTIME-PROBE-CTX-06 — il profilo CHAT resta giudicabile su ciò che l\'header dichiara', async () => {
  /*
   * ⛔ Il rischio della cura era di rendere ogni riga «non lo so» appena un
   * runtime è acceso — cioè spegnere la sola domanda per cui la lista esiste
   * (*ci sta, PRIMA di caricarlo?*). Il contesto addestrato è un fatto del
   * MODELLO, dichiarato dal suo header: per la chat basta, e la risposta
   * resta vera.
   */
  const { probe } = makeProbe({ loadedModelId: 'un-altro-modello' });
  const fit = await probe.fit('qwen-local', { profile: 'chat', contextTokens: 4_096 });
  assert.equal(fit.state, 'compatible');
  assert.equal(fit.context.availableTokens, 131_072);
});

/*
 * ⭐⭐⭐ LA STIMA PRIMA DELLO SCARICAMENTO — 03/9, richiesta dell'owner:
 * «badge e pulsanti per misurare in tempo reale se quel modello e
 * quantizzazione entrano e girano nel pc».
 *
 * ⛔ È una SOGLIA INFERIORE dichiarata, non un totale: senza il file non si
 * può leggere l'header, quindi la cache del contesto non è calcolabile.
 * `basis: 'weights-only'` viaggia con ogni risposta perché chi la mostra non
 * possa dimenticarsene.
 */
test('ESTIMATE-FIT-01 — i pesi che entrano nella memoria libera sono compatibili, e si dichiara la base', async () => {
  const { probe } = makeProbe(); // macchina finta: 16.000 byte liberi, 20.000 allocabili
  const esito = await probe.estimateFit({ bytes: 5_000 });
  assert.equal(esito.state, 'compatible');
  assert.equal(esito.reason, 'fits');
  assert.equal(esito.basis, 'weights-only', 'la base della stima viaggia con la risposta');
  assert.equal(esito.memory.requiredBytes, 5_000);
  assert.equal(esito.memory.availableBytes, 16_000);
});

test('ESTIMATE-FIT-02 — il DISCO si guarda per primo, e ha un motivo suo', async () => {
  // ⛔ Lo spazio si libera, la memoria no: dire «non gira» a chi ha solo il
  // disco pieno lo manda a cercare un modello più piccolo, cura sbagliata.
  const { probe } = makeProbe();
  const esito = await probe.estimateFit({ bytes: 25_000 });
  assert.equal(esito.state, 'blocked');
  assert.equal(esito.reason, 'storage');
});

test('ESTIMATE-FIT-03 — sopra il 90% del libero è «al limite», non compatibile', async () => {
  const { probe } = makeProbe();
  const esito = await probe.estimateFit({ bytes: 15_000 }); // 93,75% di 16.000
  assert.equal(esito.state, 'tight');
  assert.equal(esito.reason, 'memory');
});

test('ESTIMATE-FIT-04 — AL CONTRARIO: senza misura della macchina non si inventa un verdetto', async () => {
  const { probe } = makeProbe({ machine: { memory: {}, storage: {} } });
  const esito = await probe.estimateFit({ bytes: 5_000 });
  assert.equal(esito.state, 'unknown');
  assert.equal(esito.reason, 'measurement');
  assert.equal(esito.memory.availableBytes, null, 'mai uno zero al posto di un «non misurato»');
});

test('ESTIMATE-FIT-05 — AL CONTRARIO: byte assenti o assurdi vengono rifiutati, non stimati', async () => {
  const { probe } = makeProbe();
  for (const bytes of [0, -1, 1.5, null, undefined, '5000']) {
    await assert.rejects(() => probe.estimateFit({ bytes }), { code: 'FIT_INVALID' }, `accettati byte non validi: ${String(bytes)}`);
  }
});
