/*
 * ⭐⭐⭐ /goal, fase G1 (owner 14/10/2026: «Sì, parti dal server») — LE PORTE HTTP DELL'OBIETTIVO, dalla richiesta alla busta.
 *
 *   GET  /api/v1/sessions/:id/goal            → { obiettivo }            (null se non c'è)
 *   POST /api/v1/sessions/:id/goal  {testo}   → { ok, obiettivo }        (uno NUOVO, attivo)
 *   POST /api/v1/sessions/:id/goal/pausa      → { ok, obiettivo, invariato? }
 *   POST /api/v1/sessions/:id/goal/riprendi   → { ok, obiettivo, invariato? }
 *   POST /api/v1/sessions/:id/goal/togli      → { ok, obiettivo: null, invariato? }
 *
 * Il registro è quello VERO (giornale su disco): qui si prova che cosa arriva a chi chiama — stato HTTP, codice, motivo, valori
 * della frase — e che l'interfaccia trova la sua frase nelle due lingue. Codex ha le stesse porte (`thread/goal/get|set|clear`,
 * app-server-protocol v2, letto nel clone il 12/10/2026).
 */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import test from 'node:test';

import { createHttpApp, metodiAmmessiPerRotta } from '../src/http-app.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { TESTO_MASSIMO } from '../src/obiettivo/stato.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const passo = () => new Promise((r) => setImmediate(r));

async function banco(t) {
  const cartellaStore = cartellaDiProva('talos-obiettivo-http-');
  const giri = [];
  const registro = createSessionRegistry({
    guardaWorkspaceFn: () => () => {}, cartellaStore, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    obiettiviNellaChat: true, // OB-REV-01 (15/10): come il server desktop; senza, la porta della persona rifiuta l'obiettivo
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    avviaSessioneFn: (input) => {
      let risolvi;
      const attesa = new Promise((r) => { risolvi = r; });
      giri.push({ concludi: () => { input.onEvento({ type: 'RunFinished', threadId: 't', runId: `r${giri.length}` }); risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'r' }] } }); } });
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${giri.length}`, input: input.task });
      return attesa;
    },
  });
  const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry: registro }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await attendiScritture({ cartellaStore }).catch(() => {});
    rimuoviCartellaDiProva(cartellaStore);
  });
  const { sessionId } = registro.avvia('task-vero');
  giri.at(-1).concludi();
  await passo();
  const base = `http://127.0.0.1:${server.address().port}/api/v1/sessions/${sessionId}/goal`;
  const chiedi = async (percorso = '', { metodo = 'GET', corpo, grezzo } = {}) => {
    const r = await fetch(`${base}${percorso}`, {
      method: metodo,
      ...(corpo !== undefined || grezzo !== undefined ? { headers: { 'content-type': 'application/json' }, body: grezzo ?? JSON.stringify(corpo) } : {}),
    });
    const testo = await r.text();
    return { stato: r.status, allow: r.headers.get('allow'), json: testo ? JSON.parse(testo) : null };
  };
  return { registro, giri, sessionId, chiedi, cartellaStore, radice: `http://127.0.0.1:${server.address().port}` };
}

test('GOAL-HTTP-01 — the whole life of a goal through its doors: none, set, paused, resumed, removed — and what each answer carries', async (t) => {
  const { chiedi, giri } = await banco(t);
  const giriPrima = giri.length;
  const vuoto = await chiedi();
  assert.equal(vuoto.stato, 200);
  assert.deepEqual(vuoto.json.data, { obiettivo: null });
  assert.equal(vuoto.json.ok, true);

  const impostato = await chiedi('', { metodo: 'POST', corpo: { testo: '  all tests in tests/auth pass  ' } });
  assert.equal(impostato.stato, 200, JSON.stringify(impostato.json));
  assert.equal(impostato.json.data.ok, true);
  const obiettivo = impostato.json.data.obiettivo;
  assert.equal(obiettivo.stato, 'attivo');
  assert.equal(obiettivo.testo, 'all tests in tests/auth pass');
  assert.deepEqual((await chiedi()).json.data, { obiettivo }, 'reading gives back what setting returned');

  const pausa = await chiedi('/pausa', { metodo: 'POST' });
  assert.equal(pausa.stato, 200);
  assert.equal(pausa.json.data.obiettivo.stato, 'in-pausa');
  assert.deepEqual(pausa.json.data.obiettivo.motivo, { tipo: 'persona' });
  assert.ok(!('invariato' in pausa.json.data));
  const ancora = await chiedi('/pausa', { metodo: 'POST', corpo: {} });
  assert.equal(ancora.stato, 200);
  assert.equal(ancora.json.data.invariato, true, 'a second Pause is not an error: it says nothing changed');
  assert.deepEqual(ancora.json.data.obiettivo, pausa.json.data.obiettivo);

  const ripresa = await chiedi('/riprendi', { metodo: 'POST' });
  assert.equal(ripresa.json.data.obiettivo.stato, 'attivo');
  assert.equal(ripresa.json.data.obiettivo.revisione, 3);
  const tolto = await chiedi('/togli', { metodo: 'POST' });
  assert.deepEqual(tolto.json.data, { ok: true, obiettivo: null });
  assert.deepEqual((await chiedi()).json.data, { obiettivo: null });
  await passo();
  assert.equal(giri.length, giriPrima, 'G1: none of these doors starts a turn');
});

test('GOAL-HTTP-02 — AL CONTRARIO: a body of the wrong shape is a 400 before anything is touched', async (t) => {
  const { chiedi } = await banco(t);
  const corpiSbagliati = [{}, { testo: 5 }, { testo: null }, { testo: 'x', altro: 1 }, { obiettivo: 'x' }, [], ['x'], 'x', null];
  for (const corpo of corpiSbagliati) {
    const r = await chiedi('', { metodo: 'POST', corpo });
    assert.equal(r.stato, 400, `POST /goal ${JSON.stringify(corpo)}`);
    assert.equal(r.json.error.code, 'QUERY_INVALID');
  }
  assert.equal((await chiedi('', { metodo: 'POST', grezzo: '{non json' })).stato, 400);
  assert.equal((await chiedi('', { metodo: 'POST' })).stato, 400, 'no body at all is not a goal');
  assert.deepEqual((await chiedi()).json.data, { obiettivo: null }, 'nothing was set by any of them');

  await chiedi('', { metodo: 'POST', corpo: { testo: 'a goal' } });
  for (const azione of ['/pausa', '/riprendi', '/togli']) {
    for (const corpo of [{ a: 1 }, ['x'], 'x', { testo: 'x' }]) {
      const r = await chiedi(azione, { metodo: 'POST', corpo });
      assert.equal(r.stato, 400, `POST ${azione} ${JSON.stringify(corpo)}`);
      assert.equal(r.json.error.code, 'QUERY_INVALID');
    }
  }
  assert.equal((await chiedi()).json.data.obiettivo.stato, 'attivo', 'and the goal is as it was: none of the malformed actions ran');
  assert.equal((await chiedi('?x=1')).stato, 400, 'a query string is not part of this door');
  assert.equal((await chiedi('/pausa?x=1', { metodo: 'POST' })).stato, 400);
});


test('GOAL-HTTP-04 — the doors that do not exist: an unknown conversation is a 404, a wrong verb a 405 that says the right ones, an unknown action a 404', async (t) => {
  const { chiedi, radice, sessionId } = await banco(t);
  for (const [percorso, opzioni] of [['', {}], ['', { metodo: 'POST', corpo: { testo: 'x' } }], ['/pausa', { metodo: 'POST' }], ['/riprendi', { metodo: 'POST' }], ['/togli', { metodo: 'POST' }]]) {
    const r = await fetch(`${radice}/api/v1/sessions/non-esiste/goal${percorso}`, {
      method: opzioni.metodo ?? 'GET',
      ...(opzioni.corpo ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(opzioni.corpo) } : {}),
    });
    const json = await r.json();
    assert.equal(r.status, 404, `${opzioni.metodo ?? 'GET'} ${percorso}`);
    assert.equal(json.error.code, 'NOT_FOUND');
    assert.equal(json.error.reason, 'session-not-found');
  }
  const getSuAzione = await chiedi('/pausa');
  assert.equal(getSuAzione.stato, 405, 'reading an action is not a thing');
  assert.equal(getSuAzione.allow, 'POST');
  const put = await chiedi('', { metodo: 'PUT', corpo: { testo: 'x' } });
  assert.equal(put.stato, 405);
  assert.equal(put.allow, 'GET, HEAD, POST');
  assert.equal((await chiedi('/elimina', { metodo: 'POST' })).stato, 404, 'an action that was never declared is not found');
  assert.equal((await chiedi('/pausa/ancora', { metodo: 'POST' })).stato, 404);
  // l'inventario delle rotte dice lo stesso che la catena serve
  assert.deepEqual(metodiAmmessiPerRotta(`/api/v1/sessions/${sessionId}/goal`), ['GET', 'HEAD', 'POST']);
  for (const azione of ['pausa', 'riprendi', 'togli']) assert.deepEqual(metodiAmmessiPerRotta(`/api/v1/sessions/${sessionId}/goal/${azione}`), ['POST'], azione);
  assert.equal(metodiAmmessiPerRotta(`/api/v1/sessions/${sessionId}/goal/elimina`), null);
});

