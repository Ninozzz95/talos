/*
 * 02/11/2026, found curing the engine bench: `dispatcherDiGenerazione` copies the class of Node's global dispatcher, and Node builds that
 * one only when undici loads. Before the first fetch of the process the answer was null, and the null was REMEMBERED for that limit: if a
 * generation came first, every later one of the same process kept the hidden 300 s of undici, while the code believed it had removed them.
 * Each case runs in a process of its own: in this one a test runner may already have loaded undici, and the defect would not show.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const MODULO = new URL('../src/generation-idle.mjs', import.meta.url).href;
const inProcessoNuovo = (corpo) => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `import { dispatcherDiGenerazione as d } from ${JSON.stringify(MODULO)};\n${corpo}`], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout.trim().split('\n').at(-1));
};

test('DG-1 the first generation of the process, before any fetch, already has its dispatcher', () => {
  const r = inProcessoNuovo(`console.log(JSON.stringify({ c: typeof d({ limiteMs: 1_800_000 })?.dispatch }));`);
  assert.equal(r.c, 'function');
});

test('DG-2 the same limit asked again after a fetch still has it (the case seen on 02/11: null, remembered)', () => {
  const r = inProcessoNuovo(`
    const prima = d({ limiteMs: 1_800_000 });
    await fetch('data:text/plain,x');
    const dopo = d({ limiteMs: 1_800_000 });
    console.log(JSON.stringify({ prima: typeof prima?.dispatch, dopo: typeof dopo?.dispatch, stesso: prima === dopo }));`);
  assert.deepEqual(r, { prima: 'function', dopo: 'function', stesso: true });
});

test('DG-3 a failure to build is never remembered: the same limit is tried again', () => {
  const r = inProcessoNuovo(`
    const sbagliato = d({ limiteMs: 900_000, dispatcherGlobale: { constructor: undefined } });
    const poi = d({ limiteMs: 900_000 });
    console.log(JSON.stringify({ sbagliato, poi: typeof poi?.dispatch }));`);
  assert.deepEqual(r, { sbagliato: null, poi: 'function' });
});

test('DG-4 on a real socket, in a fresh process: the dispatcher bites, so the limit in force is ours and not the hidden 300 s', { timeout: 20_000 }, () => {
  const r = inProcessoNuovo(`
    import('node:http').then(async ({ createServer }) => {
      const server = createServer((_q, w) => { setTimeout(() => { w.writeHead(200); w.end('ok'); }, 3_000); });
      await new Promise((ok) => { server.listen(0, '127.0.0.1', ok); });
      const url = 'http://127.0.0.1:' + server.address().port + '/';
      const esito = await fetch(url, { dispatcher: d({ limiteMs: 1_000 }) }).then(() => 'risposta', (e) => e?.cause?.code ?? String(e));
      server.closeAllConnections(); server.close();
      console.log(JSON.stringify({ esito }));
    });`);
  assert.deepEqual(r, { esito: 'UND_ERR_HEADERS_TIMEOUT' });
});
