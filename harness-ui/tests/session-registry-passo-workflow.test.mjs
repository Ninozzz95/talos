/*
 * F3-32 (25/09/2026) — lato registro del ponte fra sessioni e attività del Workflow (`avviaSessioneDiPasso`).
 * Contratto: `.claude/LEDGER-F3-32-CONTRATTO-SESSIONI-ATTIVITA-2026-09-25.md`. Decisioni owner: 1 (sola lettura), 12 (nel
 * workflow chiede solo il principale), 30 (senza interfaccia l'ipotesi prudente è dichiarata).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, parse } from 'node:path';
import test from 'node:test';

import { createSessionRegistry as createSessionRegistryReale } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const LEGAME = Object.freeze({
  runId: '11111111-1111-4111-8111-111111111111', nodeId: 'leggi-note',
  activityExecutionId: '22222222-2222-4222-8222-222222222222', attempt: 1,
  leaseId: '33333333-3333-4333-8333-333333333333', leaseEpoch: 1,
});
const NEGATI = ['workflow_plan_propose', 'present_plan', 'delega_sottotask', 'ask_child', 'answer_child_question',
  'ask_parent', 'answer_parent_question', 'ask_user_question'];

function registroDiProva(opzioni) {
  return createSessionRegistryReale({ guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k',
    preparaEsecuzioneFn: (taskId) => {
      if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
      return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'fai' } };
    },
    cartellaEsisteFn: () => true, workflowPlanProposeFn: async () => ({}), ...opzioni });
}

/** Giri finti: il test decide cosa emettono e quando finiscono. */
function giriFinti() {
  const giri = [];
  return {
    avviaSessioneFn(input) {
      let risolvi;
      const promessa = new Promise((resolve) => { risolvi = resolve; });
      giri.push({ input, risolvi });
      input.onEvento({ type: 'RunStarted', threadId: `t${giri.length}`, runId: `r${giri.length}` });
      return promessa;
    },
    giro(i) { return giri[i]; },
    emetti(i, evento) { giri[i].input.onEvento(evento); },
    concludi(i, terminale = { type: 'RunFinished' }, risultato = { ok: true }) { giri[i].input.onEvento(terminale); giri[i].risolvi(risultato); },
    get quanti() { return giri.length; },
  };
}

async function svuota(cartellaStore) {
  for (let i = 0; i < 3; i += 1) {
    try { await attendiScritture({ cartellaStore }); } catch { /* residui: li dice la prova */ }
    await new Promise((r) => setImmediate(r));
  }
}

function banco(t, { conProgetto = false } = {}) {
  const cartellaStore = cartellaDiProva('talos-passo-workflow-');
  const progetto = conProgetto ? cartellaDiProva('talos-passo-progetto-') : null;
  const giri = giriFinti();
  const registro = registroDiProva({ cartellaStore, avviaSessioneFn: giri.avviaSessioneFn,
    ...(progetto ? { cartelleProgetto: [{ id: '0', percorso: progetto, nome: 'progetto' }] } : {}) });
  t.after(async () => { await svuota(cartellaStore); rimuoviCartellaDiProva(cartellaStore); if (progetto) rimuoviCartellaDiProva(progetto); });
  return { cartellaStore, progetto, giri, registro };
}

function righe(cartellaStore, sessionId) {
  return readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8').split('\n').filter(Boolean).map((riga) => JSON.parse(riga));
}

test('WF-AGENT-POLICY-ISOLATION: a step is read-only in the chosen folder, cannot ask, propose or delegate — even under a Full access root', async (t) => {
  const { giri, registro, progetto } = banco(t, { conProgetto: true });
  const radice = registro.avviaLibero({ cartellaId: '0', consegna: 'radice', permessi: 'Full access' });
  assert.ok(radice.sessionId, JSON.stringify(radice));
  assert.equal(giri.giro(0).input.cartella, parse(progetto).root, 'premise: the Full access root is widened to the disk root');
  const passo = registro.avviaSessioneDiPasso({ legame: LEGAME, rootSessionId: radice.sessionId, consegna: 'Leggi note.md e riassumi.', titolo: 'Leggi le note' });
  assert.ok(passo.sessionId, JSON.stringify(passo));
  const ingresso = giri.giro(1).input;
  assert.equal(ingresso.cartella, progetto, 'the step works in the CHOSEN folder, never the widened disk root');
  assert.equal(ingresso.permessi, 'Read only');
  assert.equal(ingresso.livelloAccesso, 'lettura');
  for (const nome of NEGATI) assert.ok(!ingresso.strumentiEstesi.includes(nome), `${nome} must not reach a step`);
  assert.ok(ingresso.strumentiEstesi.includes('web_search'), 'reading and searching stay');
  assert.equal(ingresso.onWorkflowPlanPropose, undefined, 'a step cannot propose a Workflow');
  assert.ok(giri.giro(0).input.strumentiEstesi.includes('workflow_plan_propose'), 'the root keeps its tools');
  assert.equal(typeof giri.giro(0).input.onWorkflowPlanPropose, 'function');
});

test('WF-AGENT-BINDING-HEADER: the activity binding is in the session header before the first turn', async (t) => {
  const { cartellaStore, registro } = banco(t);
  const radice = registro.avvia('task-vero');
  const passo = registro.avviaSessioneDiPasso({ legame: LEGAME, rootSessionId: radice.sessionId, consegna: 'Leggi.' });
  const [intestazione] = righe(cartellaStore, passo.sessionId);
  assert.equal(intestazione.tipo, 'intestazione');
  assert.deepEqual(intestazione.workflow, LEGAME);
  assert.equal(intestazione.taskId, `workflow:${LEGAME.runId}:${LEGAME.nodeId}`);
  assert.equal(intestazione.permessi, 'Read only');
  assert.equal(intestazione.senzaInterfaccia, true);
  assert.equal(registro.trovaSessioneDiPasso({ activityExecutionId: LEGAME.activityExecutionId }), passo.sessionId);
  // un legame con un campo in più non è un legame
  const storto = registro.avviaSessioneDiPasso({ legame: { ...LEGAME, extra: 1 }, rootSessionId: radice.sessionId, consegna: 'x' });
  assert.equal(storto.code, 'QUERY_INVALID');
});

test('WF-AGENT-TERMINAL-DURABLE-FIRST: `fine` resolves only after the terminal fact is in the file, with the final answer and usage', async (t) => {
  const { cartellaStore, giri, registro } = banco(t);
  const radice = registro.avvia('task-vero');
  const passo = registro.avviaSessioneDiPasso({ legame: LEGAME, rootSessionId: radice.sessionId, consegna: 'Leggi e riassumi.' });
  let risolta = false;
  const esito = passo.fine.then((valore) => { risolta = true; return { valore, sulDisco: righe(cartellaStore, passo.sessionId) }; });
  giri.emetti(1, { type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'leggi' });
  giri.emetti(1, { type: 'CUSTOM', name: 'consumo-fornitore', value: { tipo: 'consumo-fornitore', usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.001 } } });
  giri.emetti(1, { type: 'TextMessageStart', messageId: 'm1', role: 'assistant' });
  giri.emetti(1, { type: 'TextMessageContent', messageId: 'm1', delta: 'Prima bozza.' });
  giri.emetti(1, { type: 'CUSTOM', name: 'consumo-fornitore', value: { tipo: 'consumo-fornitore', usage: { prompt_tokens: 150, completion_tokens: 30, cost: 0.002 } } });
  giri.emetti(1, { type: 'TextMessageStart', messageId: 'm2', role: 'assistant' });
  giri.emetti(1, { type: 'TextMessageContent', messageId: 'm2', delta: 'Le note dicono: ' });
  giri.emetti(1, { type: 'TextMessageContent', messageId: 'm2', delta: 'rilascio venerdì.' });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(risolta, false, 'nothing is final before the run ends');
  giri.concludi(1);
  const { valore, sulDisco } = await esito;
  assert.ok(sulDisco.some((riga) => riga.type === 'RunFinished'), 'at resolution time the terminal fact is already in the file');
  assert.equal(valore.sessionId, passo.sessionId);
  assert.equal(valore.esito, 'succeeded');
  assert.equal(valore.testoFinale, 'Le note dicono: rilascio venerdì.', 'the answer is the LAST assistant message');
  assert.deepEqual(valore.consumo, { promptTokens: 250, completionTokens: 50, toolCalls: 1, modelRequests: 2, knownCostUsd: 0.003 });
  assert.deepEqual(valore.legame, LEGAME);
  assert.equal(typeof valore.sequenzaTerminale, 'number');
});

test('WF-AGENT-OUTCOMES: stop is cancelled, an error is failed, and an unknown cost stays unknown', async (t) => {
  const { giri, registro } = banco(t);
  const radice = registro.avvia('task-vero');
  const fermato = registro.avviaSessioneDiPasso({ legame: LEGAME, rootSessionId: radice.sessionId, consegna: 'a' });
  // una richiesta DICHIARA il costo, l'altra no: il totale non è noto, e non è la metà nota
  giri.emetti(1, { type: 'CUSTOM', name: 'consumo-fornitore', value: { usage: { prompt_tokens: 5, completion_tokens: 1, cost: 0.001 } } });
  giri.emetti(1, { type: 'CUSTOM', name: 'consumo-fornitore', value: { usage: { prompt_tokens: 5, completion_tokens: 1 } } });
  giri.concludi(1, { type: 'RunError', message: 'Fermato', code: 'fermato' }, { ok: false });
  const a = await fermato.fine;
  assert.equal(a.esito, 'cancelled');
  assert.equal(a.consumo.knownCostUsd, null, 'a request without a declared cost makes the cost unknown, never zero');
  const secondo = { ...LEGAME, activityExecutionId: '44444444-4444-4444-8444-444444444444' };
  const rotto = registro.avviaSessioneDiPasso({ legame: secondo, rootSessionId: radice.sessionId, consegna: 'b' });
  giri.concludi(2, { type: 'RunError', message: 'Troppo traffico', code: 'PROVIDER_REQUEST_ERROR' }, { ok: false });
  const b = await rotto.fine;
  assert.equal(b.esito, 'failed');
  assert.equal(b.codiceErrore, 'PROVIDER_REQUEST_ERROR');
});

test('WF-AGENT-START-REFUSALS: nothing starts without a valid binding, a living root, a store and a task', async (t) => {
  const { giri, registro } = banco(t);
  const radice = registro.avvia('task-vero');
  const prima = giri.quanti;
  assert.equal(registro.avviaSessioneDiPasso({ legame: null, rootSessionId: radice.sessionId, consegna: 'x' }).code, 'QUERY_INVALID');
  assert.equal(registro.avviaSessioneDiPasso({ legame: LEGAME, rootSessionId: 'non-esiste', consegna: 'x' }).code, 'WORKFLOW_ROOT_SESSION_NOT_FOUND');
  assert.equal(registro.avviaSessioneDiPasso({ legame: LEGAME, rootSessionId: radice.sessionId, consegna: '  ' }).code, 'QUERY_INVALID');
  const senzaDisco = registroDiProva({ avviaSessioneFn: giriFinti().avviaSessioneFn });
  const radiceSenza = senzaDisco.avvia('task-vero');
  assert.equal(senzaDisco.avviaSessioneDiPasso({ legame: LEGAME, rootSessionId: radiceSenza.sessionId, consegna: 'x' }).code, 'SESSION_STORE_UNAVAILABLE');
  assert.equal(giri.quanti, prima, 'a refused step started no run');
});

test('WF-AGENT-RESTART-RECONCILE (registry side): after a restart the step is found by its binding and reads as interrupted', async (t) => {
  const { cartellaStore, registro } = banco(t);
  const radice = registro.avvia('task-vero');
  const passo = registro.avviaSessioneDiPasso({ legame: LEGAME, rootSessionId: radice.sessionId, consegna: 'Leggi.' });
  const vivo = await registro.leggiEsitoSessioneDiPasso({ sessionId: passo.sessionId });
  assert.equal(vivo.esito, 'in-corso');
  await svuota(cartellaStore);
  const riavviato = registroDiProva({ cartellaStore, avviaSessioneFn: giriFinti().avviaSessioneFn });
  await riavviato.ripristina();
  const trovata = riavviato.trovaSessioneDiPasso({ activityExecutionId: LEGAME.activityExecutionId });
  assert.equal(trovata, passo.sessionId);
  const dopo = await riavviato.leggiEsitoSessioneDiPasso({ sessionId: trovata });
  assert.equal(dopo.esito, 'interrupted', 'no terminal fact and no living process');
  assert.deepEqual(dopo.legame, LEGAME);
  assert.equal(await riavviato.leggiEsitoSessioneDiPasso({ sessionId: '55555555-5555-4555-8555-555555555555' }), null);
});

test('WF-AGENT-TERMINAL-NOT-ON-DISK: a run that ended without its terminal fact in the file never resolves as done', async (t) => {
  const { registraRiga } = await import('../src/session-store.mjs');
  const cartellaStore = cartellaDiProva('talos-passo-senza-terminale-');
  const giri = giriFinti();
  // la scrittura del terminale «riesce» senza scrivere niente: la forma di un disco che perde l'ultima riga
  const registraRigaFn = (argomenti) => (argomenti.record?.type === 'RunFinished' ? Promise.resolve() : registraRiga(argomenti));
  const registro = registroDiProva({ cartellaStore, avviaSessioneFn: giri.avviaSessioneFn, registraRigaFn });
  t.after(async () => { await svuota(cartellaStore); rimuoviCartellaDiProva(cartellaStore); });
  const radice = registro.avvia('task-vero');
  const passo = registro.avviaSessioneDiPasso({ legame: LEGAME, rootSessionId: radice.sessionId, consegna: 'Leggi.' });
  giri.concludi(1);
  await assert.rejects(passo.fine, (errore) => errore?.code === 'WORKFLOW_STEP_TERMINAL_NOT_DURABLE');
});

/*
 * 25/09/2026, owner: le sessioni dei PASSI escono dagli elenchi per navigare (come Hermes, `exclude_children` di serie). Il
 * registro espone il FATTO strutturale — il legame del passo — perché la barra non debba indovinare dal nome `workflow:…`.
 */
test('WF-STEP-SESSION-LISTED-AS-STEP: the session list marks a step with its run and node, and nothing else', async (t) => {
  const { registro } = banco(t);
  const radice = registro.avvia('task-vero');
  const passo = registro.avviaSessioneDiPasso({ legame: LEGAME, rootSessionId: radice.sessionId, consegna: 'Leggi.', titolo: 'Leggi le note' });
  const elenco = registro.elenca();
  const riga = elenco.find((voce) => voce.sessionId === passo.sessionId);
  assert.deepEqual(riga.passoWorkflow, { runId: LEGAME.runId, nodeId: LEGAME.nodeId });
  assert.equal(elenco.find((voce) => voce.sessionId === radice.sessionId).passoWorkflow, null, 'a session started by a person is not a step');
  // nient'altro del legame esce (lease, tentativo, esecuzione restano dentro)
  assert.deepEqual(Object.keys(riga.passoWorkflow).sort(), ['nodeId', 'runId']);
});
