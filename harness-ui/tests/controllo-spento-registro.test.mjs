/*
 * CONTRATTO-CONTROLLO-SPENTO §2, richiesta della CLI (29/10/2026): ogni `talos` è un processo nuovo e una chat ripresa si ricostruisce
 * dal GIORNALE. I due «già detto» (il ripiego R12-2 e il controllo delle scritture spento) stanno quindi in una riga `stato-avvisi` del
 * giornale, scritta solo quando cambiano; al riavvio l'ultima riga vince. Senza, l'avviso tornerebbe a ogni riavvio.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const MODELLO = 'z-ai/glm-5.3-flash';
const MOTIVO = 'the semantic guard could not run (Cannot find package typescript)';

function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
  return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } };
}
function registroRiavviabile(t) {
  const cartellaStore = cartellaDiProva('talos-controllo-spento-registro-');
  const giri = [];
  const avviaSessioneFn = async (input) => {
    let risolvi;
    const attesa = new Promise((r) => { risolvi = r; });
    giri.push({ input, concludi(extra = {}) {
      input.onEvento({ type: 'RunFinished' });
      risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'ok' }], recordDiCompattazione: [], ...extra } });
    } });
    input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${giri.length}` });
    return attesa;
  };
  let ms = Date.parse('2026-10-29T22:00:00.000Z');
  const crea = () => createSessionRegistry({ guardaWorkspaceFn: () => () => {}, cartellaStore, avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta,
    modello: MODELLO, chiave: 'k', clock: () => new Date(ms += 1000), finestraTokenFn: () => 64_000 });
  const assesta = async (sessionId) => { await attendiScritture({ cartellaStore, sessionId }); await new Promise((ok) => setTimeout(ok, 60)); await attendiScritture({ cartellaStore, sessionId }); };
  t.after(async () => { await attendiScritture({ cartellaStore }); rimuoviCartellaDiProva(cartellaStore); });
  const righeAvvisi = (sessionId) => readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8').trim().split('\n').map((r) => JSON.parse(r))
    .filter((r) => r.tipo === 'stato-avvisi').map(({ ripiegoDetto, controlloSpentoDetto }) => ({ ripiegoDetto, controlloSpentoDetto }));
  return { crea, giri, assesta, righeAvvisi };
}
const riavvia = async (amb) => { const r = amb.crea(); await r.ripristina(); return r; };

test('CSP-REG-01 il «già detto» del controllo spento sopravvive al riavvio; guarito, il riavvio dopo lo fa dire di nuovo', async (t) => {
  const amb = registroRiavviabile(t);
  const { sessionId } = amb.crea().avvia('task-vero', { modelloScelto: MODELLO });
  amb.giri[0].concludi({ controlloSpentoDetto: MOTIVO });
  await amb.assesta(sessionId);
  assert.deepEqual(amb.righeAvvisi(sessionId), [{ ripiegoDetto: null, controlloSpentoDetto: MOTIVO }], 'una riga nel giornale');

  const dopo = await riavvia(amb);
  dopo.resume(sessionId, 'ancora');
  assert.equal(amb.giri.at(-1).input.controlloSpentoDetto, MOTIVO, 'dopo il riavvio il giro sa che è già stato detto');
  amb.giri.at(-1).concludi({ controlloSpentoDetto: MOTIVO });
  await amb.assesta(sessionId);
  assert.equal(amb.righeAvvisi(sessionId).length, 1, 'lo stesso valore non si riscrive');

  const ancora = await riavvia(amb);
  ancora.resume(sessionId, 'guarisce');
  amb.giri.at(-1).concludi({ controlloSpentoDetto: null });
  await amb.assesta(sessionId);
  assert.deepEqual(amb.righeAvvisi(sessionId).at(-1), { ripiegoDetto: null, controlloSpentoDetto: null }, 'la guarigione si scrive');

  const ultimo = await riavvia(amb);
  ultimo.resume(sessionId, 'di nuovo rotto');
  assert.equal(amb.giri.at(-1).input.controlloSpentoDetto, undefined, 'AL CONTRARIO: guarito e riavviato, il guasto dopo si dice di nuovo');
});

test('CSP-REG-02 la stessa coppia per il ripiego (R12-2): sopravvive al riavvio, e guarito torna a dirsi', async (t) => {
  const amb = registroRiavviabile(t);
  const { sessionId } = amb.crea().avvia('task-vero', { modelloScelto: MODELLO });
  amb.giri[0].concludi({ ripiegoDetto: 'CTX_PERSISTENCE_FAILED' });
  await amb.assesta(sessionId);
  const dopo = await riavvia(amb);
  dopo.resume(sessionId, 'ancora');
  assert.equal(amb.giri.at(-1).input.ripiegoDetto, 'CTX_PERSISTENCE_FAILED');
  assert.equal(amb.giri.at(-1).input.controlloSpentoDetto, undefined, 'i due avvisi non si confondono');
  amb.giri.at(-1).concludi({ ripiegoDetto: null });
  await amb.assesta(sessionId);
  const ultimo = await riavvia(amb);
  ultimo.resume(sessionId, 'e ancora');
  assert.equal(amb.giri.at(-1).input.ripiegoDetto, undefined);
});

test('CSP-REG-03 AL CONTRARIO: un giro che non porta i campi (motore vecchio, giro fallito) non scrive niente e non azzera', async (t) => {
  const amb = registroRiavviabile(t);
  const { sessionId } = amb.crea().avvia('task-vero', { modelloScelto: MODELLO });
  amb.giri[0].concludi({ controlloSpentoDetto: MOTIVO });
  await amb.assesta(sessionId);
  const reg = await riavvia(amb);
  reg.resume(sessionId, 'senza campi');
  amb.giri.at(-1).concludi({});
  await amb.assesta(sessionId);
  assert.equal(amb.righeAvvisi(sessionId).length, 1);
  reg.resume(sessionId, 'dopo');
  assert.equal(amb.giri.at(-1).input.controlloSpentoDetto, MOTIVO);
});

test('CSP-SERV-01 nel servizio: il «già detto» arriva al nucleo, e l\'evento del nucleo diventa un CUSTOM durevole col percorso relativo', async () => {
  const { avviaSessione } = await import('../src/agent-service.mjs');
  const ricevuti = [];
  const eventi = [];
  const talosLavoraFn = async (input) => {
    ricevuti.push(input.controlloSpentoDetto);
    input.onGiro?.({ giro: 2, tipo: 'controllo-spento', codice: 'compilatore-assente', perche: MOTIVO, percorso: 'src/a.ts' });
    input.onGiro?.({ giro: 3, tipo: 'controllo-spento', codice: 'errore-interno', perche: 'x' });
    return { comeFinita: 'concluso', messaggiFinali: [], detto: 'ok' };
  };
  const onEvento = (evento, opzioni) => { if (evento?.name === 'talos.controllo-spento') eventi.push([evento.value, opzioni]); };
  await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento, controlloSpentoDetto: MOTIVO, talosLavoraFn });
  await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn });
  assert.deepEqual(ricevuti, [MOTIVO, undefined], 'AL CONTRARIO: senza, il nucleo non riceve il campo');
  assert.equal(eventi.length, 2);
  const [primo, opzioni] = eventi[0];
  assert.deepEqual({ schema: primo.schema, giro: primo.giro, codice: primo.codice, perche: primo.perche, percorso: primo.percorso },
    { schema: 'talos.controllo-spento.v1', giro: 2, codice: 'compilatore-assente', perche: MOTIVO, percorso: 'src/a.ts' });
  assert.equal(opzioni?.durable, true, 'durevole: si ridisegna alla rigiocata');
  assert.equal(Object.hasOwn(eventi[1][0], 'percorso'), false, 'senza percorso, il campo non c\'è');
});

test('CSP-REG-04 (CLI 29/10) la riga del giornale entra nella coda NELLO STESSO TICK del cambio: una chiusura subito dopo la porta con sé', async (t) => {
  const amb = registroRiavviabile(t);
  const reg = amb.crea();
  const { sessionId } = reg.avvia('task-vero', { modelloScelto: MODELLO });
  amb.giri[0].concludi({ controlloSpentoDetto: MOTIVO });
  /* la fine del giro la elabora il registro dopo la promessa del giro; si aspetta solo quella (nessuna attesa delle scritture) */
  await new Promise((ok) => setImmediate(ok));
  await reg.chiudi();
  assert.deepEqual(amb.righeAvvisi(sessionId), [{ ripiegoDetto: null, controlloSpentoDetto: MOTIVO }], 'la chiusura ha svuotato anche la riga degli avvisi');
  const dopo = await riavvia(amb);
  dopo.resume(sessionId, 'dopo la chiusura');
  assert.equal(amb.giri.at(-1).input.controlloSpentoDetto, MOTIVO);
});
