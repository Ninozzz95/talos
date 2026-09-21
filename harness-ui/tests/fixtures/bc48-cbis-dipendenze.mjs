// Worktree isolato: context-engine richiede lo stesso zod 4.5.4 di harness-ui.
// Nessuna sostituzione di comportamento; solo risoluzione del pacchetto installato.
import { registerHooks } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const padreHarness = new URL('../../package.json', import.meta.url).href;
const adapterUrl = new URL('../../src/runtime-owner-adapter.mjs', import.meta.url).href;
const adapterOriginale = process.env.BC48_ADAPTER_ORIGINALE === '1'
  ? execFileSync('git', ['show', '617407e76c7e93c8c08fda9911421ce1e3f59c96:harness-ui/src/runtime-owner-adapter.mjs'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8', windowsHide: true,
  }) : null;
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'zod' && context.parentURL?.includes('/context-engine/')) {
    try { return nextResolve(specifier, context); }
    catch (errore) {
      if (errore.code !== 'ERR_MODULE_NOT_FOUND') throw errore;
      return nextResolve(specifier, { ...context, parentURL: padreHarness });
    }
  }
  return nextResolve(specifier, context);
}, load(url, context, nextLoad) {
  return adapterOriginale && url === adapterUrl
    ? { format: 'module', source: adapterOriginale, shortCircuit: true }
    : nextLoad(url, context);
} });
