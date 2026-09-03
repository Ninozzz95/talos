import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createAutomationScheduler } from './src/automation-scheduler.mjs';
import { createAutomationStore } from './src/automation-store.mjs';
import { loadConfig } from './src/config.mjs';
import { createHttpApp } from './src/http-app.mjs';
import { createSessionRegistry } from './src/session-registry.mjs';
import { createStaticHandler } from './src/static-files.mjs';
import { listaTaskDisponibili } from './src/task-catalog.mjs';
import { elencaCartelleProgetto } from './src/custom-task.mjs';
import { diagnosi } from './src/doctor.mjs';
import { createModelCatalog } from './src/model-catalog.mjs';
import { creaRegistroTerminali, MINUTI_PRIMA_DI_CHIUDERE_PTY_ORFANA } from './src/pty-terminal.mjs';
import { creaGestoreTerminaleWs } from './src/terminal-ws.mjs';
import { misuraCapacitaMacchina } from './src/machine-capacity.mjs';
import { createLocalModelStore } from './src/local-model-store.mjs';
import { createOpenAiCompatibleRuntime } from './src/openai-compatible-runtime.mjs';
import { createHfHubClient } from './src/hf-hub-client.mjs';
import { createHfDirectTransfer } from './src/hf-direct-transfer.mjs';
import { fetchAllowedHfImage } from './src/hf-image-proxy.mjs';
import { createLlamaServerSupervisor } from './src/llama-server-supervisor.mjs';
import { createLlamaServerRuntime } from './src/local-runtime-llama-server.mjs';
import { createProviderProbe } from './src/provider-probe.mjs';
import { createProviderCredentialStore } from './src/provider-credential-store.mjs';
import { createGeneratedImageStore } from './src/generated-image-store.mjs';
import { createOwnerRuntimeAdapter } from './src/runtime-owner-adapter.mjs';
import { avviaSessione } from './src/agent-service.mjs';
import { RUNTIME_BOOTSTRAP_SCHEMA, RUNTIME_RESOURCE_SCHEMA } from './src/runtime-contract.mjs';
import { closeRuntimeResources } from './src/http-lifecycle.mjs';
import { createWorkspaceLaunchStore } from './src/workspace-launch-store.mjs';
import { cartelleConsigliate } from './src/frequent-dirs.mjs';
import { createWorkspaceBrowser } from './src/workspace-browser.mjs';
import { createLocalRuntimeProbe } from './src/local-runtime-probe.mjs';
import { readGgufHeader } from './src/gguf-header.mjs';
import { join, parse } from 'node:path';

/** ⛔ Stessi tre nomi loopback validati in config.mjs (`LOOPBACK_HOSTS`, non esportato — costante minuscola e stabile, duplicarla qui è più semplice che aggiungere un export per tre stringhe). Un browser può presentarsi con uno qualunque dei tre alias anche se il server è bindato su un altro. */
const ALIAS_LOOPBACK = ['127.0.0.1', '::1', 'localhost'];

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
    runtimeFile: fileURLToPath(new URL('.provider-runtime.json', import.meta.url)),
  });
  providerStore.loadFromKeyring();

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
  const ownerRuntime = createOwnerRuntimeAdapter({
    modulePath: config.ownerRuntimeModule,
    openRouterRuntimeFn: () => providerStore.getRuntime('openrouter'),
    modelCapabilityFn: async (modelId) => {
      try {
        const { modelli } = await modelCatalog.ottieni();
        return modelli.find((modello) => modello.id === modelId) ?? null;
      } catch {
        // Il catalogo degradato non impedisce una richiesta: il provider
        // conserva la validazione finale e Doctor espone già il guasto.
        return null;
      }
    },
  });
  let taskCatalogProvider = null;
  let taskCatalogError = null;
  try {
    taskCatalogProvider = await ownerRuntime.taskCatalogProvider();
  } catch (error) {
    taskCatalogError = error;
    console.warn(`[runtime-owner] catalogo task non disponibile: ${error.message}`);
  }
  const localModelStore = createLocalModelStore({ rootDir: fileURLToPath(new URL('.local-models/', import.meta.url)) });
  const compatibleRuntime = createOpenAiCompatibleRuntime();
  const hfHubClient = createHfHubClient({ token: config.hfToken });
  const localModelTransfer = createHfDirectTransfer({ rootDir: fileURLToPath(new URL('.local-models/', import.meta.url)), modelStore: localModelStore, hubClient: hfHubClient });
  const generatedImageStore = createGeneratedImageStore({ rootDir: fileURLToPath(new URL('.generated-images/', import.meta.url)) });
  const workspaceLaunchStore = createWorkspaceLaunchStore({ credentialFile: fileURLToPath(new URL('.workspace-launch-token', import.meta.url)) });
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
    const supervisor = createLlamaServerSupervisor({ binaryPath: config.llamaServerPath, modelStore: localModelStore });
    const llama = createLlamaServerRuntime({ supervisor });
    localRuntimes['llama.cpp'] = {
      detect: async () => ({ state: 'observed', runtimeId: 'llama.cpp', runtimeState: supervisor.status().state, observedAt: supervisor.status().observedAt }),
      listModels: async () => (await localModelStore.list()).filter((model) => model.state === 'ready').map((model) => ({ id: model.id, name: model.repo, source: 'llama.cpp', context: { state: 'unknown' } })),
      inspect: (modelId) => localModelStore.inspect(modelId),
      load: async (modelId) => { const manifest = await localModelStore.inspect(modelId); if (!manifest || manifest.state !== 'ready') { const error = new Error('Modello locale non pronto'); error.code = 'MODEL_NOT_FOUND'; throw error; } const file = manifest.files[0]; return llama.load({ modelId, modelPath: join(fileURLToPath(new URL('.local-models/', import.meta.url)), manifest.path, file.path) }); },
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
      readHeader: (percorsoRelativo) => readGgufHeader(join(fileURLToPath(new URL('.local-models/', import.meta.url)), percorsoRelativo)),
      measureMachine: () => misuraCapacitaMacchina({ storagePath: config.publicDir }),
    });
  }
  /*
   * ⛔ Nessun fail() se config.chiaveApi manca (vedi config.mjs): il server
   * parte comunque — avviare una sessione fallisce per-richiesta con
   * CONFIG_INVALID, dichiarato al chiamante, non un rifiuto all'avvio.
   */
  const sessionRegistry = createSessionRegistry({
    avviaSessioneFn: (input) => avviaSessione({
      ...input,
      talosLavoraFn: (runtimeInput) => ownerRuntime.talosLavora(runtimeInput),
    }),
    modello: config.modello,
    chiave: config.chiaveApi,
    chiaveFn: () => providerStore.getKey('openrouter') ?? config.chiaveApi,
    cartelleProgetto: config.cartelleProgetto,
    taskCatalogProvider,
    ricercaWeb: config.ricercaWeb,
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
    cartella: fileURLToPath(new URL('.automations/', import.meta.url)),
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
      providerRows: providerStore.listPublic(), providerStoreAvailable: Boolean(providerKeyring),
      ownerRuntime: ownerRuntimeState,
      catalogoTask: { disponibile: Boolean(taskCatalogProvider), dettaglio: taskCatalogProvider ? 'Elenco attività predefinite disponibile.' : 'L’elenco delle attività predefinite non è disponibile in questa installazione.' },
      sessioniPersistenza: typeof sessionRegistry.statoPersistenza === 'function' ? sessionRegistry.statoPersistenza() : undefined,
    });
  };
  const app = createHttpApp({
    staticHandler: createStaticHandler(config.publicDir),
    sessionRegistry,
    // Un catalogo non configurato è uno stato degradato osservabile, non un crash HTTP.
    listaTaskDisponibili: () => (taskCatalogProvider ? listaTaskDisponibili(taskCatalogProvider) : []),
    elencaCartelleProgetto: () => elencaCartelleProgetto(config.cartelleProgetto),
    automationStore,
    diagnosiFn,
    catalogoModelliFn: (opts) => modelCatalog.ottieni(opts),
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
  });
  const server = createServer(app);

  /*
   * ⭐⭐⭐ 28/8 — Terminale REALE (LEDGER-TERMINALE-REALE.md). Nessuna
   * porta nuova: l'upgrade WebSocket avviene sullo STESSO `server`,
   * quindi eredita lo stesso bind loopback-only di ogni altra rotta.
   * `risolviCartella`: la PTY di un id che combacia una sessione VERA
   * parte nel suo workspace; altrimenti (terminale standalone, nessuna
   * sessione aperta) cade sul primo progetto configurato — mai un
   * `cartella` inventata o presa dal client senza validazione.
   */
  const registroTerminali = creaRegistroTerminali();
  const originiTerminaleConsentite = new Set(ALIAS_LOOPBACK.map((host) => `http://${host}:${config.port}`));
  const terminaleWs = creaGestoreTerminaleWs({
    registro: registroTerminali,
    originiConsentite: originiTerminaleConsentite,
    risolviCartella: (id) => sessionRegistry.cartellaDi(id) ?? config.cartelleProgetto[0]?.percorso ?? process.cwd(),
  });
  server.on('upgrade', (req, socket, head) => terminaleWs.gestisciUpgrade(req, socket, head));
  const reaperTerminali = setInterval(() => registroTerminali.reap(), MINUTI_PRIMA_DI_CHIUDERE_PTY_ORFANA * 60_000).unref();

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, resolve);
  });
  automationScheduler.avvia();

  let shutdownStarted = false;
  const shutdown = async () => {
    if (shutdownStarted) return;
    shutdownStarted = true;
    clearInterval(reaperTerminali);
    for (const id of registroTerminali._terminali.keys()) registroTerminali.chiudiForzato(id);
    await closeRuntimeResources('shutdown', {
      resources: [
        { stop: () => automationScheduler.ferma() },
        ...Object.values(localRuntimes).map((runtime) => ({ close: () => typeof runtime?.unload === 'function' ? runtime.unload() : undefined })),
      ],
      logger: console,
    });
    server.close(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  console.log(`Harness UI disponibile su http://${config.host}:${config.port}`);
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
