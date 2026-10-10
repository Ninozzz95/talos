import './src/difesa-ricerca-programmi.mjs'; // ⛔ PER PRIMO: su Windows un `git.exe` dentro il workspace non deve battere il git vero (misura e fonti nel file)
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto'; // F3 (24/09): il gettone dello spegnimento gentile
import { createServer } from 'node:http';
import { createLocalResumeDiagnostics } from './src/local-resume-diagnostics.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createAutomationScheduler } from './src/automation-scheduler.mjs';
import { creaOspiteAutomazioni } from './src/automation-per-il-modello.mjs'; // automazioni a due porte (08/10/2026)
import { createAutomationStore } from './src/automation-store.mjs';
import { loadConfig, trovaPortaLibera } from './src/config.mjs';
import { createHttpApp } from './src/http-app.mjs';
import { createSessionRegistry } from './src/session-registry.mjs';
import { createProcessOutputStore } from './src/process-output-store.mjs';
import { impostaPoliticaScritturaSync, modalitaPubblicazioneIntestazione } from './src/session-store.mjs'; // F3 (24/09): il writer sincrono rispetta la coda; 24/09: la modalità dell'intestazione per il Doctor
import { createWorkflowStore } from './src/workflow/store.mjs';
import { proposeWorkflowFromTool } from './src/workflow/planning-control.mjs';
import { creaAvvioDaSolo } from './src/workflow/avvio-da-solo.mjs';
import { creaRisveglioDaiWorkflow } from './src/workflow/esito-al-padre.mjs'; // C3b: l'esito di un run sveglia il padre
import { createWorkflowOrchestrator } from './src/workflow-orchestrator.mjs';
import { createAgentSessionAdapter } from './src/workflow/adapters/agent-session.mjs';
import { createCapacitaAdattiva, createWorkflowScheduler } from './src/workflow/scheduler.mjs';
import { creaOnWorkflowFn } from './src/workflow/per-il-modello.mjs';
import { createStaticHandler } from './src/static-files.mjs';
import { listaTaskDisponibili } from './src/task-catalog.mjs';
import { elencaCartelleProgetto, validaCartellaLibera } from './src/custom-task.mjs';
import { diagnosi } from './src/doctor.mjs';
import { avviaPuliziaScratch, statoScratch } from './src/scratch.mjs';
import { statoPrimoAvvio } from './src/setup-stato.mjs';
import { createSearchSourceStore } from './src/search-source-store.mjs';
import { createPreferenzeWslStore } from './src/preferenze-wsl-store.mjs'; // F009 (owner 01/10/2026): l'utente di WSL
import { statoWsl } from './src/kernel/talosHarness.mjs';
import { verificaCasaLinux } from './src/casa-linux-binari.mjs'; // Fase B (owner 01/10/2026): i binari per Linux del pacchetto
import { ENDPOINT_SENTINELLA_DUCKDUCKGO, creaTrasportoSenzaChiave } from './src/duckduckgo-search.mjs';
import { createModelCatalog } from './src/model-catalog.mjs';
import { createCompactionWindowSource } from './src/compaction-window-source.mjs';
import { createModelsDevCatalog, createProviderModelCatalog } from './src/model-catalog-models-dev.mjs'; // P-E (12/09)
import { creaRegistroTerminali, MINUTI_PRIMA_DI_CHIUDERE_PTY_ORFANA } from './src/pty-terminal.mjs';
import { creaRegistroSchedeTerminale } from './src/terminal-registry.mjs'; // ⭐ 05/9, W1-01
import { creaServizioGit } from './src/git-service.mjs'; // ⭐ 05/9, W1-05
import { creaServizioGh } from './src/gh-service.mjs'; // ⭐ F6-3, 27/09
import { creaGestoreTerminaleWs } from './src/terminal-ws.mjs';
import { misuraCapacitaMacchina } from './src/machine-capacity.mjs';
import { createLocalModelStore } from './src/local-model-store.mjs';
import { createOpenAiCompatibleRuntime } from './src/openai-compatible-runtime.mjs';
import { ID_MOTORI_LOCALI_OPENAI } from './src/provider-registry.mjs'; // 12/09, P-C: i motori locali li nomina il registro, non due letterali
import { createHfHubClient } from './src/hf-hub-client.mjs';
import { createHfDirectTransfer } from './src/hf-direct-transfer.mjs';
import { fetchAllowedHfImage } from './src/hf-image-proxy.mjs';
import { createLlamaServerSupervisor } from './src/llama-server-supervisor.mjs';
import { motoreConosceArchitettura } from './src/motore-architetture.mjs';
import { createLlamaServerRuntime } from './src/local-runtime-llama-server.mjs';
import { createProviderProbe } from './src/provider-probe.mjs';
import { createProviderCredentialStore } from './src/provider-credential-store.mjs';
import { leggiScopePortachiavi, avvolgiAdattatoreKeyring, creaAdattatorePortachiavi, leggiPortachiaviDiProva } from './src/adattatore-keyring.mjs';
import { migraChiaviLegacySuDesktop } from './src/migrazione-chiavi.mjs';
import { createGeneratedImageStore } from './src/generated-image-store.mjs';
import { createOwnerRuntimeAdapter, creaFetchMultiProvider } from './src/runtime-owner-adapter.mjs';
/* ⛔ CLI-REQ-05: «di CHI è questo modello, e ha una chiave utilizzabile ADESSO» — la regola e le sue prove stanno lì. */
import { creaProntoFn } from './src/sessione-pronta.mjs';
import { createDesktopContextRuntime, resolveDesktopContextProfile, resolveDesktopDefaultProfile } from './src/context-runtime.mjs';
import { createImpostazioniContesto, giroUsaIlMotore } from './src/impostazioni-contesto.mjs';
import { createContextTokenCounter, buildPreparedDesktopContextRequest } from './src/context-token-counters.mjs';
import { createChatImageStore } from './src/chat-image-attachments.mjs';
import { avviaSessione } from './src/agent-service.mjs';
import { RUNTIME_BOOTSTRAP_SCHEMA, RUNTIME_RESOURCE_SCHEMA } from './src/runtime-contract.mjs';
import { applicaTempiDelServer, closeRuntimeResources } from './src/http-lifecycle.mjs';
import { leggiInattivitaGenerazioneMs } from './src/generation-idle.mjs';
import { createWorkspaceLaunchStore } from './src/workspace-launch-store.mjs';
import { cartelleConsigliate } from './src/frequent-dirs.mjs';
import { createWorkspaceBrowser } from './src/workspace-browser.mjs';
import { WebSocket } from 'ws'; // 07/9: il canale di controllo verso il Chromium pilotato (CDP parla WebSocket)
import { creaGestoreBrowserVivo } from './src/browser-sessione-viva.mjs'; // 07/9: il Chromium di sistema pilotato dal server
import { createLocalRuntimeProbe } from './src/local-runtime-probe.mjs';
import { readGgufHeader } from './src/gguf-header.mjs';
import { join, parse, isAbsolute } from 'node:path';
import { CARTELLA_PROGETTI, creaCartellaDatiProgetto } from './src/cartella-dati-progetto.mjs'; // PO-26 (24/09): Libreria e Ricerca fuori dal progetto
import { creaInstradamentoDiSerie } from './src/esclusi-di-serie.mjs'; // 0.1.25: i fornitori a valle esclusi di serie, per modello
import { creaOspiteFornitori } from './src/fornitori-per-il-modello.mjs'; // 0.1.25: la seconda porta dei fornitori esclusi
import { slugDelFornitore } from './src/openrouter-fornitori.mjs';

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
  /*
   * ⭐ F3, onda 2 di F2 (24/09/2026) — IL WRITER SINCRONO NON SCAVALCA PIÙ LA CODA (J3, rapporto F2 §2.2). Con
   *   `'busy'` un sync che trova una scrittura in volo lancia `SESSION_STORE_BUSY` prima di toccare il disco, e il
   *   registro lo ACCODA in ordine (`scriviRigaSyncOInCoda`) invece di scavalcare: le righe del journal restano
   *   nell'ordine in cui sono nate. Una riga sola qui invece di 14 punti nel registro, com'era previsto dall'onda 1.
   *   `TALOS_SESSION_STORE_SYNC=scavalca` rimette il comportamento vecchio, per diagnosi.
   */
  impostaPoliticaScritturaSync(process.env.TALOS_SESSION_STORE_SYNC === 'scavalca' ? 'scavalca' : 'busy');
  /*
   * ⛔ (16/09/2026) — lo scope del portachiavi arriva dal guscio desktop (runtime.mjs). Null in
   * sviluppo: i nomi servizio restano quelli di sempre. «desktop»: l'app installata legge/scrive
   * `<servizio>-desktop` (namespace suo, nasce vuoto) e ignora i semi di chiavi dall'ambiente —
   * l'app prende le chiavi SOLO dalla UI. Vedi `src/adattatore-keyring.mjs`.
   */
  const scopePortachiavi = leggiScopePortachiavi(process.env);
  /* 23/09/2026: anche la custodia di prova (`TALOS_HARNESS_UI_KEYRING=memoria`) ignora i semi: un server
     di prova non deve ricevere la chiave vera dell'owner dall'ambiente. Vedi `src/adattatore-keyring.mjs`. */
  const portachiaviDiProva = leggiPortachiaviDiProva(process.env);
  const ignoraSemiAmbiente = scopePortachiavi !== null || portachiaviDiProva; // PR #27: vale per OGNI scope (anche l'anteprima), non solo «desktop»
  // Opt-in only: observe the real resumed turn without changing prompts or cache flags.
  const resumeDiagnostics = await createLocalResumeDiagnostics({ sourceFiles: {
    server: fileURLToPath(import.meta.url),
    supervisor: new URL('./src/llama-server-supervisor.mjs', import.meta.url),
    adapter: new URL('./src/local-runtime-llama-server.mjs', import.meta.url),
    ownerAdapter: new URL('./src/runtime-owner-adapter.mjs', import.meta.url),
    registry: new URL('./src/session-registry.mjs', import.meta.url),
    ownerKernel: config.ownerRuntimeModule,
  } });
  let providerKeyring = null;
  try {
    /* ⛔ (16/09/2026) — l'adattatore arriva dalla fabbrica unica di `src/adattatore-keyring.mjs`,
       condivisa con la routine di pulizia alla disinstallazione: un contratto, nessuna copia. */
    providerKeyring = avvolgiAdattatoreKeyring(await creaAdattatorePortachiavi(process.env), scopePortachiavi);
  } catch {
    console.warn('[provider-store] portachiavi del sistema non disponibile; Doctor segnalerà il limite');
  }
  /*
   * ⭐ (16/09/2026, decisione owner) — chi aveva l'app ≤ 0.1.10 non deve reinserire le chiavi:
   * al primo avvio l'app le COPIA dal namespace vecchio (senza suffisso) al proprio (`-desktop`),
   * una volta sola (marcatore su disco). I servizi vecchi restano allo sviluppo; vedi
   * `src/migrazione-chiavi.mjs`.
   */
  // Preview never imports legacy or production credentials.
  if (scopePortachiavi === 'desktop' && !portachiaviDiProva) {
    try {
      const migrazione = await migraChiaviLegacySuDesktop({ markerFile: percorsoDatiDesktop('.chiavi-migrate.json') });
      if (migrazione.migrati.length) {
        const conteggi = migrazione.migrati.reduce((acc, v) => { acc[v.tipo] = (acc[v.tipo] ?? 0) + v.chiavi; return acc; }, {});
        console.log(`[chiavi] migrazione namespace vecchio → desktop: ${Object.entries(conteggi).map(([k, n]) => `${n} ${k === 'provider' ? 'chiavi provider' : 'fonti di ricerca'}`).join(', ')}`);
      }
      if (migrazione.errori.length) console.warn(`[chiavi] migrazione incompleta: ${migrazione.errori.length} errori — si riprova al prossimo avvio`);
    } catch (errore) {
      console.warn(`[chiavi] migrazione non riuscita: ${errore?.message ?? errore}`);
    }
  }
  const providerStore = createProviderCredentialStore({
    env: process.env,
    keyring: providerKeyring,
    runtimeFile: percorsoDatiDesktop('.provider-runtime.json'),
    ignoraSemiAmbiente,
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
    ignoraSemiAmbiente,
  });
  /*
   * ⛔⛔ Fase B «casa di esecuzione» (owner 01/10/2026) — i binari per Linux (Node e rg) che il pacchetto porta. Pronti ⇒ ogni
   * sessione ha la sua casa Linux. Mancanti ⇒ si DICE (registro del server e stato di /api/v1/wsl), mai un ripiego muto.
   */
  const casaLinux = process.platform === 'win32' ? await verificaCasaLinux() : { pronta: false, motivo: 'la casa Linux esiste solo su Windows con WSL' };
  if (process.platform === 'win32' && !casaLinux.pronta) console.warn(`[casa-linux] non disponibile: ${casaLinux.motivo}. Shell e attrezzi dei file restano come prima (due case).`);
  /* F009 (owner 01/10/2026, «come gli altri, insieme») — la preferenza dell'utente di WSL, accanto alla fonte di ricerca. */
  const preferenzeWslStore = createPreferenzeWslStore({
    file: percorsoDatiDesktop('.preferenze-wsl.json'),
    statoFn: async (preferenze) => ({ ...(await statoWsl(preferenze)), casaLinux: casaLinux.pronta ? { pronta: true } : { pronta: false, motivo: casaLinux.motivo } }),
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
  /*
   * ⭐⭐⭐ 03/9 — da qui passano i modelli che NON sono di OpenRouter.
   * La chiave viene dal portachiavi del computer e non tocca mai il
   * browser; l'indirizzo è quello che la persona ha impostato nella scheda
   * Provider, cioè lo stesso con cui il pulsante «Prova» l'ha verificato:
   * instradare con parametri diversi da quelli provati renderebbe la prova
   * una bugia.
   *
   * ⛔ 17/09 (CLI-REQ-05): estratto in una costante perché adesso serve DUE volte — all'adattatore
   *   del runtime e alla destinazione che il registro delle sessioni usa per compattazione e
   *   giudice. Una copia per cliente sarebbe due instradamenti che divergono.
   */
  const destinazioneModelloDeps = {
    leggiChiave: (fonte) => { try { return providerStore.getKey(fonte); } catch { return null; } },
    leggiRuntime: (fonte) => { try { return providerStore.getRuntime(fonte); } catch { return {}; } },
    localePronto: () => supervisoreLocale?.status?.()?.state === 'ready',
    /*
     * ⛔ Si passa il PONTE, non la chiave: `request()` del supervisore
     * aggiunge da sé l'`--api-key` generata all'avvio, che non deve essere
     * copiata da nessuna parte — men che meno in una risposta HTTP.
     */
    chiamaLocale: (percorso, opzioni) => resumeDiagnostics.withRoute('owner-transport', () => supervisoreLocale.request(percorso, opzioni)),
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
  };

  const ownerRuntime = createOwnerRuntimeAdapter({
    providerStore,
    resolveImagesFn: messages => chatImageStore.resolveMessages(messages),
    modulePath: config.ownerRuntimeModule,
    openRouterRuntimeFn: () => providerStore.getRuntime('openrouter'),
    // 0.1.25 (owner 08-09/10/2026): glm-5.3-flash esclude OpenInference di serie, togliibile nelle Impostazioni
    openRouterRoutingFn: creaInstradamentoDiSerie(() => providerStore.getRuntime('openrouter')),
    destinazioneModelloDeps,
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
     * una volta sola e lo stato dichiara (`motore.ripiego`).
     */
    const supervisor = resumeDiagnostics.wrapSupervisor(createLlamaServerSupervisor(resumeDiagnostics.supervisorOptions({
      binaryPath: config.llamaServerPath,
      fallbackBinaryPath: config.llamaServerFallbackPath && config.llamaServerFallbackPath !== config.llamaServerPath ? config.llamaServerFallbackPath : null,
      motore: { variante: gpuLayers > 0 ? 'vulkan' : 'cpu', dispositivi },
      modelStore: localModelStore,
      gpuLayers,
    })));
    // ⛔ Registrato SUBITO dopo la creazione: è l'unico punto in cui il
    // legame tardivo di sopra si chiude davvero. Senza questa riga i modelli
    // locali resterebbero irraggiungibili con un messaggio che dice
    // «il motore non è acceso» anche quando lo è.
    supervisoreLocale = supervisor;
    const llama = resumeDiagnostics.wrapRuntime(createLlamaServerRuntime({ supervisor }));
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
  let workflowStore = null;
  if (config.workflowDataRoot) {
    try {
      workflowStore = await createWorkflowStore({
        workflowDataRoot: config.workflowDataRoot,
        workspaceRoots: config.cartelleProgetto.map(({ percorso }) => percorso),
        resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 67_108_864 },
      });
      // F3-41c (owner 25/09, «Da parte + rename»): i run nati a metà da un crollo non fermano più il registro — si DICONO, qui
      for (const voce of workflowStore.quarantinedRuns ?? []) {
        console.warn(`[workflow] run messo da parte all'avvio (${voce.code}): ${voce.scope} — niente è stato cancellato`);
      }
    } catch (error) {
      console.error('Workflow Store non disponibile:', error?.code ?? 'WORKFLOW_STORE_UNAVAILABLE');
    }
  }
  /* Il catalogo indica il modello; solo il minimo degli endpoint verificati
   * limita in modo conservativo una route OpenRouter dinamica. La prima lettura
   * resta sincrona e prudenziale mentre la verifica parte in background. */
  const compactionWindowSource = createCompactionWindowSource();
  const finestraDallaRoute = (modello) => compactionWindowSource.get(
    typeof modello === 'string' && modello.startsWith('openrouter:') ? modello.slice('openrouter:'.length) : modello,
  );
  /* F3 (24/09): l'oggetto della rotta di spegnimento; gettone e funzione si riempiono dopo che `shutdown` esiste. */
  const spegnimentoPerLaApp = { gettone: null, spegniFn: null };
  /*
   * ⭐⭐⭐ PO-26 (owner 16/09 «PO-26 si», 24/09 «PO-26 intera, adesso») — Libreria e Ricerca di ogni progetto
   *   vivono nella cartella dati dell'app, `<dati>/.workspaces/<slug>-<impronta>/`, non più nel progetto. La
   *   prima volta che un progetto si tocca, ciò che le versioni precedenti avevano lasciato lì si sposta qui.
   *   Il rapporto di ogni migrazione che ha fatto qualcosa va nel terminale del server: chi, da dove, dove.
   */
  const cartellaDatiProgetto = creaCartellaDatiProgetto({
    radiceDati: percorsoDatiDesktop(`${CARTELLA_PROGETTI}/`),
    onMigrazione: (r) => {
      const conta = (k) => (Array.isArray(r[k]) ? r[k].length : 0);
      console.log(`[dati-progetto] ${r.progetto} → ${r.destinazione}: spostate ${conta('spostate')}, unite ${conta('unite')}, doppioni tolti ${conta('doppioni')}, conflitti ${conta('conflitti')}, saltate ${conta('saltate')}, errori ${conta('errori')}`);
      for (const c of r.conflitti ?? []) console.warn(`[dati-progetto] conflitto, resta nel progetto: ${join(r.progetto, c)}`);
      for (const e of r.errori ?? []) console.warn(`[dati-progetto] errore su ${e.percorso}: ${e.codice ?? ''} ${e.messaggio}`);
    },
  });
  const maxProcessOutputBytes = process.env.TALOS_PROCESS_OUTPUT_MAX_BYTES === undefined
    ? 67_108_864 : Number(process.env.TALOS_PROCESS_OUTPUT_MAX_BYTES);
  if (!Number.isSafeInteger(maxProcessOutputBytes) || maxProcessOutputBytes <= 0) throw new Error('TALOS_PROCESS_OUTPUT_MAX_BYTES must be a positive integer.');
  let processOutputStorePromise;
  const processOutputStoreFn = () => processOutputStorePromise ??= createProcessOutputStore({
    databasePath: percorsoDatiDesktop('.process-output/output.sqlite'), maxOutputBytes: maxProcessOutputBytes,
  });
  /* Le cartelle GLOBALI di Note, Attività e Memoria: calcolate UNA volta e date sia al registro (elenchi, attrezzi del modello)
     sia alle porte di scrittura della persona (createHttpApp, più sotto) — vedi il commento lì (08/10/2026). */
  const cartelleArchiviPersonali = Object.freeze({
    cartellaNote: percorsoDatiDesktop('.notes-store/'),
    cartellaAttivita: percorsoDatiDesktop('.tasks-store/'),
    cartellaMemoria: percorsoDatiDesktop('.memory-store/'),
  });
  /* C1 (owner 09/10/2026 sera, «Motore col metodo» di serie, «solo le nuove», interruttore in Impostazioni → Contesto): la scelta
     sta sul server accanto al database del contesto, si legge alla NASCITA di ogni conversazione e si timbra su di lei. Senza
     cartella delle sessioni non c'è archivio del contesto: il motore resta spento (la prova `TALOS_CONTEXT_TRIAL` resta com'era). */
  const impostazioniContesto = config.cartellaStore
    ? createImpostazioniContesto({ file: join(config.cartellaStore, 'context', 'impostazioni-contesto.json') })
    : null;
  const motoreContestoAttivo = Boolean(config.contextTrial || impostazioniContesto);
  const sessionRegistry = resumeDiagnostics.wrapRegistry(createSessionRegistry(resumeDiagnostics.registryOptions({
    processOutputStoreFn,
    cartellaDatiProgettoFn: cartellaDatiProgetto,
    finestraTokenFn: finestraDallaRoute,
    ...(impostazioniContesto ? { motoreContestoPerNuoveFn: () => impostazioniContesto.motorePerUnaConversazioneNuova() } : {}),
    contextHooksFn: motoreContestoAttivo ? input => contextRuntime?.service.createKernelHooks(input) : undefined,
    // C1 review Y1: lo stesso criterio di `politicaAbilitazione`/`enabledSessionIds` qui sotto, ma sincrono, PRIMA dei ganci
    giroUsaIlMotoreFn: giroUsaIlMotore({ trialSessionIds: config.contextTrial?.sessionIds ?? null }),
    contextCompactFn: motoreContestoAttivo ? input => contextRuntime?.service.compact(input) : undefined,
    /* F3-11c (24/09 notte), decisione owner 42: un passo della bozza può chiedere un altro modello solo fra i disponibili
       (il catalogo che serve `/api/v1/models`); se il catalogo non risponde, l'elenco resta ignoto e il compilatore lo dice. */
    workflowPlanProposeFn: workflowStore ? input => proposeWorkflowFromTool(workflowStore, input, {
      availableModelIdsFn: async () => ((await modelCatalog.ottieni())?.modelli ?? []).map((m) => m?.id).filter((id) => typeof id === 'string'),
    }) : null,
    /* ⭐ C3b (owner 09/10/2026 sera): con la Coordinazione accesa il Workflow proposto parte da solo — approva e avvia con la stessa
       porta della persona, poi sveglia lo scheduler. Il runtime si legge all'uso (nasce sotto, come `workflowPerIlModelloFn`). */
    workflowAvvioDaSoloFn: workflowStore ? creaAvvioDaSolo({ store: workflowStore, runtimeFn: () => workflowRuntime,
      sessionExistsFn: (id) => Boolean(sessionRegistry?.leggiSessioneContesto?.(id)) }) : null,
    /*
     * ⛔⛔ F-012 (piano 0.1.19 §1.5, 28/09) — il canale dei TRE attrezzi dei run (`workflow_status`/
     * `workflow_output`/`workflow_control`), l'unico pezzo che il modello mancava. La fabbrica è
     * in `src/workflow/per-il-modello.mjs` e riusa le funzioni GIÀ esistenti (read-model, CAS,
     * `requestRunControl` + `scheduler.sveglia`): nessuna logica di dominio nuova, solo esposizione.
     * `runtimeFn` è RITARDATO di proposito: l'orchestratore nasce sotto (adattatore dei passi →
     * registro) e la chiusura lo legge quando il modello chiama, non quando il registro si costruisce.
     */
    workflowPerIlModelloFn: workflowStore ? creaOnWorkflowFn({ store: workflowStore, runtimeFn: () => workflowRuntime }) : null,
    avviaSessioneFn: (input) => avviaSessione({
      ...input,
      talosLavoraFn: (runtimeInput) => ownerRuntime.talosLavora(runtimeInput),
    }),
    modello: config.modello,
    /* ⛔ C2-Q (owner 07/10/2026 sera, contratto C2 §5): il desktop sa mostrare la domanda di una figlia alla persona (la carta nel
       padre), quindi la accende. CLI e mobile decidono da sé; il loro predefinito resta `false`. */
    domandeDeiFigli: true,
    /* ⛔⛔ C2b «Coordinazione» (owner 08/10/2026 sera): il desktop la accende — spenta di serie per ogni sessione, carta prima di
       avviare un agente, tetto di 20 avvii da soli per albero. Il modello chiesto per una figlia si sceglie fra lo stesso catalogo
       che i passi di Workflow usano già (F3-11c, decisione owner 42, `workflowPlanProposeFn` qui sotto). CLI e mobile no. */
    coordinazione: true,
    modelliDisponibiliFn: async () => ((await modelCatalog.ottieni())?.modelli ?? []).map((m) => m?.id).filter((id) => typeof id === 'string'),
    /*
     * ⛔ (16/09/2026, review — portato dal main pubblico il 18/09) — la riserva `config.chiaveApi` è la OPENROUTER_API_KEY
     *   dell'AMBIENTE: nello scope desktop NON deve raggiungere le sessioni nemmeno come riserva. Con lo scope desktop la UI
     *   dice «non collegata», e una chiave che lavora e fattura senza dirlo è peggio di una che manca: le sessioni prendono
     *   SOLO dal portachiavi dell'app (`-desktop`). Vale anche per `prontoFn`, qui sotto: stessa riserva, stessa regola.
     */
    chiave: ignoraSemiAmbiente ? undefined : config.chiaveApi,
    chiaveFn: ignoraSemiAmbiente
      ? () => providerStore.getKey('openrouter')
      : () => providerStore.getKey('openrouter') ?? config.chiaveApi,
    /*
     * ⛔⛔⛔ CLI-REQ-05, punto 1 (17/09/2026) — CHI RISPONDE A «QUESTO MODELLO SI PUÒ USARE».
     *
     * Il registro non conosce i fornitori: conosceva solo `chiaveFn`, che è la chiave di
     * OpenRouter, e rifiutava QUALUNQUE sessione non locale senza di essa — anche una sessione
     * DeepSeek con la chiave DeepSeek già salvata, con un messaggio che nomina
     * `OPENROUTER_API_KEY`, una variabile che quella persona non ha mai impostato.
     * ⇒ La domanda la risponde l'host, che ha il portachiavi, e la risposta parla del fornitore
     *   DEL MODELLO col suo nome umano. Sincrona: non serve rete, e `avviaESegui` non è `async`.
     * ⛔ Un fornitore che non richiede credenziale (`chiaveObbligatoria: false`) è pronto per
     *   costruzione: non gli si chiede una chiave che non esiste.
     */
    /* ⛔ 17/09, dopo la fusione: la regola vive in `src/sessione-pronta.mjs`, dove ha le sue prove. Qui dentro era una
       chiusura che nessuno poteva chiamare, e per i fornitori diversi da OpenRouter contava come «pronta» anche una chiave
       in PANCHINA (`hasKey` invece di `getKey`): la sessione partiva e il giro moriva senza una chiave utilizzabile. */
    prontoFn: creaProntoFn({ providerStore, chiaveApi: ignoraSemiAmbiente ? null : config.chiaveApi }),
    /*
     * ⛔⛔⛔ CLI-REQ-05, punto 2 e 3 — LA STESSA DESTINAZIONE CHE USA UN GIRO NORMALE.
     * Senza questa, la compattazione e il giudice della ricerca partivano con una `fetch` nuda, e
     * il kernel spedisce a un indirizzo FISSO di OpenRouter: la conversazione intera di una
     * sessione DeepSeek se ne andava lì. `destinazioneModelloDeps` è la stessa che sceglie
     * fornitore, indirizzo e chiave per ogni turno — una fonte sola, non una seconda copia.
     */
    fetchModelloFn: () => creaFetchMultiProvider(fetch, { dipendenze: destinazioneModelloDeps }),
    cartelleProgetto: config.cartelleProgetto,
    taskCatalogProvider,
    ricercaWeb: config.ricercaWeb, // seme dell'ambiente: resta per compatibilità, ma è ricercaWebFn a valere a ogni giro
    ricercaWebFn,
    preferenzeWslFn: () => preferenzeWslStore.leggi(), // F009: letta a ogni comando, come ricercaWebFn
    casaLinux: casaLinux.pronta ? { node: casaLinux.node, rg: casaLinux.rg } : null, // Fase B: la casa Linux di ogni sessione
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
    /*
     * ⭐ 10/10/2026 — l'affitto fra processi sull'archivio (owner 09/10: «Affitto come Hermes»): il 4174 e l'app installata usano lo
     *   stesso `%APPDATA%\TALOS\sessions`. L'etichetta è ciò che l'ALTRO processo dirà alla persona («aperta in …»).
     */
    affittoFraProcessi: config.cartellaStore
      ? { etichetta: process.env.TALOS_DESKTOP_DATA_DIR ? 'the TALOS desktop app' : `the TALOS server on port ${config.port}` }
      : null,
    // R-02: nel prodotto installato i negozi vivono nella cartella dati del guscio (TALOS_DESKTOP_DATA_DIR); da sorgente restano accanto a server.mjs, come i default del registro.
    cartellaTrustHook: percorsoDatiDesktop('.hooks-trust/'),
    cartellaTrustMcp: percorsoDatiDesktop('.mcp-trust/'),
    cartellaTrustPlugin: percorsoDatiDesktop('.plugin-trust/'),
    ...cartelleArchiviPersonali,
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
  })));
  /*
   * ⭐⭐⭐ FASE L (30/8) — ricostruisce le sessioni persistite PRIMA di
   * accettare richieste: un riavvio del server (non solo un F5 del
   * browser) non deve più mostrare un elenco vuoto. Loggato, mai
   * silenzioso — l'owner che guarda il terminale vede quante sessioni
   * sono tornate.
   */
  const { ripristinate, totali } = await sessionRegistry.ripristina();
  if (totali > 0) console.log(`[session-store] ${ripristinate}/${totali} sessioni ripristinate da .sessions-store/`);
  /*
   * ⭐ F3-41b (25/09/2026) — IL RUNTIME DEI WORKFLOW, composto qui come chiedeva l'audit (`WFS` punto 1: il server componeva
   *   Store, proposta e HTTP, ma non l'orchestratore, il recupero all'avvio né l'adattatore dei passi). DOPO il ripristino delle
   *   sessioni (la riconciliazione di un passo cerca la sua sessione per legame), PRIMA di `listen`: quarantena → recupero →
   *   scheduler. Se il recupero fallisce, il registro resta leggibile e lo scheduler non parte: nessun passo nuovo finché
   *   qualcuno non guarda. Nessuna rotta nuova: `/start` arriva con F3-51 e sveglierà lo scheduler.
   */
  let workflowRuntime = null;
  if (workflowStore) {
    /* C3b (owner 09/10/2026 sera): quando un run finisce o entra in «Serve attenzione» la sessione che lo ha avviato riparte con
       l'esito, come coi risultati delle figlie. PRIMA del recupero: un run che il recupero porta in «Serve attenzione» è un
       cambio vero, e il padre lo deve sapere. */
    creaRisveglioDaiWorkflow({ store: workflowStore, accodaFn: (esito) => sessionRegistry.accodaEsitoWorkflow(esito),
      onErrore: (errore, dove) => console.error(`[workflow] the outcome of run ${dove?.runId} did not reach its session: ${errore?.code ?? errore?.message ?? errore}`) });
    const capacita = createCapacitaAdattiva();
    const orchestrator = createWorkflowOrchestrator({ store: workflowStore, capacityFn: () => capacita.politica(),
      adapters: new Map([['agent-session', createAgentSessionAdapter({ sessions: sessionRegistry })]]) });
    const scheduler = createWorkflowScheduler({ orchestrator, store: workflowStore, capacita,
      onErrore: (errore, dove) => console.error(`[workflow] ${errore?.code ?? 'errore'}: ${errore?.message ?? errore}`, dove) });
    try {
      await orchestrator.recover();
      await scheduler.avvia();
      workflowRuntime = Object.freeze({ orchestrator, scheduler, capacita });
      console.log('[workflow] runtime pronto: recupero fatto, al massimo 4 passi insieme');
    } catch (errore) {
      scheduler.ferma();
      console.error(`[workflow] runtime in attesa di attenzione: ${errore?.code ?? errore?.message ?? errore}`);
    }
  }
  // PO-26 — in sottofondo: una richiesta sulla stessa sessione aspetta la STESSA migrazione, non una seconda.
  sessionRegistry.preparaCartelleDati().then(
    (progetti) => { if (progetti > 0) console.log(`[dati-progetto] ${progetti} progetti controllati`); },
    (errore) => console.warn(`[dati-progetto] passata iniziale non riuscita: ${errore?.message ?? errore}`),
  );
  if (motoreContestoAttivo) {
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
          return resumeDiagnostics.withRoute('context-counter', () => supervisoreLocale.request(new URL(url).pathname, options));
        }
        return fetch(url, options);
      },
    });
    const creaRuntimeContesto = () => createDesktopContextRuntime({
      sessionDirectory: config.cartellaStore,
      ...(config.contextTrial
        ? { enabledSessionIds: config.contextTrial.sessionIds }
        // C1: di serie, il motore vale per le conversazioni NATE col timbro «engine» (`session-registry.mjs`, motoreContesto)
        : { politicaAbilitazione: ({ session }) => session?.motoreContesto === 'engine' }),
      readSession: sessionId => sessionRegistry.leggiSessioneContesto(sessionId),
      resolveModelProfile: selected => (config.contextTrial
        ? resolveDesktopContextProfile({ profiles: config.contextTrial.models, ...selected, readLocalRuntime })
        : resolveDesktopDefaultProfile({ ...selected, finestraFn: finestraDallaRoute, readLocalRuntime })),
      tokenCounter,
      callModel: request => ownerRuntime.callContextModel(request),
      onEvent: input => sessionRegistry.pubblicaEventoContesto(input),
      onPrepared: input => sessionRegistry.annotaPreparazioneContesto(input), // C1 (10/10): i conteggi del livello 1 per la scheda Contesto
    });
    if (config.contextTrial) contextRuntime = await creaRuntimeContesto();
    else {
      /* C1: di serie un archivio del contesto che non si apre NON ferma l'app — il motore si spegne, lo dice, e le
         conversazioni (anche quelle timbrate «engine») vanno col legacy: i ganci senza runtime rispondono «non mio». */
      try { contextRuntime = await creaRuntimeContesto(); }
      catch (errore) { contextRuntime = null; console.error(`[context] engine OFF for this run, conversations use the legacy compaction: ${errore?.code ?? errore?.message ?? errore}`); }
    }
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
    puoCambiareSeStessa: true, // D5 (owner 08/10/2026 notte): un giro può cambiare le sue istruzioni o il suo prossimo giro
  });
  /*
   * ⛔⛔ Automazioni a due porte (owner 08/10/2026 notte, «non negoziabile»): la porta del MODELLO. Il registro offre gli
   *   attrezzi `automation_*` solo da qui in poi; la CLI non lo chiama, e da lei non si offrono.
   */
  sessionRegistry.collegaAutomazioni(creaOspiteAutomazioni({
    store: automationStore, scheduler: automationScheduler, verificaCartellaFn: validaCartellaLibera,
  }));
  /* ⭐ 0.1.25 (owner 09/10/2026) — la seconda porta dei fornitori esclusi: elencare libero, escludere e riammettere con la carta.
     Come le automazioni, il registro offre gli attrezzi `provider_*` solo da qui in poi; la CLI non lo chiama. */
  sessionRegistry.collegaFornitori(creaOspiteFornitori({ providerStore, slugDelFornitoreFn: (q) => slugDelFornitore(q) }));
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
      /* K4b (03/10/2026): frase inglese di riserva + chiave del dizionario (area `server`); l'errore del catalogo è già
         inglese e non ha chiave: si dice com'è. */
      ...(snapshot?.status === 'available'
        ? { dettaglio: 'Agent runtime ready.', dettaglioChiave: 'server.doctor.runtime.ready' }
        : taskCatalogError?.message
          ? { dettaglio: taskCatalogError.message }
          : { dettaglio: 'The agent runtime is not ready for all the required features.', dettaglioChiave: 'server.doctor.runtime.notReady' }),
    };
    return diagnosi({
      chiaveConfigurata: providerStore.hasKey('openrouter'), cartelleProgetto: config.cartelleProgetto,
      ricercaWeb: searchSourceStore.listPublic(),
      labsAccesi: config.labs,
      providerRows: providerStore.listPublic(), providerStoreAvailable: Boolean(providerKeyring),
      ownerRuntime: ownerRuntimeState,
      catalogoTask: taskCatalogProvider
        ? { disponibile: true, dettaglio: 'Preset tasks list available.', dettaglioChiave: 'server.doctor.catalog.available' }
        : { disponibile: false, dettaglio: 'The preset tasks list is not available in this installation.', dettaglioChiave: 'server.doctor.catalog.unavailable' },
      sessioniPersistenza: typeof sessionRegistry.statoPersistenza === 'function' ? sessionRegistry.statoPersistenza() : undefined,
      scratch: await statoScratch().catch(() => undefined),
      /* 24/09/2026 — come il negozio pubblica l'intestazione di una sessione in QUESTA cartella ('link' | 'senza-link' | null
         finché nessuna è stata scritta da questo avvio): la voce del Doctor esisteva dal commit 34e78a9d4 e nessuno gliela passava. */
      negozioSessioni: config.cartellaStore
        ? { modalitaIntestazione: modalitaPubblicazioneIntestazione(config.cartellaStore), cartella: config.cartellaStore }
        : undefined,
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

  /* F6-3 (27/09): il servizio git serve anche alle PR (`gh-service` legge ramo, remoti e bozza da qui): uno solo, per entrambi. */
  const servizioGit = creaServizioGit({ cartellaDiSessione: (sessionId) => sessionRegistry.cartellaDi(sessionId) });

  const app = createHttpApp({
    /*
     * ⛔ 16/09 — il tetto sul corpo delle richieste (10 MiB di serie, vedi `MAX_REQUEST_BODY_BYTES` in http-app.mjs):
     *   `TALOS_HTTP_BODY_MAX_BYTES` lo cambia; un valore storto (vuoto, non numerico, ≤ 0) NON deve impedire
     *   l'avvio, quindi si ignora e resta il default — stessa disciplina di `TALOS_MCP_STARTUP_CONCURRENCY`.
     */
    ...(Number.isInteger(Number(process.env.TALOS_HTTP_BODY_MAX_BYTES)) && Number(process.env.TALOS_HTTP_BODY_MAX_BYTES) > 0
      ? { limiteCorpoByte: Number(process.env.TALOS_HTTP_BODY_MAX_BYTES) }
      : {}),
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
    impostazioniContesto, // C1: «Motore del contesto» in Impostazioni → Contesto
    // ⭐ 10/09: le favicon delle fonti, prese dal server una volta sola e tenute qui accanto alle sessioni.
    cartellaFavicon: percorsoDatiDesktop('.favicon-cache/'),
    /*
     * ⛔⛔ 08/10/2026 (bugfixer) — le STESSE tre cartelle date al registro qui sopra (`cartellaNote`…). Dal 12/09 (R-02) solo il
     *   registro le riceveva: le porte di scrittura della PERSONA (`magazziniDellaPersona` in http-app.mjs) restavano sul loro
     *   default accanto al codice. Senza TALOS_DESKTOP_DATA_DIR le due coincidono; nell'app installata no: misurato con la
     *   cartella dati impostata, POST di una nota → 201 nel codice, elenco → 0, e un aggiornamento che sostituisce il codice la
     *   cancella. Il commento in http-app.mjs lo chiamava «il difetto peggiore possibile per questa funzione».
     */
    ...cartelleArchiviPersonali,
    chatImageStore,
    staticHandler: createStaticHandler(config.publicDir),
    sessionRegistry,
    workflowStore,
    workflowRuntime, // F3-51c (25/09/2026): Avvia e i controlli del run; null ⇒ «non disponibile»
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
    gitService: servizioGit,
    /*
     * ⭐ F6-3 (27/09) — le PR con `gh` (decisioni owner 5-7, 25-28): il `gh` che TALOS scarica, se serve, sta nella cartella dati
     *   (`.tools/gh/<versione>/`, ignorata da git come ogni `.tools/`); quello di sistema, se è abbastanza nuovo, ha la precedenza.
     */
    ghService: creaServizioGh({ cartellaStrumenti: percorsoDatiDesktop('.tools/gh/'), servizioGit }),
    // Un catalogo non configurato è uno stato degradato osservabile, non un crash HTTP.
    listaTaskDisponibili: () => (taskCatalogProvider ? listaTaskDisponibili(taskCatalogProvider) : []),
    elencaCartelleProgetto: () => elencaCartelleProgetto(config.cartelleProgetto),
    automationStore,
    automationScheduler, // automazioni a due porte (08/10/2026): «esegui ora» e «ferma il giro»
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
    preferenzeWslStore, // F009: GET/POST /api/v1/wsl
    token: config.token, // ⭐ 04/9, W1-10 — cancello a token per la shell Electron
    spegnimento: spegnimentoPerLaApp, // F3 (24/09): la rotta di spegnimento gentile; gettone e funzione arrivano dopo l'ascolto (oggetto condiviso)
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
    // 27/09: la pagina di un modello HF dice prima di scaricare se il motore installato sa leggerne l'architettura
    motoreConosceArchitetturaFn: (architettura) => (config.llamaServerPath ? motoreConosceArchitettura(config.llamaServerPath, architettura) : null),
    hfImageProxyFn: (url) => fetchAllowedHfImage(url),
    providerStore,
    providerProbe,
    workspaceLaunchStore,
    workspaceBrowser,
    browserVivo,
  });
  const server = createServer(app);

  /*
   * ⛔⛔ P0 · punto 7 (16/09/2026) — I TEMPI DEL SERVER SI DICHIARANO, PRIMA DI `listen`.
   *
   * Fin qui questa riga era solo `createServer(app)`: nessuno dei quattro tempi era impostato, e
   * quelli attivi erano i default di qualunque Node fosse installato (misurati su v24.18.0:
   * timeout 0 · headersTimeout 60 s · keepAliveTimeout 5 s · requestTimeout 300 s — e
   * `server.timeout` valeva 120 s fino a Node 13). La rotta `/events` deve reggere un
   * ragionamento lungo: non può dipendere da questo.
   * I numeri e le ragioni stanno in `src/http-lifecycle.mjs` (`TEMPI_SERVER_HTTP`), nello stesso
   * posto da cui li legge la prova che il battito regge oltre il vecchio muro.
   */
  const tempiDelServer = applicaTempiDelServer(server);

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
    togliGettoneSpegnimento();
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
        // F3-41b: lo scheduler si ferma PRIMA che il registro si chiuda (un passo che finisce dopo non scrive più niente)
        ...(workflowRuntime ? [{ stop: () => workflowRuntime.scheduler.ferma() }] : []),
        ...(workflowStore ? [{ close: () => workflowStore.close() }] : []),
        ...(contextRuntime ? [{ close: () => contextRuntime.close() }] : []),
        ...Object.values(localRuntimes).map((runtime) => ({ close: () => typeof runtime?.unload === 'function' ? runtime.unload() : undefined })),
      ],
      logger: console,
    });
    await resumeDiagnostics.flush();
    /*
     * ⭐ F3, onda 2 di F2 (24/09/2026), decisione 8 — il registro si chiude PRIMA di `server.close`: fence sulle operazioni
     *   nuove e flush della coda del negozio (`attendiScritture`), con un tetto di 10 s. Un flush scaduto si DICE a log.
     *   Forma di Hermes `gateway/shutdown_flush.py` («Flush pending messages … before shutdown to prevent data loss»).
     */
    try {
      const esito = await sessionRegistry.chiudi({ attesaMassimaMs: 10_000 });
      console.log(`[session-store] spegnimento: ${esito.scrittureAttese} scritture attese in ${esito.giri} giri${esito.scaduta ? ' — ATTENZIONE: flush scaduto, qualcosa può non essere su disco' : ''}${esito.sintesiInCorso ? ` · ${esito.sintesiInCorso} sintesi in background abbandonate` : ''}`);
    } catch (errore) {
      console.error('[session-store] chiusura del registro fallita:', errore instanceof Error ? errore.message : errore);
    }
    if (processOutputStorePromise) {
      try {await (await processOutputStorePromise).close();}
      catch {console.error('[process-output] archivio non chiuso regolarmente; le catture incomplete restano incomplete.');}
    }
    server.close(() => process.exit(0));
    /*
     * ⛔⛔ 24/09/2026 — `close()` DA SOLO NON CHIUDE I FLUSSI APERTI. Segnalato dalla lane mobile (stesso difetto curato sul
     *   telefono) e riprodotto qui: `tests/server-spegnimento-con-flussi-aperti.test.mjs`, con un flusso
     *   `/api/v1/sessions/:id/events` aperto il processo restava vivo oltre 6 s dopo lo stop gentile. Node
     *   (nodejs.org/api/http.html, letto il 24/09/2026): `server.close()` chiude solo le connessioni «not sending a request
     *   or waiting for a response»; `closeAllConnections()` (v18.2.0) chiude anche quelle, e va chiamata DOPO `close()`
     *   «to avoid race conditions where new connections are created between a call to this and a call to server.close».
     *   Il registro ha già fatto il flush qui sopra: chiudere le risposte vive non perde niente.
     * ⛔ `closeAllConnections` non tocca i socket passati a un altro protocollo (il WebSocket del terminale): per quelli
     *   resta la rete di sicurezza, che esce comunque dopo 2 s e lo DICE a log. `unref`: da sola non tiene vivo il processo.
     */
    server.closeAllConnections?.();
    setTimeout(() => {
      console.error('[spegnimento] connessioni ancora aperte 2 s dopo la chiusura: esco comunque (il registro ha già fatto il flush)');
      process.exit(1);
    }, 2_000).unref();
  };
  /*
   * ⭐ F3 (24/09/2026), decisione 8 — il gettone dello spegnimento gentile: casuale a ogni avvio, scritto nella cartella
   *   dei journal (`config.cartellaStore`; solo l'utente, `mode 0o600` — su Windows le ACL dell'utente) e letto da `scripts/aggiorna-4174.ps1`, che lo
   *   presenta a `POST /api/v1/admin/shutdown` PRIMA di qualunque `Stop-Process -Force`.
   */
  let gettoneSpegnimento = null;
  const fileGettoneSpegnimento = join(config.cartellaStore, `.spegnimento-gettone-${portaAscolto}`);
  /* ⭐ 09/10/2026 (bugfixer, seguito suggerito dalla review di «talos desktop») — allo spegnimento gentile il server TOGLIE il suo
     file, come Jupyter Server toglie il suo `jpserver-<pid>.json` (`ServerApp.remove_server_info_file`, «removes the …json file
     created for this server, and ignores the error raised when the file has already been removed»; letto il 09/10/2026): con
     un file per porta, l'app installata che si chiude non lascia gettoni morti a ogni porta usata. Solo se il file porta ANCORA
     il nostro gettone (un altro server sulla stessa porta, dopo di noi, avrebbe il suo). Uno stop brusco lo lascia, e il
     prossimo avvio sulla stessa porta lo riscrive. */
  const togliGettoneSpegnimento = () => {
    if (!gettoneSpegnimento) return;
    try {
      if (readFileSync(fileGettoneSpegnimento, 'utf8') === gettoneSpegnimento) unlinkSync(fileGettoneSpegnimento);
    } catch (errore) {
      if (errore?.code !== 'ENOENT') console.error('[spegnimento] gettone non tolto:', errore instanceof Error ? errore.message : errore);
    }
  };
  try {
    gettoneSpegnimento = randomBytes(32).toString('hex');
    /* Nella cartella dei journal (`config.cartellaStore`, gitignorata, dell'utente): mai accanto a `server.mjs` nel repo —
       la prima stesura ci lasciava un file non tracciato quando una prova avviava il server (misurato: `?? .spegnimento-gettone`). */
    /* ⛔⛔ 09/10/2026 (bugfixer) — UN FILE PER PORTA. Dal 07/10 (decisione owner) il 4174 e l'app installata scrivono nella
       STESSA cartella (`%APPDATA%\TALOS\sessions`), e col nome unico vinceva l'ultimo server partito: dopo un avvio dell'app,
       `aggiorna-4174.ps1` presentava al 4174 il gettone dell'app ⇒ 401 ⇒ `-Force`, cioè proprio lo stop brusco che la
       decisione 8 voleva evitare. Visto dal vivo il 09/10 alle 00:22 («(401) Non autorizzato: passo al -Force») e riprodotto
       con due server sulla stessa cartella (tests/server-spegnimento-con-flussi-aperti.test.mjs). È la forma di Jupyter Server,
       che con più istanze nella stessa cartella di runtime scrive un file per istanza (`jpserver-<pid>.json`, con porta e
       token; jupyter-server.readthedocs.io «Security», letta il 09/10/2026). Qui la chiave è la PORTA: lo script la conosce, e
       il file lasciato da un server morto si riscrive al prossimo avvio sulla stessa porta. */
    mkdirSync(config.cartellaStore, { recursive: true });
    writeFileSync(fileGettoneSpegnimento, gettoneSpegnimento, { encoding: 'utf8', mode: 0o600 });
  } catch (errore) {
    gettoneSpegnimento = null;
    console.error('[spegnimento] gettone non scritto (la rotta di spegnimento resta spenta):', errore instanceof Error ? errore.message : errore);
  }
  spegnimentoPerLaApp.gettone = gettoneSpegnimento;
  spegnimentoPerLaApp.spegniFn = shutdown;
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  console.log(`Harness UI disponibile su http://${config.host}:${portaAscolto}`);
  /*
   * ⭐ P0 · punto 7: si stampa ciò che il server ha DAVVERO (rilettura, non ciò che gli abbiamo
   * chiesto) più il failsafe attivo. Sono i due numeri che servono quando qualcuno segnala «si è
   * fermato da solo»: senza, la diagnosi ricomincia dalla lettura del codice.
   */
  console.log(`[tempi] socket ${tempiDelServer.timeout === 0 ? 'senza scadenza' : `${tempiDelServer.timeout} ms`} · keep-alive ${tempiDelServer.keepAliveTimeout} ms · intestazioni ${tempiDelServer.headersTimeout} ms · richiesta ${tempiDelServer.requestTimeout} ms · silenzio del fornitore ${leggiInattivitaGenerazioneMs() === 0 ? 'nessun limite' : `${Math.round(leggiInattivitaGenerazioneMs() / 60_000)} min`}`);
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
  /*
   * ⭐ Corsia SCRATCH, 24/09/2026 — la pulizia della radice dei temporanei (src/scratch.mjs) parte
   * QUI, dopo che il server ascolta, e NON si attende: è asincrona, non lancia mai, e al massimo una
   * volta l'ora fra processi (file-timbro). Toglie le voci il cui sottoalbero è fermo da 24 ore, più i
   * residui storici fuori radice (talos-doctor-/talos-git-msg-/talos-avvio- in TEMP, avvio-* nella
   * cartella dati del desktop). Come Hermes (`hermes_constants.py:1234-1248`).
   */
  void avviaPuliziaScratch();
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
