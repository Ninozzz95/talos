import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { OPERAZIONI_HTTP } from '../src/remoto/operazioni.mjs';

/*
 * 18/10/2026 — R5.11, le rotte di «Annulla le modifiche ai file» sul gestore HTTP vero e le tre operazioni del telefono che ci
 * portano. Il registro è finto: qui si prova la forma (turno nel percorso, corpo stretto, rifiuti col loro stato), il lavoro vero
 * sta in punti-di-ripristino.test.mjs e punti-di-ripristino-registro.test.mjs.
 */
function registroFinto() {
  const chiamate = [];
  return {
    chiamate,
    puntiDiRipristinoDi: async (id) => { chiamate.push(['punti', id]); return { ok: true, disponibile: true, punti: [{ turno: 2, annullabile: true }] }; },
    anteprimaAnnulla: async (id, turno) => { chiamate.push(['anteprima', id, turno]); return { ok: true, turno, ripristina: [{ stato: 'M', percorso: 'a.txt' }], salta: [], diff: '' }; },
    annullaModifiche: async (id, turno, includi) => {
      chiamate.push(['annulla', id, turno, includi]);
      if (id === 'occupata') return { erroreAvvio: 'A conversation is working in this folder: undo when it has finished.', code: 'SESSION_NOT_READY', reason: 'undo-while-working' };
      return { ok: true, ripristinati: ['a.txt'] };
    },
    rifaiAnnullamento: async (id) => { chiamate.push(['rifai', id]); return { ok: true, rifatti: ['a.txt'], saltati: [] }; },
  };
}

async function banco(t) {
  const sessionRegistry = registroFinto();
  const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const chiedi = async (percorso, { metodo = 'GET', corpo } = {}) => {
    const r = await fetch(base + percorso, { method: metodo, headers: { 'content-type': 'application/json', origin: base, 'sec-fetch-site': 'same-origin' }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    return { stato: r.status, json: await r.json().catch(() => null) };
  };
  return { chiedi, registro: sessionRegistry };
}

test('UND-01 elenco, anteprima e annullamento arrivano al registro col turno come numero', async (t) => {
  const b = await banco(t);
  assert.equal((await b.chiedi('/api/v1/sessions/s-1/file-undo')).json.data.punti[0].turno, 2);
  assert.equal((await b.chiedi('/api/v1/sessions/s-1/file-undo/2')).json.data.ripristina[0].percorso, 'a.txt');
  const r = await b.chiedi('/api/v1/sessions/s-1/file-undo/2', { metodo: 'POST', corpo: { include: ['b.txt'] } });
  assert.deepEqual([r.stato, r.json.data.ripristinati], [200, ['a.txt']]);
  assert.deepEqual(b.registro.chiamate, [['punti', 's-1'], ['anteprima', 's-1', 2], ['annulla', 's-1', 2, ['b.txt']]]);
});

test('UND-02 al contrario: un turno non canonico è 404, un corpo con altre chiavi è 400, e il registro non è toccato', async (t) => {
  const b = await banco(t);
  for (const turno of ['01', '-1', '1.5', 'x', '1e3']) {
    assert.equal((await b.chiedi(`/api/v1/sessions/s-1/file-undo/${turno}`)).stato, 404, turno);
  }
  assert.equal((await b.chiedi('/api/v1/sessions/s-1/file-undo/2', { metodo: 'POST', corpo: { include: ['a'], forza: true } })).stato, 400);
  assert.equal((await b.chiedi('/api/v1/sessions/s-1/file-undo/2', { metodo: 'POST', corpo: { include: 'a' } })).stato, 400);
  assert.equal((await b.chiedi('/api/v1/sessions/s-1/file-undo/2', { metodo: 'POST', corpo: { include: [''] } })).stato, 400);
  assert.equal((await b.chiedi('/api/v1/sessions/s-1/file-undo', { metodo: 'POST', corpo: {} })).stato, 405, 'l\'elenco non si scrive');
  assert.equal((await b.chiedi('/api/v1/sessions/s-1/file-undo/2?x=1')).stato, 400);
  assert.deepEqual(b.registro.chiamate, []);
});

test('UND-03 una conversazione che lavora nella cartella: 409 col motivo', async (t) => {
  const b = await banco(t);
  const r = await b.chiedi('/api/v1/sessions/occupata/file-undo/1', { metodo: 'POST', corpo: {} });
  assert.equal(r.stato, 409);
  assert.equal(r.json.error.code, 'SESSION_NOT_READY');
});

test('UND-05 «Rifai»: POST con corpo vuoto arriva al registro; GET, o un corpo con chiavi, no', async (t) => {
  const b = await banco(t);
  assert.equal((await b.chiedi('/api/v1/sessions/s-1/file-undo/redo')).stato, 405);
  assert.equal((await b.chiedi('/api/v1/sessions/s-1/file-undo/redo', { metodo: 'POST', corpo: { forza: true } })).stato, 400);
  const r = await b.chiedi('/api/v1/sessions/s-1/file-undo/redo', { metodo: 'POST', corpo: {} });
  assert.deepEqual([r.stato, r.json.data.rifatti], [200, ['a.txt']]);
  assert.deepEqual(b.registro.chiamate, [['rifai', 's-1']]);
  assert.equal(OPERAZIONI_HTTP['session.undo.redo'].percorso({ sessionId: 's-1' }), '/api/v1/sessions/s-1/file-undo/redo');
});

test('UND-04 dal telefono: tre voci fisse, il turno solo come intero, mai un percorso scelto da fuori', () => {
  assert.equal(OPERAZIONI_HTTP['session.undo.list'].percorso({ sessionId: 's-1' }), '/api/v1/sessions/s-1/file-undo');
  assert.equal(OPERAZIONI_HTTP['session.undo.preview'].percorso({ sessionId: 's-1', turn: 3 }), '/api/v1/sessions/s-1/file-undo/3');
  const u = OPERAZIONI_HTTP['session.undo'];
  assert.deepEqual([u.metodo, u.percorso({ sessionId: 's-1', turn: 3 })], ['POST', '/api/v1/sessions/s-1/file-undo/3']);
  for (const turn of ['3', '../x', -1, 1.5, null, undefined, 1e12]) {
    assert.throws(() => u.percorso({ sessionId: 's-1', turn }), { code: 'BAD_MESSAGE' }, String(turn));
  }
});
