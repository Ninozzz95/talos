/*
 * 02/11/2026, form «proiettore nel conto» (OK of CLI, Mobile, Performance, Desktop; owner: «vista sempre»), point 3: «the same for the
 * direct road and for the router (the same argument in the preset entry)». The direct road is 7326358e6 + cd90c7295 + 9c31e97b4; this is
 * the router. Fake router and fake standalone (`tests/aiuto/router-finto.mjs`), today's supervisor REAL inside the router supervisor.
 *   PR-1 the preset section carries `mmproj`, and the fitter got the projector margin
 *   PR-2 a projector missing on the disk: no `mmproj`, said in the log; without a projector the section is today's
 *   PR-3 the router cannot load the model with the projector ⇒ today's engine takes it WITH the projector (its own retry stays)
 *   PR-4 a projector path the INI cannot hold ⇒ today's engine, with the projector
 *   PR-5 the router's status says the projector in use
 *   PR-6 decision 1 (models together) counts the projector memory
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createLlamaServerSupervisor } from '../src/llama-server-supervisor.mjs';
import { createLlamaRouterSupervisor } from '../src/llama-router-supervisor.mjs';
import { creaRouterFinto, leggiIni } from './aiuto/router-finto.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const BIN = 'C:\\talos\\llama-server.exe';

function prepara(t, { memoria = null, leggiIntestazione, ...finto } = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'router-vista-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const a = join(cartella, 'a.gguf');
  const b = join(cartella, 'b.gguf');
  writeFileSync(a, 'GGUF-finto-a');
  writeFileSync(b, 'GGUF-finto-b');
  const proiettore = { path: join(cartella, 'mmproj-F16.gguf'), bytes: 4096 };
  writeFileSync(proiettore.path, Buffer.alloc(4096));
  const banco = creaRouterFinto(finto);
  const fitter = [];
  const sonda = (_eseguibile, args) => { if (args.includes('--help')) return '--spec-type none,ngram-mod'; fitter.push(args); return '-c 8192 -ngl -1'; };
  const standalone = createLlamaServerSupervisor({ binaryPath: BIN, spawnImpl: banco.spawnImpl, fetchImpl: banco.fetchImpl, portAllocator: banco.portAllocator, pollIntervalMs: 1, gpuLayers: 99, sondaBinario: sonda, attesaChiusuraMs: 500 });
  const registro = [];
  const eventi = [];
  const presetFile = join(cartella, 'router', 'presets.ini');
  const router = createLlamaRouterSupervisor({
    binaryPath: BIN, standalone, presetFile, spawnImpl: banco.spawnImpl, fetchImpl: banco.fetchImpl, portAllocator: banco.portAllocator,
    pollIntervalMs: 1, healthTimeoutMs: 2_000, attesaChiusuraMs: 500,
    modelliInstallati: async () => [{ modelId: 'mod-a', modelPath: a, opzioni: { contextLength: 8_192 } }, { modelId: 'mod-b', modelPath: b, opzioni: { contextLength: 8_192 } }],
    memoriaUtilizzabile: async () => memoria,
    registro: (testo) => registro.push(testo),
    uccidiAlbero: async (figlio) => { figlio.kill('SIGTERM'); },
    ...(leggiIntestazione ? { leggiIntestazione } : {}),
  });
  router.subscribeLogs((voce) => eventi.push(voce));
  t.after(() => router.chiudi());
  return { cartella, a, b, banco, router, registro, eventi, presetFile, proiettore, fitter };
}

const testoDi = (p) => [...p.registro, ...p.eventi.map((e) => e.text ?? '')].join('');

test('PR-1 the preset section carries mmproj, and the fitter got the projector margin (the same sum the server makes)', async (t) => {
  const p = prepara(t);
  await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192, proiettore: p.proiettore });
  const sezioni = leggiIni(readFileSync(p.presetFile, 'utf8'));
  assert.equal(sezioni.get('mod-a').get('mmproj'), p.proiettore.path);
  assert.equal(sezioni.get('mod-b').has('mmproj'), false, 'the other model has no projector');
  assert.ok(p.fitter.some((a) => a.includes('--fit-target') && a.includes(p.a)), JSON.stringify(p.fitter));
});

test('PR-2 a projector missing on the disk: no mmproj in the section, and the log says why; no projector at all: today\'s section', async (t) => {
  const p = prepara(t);
  await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192, proiettore: { path: join(p.cartella, 'manca.gguf'), bytes: 10 } });
  assert.equal(leggiIni(readFileSync(p.presetFile, 'utf8')).get('mod-a').has('mmproj'), false);
  assert.match(testoDi(p), /image projector not used, the file is missing/u);
  const q = prepara(t);
  await q.router.start({ modelId: 'mod-a', modelPath: q.a, contextLength: 8_192 });
  assert.equal(leggiIni(readFileSync(q.presetFile, 'utf8')).get('mod-a').has('mmproj'), false);
  assert.ok(!q.fitter.some((a) => a.includes('--fit-target')), 'without a projector the fitter gets today\'s arguments');
});

test('PR-3 the router cannot load the model with the projector ⇒ today\'s engine takes it WITH the projector', async (t) => {
  const p = prepara(t, { esito: (nome) => (nome === 'mod-a' ? 'fallisce' : 'ok') });
  const esito = await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192, proiettore: p.proiettore });
  assert.equal(esito.state, 'ready');
  assert.equal(esito.ripiegoRouter?.modelId, 'mod-a');
  const oggi = p.banco.spawn.at(-1).args;
  assert.deepEqual(oggi.slice(oggi.indexOf('--mmproj'), oggi.indexOf('--mmproj') + 2), ['--mmproj', p.proiettore.path]);
});

test('PR-4 a projector path the INI cannot hold (it has ;) ⇒ today\'s engine, with the projector', async (t) => {
  const p = prepara(t);
  const strano = join(p.cartella, 'a;b-mmproj.gguf');
  writeFileSync(strano, Buffer.alloc(4096));
  const esito = await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192, proiettore: { path: strano, bytes: 4096 } });
  assert.equal(esito.state, 'ready');
  assert.equal(esito.ripiegoRouter?.codice, 'ROUTER_SECTION_INVALID');
  assert.ok(p.banco.spawn.at(-1).args.includes(strano));
});

test('PR-5 the router\'s status says the projector in use', async (t) => {
  const p = prepara(t);
  await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192, proiettore: p.proiettore });
  assert.equal(p.router.status().proiettore, p.proiettore.path);
});

test('PR-6 decision 1 counts the projector memory: a vision model that fits twice without it, with it fits once', async (t) => {
  const intestazione = async () => ({ kvCacheBytesPerToken: 100_000 }); // 8.192 tokens → 0,82 GB + 1,5 GiB each (RT-03)
  const senza = prepara(t, { memoria: 7e9, leggiIntestazione: intestazione });
  await senza.router.start({ modelId: 'mod-a', modelPath: senza.a, contextLength: 8_192 });
  assert.equal(senza.banco.spawn[0].args[3], '2');
  const con = prepara(t, { memoria: 7e9, leggiIntestazione: intestazione });
  await con.router.start({ modelId: 'mod-a', modelPath: con.a, contextLength: 8_192, proiettore: { ...con.proiettore, memoriaMiB: 2_000 } });
  assert.equal(con.banco.spawn[0].args[3], '1', 'with ~2 GB of projector the biggest no longer fits twice in 7 GB');
});

/* CLI review of 1fb59818f (02/11): (a) the other installed models get their projector too; (b) the router tries again WITHOUT the projector
   before handing the model to today's engine (the order of the R3 cure: first without vision, then another road) */
function preparaConInstallati(t, { proiettoreB = true, memoria = null, leggiIntestazione, ...finto } = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'router-vista-b-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const a = join(cartella, 'a.gguf'); const b = join(cartella, 'b.gguf');
  writeFileSync(a, 'GGUF-finto-a'); writeFileSync(b, 'GGUF-finto-b');
  const pb = { path: join(cartella, 'mmproj-b.gguf'), bytes: 4096, memoriaMiB: 2_000 };
  writeFileSync(pb.path, Buffer.alloc(4096));
  const banco = creaRouterFinto(finto);
  const sonda = (_e, args) => (args.includes('--help') ? '--spec-type none,ngram-mod' : '-c 8192 -ngl -1');
  const standalone = createLlamaServerSupervisor({ binaryPath: BIN, spawnImpl: banco.spawnImpl, fetchImpl: banco.fetchImpl, portAllocator: banco.portAllocator, pollIntervalMs: 1, gpuLayers: 99, sondaBinario: sonda, attesaChiusuraMs: 500 });
  const registro = [];
  const presetFile = join(cartella, 'router', 'presets.ini');
  const router = createLlamaRouterSupervisor({
    binaryPath: BIN, standalone, presetFile, spawnImpl: banco.spawnImpl, fetchImpl: banco.fetchImpl, portAllocator: banco.portAllocator,
    pollIntervalMs: 1, healthTimeoutMs: 2_000, attesaChiusuraMs: 500,
    modelliInstallati: async () => [{ modelId: 'mod-a', modelPath: a, opzioni: { contextLength: 8_192 } }, { modelId: 'mod-b', modelPath: b, opzioni: { contextLength: 8_192 }, ...(proiettoreB ? { proiettore: pb } : {}) }],
    memoriaUtilizzabile: async () => memoria, registro: (testo) => registro.push(testo), uccidiAlbero: async (figlio) => { figlio.kill('SIGTERM'); },
    ...(leggiIntestazione ? { leggiIntestazione } : {}),
  });
  const eventi = [];
  router.subscribeLogs((voce) => eventi.push(voce));
  t.after(() => router.chiudi());
  return { cartella, a, b, pb, banco, router, presetFile, testo: () => [...registro, ...eventi.map((e) => e.text ?? '')].join('') };
}

test('PR-7 (CLI a) an installed model with a projector gets mmproj in its section from the start, and decision 1 counts it', async (t) => {
  const intestazione = async () => ({ kvCacheBytesPerToken: 100_000 });
  const p = preparaConInstallati(t, { memoria: 7e9, leggiIntestazione: intestazione });
  await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  assert.equal(leggiIni(readFileSync(p.presetFile, 'utf8')).get('mod-b').get('mmproj'), p.pb.path);
  assert.equal(p.banco.spawn[0].args[3], '1', 'mod-b with ~2 GB of projector: the biggest no longer fits twice in 7 GB');
});

test('PR-8 (CLI b) the router fails only with the projector: it tries again WITHOUT it in the router, and says so', async (t) => {
  const p = prepara(t, { esito: (_nome, sezione) => (sezione.has('mmproj') ? 'fallisce' : 'ok') });
  const esito = await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192, proiettore: p.proiettore });
  assert.equal(esito.state, 'ready');
  assert.equal(esito.ripiegoRouter, undefined, 'the model keeps the router mode');
  assert.equal(leggiIni(readFileSync(p.presetFile, 'utf8')).get('mod-a').has('mmproj'), false);
  assert.match(p.router.status().vistaSenza ?? '', /without it/u);
  assert.equal(p.router.status().proiettore, undefined);
});

test('PR-9 (CLI b) the router fails with AND without the projector: today\'s engine, and the log says the projector was not the cause', async (t) => {
  const p = prepara(t, { esito: (nome) => (nome === 'mod-a' ? 'fallisce' : 'ok') });
  const esito = await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192, proiettore: p.proiettore });
  assert.equal(esito.ripiegoRouter?.modelId, 'mod-a');
  assert.match(testoDi(p), /not from the image projector/u);
});

/* CLI second read of fee4b69a5 (02/11), the two S4: the router remembers, per model and in the process, that the vision did not open */
test('PR-10 a vision that failed in the router is remembered: the next opening of the same model goes without it, no failed load more', async (t) => {
  let conVista = 0;
  const p = prepara(t, { esito: (_nome, sezione) => { if (sezione.has('mmproj')) { conVista += 1; return 'fallisce'; } return 'ok'; } });
  await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192, proiettore: p.proiettore });
  assert.equal(conVista, 1);
  await p.router.start({ modelId: 'mod-b', modelPath: p.b, contextLength: 8_192 });
  const esito = await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192, proiettore: p.proiettore });
  assert.equal(esito.state, 'ready');
  assert.equal(conVista, 1, 'no second load with the projector that already failed');
  assert.equal(leggiIni(readFileSync(p.presetFile, 'utf8')).get('mod-a').has('mmproj'), false);
  assert.match(p.router.status().vistaSenza ?? '', /earlier in this session/u);
});

test('PR-11 a failure that is NOT from the projector is not remembered as a vision failure', async (t) => {
  let volte = 0;
  let oggi = 0;
  /* the router fails with and without the projector, and today's engine fails too the first time: nothing is remembered as a fallback
     (`ripieghi` keeps only models that DO load on today's engine), so the next start goes to the router again, and the vision must come back */
  const p = prepara(t, {
    esito: (nome) => { if (nome !== 'mod-a') return 'ok'; volte += 1; return volte <= 2 ? 'fallisce' : 'ok'; },
    esitoStandalone: () => { oggi += 1; return oggi <= 2 ? 'fallisce' : 'ok'; },
  });
  await assert.rejects(p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192, proiettore: p.proiettore }), (e) => e instanceof Error && !(e instanceof TypeError) && !(e instanceof ReferenceError));
  const esito = await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192, proiettore: p.proiettore });
  assert.equal(esito.state, 'ready');
  assert.equal(leggiIni(readFileSync(p.presetFile, 'utf8')).get('mod-a').get('mmproj'), p.proiettore.path, 'the projector was not the cause: it comes back');
  assert.doesNotMatch(p.router.status().vistaSenza ?? '', /earlier in this session/u);
});
