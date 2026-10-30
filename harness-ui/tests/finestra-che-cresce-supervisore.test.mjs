/*
 * ⭐ L1 1.3, revisione blocco 4 (26/10/2026) — la finestra che cresce col SUPERVISORE VERO (`createLlamaServerSupervisor`), processi e
 *   fitter finti. Il banco è quello delle prove rosse del revisore (`revisione-blocco-4-prove-2026-10-26/A3-supervisore-vero.test.mjs`):
 *   - A-2: sul MoE dell'owner (parte a 64K con `--fit`) una finestra DETTA andava a `-ngl 99` e non entrava, e nemmeno il ritorno a prima
 *     ⇒ motore spento. Ora la finestra detta segue la regola di quella di serie, e il ritorno passa dall'avvio di sempre;
 *   - A-7: il motore nuovo partiva prima che il vecchio fosse uscito (la sua memoria sulla scheda);
 *   - A2-4: offline sempre, dalla variabile `LLAMA_ARG_OFFLINE` (revisione blocco 5, A-5: niente `--help` per saperlo).
 */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createLlamaServerSupervisor } from '../src/llama-server-supervisor.mjs';
import { createLlamaServerRuntime } from '../src/local-runtime-llama-server.mjs';
import { creaFinestraCheCresce } from '../src/finestra-che-cresce.mjs';
import { readGgufHeader } from '../src/gguf-header.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function gguf(cartella, { addestrata, esperti } = {}) {
  const parti = [];
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); parti.push(b); };
  const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); parti.push(b); };
  const str = (s) => { const b = Buffer.from(s, 'utf8'); u64(b.length); parti.push(b); };
  const kv = [['general.architecture', 8, 'prova'], ['prova.context_length', 4, addestrata], ['prova.embedding_length', 4, 2048], ['prova.block_count', 4, 24]];
  if (esperti) kv.push(['prova.expert_count', 4, esperti]);
  parti.push(Buffer.from('GGUF', 'ascii')); u32(3); u64(0); u64(kv.length);
  for (const [chiave, tipo, valore] of kv) { str(chiave); u32(tipo); if (tipo === 8) str(valore); else u32(valore); }
  const percorso = join(cartella, esperti ? 'moe.gguf' : 'denso.gguf');
  writeFileSync(percorso, Buffer.concat(parti));
  return percorso;
}

/*
 * La scheda finta: il fitter dice che a nessuna finestra ≥ 64K il modello sta tutto (offload parziale). Con `-ngl 99` un processo a
 * 64K o più muore con ErrorOutOfDeviceMemory; con `--fit` (niente `-ngl`) entra fino a `fitFinoA` compreso.
 */
function banco(t, { esperti = 64, fitFinoA = 262_144, chiudeInRitardoMs = 0, aiuto = '', speculativaNgram = null } = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'fc-supervisore-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const modelPath = gguf(cartella, { addestrata: 262_144, esperti });
  const avvii = []; const eventi = []; const argomenti = []; const ambienti = []; const aiuti = [];
  let vivo = null;
  const spawnImpl = (_b, a, opzioni) => {
    const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter();
    const ctx = Number(a[a.indexOf('-c') + 1]);
    const ngl = a.includes('-ngl') ? a[a.indexOf('-ngl') + 1] : null;
    c.ctx = ctx; c.n = avvii.length + 1;
    avvii.push({ ctx, ngl }); argomenti.push(a); ambienti.push(opzioni?.env ?? null);
    eventi.push(`spawn#${c.n}`);
    c.kill = () => { eventi.push(`kill#${c.n}`); setTimeout(() => { eventi.push(`close#${c.n}`); c.emit('close', 0); }, chiudeInRitardoMs); return true; };
    if ((ngl === '99' && ctx >= 65_536) || (ngl === null && ctx > fitFinoA)) {
      c.condannato = true;
      setTimeout(() => { c.stderr.emit('data', 'ggml_vulkan: ErrorOutOfDeviceMemory\n'); eventi.push(`close#${c.n}`); c.emit('close', 1); }, 5);
    }
    vivo = c;
    return c;
  };
  const fetchImpl = async (url) => {
    if (vivo?.condannato) return { status: 503, ok: false };
    if (String(url).endsWith('/props')) return { status: 200, ok: true, json: async () => ({ default_generation_settings: { n_ctx: vivo.ctx } }) };
    if (String(url).endsWith('/slots')) return new Response(JSON.stringify([{ id: 0, is_processing: false }]), { status: 200 });
    if (String(url).endsWith('/metrics')) return new Response('llamacpp:tokens_predicted_total 3850\nllamacpp:tokens_predicted_seconds_total 100\n', { status: 200 });
    return { status: 200, ok: true };
  };
  const fitter = (_eseguibile, a) => (a.includes('--help') ? (aiuti.push(a), aiuto) : '-c 65536 -ngl 41 -ot "blk\\.38=CPU"');
  const supervisor = createLlamaServerSupervisor({
    binaryPath: 'C:\\talos\\llama-server.exe', motore: { variante: 'vulkan', dispositivi: [] },
    spawnImpl, fetchImpl, portAllocator: async () => 18100, pollIntervalMs: 1, gpuLayers: 99, sondaBinario: fitter, attesaChiusuraMs: 2_000,
    ...(speculativaNgram ? { speculativaNgram } : {}),
  });
  const llama = createLlamaServerRuntime({ supervisor });
  /* `riapri` come server.mjs: l'avvio di sempre, senza finestra detta (la riserva del caricatore, poi la finestra di serie col fitter) */
  const avvioDiSempre = (id) => llama.load({ modelId: id, modelPath, finestraDiRiserva: 16_384 });
  const f = creaFinestraCheCresce({
    supervisor, motore: { load: (o) => llama.load(o), unload: () => llama.unload(), riapri: avvioDiSempre },
    modello: async () => ({ modelPath, nome: 'MoE finto' }), leggiIntestazione: (p) => readGgufHeader(p),
    misuraMacchina: async () => ({ memory: { freeBytes: 64e9 } }), gpuLayers: 99, cartella,
  });
  return { f, supervisor, avvii, eventi, argomenti, ambienti, aiuti, avvioDiSempre };
}

test('FC-SUP-01 (A-2) MoE dell\'owner: alla soglia sale a 96K con `--fit` (esperti sulla CPU), non con `-ngl 99`', async (t) => {
  const b = banco(t);
  await b.avvioDiSempre('m1');
  assert.deepEqual(b.avvii[0], { ctx: 65_536, ngl: null }, 'premessa (L1D-04): 64K con --fit');
  const esito = await b.f.allarga({ modelId: 'm1', servono: 49_200, proattiva: true });
  assert.equal(esito.ok, true, JSON.stringify({ esito, avvii: b.avvii }));
  assert.deepEqual(b.avvii[1], { ctx: 98_304, ngl: null }, 'la finestra detta su un MoE che non sta tutto lascia decidere --fit');
  assert.deepEqual({ state: b.supervisor.status().state, windowTokens: b.supervisor.status().windowTokens }, { state: 'ready', windowTokens: 98_304 });
});

test('FC-SUP-02 (A-2) la finestra più grande non entra nemmeno con `--fit`: il motore torna IDENTICO al primo avvio, acceso', async (t) => {
  const b = banco(t, { fitFinoA: 65_536 });
  await b.avvioDiSempre('m1');
  let errore = null;
  const esito = await b.f.allarga({ modelId: 'm1', servono: 49_200, proattiva: true }).catch((e) => { errore = e; return null; });
  assert.equal(errore, null, `allarga ha lanciato: ${errore?.code}`);
  assert.equal(esito.ok, false);
  assert.deepEqual(b.avvii.at(-1), b.avvii[0], `il ritorno è il primo avvio: ${JSON.stringify(b.avvii)}`);
  assert.deepEqual({ state: b.supervisor.status().state, windowTokens: b.supervisor.status().windowTokens }, { state: 'ready', windowTokens: 65_536 });
});

test('FC-SUP-03 AL CONTRARIO: un modello DENSO con la finestra detta resta a `-ngl 99` (misura del 03/09)', async (t) => {
  const b = banco(t);
  const cartella = mkdtempSync(join(tmpdir(), 'fc-denso-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const denso = gguf(cartella, { addestrata: 131_072 });
  await b.supervisor.start({ modelId: 'd1', modelPath: denso, contextLength: 32_768 });
  assert.deepEqual(b.avvii.at(-1), { ctx: 32_768, ngl: '99' }, 'stesso fitter «non sta tutto», ma il modello non ha esperti');
});

test('FC-SUP-04 (A-7) il motore vecchio è USCITO prima che parta quello più grande', async (t) => {
  const b = banco(t, { chiudeInRitardoMs: 50 });
  await b.avvioDiSempre('m1');
  await b.f.allarga({ modelId: 'm1', servono: 49_200, proattiva: true });
  const i = b.eventi.indexOf('spawn#2'); const j = b.eventi.indexOf('close#1');
  assert.ok(i >= 0 && j >= 0, JSON.stringify(b.eventi));
  assert.ok(j < i, `il secondo llama-server parte prima che il primo sia uscito: ${JSON.stringify(b.eventi)}`);
});

test('FC-SUP-05 (A2-4, A-5) offline dalla variabile, mai dall\'opzione: anche un binario che non la conosce parte', async (t) => {
  const vecchio = banco(t, { aiuto: '--spec-type [none|ngram-mod]\n' });
  await vecchio.avvioDiSempre('m1');
  assert.ok(!vecchio.argomenti[0].includes('--offline'), 'un binario vecchio morirebbe con «unknown argument»');
  assert.equal(vecchio.ambienti[0]?.LLAMA_ARG_OFFLINE, '1', `la variabile arriva al motore (passa l'elenco della politica): ${JSON.stringify(vecchio.ambienti[0])}`);
  const nuovo = banco(t, { aiuto: '--spec-type [none|ngram-mod]\n--offline   Offline mode: forces use of cache, prevents network access\n' });
  await nuovo.avvioDiSempre('m1');
  assert.ok(!nuovo.argomenti[0].includes('--offline'));
  assert.equal(nuovo.ambienti[0]?.LLAMA_ARG_OFFLINE, '1');
});

test('FC-SUP-06 (A-5) con la speculativa spenta il motore parte senza chiedere `--help` al binario', async (t) => {
  const b = banco(t, { speculativaNgram: 'off', aiuto: '--offline   Offline mode\n' });
  await b.avvioDiSempre('m1');
  assert.equal(b.aiuti.length, 0, `--help chiesto ${b.aiuti.length} volte`);
  assert.equal(b.ambienti[0]?.LLAMA_ARG_OFFLINE, '1');
});
