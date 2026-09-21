// Solo prova: il checkout context-engine non possiede node_modules.
import { registerHooks, createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'zod' && context.parentURL?.includes('/context-engine/')) {
    return { url: pathToFileURL(require.resolve('zod')).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
} });
