/*
 * Decisione 193, punto 2 (owner 04/11/2026 19:41): «i comandi in sottofondo che finiscono insieme svegliano il modello una volta sola,
 * come Hermes». Forma: in-corso/FORMA-CACHE-193-194-2026-11-04.md.
 * Hermes (`hermes-agent-2026-11-01`): `gateway/run_runtime_init.py:127-133` «hold them briefly so the agent gets one synthetic turn
 * instead of one per process», finestra di 0,1 s (`_completion_notification_batch_window`), consegna in `run_notifications.py:1371-1378`.
 * TALOS oggi: `programmaRisveglioDaFiglie` arma 25 ms (`session-registry.mjs:4605-4611`); due uscite a 60 ms con la sessione ferma fanno
 * DUE giri (il secondo arriva a giro vivo e aspetta). La forma: una finestra di quiete (250 ms dall'ultima uscita, tetto 1 s dalla
 * prima) SOLO se la sessione ha ancora un altro comando in sottofondo vivo; altrimenti 25 ms, come oggi.
 * Il kernel è finto, come in `c06-sfondo-al-modello.test.mjs`: chiama `registraComandoFermabile` e `segnalaUscitaSfondo` come fa lui.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function runtimeControllabile() {
  const runs = [];
  const inAttesa = [];
  return {
    runs,
    /* 09/11/2026 (0.2.0): si aspetta l'evento «giro partito», non un tempo fisso; il tetto serve solo a non restare appesi. */
    attendiGiro(index, tettoMs = 1_500) {
      if (runs.length > index) return Promise.resolve(true);
      return new Promise((risolvi) => {
        const voce = { index, risolvi };
        voce.timer = setTimeout(() => { inAttesa.splice(inAttesa.indexOf(voce), 1); risolvi(false); }, tettoMs);
        inAttesa.push(voce);
      });
    },
    avviaSessioneFn(input) {
      let resolve;
      const promise = new Promise((r) => { resolve = r; });
      const index = runs.length;
      runs.push({ input, resolve, partitoAlle: Date.now() });
      for (const voce of [...inAttesa]) if (runs.length > voce.index) { clearTimeout(voce.timer); inAttesa.splice(inAttesa.indexOf(voce), 1); voce.risolvi(true); }
      input.onEvento({ type: 'RunStarted', threadId: `t${index}`, runId: `r${index}` });
      return promise;
    },
    fine(index) {
      const run = runs[index];
      run.input.onEvento({ type: 'RunFinished', threadId: `t${index}`, runId: `r${index}` });
      run.resolve({ ok: true, esito: { detto: `risposta ${index}`, comeFinita: 'concluso',
        messaggiFinali: [{ role: 'user', content: 'lancia i tre build' }, { role: 'assistant', content: 'lanciati in sottofondo' }] } });
    },
  };
}
const opzioni = (cartellaStore, runtime) => ({ cartellaStore, avviaSessioneFn: runtime.avviaSessioneFn,
  preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'lancia i tre build' } }),
  modello: 'm', chiave: 'k', cartellaEsisteFn: () => true });
async function conStore(corpo) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-risvegli-193-'));
  try { await corpo(cartellaStore); }
  finally {
    try { await attendiScritture({ cartellaStore }); } catch { /* la pulizia serve comunque */ }
    rimuoviCartellaDiProva(cartellaStore);
  }
}
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const uscita = (id) => ({ toolCallId: id, codice: 0, segnale: null, comando: `npm run build:${id}`, file: null });

/** Una sessione col primo giro che lancia `ids` in sottofondo (vivi a giro chiuso) e poi si chiude. */
async function sessioneConSfondi(registry, runtime, ids) {
  const { sessionId } = registry.avvia('task');
  const input = runtime.runs[0].input;
  const sganci = new Map(ids.map((id) => [id, input.registraComandoFermabile({ toolCallId: id, ferma: () => {}, sfonda: () => {} })]));
  runtime.fine(0);
  await registry.attendiAssestamento(sessionId);
  /* il kernel vero: il processo esce ⇒ si sgancia dalla mappa dei comandi vivi, poi dà l'uscita */
  const finisce = (id, { sgancia = true } = {}) => { if (sgancia) sganci.get(id)?.(); input.segnalaUscitaSfondo(uscita(id)); };
  return { sessionId, finisce };
}

test('RISVEGLIO-193-01 — due comandi in sottofondo che finiscono a 60 ms l\'uno dall\'altro, a sessione ferma: UN risveglio con tutti e due', () => conStore(async (cartellaStore) => {
  const runtime = runtimeControllabile();
  const registry = createSessionRegistry(opzioni(cartellaStore, runtime));
  const { sessionId, finisce } = await sessioneConSfondi(registry, runtime, ['call_a', 'call_b']);
  finisce('call_a');
  await pausa(60);
  finisce('call_b');
  await pausa(700);
  assert.equal(runtime.runs.length, 2, 'un giro solo per i due comandi');
  assert.deepEqual(runtime.runs[1].input.task.toolCallIds, ['call_a', 'call_b']);
  runtime.fine(runtime.runs.length - 1);
  await registry.attendiAssestamento(sessionId);
  await pausa(100);
  if (runtime.runs.length > 2) { runtime.fine(2); await registry.attendiAssestamento(sessionId); }
  await registry.chiudi?.();
}));

test('RISVEGLIO-193-02 — al contrario: un comando solo, senza altri vivi, sveglia subito come oggi (nessuna latenza in più)', () => conStore(async (cartellaStore) => {
  const runtime = runtimeControllabile();
  const registry = createSessionRegistry(opzioni(cartellaStore, runtime));
  const { sessionId, finisce } = await sessioneConSfondi(registry, runtime, ['call_a']);
  const prima = Date.now();
  finisce('call_a');
  await pausa(120);
  assert.equal(runtime.runs.length, 2, 'svegliata');
  assert.ok(runtime.runs[1].partitoAlle - prima < 100, `partita dopo ${runtime.runs[1].partitoAlle - prima} ms: la finestra di 25 ms resta`);
  runtime.fine(1);
  await registry.attendiAssestamento(sessionId);
  await registry.chiudi?.();
}));

test('RISVEGLIO-193-03 — un altro comando vivo che NON finisce: si aspetta la quiete (più di 25 ms), mai oltre il tetto, poi parte con quello che c\'è', () => conStore(async (cartellaStore) => {
  const runtime = runtimeControllabile();
  const registry = createSessionRegistry(opzioni(cartellaStore, runtime));
  const { sessionId, finisce } = await sessioneConSfondi(registry, runtime, ['call_a', 'call_lungo']);
  const prima = Date.now();
  finisce('call_a');
  await pausa(120);
  assert.equal(runtime.runs.length, 1, 'con un altro comando vivo il risveglio aspetta la finestra di quiete');
  await pausa(1_100);
  assert.equal(runtime.runs.length, 2, 'entro il tetto parte lo stesso');
  assert.deepEqual(runtime.runs[1].input.task.toolCallIds, ['call_a']);
  assert.ok(runtime.runs[1].partitoAlle - prima <= 1_150, `partita dopo ${runtime.runs[1].partitoAlle - prima} ms: il tetto è 1 s`);
  runtime.fine(1);
  await registry.attendiAssestamento(sessionId);
  await registry.chiudi?.();
}));

test('RISVEGLIO-193-04 — uscite che non smettono (una ogni 200 ms, con un comando lungo vivo): il tetto di 1 s si conta dalla PRIMA, il modello non aspetta la fine della raffica', () => conStore(async (cartellaStore) => {
  const runtime = runtimeControllabile();
  const registry = createSessionRegistry(opzioni(cartellaStore, runtime));
  const ids = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9'];
  const { sessionId, finisce } = await sessioneConSfondi(registry, runtime, [...ids, 'call_lungo']);
  const prima = Date.now();
  for (const id of ids) { finisce(id); await pausa(200); }
  assert.ok(runtime.runs.length >= 2, 'svegliata durante la raffica');
  const dopo = runtime.runs[1].partitoAlle - prima;
  assert.ok(dopo <= 1_300, `partita dopo ${dopo} ms: il tetto è 1 s dalla prima uscita (senza tetto sarebbe dopo l'ultima, ~1,85 s)`);
  assert.ok(runtime.runs[1].input.task.toolCallIds.length < ids.length, 'la raffica non è stata aspettata tutta');
  for (let i = 1; i < runtime.runs.length; i += 1) { runtime.fine(i); await registry.attendiAssestamento(sessionId); await pausa(60); }
  await pausa(400);
  for (let i = 1; i < runtime.runs.length; i += 1) runtime.fine(i);
  await registry.attendiAssestamento(sessionId);
  await registry.chiudi?.();
}));

test('RISVEGLIO-193-05 — un\'uscita già in coda non tiene vivo nessuno: se il kernel la dice prima di sganciarsi, il risveglio è subito', () => conStore(async (cartellaStore) => {
  const runtime = runtimeControllabile();
  const registry = createSessionRegistry(opzioni(cartellaStore, runtime));
  const { sessionId, finisce } = await sessioneConSfondi(registry, runtime, ['call_a']);
  const prima = Date.now();
  finisce('call_a', { sgancia: false }); // il processo è uscito, la mappa dei vivi non l'ha ancora tolto
  /* 09/11/2026 (0.2.0, gates della #92): prima `pausa(120)` e tetto 100 ms; sul runner la partenza è arrivata a 101 ms ed è caduta.
     Ora si aspetta l'evento e il tetto è 200 ms: il risveglio giusto è a 25 ms (sul runner lento fino a ~101 ms misurati), mentre il
     guasto che la prova cerca (l'uscita già in coda contata fra i vivi) arma la quiete di 250 ms: oltre 200, quindi la prova resta rossa. */
  assert.equal(await runtime.attendiGiro(1), true, 'svegliata');
  assert.equal(runtime.runs.length, 2, 'un solo risveglio');
  assert.ok(runtime.runs[1].partitoAlle - prima < 200, `partita dopo ${runtime.runs[1].partitoAlle - prima} ms: un comando già uscito non conta fra i vivi`);
  runtime.fine(1);
  await registry.attendiAssestamento(sessionId);
  await registry.chiudi?.();
}));
