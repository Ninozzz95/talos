import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createHttpApp, leggiCookie } from '../src/http-app.mjs';
import { creaGestoreTerminaleWs } from '../src/terminal-ws.mjs';

/*
 * ⭐⭐⭐ 04/9 — W1-10, il cancello a token della shell Electron. Solo quando
 * `token` è configurato: `GET /?token=<t>` imposta il cookie e rimanda a `/`;
 * `/api/*` senza cookie giusto è 401 AUTH_REQUIRED; l'upgrade WebSocket del
 * terminale senza cookie è 401. Senza token: tutto come oggi (browser-first).
 */
const TOKEN = 'ab'.repeat(32);

async function listen(t, deps) {
  const server = createServer(createHttpApp({ staticHandler: async () => null, ...deps }));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('TOKEN-01 — senza token configurato /api/v1/health resta aperta come oggi', async (t) => {
  const base = await listen(t, {});
  assert.equal((await fetch(`${base}/api/v1/health`)).status, 200);
});

test('TOKEN-02 — con token: /api/* senza cookie è 401 AUTH_REQUIRED; con il cookie giusto è 200; con uno sbagliato 401', async (t) => {
  const base = await listen(t, { token: TOKEN });
  const senza = await fetch(`${base}/api/v1/health`);
  assert.equal(senza.status, 401);
  assert.equal((await senza.json()).error.code, 'AUTH_REQUIRED');
  assert.equal((await fetch(`${base}/api/v1/health`, { headers: { cookie: `talos_token=${TOKEN}` } })).status, 200);
  assert.equal((await fetch(`${base}/api/v1/health`, { headers: { cookie: `altro=1; talos_token=${'x'.repeat(64)}` } })).status, 401);
});

test('TOKEN-03 — GET /?token=<t> imposta il cookie HttpOnly SameSite=Strict e rimanda a / ; un token sbagliato è 401', async (t) => {
  const base = await listen(t, { token: TOKEN });
  const r = await fetch(`${base}/?token=${TOKEN}`, { redirect: 'manual' });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/');
  const cookie = r.headers.get('set-cookie');
  assert.match(cookie, new RegExp(`^talos_token=${TOKEN}; HttpOnly; SameSite=Strict; Path=/$`));
  const sbagliato = await fetch(`${base}/?token=nope`, { redirect: 'manual' });
  assert.equal(sbagliato.status, 401);
});

test('TOKEN-04 — leggiCookie trova il nome giusto fra più cookie e ignora nomi simili', () => {
  assert.equal(leggiCookie({ headers: { cookie: 'a=1; talos_token=abc; b=2' } }, 'talos_token'), 'abc');
  assert.equal(leggiCookie({ headers: { cookie: 'xtalos_token=abc' } }, 'talos_token'), null);
  assert.equal(leggiCookie({ headers: {} }, 'talos_token'), null);
  assert.equal(leggiCookie(null, 'talos_token'), null);
});

function socketFinto() { return { scritture: [], distrutto: false, write(d) { this.scritture.push(d); }, destroy() { this.distrutto = true; } }; }
function registroFinto() { const voce = { ascoltatori: new Set(), backlog: [] }; return { apri: () => voce, scrivi() {}, ridimensiona() {}, segnaDisconnesso() {} }; }
class WssFinta { handleUpgrade(_req, _socket, _head, cb) { cb({ OPEN: 1, readyState: 1, send() {}, on() {} }); } }

test('TOKEN-05 — upgrade WebSocket del terminale: con token e senza cookie è 401 e il socket muore; col cookie passa; senza token configurato passa come oggi', () => {
  const conToken = creaGestoreTerminaleWs({ registro: registroFinto(), originiConsentite: null, risolviCartella: () => 'C:/x', token: TOKEN }, { WebSocketServer: WssFinta });
  const s1 = socketFinto();
  conToken.gestisciUpgrade({ url: '/api/v1/terminal/ws?id=s1', headers: {} }, s1, Buffer.alloc(0));
  assert.ok(s1.scritture.some((d) => /401 Unauthorized/.test(String(d))));
  assert.equal(s1.distrutto, true);
  const s2 = socketFinto();
  conToken.gestisciUpgrade({ url: '/api/v1/terminal/ws?id=s1', headers: { cookie: `talos_token=${TOKEN}` } }, s2, Buffer.alloc(0));
  assert.equal(s2.distrutto, false);
  assert.equal(s2.scritture.length, 0);
  const senzaToken = creaGestoreTerminaleWs({ registro: registroFinto(), originiConsentite: null, risolviCartella: () => 'C:/x' }, { WebSocketServer: WssFinta });
  const s3 = socketFinto();
  senzaToken.gestisciUpgrade({ url: '/api/v1/terminal/ws?id=s1', headers: {} }, s3, Buffer.alloc(0));
  assert.equal(s3.distrutto, false);
});
