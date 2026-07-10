import { startBrowserWorker } from "./startBrowserWorker.js";

startBrowserWorker().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Browser worker startup failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
