import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';

const SESSIONE = 'sess-phase3a-review';

async function serverDiProva(t) {
  let mutazioni = 0;
  const sessionRegistry = {
    esiste: (id) => id === SESSIONE,
    async eliminaVoceLibreria(_sessionId, id) {
      mutazioni += 1;
      return { ok: true, id };
    },
  };
  const server = createServer(createHttpApp({
    staticHandler: async () => null,
    listaTaskDisponibili: () => [],
    elencaCartelleProgetto: () => [],
    sessionRegistry,
  }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return {
    port: server.address().port,
    mutazioni: () => mutazioni,
  };
}

function postChunked(port, path, pezzi) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      hostname: '127.0.0.1',
      port,
      path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
    });
    req.on('error', reject);
    for (const pezzo of pezzi) req.write(pezzo);
    req.end();
  });
}

test('FASE3-BATCH-64K-CHUNKED — anche senza Content-Length il limite risponde 413 e non resetta il socket', async (t) => {
  const s = await serverDiProva(t);
  const prefisso = '{"azione":"elimina","ids":["lib-1"],"padding":"';
  const risposta = await postChunked(s.port, `/api/v1/sessions/${SESSIONE}/library/batch`, [
    prefisso,
    'x'.repeat(40 * 1024),
    'x'.repeat(30 * 1024),
    '"}',
  ]);
  assert.equal(risposta.status, 413);
  assert.equal(risposta.json.error.code, 'PAYLOAD_LIMIT');
  assert.equal(s.mutazioni(), 0);
});

test('FASE3-BATCH-QUERY — query string rifiutata prima di ogni mutazione', async (t) => {
  const s = await serverDiProva(t);
  const risposta = await fetch(`http://127.0.0.1:${s.port}/api/v1/sessions/${SESSIONE}/library/batch?forza=1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ azione: 'elimina', ids: ['lib-1'] }),
  });
  assert.equal(risposta.status, 400);
  assert.equal((await risposta.json()).error.code, 'QUERY_INVALID');
  assert.equal(s.mutazioni(), 0);
});

test('FASE3-BATCH-ID-PERCORSO — un id codificato come percorso non raggiunge la mutazione', async (t) => {
  const s = await serverDiProva(t);
  const risposta = await fetch(`http://127.0.0.1:${s.port}/api/v1/sessions/${SESSIONE}/research/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ azione: 'elimina', ids: ['../fuori'] }),
  });
  assert.equal(risposta.status, 200, 'un id individuale invalido è un esito del batch, non invalida il body intero');
  const json = await risposta.json();
  assert.deepEqual(json.data.esiti, [{ id: '../fuori', ok: false, status: 400, code: 'RESEARCH_INVALID' }]);
  assert.equal(s.mutazioni(), 0);
});
