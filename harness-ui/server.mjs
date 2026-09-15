import { writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createAutomationScheduler } from './src/automation-scheduler.mjs';
import { createAutomationStore } from './src/automation-store.mjs';
import { loadConfig, trovaPortaLibera } from './src/config.mjs';
import { createHttpApp } from './src/http-app.mjs';
import { createSessionRegistry } from './src/session-registry.mjs';
import { createStaticHandler } from './src/static-files.mjs';
import { listaTaskDisponibili } from './src/task-catalog.mjs';
import { elencaCartelleProgetto } from './src/custom-task.mjs';
import { diagnosi } from './src/doctor.mjs';
import { statoPrimoAvvio } from './src/setup-stato.mjs';
import { createSearchSourceStore } from './src/search-source-store.mjs';
import { ENDPOINT_SENTINELLA_DUCKDUCKGO, creaTrasportoSenzaChiave } from './src/duckduckgo-search.mjs';
import { createModelCatalog } from './src/model-catalog.mjs';
import { createModelsDevCatalog, createProviderModelCatalog } from './src/model-catalog-models-dev.mjs'; // P-E (12/09)
import { creaRegistroTerminali, MINUTI_PRIMA_DI_CHIUDERE_PTY_ORFANA } from './src/pty-terminal.mjs';
import { creaRegistroSchedeTerminale } from './src/terminal-registry.mjs'; // ⭐ 05/9, W1-01
import { creaServizioGit } from './src/git-service.mjs'; // ⭐ 05/9, W1-05
import { creaGestoreTerminaleWs } from './src/terminal-ws.mjs';
import { misuraCapacitaMacchina } from './src/machine-capacity.mjs';
import { createLocalModelStore } from './src/local-model-store.mjs';
import { createOpenAiCompatibleRuntime } from './src/openai-compatible-runtime.mjs';
import { ID_MOTORI_LOCALI_OPENAI } from './src/provider-registry.mjs'; // 12/09, P-C: i motori locali li nomina il registro, non due letterali
import { createHfHubClient } from './src/hf-hub-client.mjs';
import { createHfDirectTransfer } from './src/hf-direct-transfer.mjs';
import { fetchAllowedHfImage } from './src/hf-image-proxy.mjs';
import { createLlamaServerSupervisor } from './src/llama-server-supervisor.mjs';
import { createLlamaServerRuntime } from './src/local-runtime-llama-server.mjs';
import { createProviderProbe } from './src/provider-probe.mjs';
import { createProviderCredentialStore } from './src/provider-credential-store.mjs';
import { createGeneratedImageStore } from './src/generated-image-store.mjs';
import { createOwnerRuntimeAdapter } from './src/runtime-owner-adapter.mjs';
import { createDesktopContextRuntime, resolveDesktopContextProfile } from './src/context-runtime.mjs';
import { createContextTokenCounter, buildPreparedDesktopContextRequest } from './src/context-token-counters.mjs';
import { createChatImageStore } from './src/chat-image-attachments.mjs';
import { avviaSessione } from './src/agent-service.mjs';
import { RUNTIME_BOOTSTRAP_SCHEMA, RUNTIME_RESOURCE_SCHEMA } from './src/runtime-contract.mjs';
import { closeRuntimeResources } from './src/http-lifecycle.mjs';
import { createWorkspaceLaunchStore } from './src/workspace-launch-store.mjs';
import { cartelleConsigliate } from './src/frequent-dirs.mjs';
import { createWorkspaceBrowser } from './src/workspace-browser.mjs';
import { WebSocket } from 'ws'; // 07/9: il canale di controllo verso il Chromium pilotato (CDP parla WebSocket)
import { creaGestoreBrowserVivo } from './src/browser-sessione-viva.mjs'; // 07/9: il Chromium di sistema pilotato dal server
import { createLocalRuntimeProbe } from './src/local-runtime-probe.mjs';
import { readGgufHeader } from './src/gguf-header.mjs';
import { join, parse, isAbsolute } from 'node:path';

/** ⛔ Stessi tre nomi loopback validati in config.mjs (`LOOPBACK_HOSTS`, non esportato — costante minuscola e stabile, duplicarla qui è più semplice che aggiungere un export per tre stringhe). Un browser può presentarsi con uno qualunque dei tre alias anche se il server è bindato su un altro. */
const ALIAS_LOOPBACK = ['127.0.0.1', '::1', 'localhost'];

// Proposta R-02: preservare il default sorgente e rispettare il profilo desktop.
function percorsoDatiDesktop(relativo) {
  const cartella = process.env.TALOS_DESKTOP_DATA_DIR;
  if (!cartella) return fileURLToPath(new URL(relativo, import.meta.url));
  if (!isAbsolute(cartella)) throw new Error('TALOS_DESKTOP_DATA_DIR deve essere assoluto.');
  return join(cartella, relativo);
}

async function startServer() {
  const config = loadConfig(process.env, import.meta.url);
  let providerKeyring = null;
  try {
    const { Entry } = await import('@napi-rs/keyring');
    providerKeyring = {
      get: (service, account) => { try { return new Entry(service, account).getPassword() || null; } catch { return null; } },
      set: (service, account, value) => new Entry(service, account).setPassword(value),
      remove: (service, account) => { try { new Entry(service, account).deletePassword(); } catch { /* assenza già rimossa */ } },
    };
  } catch {
    console.warn('[provider-store] portachiavi del sistema non disponibile; Doctor segnalerà il limite');
  }
  const providerStore = createProviderCredentialStore({
    env: process.env,
    keyring: providerKeyring,
    runtimeFile: percorsoDatiDesktop('.provider-runtime.json'),
  });
  providerStore.loadFromKeyring();

  /*
   * ⭐⭐⭐ 04/9 — R-03, la fonte della ricerca web dalle Impostazioni (parità
   * mobile) e la ricerca SENZA chiave. Stesso portachiavi dei provider
   * (servizio diverso), scelta in `.search-source.json` accanto al server,
   * `TALOS_HARNESS_SEARCH_*` come seme finché non si sceglie dalla UI.
   * Il trasporto senza chiave (DuckDuckGo) è iniettato al kernel come
   * `richiediRicercaFn` SOLO per quella fonte: per Tavily/Brave/SearXNG/custom
   * il kernel usa il suo, con la guardia DNS pubblica.
   */
  const searchSourceStore = createSearchSourceStore({
    env: process.env,
    keyring: providerKeyring,
    file: percorsoDatiDesktop('.search-source.json'),
  });
  const trasportoSenzaChiave = creaTrasportoSenzaChiave();
  const ricercaWebFn = () => searchSourceStore.perKernel({ trasportoSenzaChiave, sentinellaDuckDuckGo: ENDPOINT_SENTINELLA_DUCKDUCKGO });
  const provaRicercaWebFn = async (query) => {
    const { ricercaWeb, richiediRicercaFn } = ricercaWebFn();
    if (!ricercaWeb) { const errore = new Error('La fonte non è pronta'); errore.code = 'SEARCH_NOT_READY'; throw errore; }
    let risultati;
    if (richiediRicercaFn) {
      const u = new URL(ricercaWeb.endpoint); u.searchParams.set('q', query); u.searchParams.set('count', '3');
      risultati = JSON.parse((await richiediRicercaFn(u)).corpo).results ?? [];
    } else {
      if (!config.ownerRuntimeModule) { const errore = new Error('Kernel non configurato: la prova con una fonte a chiave passa dal kernel'); errore.code = 'SEARCH_STORE_UNAVAILABLE'; throw errore; }
      const kernel = await import(pathToFileURL(config.ownerRuntimeModule).href);
      try { risultati = await kernel.eseguiRicercaWeb(query, 3, ricercaWeb); }
      catch (errore) { const e = new Error(errore?.message ?? 'ricerca fallita'); e.code = 'SEARCH_FAILED'; throw e; }
    }
    return { fonte: searchSourceStore.fonte(), risultati: risultati.length, titoli: risultati.slice(0, 3).map((r) => r.title) };
  };

  /*
   * ⭐⭐⭐ 03/9 — la prova della credenziale. Legge la chiave dal portachiavi
   * (mai dal browser) e l'indirizzo/tempo massimo dalle preferenze del
   * provider, così la prova usa ESATTAMENTE la configurazione con cui poi
   * girerà davvero: provare con parametri diversi da quelli veri sarebbe una
   * sonda che scagiona.
   */
  const providerProbe = createProviderProbe({
    leggiChiave: (provider) => providerStore.getKey(provider),
    leggiRuntime: (provider) => providerStore.getRuntime(provider),
  });
  const modelCatalog = createModelCatalog();
  /* P-E (12/09, Astra): i fornitori DIRETTI prendono modelli e prezzi da models.dev (cache su disco con ETag,
     copia servita se la rete manca); OpenRouter resta sul suo catalogo. La chiave non viaggia: si guarda solo se c'è. */
  const modelsDevCatalog = createModelsDevCatalog({ cartellaStore: config.cartellaStore, url: config.modelsDevUrl });
  const providerModelCatalog = createProviderModelCatalog({ catalogo: modelsDevCatalog, chiaveConfigurata: (id) => providerStore.hasKey(id) });
  /*
   * ⛔ 03/9 — LEGAME TARDIVO, e non per eleganza: il supervisore di
   * llama-server viene creato più in basso in questo file (serve il catalogo
   * modelli), mentre l'adattatore agente nasce qui. Passargli il supervisore
   * adesso significherebbe passargli `null` per sempre — e i modelli locali
   * non partirebbero mai, senza un errore da nessuna parte.
   * ⇒ Si passa una funzione che lo legge QUANDO serve, cioè al momento della
   * richiesta, quando il motore può anche essere stato acceso nel frattempo.
   */
  /**
   * Quanti livelli si possono mandare sulla GPU con QUESTO binario.
   *
   * ⛔ 99 è la convenzione affermata per «tutti quelli che ci sono»
   * (llama.cpp docs): non serve sapere quanti siano. Zero se il binario non
   * dichiara nessun dispositivo — una build CPU accetterebbe `-ngl` e lo
   * ignorerebbe, e resteremmo convinti di usare una scheda che non tocchiamo.
   */
  async function rilevaMotore(percorsoBinario) {
    // R-03: oltre a «c'è una GPU?» si tengono i NOMI dei dispositivi, per dirli alla persona.
    try {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const { stdout } = await promisify(execFile)(percorsoBinario, ['--list-devices'], { timeout: 20_000, windowsHide: true });
      const dispositivi = [...stdout.matchAll(/^\s{2,}(\S+\d*):\s*(.+?)\s*$/gmu)].map((m) => m[2].replace(/\s+\(\d+ MiB,.*\)$/u, ''));
      const haDispositivo = dispositivi.length > 0 && !/\(none\)/u.test(stdout);
      if (haDispositivo) console.log('[runtime] backend GPU rilevato dal binario llama-server:', stdout.trim().split(/\r?\n/u).slice(1).join(' | '));
      return { gpuLayers: haDispositivo ? 99 : 0, dispositivi: haDispositivo ? dispositivi : [] };
    } catch {
      return { gpuLayers: 0, dispositivi: [] }; // ⛔ se non si riesce a chiedere, non si dà per scontato
    }
  }

  let supervisoreLocale = null;
  let contextRuntime = null;

  const chatImageStore = createChatImageStore({ rootDir: percorsoDatiDesktop('.chat-images/') });
  const readModelCapabilities = async modelId => {
    try {
      const { modelli } = await modelCatalog.ottieni();
      return modelli.find(modello => modello.id === modelId) ?? null;
    } catch { return null; }
  };
  const ownerRuntime = createOwnerRuntimeAdapter({
    providerStore,
    resolveImagesFn: messages => chatImageStore.resolveMessages(messages),
    modulePath: config.ownerRuntimeModule,
    openRouterRuntimeFn: () => providerStore.getRuntime('openrouter'),
    /*
     * ⭐⭐⭐ 03/9 — da qui passano i modelli che NON sono di OpenRouter.
     * La chiave viene dal portachiavi del computer e non tocca mai il
     * browser; l'indirizzo è quello che la persona ha impostato nella scheda
     * Provider, cioè lo stesso con cui il pulsante «Prova» l'ha verificato:
     * instradare con parametri diversi da quelli provati renderebbe la prova
     * una bugia.
     */
    destinazioneModelloDeps: {
      leggiChiave: (fonte) => { try { return providerStore.getKey(fonte); } catch { return null; } },
      leggiRuntime: (fonte) => { try { return providerStore.getRuntime(fonte); } catch { return {}; } },
      localePronto: () => supervisoreLocale?.status?.()?.state === 'ready',
      /*
       * ⛔ Si passa il PONTE, non la chiave: `request()` del supervisore
       * aggiunge da sé l'`--api-key` generata all'avvio, che non deve essere
       * copiata da nessuna parte — men che meno in una risposta HTTP.
       */
      chiamaLocale: (percorso, opzioni) => supervisoreLocale.request(percorso, opzioni),
      /*
       * ⭐⭐⭐ 3/9 — owner, dal vivo: "non è così che si deve fare... deve
       * partire tutto in automatico". LM Studio/Ollama caricano il modello
       * alla prima richiesta, nessun passo manuale — stesso principio qui:
       * chi risolve la destinazione, se trova il motore spento, chiama
       * QUESTA funzione invece di arrendersi. `localRuntimes['llama.cpp']`
       * non esiste ancora in questo punto del file (viene costruito più
       * sotto): la freccia qui sotto lo referenzia per closure, non lo usa
       * subito — `avviaLocale` viene CHIAMATA solo durante una richiesta
       * vera, ben dopo che il server ha finito di avviarsi. Se il runtime
       * llama.cpp non è configurato affatto (nessun `TALOS_LLAMA_SERVER_PATH`),
       * `localRuntimes['llama.cpp']` è `undefined` e l'errore che risale è
       * quello vero — "non configurato", non un silenzio.
       */
      avviaLocale: (modelId) => {
        const runtime = localRuntimes['llama.cpp'];
        if (!runtime) { const errore = new Error('Il motore locale non è configurato su questo server.'); errore.code = 'LOCAL_RUNTIME_NOT_CONFIGURED'; throw errore; }
        return runtime.load(modelId);
      },
    },
    modelCapabilityFn: readModelCapabilities,
  });
  let taskCatalogProvider = null;
  let taskCatalogError = null;
  try {
    taskCatalogProvider = await ownerRuntime.taskCatalogProvider();
  } catch (error) {
    taskCatalogError = error;
    console.warn(`[runtime-owner] catalogo task non disponibile: ${error.message}`);
  }
  const localModelStore = createLocalModelStore({ rootDir: percorsoDatiDesktop('.local-models/') });
  /*
   * ⭐ 12/09, P-C — il motore locale si sonda all'INDIRIZZO che la persona ha scelto nel pannello
   *   Provider, lo stesso con cui la chat lo chiamerà: sondare un indirizzo e chiamarne un altro
   *   renderebbe la prova una bugia (è la stessa ragione già scritta per `destinazioneModelloDeps`).
   *   ⛔ Si passa una FUNZIONE, non un valore: l'indirizzo può cambiare a server acceso.
   */
  const compatibleRuntime = createOpenAiCompatibleRuntime({
    endpoints: Object.fromEntries(ID_MOTORI_LOCALI_OPENAI.map((id) => [id, () => {
      try { const scelto = providerStore.getRuntime(id)?.endpoint; return scelto ? { baseUrl: scelto } : {}; }
      catch { return {}; }
    }])),
  });
  const hfHubClient = createHfHubClient({ token: config.hfToken });
  const localModelTransfer = createHfDirectTransfer({ rootDir: percorsoDatiDesktop('.local-models/'), modelStore: localModelStore, hubClient: hfHubClient });
  const generatedImageStore = createGeneratedImageStore({ rootDir: percorsoDatiDesktop('.generated-images/') });
  const workspaceLaunchStore = createWorkspaceLaunchStore({ credentialFile: percorsoDatiDesktop('.workspace-launch-token') });
  const localRuntimes = {
    ollama: {
      detect: () => compatibleRuntime.detect('ollama'), listModels: () => compatibleRuntime.listModels('ollama'),
      inspect: (modelId) => compatibleRuntime.inspect('ollama', modelId),
      load: (modelId, options) => compatibleRuntime.load('ollama', modelId, options),
      unload: (modelId) => compatibleRuntime.unload('ollama', modelId),
      generateStream: (options) => compatibleRuntime.generateStream({ ...options, provider: 'ollama' }),
      cancel: (requestId) => compatibleRuntime.cancel(requestId), health: () => compatibleRuntime.health('ollama'),
    },
    lmstudio: {
      detect: () => compatibleRuntime.detect('lmstudio'), listModels: () => compatibleRuntime.listModels('lmstudio'),
      inspect: (modelId) => compatibleRuntime.inspect('lmstudio', modelId),
      load: (modelId, options) => compatibleRuntime.load('lmstudio', modelId, options),
      unload: (modelId) => compatibleRuntime.unload('lmstudio', modelId),
      generateStream: (options) => compatibleRuntime.generateStream({ ...options, provider: 'lmstudio' }),
      cancel: (requestId) => compatibleRuntime.cancel(requestId), health: () => compatibleRuntime.health('lmstudio'),
    },
  };
  /*
   * ⭐⭐⭐ 02/9 — Fase 5, punto 4: `local-runtime-probe.mjs` esisteva già
   * completo (inspectModel/fit/qualify) ma senza `readHeader` non poteva
   * mai partire — vedi `.claude/PIANO-COMPLETO-DESKTOP-2026-08-31.md`. Il
   * probe è specifico a llama.cpp (l'unico runtime locale con file GGUF
   * reali su disco da ispezionare): resta `null` se `config.llamaServerPath`
   * non è configurata, stessa condizione già in uso per `localRuntimes['llama.cpp']`.
   */
  let localRuntimeProbe = null;
  if (config.llamaServerPath) {
    /*
     * ⭐⭐⭐ 03/9 — si CHIEDE AL BINARIO se ha una GPU, non lo si indovina.
     *
     * `llama-server --list-devices` è la sola risposta che vale: la build CPU
     * dice «(none)», quella Vulkan elenca la scheda con la sua VRAM. Da lì
     * si decide se passare `-ngl`, invece di fidarsi del nome del file o di
     * quello che Windows racconta sulla VRAM (tronca a 32 bit: riportava 4 GB
     * per una scheda da 16).
     */
    const { gpuLayers, dispositivi } = await rilevaMotore(config.llamaServerPath);
    /*
     * R-03, 13/09 — la riserva CPU (`TALOS_LLAMA_SERVER_FALLBACK_PATH`, messa dal guscio
     * quando sceglie Vulkan) e la descrizione del motore entrano nel supervisore: se la
     * scheda manca o si perde durante il caricamento, il modello riparte sul processore
     * una volta sola e lo stato lo dichiara (`motore.ripiego`).
     */
    const supervisor = createLlamaServerSupervisor({
      binaryPath: config.llamaServerPath,
      fallbackBinaryPath: config.llamaServerFallbackPath && config.llamaServerFallbackPath !== config.llamaServerPath ? config.llamaServerFallbackPath : null,
      motore: { variante: gpuLayers > 0 ? 'vulkan' : 'cpu', dispositivi },
      modelStore: localModelStore,
      gpuLayers,
    });
    // ⛔ Registrato SUBITO dopo la creazione: è l'unico punto in cui il
    // legame tardivo di sopra si chiude davvero. Senza questa riga i modelli
    // locali resterebbero irraggiungibili con un messaggio che dice
    // «il motore non è acceso» anche quando lo è.
    supervisoreLocale = supervisor;
    const llama = createLlamaServerRuntime({ supervisor });
    localRuntimes['llama.cpp'] = {
      detect: async () => {
        const s = supervisor.status();
        return { state: 'observed', runtimeId: 'llama.cpp', runtimeState: s.state, modelId: s.modelId ?? null, motore: s.motore, observedAt: s.observedAt };
      },
      listModels: async () => (await localModelStore.list()).filter((model) => model.state === 'ready').map((model) => ({ id: model.id, name: model.repo, source: 'llama.cpp', context: { state: 'unknown' } })),
      inspect: (modelId) => localModelStore.inspect(modelId),
      /*
       * ⭐⭐⭐ 03/9 — IL CONTESTO SI SCEGLIE, non si lascia decidere al motore.
       *
       * Owner: «ne ho scaricato uno da 27 b, perché cazzo ne devi usare uno da
       * 600 milioni?». Perché il 27B non partiva — e non per la sua taglia.
       * Senza `-c`, llama.cpp alloca il contesto ADDESTRATO del modello:
       * 262.144 token per quel file, cioè una cache che non sta in nessuna
       * memoria di questo computer. Il 0.6B funzionava solo perché il suo
       * contesto addestrato è 40.960.
       *
       * ⛔ MISURATO: lo stesso file, lanciato a mano con `-c 2048`, dice
       * «model loaded / listening» in 13 secondi.
       *
       * ⇒ Si calcola quanti token ci stanno DAVVERO, con i numeri che questo
       * server già misura: i byte per token della cache (dall'header GGUF) e
       * la memoria libera adesso. Metà del libero, mai oltre il contesto
       * addestrato, mai sotto 4.096 — sotto quella soglia una sessione
       * agentica non ha spazio nemmeno per il prompt di sistema.
       */
      load: async (modelId, opzioni = {}) => {
        const manifest = await localModelStore.inspect(modelId);
        if (!manifest || manifest.state !== 'ready') { const error = new Error('Modello locale non pronto'); error.code = 'MODEL_NOT_FOUND'; throw error; }
        const file = manifest.files[0];
        const radiceModelli = percorsoDatiDesktop('.local-models/');
        const modelPath = join(radiceModelli, manifest.path, file.path);
        let contextLength = Number.isInteger(opzioni.contextLength) && opzioni.contextLength > 0 ? opzioni.contextLength : null;
        if (contextLength === null) {
          try {
            const header = await readGgufHeader(modelPath);
            const macchina = await misuraCapacitaMacchina({ storagePath: config.publicDir });
            const liberi = Number(macchina?.memory?.freeBytes);
            const perToken = Number(header?.kvCacheBytesPerToken);
            if (Number.isFinite(liberi) && Number.isFinite(perToken) && perToken > 0) {
              /*
               * ⛔⛔ I PESI NON SI SOTTRAGGONO. La prima stesura calcolava
               * `(liberi - pesi) * 0.5` e sul 27B dava 7.157 token: la
               * richiesta di apertura ne vuole 8.314 (prompt di sistema più 43
               * attrezzi), quindi la sessione moriva subito con
               * «request exceeds the available context size».
               *
               * MISURATO: lo stesso modello con `-c 32768` parte e resta
               * pronto. Il motivo è che llama.cpp mappa i pesi dal disco
               * (mmap): il sistema li pagina su richiesta e NON occupano la
               * memoria libera. Quella se la prende la cache del contesto, e
               * basta contare quella.
               *
               * ⛔ E il pavimento non è 4.096: sotto gli 8.192 una sessione
               * agentica non ha spazio nemmeno per la propria apertura, e
               * partirebbe solo per fallire al primo messaggio.
               */
              const possibili = Math.floor((liberi * 0.6) / perToken);
              const tetto = header.trainedContext || possibili;
              contextLength = Math.max(8_192, Math.min(tetto, possibili));
              /*
               * ⛔⛔ CON LA GPU IL BUDGET E' UN ALTRO: la cache finisce in
               * VRAM, non nella RAM di sistema, e su questa scheda sono 15,4
               * GB contro un modello da 15,7. Il calcolo qui sopra guarda la
               * RAM e dava 58.739 token: il caricamento moriva.
               *
               * MISURATO sulla RX 9070 XT: `-ngl 99 -c 8192` carica in 15
               * secondi e genera a 7,7 token/s su un 27B, in italiano
               * corretto. Lasciando decidere a llama.cpp (`common_fit_params`,
               * che si adatta alla memoria libera del dispositivo) il modello
               * parte ma il contesto scende a 4.096 — meno degli 8.314 che
               * l'apertura di una sessione agentica richiede, quindi la
               * sessione morirebbe al primo messaggio.
               * ⇒ Con la GPU si resta in una banda misurata e prudente.
               */
              if (gpuLayers > 0) contextLength = Math.max(8_192, Math.min(tetto, 16_384));
            }
          } catch {
            /* ⛔ Se non si riesce a misurare non si inventa un numero grande:
               si resta su un contesto piccolo e sicuro, che almeno parte. */
            contextLength = 8_192;
          }
        }
        return llama.load({ modelId, modelPath, contextLength: contextLength ?? 8_192 });
      },
      unload: () => llama.unload(),
      generateStream: (options) => llama.generateStream(options),
      cancel: (requestId) => llama.cancel(requestId),
      health: () => llama.health(),
    };
    localRuntimeProbe = createLocalRuntimeProbe({
      runtime: llama,
      modelStore: localModelStore,
      /*
       * ⛔ 02/9 (sera) — la radice assoluta la mette QUI il chiamante, che
       * è l'unico a conoscerla: la sonda compone `cartella/file` dal
       * manifest e non sa dove viva `.local-models/`. Stessa radice usata
       * da `load` poche righe sopra — un solo posto da cambiare se un
       * giorno la cartella si sposta.
       */
      readHeader: (percorsoRelativo) => readGgufHeader(join(percorsoDatiDesktop('.local-models/'), percorsoRelativo)),
      measureMachine: () => misuraCapacitaMacchina({ storagePath: config.publicDir }),
    });
  }
  /*
   * ⛔ Nessun fail() se config.chiaveApi manca (vedi config.mjs): il server
   * parte comunque — avviare una sessione fallisce per-richiesta con
   * CONFIG_INVALID, dichiarato al chiamante, non un rifiuto all'avvio.
   */
  const sessionRegistry = createSessionRegistry({
    contextHooksFn: config.contextTrial ? input => contextRuntime.service.createKernelHooks(input) : undefined,
    contextCompactFn: config.contextTrial ? input => contextRuntime.service.compact(input) : undefined,
    avviaSessioneFn: (input) => avviaSessione({
      ...input,
      talosLavoraFn: (runtimeInput) => ownerRuntime.talosLavora(runtimeInput),
    }),
    modello: config.modello,
    chiave: config.chiaveApi,
    chiaveFn: () => providerStore.getKey('openrouter') ?? config.chiaveApi,
    cartelleProgetto: config.cartelleProgetto,
    taskCatalogProvider,
    ricercaWeb: config.ricercaWeb, // seme dell'ambiente: resta per compatibilità, ma è ricercaWebFn a valere a ogni giro
    ricercaWebFn,
    // ⭐⭐⭐ 29/8 — FASE D, firma Ed25519 delle ricevute. Stesso principio di
    // ricercaWeb: undefined quando non configurata (vedi config.mjs), le
    // ricevute restano non firmate — comportamento di sempre.
    firma: config.firmaRicevute,
    // ⭐⭐⭐ 29/8 — FASE H, generate_image. A differenza di ricercaWeb: SEMPRE
    // definita (config.mjs, parseImmagine — un default reale, mai undefined).
    immagine: config.immagine,
    persistGeneratedImageFn: generatedImageStore.persistGeneratedImage,
    removeGeneratedImageFn: generatedImageStore.removeGeneratedImage,
    localRuntimes,
    resolveWorkspaceLaunchFn: workspaceLaunchStore.resolve,
    consumeWorkspaceLaunchFn: workspaceLaunchStore.consume,
    /*
     * ⭐⭐⭐ FASE L (30/8) — l'UNICO punto che passa un valore vero (vedi
     * la doc in session-registry.mjs sul perché nessun default lì
     * dentro): `.sessions-store/` accanto a questo file, gitignorata
     * come `.automations/`/`.hooks-trust/` — dati locali generati a
     * runtime, non tracciati.
     */
    /*
     * ⭐ 02/9 — il valore ora viene da `config` invece che essere cablato
     * qui: `TALOS_HARNESS_UI_SESSIONS_DIR` lo sposta, e senza quella
     * variabile resta ESATTAMENTE questa cartella (il default vive in
     * `parseCartellaStore`, calcolato sullo stesso `import.meta.url` di
     * questo file). Serve a dare ai test un'istanza isolata invece di
     * girare sulle sessioni vere dell'owner — vedi il commento lì per la
     * ricerca sui tre concorrenti che fanno la stessa cosa.
     */
    cartellaStore: config.cartellaStore,
    // R-02: nel prodotto installato i negozi vivono nella cartella dati del guscio (TALOS_DESKTOP_DATA_DIR); da sorgente restano accanto a server.mjs, come i default del registro.
    cartellaTrustHook: percorsoDatiDesktop('.hooks-trust/'),
    cartellaTrustMcp: percorsoDatiDesktop('.mcp-trust/'),
    cartellaTrustPlugin: percorsoDatiDesktop('.plugin-trust/'),
    cartellaNote: percorsoDatiDesktop('.notes-store/'),
    cartellaAttivita: percorsoDatiDesktop('.tasks-store/'),
    cartellaMemoria: percorsoDatiDesktop('.memory-store/'),
    cartellaForge: percorsoDatiDesktop('.tool-forge-store/'),
    /*
     * ⭐⭐⭐ O-01 (04/9) — il Capability hub («+» del composer) elenca gli
     * attrezzi VERI chiedendoli al kernel, invece dei sette scritti a mano nel
     * template (il kernel ne offre 43). Stesso principio di `chiaveFn`: una
     * funzione, non un valore — il kernel si carica pigramente e una sola
     * volta, e un'installazione senza kernel dice «non osservato» invece di
     * elencare zero attrezzi.
     */
    attrezziKernelFn: () => ownerRuntime.attrezziKernel(),
  });
  /*
   * ⭐⭐⭐ FASE L (30/8) — ricostruisce le sessioni persistite PRIMA di
   * accettare richieste: un riavvio del server (non solo un F5 del
   * browser) non deve più mostrare un elenco vuoto. Loggato, mai
   * silenzioso — l'owner che guarda il terminale vede quante sessioni
   * sono tornate.
   */
  const { ripristinate, totali } = await sessionRegistry.ripristina();
  if (totali > 0) console.log(`[session-store] ${ripristinate}/${totali} sessioni ripristinate da .sessions-store/`);
  if (config.contextTrial) {
    const localCounterBase = 'http://talos-context-runtime.invalid/v1';
    const readLocalRuntime = async () => {
      const before = supervisoreLocale?.status();
      if (before?.state !== 'ready') return before;
      const response = await supervisoreLocale.request('/props', { signal: AbortSignal.timeout(5000) });
      if (!response.ok) return { state: 'unavailable' };
      const props = await response.json();
      const after = supervisoreLocale.status();
      if (after.modelId !== before.modelId || after.state !== 'ready') return { state: 'changed' };
      return { state: after.state, modelId: after.modelId, windowTokens: props.default_generation_settings?.n_ctx };
    };
    const tokenCounter = createContextTokenCounter({
      resolveProfile: async model => ({
        ...(model.provider === 'local'
          ? { baseURL: localCounterBase }
          : { baseURL: providerStore.getRuntime(model.provider).endpoint, apiKey: providerStore.getKey(model.provider) }),
        nativeRequestBuilder: request => buildPreparedDesktopContextRequest(request, {
          resolveImages: messages => chatImageStore.resolveMessages(messages), readModelCapabilities,
        }),
      }),
      fetchFn: (url, options) => {
        if (String(url).startsWith(`${localCounterBase}/`)) {
          if (!supervisoreLocale) throw Object.assign(new Error('Motore locale non disponibile.'), { code: 'CTX_RUNTIME_PROFILE_MISMATCH' });
          return supervisoreLocale.request(new URL(url).pathname, options);
        }
        return fetch(url, options);
      },
    });
    contextRuntime = await createDesktopContextRuntime({
      sessionDirectory: config.cartellaStore,
      enabledSessionIds: config.contextTrial.sessionIds,
      readSession: sessionId => sessionRegistry.leggiSessioneContesto(sessionId),
      resolveModelProfile: selected => resolveDesktopContextProfile({ profiles: config.contextTrial.models, ...selected, readLocalRuntime }),
      tokenCounter,
      callModel: request => ownerRuntime.callContextModel(request),
      onEvent: input => sessionRegistry.pubblicaEventoContesto(input),
    });
  }
  const workspaceBrowser = createWorkspaceBrowser({
    rootDir: parse(process.cwd()).root,
    projectDirectories: config.cartelleProgetto,
    recommendedDirectoriesFn: () => cartelleConsigliate({ sessionRegistry }),
  });
  /*
   * ⭐⭐⭐ 27/8 — blocco 7, la vera schedulazione. Owner: "hai il mio via
   * libera". `.automations/` accanto a `server.mjs`, gitignorata come
   * `.sessions/` — dati locali generati a runtime, non tracciati.
   * ⛔ Il tick gira SOLO col processo vivo: `unref()` in
   * automation-scheduler.mjs non tiene mai il server acceso da solo, e
   * un riavvio (frequente in sviluppo con --watch) perde solo il timer,
   * mai le automazioni — quelle sono su disco, il tick le rilegge al
   * prossimo giro.
   */
  const automationStore = createAutomationStore({
    cartella: percorsoDatiDesktop('.automations/'),
  });
  const automationScheduler = createAutomationScheduler({
    store: automationStore,
    sessionRegistry,
  });
  /*
   * ⭐⭐⭐ 27/8 — owner: "un picker per il modello, dropdown stilizzato
   * (l'abbiamo già fatto nel mobile)". Il catalogo VERO di OpenRouter
   * (417 modelli oggi, pubblico, nessuna chiave richiesta per leggerlo),
   * non le 7 scorciatoie scritte a mano — una sola istanza condivisa,
   * cache in-memory 10 minuti, così il foglio "Nuova sessione" non
   * richiama OpenRouter a ogni apertura.
   */
  /*
   * ⭐⭐⭐ 02/09 — estratta a const (prima era inline dentro createHttpApp)
   * per poterla richiamare anche subito dopo l'avvio, non solo quando
   * qualcuno apre Settings → Doctor. Trovato dal vivo lo stesso giorno:
   * il server è rimasto sano su `/api/v1/health` (200) per due giorni
   * mentre OGNI giro reale falliva (`TALOS_OWNER_RUNTIME_MODULE` non
   * impostata) — perché nessuno aveva mai chiamato QUESTA funzione, che
   * l'avrebbe detto subito. Vedi
   * `.claude/LEDGER-RUNTIME-OWNER-MODULE-2026-09-02.md`.
   */
  const diagnosiFn = async () => {
    let snapshot;
    try { snapshot = await ownerRuntime.runtimeSnapshot(); } catch (error) { snapshot = { status: 'unavailable', reason: error?.code || 'runtime_unavailable' }; }
    const ownerRuntimeState = {
      configurato: Boolean(config.ownerRuntimeModule),
      pronto: snapshot?.status === 'available',
      dettaglio: snapshot?.status === 'available'
        ? 'Runtime agente pronto.'
        : (taskCatalogError?.message || 'Il runtime agente non è pronto per tutte le funzioni richieste.'),
    };
    return diagnosi({
      chiaveConfigurata: providerStore.hasKey('openrouter'), cartelleProgetto: config.cartelleProgetto,
      ricercaWeb: searchSourceStore.listPublic(),
      labsAccesi: config.labs,
      providerRows: providerStore.listPublic(), providerStoreAvailable: Boolean(providerKeyring),
      ownerRuntime: ownerRuntimeState,
      catalogoTask: { disponibile: Boolean(taskCatalogProvider), dettaglio: taskCatalogProvider ? 'Elenco attività predefinite disponibile.' : 'L’elenco delle attività predefinite non è disponibile in questa installazione.' },
      sessioniPersistenza: typeof sessionRegistry.statoPersistenza === 'function' ? sessionRegistry.statoPersistenza() : undefined,
    });
  };
  /*
   * ⭐⭐⭐ 05/9, W1-01 — I DUE registri del terminale, montati QUI (prima erano
   * più in basso, dopo `createHttpApp`) perché ora le rotte HTTP hanno bisogno
   * di quello delle schede. Sono due di proposito:
   *   · `registroTerminali` (pty-terminal.mjs) — il ciclo di vita delle PTY:
   *     spawn, backlog per scheda, reap delle orfane;
   *   · `registroSchedeTerminale` (terminal-registry.mjs) — CHI può attaccarsi
   *     a quale PTY, e in quale cartella.
   *
   * ⛔⛔⛔ Il difetto che questa separazione chiude, misurato il 05/9 su questo
   * stesso file: `risolviCartella` faceva
   * `sessionRegistry.cartellaDi(id) ?? config.cartelleProgetto[0]?.percorso ?? process.cwd()`
   * — un id SCONOSCIUTO non veniva rifiutato, cadeva sul primo progetto.
   * Finché l'id ERA il sessionId il danno era contenuto; con schede multiple
   * qualunque stringa avrebbe aperto una shell. Ora la cartella la decide il
   * registro delle schede, UNA volta, alla creazione — mai il client, mai a
   * ogni connessione. Forma esatta di CVE-2026-59224 (Open WebUI, 2026).
   */
  const registroTerminali = creaRegistroTerminali();
  const registroSchedeTerminale = creaRegistroSchedeTerminale({
    cartellaDiSessione: (sessionId) => sessionRegistry.cartellaDi(sessionId),
    chiudiPtyFn: (terminalId) => registroTerminali.chiudiForzato(terminalId),
    statoPtyFn: (terminalId) => registroTerminali.stato(terminalId),
    /*
     * ⛔⛔ DEBITO DICHIARATO, non un fallback. Misurato il 05/9 leggendo
     * `public/app.js` (congelato dal contratto, non modificabile):
     * `idTerminaleCorrente()` usa il `sessionId` quando una sessione c'è, e
     * ALTRIMENTI inventa un `crypto.randomUUID()` lato client — il "terminale
     * standalone", raggiungibile aprendo il tab Terminale prima di avviare
     * qualsiasi cosa. Senza questa riga quella funzione del monolite smette di
     * funzionare. La differenza con il `??` di prima: la cartella è nominata
     * QUI, una volta sola, ed è sotto lo stesso tetto delle altre schede — non
     * è una catena di ripieghi valutata a ogni connessione, e le rotte nuove
     * non producono MAI una scheda di questo tipo.
     * ⛔ Si spegne mettendo `null` il giorno in cui il frontend nuovo
     * sostituisce il monolite.
     */
    cartellaStandaloneLegacy: config.cartelleProgetto[0]?.percorso ?? process.cwd(),
  });

  /*
   * ⭐⭐⭐ 07/9 — IL BROWSER VIVO. Owner: «visualizzare ogni fottuta pagina web». Un `iframe` non può
   * mostrare i siti che vietano la cornice; questo gestore apre un Chromium GIÀ INSTALLATO (Chrome
   * o Edge) con un profilo NOSTRO e lo pilota via CDP, e la pagina di TALOS ne riceve lo schermo.
   * ⛔ Il browser non parte all'avvio del server: nasce alla prima pagina chiesta e muore da sé dopo
   *   dieci minuti che nessuno lo tocca — un Chromium acceso per nulla è RAM di chi ci lavora.
   * ⛔ `connettiFn` è iniettata qui e non dentro il modulo: così i test non aprono mai un socket.
   */
  const browserVivo = creaGestoreBrowserVivo({
    connettiFn: (wsUrl) => new Promise((risolvi, rifiuta) => {
      const socket = new WebSocket(wsUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
      socket.once('open', () => risolvi(socket));
      socket.once('error', rifiuta);
    }),
  });

  const app = createHttpApp({
    /*
     * ⛔⛔ PO-01 (10/09) — l'UNICO punto in cui la chiave ottenuta dall'accesso lascia il flusso
     *   OAuth. Va nel PORTACHIAVI DEL SISTEMA, da dove entrano già tutte le altre chiavi
     *   (`providerStore`, cablato sopra con `@napi-rs/keyring`): così «Rimuovi chiave», il Doctor,
     *   l'elenco dei fornitori e la prova di collegamento continuano a funzionare senza sapere che
     *   esiste un accesso, e non nascono due custodie destinate a divergere.
     * ⛔ La chiave passa come argomento e basta: non entra in un log, in un errore o in una
     *   risposta HTTP. Se questa riga manca, le rotte rispondono che l'accesso non è configurato
     *   invece di far fare tutto il giro sul sito del fornitore e buttare la chiave alla fine.
     */
    custodisciChiaveOpenRouter: async (chiave) => { providerStore.setKey('openrouter', chiave); },
    contextService: contextRuntime?.service,
    // ⭐ 10/09: le favicon delle fonti, prese dal server una volta sola e tenute qui accanto alle sessioni.
    cartellaFavicon: percorsoDatiDesktop('.favicon-cache/'),
    chatImageStore,
    staticHandler: createStaticHandler(config.publicDir),
    sessionRegistry,
    terminalRegistry: registroSchedeTerminale, // ⭐ 05/9, W1-01
    /*
     * ⭐⭐⭐ 05/9, W1-05 — lo stato Git di una sessione: la sorgente
     * «Non committato» della Review a due sorgenti (W1-06).
     * ⛔ La cartella la decide SOLO il registro delle sessioni, esattamente
     * come per le schede terminale: il client nomina una sessione, non
     * sceglie mai un percorso di lavoro. Un id sconosciuto torna `null` e il
     * servizio risponde NOT_FOUND — nessun ripiego sul primo progetto
     * configurato, che era il difetto di `server.mjs:589` chiuso da W1-01.
     * ⛔⛔ Non c'è nessun push da cablare: quella porta non esiste nel
     * servizio, per regola dell'owner.
     */
    gitService: creaServizioGit({ cartellaDiSessione: (sessionId) => sessionRegistry.cartellaDi(sessionId) }),
    // Un catalogo non configurato è uno stato degradato osservabile, non un crash HTTP.
    listaTaskDisponibili: () => (taskCatalogProvider ? listaTaskDisponibili(taskCatalogProvider) : []),
    elencaCartelleProgetto: () => elencaCartelleProgetto(config.cartelleProgetto),
    automationStore,
    diagnosiFn,
    // ⭐ 04/9, R-02 — l'intro al primo avvio legge da qui cosa manca davvero: chiavi nel portachiavi (solo i nomi dei provider), motore locale, cartelle. TALOS_INTRO=0 la spegne (rollback del ledger).
    setupStatoFn: () => statoPrimoAvvio({
      providerStore,
      localeConfigurato: Boolean(config.llamaServerPath),
      introDisattivato: process.env.TALOS_INTRO === '0',
      cartelleProgetto: config.cartelleProgetto.length,
    }),
    searchSourceStore,
    provaRicercaWebFn,
    token: config.token, // ⭐ 04/9, W1-10 — cancello a token per la shell Electron
    catalogoModelliFn: (opts) => modelCatalog.ottieni(opts),
    // P-K (12/09) — i cataloghi cloud dipendono dal collegamento dell'owner: Bedrock si legge dalla sonda, Azure/Vertex dichiarano che serve una configurazione.
    catalogoFornitoriFn: (id, opts) => ['azure', 'bedrock', 'vertex'].includes(id) ? providerProbe.elencaModelli(id) : providerModelCatalog.ottieni(id, opts),
    capacitaMacchinaFn: () => misuraCapacitaMacchina({ storagePath: config.publicDir }),
    localRuntimes,
    runtimeBootstrapFn: async () => {
      const observedAt = new Date().toISOString();
      const items = [];
      for (const [runtimeId, runtime] of Object.entries(localRuntimes)) {
        try {
          const detection = typeof runtime?.detect === 'function' ? await runtime.detect(runtimeId) : { state: 'unavailable' };
          items.push({ runtimeId, ...(detection && typeof detection === 'object' ? detection : { state: 'unavailable' }) });
        } catch (error) {
          items.push({ runtimeId, state: 'unavailable', reason: error?.code || 'runtime_unreachable' });
        }
      }
      return {
        schema: RUNTIME_BOOTSTRAP_SCHEMA,
        authoritative: 'backend',
        runtime: {
          schema: RUNTIME_RESOURCE_SCHEMA,
          status: 'available',
          items,
          consulted: true,
          observedAt,
          reason: null,
        },
        observedAt,
      };
    },
    localModelStore,
    localModelTransfer,
    localRuntimeProbe,
    hfHubClient,
    hfImageProxyFn: (url) => fetchAllowedHfImage(url),
    providerStore,
    providerProbe,
    workspaceLaunchStore,
    workspaceBrowser,
    browserVivo,
  });
  const server = createServer(app);

  /*
   * ⭐⭐⭐ 03/9 — R-01 (lanciatore doppio-clic, owner: "porta libera scelta
   * da sola"). Il legame avviene QUI, prima di costruire l'allowlist delle
   * origini del terminale sotto: quella allowlist e il log finale devono
   * vedere la porta VERA su cui il server è finito, non quella richiesta —
   * se fossero costruiti da `config.port` e la porta richiesta risultasse
   * occupata, l'origine consentita del terminale punterebbe alla porta
   * SBAGLIATA e ogni upgrade WebSocket verrebbe rifiutato in silenzio.
   * `trovaPortaLibera` (config.mjs) decide se spostarsi (porta di default)
   * o fermarsi con un errore onesto (TALOS_HARNESS_UI_PORT esplicita).
   */
  const portaAscolto = await trovaPortaLibera(config.port, {
    esplicita: config.portaEsplicita,
    tentaLegameFn: (porta) => new Promise((risolvi) => {
      const alSuccesso = () => { server.removeListener('error', alFallimento); risolvi({ ok: true }); };
      const alFallimento = (errore) => { server.removeListener('listening', alSuccesso); risolvi({ ok: false, errore }); };
      server.once('error', alFallimento);
      server.once('listening', alSuccesso);
      server.listen(porta, config.host);
    }),
  });

  /*
   * ⭐ 03/9, R-01 — handshake per `scripts/avvia-talos.mjs`: la porta reale
   * può differire da quella richiesta (vedi sopra), quindi il lanciatore
   * non la indovina, la LEGGE da qui. Solo se il lanciatore lo chiede
   * (variabile impostata): un avvio da terminale normale non scrive nulla
   * di nuovo su disco. Migliore sforzo: se la scrittura fallisce, il server
   * parte comunque — l'handshake è una comodità per il lanciatore, non un
   * requisito del prodotto.
   */
  if (typeof process.env.TALOS_HARNESS_UI_REPORT_FILE === 'string' && process.env.TALOS_HARNESS_UI_REPORT_FILE !== '') {
    try {
      writeFileSync(process.env.TALOS_HARNESS_UI_REPORT_FILE, JSON.stringify({ host: config.host, port: portaAscolto }));
    } catch (errore) {
      console.warn('[avvio] handshake per il lanciatore non scritto:', errore.message);
    }
  }

  /*
   * ⭐⭐⭐ 28/8 — Terminale REALE (LEDGER-TERMINALE-REALE.md). Nessuna
   * porta nuova: l'upgrade WebSocket avviene sullo STESSO `server`,
   * quindi eredita lo stesso bind loopback-only di ogni altra rotta.
   *
   * ⭐⭐⭐ 05/9, W1-01 — `risolviCartella` (che tornava SEMPRE una cartella) è
   * diventato `risolviScheda`, che ha il diritto di dire **no**: un
   * `terminalId` che il server non ha creato riceve 403 e la PTY non nasce
   * nemmeno. I due registri sono montati più in alto, insieme alle rotte.
   */
  const originiTerminaleConsentite = new Set(ALIAS_LOOPBACK.map((host) => `http://${host}:${portaAscolto}`));
  const terminaleWs = creaGestoreTerminaleWs({
    registro: registroTerminali,
    originiConsentite: originiTerminaleConsentite,
    risolviScheda: (terminalId) => registroSchedeTerminale.risolviPerConnessione(terminalId),
    token: config.token, // ⭐ 04/9, W1-10
  });
  server.on('upgrade', (req, socket, head) => terminaleWs.gestisciUpgrade(req, socket, head));
  /*
   * ⛔ Due pulizie DIVERSE sullo stesso battito, e non si confondono: il
   * registro delle PTY chiude le SHELL orfane (minuti), il registro delle
   * schede dimentica le SCHEDE che nessuno tocca da un giorno. La seconda e'
   * programmata e non probabilistica di proposito — una GC che passa «a volte»
   * su un server acceso per settimane puo' non passare mai (ricerca 05/09/2026,
   * cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
   * ⛔ E cio' che viene tolto si DICE: una scheda sparita in silenzio si
   * presenta come un 403 inspiegabile alla riconnessione successiva.
   */
  const reaperTerminali = setInterval(() => {
    registroTerminali.reap();
    const { tolte, restano } = registroSchedeTerminale.dimenticaLeVecchie();
    for (const scheda of tolte) {
      console.info(`[terminali] scheda dimenticata ${scheda.terminalId} (sessione ${scheda.sessionId ?? 'nessuna'}, ${scheda.origine}): ferma da ${Math.round(scheda.fermaDaMs / 3_600_000)} h. Restano ${restano}.`);
    }
  }, MINUTI_PRIMA_DI_CHIUDERE_PTY_ORFANA * 60_000).unref();

  automationScheduler.avvia();

  let shutdownStarted = false;
  const shutdown = async () => {
    if (shutdownStarted) return;
    shutdownStarted = true;
    clearInterval(reaperTerminali);
    /*
     * ⛔⛔ 05/9, W1-01 — le chiavi si fotografano PRIMA di iterare: ora le
     * schede per sessione sono molte, `chiudiForzato` cancella dalla stessa
     * Map su cui si sta iterando, e una PTY lasciata viva su Windows lascia
     * dietro di sé anche il suo `conhost` (node-pty#471). Zero PTY superstiti
     * allo shutdown, contate dal test.
     */
    for (const id of [...registroTerminali._terminali.keys()]) registroTerminali.chiudiForzato(id);
    await closeRuntimeResources('shutdown', {
      resources: [
        { stop: () => automationScheduler.ferma() },
        ...(contextRuntime ? [{ close: () => contextRuntime.close() }] : []),
        ...Object.values(localRuntimes).map((runtime) => ({ close: () => typeof runtime?.unload === 'function' ? runtime.unload() : undefined })),
      ],
      logger: console,
    });
    server.close(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  console.log(`Harness UI disponibile su http://${config.host}:${portaAscolto}`);
  /*
   * ⭐⭐⭐ 02/09 — stesso principio di `hermes doctor`/`claude doctor`
   * (ricerca fatta lo stesso giorno, vedi
   * `.claude/DOSSIER-RICERCA-RESILIENZA-SERVER-2026-09-02.md`): un
   * processo vivo (`/api/v1/health` 200) non vuol dire un processo che fa
   * il suo lavoro. Questo controllo esisteva già (`doctor.mjs`), ma prima
   * di oggi nessuno lo chiamava finché l'owner non apriva Settings →
   * Doctor a mano. Qui gira UNA volta all'avvio, best-effort (un
   * fallimento qui non deve mai impedire al server di partire), e mette
   * a log — non solo nella UI — esattamente i due problemi che il
   * riavvio di oggi ha trovato nel modo peggiore (un utente reale che
   * riceve un errore): il runtime agente non configurato, e sessioni
   * scartate al ripristino.
   */
  diagnosiFn().then((esito) => {
    /*
     * ⛔ `configurato:false` (nessun modulo indicato) è quanto ha rotto
     * OGNI giro oggi — severità alta. `configurato:true` ma
     * `pronto:false` è più stretto (di solito solo il catalogo task
     * opzionale, verificato dal vivo il 02/09: talosLavora ha continuato
     * a funzionare con questa stessa combinazione) — severità bassa,
     * mai la stessa frase allarmante dell'altro caso.
     */
    if (esito.ownerRuntime && !esito.ownerRuntime.configurato) {
      console.error(`[doctor] ATTENZIONE all'avvio: TALOS_OWNER_RUNTIME_MODULE non è impostata — ogni giro reale (sessione nuova o ripresa) fallirà finché non è risolto.`);
    } else if (esito.ownerRuntime && !esito.ownerRuntime.pronto) {
      console.error(`[doctor] avviso all'avvio (non blocca l'uso normale): ${esito.ownerRuntime.dettaglio}`);
    }
    if (esito.sessioniPersistenza?.corrotte?.length > 0) {
      console.error(`[doctor] ATTENZIONE all'avvio: ${esito.sessioniPersistenza.corrotte.length} sessione/i corrotta/e al ripristino: ${esito.sessioniPersistenza.corrotte.join(', ')}`);
    }
  }).catch((error) => {
    console.error('[doctor] controllo all\'avvio non riuscito (non blocca il server):', error instanceof Error ? error.message : error);
  });
}

const direct = process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url;
if (direct) {
  startServer().catch((error) => {
    console.error('Harness UI non avviabile: controlla configurazione e file locali');
    console.error('[avvio] causa reale:', error instanceof Error ? (error.stack || error.message) : error);
    process.exitCode = 1;
  });
}
