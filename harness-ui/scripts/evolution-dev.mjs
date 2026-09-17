// Explicit developer command; never called by normal application startup.
import { createEvolutionDevAdapter } from '../src/evolution-dev-adapter.mjs';
const args = process.argv.slice(2);
const usage = 'node scripts/evolution-dev.mjs --enable-synthetic-evolution-dev <absolute-supervisor.exe> <reviewed-supervisor-sha256> <reviewed-worker-sha256> [--cancel-on-ready]';
if (![4, 5].includes(args.length) || args[0] !== '--enable-synthetic-evolution-dev'
  || (args.length === 5 && args[4] !== '--cancel-on-ready')) {
  console.error(usage); process.exitCode = 64;
} else {
  const adapter = createEvolutionDevAdapter({ enabled: true, supervisorPath: args[1],
    supervisorSha256: args[2], workerSha256: args[3] });
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once('SIGINT', abort); process.once('SIGTERM', abort);
  try {
    const result = await adapter.invoke({ signal: controller.signal,
      onReady: args[4] ? abort : undefined });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(JSON.stringify({ code: error.code ?? 'DEVELOPMENT_COMMAND_FAILED', details: error.details ?? {} }));
    process.exitCode = error.code === 'CANCELLED' ? 130 : 1;
  } finally {
    adapter.dispose(); process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort);
  }
}
