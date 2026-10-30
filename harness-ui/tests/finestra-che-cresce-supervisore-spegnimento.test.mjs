/*
 * ⭐ L1 1.3, revisione blocco 6 (A-R4): `stop()` non aspetta, e nemmeno durante una riapertura — l'attesa del motore fermato dentro il
 *   prossimo `start()` ascolta l'annullamento. Prova del revisore (`handoff/revisione-blocco-6-prove-2026-10-26/A-supervisore.test.mjs`).
 *   Supervisore vero, processi finti. Nessuna porta, nessun motore vero.
 */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const imp = (p) => import(new URL(`../${p}`, import.meta.url).href);
const { createLlamaServerSupervisor } = await imp('src/llama-server-supervisor.mjs');
const { rimuoviCartellaDiProva } = await imp('tests/aiuto/rimuovi-cartella-di-prova.mjs');

const cartellaTemp = (t, prefisso) => { const c = mkdtempSync(join(tmpdir(), prefisso)); t.after(() => rimuoviCartellaDiProva(c)); return c; };
function gguf(cartella) {
  const parti = [];
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); parti.push(b); };
  const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); parti.push(b); };
  const str = (s) => { const b = Buffer.from(s, 'utf8'); u64(b.length); parti.push(b); };
  const kv = [['general.architecture', 8, 'prova'], ['prova.context_length', 4, 32_768], ['prova.embedding_length', 4, 2048], ['prova.block_count', 4, 24]];
  parti.push(Buffer.from('GGUF', 'ascii')); u32(3); u64(0); u64(kv.length);
  for (const [chiave, tipo, valore] of kv) { str(chiave); u32(tipo); if (tipo === 8) str(valore); else u32(valore); }
  const percorso = join(cartella, 'm.gguf');
  writeFileSync(percorso, Buffer.concat(parti));
  return percorso;
}

test('REV-B6-A6 spegnimento DURANTE una riapertura (stop dopo stop, il secondo avvio aspetta il vecchio): stop() torna subito, non dopo l\'attesa della chiusura', async (t) => {
  const cartella = cartellaTemp(t, 'rev-b6-a6-');
  const modelPath = gguf(cartella);
  const figli = [];
  const supervisor = createLlamaServerSupervisor({
    binaryPath: 'C:\\talos\\llama-server.exe', motore: { variante: 'cpu', dispositivi: [] },
    spawnImpl: () => { const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.kill = () => true; figli.push(c); return c; },
    fetchImpl: async (url) => (String(url).endsWith('/props') ? { status: 200, ok: true, json: async () => ({ default_generation_settings: { n_ctx: 8192 } }) } : { status: 200, ok: true }),
    portAllocator: async () => 18111, pollIntervalMs: 1, gpuLayers: 0, sondaBinario: async () => '',
  });
  /* il motore acceso; la finestra che cresce lo scarica (stop: non aspetta) e lo ricarica (start: aspetta che il vecchio esca) */
  await supervisor.start({ modelId: 'm1', modelPath, contextLength: 8_192 });
  await supervisor.stop();
  const ricarica = supervisor.start({ modelId: 'm1', modelPath, contextLength: 16_384 }).catch((e) => e);
  await new Promise((r) => setTimeout(r, 50));
  /* adesso l'app si spegne: server.mjs chiude i motori (unload ⇒ stop) PRIMA del flush del registro, e il guscio uccide a 5 s */
  const tieni = setInterval(() => {}, 1_000);
  const t0 = Date.now();
  try { await supervisor.stop(); } finally { clearInterval(tieni); }
  const durata = Date.now() - t0;
  figli[0].emit('close', 0);
  const esito = await ricarica;
  t.diagnostic(`stop() durante la ricarica è tornato dopo ${durata} ms; la ricarica: ${esito?.code ?? 'avviata'}`);
  assert.ok(durata < 1_000, `stop() ha aspettato ${durata} ms: l'avvio in corso aspetta la chiusura del motore vecchio senza ascoltare l'annullamento (aspettaChiusura, fino a 5 s), e stop() aspetta lui (operation.done) — è la stessa attesa che A-6 voleva togliere dallo spegnimento`);
});
