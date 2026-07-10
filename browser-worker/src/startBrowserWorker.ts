import type { FastifyInstance } from "fastify";
import { buildServer } from "./server.js";

export type BrowserWorkerStartOptions = {
  host?: string;
  port?: number;
  internalToken?: string;
};

export async function startBrowserWorker(options: BrowserWorkerStartOptions = {}): Promise<FastifyInstance> {
  const app = buildServer({
    internalToken: options.internalToken ?? process.env.TALOS_BROWSER_WORKER_TOKEN,
  });
  await app.listen({
    host: options.host ?? process.env.HOST ?? "127.0.0.1",
    port: options.port ?? Number(process.env.PORT || 3000),
  });

  return app;
}
