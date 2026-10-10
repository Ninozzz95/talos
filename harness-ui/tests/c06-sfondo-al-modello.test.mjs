/*
 * C06 (owner 10/10/2026, «come Claude»: «Sì, riparte da solo», e «Sì, anche i miei» per i comandi «!») — quando un comando in
 *   sottofondo finisce, il modello lo sa e la conversazione riparte da sola, come Claude Code («keeps running across turns and
 *   re-invokes you when it exits», con stato, codice d'uscita e file dell'uscita). L'uscita entra nella coda come l'esito di una
 *   figlia (F-010) e segue le sue regole: a chat ferma sveglia, a giro vivo aspetta la fine, dopo un riavvio resta (in pausa).
 * Il kernel è finto: chiama `segnalaUscitaSfondo` come fa al vero esito di uno sfondato (talosHarness.mjs, A6-bis).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionRegistry, testoUscitaSfondo, fattiUscitaSfondo } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function runtimeControllabile() {
  const runs = [];
  return {
    runs,
    avviaSessioneFn(input) {
      let resolve;
      const promise = new Promise((r) => { resolve = r; });
      const index = runs.length;
      runs.push({ input, resolve });
      input.onEvento({ type: 'RunStarted', threadId: `t${index}`, runId: `r${index}` });
      return promise;
    },
    fine(index) {
      const run = runs[index];
      run.input.onEvento({ type: 'RunFinished', threadId: `t${index}`, runId: `r${index}` });
      run.resolve({ ok: true, esito: { detto: `risposta ${index}`, comeFinita: 'concluso',
        messaggiFinali: [{ role: 'user', content: 'avvia il server' }, { role: 'assistant', content: 'avviato in sottofondo' }] } });
    },
  };
}
const opzioni = (cartellaStore, runtime, extra = {}) => ({ cartellaStore, avviaSessioneFn: runtime.avviaSessioneFn,
  preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'avvia il server' } }),
  modello: 'm', chiave: 'k', cartellaEsisteFn: () => true, ...extra });
async function conStore(corpo) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-c06-sfondo-'));
  try { await corpo(cartellaStore); }
  finally {
    try { await attendiScritture({ cartellaStore }); } catch { /* la pulizia serve comunque */ }
    rimuoviCartellaDiProva(cartellaStore);
  }
}
const USCITA = { toolCallId: 'call_dev', codice: 1, segnale: null, comando: 'npm run dev', file: '/tmp/x/.talos/sfondo/call_dev.log' };

test('C06-NOTA: the note for the model says the command, how it ended and where its output is (English, like Claude Code)', () => {
  assert.equal(testoUscitaSfondo({ comando: 'npm run dev', esito: 'fallito', codice: 1, file: '/tmp/a.log' }),
    'The background command `npm run dev` failed (exit code 1). Its full output is in /tmp/a.log.');
  assert.equal(testoUscitaSfondo({ comando: 'npm test', esito: 'riuscito', codice: 0 }), 'The background command `npm test` completed (exit code 0).');
  assert.equal(testoUscitaSfondo({ esito: 'terminato', segnale: 'SIGTERM' }), 'A background command was terminated (SIGTERM).');
  assert.equal(testoUscitaSfondo({ esito: 'fallito' }), 'A background command failed to run.');
  // AL CONTRARIO: un esito sconosciuto non diventa «riuscito»
  assert.equal(fattiUscitaSfondo({ esito: 'boh' }).esito, 'terminato');
});

test('C06-RISVEGLIO: a background command that ends while the chat is idle wakes it with the note, never as the person', () => conStore(async (cartellaStore) => {
  const runtime = runtimeControllabile();
  const registry = createSessionRegistry(opzioni(cartellaStore, runtime));
  const { sessionId } = registry.avvia('task');
  const segnala = runtime.runs[0].input.segnalaUscitaSfondo;
  assert.equal(typeof segnala, 'function', 'premise: the kernel receives the background-exit signal');
  runtime.fine(0);
  await registry.attendiAssestamento(sessionId);
  segnala(USCITA);
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(runtime.runs.length, 2, 'the conversation started again by itself');
  const input = runtime.runs[1].input;
  const ultimo = input.messaggiIniziali.at(-1);
  assert.equal(ultimo.role, 'user');
  assert.equal(ultimo.talosOrigin, 'background-notice', 'a system notice, not the person');
  assert.equal(ultimo.content, 'The background command `npm run dev` failed (exit code 1). Its full output is in /tmp/x/.talos/sfondo/call_dev.log.');
  assert.equal(input.task.origine, 'sfondo');
  assert.deepEqual(input.task.toolCallIds, ['call_dev']);
  assert.deepEqual(input.task.risultatiSfondo.map(({ toolCallId, comando, esito, codice, file }) => ({ toolCallId, comando, esito, codice, file })),
    [{ toolCallId: 'call_dev', comando: 'npm run dev', esito: 'fallito', codice: 1, file: '/tmp/x/.talos/sfondo/call_dev.log' }]);
  runtime.fine(1);
  await registry.attendiAssestamento(sessionId);
  assert.deepEqual(registry.statoCoda(sessionId).voci, [], 'delivered once, then gone');
  await registry.chiudi?.();
}));

test('C06-UNA-VOLTA: the same command ending twice is one note and one wake', () => conStore(async (cartellaStore) => {
  const runtime = runtimeControllabile();
  const registry = createSessionRegistry(opzioni(cartellaStore, runtime));
  const { sessionId } = registry.avvia('task');
  const segnala = runtime.runs[0].input.segnalaUscitaSfondo;
  runtime.fine(0);
  await registry.attendiAssestamento(sessionId);
  segnala(USCITA);
  segnala(USCITA);
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(runtime.runs.length, 2);
  assert.equal(runtime.runs[1].input.task.codaIds.length, 1);
  runtime.fine(1);
  await registry.attendiAssestamento(sessionId);
  await registry.chiudi?.();
}));

test('C06-GIRO-VIVO: during a live turn the note waits for the turn to settle, then wakes (like a child result)', () => conStore(async (cartellaStore) => {
  const runtime = runtimeControllabile();
  const registry = createSessionRegistry(opzioni(cartellaStore, runtime));
  const { sessionId } = registry.avvia('task');
  runtime.runs[0].input.segnalaUscitaSfondo(USCITA);
  await new Promise((r) => setTimeout(r, 70));
  assert.equal(runtime.runs.length, 1, 'no second turn while the first is alive');
  const coda = registry.statoCoda(sessionId).voci;
  assert.equal(coda.length, 1);
  assert.equal(coda[0].origine, 'sfondo');
  assert.equal(coda[0].toolCallId, 'call_dev');
  assert.deepEqual(coda[0].sfondo, { comando: 'npm run dev', esito: 'fallito', codice: 1, segnale: null, file: '/tmp/x/.talos/sfondo/call_dev.log' }, 'the facts for the chat\'s own sentence');
  runtime.fine(0);
  await registry.attendiAssestamento(sessionId);
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(runtime.runs.length, 2, 'woken once the turn settled');
  runtime.fine(1);
  await registry.attendiAssestamento(sessionId);
  await registry.chiudi?.();
}));

test('C06-RIAVVIO: a note not yet delivered survives a restart with its facts, and comes back paused', () => conStore(async (cartellaStore) => {
  const runtime = runtimeControllabile();
  let pronto = true;
  const o = opzioni(cartellaStore, runtime, { prontoFn: () => ({ pronto }) });
  const registry = createSessionRegistry(o);
  const { sessionId } = registry.avvia('task');
  const segnala = runtime.runs[0].input.segnalaUscitaSfondo;
  runtime.fine(0);
  await registry.attendiAssestamento(sessionId);
  pronto = false; // il modello non è pronto: niente risveglio, la voce resta in coda
  segnala(USCITA);
  await new Promise((r) => setTimeout(r, 70));
  assert.equal(runtime.runs.length, 1);
  await attendiScritture({ cartellaStore });
  const ripreso = createSessionRegistry(o);
  await ripreso.ripristina();
  const coda = ripreso.statoCoda(sessionId);
  assert.equal(coda.voci.length, 1);
  assert.equal(coda.inPausa, true, 'like a child result after a restart: paused, never a paid turn at boot');
  assert.equal(coda.voci[0].origine, 'sfondo');
  assert.equal(coda.voci[0].toolCallId, 'call_dev');
  assert.equal(coda.voci[0].sfondo?.comando, 'npm run dev', 'the facts came back from the disk');
  await registry.chiudi?.();
  await ripreso.chiudi?.();
}));
