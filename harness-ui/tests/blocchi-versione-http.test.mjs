/*
 * G-B4 (06/11/2026), UIG-1.23: the block-version route over HTTP — `POST /api/v1/sessions/:id/blocchi/versione` — with a fake registry
 * (no APPDATA, no model, no port but an ephemeral one on 127.0.0.1). It proves what the registry tests cannot: the status codes, the
 * 405 from the inventory (UIG-1.22), the 409 that carries the next number (UIG-1.20) and the existing 256 KB body limit.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

process.env.APPDATA = mkdtempSync(join(tmpdir(), 'talos-gb4-http-'));
const { createHttpApp } = await import('../src/http-app.mjs');

const VALORE = { conversazione: 's1', messaggio: 'm1', blocco: 'b1', versione: 2, sorgente: 'tipo: tabella', cosaECambiato: 'Bars', origine: 'vista', quando: '2026-11-06T00:00:00.000Z' };

async function listen(t, salvaVersioneDelBlocco) {
  const chiamate = [];
  const sessionRegistry = { salvaVersioneDelBlocco: async (id, corpo) => { chiamate.push([id, corpo]); return salvaVersioneDelBlocco(id, corpo); } };
  const app = createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, listaTaskDisponibili: () => [], elencaCartelleProgetto: () => [], sessionRegistry });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { url: (id = 's1') => `http://127.0.0.1:${server.address().port}/api/v1/sessions/${encodeURIComponent(id)}/blocchi/versione`, chiamate };
}

/* the fake answers like the registry: unknown session, a taken number (next 3), a bad shape, otherwise ok */
function finto(id, corpo) {
  if (id !== 's1') return { ok: false, codice: 'session-not-found' };
  if (corpo?.blocco !== 'b1' || !Number.isInteger(corpo?.versione) || corpo.versione < 2) return { ok: false, codice: 'invalid-block-version' };
  if (corpo.versione !== 3) return { ok: false, codice: 'version-taken', prossima: 3 };
  return { ok: true, blocco: 'b1', versione: 3 };
}

const posta = (url, corpo) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo) });

test('G-B4 UIG-1.23 POST with the next number answers 200 with what the registry wrote', async (t) => {
  const s = await listen(t, finto);
  const r = await posta(s.url(), { ...VALORE, versione: 3 });
  assert.equal(r.status, 200);
  const corpo = await r.json();
  assert.equal(corpo.ok, true);
  assert.deepEqual(corpo.data, { ok: true, blocco: 'b1', versione: 3 });
  assert.deepEqual(s.chiamate, [['s1', { ...VALORE, versione: 3 }]], 'the body reaches the registry unchanged');
});

test('G-B4 UIG-1.20 a taken number answers 409 with the next number in error.params.prossima', async (t) => {
  const s = await listen(t, finto);
  const r = await posta(s.url(), VALORE);
  assert.equal(r.status, 409);
  const corpo = await r.json();
  assert.equal(corpo.ok, false);
  assert.equal(corpo.error.code, 'PIECE_CHANGED');
  assert.deepEqual(corpo.error.params, { prossima: 3 });
});

test('G-B4 UIG-1.22 a wrong method answers 405 with Allow: POST, and never reaches the registry', async (t) => {
  const s = await listen(t, finto);
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const r = await fetch(s.url(), { method });
    assert.equal(r.status, 405, method);
    assert.equal(r.headers.get('allow'), 'POST', method);
    await r.arrayBuffer();
  }
  assert.equal(s.chiamate.length, 0);
});

test('G-B4 UIG-1.23 a missing session answers 404', async (t) => {
  const s = await listen(t, finto);
  const r = await posta(s.url('nessuna'), VALORE);
  assert.equal(r.status, 404);
  assert.equal((await r.json()).error.code, 'NOT_FOUND');
});

test('G-B4 UIG-1.23 an invalid body answers 400: a shape the registry refuses, and JSON that does not parse', async (t) => {
  const s = await listen(t, finto);
  const r = await posta(s.url(), { ...VALORE, blocco: 'x1' });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error.code, 'SCELTA_NON_VALIDA');
  const rotto = await posta(s.url(), '{"blocco":');
  assert.equal(rotto.status, 400);
  await rotto.arrayBuffer();
  assert.equal(s.chiamate.length, 1, 'broken JSON never reaches the registry');
});

test('G-B4 UIG-1.23 a body over 256 KB answers the existing limit error (413 PAYLOAD_LIMIT) and never reaches the registry', async (t) => {
  const s = await listen(t, finto);
  const r = await posta(s.url(), { ...VALORE, sorgente: 'x'.repeat(256 * 1024 + 1) });
  assert.equal(r.status, 413);
  assert.equal((await r.json()).error.code, 'PAYLOAD_LIMIT');
  assert.equal(s.chiamate.length, 0);
});
