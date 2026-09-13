import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { basename, dirname, isAbsolute, join } from 'node:path';
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

/*
 * ⭐⭐⭐ BC-13, 12/09/2026 — LE LEVE DI VELOCITÀ NON SI SCRIVONO A MANO: SI
 * CHIEDONO AL BINARIO.
 *
 * Owner 12/09: «bisogna fare una ricerca delle ultime tecnologie e metodi
 * all'avanguardia, dobbiamo rendere il motore di llm locale estremamente
 * rapido e meglio dei competitor». E vincolo dell'11/09, che vale su tutto
 * quello che segue: «NESSUN MODELLO PREDEFINITO: motore ottimizzato a
 * livello UNIVERSALE, non forziamo nulla, sarà l'utente a decidere».
 *
 * ⇒ Nessuna delle due leve qui sotto nomina un modello, una scheda o un
 * numero magico: ognuna fa una DOMANDA al binario che l'utente ha, e usa la
 * risposta. Se il binario non sa rispondere, si resta esattamente al
 * comportamento di prima.
 */
const TIMEOUT_SONDA_MS = 30_000;

/**
 * Il fitter ufficiale di llama.cpp (`llama-fit-params`, lo stesso codice che
 * il server usa con `--fit on`) stampa su stdout gli argomenti che ENTRANO
 * nella memoria del dispositivo, per esempio `-c 16384 -ngl -1` oppure
 * `-c 16384 -ngl 56`.
 *
 * ⛔ `-1` (o `all`) è l'unico esito che dice «ci sta TUTTO». Un numero è già
 * una resa parziale: qualche livello resterebbe fuori dalla scheda.
 */
export function leggiNglDalFitter(stdout) {
  if (typeof stdout !== 'string') return null;
  const trovato = /-ngl\s+(-?\d+|all|auto)/u.exec(stdout);
  if (!trovato) return null;
  const valore = trovato[1];
  if (valore === 'all' || valore === '-1') return 'tutto';
  if (valore === 'auto') return null;
  const numero = Number(valore);
  return Number.isInteger(numero) ? numero : null;
}

/**
 * ⭐⭐⭐ MISURATO 12/09/2026 sul banco (Qwen3-4B-Q4_K_M, RX 9070 XT Vulkan,
 * preambolo di 11.065 token, 3 ripetizioni, mediane):
 *
 *   KV cache q8_0 (quello che passavamo SEMPRE): prompt 3.964 ms · gen 127,6 t/s
 *   KV cache f16 (il predefinito del binario):   prompt 2.849 ms · gen 117,5 t/s
 *
 * Cioè: quantizzare la KV cache costa **+39% sul tempo al primo token** e
 * regala +8,6% in generazione. Su un preambolo d'agente da 11.000 token il
 * primo token è quello che la persona aspetta — 1,1 secondi in più, ogni
 * volta che la cache non prende. Sul compito «ricopia» la forbice è ancora
 * più larga: 4.212 ms contro 2.969 (−29,5%), e il turno successivo 289 ms
 * contro 179 (−38,1%).
 *
 * ⛔ La misura del 03/09 che aveva introdotto q8_0 («+408% in elaborazione
 * del prompt») era stata presa sul modello giocattolo da 0,6B Q2_K, dove la
 * KV cache è minuscola: su un modello vero il verso si ROVESCIA. Non è che
 * quella misura fosse sbagliata — è che non parlava di questo caso.
 *
 * ⛔ E q8_0 NON è inutile: dimezza la cache. Sullo stesso 4B a 131.072 token
 * di contesto il fitter risponde `-ngl 24` con f16 (24 livelli su GPU, il
 * resto sul processore = disastro) e `-ngl -1` con q8_0 (tutto sulla
 * scheda). ⇒ La scelta NON è una preferenza, è una MISURA che cambia da
 * modello a modello e da contesto a contesto.
 *
 * ⇒ Regola universale: f16 se con f16 ci sta tutto; altrimenti q8_0.
 *   Se non si riesce a chiedere, q8_0 — cioè il comportamento di ieri.
 *
 * @returns {{tipo: 'f16'|'q8_0', perche: string}}
 */
export function decidiTipoKvCache({ nglConF16, nglConQ8 } = {}) {
  if (nglConF16 === 'tutto') {
    return { tipo: 'f16', perche: 'con KV f16 il fitter del binario dichiara che TUTTI i livelli entrano nel dispositivo' };
  }
  if (nglConF16 === null || nglConF16 === undefined) {
    return { tipo: 'q8_0', perche: 'il fitter del binario non ha risposto: si resta sulla KV quantizzata di prima' };
  }
  if (nglConQ8 === 'tutto') {
    return { tipo: 'q8_0', perche: `con KV f16 entrerebbero solo ${nglConF16} livelli, con q8_0 entrano tutti` };
  }
  return { tipo: 'q8_0', perche: `con KV f16 entrerebbero solo ${nglConF16} livelli: la cache dimezzata ne fa entrare di più` };
}

/**
 * ⭐⭐⭐ MISURATO 12/09/2026, stesso banco, compito «ricopia alla lettera un
 * passaggio del contesto» — cioè il lavoro vero di un agente: rimettere
 * fuori un risultato d'attrezzo, riscrivere un file che ha appena letto.
 * Generazione, mediane su 3 ripetizioni:
 *
 *   senza                        123,5 token/s
 *   --spec-type ngram-simple     158,4 token/s   (+28%)
 *   --spec-type ngram-cache      202,3 token/s   (+64%)
 *   --spec-type ngram-mod        353,2 token/s   (+186%, cioè 2,9×)
 *   ngram-mod + KV f16           445,5 token/s   (+261% sulla riga di oggi)
 *
 * ⭐ Perché conta più di quanto sembri: la decodifica speculativa classica
 * vuole un SECONDO modello (il «draft»). LM Studio la offre solo così — la
 * sua documentazione dice che «relies on the collaboration of two models»
 * (lmstudio.ai/docs/app/advanced/speculative-decoding, letta il 12/09/2026);
 * Ollama non la offre affatto (docs.ollama.com/faq, 12/09/2026). Le varianti
 * `ngram-*` di llama.cpp NON vogliono nessun secondo modello: pescano i
 * candidati dal contesto già presente. ⇒ È l'unica forma compatibile col
 * vincolo «nessun modello predefinito», e vale per un GGUF qualunque.
 *
 * ⛔ IL VERSO CONTRARIO, misurato e non supposto: quando nel contesto non
 * c'è niente da pescare la leva COSTA. Prima chiamata di un server appena
 * acceso, caso peggiore osservato 110,7 token/s contro 123,7 (−10,5%); sul
 * compito «riassumi» (testo nuovo) prima chiamata 124,7 contro 127,6
 * (−2,3%). Il costo si paga una volta e si ripaga dalla seconda chiamata in
 * poi: nella stessa sessione la mediana sale a 353. Un harness fa decine di
 * chiamate per giro, non una.
 *
 * ⛔ Si accende SOLO se questo binario la offre davvero: `--spec-type` è
 * comparso da poco e un binario più vecchio morirebbe all'avvio con
 * «unknown argument». Non si suppone: si legge il suo `--help`.
 */
export function supportaSpeculativaNgram(testoAiuto) {
  if (typeof testoAiuto !== 'string' || testoAiuto === '') return false;
  const riga = /--spec-type[^\n]*/u.exec(testoAiuto);
  return Boolean(riga && riga[0].includes('ngram-mod'));
}

/**
 * Sonda sincrona e volutamente povera: un eseguibile ACCANTO al binario del
 * server, nessuna shell, un tetto di tempo, e un `catch` che non nasconde
 * niente perché chi chiama tratta `null` come «non lo so».
 */
function creaSondaBinario(spawnSyncImpl = spawnSync) {
  return function sonda(eseguibile, argomenti, timeoutMs = TIMEOUT_SONDA_MS) {
    try {
      const esito = spawnSyncImpl(eseguibile, argomenti, {
        shell: false, windowsHide: true, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024,
      });
      if (!esito || esito.error) return null;
      return `${esito.stdout ?? ''}\n${esito.stderr ?? ''}`;
    } catch {
      return null;
    }
  };
}

/** `llama-fit-params` sta nella stessa cartella di `llama-server`, con la stessa estensione. */
export function percorsoFitter(binaryPath) {
  if (typeof binaryPath !== 'string' || binaryPath.trim() === '') return null;
  const nome = basename(binaryPath);
  const sostituito = nome.replace(/llama-server/iu, 'llama-fit-params');
  if (sostituito === nome) return null;
  return join(dirname(binaryPath), sostituito);
}

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
  /**
   * ⭐ BC-13 — come si INTERROGA il binario (il suo `--help`, il suo fitter).
   * Iniettabile perché nessun test debba avviare un processo vero, e perché
   * la prova al verso contrario («il binario NON offre la leva») si possa
   * scrivere senza procurarsi un binario vecchio.
   */
  sondaBinario = creaSondaBinario(),
  /**
   * ⛔ L'interruttore della speculativa, e il motivo per cui esiste: il
   * difetto aperto ggml-org/llama.cpp#25819 — «server : add stuck-loop escape
   * for ngram-mod (WIP)», aperto il 17/07/2026 e ancora aperto al 12/09/2026
   * — descrive un ciclo che non esce quando la verifica dei candidati
   * fallisce ripetutamente. Sul banco del 12/09 non si è mai presentato (3
   * ripetizioni × 2 compiti × 2 modelli di cache, uscite identiche byte per
   * byte alla riga senza speculativa su 3 domande su 3), ma un difetto
   * aperto a monte si spegne da UN posto, non riscrivendo il codice.
   * `'auto'` = si accende se il binario la offre; `'off'` = mai.
   */
  speculativaNgram = 'auto',
} = {}) {
  if (typeof binaryPath !== 'string' || binaryPath.trim() === '') throw new LlamaServerSupervisorError('binaryPath is required', 'RUNTIME_MISCONFIGURED');
  const processPolicy = createProcessPolicy({ allowedExecutables: [binaryPath], spawnFn: spawnImpl });
  let current = null;
  let state = 'unavailable';
  const listeners = new Set();
  /* Le risposte del binario non cambiano fra un avvio e l'altro: si pagano
   * una volta sola. Il fitter dipende anche dal modello e dal contesto. */
  let aiutoDelBinario;
  const leveMemorizzate = new Map();

  function speculativaDisponibile() {
    if (speculativaNgram === 'off') return false;
    if (aiutoDelBinario === undefined) aiutoDelBinario = sondaBinario(binaryPath, ['--help'], 10_000);
    return supportaSpeculativaNgram(aiutoDelBinario ?? '');
  }

  /**
   * ⛔ Si chiede al fitter SOLO quando stiamo davvero offloadando: su una
   * build senza backend la domanda «ci sta nella scheda?» non ha oggetto, e
   * nessuno dei due argomenti verrebbe passato comunque.
   */
  function leveVelocita(modelPath, contextLength) {
    const chiave = `${modelPath}|${contextLength ?? ''}`;
    if (leveMemorizzate.has(chiave)) return leveMemorizzate.get(chiave);
    const fitter = percorsoFitter(binaryPath);
    const contesto = Number.isInteger(contextLength) && contextLength > 0 ? ['-c', String(contextLength)] : [];
    let kv = { tipo: 'q8_0', perche: 'il fitter del binario non è stato trovato: si resta sulla KV quantizzata di prima' };
    if (fitter) {
      const conF16 = leggiNglDalFitter(sondaBinario(fitter, ['-m', modelPath, ...contesto, '-fa', '1']) ?? '');
      const conQ8 = conF16 === 'tutto'
        ? null
        : leggiNglDalFitter(sondaBinario(fitter, ['-m', modelPath, ...contesto, '-fa', '1', '-ctk', 'q8_0', '-ctv', 'q8_0']) ?? '');
      kv = decidiTipoKvCache({ nglConF16: conF16, nglConQ8: conQ8 });
    }
    const leve = { kv, speculativa: speculativaDisponibile() };
    leveMemorizzate.set(chiave, leve);
    return leve;
  }

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
    entry.child.stderr?.on('data', (chunk) => {
      /*
       * ⛔ BC-13 — le ultime righe si TENGONO, non solo si trasmettono. Sono
       * l'unica cosa che spiega perché un motore non è partito, e finora
       * uscivano solo verso chi si era iscritto ai log: chi riceveva
       * l'eccezione leggeva «timeout» e andava a cercare un guasto che non
       * c'era.
       */
      const testo = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      for (const riga of testo.split('\n')) {
        if (riga.trim() === '') continue;
        entry.ultimeRighe.push(riga.trim());
        if (entry.ultimeRighe.length > 12) entry.ultimeRighe.shift();
      }
      emitLog('stderr', chunk);
    });
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
      ultimeRighe: [],
    };
    current = entry;
    state = 'loading';
    /*
     * ⛔ Le domande al binario si fanno PRIMA di accenderlo, e il loro esito
     * si dice ad alta voce: una leva che si accende in silenzio è una leva
     * che nessuno può smentire. Misurato 12/09: il fitter risponde in 0,34 s
     * su un modello da 2,3 GB e in 3,9 s su uno da 15,3 GB; `--help` in
     * meno di 0,3 s; e si pagano una volta sola per (modello, contesto).
     */
    const leve = Number.isInteger(gpuLayers) && gpuLayers > 0
      ? leveVelocita(modelPath, contextLength)
      : { kv: { tipo: 'q8_0', perche: 'nessun offload sul dispositivo: la KV cache non entra nella scelta' }, speculativa: speculativaDisponibile() };
    emitLog('stderr', `[talos] KV cache ${leve.kv.tipo} — ${leve.kv.perche}\n`);
    emitLog('stderr', `[talos] decodifica speculativa a n-grammi: ${leve.speculativa ? 'accesa (--spec-type ngram-mod)' : 'non offerta da questo binario'}\n`);
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
         *
         * ⛔⛔⛔ 03/9 — BUG REALE trovato benchmarkando un modello VERO (27B
         * Q4_K_M, 16,46 GB) invece del giocattolo 0,6B su cui il 99 sopra era
         * stato misurato: `-ngl 99` forza SEMPRE tutti i layer in VRAM, ma
         * questo modello supera i 16,3 GB totali della scheda. Il log del
         * binario stesso lo dice: «common_fit_params: failed to fit params to
         * free device memory: n_gpu_layers already set by user to 99, abort»
         * — llama.cpp SA che non entra, ma l'auto-fit si disattiva appena
         * l'utente fissa `-ngl` a un numero esplicito. Risultato misurato:
         * generazione a **13,28 tok/s**, un decimo di quello che la scheda fa
         * su un modello che ci sta (62 tok/s, ricerca sopra) — overflow
         * silenzioso verso la memoria condivisa di Windows (WDDM), niente
         * errore, nessun avviso, solo lento.
         *
         * ⭐ Owner: "bisogna usare la RAM e la VRAM come fa LM Studio".
         * Verificato COME: LM Studio stima l'ingombro PRIMA di caricare e
         * riduce i layer se non entrano (guardrail, con avviso — mai un
         * overflow muto) — lmstudio-bug-tracker #1673/#1631. `--help` sul
         * BINARIO VERO conferma che llama-server ha già la stessa cosa
         * incorporata: `-ngl` accetta un numero, `auto` o `all` (default:
         * **auto**), e `-fit on` (default) «adjusts UNSET arguments to fit in
         * device memory» — si disattiva SOLO se l'argomento è impostato
         * esplicitamente, esattamente il nostro caso.
         *
         * ⛔⛔⛔ 03/9, STESSO GIORNO — provato `'auto'` qui, poi MISURATO contro
         * `99` esplicito con un banco A/B pulito (stesso modello 27B, stesso
         * prompt, `benchmark-gpu-reale.mjs`): `auto` è PEGGIO, non meglio —
         * 11,12 tok/s contro 13,28 (-16%), 191,3 contro 262,3 in prompt
         * processing (-27%), e in più un avviso «GDN mismatch» che con `99`
         * non compare. Il fitter del binario, su QUESTA architettura ibrida
         * Gated Delta Net, sceglie un piazzamento peggiore di quello ingenuo
         * — l'ipotesi «auto = mai peggio di un overflow muto» era ragionevole
         * e si è misurata falsa qui. Confermato anche da una ricerca esterna
         * commissionata lo stesso giorno (custodita in TALOS-RICERCHE,
         * 2026-09-03-ottimizzazioni-llama-server-rx9070xt.md): i profili che
         * raccomanda per QUESTA scheda usano `-ngl 99` esplicito, mai `auto`.
         * ⇒ Si torna al numero esplicito. Il caso reale che aveva motivato
         * `auto` (un modello che eccede la VRAM totale, non solo quella
         * libera) resta scomodo — genera comunque overflow verso la memoria
         * condivisa di Windows — ma fra i due, `99` vince anche lì: non è
         * stato trovato NESSUN caso, su questo binario e questa scheda, dove
         * `auto` batta il numero esplicito. Se un caso simile ricomparirà, si
         * ri-misura da capo prima di ripetere questo cambio, non si presume.
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
        /*
         * ⭐⭐⭐ BC-13, 12/09/2026 — il TIPO della KV cache non è più fisso.
         * Fino a ieri qui c'era sempre `q8_0`; misurato sul banco, su un
         * modello vero costa il 39% del tempo al primo token. Ora lo decide
         * `decidiTipoKvCache` chiedendo al fitter del binario se con la
         * cache piena (f16) i livelli entrano ancora tutti nel dispositivo.
         * Vedi il commento della funzione per i numeri.
         *
         * ⛔ `-fa 1` resta SEMPRE: la quantizzazione della KV cache lo
         * richiede per definizione (senza, llama.cpp dequantizza a ogni
         * passo), e con f16 non fa danno — il binario ha comunque `-fa auto`
         * come predefinito, quindi lo stiamo solo dichiarando.
         * ⛔ K e V restano SIMMETRICI: una coppia asimmetrica ripiega su un
         * percorso lento (ggml-org/llama.cpp discussions #22411).
         */
        ...(Number.isInteger(gpuLayers) && gpuLayers > 0
          ? ['-fa', '1', '--cache-type-k', leve.kv.tipo, '--cache-type-v', leve.kv.tipo]
          : []),
        /*
         * ⭐⭐⭐ BC-13 — decodifica speculativa a n-grammi, SENZA modello draft.
         * Misure e verso contrario nel commento di `supportaSpeculativaNgram`.
         * Si accende solo se questo binario la offre: un binario più vecchio
         * morirebbe all'avvio con «unknown argument», e un motore che non
         * parte è infinitamente più lento di uno lento.
         */
        ...(leve.speculativa ? ['--spec-type', 'ngram-mod'] : []),
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
        /*
         * ⛔⛔⛔ BC-13, 12/09/2026 — UN PROCESSO GIÀ MORTO NON DIVENTA PRONTO,
         * e aspettarlo è tempo rubato alla persona.
         *
         * MISURATO, non dedotto: il 27B dell'owner (15,3 GB) su questa
         * macchina muore in **4,9 secondi** con «ggml_vulkan:
         * vk::Device::allocateMemory: ErrorOutOfDeviceMemory». Il ciclo qui
         * sotto guardava solo `entry.failure` — che si popola solo se lo
         * SPAWN fallisce, non se il processo esce da solo — e continuava a
         * bussare a una porta chiusa per `15 s + 15 s/GB`, cioè **245
         * secondi**, per poi dire «non è diventato pronto entro 245 s».
         *
         * ⇒ Quattro minuti di attesa e un messaggio che manda a cercare un
         * modello «troppo grande» o un'attesa «troppo corta», mentre il
         * motore aveva già detto esattamente cosa non andava. Ora si guarda
         * anche `closed`, e l'errore PORTA le ultime righe del motore.
         */
        if (entry.closed) {
          const detto = entry.ultimeRighe.slice(-4).join(' | ');
          throw new LlamaServerSupervisorError(
            `llama-server si è chiuso dopo ${Math.round((Date.now() - (deadline - attesa)) / 1000)} s senza mai diventare pronto${detto ? `: ${detto}` : ''}`,
            'RUNTIME_PROCESS_FAILED',
          );
        }
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
