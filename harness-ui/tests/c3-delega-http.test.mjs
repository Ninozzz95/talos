/*
 * C3 tappa 4 (09/10/2026) — le rotte della PERSONA per Pausa, Riprendi e Riprova di una delega, con un server HTTP vero in
 * processo e un registro finto che risponde come quello vero (`pausaDelega`, `riprendiDelega`: il registro vero è provato in
 * `c3-pausa-figlia-registro.test.mjs`). Corpo vuoto; 404 per ciò che non è una figlia; 409 `DELEGATION_STATE_CONFLICT` quando lo
 * stato non lo ammette; una finestra straniera non passa.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';

function registroFinto() {
  const chiamate = [];
  const stati = new Map([['figlia-viva', 'running'], ['figlia-ferma', 'paused'], ['figlia-fallita', 'failed']]);
  return {
    chiamate,
    leggiSessioneContesto: (id) => (stati.has(id) ? { sessionId: id } : null),
    pausaDelega(id) {
      chiamate.push(['pausa', id]);
      if (!stati.has(id)) return 'non-figlia';
      return stati.get(id) === 'running' ? 'in-pausa' : 'non-in-corso';
    },
    riprendiDelega(id, azione) {
      chiamate.push([azione, id]);
      if (!stati.has(id)) return { esito: 'rifiutato', motivo: 'not a sub-agent' };
      const ammesso = (azione === 'resume' && stati.get(id) === 'paused') || (azione === 'retry' && stati.get(id) === 'failed');
      return ammesso ? { esito: 'ripresa', childId: id } : { esito: 'rifiutato', motivo: 'the sub-agent is not paused' };
    },
  };
}

async function banco(t) {
  const registro = registroFinto();
  const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry: registro, token: 'secret' }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body = {}, headers = {}) => fetch(base + path, { method: 'POST',
    headers: { Cookie: 'talos_token=secret', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { registro, post, base };
}

test('C3-DELEGA-HTTP: pause a running child, resume a paused one, retry a failed one; the wrong state is 409 and changes nothing', async (t) => {
  const b = await banco(t);
  const pausa = await b.post('/api/v1/sessions/figlia-viva/delegation/pause');
  assert.equal(pausa.status, 200);
  assert.deepEqual((await pausa.json()).data, { childId: 'figlia-viva', paused: true });
  const ripresa = await b.post('/api/v1/sessions/figlia-ferma/delegation/resume');
  assert.equal(ripresa.status, 200);
  assert.deepEqual((await ripresa.json()).data, { childId: 'figlia-ferma', resumed: true, action: 'resume' });
  const riprova = await b.post('/api/v1/sessions/figlia-fallita/delegation/retry');
  assert.deepEqual((await riprova.json()).data, { childId: 'figlia-fallita', resumed: true, action: 'retry' });

  const conflitto = await b.post('/api/v1/sessions/figlia-ferma/delegation/pause');
  assert.equal(conflitto.status, 409);
  assert.equal((await conflitto.json()).error.code, 'DELEGATION_STATE_CONFLICT');
  assert.equal((await b.post('/api/v1/sessions/figlia-viva/delegation/resume')).status, 409, 'a running child is not resumed');
  assert.equal((await b.post('/api/v1/sessions/nessuna/delegation/pause')).status, 404, 'not a child');
  assert.equal((await b.post('/api/v1/sessions/nessuna/delegation/retry')).status, 404);
});

test('C3-DELEGA-HTTP (the other way): a body, an unknown action or a foreign window are refused before the registry', async (t) => {
  const b = await banco(t);
  assert.equal((await b.post('/api/v1/sessions/figlia-viva/delegation/pause', { motivo: 'x' })).status, 400, 'no body');
  assert.equal((await b.post('/api/v1/sessions/figlia-viva/delegation/cancel')).status, 404, 'cancel is the Stop route, not this one');
  const straniera = await b.post('/api/v1/sessions/figlia-viva/delegation/pause', {}, { Origin: 'http://evil.example' });
  assert.equal(straniera.status, 403);
  assert.deepEqual(b.registro.chiamate, [], 'nothing reached the registry');
});
