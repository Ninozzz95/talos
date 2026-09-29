import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry } from '../src/session-registry.mjs';
import { registraRiga } from '../src/session-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function banco(t, { onSettings = (args) => registraRiga(args) } = {}) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-plan-durable-'));
  t.after(() => rimuoviCartellaDiProva(cartellaStore));
  const giri = [];
  const registry = createSessionRegistry({
    cartellaStore, modello: 'm', chiave: 'k',
    preparaEsecuzioneFn: (taskId) => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'Pianifica.' } }),
    registraRigaFn: (args) => args.record?.tipo === 'impostazioni-sessione' && args.record?.modalitaOperativa === 'piano'
      ? onSettings(args) : registraRiga(args),
    avviaSessioneFn(input) {
      let resolve;
      const result = new Promise((ok) => { resolve = ok; });
      giri.push({ input, resolve });
      input.onEvento({ type: 'RunStarted', threadId: `t${giri.length}`, runId: `r${giri.length}` });
      return result;
    },
  });
  const { sessionId } = registry.avvia('task-plan');
  const finish = (n, { ok = true, interrupted = false } = {}) => {
    const giro = giri[n - 1];
    giro.input.onEvento(interrupted ? { type: 'RunError', code: 'fermato', message: 'Stop' } : { type: 'RunFinished' });
    giro.resolve(ok
      ? { ok: true, esito: { detto: 'fatto', comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'Pianifica.' }, { role: 'assistant', content: 'fatto' }] } }
      : { ok: false, esito: { detto: '', comeFinita: interrupted ? 'interrotto' : 'fallito', messaggiFinali: [{ role: 'user', content: 'Pianifica.' }] } });
  };
  const planEvents = () => registry.esporta(sessionId).eventi.filter((e) => e.name === 'talos.impostazioni-sessione' && e.value?.motivo === 'piano-richiesto-dal-modello');
  return { registry, sessionId, giri, finish, planEvents };
}

test('RPM-DURABLE-01: assestamento e prossimo giro attendono la scrittura confermata', async (t) => {
  let release;
  let started;
  const called = new Promise((ok) => { started = ok; });
  const b = banco(t, { onSettings: (args) => new Promise((ok, ko) => {
    release = () => registraRiga(args).then(ok, ko);
    started();
  }) });
  assert.deepEqual(await b.giri[0].input.onRichiestaPianoFn(), { ok: true });
  b.finish(1);
  await called;
  let settled = false;
  const settling = b.registry.attendiAssestamento(b.sessionId).then(() => { settled = true; });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(settled, false, 'la scrittura pendente non è assestata');
  assert.equal(b.registry.resume(b.sessionId, 'continua').code, 'SESSION_NOT_READY');
  assert.equal(b.planEvents().length, 0, 'nessuna promessa visuale prima del disco');
  release();
  await settling;
  assert.equal(b.planEvents().length, 1);
  const resumed = b.registry.resume(b.sessionId, 'continua');
  assert.equal(resumed.sessionId, b.sessionId);
  assert.equal(b.giri[1].input.modalitaOperativa, 'piano');
  assert.ok(b.giri[1].input.strumentiEstesi.includes('present_plan'));
  b.finish(2);
  await b.registry.attendiAssestamento(b.sessionId);
});

test('RPM-DURABLE-02: errore di scrittura lascia Normale e produce un errore recuperabile', async (t) => {
  const b = banco(t, { onSettings: async () => { throw new Error('disco non scrivibile'); } });
  await b.giri[0].input.onRichiestaPianoFn();
  b.finish(1);
  await b.registry.attendiAssestamento(b.sessionId);
  assert.equal(b.planEvents().length, 0);
  assert.ok(b.registry.esporta(b.sessionId).eventi.some((e) => e.name === 'talos.richiesta-piano-fallita'));
  const resumed = b.registry.resume(b.sessionId, 'riprova');
  assert.equal(resumed.sessionId, b.sessionId);
  assert.equal(b.giri[1].input.modalitaOperativa, 'normale');
  b.finish(2);
  await b.registry.attendiAssestamento(b.sessionId);
});

test('RPM-DURABLE-03: giro fallito o Stop non attiva Piano e non scrive impostazioni', async (t) => {
  for (const interrupted of [false, true]) {
    let writes = 0;
    const b = banco(t, { onSettings: (args) => { writes += 1; return registraRiga(args); } });
    await b.giri[0].input.onRichiestaPianoFn();
    b.finish(1, { ok: false, interrupted });
    await b.registry.attendiAssestamento(b.sessionId);
    assert.equal(writes, 0);
    assert.equal(b.planEvents().length, 0);
  }
});
