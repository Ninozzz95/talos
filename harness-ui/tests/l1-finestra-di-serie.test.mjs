/*
 * L1-d del motore locale (owner 20/10/2026: «finestra calcolata dal GGUF, ≥64K quando la memoria basta, `-c` sempre passato»).
 * LFM2.5-24B (128K addestrati) partiva a 16.384 sulla RX 9070 XT dell'owner: la banda del caricatore di `server.mjs`
 * (revisione avversaria del 20/10, T1). Ora sulla scheda il caricatore dà la sua banda come RISERVA e il supervisore sceglie:
 *   tutto sulla scheda al pavimento di 64K ⇒ `-c 65536` + `-ngl 99` · MoE che non ci sta ⇒ `-c 65536` + `--fit`
 *   · denso che non ci sta / fitter muto / file illeggibile ⇒ la RISERVA e `-ngl 99`, cioè esattamente come prima.
 * Revisione T4: se la scheda rifiuta la finestra scelta da NOI, un solo nuovo tentativo con la riserva.
 */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createLlamaServerSupervisor, decidiTipoKvCache, finestraDiSerie, FINESTRA_DI_SERIE } from '../src/llama-server-supervisor.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const RISERVA = 16_384; // la banda che `server.mjs` dà con la scheda, per un modello da 128K

/* Un GGUF v3 di sola intestazione: abbastanza per `readGgufHeader`. */
function gguf({ addestrata, esperti } = {}) {
  const parti = [];
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); parti.push(b); };
  const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); parti.push(b); };
  const str = (s) => { const b = Buffer.from(s, 'utf8'); u64(b.length); parti.push(b); };
  const kv = [['general.architecture', 8, 'prova'], ['prova.context_length', 4, addestrata], ['prova.embedding_length', 4, 2048], ['prova.block_count', 4, 24]];
  if (esperti) kv.push(['prova.expert_count', 4, esperti]);
  parti.push(Buffer.from('GGUF', 'ascii')); u32(3); u64(0); u64(kv.length);
  for (const [chiave, tipo, valore] of kv) { str(chiave); u32(tipo); if (tipo === 8) str(valore); else u32(valore); }
  const cartella = mkdtempSync(join(tmpdir(), 'talos-l1d-'));
  const percorso = join(cartella, 'modello.gguf');
  writeFileSync(percorso, Buffer.concat(parti));
  return { percorso, via: () => rimuoviCartellaDiProva(cartella) };
}

function figlio() {
  const c = new EventEmitter();
  c.stdout = new EventEmitter(); c.stderr = new EventEmitter();
  c.kill = () => { c.emit('close', 0); return true; };
  return c;
}

/** Il fitter finto: risposta per valore di `-c` (`'65536'`, `'16384'`…), e per q8_0 se diversa. */
function fitter({ a64k = '', a64kQ8 = a64k, allaRiserva = '-c 16384 -ngl -1' } = {}) {
  const chiamate = [];
  const sonda = (_eseguibile, argomenti) => {
    chiamate.push(argomenti);
    if (argomenti.includes('--help')) return '';
    const c = argomenti.includes('-c') ? argomenti[argomenti.indexOf('-c') + 1] : null;
    if (c === String(FINESTRA_DI_SERIE)) return argomenti.includes('q8_0') ? a64kQ8 : a64k;
    return allaRiserva;
  };
  sonda.chiamate = chiamate;
  return sonda;
}

async function avvia({ file, sonda, contextLength, riserva = RISERVA, spawn } = {}) {
  const argvs = []; const log = [];
  let ultimo = null;
  const s = createLlamaServerSupervisor({
    binaryPath: 'C:\\talos\\llama-server.exe', motore: { variante: 'vulkan', dispositivi: [] },
    spawnImpl: (_b, a) => { argvs.push(a); ultimo = spawn ? spawn(a) : figlio(); return ultimo; },
    // un processo destinato a morire non risponde mai «pronto»: come il llama-server vero che sta ancora caricando
    fetchImpl: async () => (ultimo?.condannato ? { status: 503, ok: false } : { status: 200, ok: true }),
    portAllocator: async () => 18100, pollIntervalMs: 1, gpuLayers: 99, sondaBinario: sonda,
  });
  s.subscribeLogs((r) => log.push(r.text));
  // come `server.mjs`: con la scheda la finestra è una RISERVA, non una scelta
  await s.start({ modelPath: file, ...(contextLength ? { contextLength } : {}), ...(riserva ? { finestraDiRiserva: riserva } : {}) });
  const argv = argvs.at(-1);
  const valore = (flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null);
  return { argvs, c: valore('-c'), ngl: valore('-ngl'), kv: valore('--cache-type-k'), log: log.join('') };
}

test('L1D-01 la finestra di serie: il pavimento di 64K, mai oltre l\'addestrato; MoE dal numero di esperti; file illeggibile = niente', async () => {
  const intestazione = (h) => ({ leggiIntestazione: async () => h });
  assert.deepEqual((await finestraDiSerie('x', intestazione({ trainedContext: 131072, expertCount: 64 }))).finestra, FINESTRA_DI_SERIE);
  assert.equal((await finestraDiSerie('x', intestazione({ trainedContext: 131072, expertCount: 64 }))).moe, true);
  assert.equal((await finestraDiSerie('x', intestazione({ trainedContext: 8192 }))).finestra, 8192);
  assert.equal((await finestraDiSerie('x', intestazione({ trainedContext: 8192 }))).moe, false);
  assert.equal((await finestraDiSerie('x', intestazione({ trainedContext: 131072, expertCount: 1 }))).moe, false, 'un solo esperto non è un MoE');
  assert.equal(await finestraDiSerie('x', { leggiIntestazione: async () => { throw new Error('rotto'); } }), null);
  assert.equal(await finestraDiSerie('x', intestazione({})), null);
});

test('L1D-02 decidiTipoKvCache dice se ci sta tutto: sì, no, o non lo so (fitter muto)', () => {
  assert.equal(decidiTipoKvCache({ nglConF16: 'tutto' }).tuttoSullaScheda, true);
  assert.equal(decidiTipoKvCache({ nglConF16: 30, nglConQ8: 'tutto' }).tuttoSullaScheda, true);
  assert.equal(decidiTipoKvCache({ nglConF16: 41, nglConQ8: 41 }).tuttoSullaScheda, false);
  assert.equal(decidiTipoKvCache({ nglConF16: null }).tuttoSullaScheda, undefined);
  assert.equal(decidiTipoKvCache({ nglConF16: 30, nglConQ8: null }).tuttoSullaScheda, undefined);
});

test('L1D-03 ci sta tutto alla finestra di serie ⇒ `-c 65536` e `-ngl 99` (anche se il caricatore offre una riserva più piccola)', async () => {
  const f = gguf({ addestrata: 131072, esperti: 64 });
  try {
    const r = await avvia({ file: f.percorso, sonda: fitter({ a64k: '-c 65536 -ngl 30', a64kQ8: '-c 65536 -ngl -1' }) });
    assert.equal(r.c, '65536'); assert.equal(r.ngl, '99'); assert.equal(r.kv, 'q8_0');
    assert.match(r.log, /context window 65536/u);
  } finally { f.via(); }
});

test('L1D-04 il caso dell\'owner: un MoE che non ci sta per intero ⇒ `-c 65536` e decide --fit (niente -ngl)', async () => {
  const f = gguf({ addestrata: 131072, esperti: 64 });
  try {
    const r = await avvia({ file: f.percorso, sonda: fitter({ a64k: '-c 65536 -ngl 41 -ot "blk\\.38=CPU"' }) });
    assert.equal(r.c, '65536'); assert.equal(r.ngl, null); assert.equal(r.kv, 'q8_0');
    assert.match(r.log, /chosen by --fit/u);
  } finally { f.via(); }
});

test('L1D-05 al contrario: un modello DENSO che non ci sta resta come prima — la riserva del caricatore e `-ngl 99`', async () => {
  const f = gguf({ addestrata: 131072 });
  try {
    const sonda = fitter({ a64k: '-c 65536 -ngl 30', allaRiserva: '-c 16384 -ngl -1' });
    const r = await avvia({ file: f.percorso, sonda });
    assert.equal(r.c, String(RISERVA)); assert.equal(r.ngl, '99'); assert.equal(r.kv, 'f16', 'alla riserva il fitter dice «tutto» con f16, come oggi');
    assert.ok(sonda.chiamate.some((a) => a.includes(String(RISERVA))), 'la seconda domanda al fitter è alla riserva');
    assert.doesNotMatch(r.log, /context window/u);
  } finally { f.via(); }
});

test('L1D-06 al contrario: fitter muto, finestra chiesta da chi carica, file illeggibile ⇒ come prima', async () => {
  const f = gguf({ addestrata: 131072, esperti: 64 });
  try {
    const muto = await avvia({ file: f.percorso, sonda: fitter({ a64k: '', allaRiserva: '' }) });
    assert.equal(muto.c, String(RISERVA)); assert.equal(muto.ngl, '99');
    const chiesta = await avvia({ file: f.percorso, sonda: fitter({ a64k: '-c 65536 -ngl -1' }), contextLength: 8192 });
    assert.equal(chiesta.c, '8192'); assert.equal(chiesta.ngl, '99', 'una finestra chiesta da chi carica resta la regola di prima');
  } finally { f.via(); }
  const assente = await avvia({ file: join(tmpdir(), 'non-esiste-l1d.gguf'), sonda: fitter({ a64k: '-c 65536 -ngl -1' }) });
  assert.equal(assente.c, String(RISERVA)); assert.equal(assente.ngl, '99');
});

/* Un motore che a 64K muore con «memoria piena» della scheda, e alla riserva parte. */
const memoriaPienaA64k = (a) => {
  const c = figlio();
  if (a.includes(String(FINESTRA_DI_SERIE))) {
    c.condannato = true;
    setTimeout(() => { c.stderr.emit('data', 'ggml_vulkan: ErrorOutOfDeviceMemory\n'); c.emit('close', 1); }, 5);
  }
  return c;
};

test('L1D-07 (revisione T4) la scheda rifiuta la finestra scelta da noi ⇒ un solo nuovo tentativo con la riserva, e lo dice', async () => {
  const f = gguf({ addestrata: 131072, esperti: 64 });
  try {
    const r = await avvia({ file: f.percorso, sonda: fitter({ a64k: '-c 65536 -ngl -1' }), spawn: memoriaPienaA64k });
    assert.equal(r.argvs.length, 2, 'due avvii: 64K, poi la riserva');
    assert.equal(r.c, String(RISERVA)); assert.equal(r.ngl, '99');
    assert.match(r.log, /refused the 65536 window: loading again with 16384/u);
  } finally { f.via(); }
});

test('L1D-08 al contrario: una finestra chiesta da chi carica e rifiutata dalla scheda NON si ritenta: la carta di memoria piena di sempre', async () => {
  const f = gguf({ addestrata: 131072, esperti: 64 });
  try {
    await assert.rejects(avvia({ file: f.percorso, sonda: fitter({ a64k: '-c 65536 -ngl -1' }), contextLength: FINESTRA_DI_SERIE, spawn: memoriaPienaA64k }),
      (e) => /memory|memoria/iu.test(`${e.code} ${e.message}`));
  } finally { f.via(); }
});

test('L1D-09 (quarta revisione D2) un modello addestrato sotto la riserva tiene la riserva di sempre, non scende all\'addestrato', async () => {
  const f = gguf({ addestrata: 4096, esperti: 64 });
  try {
    const r = await avvia({ file: f.percorso, sonda: fitter({ allaRiserva: '-c 8192 -ngl -1' }), riserva: 8192 });
    assert.equal(r.c, '8192'); assert.equal(r.ngl, '99');
    assert.doesNotMatch(r.log, /context window/u, 'nessuna finestra di serie annunciata');
  } finally { f.via(); }
});
