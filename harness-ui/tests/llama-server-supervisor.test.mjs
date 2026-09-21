import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createLlamaServerSupervisor, decidiTipoKvCache, leggiNglDalFitter, percorsoFitter, supportaSpeculativaNgram } from '../src/llama-server-supervisor.mjs';

function childProcess() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kills = [];
  child.kill = (signal) => {
    child.kills.push(signal);
    child.emit('close', 0, signal);
    return true;
  };
  return child;
}

test('starts llama-server on loopback without shell and reaches ready after health 503→200', async () => {
  const child = childProcess();
  let spawnCall;
  const healthStatuses = [503, 200];
  const logs = [];
  const supervisor = createLlamaServerSupervisor({
    binaryPath: 'C:\\talos\\llama-server.exe',
    spawnImpl: (...args) => { spawnCall = args; return child; },
    fetchImpl: async (_url, options) => {
      assert.match(options.headers.Authorization, /^Bearer [a-f0-9]{64}$/);
      return { status: healthStatuses.shift(), ok: healthStatuses.length === 0 };
    },
    portAllocator: async () => 18080,
    pollIntervalMs: 1,
  });
  supervisor.subscribeLogs((entry) => logs.push(entry));
  const status = await supervisor.start({ modelPath: 'C:\\models\\model.gguf' });

  assert.equal(status.state, 'ready');
  assert.deepEqual(spawnCall[1], ['-m', 'C:\\models\\model.gguf', '--host', '127.0.0.1', '--port', '18080', '--api-key', spawnCall[1][7], '--jinja', '--metrics', '--props']);
  assert.equal(spawnCall[2].shell, false);
  assert.deepEqual(spawnCall[2].stdio, ['ignore', 'pipe', 'pipe']);
  assert.equal(Object.hasOwn(status, 'apiKey'), false);
  assert.equal(Object.hasOwn(status, 'modelPath'), false);

  child.stderr.emit('data', Buffer.from('ready\n'));
  /*
   * ⭐ BC-13 — l'avvio DICHIARA le leve che ha scelto, prima di accendere il
   * motore: una leva accesa in silenzio è una leva che nessuno può smentire.
   * Qui non c'è offload e il binario non esiste, quindi entrambe le
   * dichiarazioni devono dire «no» — ed è l'esatto comportamento di prima.
   */
  assert.deepEqual(logs.map((riga) => riga.text), [
    // R-03 (13/09): il supervisore dichiara QUALE motore accende, prima delle leve.
    '[talos] motore cpu: C:\\talos\\llama-server.exe\n',
    '[talos] KV cache q8_0 — nessun offload sul dispositivo: la KV cache non entra nella scelta\n',
    '[talos] decodifica speculativa a n-grammi: non offerta da questo binario\n',
    'ready\n',
  ]);
});

/*
 * ⭐⭐⭐ 3/9 — flash-attention + KV cache quantizzata: MISURATO su AMD RX
 * 9070 XT (Vulkan), stesso modello stesso prompt, +15% generazione +408%
 * elaborazione prompt contro la riga precedente (solo -ngl). Zero
 * differenza di correttezza fra le due righe — verificato prima di
 * fidarsi del numero. Simmetrici (q8_0/q8_0): solo la coppia simmetrica
 * usa il kernel fuso veloce secondo la ricerca (ggml-org/llama.cpp
 * discussions #22411).
 */
test('con un backend GPU attivo aggiunge flash-attention e KV cache quantizzata simmetrica, non solo -ngl', async () => {
  const child = childProcess();
  let spawnCall;
  const supervisor = createLlamaServerSupervisor({
    binaryPath: 'C:\\talos\\llama-server.exe',
    spawnImpl: (...args) => { spawnCall = args; return child; },
    fetchImpl: async () => ({ status: 200, ok: true }),
    portAllocator: async () => 18081,
    pollIntervalMs: 1,
    gpuLayers: 99,
  });
  await supervisor.start({ modelPath: 'C:\\models\\model.gguf' });
  const argv = spawnCall[1];
  assert.deepEqual(argv, [
    '-m', 'C:\\models\\model.gguf', '--host', '127.0.0.1', '--port', '18081', '--api-key', argv[7],
    // ⛔⛔⛔ 03/9 — QUESTA PROVA È PASSATA PER 'auto' NELLO STESSO GIORNO, a
    // metà mattina: un modello giocattolo che ci sta comunque in VRAM aveva
    // nascosto che un 27B vero (16,46 GB contro 16,3 GB di scheda) con
    // '-ngl 99' esplicito forza un overflow muto verso la memoria condivisa
    // di Windows — 13,28 tok/s invece dei 62 possibili. La cura sembrava
    // ovvia: 'auto' come fa LM Studio (owner: "bisogna usare la RAM e la
    // VRAM come fa LM Studio"), lasciare decidere al fitter del binario.
    // ⇒ MISURATA e SMENTITA lo stesso pomeriggio: banco A/B pulito,
    // 'auto' 11,12 tok/s / 191,3 prompt tok/s contro 13,28 / 262,3 di '99'
    // esplicito, più un avviso "GDN mismatch" che '99' non genera — vedi
    // llama-server-supervisor.mjs per i numeri e la fonte esterna che li
    // corrobora. Si torna a '99': l'ipotesi era ragionevole, la misura ha
    // vinto sull'ipotesi, come vuole la regola del progetto.
    '-ngl', '99',
    '-fa', '1', '--cache-type-k', 'q8_0', '--cache-type-v', 'q8_0',
    '--jinja', '--metrics', '--props',
  ]);
});

/* ⛔ AL CONTRARIO, esplicito: senza backend GPU (gpuLayers assente/0, come nel primo test sopra) né -ngl né questi due flag compaiono — una build CPU-only non deve MAI ricevere una richiesta di quantizzare una KV cache che non passa mai dalla GPU. */
test('AL CONTRARIO: senza gpuLayers, nessuno dei flag GPU-only compare — non solo -ngl', async () => {
  const child = childProcess();
  let spawnCall;
  const supervisor = createLlamaServerSupervisor({
    binaryPath: 'C:\\talos\\llama-server.exe',
    spawnImpl: (...args) => { spawnCall = args; return child; },
    fetchImpl: async () => ({ status: 200, ok: true }),
    portAllocator: async () => 18082,
    pollIntervalMs: 1,
  });
  await supervisor.start({ modelPath: 'C:\\models\\model.gguf' });
  const argv = spawnCall[1];
  assert.equal(argv.includes('-ngl'), false);
  assert.equal(argv.includes('-fa'), false);
  assert.equal(argv.includes('--cache-type-k'), false);
  assert.equal(argv.includes('--cache-type-v'), false);
});

test('health reports a controlled unreachable state instead of throwing', async () => {
  const supervisor = createLlamaServerSupervisor({ binaryPath: 'llama-server.exe', fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
  assert.deepEqual(await supervisor.health(), { ok: false, status: 0, code: 'RUNTIME_UNREACHABLE' });
});

test('exposes only an authenticated relative-path transport to the runtime adapter', async () => {
  const child = childProcess();
  const requests = [];
  const supervisor = createLlamaServerSupervisor({
    binaryPath: 'llama-server.exe',
    spawnImpl: () => child,
    portAllocator: async () => 18084,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { status: 200, ok: true, json: async () => ({ data: [] }) };
    },
  });
  await supervisor.start({ modelId: 'model-1', modelPath: 'C:\\models\\model.gguf' });
  const response = await supervisor.request('/v1/models');
  assert.equal(response.ok, true);
  assert.equal(requests.at(-1).url, 'http://127.0.0.1:18084/v1/models');
  assert.match(requests.at(-1).options.headers.get('Authorization'), /^Bearer [a-f0-9]{64}$/);
  await assert.rejects(supervisor.request('https://evil.example/steal'), (error) => error.code === 'RUNTIME_INVALID');
  assert.equal(Object.hasOwn(supervisor.status(), 'apiKey'), false);
});

test('process error transitions to failed and rejects start', async () => {
  const child = childProcess();
  const supervisor = createLlamaServerSupervisor({
    binaryPath: 'llama-server.exe',
    spawnImpl: () => { setTimeout(() => child.emit('error', new Error('ENOENT')), 0); return child; },
    portAllocator: async () => 18081,
    fetchImpl: async () => ({ status: 503, ok: false }),
    pollIntervalMs: 1,
    healthTimeoutMs: 20,
  });
  await assert.rejects(supervisor.start({ modelPath: 'C:\\models\\model.gguf' }), (error) => error.code === 'RUNTIME_PROCESS_FAILED');
  assert.equal(supervisor.status().state, 'failed');
});

test('stop kills the process, is idempotent, and clears the runtime', async () => {
  const child = childProcess();
  const supervisor = createLlamaServerSupervisor({
    binaryPath: 'llama-server.exe',
    spawnImpl: () => child,
    portAllocator: async () => 18082,
    fetchImpl: async () => ({ status: 200, ok: true }),
  });
  await supervisor.start({ modelPath: 'C:\\models\\model.gguf' });
  await supervisor.stop();
  await supervisor.stop();
  assert.deepEqual(child.kills, ['SIGTERM']);
  assert.equal(supervisor.status().state, 'unavailable');
});

test('rejects a relative model path before spawning anything', async () => {
  let spawned = false;
  const supervisor = createLlamaServerSupervisor({ binaryPath: 'llama-server.exe', spawnImpl: () => { spawned = true; return childProcess(); } });
  await assert.rejects(supervisor.start({ modelPath: 'models/model.gguf', port: 18083 }), (error) => error.code === 'RUNTIME_INVALID');
  assert.equal(spawned, false);
});

/* ══════════════════════════════════════════════════════════════════════════
 * BC-13 — LE LEVE DI VELOCITÀ. Owner 12/09/2026: «dobbiamo rendere il motore
 * di llm locale estremamente rapido e meglio dei competitor».
 *
 * ⛔ Ogni leva è provata NEI DUE VERSI: si accende quando il binario dice di
 * saperla fare, e NON si accende quando dice di no. Un cancello che non
 * respinge nulla supera la prova positiva esattamente come uno vero.
 * ══════════════════════════════════════════════════════════════════════════ */

const AIUTO_CON_NGRAM = [
  '--spec-draft-model, -md, --model-draft FNAME    draft model for speculative decoding (default: unused)',
  '--spec-type none,draft-simple,draft-eagle3,draft-mtp,ngram-simple,ngram-map-k,ngram-mod,ngram-cache',
  '                                        comma-separated list of types of speculative decoding to use',
].join('\n');

/* Un binario più vecchio: la decodifica speculativa c'è, ma solo col modello
 * draft. È il caso in cui passare `--spec-type` lo farebbe MORIRE all'avvio. */
const AIUTO_SENZA_NGRAM = [
  '-md,   --model-draft FNAME              draft model for speculative decoding (default: unused)',
  '--draft-max, --draft, --draft-n N       number of tokens to draft for speculative decoding (default: 16)',
].join('\n');

function sondaFinta({ aiuto = AIUTO_CON_NGRAM, fitF16 = '-c 16384 -ngl -1', fitQ8 = '-c 16384 -ngl -1' } = {}) {
  const chiamate = [];
  const sonda = (eseguibile, argomenti) => {
    chiamate.push({ eseguibile, argomenti });
    if (argomenti.includes('--help')) return aiuto;
    return argomenti.includes('q8_0') ? fitQ8 : fitF16;
  };
  sonda.chiamate = chiamate;
  return sonda;
}

test('leggiNglDalFitter riconosce «ci sta tutto» e un offload solo parziale', () => {
  assert.equal(leggiNglDalFitter('-c 16384 -ngl -1'), 'tutto');
  assert.equal(leggiNglDalFitter('-c 16384 -ngl all'), 'tutto');
  assert.equal(leggiNglDalFitter('-c 16384 -ngl 56'), 56);
  // ⛔ Il verso contrario: un'uscita che non parla di livelli non è «tutto».
  assert.equal(leggiNglDalFitter('-c 16384'), null);
  assert.equal(leggiNglDalFitter(''), null);
  assert.equal(leggiNglDalFitter(undefined), null);
});

test('decidiTipoKvCache sceglie f16 solo quando il fitter dichiara che entra TUTTO', () => {
  // MISURATO 12/09 su Qwen3-4B-Q4_K_M a 16.384 token: prompt 2.849 ms con f16
  // contro 3.964 ms con q8_0 — il primo token arriva 1,1 s prima.
  assert.equal(decidiTipoKvCache({ nglConF16: 'tutto' }).tipo, 'f16');
  // ⛔ Verso contrario 1 — stesso modello a 131.072 token: con f16 il fitter
  // risponde 24 livelli, con q8_0 risponde «tutto». Lì f16 sarebbe un disastro.
  assert.equal(decidiTipoKvCache({ nglConF16: 24, nglConQ8: 'tutto' }).tipo, 'q8_0');
  // ⛔ Verso contrario 2 — non entra in nessuno dei due modi: resta q8_0.
  assert.equal(decidiTipoKvCache({ nglConF16: 24, nglConQ8: 40 }).tipo, 'q8_0');
  // ⛔ Verso contrario 3 — il fitter non risponde: si torna al comportamento
  // di ieri, mai a una scommessa.
  assert.equal(decidiTipoKvCache({ nglConF16: null }).tipo, 'q8_0');
  assert.equal(decidiTipoKvCache({}).tipo, 'q8_0');
  // Ogni scelta porta il suo perché: un log senza motivo non è verificabile.
  assert.match(decidiTipoKvCache({ nglConF16: 'tutto' }).perche, /TUTTI i livelli/u);
});

test('supportaSpeculativaNgram legge il --help del binario e non lo suppone', () => {
  assert.equal(supportaSpeculativaNgram(AIUTO_CON_NGRAM), true);
  // ⛔ Verso contrario: qui `--spec-type` non esiste proprio.
  assert.equal(supportaSpeculativaNgram(AIUTO_SENZA_NGRAM), false);
  assert.equal(supportaSpeculativaNgram(''), false);
  assert.equal(supportaSpeculativaNgram(null), false);
});

test('percorsoFitter cerca llama-fit-params accanto al server, con la stessa estensione', () => {
  assert.equal(percorsoFitter('C:\\r\\b10517-vulkan\\llama-server.exe'), 'C:\\r\\b10517-vulkan\\llama-fit-params.exe');
  // ⛔ Il separatore lo decide il sistema che esegue: si prova il NOME, non
  // la forma del percorso, altrimenti il test parla di Windows e non di noi.
  assert.match(percorsoFitter('/opt/llama/llama-server'), /llama-fit-params$/u);
  assert.equal(percorsoFitter('/opt/altro/motore.exe'), null);
});

test('con GPU e un binario moderno accende KV f16 e la speculativa a n-grammi', async () => {
  const child = childProcess();
  let spawnCall;
  const sonda = sondaFinta();
  const supervisor = createLlamaServerSupervisor({
    binaryPath: 'C:\\talos\\llama-server.exe',
    spawnImpl: (...args) => { spawnCall = args; return child; },
    fetchImpl: async () => ({ status: 200, ok: true }),
    portAllocator: async () => 18090,
    pollIntervalMs: 1,
    gpuLayers: 99,
    sondaBinario: sonda,
  });
  await supervisor.start({ modelPath: 'C:\\models\\model.gguf', contextLength: 16384 });
  const argv = spawnCall[1];
  assert.deepEqual(argv.slice(argv.indexOf('-fa')), [
    '-fa', '1', '--cache-type-k', 'f16', '--cache-type-v', 'f16',
    '--spec-type', 'ngram-mod',
    '--jinja', '--metrics', '--props',
  ]);
  // ⛔ Il fitter va interrogato sul MODELLO e sul CONTESTO veri, non a vuoto:
  // la risposta cambia con entrambi.
  const alFitter = sonda.chiamate.find((c) => c.eseguibile.includes('fit-params'));
  assert.deepEqual(alFitter.argomenti, ['-m', 'C:\\models\\model.gguf', '-c', '16384', '-fa', '1']);
  // Con «ci sta tutto» la seconda domanda (quella su q8_0) non si fa nemmeno.
  assert.equal(sonda.chiamate.filter((c) => c.argomenti.includes('q8_0')).length, 0);
});

test('se il binario non offre --spec-type la leva NON si accende, e la KV resta quantizzata se non entra', async () => {
  const child = childProcess();
  let spawnCall;
  const sonda = sondaFinta({ aiuto: AIUTO_SENZA_NGRAM, fitF16: '-c 131072 -ngl 24', fitQ8: '-c 131072 -ngl -1' });
  const supervisor = createLlamaServerSupervisor({
    binaryPath: 'C:\\talos\\llama-server.exe',
    spawnImpl: (...args) => { spawnCall = args; return child; },
    fetchImpl: async () => ({ status: 200, ok: true }),
    portAllocator: async () => 18091,
    pollIntervalMs: 1,
    gpuLayers: 99,
    sondaBinario: sonda,
  });
  await supervisor.start({ modelPath: 'C:\\models\\grande.gguf', contextLength: 131072 });
  const argv = spawnCall[1];
  assert.deepEqual(argv.slice(argv.indexOf('-fa')), [
    '-fa', '1', '--cache-type-k', 'q8_0', '--cache-type-v', 'q8_0',
    '--jinja', '--metrics', '--props',
  ]);
  assert.equal(argv.includes('--spec-type'), false);
});

test('le risposte del binario si pagano una volta sola: il secondo avvio non ri-sonda', async () => {
  const sonda = sondaFinta();
  const supervisor = createLlamaServerSupervisor({
    binaryPath: 'C:\\talos\\llama-server.exe',
    spawnImpl: () => childProcess(),
    fetchImpl: async () => ({ status: 200, ok: true }),
    portAllocator: async () => 18092,
    pollIntervalMs: 1,
    gpuLayers: 99,
    sondaBinario: sonda,
  });
  await supervisor.start({ modelPath: 'C:\\models\\model.gguf', contextLength: 8192 });
  await supervisor.stop();
  const dopoIlPrimo = sonda.chiamate.length;
  await supervisor.start({ modelPath: 'C:\\models\\model.gguf', contextLength: 8192 });
  assert.equal(sonda.chiamate.length, dopoIlPrimo);
});

/*
 * ⛔⛔⛔ BC-13 — MISURATO 12/09: il 27B dell'owner muore in 4,9 s con
 * «ErrorOutOfDeviceMemory», e il supervisore aspettava 245 s (15 s + 15 s/GB)
 * prima di dire «timeout». Quattro minuti buttati, e un messaggio che manda a
 * cercare un modello troppo grande invece del motivo vero, che il motore
 * aveva già scritto.
 */
test('un motore che si chiude da solo viene dichiarato SUBITO, con le sue ultime righe', async () => {
  const child = childProcess();
  const supervisor = createLlamaServerSupervisor({
    binaryPath: 'C:\\talos\\llama-server.exe',
    spawnImpl: () => child,
    fetchImpl: async () => ({ ok: false, status: 503 }),
    portAllocator: async () => 18093,
    pollIntervalMs: 1,
    // ⛔ Se il difetto tornasse, questo test impiegherebbe un'ora: è la prova
    // che l'attesa NON viene consumata.
    healthTimeoutMs: 3_600_000,
    sondaBinario: () => null,
  });
  const iniziato = Date.now();
  const avvio = supervisor.start({ modelPath: 'C:\\models\\enorme.gguf' });
  /*
   * ⛔ Il motore muore DOPO che il supervisore si è agganciato ai suoi canali.
   * Emettere `close` prima dell'aggancio proverebbe un'altra cosa (un evento
   * perso), e questo test è passato una volta per quel motivo sbagliato:
   * `start()` cede il controllo sull'allocazione della porta, quindi il
   * figlio non esiste ancora quando la riga dopo la chiamata viene eseguita.
   */
  setTimeout(() => {
    child.stderr.emit('data', Buffer.from('ggml_vulkan: vk::Device::allocateMemory: ErrorOutOfDeviceMemory\n'));
    child.emit('close', 1, null);
  }, 20);
  await assert.rejects(avvio, (error) => {
    assert.equal(error.code, 'RUNTIME_PROCESS_FAILED');
    assert.match(error.message, /ErrorOutOfDeviceMemory/u);
    assert.match(error.message, /si è chiuso/u);
    return true;
  });
  assert.ok(Date.now() - iniziato < 5_000, 'non deve consumare l attesa di salute');
});

/*
 * ⛔ L'interruttore esiste per un difetto APERTO a monte
 * (ggml-org/llama.cpp#25819, «stuck-loop escape for ngram-mod (WIP)», aperto
 * il 17/07/2026). Se un giorno morde, si spegne da un posto solo — e questa
 * prova garantisce che spegnerlo spenga davvero, anche su un binario che la
 * leva la offre eccome.
 */
test('speculativaNgram: off spegne la leva anche se il binario la offre', async () => {
  let spawnCall;
  const supervisor = createLlamaServerSupervisor({
    binaryPath: 'C:\\talos\\llama-server.exe',
    spawnImpl: (...args) => { spawnCall = args; return childProcess(); },
    fetchImpl: async () => ({ status: 200, ok: true }),
    portAllocator: async () => 18094,
    pollIntervalMs: 1,
    gpuLayers: 99,
    sondaBinario: sondaFinta(),
    speculativaNgram: 'off',
  });
  await supervisor.start({ modelPath: 'C:\\models\\model.gguf', contextLength: 16384 });
  assert.equal(spawnCall[1].includes('--spec-type'), false);
  // ⛔ E spegne SOLO quella: la scelta della KV cache resta quella misurata.
  assert.equal(spawnCall[1].includes('f16'), true);
});
