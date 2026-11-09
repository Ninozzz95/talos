/*
 * Le notifiche dal dispositivo (contratto «notifiche», 31/10/2026, «Rotte e cursore»): `notifications.list/seen/seen-all` chiamano
 * il registro del PC come le rotte della finestra. Leggere è libero, «visto» non vuole consenso (non scrive in una cartella), e un
 * PC senza registro risponde UNKNOWN_OPERATION come un PC vecchio, così il telefono torna a `pending`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { creaRegistroNotifiche } from '../src/notifiche-registro.mjs';
import { creaOperazioni, OPERAZIONI_NOTIFICHE } from '../src/remoto/operazioni.mjs';

const CONTESTO = { dispositivo: { id: 'dispositivo-A1', nome: 'Pad' }, iscrizioni: new Map() };

async function prepara(t, { conRegistro = true } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'notifiche-ponte-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(dir));
  const registro = conRegistro ? creaRegistroNotifiche({ file: join(dir, 'n.jsonl'), adesso: () => Date.parse('2026-10-31T10:00:00.000Z') }) : null;
  if (registro) for (let i = 1; i <= 3; i++) await registro.scrivi({ id: `domanda:s:${i}`, fatto: 'domanda', cosa: { tipo: 'sessione', id: 's', nome: 'Una chat' }, istante: '2026-10-31T09:00:00.000Z' });
  const chiamate = [];
  /* il consenso delle cartelle c'è (un dispositivo vero lo ha): «visto» non deve mai chiederlo */
  const cartelle = { consentita: async () => { chiamate.push('consentita'); return false; }, descrivi: async () => null };
  const op = creaOperazioni({ chiama: async (x) => { chiamate.push(x.percorso); return { dati: null }; }, sessionRegistry: null, iscriviConRigiocata: null, cartelle, notifiche: registro });
  return { registro, op, chiamate };
}

test('NOTIF-PONTE-01 list with the cursor, seen by ids, seen-all up to a bound: the same answers as the window, no HTTP call', async (t) => {
  const { registro, op, chiamate } = await prepara(t);
  const tutto = await op.esegui('notifications.list', {}, CONTESTO);
  assert.equal(tutto.voci.length, 3);
  assert.equal(tutto.totaleDaFare, 3);
  assert.deepEqual((await op.esegui('notifications.list', { dopo: 2 }, CONTESTO)).voci.map((v) => v.id), ['domanda:s:3']);
  assert.equal((await op.esegui('notifications.seen', { ids: ['domanda:s:1'] }, CONTESTO)).cambiate, 1);
  const tutte = await op.esegui('notifications.seen-all', { finoA: 3 }, CONTESTO);
  assert.equal(tutte.cambiate, 2);
  assert.equal(tutte.ultimoSeq, await registro.ultimoSeq());
  assert.deepEqual(chiamate, [], 'no folder consent asked, no route of the PC called');
  for (const nome of OPERAZIONI_NOTIFICHE) assert.ok(op.elenco().includes(nome), nome);
});

test('NOTIF-PONTE-02 AL CONTRARIO: a bad cursor, a seen-all without bound, other keys: a refusal with its code, the register unchanged', async (t) => {
  const { registro, op } = await prepara(t);
  const prima = await registro.ultimoSeq();
  for (const [nome, args] of [['notifications.list', { dopo: -1 }], ['notifications.list', { dopo: 'abc' }], ['notifications.seen-all', {}],
    ['notifications.seen-all', { finoA: 9, tutto: true }], ['notifications.seen', { ids: [] }], ['notifications.seen', null]]) {
    await assert.rejects(op.esegui(nome, args, CONTESTO), (e) => e.code === 'QUERY_INVALID' && e.stato === 400, `${nome} ${JSON.stringify(args)}`);
  }
  assert.equal(await registro.ultimoSeq(), prima);
});

test('NOTIF-PONTE-03 a PC without the register answers like an old PC: not listed, UNKNOWN_OPERATION', async (t) => {
  const { op } = await prepara(t, { conRegistro: false });
  for (const nome of OPERAZIONI_NOTIFICHE) {
    assert.ok(!op.elenco().includes(nome), nome);
    await assert.rejects(op.esegui(nome, {}, CONTESTO), (e) => e.code === 'UNKNOWN_OPERATION');
  }
});
