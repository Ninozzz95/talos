import { fileURLToPath } from 'node:url';
import { startPythonWorker } from './engines.mjs';

export async function createNativeHost({ arm, home, sources, bridge, model, sessionId, fixtureDir, record = async () => {} }) {
  const hermesPath = sources?.find(source => source.name === 'hermes')?.path;
  const lcmPath = sources?.find(source => source.name === 'lcm')?.path;
  if (!['hermes','lcm'].includes(arm) || !home || !hermesPath || !bridge?.baseUrl || !bridge?.token || !model || !sessionId || !fixtureDir || (arm === 'lcm' && !lcmPath)) throw new Error('NATIVE_HOST_CONFIGURATION');
  const url = new URL(bridge.baseUrl);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password) throw new Error('NATIVE_HOST_LOOPBACK_REQUIRED');
  const config = { arm, home, hermesPath, lcmPath, baseUrl: bridge.baseUrl, token: bridge.token, model, sessionId, fixtureDir };
  const options = { workerPath: fileURLToPath(new URL('./python-app-worker.py', import.meta.url)) };
  let worker = await startPythonWorker(config, record, options);
  return {
    seed: messages => worker.request('seed', { messages }),
    append: messages => worker.request('append', { messages }),
    compact: (tokens) => worker.request('compact', { tokens }),
    turn: question => worker.request('turn', { question }),
    snapshot: () => worker.request('snapshot'),
    async restart() { await worker.close(); worker = await startPythonWorker(config, record, options); return worker.request('snapshot'); },
    close: () => worker.close(),
  };
}
