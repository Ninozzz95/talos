import { registerHooks } from 'node:module';

if (process.env.TALOS_RIPRESA_ISOLATED !== '1') throw new Error('Il preload di test richiede un banco isolato.');
const memory = new URL('./ripresa-keyring-memory.mjs', import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@napi-rs/keyring') return { url: memory, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
