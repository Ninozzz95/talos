/*
 * I tre modelli del pannello «Installati» del mockup (Qwen3 8B caricato · Gemma 3 12B sul
 * disco · Qwen3 32B sul disco), nella forma dei dati del monolite: manifest di
 * `/api/v1/local-models` + `name`, il runtime (cosa è caricato, RAM) e i verdetti di
 * `state.modelLab.fit` (Map id → { esito } con `esito.memory.{requiredBytes,availableBytes}`
 * come li scrive `local-runtime-probe.mjs`). Le cifre sono quelle scritte nel mockup.
 */
const GB = 1024 ** 3;
const manifest = (id, name, repo, bytes, file, extra = {}) => ({
  id, name, repo, revision: 'a'.repeat(40), state: 'ready', license: 'Apache 2.0', bytes, path: `${id}/${file}`,
  files: [{ path: file, bytes, sha256: 'a'.repeat(64) }], sha256: 'a'.repeat(64), updatedAt: '2026-09-05T20:00:00.000Z', ...extra,
});

export const MODELLI_INSTALLATI = Object.freeze([
  manifest('qwen8', 'Qwen3 8B', 'Qwen/Qwen3-8B-GGUF', Math.round(5.2 * GB), 'Qwen3-8B-Q4_K_M.gguf', { contextLength: 32768 }),
  manifest('gemma', 'Gemma 3 12B', 'google/gemma-3-12b-it-GGUF', Math.round(8.1 * GB), 'gemma-3-12b-Q4_K_M.gguf', { contextLength: 131072, license: 'Gemma' }),
  manifest('qwen32', 'Qwen3 32B', 'Qwen/Qwen3-32B-GGUF', Math.round(19.8 * GB), 'Qwen3-32B-Q4_K_M.gguf', { contextLength: 32768 }),
]);

/** Cosa sa il monolite del motore locale: modello caricato, RAM totale/usata/libera, allocabile, contesto della stima. */
export const RUNTIME_INSTALLATI = Object.freeze({
  caricato: 'qwen8',
  ramTotaleBytes: 32 * GB,
  usatiDalModelloBytes: Math.round(8.1 * GB),
  liberiBytes: Math.round(10.5 * GB),
  allocabiliBytes: Math.round(18.6 * GB),
  contestoStimaToken: 8192,
});

/** Verdetti «Entra» come li tiene `state.modelLab.fit`. */
export const FIT_INSTALLATI = new Map([
  ['qwen8', { esito: { state: 'compatible', reason: 'fits', memory: { requiredBytes: Math.round(8.1 * GB), availableBytes: Math.round(18.6 * GB) } } }],
  ['gemma', { esito: { state: 'compatible', reason: 'fits', memory: { requiredBytes: Math.round(17.8 * GB), availableBytes: Math.round(18.6 * GB) } } }],
  ['qwen32', { esito: { state: 'incompatible', reason: 'memory', memory: { requiredBytes: Math.round(23.9 * GB), availableBytes: Math.round(18.6 * GB) } } }],
]);
