/*
 * 02/11/2026, forma «proiettore nel conto» (`motore-locale/in-corso/FORMA-PROIETTORE-NEL-CONTO-2026-11-02.md`, OK di CLI, Mobile,
 * Performance e Desktop). Il server di llama.cpp aggiunge la memoria del proiettore al margine di --fit
 * (`tools/server/server-context.cpp:1271-1286`, b11960); la sonda `llama-fit-params` no (`tools/fit-params/fit-params.cpp:34-35`).
 * Qui: la sonda riceve lo stesso margine, il motore si apre con `--mmproj`, e la vista non rompe MAI la chat.
 */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createLlamaServerSupervisor, MARGINE_FIT_DI_SERIE_MIB, memoriaDelProiettoreMiB } from '../src/llama-server-supervisor.mjs';
import { createLocalRuntimeProbe } from '../src/local-runtime-probe.mjs';

const MODELLO = 'C:\\models\\vede.gguf';

function childProcess({ righe = [], muore = false } = {}) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kills = [];
  child.kill = (signal) => { child.kills.push(signal); child.emit('close', 0, signal); return true; };
  if (muore) setImmediate(() => { for (const r of righe) child.stderr.emit('data', Buffer.from(`${r}\n`)); child.emit('close', 1, null); });
  return child;
}

const AIUTO = '--spec-type none,ngram-mod';

/* il fitter finto: con `--fit-target` grande (il proiettore nel conto) f16 non ci sta più tutto, q8_0 sì */
function sondaFinta() {
  const chiamate = [];
  const sonda = (eseguibile, argomenti) => {
    chiamate.push({ eseguibile, argomenti });
    if (argomenti.includes('--help')) return AIUTO;
    const conMargine = argomenti.includes('--fit-target');
    if (argomenti.includes('q8_0')) return '-c 16384 -ngl -1';
    return conMargine ? '-c 16384 -ngl 30' : '-c 16384 -ngl -1';
  };
  sonda.chiamate = chiamate;
  return sonda;
}

function proiettoreSulDisco(byte = 4096) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-proiettore-'));
  const path = join(cartella, 'mmproj-F16.gguf');
  writeFileSync(path, Buffer.alloc(byte));
  return { path, bytes: byte };
}

function supervisore({ sonda = sondaFinta(), spawn, fetchImpl = async () => ({ status: 200, ok: true }), binaryPath = 'C:\\talos\\llama-server.exe' } = {}) {
  const lanci = [];
  const logs = [];
  const sup = createLlamaServerSupervisor({
    binaryPath,
    spawnImpl: (_eseguibile, argomenti) => { lanci.push(argomenti); return spawn ? spawn(argomenti, lanci.length) : childProcess(); },
    fetchImpl,
    portAllocator: async () => 18190,
    pollIntervalMs: 1,
    gpuLayers: 99,
    sondaBinario: sonda,
  });
  sup.subscribeLogs((e) => logs.push(e.text));
  return { sup, lanci, logs, sonda };
}

const alFitter = (sonda) => sonda.chiamate.filter((c) => c.eseguibile.includes('fit-params')).map((c) => c.argomenti);

test('PNC-1 col proiettore: la sonda riceve il margine di serie più il doppio del file, il motore riceve --mmproj', async () => {
  const proiettore = proiettoreSulDisco(388_096); // 379 KiB: lo stesso conto del proiettore misurato, in piccolo
  const { sup, lanci, sonda } = supervisore();
  await sup.start({ modelPath: MODELLO, contextLength: 16384, proiettore });
  const atteso = String(MARGINE_FIT_DI_SERIE_MIB + Math.ceil((2 * proiettore.bytes) / (1024 * 1024)));
  for (const argomenti of alFitter(sonda)) assert.deepEqual(argomenti.slice(argomenti.indexOf('--fit-target'), argomenti.indexOf('--fit-target') + 2), ['--fit-target', atteso]);
  const argv = lanci[0];
  assert.deepEqual(argv.slice(argv.indexOf('--mmproj'), argv.indexOf('--mmproj') + 2), ['--mmproj', proiettore.path]);
  assert.equal(sup.status().proiettore, proiettore.path);
  assert.equal(sup.status().vistaSenza, undefined);
});

test('PNC-2 senza proiettore: sonda e motore ricevono gli argomenti di prima (caratterizzazione)', async () => {
  const { sup, lanci, sonda } = supervisore();
  await sup.start({ modelPath: MODELLO, contextLength: 16384 });
  assert.deepEqual(alFitter(sonda)[0], ['-m', MODELLO, '-c', '16384', '-fa', '1']);
  assert.equal(lanci[0].includes('--mmproj'), false);
  assert.equal('proiettore' in sup.status(), false);
});

test('PNC-3 il margine CAMBIA la scelta: col proiettore f16 non ci sta tutto e la cache passa a q8_0', async () => {
  const proiettore = proiettoreSulDisco();
  const senza = supervisore();
  await senza.sup.start({ modelPath: MODELLO, contextLength: 16384 });
  const con = supervisore();
  await con.sup.start({ modelPath: MODELLO, contextLength: 16384, proiettore });
  const tipo = (argv) => argv[argv.indexOf('--cache-type-k') + 1];
  assert.equal(tipo(senza.lanci[0]), 'f16');
  assert.equal(tipo(con.lanci[0]), 'q8_0');
});

/* mutante M8 del 02/11 (chiave della memoria senza il margine) era VIVO: lo stesso supervisore, stesso modello e stessa finestra, prima
   senza e poi con la vista, non deve riusare la scelta fatta senza proiettore */
test('PNC-11 la scelta ricordata senza vista non torna quando lo stesso modello si apre con la vista', async () => {
  const proiettore = proiettoreSulDisco();
  const { sup, lanci, sonda } = supervisore();
  await sup.start({ modelPath: MODELLO, contextLength: 16384 });
  await sup.stop();
  await sup.start({ modelPath: MODELLO, contextLength: 16384, proiettore });
  const tipo = (argv) => argv[argv.indexOf('--cache-type-k') + 1];
  assert.equal(tipo(lanci[0]), 'f16');
  assert.equal(tipo(lanci.at(-1)), 'q8_0');
  assert.ok(alFitter(sonda).some((a) => a.includes('--fit-target')), 'la sonda è stata interrogata di nuovo, col margine della vista');
});

test('PNC-4 la memoria MISURATA dal motore vince sulla stima (condizione di Performance)', () => {
  assert.equal(memoriaDelProiettoreMiB({ bytes: 379 * 1024 * 1024, memoriaMiB: 758.44 }), 759);
  assert.equal(memoriaDelProiettoreMiB({ bytes: 379 * 1024 * 1024 }), 758);
  assert.equal(memoriaDelProiettoreMiB({ bytes: 0 }), 0);
  assert.equal(memoriaDelProiettoreMiB(null), 0);
});

test('PNC-5 proiettore mancante o con un altro peso: si apre SENZA vista e lo si dice (condizione del Mobile)', async () => {
  const sparito = { path: join(mkdtempSync(join(tmpdir(), 'talos-proiettore-')), 'mmproj-F16.gguf'), bytes: 10 };
  const a = supervisore();
  await a.sup.start({ modelPath: MODELLO, contextLength: 16384, proiettore: sparito });
  assert.equal(a.lanci[0].includes('--mmproj'), false);
  assert.match(a.sup.status().vistaSenza, /missing/u);
  assert.ok(a.logs.some((r) => r.includes('image projector not used')));
  const vero = proiettoreSulDisco(100);
  const b = supervisore();
  await b.sup.start({ modelPath: MODELLO, contextLength: 16384, proiettore: { ...vero, bytes: 101 } });
  assert.equal(b.lanci[0].includes('--mmproj'), false);
  assert.match(b.sup.status().vistaSenza, /size is 100 bytes, the download had 101/u);
  assert.equal(b.sup.status().state, 'ready');
});

test('PNC-6 (P5 del Desktop) un proiettore che fa fallire l\'avvio: il modello parte lo stesso, senza vista', async () => {
  const proiettore = proiettoreSulDisco();
  let pronto = false;
  const { sup, lanci, logs } = supervisore({
    spawn: (argv) => (argv.includes('--mmproj') ? childProcess({ righe: ['clip_init: unknown projector type'], muore: true }) : (pronto = true, childProcess())),
    fetchImpl: async () => (pronto ? { status: 200, ok: true } : { status: 503, ok: false }),
  });
  const stato = await sup.start({ modelPath: MODELLO, contextLength: 16384, proiettore });
  assert.equal(stato.state, 'ready');
  assert.equal(lanci.length, 2);
  assert.equal(lanci[0].includes('--mmproj'), true);
  assert.equal(lanci[1].includes('--mmproj'), false);
  assert.match(sup.status().vistaSenza, /did not open with the image projector \(RUNTIME_PROCESS_FAILED\)/u);
  assert.equal('proiettore' in sup.status(), false);
  assert.ok(logs.some((r) => r.includes('opened without it')));
});

test('PNC-7 (condizione della CLI) memoria che non basta col proiettore: si riapre senza, e niente proposta del processore', async () => {
  const proiettore = proiettoreSulDisco();
  let pronto = false;
  const { sup, lanci } = supervisore({
    binaryPath: 'C:\\talos\\llama-server-vulkan.exe',
    spawn: (argv) => (argv.includes('--mmproj') ? childProcess({ righe: ['ggml_vulkan: ErrorOutOfDeviceMemory'], muore: true }) : (pronto = true, childProcess())),
    fetchImpl: async () => (pronto ? { status: 200, ok: true } : { status: 503, ok: false }),
  });
  const stato = await sup.start({ modelPath: MODELLO, contextLength: 16384, proiettore });
  assert.equal(stato.state, 'ready');
  assert.equal(lanci.length, 2);
  assert.match(sup.status().vistaSenza, /RUNTIME_OUT_OF_MEMORY/u);
  assert.equal(sup.status().motore.proposta, null);
});

test('PNC-8 senza vista e con un guasto vero: l\'errore resta quello di sempre, nessun secondo avvio', async () => {
  const { sup, lanci } = supervisore({
    spawn: () => childProcess({ righe: ['some other failure'], muore: true }),
    fetchImpl: async () => ({ status: 503, ok: false }),
  });
  await assert.rejects(sup.start({ modelPath: MODELLO, contextLength: 16384 }), { code: 'RUNTIME_PROCESS_FAILED' });
  assert.equal(lanci.length, 1);
});

test('PNC-10 (condizione del Mobile) il verdetto «entra» conta la vista; senza proiettore il conto resta quello di prima', async () => {
  const header = { magic: 'GGUF', version: 3, trainedContext: 1_000, estimatedWorkingBytes: 8_000 };
  const base = { id: 'vede', state: 'ready', path: 'vede', bytes: 4_000, files: [{ path: 'vede-Q4_K_M.gguf', bytes: 4_000, sha256: 'a'.repeat(64) }] };
  const conVista = { ...base, files: [...base.files, { path: 'mmproj-F16.gguf', bytes: 1024 * 1024, sha256: 'b'.repeat(64) }] };
  const sonda = (manifesto, liberi) => createLocalRuntimeProbe({
    runtime: { probe: async () => ({}), metrics: async () => '', generateStream: async function* () { yield { type: 'done' }; } },
    modelStore: { inspect: async () => structuredClone(manifesto) },
    readHeader: async () => header,
    measureMachine: async () => ({ memory: { totalBytes: 64 * 1024 * 1024, freeBytes: liberi }, storage: { allocatableBytes: 1e12 } }),
    now: () => new Date('2026-11-02T00:00:00.000Z'),
  });
  const senza = await sonda(base, 16_000).inspectModel('vede');
  assert.equal(senza.workingMemoryBytes.value, 8_000);
  assert.equal(senza.projectorMemoryBytes.value, 0);
  const con = await sonda(conVista, 16_000).inspectModel('vede');
  assert.equal(con.projectorMemoryBytes.value, 2 * 1024 * 1024);
  assert.equal(con.workingMemoryBytes.value, 8_000 + 2 * 1024 * 1024);
  /* entra solo senza vista: col proiettore il verdetto lo dice prima dell'apertura */
  assert.notEqual((await sonda(base, 1024 * 1024).fit('vede')).reason, 'memory');
  assert.equal((await sonda(conVista, 1024 * 1024).fit('vede')).reason, 'memory');
});

test('PNC-9 la firma della scheda cambia col proiettore, e senza resta quella di prima', async () => {
  const proiettore = proiettoreSulDisco();
  /* un fitter per cui ci sta sempre tutto: gli argomenti del modello sono identici, la differenza viene SOLO dal proiettore */
  const sempreTutto = () => { const s = (_e, argomenti) => (argomenti.includes('--help') ? AIUTO : '-c 16384 -ngl -1'); s.chiamate = []; return s; };
  const a = supervisore({ sonda: sempreTutto() });
  await a.sup.start({ modelPath: MODELLO, contextLength: 16384 });
  const b = supervisore({ sonda: sempreTutto() });
  await b.sup.start({ modelPath: MODELLO, contextLength: 16384 });
  const c = supervisore({ sonda: sempreTutto() });
  await c.sup.start({ modelPath: MODELLO, contextLength: 16384, proiettore });
  assert.equal(a.sup.status().firmaScheda, b.sup.status().firmaScheda);
  assert.notEqual(a.sup.status().firmaScheda, c.sup.status().firmaScheda);
});

/*
 * Revisione avversaria della CLI, 02/11 mattina (sezione «Revisione avversaria della CLI» della forma): tre difetti provati sul codice vero.
 * Le prove qui sotto sono nel verso della CURA: rosse sul commit cd90c7295, verdi dopo.
 */
function figlioCheChiude({ righe = [], muore = false } = {}) {
  const c = childProcess({ righe, muore });
  c.kill = (s) => { c.kills.push(s); setImmediate(() => c.emit('close', 0, s)); return true; };
  return c;
}

test('PNC-12 (R3, S2) la vista fa perdere la scheda: si riprova la SCHEDA senza vista prima del processore', async () => {
  const lanci = [];
  let pronto = false;
  const sup = createLlamaServerSupervisor({
    binaryPath: 'C:/talos/llama-server-vulkan.exe', fallbackBinaryPath: 'C:/talos/llama-server-cpu.exe',
    spawnImpl: (e, a) => {
      lanci.push({ e, a });
      if (e.includes('vulkan') && a.includes('--mmproj')) return figlioCheChiude({ righe: ['ggml_vulkan: ErrorDeviceLost'], muore: true });
      pronto = true; return figlioCheChiude();
    },
    fetchImpl: async () => (pronto ? { status: 200, ok: true } : { status: 503, ok: false }),
    portAllocator: async () => 18192, pollIntervalMs: 1, gpuLayers: 99, sondaBinario: sondaFinta(),
  });
  const stato = await sup.start({ modelPath: MODELLO, contextLength: 16384, proiettore: proiettoreSulDisco() });
  assert.equal(stato.state, 'ready');
  assert.equal(lanci.length, 2);
  assert.match(lanci[1].e, /vulkan/u, 'il secondo avvio è sulla scheda, non sul processore');
  assert.equal(lanci[1].a.includes('--mmproj'), false, 'e senza vista');
  assert.equal(sup.status().motore?.variante, 'vulkan');
  assert.match(sup.status().vistaSenza ?? '', /without/u);
});

test('PNC-13 (R3, il verso contrario) la scheda che non c\'è (driver): dritti al processore, la vista resta', async () => {
  const lanci = [];
  let pronto = false;
  const sup = createLlamaServerSupervisor({
    binaryPath: 'C:/talos/llama-server-vulkan.exe', fallbackBinaryPath: 'C:/talos/llama-server-cpu.exe',
    spawnImpl: (e, a) => {
      lanci.push({ e, a });
      if (e.includes('vulkan')) return figlioCheChiude({ righe: ['ggml_vulkan: No devices found'], muore: true });
      pronto = true; return figlioCheChiude();
    },
    fetchImpl: async () => (pronto ? { status: 200, ok: true } : { status: 503, ok: false }),
    portAllocator: async () => 18193, pollIntervalMs: 1, gpuLayers: 99, sondaBinario: sondaFinta(),
  });
  await sup.start({ modelPath: MODELLO, contextLength: 16384, proiettore: proiettoreSulDisco() });
  assert.equal(lanci.length, 2);
  assert.match(lanci[1].e, /cpu/u);
  assert.equal(lanci[1].a.includes('--mmproj'), true, 'senza scheda il processore porta la vista: il proiettore non c\'entra');
});

test('PNC-14 (R1, S3) col proiettore il motore resta muto (tempo scaduto): si riapre senza vista', async () => {
  let senzaVista = false;
  const lanci = [];
  const sup = createLlamaServerSupervisor({
    binaryPath: 'C:\talos\llama-server.exe',
    spawnImpl: (_e, a) => { lanci.push(a); if (!a.includes('--mmproj')) senzaVista = true; return figlioCheChiude(); },
    fetchImpl: async () => (senzaVista ? { status: 200, ok: true } : { status: 503, ok: false }),
    portAllocator: async () => 18194, pollIntervalMs: 1, gpuLayers: 99, sondaBinario: sondaFinta(), healthTimeoutMs: 200,
  });
  const stato = await sup.start({ modelPath: MODELLO, contextLength: 16384, proiettore: proiettoreSulDisco() });
  assert.equal(stato.state, 'ready');
  assert.equal(lanci.length, 2);
  assert.equal(lanci[1].includes('--mmproj'), false);
  assert.match(sup.status().vistaSenza ?? '', /RUNTIME_HEALTH_TIMEOUT/u);
});

test('PNC-15 (R2, S4) un guasto che resta anche senza vista: il registro dice che non è colpa del proiettore', async () => {
  const { sup, logs } = supervisore({ spawn: () => childProcess({ righe: ['some other failure'], muore: true }), fetchImpl: async () => ({ status: 503, ok: false }) });
  await assert.rejects(sup.start({ modelPath: MODELLO, contextLength: 16384, proiettore: proiettoreSulDisco() }), { code: 'RUNTIME_PROCESS_FAILED' });
  assert.ok(logs.some((r) => /trying again without it/u.test(r)), 'la prima riga dice che si riprova, non che si è aperto');
  assert.ok(!logs.some((r) => /opened without it/u.test(r)), 'nessuna riga dice «aperto senza» quando non si è aperto');
  assert.ok(logs.some((r) => /not from the image projector/u.test(r)), 'la seconda riga toglie la colpa alla vista');
});

test('PNC-16 (non verificato (a) della CLI) un percorso del proiettore non assoluto: niente vista, ma il motivo è scritto', async () => {
  const { sup, lanci } = supervisore();
  await sup.start({ modelPath: MODELLO, contextLength: 16384, proiettore: { path: 'mmproj-F16.gguf', bytes: 4096 } });
  assert.equal(lanci[0].includes('--mmproj'), false);
  assert.match(sup.status().vistaSenza ?? '', /not absolute/u);
});
