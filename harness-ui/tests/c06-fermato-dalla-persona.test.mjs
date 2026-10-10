/*
 * C06 (a) (owner 10/10/2026, «Nota senza ripartire», dopo la review YELLOW della sessione desktop) — un comando in sottofondo FERMATO
 *   DALLA PERSONA dalla scheda Processi («Ferma», «Ferma tutti») non fa partire un giro a pagamento da solo: prima sì, subito dopo che
 *   la persona aveva detto «basta» (sonda della review, `runs.length` 2). Il modello lo legge col PROSSIMO messaggio della persona,
 *   attribuito a lei («was stopped by the user»), una volta sola; la nota sopravvive a un riavvio. Al contrario: un'uscita che la
 *   persona non ha causato sveglia la chat come prima.
 * Nata dalla sonda `c06-fermato-dalla-persona.test.mjs` della sessione desktop (sha 072fd53e3f5afcaf).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionRegistry, testoUscitaSfondo } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const NOTA = 'The background command `npm run dev` was stopped by the user (SIGTERM).';

function crea(cartellaStore, runs, eventi) {
  return createSessionRegistry({
    cartellaStore, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'avvia il server' } }),
    avviaSessioneFn(input) {
      let resolve; const p = new Promise((r) => { resolve = r; });
      const i = runs.length; runs.push({ input, resolve });
      input.onEvento({ type: 'RunStarted', threadId: `t${i}`, runId: `r${i}` });
      return p;
    },
    ...(eventi ? { onEventoFn: (e) => eventi.push(e) } : {}),
  });
}
function fine(runs, i) {
  runs[i].input.onEvento({ type: 'RunFinished', threadId: `t${i}`, runId: `r${i}` });
  runs[i].resolve({ ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [...(runs[i].input.messaggiIniziali ?? [{ role: 'user', content: 'avvia' }]), { role: 'assistant', content: `risposta ${i}` }] } });
}
/** Il kernel registra il comando sfondato come fermabile: fermarlo lo uccide, e l'uscita vera arriva col segnale. */
function sfondato(input, { toolCallId = 'call_dev', comando = 'npm run dev' } = {}) {
  input.registraComandoFermabile({ toolCallId, ferma: () => { setTimeout(() => input.segnalaUscitaSfondo({ toolCallId, codice: null, segnale: 'SIGTERM', comando }), 10); } });
}
async function conStore(corpo) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-c06-ferma-'));
  try { await corpo(cartellaStore); }
  finally {
    try { await attendiScritture({ cartellaStore }); } catch { /* pulizia comunque */ }
    rimuoviCartellaDiProva(cartellaStore);
  }
}
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

test('C06-FERMATO-NOTA: the note says the person stopped it (English, for the model)', () => {
  assert.equal(testoUscitaSfondo({ comando: 'npm run dev', esito: 'terminato', segnale: 'SIGTERM', fermatoDallaPersona: true }), NOTA);
  assert.equal(testoUscitaSfondo({ comando: 'npm run dev', esito: 'terminato', segnale: 'SIGTERM' }), 'The background command `npm run dev` was terminated (SIGTERM).',
    'AL CONTRARIO: an exit nobody attributed stays «terminated»');
});

test('C06-FERMATO-NIENTE-GIRO: the person stopping a background command from Processes does not start a paid turn; the note rides on the next message, once', () => conStore(async (cartellaStore) => {
  const runs = [];
  const registry = crea(cartellaStore, runs);
  try {
    const { sessionId } = registry.avvia('task');
    sfondato(runs[0].input);
    fine(runs, 0);
    await registry.attendiAssestamento(sessionId);
    assert.equal(registry.fermaComando(sessionId, 'call_dev'), 'fermato', 'premise: the person stopped it from Processes');
    await pausa(200);
    assert.equal(runs.length, 1, 'no turn starts by itself after the PERSON stopped the command');
    assert.deepEqual(registry.statoCoda(sessionId).voci, [], 'nothing in the queue that wakes or that the banner would show');
    // il prossimo messaggio della persona porta la nota, subito prima del suo testo
    const ripresa = registry.resume(sessionId, 'e adesso?');
    assert.ok(!ripresa?.erroreAvvio, JSON.stringify(ripresa));
    assert.equal(runs.length, 2);
    const ultimi = runs[1].input.messaggiIniziali.slice(-2);
    assert.deepEqual(ultimi[0], { role: 'user', content: NOTA, talosOrigin: 'background-notice' });
    assert.equal(ultimi[1].role, 'user');
    assert.match(JSON.stringify(ultimi[1].content), /e adesso\?/u);
    assert.equal(runs[1].input.task.origine, undefined, 'the turn is the person\'s, not a system wake');
    fine(runs, 1);
    await registry.attendiAssestamento(sessionId);
    await pausa(100);
    assert.equal(runs.length, 2, 'and no wake after that turn either');
    // una volta sola: il messaggio dopo non la porta più
    registry.resume(sessionId, 'grazie');
    assert.equal(runs[2].input.messaggiIniziali.filter((m) => m.content === NOTA).length, 1, 'only the copy already in the history');
    fine(runs, 2);
    await registry.attendiAssestamento(sessionId);
  } finally { await registry.chiudi?.(); }
}));

test('C06-FERMATO-RIAVVIO: a note not yet delivered survives a restart, and still waits for the person', () => conStore(async (cartellaStore) => {
  const runs = [];
  const registry = crea(cartellaStore, runs);
  const { sessionId } = registry.avvia('task');
  sfondato(runs[0].input);
  fine(runs, 0);
  await registry.attendiAssestamento(sessionId);
  registry.fermaComando(sessionId, 'call_dev');
  await pausa(100);
  await attendiScritture({ cartellaStore });
  await registry.chiudi?.();
  const runsDopo = [];
  const ripreso = crea(cartellaStore, runsDopo);
  try {
    await ripreso.ripristina();
    await pausa(100);
    assert.equal(runsDopo.length, 0, 'no turn at boot');
    assert.deepEqual(ripreso.statoCoda(sessionId).voci, []);
    ripreso.resume(sessionId, 'riprendiamo');
    assert.equal(runsDopo.length, 1);
    const prima = runsDopo[0].input.messaggiIniziali.at(-2);
    assert.deepEqual(prima, { role: 'user', content: NOTA, talosOrigin: 'background-notice' }, 'the note came back from the disk');
    fine(runsDopo, 0);
    await ripreso.attendiAssestamento(sessionId);
  } finally { await ripreso.chiudi?.(); }
}));

test('C06-FERMATO-AL-CONTRARIO: an exit the person did not cause still wakes the chat, with the plain note', () => conStore(async (cartellaStore) => {
  const runs = [];
  const registry = crea(cartellaStore, runs);
  try {
    const { sessionId } = registry.avvia('task');
    const { input } = runs[0];
    sfondato(input);
    fine(runs, 0);
    await registry.attendiAssestamento(sessionId);
    input.segnalaUscitaSfondo({ toolCallId: 'call_dev', codice: 1, segnale: null, comando: 'npm run dev' }); // è morto da solo
    await pausa(150);
    assert.equal(runs.length, 2, 'woken by itself, as before');
    assert.equal(runs[1].input.messaggiIniziali.at(-1).content, 'The background command `npm run dev` failed (exit code 1).');
    fine(runs, 1);
    await registry.attendiAssestamento(sessionId);
  } finally { await registry.chiudi?.(); }
}));

test('C06-FERMATO-SINCRONO: an exit reported synchronously from inside ferma() is still the person\'s (the mark comes BEFORE ferma)', () => conStore(async (cartellaStore) => {
  const runs = [];
  const registry = crea(cartellaStore, runs);
  try {
    const { sessionId } = registry.avvia('task');
    const { input } = runs[0];
    input.registraComandoFermabile({ toolCallId: 'call_dev', ferma: () => input.segnalaUscitaSfondo({ toolCallId: 'call_dev', codice: null, segnale: 'SIGTERM', comando: 'npm run dev' }) });
    fine(runs, 0);
    await registry.attendiAssestamento(sessionId);
    assert.equal(registry.fermaComando(sessionId, 'call_dev'), 'fermato');
    await pausa(150);
    assert.equal(runs.length, 1, 'no turn starts by itself');
    registry.resume(sessionId, 'e adesso?');
    assert.deepEqual(runs[1].input.messaggiIniziali.at(-2), { role: 'user', content: NOTA, talosOrigin: 'background-notice' }, 'the note is pending, attributed to the person');
    fine(runs, 1);
    await registry.attendiAssestamento(sessionId);
  } finally { await registry.chiudi?.(); }
}));

test('C06-FERMATO-PRIMO-PIANO: a foreground command stopped by the person leaves no mark once its result arrives', () => conStore(async (cartellaStore) => {
  const runs = [];
  const registry = crea(cartellaStore, runs);
  try {
    const { sessionId } = registry.avvia('task');
    const { input } = runs[0];
    // in primo piano: fermarlo chiude la chiamata col suo risultato, nessuna uscita in sottofondo arriverà
    input.registraComandoFermabile({ toolCallId: 'call_fg', ferma: () => input.onEvento({ type: 'ToolCallResult', toolCallId: 'call_fg', content: 'exit 130 (stopped on request)' }) });
    assert.equal(registry.fermaComando(sessionId, 'call_fg'), 'fermato');
    fine(runs, 0);
    await registry.attendiAssestamento(sessionId);
    /* il segno è stato tolto dal risultato: se mai arrivasse un'uscita con quell'id non sarebbe attribuita alla persona, e sveglierebbe */
    input.segnalaUscitaSfondo({ toolCallId: 'call_fg', codice: 1, segnale: null, comando: 'npm test' });
    await pausa(150);
    assert.equal(runs.length, 2, 'the leftover mark would have swallowed this exit');
    fine(runs, 1);
    await registry.attendiAssestamento(sessionId);
  } finally { await registry.chiudi?.(); }
}));
