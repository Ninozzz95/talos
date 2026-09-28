/*
 * ⛔ 24/09/2026 — la PORTA HTTP della scelta sul piano (POST /api/v1/sessions/:id/plan-decision), decisioni owner 36-39.
 * La scelta «procedi…» alza il permesso della sessione (sola lettura → scritture): la rotta porta la stessa guardia d'origine
 * dell'approvazione dei Workflow, provata metà per metà come in `http-routes-workflow-approval-origin.test.mjs` (Origin da sola,
 * Sec-Fetch-Site da solo, client senza intestazioni con e senza gettone). Il registro è finto: qui si prova la porta, la
 * semantica della scelta è in `piano-approvazione.test.mjs`.
 */
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';

const SESSIONE = 'sessione-piano';
const HASH = 'sha256:' + 'a'.repeat(64);

async function setup(t, { token = null, esito = { ok: true } } = {}) {
  const ricevute = [];
  const sessionRegistry = {
    async rispondiPiano(sessionId, corpo) {
      ricevute.push({ sessionId, corpo });
      return typeof esito === 'function' ? esito(sessionId, corpo) : esito;
    },
  };
  const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry, token }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  const post = (headers, corpo = { requestId: 'r1', decisione: 'procedi-accetta-modifiche', hash: HASH }, percorso = `/api/v1/sessions/${SESSIONE}/plan-decision`) =>
    new Promise((resolve, reject) => {
      const body = typeof corpo === 'string' ? corpo : JSON.stringify(corpo);
      const req = request({ host: '127.0.0.1', port, method: 'POST', path: percorso,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers } },
      (res) => { let text = ''; res.setEncoding('utf8'); res.on('data', (c) => { text += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: text ? JSON.parse(text) : null })); });
      req.on('error', reject); req.end(body);
    });
  const finestra = { Origin: `http://127.0.0.1:${port}`, 'Sec-Fetch-Site': 'same-origin' };
  return { port, post, ricevute, finestra };
}

test('PLAN-HTTP-OK: la scelta dalla finestra TALOS arriva intatta al registro e risponde 200', async (t) => {
  const { post, ricevute, finestra } = await setup(t);
  const corpo = { requestId: 'r1', decisione: 'continua-a-pianificare', hash: HASH, feedback: 'Aggiungi i test.' };
  const out = await post(finestra, corpo);
  assert.equal(out.status, 200);
  assert.deepEqual(out.body.data, { ok: true });
  assert.deepEqual(ricevute, [{ sessionId: SESSIONE, corpo }]);
});

test('PLAN-HTTP-CODES: stato cambiato 409, salvataggio fallito 500, sessione assente 404, corpo rotto 400', async (t) => {
  for (const [code, status] of [['PLAN_NOT_PENDING', 409], ['PLAN_STALE', 409], ['PLAN_DECISION_NOT_SAVED', 500], ['NOT_FOUND', 404], ['QUERY_INVALID', 400]]) {
    const { post, finestra } = await setup(t, { esito: { erroreAvvio: 'x', code } });
    const out = await post(finestra);
    assert.equal(out.status, status, code);
    assert.equal(out.body.error.code, code);
  }
});

test('PLAN-HTTP-CONTENT-TYPE: senza application/json la scelta non arriva al registro', async (t) => {
  const { post, ricevute, finestra } = await setup(t);
  const out = await post({ ...finestra, 'Content-Type': 'text/plain' });
  assert.equal(out.status, 400);
  assert.equal(ricevute.length, 0);
});

test('PLAN-HTTP-ORIGIN-HALF: un Origin estraneo è rifiutato anche con Sec-Fetch-Site same-origin', async (t) => {
  const { port, post, ricevute } = await setup(t);
  for (const origin of [`http://127.0.0.1:${port === 65535 ? port - 1 : port + 1}`, 'null', `http://evil.example:${port}`]) {
    const out = await post({ Origin: origin, 'Sec-Fetch-Site': 'same-origin' });
    assert.equal(out.status, 403, origin);
    assert.equal(out.body.error.code, 'PLAN_APPROVAL_ORIGIN_FORBIDDEN');
  }
  const rebinding = await post({ Host: `attacker.example:${port}`, Origin: `http://attacker.example:${port}`, 'Sec-Fetch-Site': 'same-origin' });
  assert.equal(rebinding.status, 403, 'Host e Origin falsi ma coerenti (DNS rebinding)');
  assert.equal(ricevute.length, 0, 'nessuna scelta rifiutata arriva al registro');
});

test('PLAN-HTTP-FETCH-SITE-HALF: cross-site e same-site sono rifiutati anche con l’Origin esatto', async (t) => {
  const { port, post, ricevute } = await setup(t);
  for (const site of ['cross-site', 'same-site']) {
    const out = await post({ Origin: `http://127.0.0.1:${port}`, 'Sec-Fetch-Site': site });
    assert.equal(out.status, 403, site);
  }
  assert.equal(ricevute.length, 0);
});

test('PLAN-HTTP-NON-BROWSER: senza intestazioni passa solo col gettone (e il cookie)', async (t) => {
  const senzaGettone = await setup(t);
  const rifiutato = await senzaGettone.post({});
  assert.equal(rifiutato.status, 403);
  assert.equal(rifiutato.body.error.code, 'PLAN_APPROVAL_ORIGIN_FORBIDDEN');
  const token = 'b'.repeat(64);
  const conGettone = await setup(t, { token });
  assert.equal((await conGettone.post({})).status, 401, 'senza cookie tutta /api/ rifiuta');
  assert.equal((await conGettone.post({ Cookie: `talos_token=${token}` })).status, 200);
});

test('PLAN-HTTP-METHOD: GET sulla rotta è 405, non 404', async (t) => {
  const { port } = await setup(t);
  const out = await fetch(`http://127.0.0.1:${port}/api/v1/sessions/${SESSIONE}/plan-decision`);
  assert.equal(out.status, 405);
});
