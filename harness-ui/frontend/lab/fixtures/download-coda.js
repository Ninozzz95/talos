/*
 * Le tre righe del pannello «Download» del mockup (in corso 64% · fallito · completato),
 * nella forma degli stati di `hf-direct-transfer.mjs status()` + manifest della richiesta.
 * Velocità e tempo rimanente come li stima il chiamante fra due letture.
 */
const GB = 1024 ** 3;
export const DOWNLOAD = Object.freeze([
  { id: 'qwen-q8', state: 'running', progress: 64, bytes: Math.round(5.4 * GB), totalBytes: Math.round(8.5 * GB), reason: null, startedAt: '2026-09-05T10:15:00.000Z', request: { repo: 'Qwen/Qwen3-8B-GGUF', files: [{ path: 'Qwen3-8B-Q8_0.gguf' }] } },
  { id: 'gemma-q4', state: 'failed', progress: 15, bytes: Math.round(1.2 * GB), totalBytes: Math.round(8.1 * GB), reason: 'NETWORK', startedAt: '2026-09-05T10:30:00.000Z', request: { repo: 'Community/Gemma-3-12B-GGUF', files: [{ path: 'Gemma-3-12B-Q4_K_M.gguf' }] } },
  { id: 'qwen-q4', state: 'ready', progress: 100, bytes: Math.round(5.2 * GB), totalBytes: Math.round(5.2 * GB), reason: null, startedAt: '2026-09-05T09:50:00.000Z', finishedAt: '2026-09-05T08:21:00.000Z', request: { repo: 'Qwen/Qwen3-8B-GGUF', files: [{ path: 'Qwen3-8B-Q4_K_M.gguf' }] } },
]);
export const STIME_DOWNLOAD = new Map([['qwen-q8', { bytesAlSecondo: 24 * 1024 * 1024, secondiRimanenti: 132 }]]);
