import assert from 'node:assert/strict';
import test from 'node:test';
import { bitsDi, conIlProiettore, eProiettore, proiettoreDelManifesto, scegliProiettore, vedeDaRuntimeCompatibile } from '../src/proiettore-visione.mjs';

test('PV-1 a projector is a .gguf with «mmproj» in its name, in any case and folder', () => {
  for (const p of ['mmproj-F16.gguf', 'mmproj-BF16.gguf', 'sub/mmproj-LFM3-VL-2B-F16.gguf', 'Model-MMPROJ-f16.GGUF', 'C:\\m\\mmproj-q8_0.gguf']) assert.equal(eProiettore(p), true, p);
});

test('PV-2 the other way (Desktop): names that are NOT a projector', () => {
  for (const p of ['Qwen3.8-27B-UD-Q4_K_M.gguf', 'gemma-4-26B-A4B-it-UD-Q3_K_XL.gguf', 'mmproj-F16.bin', 'mmproj/README.md', 'mtp-head.gguf', 'imatrix.gguf', '', null, undefined, 'mm-proj.gguf']) {
    assert.equal(eProiettore(p), false, String(p));
  }
});

test('PV-3 the bits of a quantization, as llama.cpp reads them', () => {
  assert.deepEqual(['x-Q4_K_M.gguf', 'x-UD-IQ2_XXS.gguf', 'x-Q8_0.gguf', 'mmproj-F16.gguf', 'mmproj-BF16.gguf', 'mmproj-F32.gguf', 'x.gguf'].map(bitsDi), [4, 2, 8, 16, 16, 32, 0]);
});

test('PV-4 the choice: same folder as the model, closest bits, F16 before BF16 on a tie, F32 last', () => {
  const repo = ['Qwen3.8-27B-UD-Q4_K_M.gguf', 'mmproj-BF16.gguf', 'mmproj-F32.gguf', 'mmproj-F16.gguf', 'altra/mmproj-F16.gguf'].map((path) => ({ path }));
  assert.equal(scegliProiettore(repo, 'Qwen3.8-27B-UD-Q4_K_M.gguf').path, 'mmproj-F16.gguf');
  assert.equal(scegliProiettore(['m/x-Q8_0.gguf', 'm/mmproj-q8_0.gguf', 'm/mmproj-F16.gguf'], 'm/x-Q8_0.gguf'), 'm/mmproj-q8_0.gguf', 'closest bits win');
  assert.equal(scegliProiettore(['m/mmproj-F16.gguf', 'm/mmproj-q8_0.gguf'], 'm/x-Q8_0.gguf'), 'm/mmproj-q8_0.gguf', 'closest bits win in any order');
  assert.equal(scegliProiettore(['mmproj-BF16.gguf', 'mmproj-F16.gguf'], 'x-Q4_K_M.gguf'), 'mmproj-F16.gguf', 'F16, not BF16, on a tie in any order');
  assert.equal(scegliProiettore(['mmproj-F16.gguf'], 'sub/x-Q4_K_M.gguf'), null, 'another folder is another model');
  assert.equal(scegliProiettore(['x-Q4_K_M.gguf'], 'x-Q4_K_M.gguf'), null, 'a repository without vision');
  assert.equal(scegliProiettore(null, 'x.gguf'), null);
});

test('PV-6 condition of the Mobile: a projector imported from disk is refused as a model; a model file still goes in', async (t) => {
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { Readable } = await import('node:stream');
  const { createLocalModelStore } = await import('../src/local-model-store.mjs');
  const { createHfDirectTransfer } = await import('../src/hf-direct-transfer.mjs');
  const { rimuoviCartellaDiProvaAttesa } = await import('./aiuto/rimuovi-cartella-di-prova.mjs');
  const root = await mkdtemp(join(tmpdir(), 'talos-proiettore-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(root));
  const transfer = createHfDirectTransfer({ rootDir: root, modelStore: createLocalModelStore({ rootDir: root }), hubClient: { resolveDownload: async () => ({ url: 'https://cdn-lfs.huggingface.co/m.gguf' }) }, fetchImpl: async () => ({}) });
  const dati = Buffer.from('GGUF-fixture');
  await assert.rejects(transfer.importStream(Readable.from([dati]), { id: 'proiettore', filename: 'mmproj-F16.gguf', expectedBytes: dati.length }),
    (e) => e.code === 'LOCAL_IMPORT_INVALID' && /image part/u.test(e.message));
  const buono = await transfer.importStream(Readable.from([dati]), { id: 'modello', filename: 'qwen-Q4_K_M.gguf', expectedBytes: dati.length });
  assert.equal(buono.state, 'ready');
});

test('PV-7 the download route refuses a projector as the first file (the model); after the model it is accepted', async (t) => {
  const { createServer } = await import('node:http');
  const { createHttpApp } = await import('../src/http-app.mjs');
  const avviati = [];
  const server = createServer(createHttpApp({ senzaGettone: 'prove', localModelTransfer: { start: async (r) => { avviati.push(r); return { id: r.id, state: 'queued' }; }, status: () => null, list: () => [] } }));
  await new Promise((ok, ko) => { server.once('error', ko); server.listen(0, '127.0.0.1', ok); });
  t.after(() => new Promise((ok) => server.close(ok)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/huggingface/download`;
  const file = (path) => ({ path, bytes: 4, sha256: 'a'.repeat(64) });
  const corpo = (files) => ({ id: 'x', repo: 'org/X-GGUF', revision: 'b'.repeat(40), files, bytes: 4 * files.length, path: 'x', license: 'mit' });
  const prima = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo([file('mmproj-F16.gguf')])) });
  assert.equal(prima.status, 400);
  assert.equal(avviati.length, 0);
  const dopo = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo([file('x-Q4_K_M.gguf'), file('mmproj-F16.gguf')])) });
  assert.notEqual(dopo.status, 400, 'the model first, the projector after: the shape is accepted');
});

test('PV-8 Ollama and LM Studio: «sees» from their observed capability; unobserved, unknown, broken or another source is null', async () => {
  const runtimes = {
    ollama: { listModels: async () => [{ id: 'llava:7b', capabilities: { vision: { state: 'observed', value: true } } }, { id: 'qwen3:8b', capabilities: { vision: { state: 'observed', value: false } } }, { id: 'boh', capabilities: { vision: { state: 'unknown' } } }] },
    lmstudio: { listModels: async () => { throw new Error('spento'); } },
  };
  assert.equal(await vedeDaRuntimeCompatibile('ollama:llava:7b', runtimes), true);
  assert.equal(await vedeDaRuntimeCompatibile('ollama:qwen3:8b', runtimes), false);
  assert.equal(await vedeDaRuntimeCompatibile('ollama:boh', runtimes), null);
  assert.equal(await vedeDaRuntimeCompatibile('ollama:manca', runtimes), null);
  assert.equal(await vedeDaRuntimeCompatibile('lmstudio:x', runtimes), null);
  assert.equal(await vedeDaRuntimeCompatibile('local:x', runtimes), null);
  assert.equal(await vedeDaRuntimeCompatibile('ollama:llava:7b', null), null);
});

test('PV-9 the download takes the projector along, with its fingerprint and weight; without one, or unreadable, the body goes as it came', async () => {
  const sha = (c) => c.repeat(64);
  const corpo = { id: 'x', repo: 'unsloth/Qwen3.8-27B-GGUF', revision: 'b'.repeat(40), files: [{ path: 'Qwen3.8-27B-UD-Q4_K_M.gguf', bytes: 100, sha256: sha('a') }], bytes: 100 };
  const elenco = [{ path: 'Qwen3.8-27B-UD-Q4_K_M.gguf', sizeBytes: 100, sha256: sha('a') }, { path: 'mmproj-BF16.gguf', sizeBytes: 9, sha256: sha('c') }, { path: 'mmproj-F16.gguf', sizeBytes: 9, sha256: sha('d') }];
  const chiesti = [];
  const { corpo: dopo, proiettore } = await conIlProiettore(corpo, async (r, v) => { chiesti.push([r, v]); return elenco; });
  assert.deepEqual(chiesti, [[corpo.repo, corpo.revision]]);
  assert.deepEqual(proiettore, { path: 'mmproj-F16.gguf', bytes: 9, sha256: sha('d') });
  assert.deepEqual(dopo.files.map((f) => f.path), ['Qwen3.8-27B-UD-Q4_K_M.gguf', 'mmproj-F16.gguf'], 'the model stays first');
  assert.equal(dopo.bytes, 109);
  assert.equal(corpo.files.length, 1, 'the request is not changed in place');
  for (const [nome, lista] of [['no projector', [elenco[0]]], ['no fingerprint', [elenco[0], { path: 'mmproj-F16.gguf', sizeBytes: 9, sha256: null }]], ['no weight', [elenco[0], { path: 'mmproj-F16.gguf', sizeBytes: 0, sha256: sha('d') }]]]) {
    assert.equal((await conIlProiettore(corpo, async () => lista)).corpo, corpo, nome);
  }
  assert.equal((await conIlProiettore(corpo, async () => { throw new Error('rete'); })).corpo, corpo, 'unreadable list');
  assert.equal((await conIlProiettore(corpo, null)).corpo, corpo, 'no hub');
  const giaDentro = { ...corpo, files: [...corpo.files, { path: 'mmproj-F16.gguf', bytes: 9, sha256: sha('d') }], bytes: 109 };
  let chiesto = false;
  assert.equal((await conIlProiettore(giaDentro, async () => { chiesto = true; return elenco; })).corpo, giaDentro, 'already there: not asked again');
  assert.equal(chiesto, false);
});

test('PV-5 the projector of a downloaded model is never files[0]', () => {
  assert.deepEqual(proiettoreDelManifesto({ files: [{ path: 'x-Q4_K_M.gguf' }, { path: 'mmproj-F16.gguf' }] }), { path: 'mmproj-F16.gguf' });
  assert.equal(proiettoreDelManifesto({ files: [{ path: 'mmproj-F16.gguf' }] }), null, 'a lone projector is not a model that sees');
  assert.equal(proiettoreDelManifesto({ files: [{ path: 'x.gguf' }] }), null);
  assert.equal(proiettoreDelManifesto(null), null);
});
