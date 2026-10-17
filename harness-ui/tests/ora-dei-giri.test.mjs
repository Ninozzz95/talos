/*
 * ⭐ 15/10/2026 (richiesta della sessione mobile, K3) — l'inizio e la fine di ogni giro portano l'istante (`timestamp` di AG-UI, in
 * millisecondi), dal vivo E nella storia rigiocata dopo un riavvio: prima la storia non aveva nessuna ora, e il Codice del mobile
 * mostrava i messaggi senza «1 min fa».
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { conStore, conversazioneFerma, passo, registroAGiri, riavvia } from './aiuto/banco-obiettivo.mjs';

const tipiDelGiro = new Set(['RunStarted', 'RunFinished', 'RunError']);
function eventiDelGiro(registro, sessionId) {
  const visti = [];
  const stacca = registro.iscriviti(sessionId, (e) => { if (tipiDelGiro.has(e.type)) visti.push(e); }, 0);
  stacca?.();
  return visti;
}

test('ORA-GIRI-01 — inizio e fine di ogni giro portano `timestamp` in millisecondi, anche un giro fallito', async (t) => conStore(t, async (cartellaStore) => {
  const prima = Date.now();
  const b = registroAGiri(cartellaStore);
  const sessionId = await conversazioneFerma(b);
  b.registro.resume(sessionId, 'secondo giro');
  await passo();
  b.giri.at(-1).fallisci('PROVIDER_DOWN', [{ role: 'user', content: 'c' }]);
  await passo(); await passo();
  const dopo = Date.now();
  const visti = eventiDelGiro(b.registro, sessionId);
  assert.deepEqual(visti.map((e) => e.type), ['RunStarted', 'RunFinished', 'RunStarted', 'RunError']);
  for (const e of visti) {
    assert.equal(typeof e.timestamp, 'number', e.type);
    assert.ok(e.timestamp >= prima && e.timestamp <= dopo, `${e.type}: ${e.timestamp} fuori da [${prima}, ${dopo}]`);
  }
  assert.ok(visti[1].timestamp >= visti[0].timestamp, 'la fine non viene prima dell\'inizio');
}));

test('ORA-GIRI-02 — dopo un riavvio la storia rigiocata porta le STESSE ore', async (t) => conStore(t, async (cartellaStore) => {
  const b = registroAGiri(cartellaStore);
  const sessionId = await conversazioneFerma(b);
  const dalVivo = eventiDelGiro(b.registro, sessionId).map((e) => [e.type, e.timestamp]);
  const nuovo = await riavvia(cartellaStore);
  const rigiocati = eventiDelGiro(nuovo.registro, sessionId).map((e) => [e.type, e.timestamp]);
  assert.equal(dalVivo.length, 2);
  assert.deepEqual(rigiocati, dalVivo);
}));

test('ORA-GIRI-03 AL CONTRARIO — un evento che porta già il suo `timestamp` non si ritocca', async (t) => conStore(t, async (cartellaStore) => {
  const b = registroAGiri(cartellaStore, {
    avviaSessioneFn: (input) => {
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r1', timestamp: 1_000 });
      input.onEvento({ type: 'RunFinished', threadId: 't', runId: 'r1', timestamp: 2_000 });
      return Promise.resolve({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'r' }] } });
    },
  });
  const { sessionId } = b.registro.avvia('task-vero');
  await passo(); await passo();
  assert.deepEqual(eventiDelGiro(b.registro, sessionId).map((e) => e.timestamp), [1_000, 2_000]);
}));
