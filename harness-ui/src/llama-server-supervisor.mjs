import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { setTimeout as wait } from 'node:timers/promises';
import { createLlamaBinaryProbe } from './llama-binary-probe.mjs';
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

export function createLlamaServerSupervisor({
  binaryPath,
  // R-03: il binario CPU di riserva e la descrizione del motore scelto dal guscio.
  fallbackBinaryPath = null,
  motore: motoreDichiarato = null,
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
  sondaBinario = null,
  // Optional metadata-only observer: no model paths, arguments, output or keys.
  onProbe = null,
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
  if (fallbackBinaryPath !== null && (typeof fallbackBinaryPath !== 'string' || fallbackBinaryPath.trim() === '')) throw new LlamaServerSupervisorError('fallbackBinaryPath must be a non-empty string', 'RUNTIME_MISCONFIGURED');
  const processPolicy = createProcessPolicy({ allowedExecutables: [binaryPath, ...(fallbackBinaryPath ? [fallbackBinaryPath] : [])], spawnFn: spawnImpl });
  const probeBinary = sondaBinario ?? createLlamaBinaryProbe({ onObservation: onProbe });
  if (typeof probeBinary !== 'function') throw new LlamaServerSupervisorError('sondaBinario must be a function', 'RUNTIME_MISCONFIGURED');
  let pendingStart = null;
  let stopPromise = null;
  let current = null;
  let state = 'unavailable';
  const listeners = new Set();
  /* Le risposte del binario non cambiano fra un avvio e l'altro: si pagano
   * una volta sola. Il fitter dipende anche dal modello e dal contesto.
   * R-03: si ricordano PER BINARIO — la riserva CPU non offre le stesse cose. */
  const aiutoPerBinario = new Map();
  const leveMemorizzate = new Map();
  const motoreIniziale = Object.freeze({
    variante: motoreDichiarato?.variante ?? (/vulkan/iu.test(basename(binaryPath)) ? 'vulkan' : 'cpu'),
    dispositivi: Array.isArray(motoreDichiarato?.dispositivi) ? [...motoreDichiarato.dispositivi] : [],
  });
  let motore = { variante: motoreIniziale.variante, dispositivi: [...motoreIniziale.dispositivi], ripiego: null, proposta: null };

  function cancelled() {
    return new LlamaServerSupervisorError('runtime start cancelled', 'RUNTIME_START_CANCELLED');
  }

  function checkStart(operation) {
    if (pendingStart !== operation || operation.controller.signal.aborted) throw cancelled();
  }

  async function unlock(operation) {
    if (!operation?.locked) return;
    operation.locked = false;
    await Promise.resolve().then(() => modelStore.unlock(operation.modelId)).catch(() => {});
  }

  async function speculativaDisponibile(binario, operation) {
    checkStart(operation);
    if (speculativaNgram === 'off') return false;
    if (!aiutoPerBinario.has(binario)) {
      const help = await probeBinary(binario, ['--help'], 10_000, { signal: operation.controller.signal });
      checkStart(operation); // A cancelled observation must never populate the cache.
      aiutoPerBinario.set(binario, help);
    }
    return supportaSpeculativaNgram(aiutoPerBinario.get(binario) ?? '');
  }

  /**
   * ⛔ Si chiede al fitter SOLO quando stiamo davvero offloadando: su una
   * build senza backend la domanda «ci sta nella scheda?» non ha oggetto, e
   * nessuno dei due argomenti verrebbe passato comunque.
   */
  async function leveVelocita(binario, modelPath, contextLength, operation) {
    checkStart(operation);
    const chiave = `${binario}|${modelPath}|${contextLength ?? ''}`;
    if (leveMemorizzate.has(chiave)) return leveMemorizzate.get(chiave);
    const fitter = percorsoFitter(binario);
    const contesto = Number.isInteger(contextLength) && contextLength > 0 ? ['-c', String(contextLength)] : [];
    let kv = { tipo: 'q8_0', perche: 'il fitter del binario non è stato trovato: si resta sulla KV quantizzata di prima' };
    if (fitter) {
      const conF16 = leggiNglDalFitter(await probeBinary(fitter, ['-m', modelPath, ...contesto, '-fa', '1'], 30_000, { signal: operation.controller.signal }) ?? '');
      checkStart(operation);
      const conQ8 = conF16 === 'tutto'
        ? null
        : leggiNglDalFitter(await probeBinary(fitter, ['-m', modelPath, ...contesto, '-fa', '1', '-ctk', 'q8_0', '-ctv', 'q8_0'], 30_000, { signal: operation.controller.signal }) ?? '');
      checkStart(operation);
      kv = decidiTipoKvCache({ nglConF16: conF16, nglConQ8: conQ8 });
    }
    const leve = { kv, speculativa: await speculativaDisponibile(binario, operation) };
    checkStart(operation);
    leveMemorizzate.set(chiave, leve);
    return leve;
  }

  function status() {
    // R-03: `motore` esce sempre (anche a riposo o dopo un guasto): variante, dispositivi,
    // l'eventuale ripiego avvenuto in questo caricamento e la proposta per la persona.
    const fotoMotore = { variante: motore.variante, dispositivi: [...motore.dispositivi], ripiego: motore.ripiego ? { ...motore.ripiego } : null, proposta: motore.proposta ? { ...motore.proposta } : null };
    if (!current) return { state, runtimeId: 'llama.cpp', motore: fotoMotore, observedAt: now().toISOString() };
    return {
      state: current.state,
      runtimeId: 'llama.cpp',
      motore: fotoMotore,
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
      // R-03: l'ultima riga senza a-capo (il motore muore a metà frase) si tiene lo stesso.
      if (entry.residuoStderr && entry.residuoStderr.trim() !== '') {
        entry.ultimeRighe.push(entry.residuoStderr.trim());
        if (entry.ultimeRighe.length > 12) entry.ultimeRighe.shift();
      }
      entry.residuoStderr = '';
      entry.closed = true;
      if (current === entry && entry.state !== 'stopping') {
        entry.state = 'failed';
        state = 'failed';
      }
    };
    const onError = (error) => {
      entry.failure = error;
      entry.state = 'failed';
      if (current === entry) state = 'failed';
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
      /*
       * ⛔ R-03, 13/09 — i pezzi arrivano SPEZZATI («No d» + «evices found.»): una
       * riga si chiude solo all'a-capo, altrimenti la firma del guasto non si
       * riconosce. Il residuo senza a-capo si tiene fino al prossimo pezzo o alla
       * chiusura del processo (vedi onClose).
       */
      entry.residuoStderr = (entry.residuoStderr ?? '') + testo;
      const parti = entry.residuoStderr.split('\n');
      entry.residuoStderr = parti.pop();
      for (const riga of parti) {
        if (riga.trim() === '') continue;
        entry.ultimeRighe.push(riga.trim());
        if (entry.ultimeRighe.length > 12) entry.ultimeRighe.shift();
      }
      emitLog('stderr', chunk);
    });
  }

  async function health({ signal } = {}) {
    const entry = current;
    if (!entry?.child) return { ok: false, status: 0, code: 'RUNTIME_UNREACHABLE' };
    try {
      const response = await fetchImpl(`${entry.baseUrl}/health`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${entry.apiKey}` },
        ...(signal ? { signal } : {}),
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
  /*
   * ⭐⭐⭐ R-03, 13/09/2026 — IL MOTORE SI SCEGLIE DALLA MACCHINA, E SE LA SCHEDA
   * NON C'È SI RIPIEGA SUL PROCESSORE.
   *
   * Il guscio sceglie la build Vulkan solo se `--list-devices` elenca un
   * dispositivo (`desktop/runtime.mjs`), ma una scheda può mancare o sparire
   * DOPO: driver assente («ggml_vulkan: No devices found», «ErrorIncompatibleDriver»)
   * o dispositivo perso («vk::DeviceLostError», «ErrorDeviceLost»). In quei due
   * casi, e solo in quelli, il caricamento riparte UNA volta sul binario CPU di
   * riserva (`fallbackBinaryPath`, `-ngl 0 --device none`, senza KV quantizzata né
   * speculativa se quel binario non la offre), e lo stato lo dice:
   * `motore.ripiego = { da, a, motivo }`.
   *
   * ⛔ NON si ripiega su «ErrorOutOfDeviceMemory»: la scheda c'è, è il modello che
   * non entra (llama.cpp #15054, #5848, #9271, letti il 13/09/2026); sul
   * processore girerebbe ma lentissimo, e la scelta spetta alla persona:
   * `motore.proposta = { a: 'cpu', motivo }`. Né su un errore generico (file GGUF
   * rotto, argomento sconosciuto): cambiare binario non lo curerebbe.
   * ⛔ Un processo morto DOPO essere diventato pronto non riparte da solo (come
   * prima); il prossimo `start()` ritenta sempre dal binario scelto dal guscio.
   * Firme prese da ggml-vulkan.cpp al pin b10517 (elenco chiuso: un regex largo
   * scambierebbe un avviso per un guasto). Fonti nel rapporto R-03.
   */
  const FIRME_RIPIEGO = Object.freeze([
    { classe: 'driver', motivo: 'la scheda grafica non è disponibile (driver Vulkan assente o incompatibile)', firme: ['ggml_vulkan: No devices found', 'ErrorIncompatibleDriver', 'ErrorInitializationFailed', 'ErrorLayerNotPresent'] },
    { classe: 'perso', motivo: 'la scheda grafica non risponde più (dispositivo perso)', firme: ['DeviceLostError', 'ErrorDeviceLost', 'device lost'] },
  ]);
  const FIRME_MEMORIA = Object.freeze(['ErrorOutOfDeviceMemory', 'ErrorOutOfHostMemory']);

  function classificaGuastoVulkan(righe) {
    const testo = righe.join('\n');
    for (const f of FIRME_RIPIEGO) if (f.firme.some(s => testo.includes(s))) return { classe: f.classe, motivo: f.motivo };
    if (FIRME_MEMORIA.some(s => testo.includes(s))) return { classe: 'memoria', motivo: 'la memoria della scheda grafica non basta per questo modello con questo contesto' };
    return null;
  }

  function nuovoMotore(variante) {
    return { variante, dispositivi: variante === motoreIniziale.variante ? [...motoreIniziale.dispositivi] : [], ripiego: null, proposta: null };
  }

  async function lanciaProcesso({ modelId, modelPath, selectedPort, contextLength, binario, ngl, apiKey, operation }) {
    checkStart(operation);
    const entry = {
      child: null,
      operation,
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
      residuoStderr: '',
      binario,
    };
    current = entry;
    operation.entry = entry;
    state = 'loading';
    const conOffload = Number.isInteger(ngl) && ngl > 0;
    /*
     * ⛔ Le domande al binario si fanno PRIMA di accenderlo, e il loro esito
     * si dice ad alta voce: una leva che si accende in silenzio è una leva
     * che nessuno può smentire. Misurato 12/09: il fitter risponde in 0,34 s
     * su un modello da 2,3 GB e in 3,9 s su uno da 15,3 GB; `--help` in
     * meno di 0,3 s; e si pagano una volta sola per (binario, modello, contesto).
     */
    const leve = conOffload
      ? await leveVelocita(binario, modelPath, contextLength, operation)
      : { kv: { tipo: 'q8_0', perche: 'nessun offload sul dispositivo: la KV cache non entra nella scelta' }, speculativa: await speculativaDisponibile(binario, operation) };
    checkStart(operation);
    emitLog('stderr', `[talos] motore ${motore.variante}${motore.ripiego ? ` (ripiego da ${motore.ripiego.da})` : ''}: ${binario}\n`);
    emitLog('stderr', `[talos] KV cache ${leve.kv.tipo} — ${leve.kv.perche}\n`);
    emitLog('stderr', `[talos] decodifica speculativa a n-grammi: ${leve.speculativa ? 'accesa (--spec-type ngram-mod)' : 'non offerta da questo binario'}\n`);
    checkStart(operation); // Log subscribers may have requested stop synchronously.
    entry.child = processPolicy.spawn(binario, [
      '-m', modelPath,
      ...(modelId ? ['--alias', modelId] : []),
      '--host', LOOPBACK,
      '--port', String(selectedPort),
      '--api-key', apiKey,
      /*
       * ⛔⛔⛔ 03/9 — QUI NON PASSAVAMO MAI `-c`, e il 27B dell'owner non
       * partiva: senza `-c` llama.cpp alloca il contesto ADDESTRATO del modello
       * (262.144 token per quel file). Misurato: lo stesso file con `-c 2048`
       * dice «model loaded / listening» in 13 secondi. Storia intera nel
       * commit c89dc763 e seguenti.
       */
      ...(Number.isInteger(contextLength) && contextLength > 0 ? ['-c', String(contextLength)] : []),
      /*
       * ⭐⭐⭐ 03/9 — LA GPU: `-ngl 99` esplicito (misurato meglio di `auto` su
       * RX 9070 XT, banco A/B del 03/9: 13,28 contro 11,12 tok/s). Solo se il
       * binario ha davvero un backend. R-03: sul binario di RISERVA si dichiara
       * `-ngl 0 --device none` (llama.cpp b10517, common/arg.cpp: «none = don't
       * use»), così un ripiego non tenta mai un offload silenzioso.
       */
      ...(conOffload ? ['-ngl', String(ngl)] : (motore.ripiego ? ['-ngl', '0', '--device', 'none'] : [])),
      /*
       * ⭐⭐⭐ 3/9 + BC-13 12/09 — KV cache quantizzata SIMMETRICA con `-fa 1`
       * solo con offload (+15 % generazione, +408 % prompt, misurati); il tipo
       * lo decide il fitter del binario (vedi `decidiTipoKvCache`).
       */
      ...(conOffload
        ? ['-fa', '1', '--cache-type-k', leve.kv.tipo, '--cache-type-v', leve.kv.tipo]
        : []),
      /*
       * ⭐⭐⭐ BC-13 — decodifica speculativa a n-grammi, SENZA modello draft,
       * solo se QUESTO binario la offre (un binario più vecchio morirebbe con
       * «unknown argument»). Misure nel commento di `supportaSpeculativaNgram`.
       */
      ...(leve.speculativa ? ['--spec-type', 'ngram-mod'] : []),
      '--jinja',
      '--metrics',
      '--props',
    ], { cwd: isAbsolute(binario) ? dirname(binario) : process.cwd(), shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
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
      checkStart(operation);
      if (entry.failure) throw new LlamaServerSupervisorError(`llama-server failed: ${entry.failure.message}`, 'RUNTIME_PROCESS_FAILED');
      /*
       * ⛔⛔⛔ BC-13, 12/09/2026 — UN PROCESSO GIÀ MORTO NON DIVENTA PRONTO:
       * il 27B dell'owner muore in 4,9 s con «ErrorOutOfDeviceMemory» e prima
       * si aspettava 245 s bussando a una porta chiusa. Si guarda `closed`, e
       * l'errore PORTA le ultime righe del motore.
       */
      if (entry.closed) {
        const detto = entry.ultimeRighe.slice(-4).join(' | ');
        const errore = new LlamaServerSupervisorError(
          `llama-server si è chiuso dopo ${Math.round((Date.now() - (deadline - attesa)) / 1000)} s senza mai diventare pronto${detto ? `: ${detto}` : ''}`,
          'RUNTIME_PROCESS_FAILED',
        );
        errore.righeMotore = [...entry.ultimeRighe];
        throw errore;
      }
      const result = await health({ signal: AbortSignal.any([operation.controller.signal, AbortSignal.timeout(Math.max(1, deadline - Date.now()))]) });
      checkStart(operation);
      if (result.ok && !entry.closed && !entry.failure) {
        entry.state = 'ready';
        state = 'ready';
        return status();
      }
      await wait(pollIntervalMs, undefined, { signal: operation.controller.signal });
    }
    entry.state = 'failed';
    state = 'failed';
    // ⛔ Il messaggio dice QUANTO si e' aspettato e quanto pesa il modello:
    // «timeout» da solo manda a cercare un guasto che non c'e'.
    throw new LlamaServerSupervisorError(`llama-server non è diventato pronto entro ${Math.round(attesa / 1000)} s (modello di ${(byteModello / 1_000_000_000).toFixed(1)} GB)`, 'RUNTIME_HEALTH_TIMEOUT');
  }

  // Reserve the operation before the first await (port allocation/lock included).
  // A stop drains this owner before a subsequent start may acquire the model lock.
  async function start({ modelId, modelPath, port, contextLength, signal } = {}) {
    if (pendingStart || stopPromise || (current && ['loading', 'ready', 'stopping'].includes(current.state))) {
      throw new LlamaServerSupervisorError('runtime is already active', 'RUNTIME_ALREADY_RUNNING');
    }
    if (typeof modelPath !== 'string' || !isAbsolute(modelPath)) throw invalid('modelPath must be absolute');
    if (signal?.aborted) throw cancelled();
    let complete;
    const operation = { controller: new AbortController(), modelId, locked: false, entry: null,
      done: new Promise(resolve => { complete = resolve; }) };
    const onAbort = () => operation.controller.abort(cancelled());
    signal?.addEventListener('abort', onAbort, { once: true });
    pendingStart = operation;
    state = 'loading';
    const chiudi = (entry) => {
      if (!entry?.child || entry.closed) return;
      entry.state = 'stopping';
      try { entry.child.kill('SIGTERM'); } catch { /* process may already have exited */ }
    };
    try {
      // A prior failed process can still own its lock; do not acquire another one.
      if (current) { chiudi(current); await unlock(current.operation); current = null; }
      checkStart(operation);
      const selectedPort = port ?? await portAllocator();
      checkStart(operation);
      if (!Number.isInteger(selectedPort) || selectedPort < 1024 || selectedPort > 65535) throw invalid('port is invalid');
      if (modelStore && modelId) {
        await modelStore.lock(modelId);
        operation.locked = true;
      }
      checkStart(operation);
      const apiKey = randomBytes(32).toString('hex');
      motore = nuovoMotore(motoreIniziale.variante);
      try {
        return await lanciaProcesso({ modelId, modelPath, selectedPort, contextLength, binario: binaryPath, ngl: gpuLayers, apiKey, operation });
      } catch (primo) {
        checkStart(operation); // Stop is never a reason to start a CPU fallback.
        const guasto = motore.variante === 'vulkan' && primo.code === 'RUNTIME_PROCESS_FAILED' ? classificaGuastoVulkan(primo.righeMotore ?? []) : null;
        if (guasto?.classe === 'memoria') {
          motore.proposta = { a: 'cpu', motivo: `${guasto.motivo}; sul processore il modello può girare, più lento: la scelta è della persona` };
          throw primo;
        }
        if (!guasto || !fallbackBinaryPath) throw primo;
        const primaEntry = current;
        chiudi(primaEntry);
        if (current === primaEntry) current = null;
        const ripiego = { da: motore.variante, a: 'cpu', motivo: guasto.motivo, classe: guasto.classe, righe: (primo.righeMotore ?? []).slice(-4) };
        motore = { ...nuovoMotore('cpu'), ripiego };
        for (const listener of listeners) {
          try { listener({ stream: 'stderr', text: `[talos] ${guasto.motivo}: il modello viene caricato sul processore.\n`, ripiego }); } catch { /* observer isolation */ }
        }
        try {
          return await lanciaProcesso({ modelId, modelPath, selectedPort, contextLength, binario: fallbackBinaryPath, ngl: 0, apiKey, operation });
        } catch (secondo) {
          checkStart(operation);
          const codaGpu = ripiego.righe.join(' | ');
          const errore = new LlamaServerSupervisorError(`${secondo.message}${codaGpu ? ` [prima, sulla scheda grafica: ${codaGpu}]` : ''}`, secondo.code === 'RUNTIME_HEALTH_TIMEOUT' ? 'RUNTIME_HEALTH_TIMEOUT' : 'RUNTIME_PROCESS_FAILED');
          errore.righeMotore = secondo.righeMotore;
          throw errore;
        }
      }
    } catch (error) {
      chiudi(operation.entry);
      if (current === operation.entry) current = null;
      await unlock(operation);
      state = operation.controller.signal.aborted ? 'unavailable' : 'failed';
      if (operation.controller.signal.aborted) throw cancelled();
      throw error instanceof LlamaServerSupervisorError ? error : new LlamaServerSupervisorError(error?.message ?? 'runtime failed', 'RUNTIME_PROCESS_FAILED');
    } finally {
      signal?.removeEventListener('abort', onAbort);
      if (pendingStart === operation) pendingStart = null;
      complete();
    }
  }

  function stop() {
    if (stopPromise) return stopPromise;
    const operation = pendingStart;
    const entry = current;
    operation?.controller.abort(cancelled());
    if (entry) entry.state = 'stopping';
    state = 'stopping';
    stopPromise = Promise.resolve().then(async () => {
      if (operation) {
        await operation.done; // The start owner releases its lock exactly once.
      } else if (entry) {
        if (entry.child && !entry.closed) {
          try { entry.child.kill('SIGTERM'); } catch { /* already exited */ }
        }
        if (current === entry) current = null;
        await unlock(entry.operation);
      }
      state = 'unavailable';
      return status();
    }).finally(() => { stopPromise = null; });
    return stopPromise;
  }

  function subscribeLogs(listener) {
    if (typeof listener !== 'function') throw invalid('log listener must be a function');
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return Object.freeze({ start, health, request, stop, status, subscribeLogs });
}
