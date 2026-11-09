/*
 * Le rotte delle notifiche del PC (contratto 31/10/2026, «Rotte e cursore»): GET col cursore, seen per ids, seen-all con confine.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { creaRegistroNotifiche } from '../src/notifiche-registro.mjs';
import { creaRotteNotifiche } from '../src/notifiche-rotte.mjs';

async function prepara(t) {
  const dir = await mkdtemp(join(tmpdir(), 'notifiche-rotte-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(dir));
  const registro = creaRegistroNotifiche({ file: join(dir, 'n.jsonl'), adesso: () => Date.parse('2026-10-31T10:00:00.000Z') });
  for (let i = 1; i <= 3; i++) await registro.scrivi({ id: `permesso:s:${i}`, fatto: 'approvazione', azione: 'scrivere', cosa: { tipo: 'sessione', id: 's', nome: 'Una chat' }, istante: '2026-10-31T09:00:00.000Z' });
  return { registro, rotta: creaRotteNotifiche({ registro }) };
}
const q = (s) => new URLSearchParams(s);

test('NOTIF-ROTTE-01 GET reads after the cursor and gives the to-do count', async (t) => {
  const { rotta } = await prepara(t);
  const tutto = await rotta({ method: 'GET', percorso: '/api/v1/notifications', query: q('') });
  assert.equal(tutto.stato, 200);
  assert.equal(tutto.dati.voci.length, 3);
  assert.equal(tutto.dati.totaleDaFare, 3);
  const dopo = await rotta({ method: 'GET', percorso: '/api/v1/notifications', query: q('dopo=2') });
  assert.deepEqual(dopo.dati.voci.map((v) => v.id), ['permesso:s:3']);
  assert.equal((await rotta({ method: 'GET', percorso: '/api/v1/notifications', query: q('dopo=abc') })).errore.code, 'QUERY_INVALID');
});

test('NOTIF-ROTTE-02 seen marks the given ids; seen-all needs its bound', async (t) => {
  const { rotta } = await prepara(t);
  const visti = await rotta({ method: 'POST', percorso: '/api/v1/notifications/seen', corpo: { ids: ['permesso:s:1'] } });
  assert.equal(visti.stato, 200);
  assert.equal(visti.dati.cambiate, 1);
  assert.equal(visti.dati.ultimoSeq, 4, 'the state change moved seq');
  const senzaConfine = await rotta({ method: 'POST', percorso: '/api/v1/notifications/seen-all', corpo: {} });
  assert.equal(senzaConfine.stato, 400);
  assert.equal(senzaConfine.errore.code, 'QUERY_INVALID');
  const conConfine = await rotta({ method: 'POST', percorso: '/api/v1/notifications/seen-all', corpo: { finoA: 3 } });
  assert.equal(conConfine.dati.cambiate, 2, 'entries 2 and 3; entry 1 was already seen');
});

test('NOTIF-ROTTE-03 a body with other keys, an empty id list, a wrong method, no register: each its own answer', async (t) => {
  const { rotta } = await prepara(t);
  assert.equal((await rotta({ method: 'POST', percorso: '/api/v1/notifications/seen', corpo: { ids: [] } })).errore.code, 'QUERY_INVALID');
  assert.equal((await rotta({ method: 'POST', percorso: '/api/v1/notifications/seen', corpo: { ids: ['x'], tutti: true } })).errore.code, 'QUERY_INVALID');
  assert.equal((await rotta({ method: 'POST', percorso: '/api/v1/notifications/seen-all', corpo: { finoA: 2, tutto: true } })).errore.code, 'QUERY_INVALID');
  const metodo = await rotta({ method: 'POST', percorso: '/api/v1/notifications', corpo: {} });
  assert.equal(metodo.stato, 405);
  assert.equal(metodo.allow, 'GET');
  const senza = await creaRotteNotifiche({ registro: null })({ method: 'GET', percorso: '/api/v1/notifications', query: q('') });
  assert.equal(senza.stato, 503);
  assert.equal(senza.errore.code, 'NOTIFICATIONS_UNAVAILABLE');
});
