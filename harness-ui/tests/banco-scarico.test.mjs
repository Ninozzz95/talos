/*
 * 02/11/2026, the night bench: the third GPT-OSS file went at 0.4-0.9 MB/s for 96 minutes with no error and no retry (the loop retried only
 * on errors). The download now lives in `scripts/banco-scarico.mjs` and is tried here against a fake server. Desktop's conditions: a resume
 * appends only on 206 (a 200 starts again from zero, never duplicated bytes), the whole file is checked by its fingerprint, and a cap on
 * retries stops with a sentence.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { scaricaUno } from '../scripts/banco-scarico.mjs';

const CONTENUTO = Buffer.from(Array.from({ length: 4000 }, (_, i) => i % 251));
const OID = createHash('sha256').update(CONTENUTO).digest('hex');
const cartella = () => mkdtempSync(join(tmpdir(), 'talos-banco-scarico-'));
const presto = async () => {};

/* a fake answer: `pezzi` are served in order; `poiFermo` hangs after them until the request is aborted (a stalled stream, no error) */
function risposta({ status = 206, da = 0, pezzi, poiFermo = false, contentRange }, signal) {
  const headers = new Map([['content-range', contentRange ?? (status === 206 ? `bytes ${da}-${CONTENUTO.length - 1}/${CONTENUTO.length}` : null)]]);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k) => headers.get(String(k).toLowerCase()) ?? null },
    body: (async function* () {
      for (const p of pezzi) { if (signal?.aborted) throw signal.reason ?? new Error('aborted'); yield p; } // a real stream stops when the request is closed
      if (poiFermo) await new Promise((_, no) => { signal?.addEventListener('abort', () => no(signal.reason ?? new Error('aborted')), { once: true }); });
    })(),
  };
}
const daRange = (opzioni) => Number(/bytes=(\d+)-/u.exec(opzioni.headers.Range)[1]);

test('SC-1 a resume with 206 appends from where the .part stopped, and the file is checked by its fingerprint', async () => {
  const dove = cartella();
  writeFileSync(join(dove, 'm.gguf.part'), CONTENUTO.subarray(0, 1500));
  const chiesti = [];
  const fetchImpl = async (_url, o) => { const da = daRange(o); chiesti.push(da); return risposta({ da, pezzi: [CONTENUTO.subarray(da)] }, o.signal); };
  const r = await scaricaUno({ url: 'x', nome: 'm.gguf', oid: OID, byte: CONTENUTO.length, dove, fetchImpl, attendi: presto });
  assert.deepEqual(chiesti, [1500]);
  assert.equal(r.giaPresente, false);
  assert.deepEqual(readFileSync(join(dove, 'm.gguf')), CONTENUTO);
});

test('SC-2 (Desktop) the server answers 200 to a resume: it starts again from zero, never duplicated bytes', async () => {
  const dove = cartella();
  writeFileSync(join(dove, 'm.gguf.part'), CONTENUTO.subarray(0, 1500));
  let chiamate = 0;
  const righe = [];
  const fetchImpl = async (_url, o) => { chiamate += 1; return risposta({ status: 200, pezzi: [CONTENUTO] }, o.signal); };
  await scaricaUno({ url: 'x', nome: 'm.gguf', oid: OID, byte: CONTENUTO.length, dove, fetchImpl, attendi: presto, stato: (r) => righe.push(r) });
  assert.deepEqual(readFileSync(join(dove, 'm.gguf')), CONTENUTO);
  /* one request is enough: the 200 rewrites the .part at once (the later guards against a too long .part must not be what saves it) */
  assert.equal(chiamate, 1);
  assert.deepEqual(righe, []);
});

test('SC-3 a 206 whose Content-Range does not start where asked is not appended', async () => {
  const dove = cartella();
  writeFileSync(join(dove, 'm.gguf.part'), CONTENUTO.subarray(0, 1500));
  let volta = 0;
  const fetchImpl = async (_url, o) => {
    volta += 1;
    const da = daRange(o);
    return volta === 1 ? risposta({ da, pezzi: [CONTENUTO.subarray(0)], contentRange: `bytes 0-3999/4000` }, o.signal) : risposta({ da, pezzi: [CONTENUTO.subarray(da)] }, o.signal);
  };
  const righe = [];
  await scaricaUno({ url: 'x', nome: 'm.gguf', oid: OID, byte: CONTENUTO.length, dove, fetchImpl, attendi: presto, stato: (r) => righe.push(r) });
  assert.deepEqual(readFileSync(join(dove, 'm.gguf')), CONTENUTO);
  assert.ok(righe.some((r) => r.evento === 'riprova' && /Content-Range/u.test(r.motivo)));
});

test('SC-4 a stream that goes too slow (here: stops, with no error) is closed and resumed from Range', async () => {
  const dove = cartella();
  const chiesti = [];
  const fetchImpl = async (_url, o) => {
    const da = daRange(o);
    chiesti.push(da);
    return chiesti.length === 1 ? risposta({ da, pezzi: [CONTENUTO.subarray(0, 1000)], poiFermo: true }, o.signal) : risposta({ da, pezzi: [CONTENUTO.subarray(da)] }, o.signal);
  };
  const righe = [];
  await scaricaUno({ url: 'x', nome: 'm.gguf', oid: OID, byte: CONTENUTO.length, dove, fetchImpl, attendi: presto, stato: (r) => righe.push(r), sorveglianza: { finestraMs: 60, minimoBps: 100_000 } });
  assert.deepEqual(chiesti, [0, 1000]);
  assert.ok(righe.some((r) => r.evento === 'riprova' && /lento/u.test(r.motivo)), JSON.stringify(righe));
  assert.deepEqual(readFileSync(join(dove, 'm.gguf')), CONTENUTO);
});

test('SC-5 (Desktop) the retry cap stops with a sentence, and the .part stays for a later resume', async () => {
  const dove = cartella();
  let n = 0;
  const fetchImpl = async () => { n += 1; return { status: 503, ok: false, headers: { get: () => null }, body: null }; };
  await assert.rejects(scaricaUno({ url: 'x', nome: 'm.gguf', oid: OID, byte: CONTENUTO.length, dove, fetchImpl, attendi: presto, tentativi: 3 }), /m\.gguf: non finito dopo 3 tentativi/u);
  assert.equal(n, 3);
});

test('SC-6 a wrong fingerprint removes the file and says so', async () => {
  const dove = cartella();
  const sbagliato = Buffer.from(CONTENUTO); sbagliato[10] ^= 1;
  const fetchImpl = async (_url, o) => risposta({ da: daRange(o), pezzi: [sbagliato.subarray(daRange(o))] }, o.signal);
  await assert.rejects(scaricaUno({ url: 'x', nome: 'm.gguf', oid: OID, byte: CONTENUTO.length, dove, fetchImpl, attendi: presto }), /impronta .* file tolto/u);
  assert.equal(existsSync(join(dove, 'm.gguf.part')), false);
  assert.equal(existsSync(join(dove, 'm.gguf')), false);
});

test('SC-7 a file already whole on the disk is not downloaded again', async () => {
  const dove = cartella();
  writeFileSync(join(dove, 'm.gguf'), CONTENUTO);
  const r = await scaricaUno({ url: 'x', nome: 'm.gguf', oid: OID, byte: CONTENUTO.length, dove, fetchImpl: async () => { throw new Error('no network expected'); }, attendi: presto });
  assert.equal(r.giaPresente, true);
});

/* CLI review of d6acb0412 (02/11), three defects proven on the module: the tests below are in the cure direction */
test('SC-8 (CLI S3) the cap counts only attempts in a row WITHOUT new bytes: connections that each bring 400 bytes finish the file', async () => {
  const dove = cartella();
  let chiamate = 0;
  const fetchImpl = async (_u, o) => { chiamate += 1; const da = daRange(o); return risposta({ da, pezzi: [CONTENUTO.subarray(da, da + 400)], poiFermo: true }, o.signal); };
  await scaricaUno({ url: 'x', nome: 'm.gguf', oid: OID, byte: CONTENUTO.length, dove, fetchImpl, attendi: presto, attesaRiprova: () => 0, sorveglianza: { finestraMs: 30, minimoBps: 1_000_000_000 } });
  assert.equal(chiamate, 10);
  assert.deepEqual(readFileSync(join(dove, 'm.gguf')), CONTENUTO);
});

test('SC-9 (CLI S3) a server that sends MORE bytes than the file: the .part is not left too long, and a good server then finishes it', async () => {
  const dove = cartella();
  let volta = 0;
  const righe = [];
  const fetchImpl = async (_u, o) => {
    volta += 1;
    return volta === 1 ? risposta({ status: 200, pezzi: [CONTENUTO, Buffer.from('in piu')] }, o.signal) : risposta({ da: daRange(o), pezzi: [CONTENUTO.subarray(daRange(o))] }, o.signal);
  };
  await scaricaUno({ url: 'x', nome: 'm.gguf', oid: OID, byte: CONTENUTO.length, dove, fetchImpl, attendi: presto, attesaRiprova: () => 0, stato: (r) => righe.push(r) });
  assert.deepEqual(readFileSync(join(dove, 'm.gguf')), CONTENUTO);
  assert.ok(righe.some((r) => /il server manda più byte/u.test(r.motivo ?? '')), JSON.stringify(righe));
});

test('SC-10 (CLI S4) the bench\'s own brake below the floor does not make the watch close the connection', async () => {
  const dove = cartella();
  const pezzi = Array.from({ length: 40 }, (_, i) => CONTENUTO.subarray(i * 100, i * 100 + 100));
  const fetchImpl = async (_u, o) => risposta({ da: daRange(o), pezzi: pezzi.filter((_, i) => i * 100 >= daRange(o)) }, o.signal);
  const righe = [];
  const dormi = (ms) => new Promise((ok) => setTimeout(ok, ms));
  await scaricaUno({ url: 'x', nome: 'm.gguf', oid: OID, byte: CONTENUTO.length, dove, fetchImpl, attendi: dormi, attesaRiprova: () => 0, tetto: () => 2_000, stato: (r) => righe.push(r), sorveglianza: { finestraMs: 300, minimoBps: 5_000 } });
  assert.deepEqual(readFileSync(join(dove, 'm.gguf')), CONTENUTO);
  assert.equal(righe.filter((r) => /lento/u.test(r.motivo ?? '')).length, 0, JSON.stringify(righe));
});

test('SC-11 (CLI S3) a .part already longer than the file on the disk (an older tool, a wrong server) is removed and said', async () => {
  const dove = cartella();
  writeFileSync(join(dove, 'm.gguf.part'), Buffer.concat([CONTENUTO, Buffer.from('in piu')]));
  const righe = [];
  const fetchImpl = async (_u, o) => risposta({ da: daRange(o), pezzi: [CONTENUTO.subarray(daRange(o))] }, o.signal);
  await scaricaUno({ url: 'x', nome: 'm.gguf', oid: OID, byte: CONTENUTO.length, dove, fetchImpl, attendi: presto, attesaRiprova: () => 0, stato: (r) => righe.push(r) });
  assert.deepEqual(readFileSync(join(dove, 'm.gguf')), CONTENUTO);
  assert.ok(righe.some((r) => /\.part più lungo del file/u.test(r.motivo ?? '')), JSON.stringify(righe));
});
