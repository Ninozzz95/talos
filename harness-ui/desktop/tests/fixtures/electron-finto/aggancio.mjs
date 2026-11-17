/*
 * Giro di sicurezza 4 (11/11/2026; controllore del giro 3, reperto C2) — l'aggancio di Node che fa trovare a `main.mjs` un `electron` FINTO
 * (`./electron.mjs`). Così `main.mjs` gira davvero, sotto Node e senza Chromium, e una prova vede i suoi fili (`main-collegamenti.test.mjs`).
 * Hooks di personalizzazione dei moduli di Node (`module.register`, `resolve`): docs nodejs.org/api/module.html, «Customization Hooks».
 */
const FINTO = new URL('./electron.mjs', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'electron') return { url: FINTO, shortCircuit: true };
  return nextResolve(specifier, context);
}
