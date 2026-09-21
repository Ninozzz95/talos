/*
 * I due repository del pannello «Hugging Face» del mockup e il dettaglio di Qwen3 8B
 * con tre varianti, nella forma dei dati del monolite (`/api/v1/huggingface/search`
 * items, dettaglio con files[{path,sizeBytes,sha256}], stima per variante di
 * `/api/v1/local-models/fit-estimate`). Le cifre sono quelle scritte nel mockup.
 */
const GB = 1024 ** 3;
export const RISULTATI_HF = Object.freeze([
  { repo: 'Qwen/Qwen3-8B-GGUF', downloads: 412_000, likes: 980, gated: false, license: 'Apache 2.0', pipelineTag: 'text-generation', ggufFiles: 3 },
  { repo: 'Community/Gemma-3-12B-GGUF', downloads: 51_000, likes: 120, gated: true, license: 'Gemma', pipelineTag: 'text-generation', ggufFiles: 2, communityConversion: true },
]);
export const DETTAGLIO_HF = Object.freeze({
  repo: 'Qwen/Qwen3-8B-GGUF', revision: '', license: 'Apache 2.0', gated: false, downloads: 412_000, likes: 980, pipelineTag: 'text-generation',
  files: [
    { path: 'Qwen3-8B-Q4_K_M.gguf', sizeBytes: Math.round(5.2 * GB), sha256: 'a'.repeat(64) },
    { path: 'Qwen3-8B-Q8_0.gguf', sizeBytes: Math.round(8.5 * GB), sha256: 'b'.repeat(64) },
    { path: 'Qwen3-8B-F16.gguf', sizeBytes: Math.round(16.4 * GB), sha256: 'c'.repeat(64) },
    { path: 'README.md', sizeBytes: 12_000, sha256: null },
  ],
  readme: '# Qwen3 8B\n\nModello per conversazione e codice.',
});
export const STIMA_HF = new Map([
  ['Qwen3-8B-Q4_K_M.gguf', { state: 'compatible', reason: 'fits', memory: { requiredBytes: Math.round(8.1 * GB), availableBytes: Math.round(18.6 * GB) } }],
  ['Qwen3-8B-Q8_0.gguf', { state: 'compatible', reason: 'fits', memory: { requiredBytes: Math.round(11.4 * GB), availableBytes: Math.round(18.6 * GB) } }],
  ['Qwen3-8B-F16.gguf', { state: 'blocked', reason: 'memory', memory: { requiredBytes: Math.round(19.3 * GB), availableBytes: Math.round(18.6 * GB) } }],
]);
