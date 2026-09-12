import { mkdirSync, mkdtempSync, cpSync, copyFileSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const attendi = ms => new Promise(r => setTimeout(r, ms));

export function preparaRuntime(nome) {
  mkdirSync(join(root, '.prove'), { recursive: true });
  const dataDir = mkdtempSync(join(root, '.prove', nome + '-'));
  const runtime = join(dataDir, 'harness-ui');
  mkdirSync(runtime);
  copyFileSync(join(root, '..', 'server.mjs'), join(runtime, 'server.mjs'));
  cpSync(join(root, '..', 'src'), join(runtime, 'src'), { recursive: true });
  for (const nome of ['public', 'node_modules']) symlinkSync(join(root, '..', nome), join(runtime, nome), 'junction');
  const contesto = join(dataDir, 'context-engine');
  mkdirSync(contesto);
  copyFileSync(join(root, '..', '..', 'context-engine', 'package.json'), join(contesto, 'package.json'));
  cpSync(join(root, '..', '..', 'context-engine', 'src'), join(contesto, 'src'), { recursive: true });
  symlinkSync(join(root, '..', 'node_modules'), join(contesto, 'node_modules'), 'junction');
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/KEY|TOKEN|SECRET|PASSWORD|TALOS_|NODE_OPTIONS|ELECTRON_RUN_AS_NODE/i.test(k)));
  Object.assign(env, { TALOS_DESKTOP_DATA_DIR: dataDir, TALOS_DESKTOP_HARNESS_DIR: runtime, TALOS_INTRO: '0' });
  return { dataDir, runtime, env };
}
