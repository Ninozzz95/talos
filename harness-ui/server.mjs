import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createAutomationScheduler } from './src/automation-scheduler.mjs';
import { createAutomationStore } from './src/automation-store.mjs';
import { createCampaignService } from './src/campaign-service.mjs';
import { loadConfig } from './src/config.mjs';
import { readCampaignCosts } from './src/cost-reader.mjs';
import { createHttpApp } from './src/http-app.mjs';
import { createPathPolicy } from './src/path-policy.mjs';
import { createReportSource } from './src/report-source.mjs';
import { createSessionRegistry } from './src/session-registry.mjs';
import { createStaticHandler } from './src/static-files.mjs';
import { listaTaskDisponibili } from './src/task-catalog.mjs';
import { elencaCartelleProgetto } from './src/custom-task.mjs';
import { diagnosi } from './src/doctor.mjs';
import { createModelCatalog } from './src/model-catalog.mjs';

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
    cartelleProgetto: config.cartelleProgetto,
    ricercaWeb: config.ricercaWeb,
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
  const modelCatalog = createModelCatalog();
  const app = createHttpApp({
    campaignService,
    staticHandler: createStaticHandler(config.publicDir),
    sessionRegistry,
    listaTaskDisponibili,
    elencaCartelleProgetto: () => elencaCartelleProgetto(config.cartelleProgetto),
    automationStore,
    diagnosiFn: () => diagnosi({ chiaveConfigurata: Boolean(config.chiaveApi) }),
    catalogoModelliFn: (opts) => modelCatalog.ottieni(opts),
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
