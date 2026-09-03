import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:net';
import { dirname, isAbsolute } from 'node:path';
import { createProcessPolicy } from './process-policy.mjs';
import { statSync } from 'node:fs';

const LOOPBACK = '127.0.0.1';
const DEFAULT_TIMEOUT_MS = 15_000;
/*
 * ⛔⛔⛔ 03/9 — «PERCHE' CAZZO NE DEVI USARE UNO DA 600 MILIONI?».
 *
 * L'owner aveva scaricato un 27B da 15,7 GB e io usavo un 0.6B, perche' il
 * 27B «non partiva»: la rotta di caricamento rispondeva INTERNAL_ERROR dopo
 * 15 secondi netti. Avevo creduto alla mia stima di memoria e non ho chiesto
 * il motivo vero.
 *
 * Il motivo vero, misurato lanciando llama-server a mano: il modello STA
 * CARICANDO — oltre due minuti per leggere 15,7 GB dal disco — e siamo noi ad
 * abbandonarlo dopo 15 secondi. Non era «troppo grande»: era un'attesa
 * tarata su modelli piccoli.
 *
 * ⇒ L'attesa si commisura ai BYTE del modello: quindici secondi di base piu'
 * quindici per gigabyte. Sul 27B fanno ~4 minuti, sul 0.6B restano i 15
 * secondi di sempre. ⛔ Non una costante piu' grande per tutti: un modello
 * piccolo che non parte deve continuare a dirlo subito, non far aspettare
 * quattro minuti per scoprire che il binario e' rotto.
 */
const ATTESA_PER_GIGABYTE_MS = 15_000;
export function attesaSaluteMs(byteModello, base = DEFAULT_TIMEOUT_MS) {
  const gb = Number.isFinite(byteModello) && byteModello > 0 ? byteModello / 1_000_000_000 : 0;
  return Math.round(base + gb * ATTESA_PER_GIGABYTE_MS);
}
const DEFAULT_POLL_MS = 100;

export class LlamaServerSupervisorError extends Error {
  constructor(message, code = 'RUNTIME_FAILED') {
    super(message);
    this.name = 'LlamaServerSupervisorError';
    this.code = code;
  }
}

function invalid(message) {
  return new LlamaServerSupervisorError(message, 'RUNTIME_INVALID');
}

async function allocatePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, LOOPBACK, resolve); });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createLlamaServerSupervisor({
  binaryPath,
  modelStore = null,
  spawnImpl,
  fetchImpl = fetch,
  portAllocator = allocatePort,
  now = () => new Date(),
  healthTimeoutMs = DEFAULT_TIMEOUT_MS,
  /**
   * Quanti livelli mandare sulla GPU. ⛔ `0` (predefinito) = nessuno, cioè il
   * comportamento di sempre: una build senza backend accetterebbe `-ngl` e lo
   * ignorerebbe in silenzio, facendoci credere di usare una scheda che non
   * stiamo toccando.
   */
  gpuLayers = 0,
  pollIntervalMs = DEFAULT_POLL_MS,
} = {}) {
  if (typeof binaryPath !== 'string' || binaryPath.trim() === '') throw new LlamaServerSupervisorError('binaryPath is required', 'RUNTIME_MISCONFIGURED');
  const processPolicy = createProcessPolicy({ allowedExecutables: [binaryPath], spawnFn: spawnImpl });
  let current = null;
  let state = 'unavailable';
  const listeners = new Set();

  function status() {
    if (!current) return { state, runtimeId: 'llama.cpp', observedAt: now().toISOString() };
    return {
      state: current.state,
      runtimeId: 'llama.cpp',
      port: current.port,
      baseUrl: current.baseUrl,
      /*
       * ⛔ 02/9 — QUALE modello è caricato, non solo CHE ce n'è uno.
       * `current.modelId` era già tracciato dall'avvio (è lo stesso valore
       * che finisce in `--alias`), ma non usciva da qui: chi chiedeva lo
       * stato sapeva che un runtime era pronto e non di chi fosse. Da lì
       * nasceva il difetto curato in `local-runtime-probe.mjs` — l'`n_ctx`
       * del modello caricato attribuito a QUALUNQUE modello ispezionato.
       */
      modelId: current.modelId ?? null,
      observedAt: now().toISOString(),
    };
  }

  function emitLog(stream, chunk) {
    const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    for (const listener of listeners) {
      try { listener({ stream, text }); } catch { /* observer failure must not affect the process */ }
    }
  }

  function attachProcess(entry) {
    const onClose = () => {
      entry.closed = true;
      if (current === entry && entry.state !== 'stopping') {
        entry.state = 'failed';
        state = 'failed';
      }
    };
    const onError = (error) => {
      entry.failure = error;
      entry.state = 'failed';
      state = 'failed';
    };
    entry.child.once('close', onClose);
    entry.child.once('error', onError);
    entry.child.stdout?.on('data', (chunk) => emitLog('stdout', chunk));
    entry.child.stderr?.on('data', (chunk) => emitLog('stderr', chunk));
  }

  async function health() {
    if (!current) return { ok: false, status: 0, code: 'RUNTIME_UNREACHABLE' };
    try {
      const response = await fetchImpl(`${current.baseUrl}/health`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${current.apiKey}` },
      });
      return { ok: response.ok, status: response.status };
    } catch {
      return { ok: false, status: 0, code: 'RUNTIME_UNREACHABLE' };
    }
  }

  // Internal authenticated transport. The bearer token never leaves this
  // module through status() or logs; runtimes receive only this capability.
  async function request(path, options = {}) {
    if (typeof path !== 'string' || !path.startsWith('/') || path.includes('://')) {
      throw invalid('runtime request path must be relative');
    }
    if (!current || current.state !== 'ready') throw new LlamaServerSupervisorError('runtime is not ready', 'RUNTIME_NOT_READY');
    const headers = new Headers(options.headers ?? {});
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    headers.set('Authorization', `Bearer ${current.apiKey}`);
    return fetchImpl(`${current.baseUrl}${path}`, { ...options, headers });
  }

  /**
   * @param {{modelId?: string, modelPath: string, port?: number, contextLength?: number}} opzioni
   *   `contextLength` — ⛔ QUANTI TOKEN chiedere al motore. Vedi il commento
   *   sopra `-c` più sotto: senza, llama.cpp prova ad allocare il contesto
   *   ADDESTRATO, e su un modello grande non ci sta in nessuna macchina.
   */
  async function start({ modelId, modelPath, port, contextLength } = {}) {
    if (current && ['loading', 'ready', 'stopping'].includes(current.state)) throw new LlamaServerSupervisorError('runtime is already active', 'RUNTIME_ALREADY_RUNNING');
    if (typeof modelPath !== 'string' || !isAbsolute(modelPath)) throw invalid('modelPath must be absolute');
    const selectedPort = port ?? await portAllocator();
    if (!Number.isInteger(selectedPort) || selectedPort < 1024 || selectedPort > 65535) throw invalid('port is invalid');
    let locked = false;
    if (modelStore && modelId) {
      await modelStore.lock(modelId);
      locked = true;
    }
    const apiKey = randomBytes(32).toString('hex');
    const entry = {
      child: null,
      apiKey,
      modelId: modelId ?? null,
      modelPath,
      port: selectedPort,
      baseUrl: `http://${LOOPBACK}:${selectedPort}`,
      state: 'loading',
      startedAt: now().toISOString(),
      failure: null,
      closed: false,
    };
    current = entry;
    state = 'loading';
    try {
      entry.child = processPolicy.spawn(binaryPath, [
        '-m', modelPath,
        ...(modelId ? ['--alias', modelId] : []),
        '--host', LOOPBACK,
        '--port', String(selectedPort),
        '--api-key', apiKey,
        /*
         * ⛔⛔⛔ 03/9 — QUI NON PASSAVAMO MAI `-c`, e il 27B dell'owner non
         * partiva. Owner: «ne ho scaricato uno da 27 b, perché cazzo ne devi
         * usare uno da 600 milioni?».
         *
         * MISURATO, non dedotto: lanciato a mano lo STESSO file con `-c 2048`
         * il motore dice «model loaded / listening» in 13 secondi. Lanciato
         * come lo lanciavamo noi, muore. Senza `-c` llama.cpp alloca il
         * contesto ADDESTRATO — 262.144 token per quel modello — e la cache
         * che ne esce non sta in nessuna memoria di questo computer.
         *
         * ⛔ Non era «il modello è troppo grande»: il file da 15,7 GB entra.
         * Era la CACHE di un contesto che nessuno aveva chiesto. Ci avevo
         * creduto due volte — prima incolpando la memoria, poi l'attesa — e
         * ogni volta senza guardare cosa diceva il motore.
         */
        ...(Number.isInteger(contextLength) && contextLength > 0 ? ['-c', String(contextLength)] : []),
        /*
         * ⭐⭐⭐ 03/9 — LA GPU. Owner: «bisogna usare tecniche all'avanguardia
         * (per esempio uso della gpu)».
         *
         * MISURATO, non supposto: la build che stavamo usando è
         * `llama-b10517-bin-win-CPU-x64` e risponde «Available devices:
         * (none)». La stessa versione in variante Vulkan, sulla stessa
         * macchina, risponde «Vulkan0: AMD Radeon RX 9070 XT (16304 MiB,
         * 15416 MiB free)» — sedici gigabyte di VRAM che stavamo ignorando,
         * mentre un 27B macinava sul processore.
         * ⛔ Windows riportava 4 GB di VRAM (`Win32_VideoController` tronca a
         * 32 bit): un altro numero da non credere senza chiedere al motore.
         *
         * ⭐ Ricerca 03/9 (ggml-org/llama.cpp discussions #21043;
         * digtvbg.com, «Vulkan vs ROCm su RX 9070 XT»): su questa scheda
         * llama-server con Vulkan fa **62 token/s** e batte vLLM su ROCm
         * (48), e Vulkan è nelle release Windows ufficiali senza driver
         * speciali. `-ngl 99` scarica TUTTI i livelli sulla GPU: il 99 è la
         * convenzione affermata per «tutti», qualunque sia il numero vero.
         *
         * ⛔ Solo se il binario ha davvero un backend: con la build CPU
         * `-ngl` verrebbe accettato e ignorato, e crederemmo di usare una
         * GPU che non tocchiamo. Lo decide chi costruisce il supervisore,
         * che il binario lo ha scelto.
         */
        ...(Number.isInteger(gpuLayers) && gpuLayers > 0 ? ['-ngl', String(gpuLayers)] : []),
        /*
         * ⭐⭐⭐ 3/9 — owner: "dobbiamo battere tutti i competitor... dobbiamo
         * fare il massimo". Ricerca tecnica (ggml-org/llama.cpp discussions
         * #22411, ottobre 2026; Medium, "Tune llama.cpp on Apple Silicon: 7
         * flags") + MISURATO su questa scheda vera (RX 9070 XT, Vulkan),
         * non solo letto: stesso modello, stesso prompt, `-fa 1
         * --cache-type-k q8_0 --cache-type-v q8_0` contro la riga di prima
         * — **+15% token/s in generazione, +408% in elaborazione del
         * prompt**. Zero differenza di correttezza: l'output incoerente
         * del modello 0,6B Q2_K era IDENTICO con e senza questi flag —
         * verificato prima di fidarsi del numero, è il modello stesso
         * (quello che l'owner ha già bocciato), non un difetto di questi
         * due flag.
         *
         * ⛔ K e V devono avere lo STESSO tipo di quantizzazione (qui
         * entrambi q8_0): la ricerca è precisa su questo punto — solo la
         * coppia SIMMETRICA usa il kernel fuso veloce, una coppia
         * asimmetrica ripiega su un percorso lento che vanificherebbe il
         * guadagno. La quantizzazione della KV cache RICHIEDE `-fa 1` per
         * definizione: senza, llama.cpp dequantizza ad ogni passo — più
         * lento che non quantizzare affatto. Stessa condizione di `-ngl`
         * sopra: solo se c'è davvero un backend GPU, mai su una build
         * CPU-only dove l'offload è zero.
         */
        ...(Number.isInteger(gpuLayers) && gpuLayers > 0 ? ['-fa', '1', '--cache-type-k', 'q8_0', '--cache-type-v', 'q8_0'] : []),
        '--jinja',
        '--metrics',
        '--props',
      ], { cwd: isAbsolute(binaryPath) ? dirname(binaryPath) : process.cwd(), shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      if (!entry.child || typeof entry.child.once !== 'function') throw new LlamaServerSupervisorError('spawn did not return a child process', 'RUNTIME_PROCESS_FAILED');
      attachProcess(entry);
      /*
       * ⛔ L'attesa la decide la DIMENSIONE del file, letta adesso dal disco:
       * un modello che il sistema deve ancora leggere non e' un modello che
       * non parte. Se la misura non riesce si resta sull'attesa di base.
       */
      let byteModello = 0;
      try { byteModello = statSync(modelPath).size; } catch { byteModello = 0; }
      const attesa = attesaSaluteMs(byteModello, healthTimeoutMs);
      const deadline = Date.now() + attesa;
      while (Date.now() < deadline) {
        if (entry.failure) throw new LlamaServerSupervisorError(`llama-server failed: ${entry.failure.message}`, 'RUNTIME_PROCESS_FAILED');
        const result = await health();
        if (result.ok) {
          entry.state = 'ready';
          state = 'ready';
          return status();
        }
        await wait(pollIntervalMs);
      }
      entry.state = 'failed';
      state = 'failed';
      // ⛔ Il messaggio dice QUANTO si e' aspettato e quanto pesa il modello:
      // «timeout» da solo manda a cercare un guasto che non c'e'.
      throw new LlamaServerSupervisorError(`llama-server non è diventato pronto entro ${Math.round(attesa / 1000)} s (modello di ${(byteModello / 1_000_000_000).toFixed(1)} GB)`, 'RUNTIME_HEALTH_TIMEOUT');
    } catch (error) {
      if (entry.child && !entry.closed) entry.child.kill('SIGTERM');
      if (current === entry) current = null;
      state = 'failed';
      if (locked) await modelStore.unlock(modelId).catch(() => {});
      throw error instanceof LlamaServerSupervisorError ? error : new LlamaServerSupervisorError(error.message, 'RUNTIME_PROCESS_FAILED');
    }
  }

  async function stop() {
    const entry = current;
    if (!entry) { state = 'unavailable'; return status(); }
    entry.state = 'stopping';
    state = 'stopping';
    if (entry.child && !entry.closed) entry.child.kill('SIGTERM');
    current = null;
    state = 'unavailable';
    if (modelStore && entry.modelId) await modelStore.unlock(entry.modelId).catch(() => {});
    return status();
  }

  function subscribeLogs(listener) {
    if (typeof listener !== 'function') throw invalid('log listener must be a function');
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return Object.freeze({ start, health, request, stop, status, subscribeLogs });
}
