import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createAutomationScheduler } from './src/automation-scheduler.mjs';
import { createAutomationStore } from './src/automation-store.mjs';
import { createCampaignService } from './src/campaign-service.mjs';
import { loadConfig } from './src/config.mjs';
import { readCampaignCosts } from './src/cost-reader.mjs';
import { elencaCartelleProgetto } from './src/custom-task.mjs';
import { diagnosi } from './src/doctor.mjs';
import { cartelleFrequenti } from './src/frequent-dirs.mjs';
import { createHttpApp } from './src/http-app.mjs';
import { createPathPolicy } from './src/path-policy.mjs';
import { createReportSource } from './src/report-source.mjs';
import { createSessionRegistry } from './src/session-registry.mjs';
import { createStaticHandler } from './src/static-files.mjs';
import { listaTaskDisponibili } from './src/task-catalog.mjs';

async function startServer() {
  const config = loadConfig(process.env, import.meta.url);
  const pathPolicy = createPathPolicy(config);
  pathPolicy.initialize();
  const campaignService = createCampaignService({
    pathPolicy,
    costReader: readCampaignCosts,
    reportSource: createReportSource(pathPolicy),
  });
  /*
   * ⛔ Nessun fail() se config.chiaveApi manca (vedi config.mjs): il server
   * parte comunque, in sola lettura per le sessioni — avviarne una fallisce
   * per-richiesta con CONFIG_INVALID, dichiarato al chiamante, non un
   * server che non parte per chi vuole solo guardare le campagne.
   */
  const sessionRegistry = createSessionRegistry({
    modello: config.modello,
    chiave: config.chiaveApi,
    /*
     * ⭐⭐⭐ 03/9 — model-destination.mjs: le funzioni sono costruite QUI (non
     * dentro config.mjs, che resta dati puri) leggendo `config.chiaviProvider`/
     * `config.endpointOllama` — nessuna chiave scritta due volte in due
     * punti diversi, la stessa `config.chiaviProvider.openrouter` è anche
     * `config.chiaveApi` (stessa lettura di `OPENROUTER_API_KEY`, mai due
     * copie che potrebbero disallinearsi).
     */
    dipendenzeMultiProvider: {
      leggiChiave: (fonte) => config.chiaviProvider?.[fonte] ?? null,
      leggiRuntime: (fonte) => ({ endpoint: fonte === 'ollama' ? config.endpointOllama : null }),
    },
    cartelleProgetto: config.cartelleProgetto,
    // ⭐ 30/8, Fase C (2/7) — SEMPRE presente (config.mjs, parseImmagine non torna mai undefined), stesso principio di modello/chiave qui sopra.
    immagine: config.immagine,
    /*
     * ⭐⭐⭐ 30/8 — porta canonico (3e03f9d3, FASE L). `.sessions-store/`
     * gitignorata come `.automations/`/`.hooks-trust/` — dati locali
     * generati a runtime, non tracciati. L'UNICO punto che passa un
     * valore vero (vedi la doc in session-registry.mjs sul perché
     * nessun default lì dentro).
     *
     * ⛔⛔⛔ 2/9 — R1, CORRETTO: stava "accanto a questo file", cioè
     * DENTRO l'albero che il lancio Android cancella e rispinge ad ogni
     * avvio — la cronologia di una sessione spariva non perché la
     * scrittura fallisse, ma perché il riavvio successivo la cancellava
     * (LEDGER-MOBILE-PAREGGIO-DESKTOP-CODICE.md §44/§48). Ora, quando il
     * ponte Android la passa, vive FUORI da quell'albero
     * (config.cartellaStato — vedi TalosTerminalPlugin.kt); altrimenti
     * (dev locale, desktop) resta esattamente il comportamento di sempre.
     */
    cartellaStore: config.cartellaStato
      ? join(config.cartellaStato, 'sessions-store')
      : fileURLToPath(new URL('.sessions-store/', import.meta.url)),
    /*
     * ⛔⛔⛔ 2/9 — R1, stesso difetto/stessa cura: il default di
     * session-registry.mjs ("../.hooks-trust/", accanto a server.mjs)
     * viveva anche lui dentro l'albero rispinto ad ogni avvio. Passato
     * solo quando config.cartellaStato è presente — altrimenti resta il
     * default di sempre (`undefined` non sovrascrive un parametro con
     * default in JS, stesso principio già sfruttato altrove).
     */
    cartellaTrustHook: config.cartellaStato
      ? join(config.cartellaStato, 'hooks-trust')
      : undefined,
  });
  /*
   * ⭐⭐⭐ 30/8 — porta canonico (3e03f9d3, FASE L): ricostruisce le
   * sessioni persistite PRIMA di accettare richieste — un riavvio del
   * server (non solo un F5 del browser) non deve più mostrare un
   * elenco vuoto. Loggato, mai silenzioso — l'owner che guarda il
   * terminale vede quante sessioni sono tornate.
   */
  const { ripristinate, totali } = await sessionRegistry.ripristina();
  if (totali > 0) console.log(`[session-store] ${ripristinate}/${totali} sessioni ripristinate da .sessions-store/`);
  /*
   * ⭐ 29/8 — porta canonico (ledger §14), blocco 7. `.automations/`
   * accanto a server.mjs, stesso pattern di `.hooks-trust/` (§13) —
   * dati locali generati a runtime, mai tracciati. Il tick gira SOLO
   * col processo vivo: `unref()` in automation-scheduler.mjs non tiene
   * mai il server acceso da solo.
   */
  const automationStore = createAutomationStore({
    // ⛔⛔⛔ 2/9 — R1, stesso difetto/stessa cura di cartellaStore sopra:
    // "accanto a questo file" era dentro l'albero rispinto ad ogni avvio.
    cartella: config.cartellaStato
      ? join(config.cartellaStato, 'automations')
      : fileURLToPath(new URL('.automations/', import.meta.url)),
  });
  const automationScheduler = createAutomationScheduler({
    store: automationStore,
    sessionRegistry,
  });
  const app = createHttpApp({
    campaignService,
    staticHandler: createStaticHandler(config.publicDir),
    sessionRegistry,
    listaTaskDisponibili,
    diagnosiFn: () => diagnosi({ chiaveConfigurata: Boolean(config.chiaveApi) }),
    elencaCartelleProgetto: () => elencaCartelleProgetto(config.cartelleProgetto),
    automationStore,
    cartelleFrequentiFn: cartelleFrequenti,
  });
  const server = createServer(app);

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, resolve);
  });
  automationScheduler.avvia();

  const shutdown = () => { automationScheduler.ferma(); server.close(() => process.exit(0)); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  console.log(`Harness UI disponibile su http://${config.host}:${config.port}`);
}

const direct = process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url;
if (direct) {
  startServer().catch(() => {
    console.error('Harness UI non avviabile: controlla configurazione e file locali');
    process.exitCode = 1;
  });
}
