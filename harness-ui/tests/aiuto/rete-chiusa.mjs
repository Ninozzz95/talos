/*
 * 11/11/2026 (giro dopo i revisori della soglia, punto 2): per le prove che avviano `server.mjs` vero con `--import`. Ogni richiesta
 * fuori da 127.0.0.1 fallisce subito, come una rete giù: `/endpoints` e i cataloghi dei modelli non rispondono, e nessun byte esce
 * dalla macchina (zero dollari, nessuna chiave). La forma è quella delle sonde dei revisori (`rete-finta.mjs`), senza copione.
 */
const veroFetch = globalThis.fetch;
const LOCALE = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\//u;
globalThis.fetch = async function fetchConLaReteChiusa(input, init) {
  const url = typeof input === 'string' ? input : input?.url ?? String(input);
  if (LOCALE.test(url)) return veroFetch(input, init);
  throw Object.assign(new TypeError(`rete chiusa nella prova: ${new URL(url).host}`), { code: 'ECONNREFUSED' });
};
