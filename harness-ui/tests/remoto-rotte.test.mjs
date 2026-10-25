import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createHttpApp } from '../src/http-app.mjs';
import { OPERAZIONI_HTTP } from '../src/remoto/operazioni.mjs';
import { ID_CATALOGO_IN_UI } from '../src/provider-registry.mjs';
import { PREFISSO_ROTTE_REMOTO } from '../src/remoto/rotte.mjs';

/*
 * 18/10/2026 — controllo remoto, le rotte della FINESTRA (`/api/v1/remote…`) sul gestore vero: le scritture solo dalla finestra di
 * TALOS (collegare un telefono dà l'Accesso pieno), corpi stretti, errori dichiarati col loro stato, un guasto sconosciuto NON
 * travestito da «non disponibile». E nessuna operazione del telefono può arrivare qui.
 */
function remotoFinto() {
  const chiamate = [];
  return {
    chiamate,
    stato: async () => ({ acceso: false, sceltaFatta: false, telefoni: [] }),
    imposta: async (x) => { chiamate.push(['imposta', x]); if (x.relay?.modo === 'rotto') throw new TypeError('x is undefined'); return { acceso: x.acceso ?? false }; },
    apriAccoppiamento: async () => { chiamate.push(['apri']); throw Object.assign(new Error('no'), { code: 'REMOTE_RELAY_NOT_CHOSEN' }); },
    chiudiAccoppiamento: (g) => chiamate.push(['chiudi', g]),
    conferma: async (id) => { chiamate.push(['conferma', id]); return { id: 'tel-1' }; },
    rifiuta: (id) => { chiamate.push(['rifiuta', id]); return true; },
    rinomina: async (id, nome) => ({ id, nome }),
    revoca: async (id) => { chiamate.push(['revoca', id]); return { id, revocatoDa: 'pc' }; },
  };
}

async function banco(t, { remoto = remotoFinto(), token = null } = {}) {
  const server = createServer(createHttpApp({ staticHandler: async () => null, remotoFn: () => remoto, token }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const finestra = { origin: base, 'sec-fetch-site': 'same-origin' };
  const chiedi = async (percorso, { metodo = 'GET', corpo, intestazioni = finestra } = {}) => {
    const r = await fetch(base + percorso, { method: metodo, headers: { 'content-type': 'application/json', ...intestazioni }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    return { stato: r.status, json: await r.json().catch(() => null), intestazioni: r.headers };
  };
  return { remoto, chiedi, base };
}

test('ROT-01 dalla finestra: stato, scelta del relay, conferma, rifiuto, revoca arrivano al remoto', async (t) => {
  const b = await banco(t);
  assert.deepEqual((await b.chiedi('/api/v1/remote')).json.data, { acceso: false, sceltaFatta: false, telefoni: [] });
  assert.equal((await b.chiedi('/api/v1/remote/settings', { metodo: 'POST', corpo: { relay: { modo: 'n0' }, acceso: true } })).stato, 200);
  assert.equal((await b.chiedi('/api/v1/remote/pair/abcdefgh12345678/confirm', { metodo: 'POST', corpo: {} })).json.data.telefono.id, 'tel-1');
  assert.equal((await b.chiedi('/api/v1/remote/pair/abcdefgh12345678/reject', { metodo: 'POST', corpo: {} })).json.data.rifiutato, true);
  assert.equal((await b.chiedi('/api/v1/remote/phones/abcdefgh12345678/revoke', { metodo: 'POST', corpo: {} })).json.data.telefono.revocatoDa, 'pc');
  assert.deepEqual(b.remoto.chiamate.map((c) => c[0]), ['imposta', 'conferma', 'rifiuta', 'revoca']);
});

test('ROT-02 un sito estraneo e un processo senza gettone NON collegano telefoni: 403 e il remoto non è toccato', async (t) => {
  const b = await banco(t);
  const estraneo = await b.chiedi('/api/v1/remote/pair', { metodo: 'POST', corpo: {}, intestazioni: { origin: 'https://cattivo.example', 'sec-fetch-site': 'cross-site' } });
  /* il sito estraneo lo ferma già la guardia unica delle scritture (0.1.25), prima di arrivare qui */
  assert.equal(estraneo.stato, 403); assert.equal(estraneo.json.error.code, 'ORIGIN_FORBIDDEN');
  const senza = await b.chiedi('/api/v1/remote/phones/abcdefgh12345678/revoke', { metodo: 'POST', corpo: {}, intestazioni: {} });
  assert.equal(senza.stato, 403); assert.equal(senza.json.error.code, 'REMOTE_ORIGIN_FORBIDDEN', 'senza finestra e senza gettone: la guardia del remoto');
  assert.deepEqual(b.remoto.chiamate, []);
});

test('ROT-03 errori dichiarati col loro stato; corpi stretti; un guasto sconosciuto è 500, non «non disponibile»', async (t) => {
  const b = await banco(t);
  const r = await b.chiedi('/api/v1/remote/pair', { metodo: 'POST', corpo: {} });
  assert.equal(r.stato, 409); assert.equal(r.json.error.code, 'REMOTE_RELAY_NOT_CHOSEN');
  assert.equal((await b.chiedi('/api/v1/remote/settings', { metodo: 'POST', corpo: { acceso: 'si' } })).json.error.code, 'QUERY_INVALID');
  assert.equal((await b.chiedi('/api/v1/remote/settings', { metodo: 'POST', corpo: { altro: 1 } })).json.error.code, 'QUERY_INVALID');
  assert.equal((await b.chiedi('/api/v1/remote/pair/corto/confirm', { metodo: 'POST', corpo: {} })).json.error.code, 'QUERY_INVALID');
  const rotto = await b.chiedi('/api/v1/remote/settings', { metodo: 'POST', corpo: { relay: { modo: 'rotto' } } });
  assert.equal(rotto.stato, 500); assert.equal(rotto.json.error.code, 'INTERNAL_ERROR');
  assert.equal((await b.chiedi('/api/v1/remote/pair', { metodo: 'GET' })).stato, 405);
  assert.equal((await b.chiedi('/api/v1/remote/niente', { metodo: 'GET' })).stato, 404);
});

test('ROT-04 senza remoto (server senza portachiavi o prove): 503 «non disponibile»', async (t) => {
  const b = await banco(t, { remoto: null });
  const r = await b.chiedi('/api/v1/remote');
  assert.equal(r.stato, 503); assert.equal(r.json.error.code, 'REMOTE_UNAVAILABLE');
});

test('ROT-05 nessuna operazione del telefono porta sotto /api/v1/remote', () => {
  for (const [nome, voce] of Object.entries(OPERAZIONI_HTTP)) {
    const percorso = voce.percorso({ sessionId: 's-1', turn: 1, serverId: 'srv', provider: ID_CATALOGO_IN_UI[0], // R5.11 il turno, R5.8 il server MCP, R-M4 bis il fornitore
      compactionAt: '2026-10-24T09:00:00.000Z', toolCallId: 'call_1', messageId: 'm-1' }); // parità punti 2 e 4 (24/10): compattazione, processo, messaggio
    assert.ok(!percorso.startsWith(PREFISSO_ROTTE_REMOTO), `${nome} → ${percorso}`);
  }
});
