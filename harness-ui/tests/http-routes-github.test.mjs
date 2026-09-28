/**
 * http-routes-github.test.mjs — F6-3 (27/09/2026): le rotte GitHub attraverso il livello HTTP vero, con un `ghService` finto
 * che registra cosa riceve. Il servizio vero (col `gh` finto) è provato in `gh-service.test.mjs`; qui si prova che ogni
 * rotta arriva alla porta giusta con gli argomenti giusti, e che le domande sbagliate si fermano PRIMA (query, chiavi, tipi).
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';

function servizioFinto(risposte = {}) {
  const chiamate = [];
  const porta = (nome) => async (argomenti) => { chiamate.push([nome, argomenti ?? null]); return risposte[nome] ?? { ok: true, porta: nome }; };
  return { chiamate, servizio: { stato: porta('stato'), installa: porta('installa'), collega: porta('collega'), annullaCollegamento: porta('annullaCollegamento'), pullRequest: porta('pullRequest'), controlli: porta('controlli'), bozza: porta('bozza'), crea: porta('crea') } };
}

async function servi(t, ghService) {
  const app = createHttpApp({ staticHandler: async () => null, sessionRegistry: { cartellaDi: () => null }, ghService });
  const server = createServer(app);
  await new Promise((ok, ko) => { server.once('error', ko); server.listen(0, '127.0.0.1', ok); });
  t.after(() => new Promise((ok) => server.close(ok)));
  return `http://127.0.0.1:${server.address().port}`;
}
const posta = (corpo) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });

test('GH-HTTP-01 — le GET arrivano alla porta giusta: stato, PR della sessione, bozza con `base`, controlli col numero', async (t) => {
  const { servizio, chiamate } = servizioFinto({ stato: { gh: { trovato: true } } });
  const url = await servi(t, servizio);
  let r = await fetch(`${url}/api/v1/github/status`);
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).data, { gh: { trovato: true } });
  assert.equal((await fetch(`${url}/api/v1/sessions/s%201/github/pulls`)).status, 200);
  assert.equal((await fetch(`${url}/api/v1/sessions/s1/github/pull-draft?base=rilascio`)).status, 200);
  assert.equal((await fetch(`${url}/api/v1/sessions/s1/github/pull-draft`)).status, 200);
  assert.equal((await fetch(`${url}/api/v1/sessions/s1/github/pulls/42/checks`)).status, 200);
  assert.deepEqual(chiamate, [
    ['stato', null],
    ['pullRequest', { sessionId: 's 1' }],
    ['bozza', { sessionId: 's1', base: 'rilascio' }],
    ['bozza', { sessionId: 's1', base: null }],
    ['controlli', { sessionId: 's1', numero: 42 }],
  ]);
});

test('GH-HTTP-02 — al contrario, le GET: una query non prevista o ripetuta, o un numero di PR non valido, si ferma (400) e non arriva al servizio', async (t) => {
  const { servizio, chiamate } = servizioFinto();
  const url = await servi(t, servizio);
  for (const indirizzo of [
    '/api/v1/github/status?x=1', '/api/v1/sessions/s1/github/pulls?stato=aperte', '/api/v1/sessions/s1/github/pull-draft?base=a&base=b',
    '/api/v1/sessions/s1/github/pull-draft?base=a&altro=1', '/api/v1/sessions/s1/github/pulls/3/checks?x=1',
    '/api/v1/sessions/s1/github/pulls/0/checks', '/api/v1/sessions/s1/github/pulls/x/checks', '/api/v1/sessions/s1/github/pulls/012/checks',
    '/api/v1/sessions/s1/github/pulls/1234567890/checks', '/api/v1/sessions/s1/github/pulls/--web/checks',
  ]) {
    const r = await fetch(`${url}${indirizzo}`);
    assert.equal(r.status, 400, indirizzo);
    assert.equal((await r.json()).error.code, 'QUERY_INVALID', indirizzo);
  }
  assert.deepEqual(chiamate, []);
});

test('GH-HTTP-03 — le POST: installa, collega, annulla (corpo vuoto) e crea (quattro chiavi, bozza booleana)', async (t) => {
  const { servizio, chiamate } = servizioFinto({ crea: { ok: true, url: 'https://github.com/a/b/pull/1', numero: 1 } });
  const url = await servi(t, servizio);
  for (const azione of ['install', 'login', 'login-cancel']) assert.equal((await fetch(`${url}/api/v1/github/${azione}`, posta({}))).status, 200, azione);
  const r = await fetch(`${url}/api/v1/sessions/s1/github/pulls`, posta({ titolo: 'Titolo', testo: 'Testo', base: 'main', bozza: true }));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).data.numero, 1);
  await fetch(`${url}/api/v1/sessions/s1/github/pulls`, posta({ titolo: 'Senza testo', base: 'main' }));
  assert.deepEqual(chiamate, [
    ['installa', null], ['collega', null], ['annullaCollegamento', null],
    ['crea', { sessionId: 's1', titolo: 'Titolo', testo: 'Testo', base: 'main', bozza: true }],
    ['crea', { sessionId: 's1', titolo: 'Senza testo', testo: '', base: 'main', bozza: false }],
  ]);
});

test('GH-HTTP-04 — al contrario, le POST: chiavi in più, bozza non booleana, corpo non oggetto o query ⇒ 400 senza toccare il servizio; DELETE ⇒ 405 con Allow', async (t) => {
  const { servizio, chiamate } = servizioFinto();
  const url = await servi(t, servizio);
  const casi = [
    [`${url}/api/v1/github/login`, posta({ hostname: 'altro.example' })],
    [`${url}/api/v1/github/install`, posta({ versione: '1.0.0' })],
    [`${url}/api/v1/sessions/s1/github/pulls`, posta({ titolo: 'x', base: 'main', head: 'altro' })],
    [`${url}/api/v1/sessions/s1/github/pulls`, posta({ titolo: 'x', base: 'main', bozza: 'si' })],
    [`${url}/api/v1/sessions/s1/github/pulls`, posta(['x'])],
    [`${url}/api/v1/sessions/s1/github/pulls?repo=x/y`, posta({ titolo: 'x', base: 'main' })],
  ];
  for (const [indirizzo, opzioni] of casi) {
    const r = await fetch(indirizzo, opzioni);
    assert.equal(r.status, 400, `${indirizzo} ${opzioni.body}`);
  }
  assert.deepEqual(chiamate, []);
  const r = await fetch(`${url}/api/v1/sessions/s1/github/pulls`, { method: 'DELETE' });
  assert.equal(r.status, 405);
  assert.equal(r.headers.get('allow'), 'GET, HEAD, POST', 'chi accetta GET accetta anche HEAD');
});

test('GH-HTTP-05 — un rifiuto del servizio esce col suo codice e lo stato giusto: 409 ramo non inviato, 409 non collegato, 422 base, 502 GitHub, 504 tempo', async (t) => {
  const casi = [['GH_BRANCH_NOT_PUSHED', 409], ['GH_NOT_LOGGED_IN', 409], ['GH_NOT_INSTALLED', 409], ['GH_BASE_UNKNOWN', 422], ['GH_COMMAND_FAILED', 502], ['GH_CHECKSUM_MISMATCH', 502], ['GH_TIMEOUT', 504], ['GIT_DETACHED', 409]];
  for (const [codice, statoHttp] of casi) {
    const { servizio } = servizioFinto({ crea: { erroreAvvio: 'no', code: codice }, pullRequest: { erroreAvvio: 'no', code: codice } });
    const url = await servi(t, servizio);
    const r = await fetch(`${url}/api/v1/sessions/s1/github/pulls`, posta({ titolo: 'x', base: 'main' }));
    assert.equal(r.status, statoHttp, codice);
    assert.equal((await r.json()).error.code, codice);
    assert.equal((await fetch(`${url}/api/v1/sessions/s1/github/pulls`)).status, statoHttp, `${codice} (GET)`);
  }
});

test('GH-HTTP-06 — senza servizio: le POST rispondono 503 GH_STORE_UNAVAILABLE, mai un 500', async (t) => {
  const url = await servi(t, null);
  const r = await fetch(`${url}/api/v1/github/login`, posta({}));
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error.code, 'GH_STORE_UNAVAILABLE');
});
