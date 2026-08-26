import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

import { createCampaignService } from './src/campaign-service.mjs';
import { loadConfig } from './src/config.mjs';
import { readCampaignCosts } from './src/cost-reader.mjs';
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
  });
  const app = createHttpApp({
    campaignService,
    staticHandler: createStaticHandler(config.publicDir),
    sessionRegistry,
    listaTaskDisponibili,
  });
  const server = createServer(app);

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, resolve);
  });

  const shutdown = () => server.close(() => process.exit(0));
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
