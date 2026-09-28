/*
 * F3-51a (25/09/2026) — PAUSA, RIPRENDI, ANNULLA di un run, dal motore (le rotte HTTP arrivano con F3-51c). Decisioni owner
 * del 25/09: «Pausa: i passi in corso finiscono, niente di nuovo» · «Annulla: si fermano subito» (i token spesi contano, i
 * risultati già finiti restano). I comandi sono durevoli e idempotenti come Avvia: il primo fatto porta la terna del comando ed è
 * la ricevuta. Ricerca: `.claude/RICERCA-F3-51-CONTROLLI-DEL-RUN-2026-09-25.md`. Registro vero, kernel finto che si ferma allo
 * Stop come quello vero (`RunError` «fermato»).
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { createWorkflowOrchestrator } from '../src/workflow-orchestrator.mjs';
import { createAgentSessionAdapter } from '../src/workflow/adapters/agent-session.mjs';
import { approveWorkflowProposal, proposeWorkflowFromTool } from '../src/workflow/planning-control.mjs';
import { runControlCommandHash, startWorkflowRun } from '../src/workflow/run-control.mjs';
import { reserveBudget } from '../src/workflow/budget.mjs';
import { validateWorkflowEvent } from '../src/workflow/contract.mjs';
import { workflowReplay } from '../src/workflow/run.mjs';
import { createCapacitaAdattiva, createWorkflowScheduler } from '../src/workflow/scheduler.mjs';
import { createWorkflowStore, readDefinition, readEvents } from '../src/workflow/store.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const CLOUD = 'z-ai/glm-5.3-flash';
const BOZZA = {
  title: 'Prova controlli', objective: 'Provare pausa e annullamento.',
  phases: [{ id: 'f', label: 'Fase' }],
  nodes: [
    { id: 'prepara', phase: 'f', label: 'Prepara', task: 'Prepara.' },
    { id: 'uno', phase: 'f', label: 'Uno', task: 'Fai uno.', dependsOn: ['prepara'] },
    { id: 'due', phase: 'f', label: 'Due', task: 'Fai due.', dependsOn: ['prepara'] },
    { id: 'dopo', phase: 'f', label: 'Dopo', task: 'Dopo uno.', dependsOn: ['uno'] },
  ],
};

/** Il kernel finto: un giro resta aperto finché la prova risponde, e allo Stop chiude come il vero (`RunError` «fermato»). */
function giriFinti() {
  const giri = [];
  const api = {
    avviaSessioneFn(input) {
      let risolvi;
      const promessa = new Promise((resolve) => { risolvi = resolve; });
      const giro = { input, chiuso: false, fermato: false, consegna: input.task?.consegna ?? '' };
      giro.chiudi = (valore) => { if (giro.chiuso) return; giro.chiuso = true; risolvi(valore); };
      giri.push(giro);
      input.onEvento({ type: 'RunStarted', threadId: `t${giri.length}`, runId: `r${giri.length}` });
      input.segnaleStop?.addEventListener('abort', () => {
        if (giro.chiuso) return;
        giro.fermato = true;
        input.onEvento({ type: 'RunError', message: 'Fermato.', code: 'fermato' });
        giro.chiudi({ ok: false, esito: 'fermato' });
      }, { once: true });
      return promessa;
    },
    indice(testo) { return giri.findIndex((giro) => giro.consegna.startsWith(testo)); },
    giro(i) { return giri[i]; },
    consuma(i, usage) { giri[i].input.onEvento({ type: 'CUSTOM', name: 'consumo-fornitore', value: { tipo: 'consumo-fornitore', usage } }); },
    rispondi(i, testo = 'fatto') {
      api.consuma(i, { prompt_tokens: 10, completion_tokens: 5 });
      giri[i].input.onEvento({ type: 'TextMessageStart', messageId: `m${i}`, role: 'assistant' });
      giri[i].input.onEvento({ type: 'TextMessageContent', messageId: `m${i}`, delta: testo });
      giri[i].input.onEvento({ type: 'RunFinished' });
      giri[i].chiudi({ ok: true });
    },
    fallisci(i, classe, message = 'guasto') {
      api.consuma(i, { prompt_tokens: 10, completion_tokens: 0 });
      giri[i].input.onEvento({ type: 'RunError', message, code: 'PROVIDER_REQUEST_ERROR', classe });
      giri[i].chiudi({ ok: false, esito: null, erroreInterno: message, codiceErrore: 'PROVIDER_REQUEST_ERROR' });
    },
    get quanti() { return giri.length; },
  };
  return api;
}

async function aspettaChe(condizione, ms = 3_000) {
  const fine = Date.now() + ms;
  while (Date.now() < fine) {
    if (await condizione()) return true;
    await new Promise((r) => setTimeout(r, 5));
  }
  return Boolean(await condizione());
}
const calma = () => new Promise((r) => setTimeout(r, 120));
async function svuota(cartellaStore) {
  for (let i = 0; i < 3; i += 1) { try { await attendiScritture({ cartellaStore }); } catch { /* */ } await new Promise((r) => setImmediate(r)); }
}

async function banco(t) {
  const cartellaStore = cartellaDiProva('talos-wf-controlli-sessioni-');
  const radiceWorkflow = mkdtempSync(join(tmpdir(), 'talos-wf-controlli-store-'));
  const opzioniRegistro = (giri) => ({ guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k', cartellaStore,
    avviaSessioneFn: giri.avviaSessioneFn, cartellaEsisteFn: () => true, workflowPlanProposeFn: async () => ({}),
    preparaEsecuzioneFn: (taskId) => {
      if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
      return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'radice' } };
    } });
  const giri = giriFinti();
  const registro = createSessionRegistry(opzioniRegistro(giri));
  const store = await createWorkflowStore({ workflowDataRoot: radiceWorkflow, workspaceRoots: [],
    resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 } });
  const nowFn = () => new Date(Date.now() + 60_000).toISOString();
  const schedulers = [];
  const componi = ({ sessioni = registro, adattatori } = {}) => {
    const capacita = createCapacitaAdattiva();
    const orchestrator = createWorkflowOrchestrator({ store, nowFn, randomFn: () => 0.5, capacityFn: () => capacita.politica(),
      adapters: adattatori ?? new Map([['agent-session', createAgentSessionAdapter({ sessions: sessioni })]]) });
    const errori = [];
    const scheduler = createWorkflowScheduler({ orchestrator, store, capacita, nowFn, onErrore: (errore) => errori.push(errore),
      timerFn: () => null, clearTimerFn: () => {} });
    schedulers.push(scheduler);
    return { orchestrator, scheduler, errori };
  };
  const riavvia = async () => {
    await svuota(cartellaStore);
    const giriDopo = giriFinti();
    const registroDopo = createSessionRegistry(opzioniRegistro(giriDopo));
    await registroDopo.ripristina();
    return { giri: giriDopo, ...componi({ sessioni: registroDopo }) };
  };
  t.after(async () => {
    for (const scheduler of schedulers) scheduler.ferma();
    await store.close();
    await svuota(cartellaStore);
    rimuoviCartellaDiProva(cartellaStore); rimuoviCartellaDiProva(radiceWorkflow);
  });
  const radice = registro.avvia('task-vero', { modelloScelto: CLOUD });
  const esiste = (id) => id === radice.sessionId;
  const proposta = await proposeWorkflowFromTool(store, { sessionId: radice.sessionId, toolCallId: `call_${randomUUID()}`, draft: BOZZA,
    plannerModel: null, sessionModel: CLOUD, modalitaOperativa: 'normale', agentRole: 'root' });
  await approveWorkflowProposal(store, { workflowId: proposta.workflowId, version: 1, definitionHash: proposta.definitionHash,
    commandId: randomUUID() }, { sessionExistsFn: esiste });
  const avviato = await startWorkflowRun(store, { workflowId: proposta.workflowId, version: 1, definitionHash: proposta.definitionHash,
    commandId: randomUUID() }, { sessionExistsFn: esiste, supportedNodeKinds: ['agent'] });
  const runId = avviato.runId;
  const stato = async () => {
    const eventi = await readEvents(store, { runId });
    const definizione = await readDefinition(store, { workflowId: eventi[0].payload.workflowId, version: eventi[0].payload.definitionVersion });
    return { eventi, stato: workflowReplay({ definition: definizione.core, runId, events: eventi }) };
  };
  return { componi, riavvia, giri, runId, stato, workflowId: proposta.workflowId };
}

/** Porta il run al punto in cui `uno` e `due` girano insieme (`prepara` finito). */
async function finoAiDuePassi(b, p) {
  await p.orchestrator.recover();
  await p.scheduler.avvia();
  assert.ok(await aspettaChe(() => b.giri.quanti === 2), 'prepara starts');
  b.giri.rispondi(b.giri.indice('Prepara'));
  assert.ok(await aspettaChe(() => b.giri.quanti === 4), 'uno and due start together');
}

const comanda = async (p, runId, action, commandId = randomUUID()) => {
  const esito = await p.orchestrator.requestRunControl({ runId, action, commandId });
  p.scheduler.sveglia(runId);
  return esito;
};
const occupati = (stato) => [...stato.capacityClaims.values()].filter((claim) => claim.state === 'active').length;

test('WF-RUN-PAUSE-DRAINS: pause lets the steps in progress finish, starts nothing new, then the run is paused; resume goes on from there', async (t) => {
  const b = await banco(t);
  const p = b.componi();
  await finoAiDuePassi(b, p);
  const pausa = randomUUID();
  const chiesta = await comanda(p, b.runId, 'pause', pausa);
  assert.equal(chiesta.deduplicated, false);
  let { eventi, stato } = await b.stato();
  const fatto = eventi.find((evento) => evento.type === 'run_pause_requested');
  assert.deepEqual([fatto.commandId, fatto.commandType, fatto.payload.reason], [pausa, 'pause-run', 'user'], 'the fact is the receipt');
  assert.equal(fatto.commandPayloadHash, runControlCommandHash({ commandType: 'pause-run', workflowId: b.workflowId, version: 1, runId: b.runId }));
  assert.equal(stato.run.status, 'running', 'pausing: the two steps are still at work');

  b.giri.rispondi(b.giri.indice('Fai uno'));
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.nodes.get('uno').state === 'succeeded'));
  await calma();
  assert.equal(b.giri.quanti, 4, '«dopo» is ready but nothing new starts while pausing');
  assert.equal((await b.stato()).stato.run.status, 'running');
  b.giri.rispondi(b.giri.indice('Fai due'));
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'paused'), 'paused once the steps in progress finished');
  ({ stato } = await b.stato());
  assert.equal(occupati(stato), 0, 'no slot held while paused');
  assert.equal(stato.nodes.get('dopo').activeActivityExecutionId, null, '«dopo» never got an attempt while pausing');

  const ripetuta = await p.orchestrator.requestRunControl({ runId: b.runId, action: 'pause', commandId: pausa });
  assert.equal(ripetuta.deduplicated, true, 'the same command again answers with its receipt');
  assert.equal(ripetuta.receipt.resultingSeq, fatto.seq);
  const seconda = randomUUID();
  await assert.rejects(p.orchestrator.requestRunControl({ runId: b.runId, action: 'pause', commandId: seconda }),
    { code: 'WORKFLOW_RUN_STATE_CONFLICT' }, 'a paused run cannot be paused again');
  await assert.rejects(p.orchestrator.requestRunControl({ runId: b.runId, action: 'resume', commandId: pausa }),
    { code: 'WORKFLOW_COMMAND_CONFLICT' }, 'the pause id cannot become a resume');

  const ripresa = await comanda(p, b.runId, 'resume', seconda);
  assert.equal(ripresa.deduplicated, false, 'a refused command does not consume its id');
  assert.ok(await aspettaChe(() => b.giri.quanti === 5), '«dopo» starts after resume');
  b.giri.rispondi(4);
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'succeeded'));
  assert.deepEqual(p.errori, []);
});

test('WF-RUN-CANCEL-STOPS-STEPS: cancel stops the steps in progress now, keeps their spent tokens, cancels what never started, and ends the run', async (t) => {
  const b = await banco(t);
  const p = b.componi();
  await finoAiDuePassi(b, p);
  b.giri.consuma(b.giri.indice('Fai uno'), { prompt_tokens: 300, completion_tokens: 20 });
  b.giri.consuma(b.giri.indice('Fai due'), { prompt_tokens: 200, completion_tokens: 10 });
  await comanda(p, b.runId, 'cancel');
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'cancelled'), 'the run is cancelled');
  const { eventi, stato } = await b.stato();
  assert.ok(b.giri.giro(b.giri.indice('Fai uno')).fermato && b.giri.giro(b.giri.indice('Fai due')).fermato, 'both sessions were stopped');
  for (const nodo of ['uno', 'due', 'dopo']) assert.equal(stato.nodes.get(nodo).state, 'cancelled', nodo);
  assert.equal(stato.nodes.get('prepara').state, 'succeeded', 'what finished stays finished, with its result');
  const fallimenti = eventi.filter((evento) => evento.type === 'activity_failed');
  assert.equal(fallimenti.length, 2);
  for (const evento of fallimenti) {
    assert.equal(evento.eventSchemaVersion, 2);
    assert.equal(evento.payload.errorClass, 'cancelled');
    assert.equal(evento.payload.retryable, false);
    assert.match(evento.payload.receiptRef, /^talos-session:/u);
  }
  assert.equal(occupati(stato), 0);
  assert.equal(stato.budget.reservations.size, 0, 'every reservation is closed');
  assert.equal(stato.budget.spent.promptTokens, 10 + 300 + 200, 'the tokens of the stopped steps count');
  assert.ok(!eventi.some((evento) => evento.type === 'node_failed' || evento.type === 'retry_scheduled'), 'a cancelled step is not a failure and is not retried');
  assert.equal(b.giri.quanti, 4, 'nothing new started');
  assert.deepEqual(p.errori, []);
});

test('WF-RUN-CANCEL-PAUSED-AND-PREPARED: a paused run and a run that never started are cancelled at once', async (t) => {
  const b = await banco(t);
  const p = b.componi();
  await p.orchestrator.recover();
  // prima che lo scheduler lo avvii: annullato da preparato, non parte mai
  await p.orchestrator.requestRunControl({ runId: b.runId, action: 'cancel', commandId: randomUUID() });
  await p.scheduler.avvia();
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'cancelled'));
  const { eventi, stato } = await b.stato();
  assert.ok(!eventi.some((evento) => evento.type === 'run_started'), 'a run cancelled while prepared never starts');
  assert.ok([...stato.nodes.values()].every((node) => node.state === 'cancelled'));
  assert.equal(b.giri.quanti, 1, 'only the root session');
  await assert.rejects(p.orchestrator.requestRunControl({ runId: b.runId, action: 'cancel', commandId: randomUUID() }),
    { code: 'WORKFLOW_RUN_STATE_CONFLICT' }, 'an ended run cannot be cancelled again');
});

test('WF-RUN-CANCEL-AFTER-PAUSE: cancelling a paused run ends it without starting anything', async (t) => {
  const b = await banco(t);
  const p = b.componi();
  await finoAiDuePassi(b, p);
  await comanda(p, b.runId, 'pause');
  b.giri.rispondi(b.giri.indice('Fai uno'));
  b.giri.rispondi(b.giri.indice('Fai due'));
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'paused'));
  await comanda(p, b.runId, 'cancel');
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'cancelled'));
  const { stato } = await b.stato();
  assert.equal(stato.nodes.get('dopo').state, 'cancelled');
  assert.equal(stato.nodes.get('uno').state, 'succeeded');
  assert.equal(b.giri.quanti, 4);
});

test('WF-RUN-CANCEL-SURVIVES-RESTART: a cancel asked just before a crash is completed by the next process', async (t) => {
  const b = await banco(t);
  const primo = b.componi();
  await finoAiDuePassi(b, primo);
  assert.ok(await aspettaChe(async () => (await b.stato()).eventi.filter((evento) => evento.type === 'agent_session_created').length === 3));
  primo.scheduler.ferma(); // il processo muore subito dopo aver scritto l'intenzione: nessuno ferma le sessioni
  await primo.orchestrator.requestRunControl({ runId: b.runId, action: 'cancel', commandId: randomUUID() });
  const dopo = await b.riavvia();
  await dopo.orchestrator.recover();
  await dopo.scheduler.avvia();
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'cancelled'), 'the intent was durable: the new process finishes it');
  const { eventi, stato } = await b.stato();
  assert.deepEqual(eventi.filter((evento) => evento.type === 'activity_reconciled').map((evento) => evento.payload.outcome).sort(),
    ['proved_interrupted', 'proved_interrupted'], 'the two dead steps are proven interrupted');
  assert.ok(!eventi.some((evento) => evento.type === 'retry_scheduled'), 'and not retried: the run is being cancelled');
  assert.equal(occupati(stato), 0);
  assert.equal(dopo.giri.quanti, 0, 'nothing started in the new process');
});

test('WF-RUN-CONTROL-REFUSES: a wrong action or command id is refused before any fact', async (t) => {
  const b = await banco(t);
  const p = b.componi();
  await p.orchestrator.recover();
  const prima = (await b.stato()).eventi.length;
  await assert.rejects(p.orchestrator.requestRunControl({ runId: b.runId, action: 'stop', commandId: randomUUID() }), { code: 'QUERY_INVALID' });
  await assert.rejects(p.orchestrator.requestRunControl({ runId: b.runId, action: 'pause', commandId: 'non-un-uuid' }), { code: 'QUERY_INVALID' });
  await assert.rejects(p.orchestrator.requestRunControl({ runId: b.runId, action: 'resume', commandId: randomUUID() }),
    { code: 'WORKFLOW_RUN_STATE_CONFLICT' }, 'a prepared run cannot be resumed');
  assert.equal((await b.stato()).eventi.length, prima);
});

/*
 * Un adattatore finto che PERDE la fine del primo tentativo di «due» (l'esecuzione lancia ⇒ `activity_uncertain`) quando la
 * prova apre il suo cancello, e che alla riconciliazione prova «non eseguito». Gli altri passi finiscono subito, con ricevuta
 * e consumo.
 */
function adattatoreCheIncerta() {
  const tentativi = new Map();
  let apri;
  const cancello = new Promise((resolve) => { apri = resolve; });
  const consumo = { promptTokens: 1, completionTokens: 1, wallMs: 0, agentSeconds: 0, toolCalls: 0, modelRequests: 1, knownCostUsd: null };
  return {
    id: 'finto-incerto',
    tentativi,
    apri: () => apri(),
    async execute(ctx) {
      const n = (tentativi.get(ctx.nodeId) ?? 0) + 1;
      tentativi.set(ctx.nodeId, n);
      if (ctx.nodeId === 'due' && n === 1) { await cancello; throw new Error('la fine del passo non è arrivata'); }
      return { status: 'completed', receiptRef: `finto:${ctx.nodeId}:${n}`, results: [], actualUsage: consumo };
    },
    async reconcile() { return { outcome: 'proved_not_performed', receiptRef: null, resultIds: [], actualUsage: null }; },
    async cancel() { return { outcome: 'cancelled', evidenceResultIds: [] }; },
  };
}

const posizione = (eventi, tipo, nodeId) => eventi.findIndex((evento) => evento.type === tipo && evento.nodeId === nodeId);

test('WF-UNCERTAIN-RECONCILED-IN-PROCESS: an attempt left uncertain is reconciled by the running process, not only after a restart', async (t) => {
  const b = await banco(t);
  const finto = adattatoreCheIncerta();
  const p = b.componi({ adattatori: new Map([['agent-session', finto]]) });
  await p.orchestrator.recover();
  await p.scheduler.avvia();
  assert.ok(await aspettaChe(async () => (await b.stato()).eventi.some((evento) => evento.type === 'activity_started' && evento.nodeId === 'due')));
  finto.apri();
  assert.ok(await aspettaChe(async () => (await b.stato()).eventi.some((evento) => evento.type === 'retry_scheduled' && evento.nodeId === 'due')),
    'reconciled as not performed, released and retried — in the same process, before any restart');
  const { eventi, stato } = await b.stato();
  const ordine = ['activity_uncertain', 'activity_reconciled', 'capacity_released', 'budget_released', 'retry_scheduled']
    .map((tipo) => posizione(eventi, tipo, 'due'));
  assert.ok(ordine.every((indice, i) => indice >= 0 && (i === 0 || indice > ordine[i - 1])), `order: ${ordine}`);
  assert.equal(eventi.find((evento) => evento.type === 'activity_reconciled').payload.outcome, 'proved_not_performed');
  assert.equal(stato.nodes.get('due').state, 'retry_wait');
  assert.deepEqual(p.errori, []);
});

test('WF-RUN-CANCEL-RECONCILES-UNCERTAIN: cancel waits for a step whose end is lost, proves it, releases it, and ends the run', async (t) => {
  const b = await banco(t);
  const finto = adattatoreCheIncerta();
  const p = b.componi({ adattatori: new Map([['agent-session', finto]]) });
  await p.orchestrator.recover();
  await p.scheduler.avvia();
  assert.ok(await aspettaChe(async () => (await b.stato()).eventi.some((evento) => evento.type === 'activity_started' && evento.nodeId === 'due')));
  await comanda(p, b.runId, 'cancel');
  await calma();
  assert.notEqual((await b.stato()).stato.run.status, 'cancelled', 'cancelling: the step in progress has not answered yet');
  finto.apri(); // il passo «finisce» senza prova: incerto, mentre l'annullamento è chiesto
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'cancelled'));
  const { eventi, stato } = await b.stato();
  assert.ok(posizione(eventi, 'activity_reconciled', 'due') > posizione(eventi, 'run_cancel_requested', null), 'proved by the cancel branch');
  assert.ok(!eventi.some((evento) => evento.type === 'retry_scheduled'), 'no retry during a cancel');
  assert.equal(stato.nodes.get('due').state, 'cancelled');
  assert.equal(occupati(stato), 0);
  assert.equal(stato.budget.reservations.size, 0);
  assert.deepEqual(p.errori, []);
});

/*
 * F3-51b (25/09/2026), owner «Riprova: rifà solo i passi falliti (poi quelli che li aspettavano), i riusciti restano, tentativi da
 * capo; il tetto si alza di quanto serve, detto prima».
 */
test('WF-RUN-RETRY-FAILED-ONLY: «Riprova» redoes only the failed step, its attempts start over, the ceiling rises by what the preview said', async (t) => {
  const b = await banco(t);
  const p = b.componi();
  await finoAiDuePassi(b, p);
  b.giri.fallisci(b.giri.indice('Fai uno'), 'credenziale', 'Credenziale rifiutata dal fornitore.');
  b.giri.rispondi(b.giri.indice('Fai due'));
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'needs_attention'));
  let { eventi, stato } = await b.stato();
  assert.equal(stato.nodes.get('dopo').state, 'blocked');

  const anteprima = await p.orchestrator.retryPreview({ runId: b.runId });
  const passoUno = stato.definition.nodes.find((node) => node.id === 'uno');
  const tentativi = Math.min(passoUno.activityPolicy.maxAttempts, passoUno.budget.attempts);
  assert.deepEqual(anteprima.nodeIds, ['uno'], 'only the failed step');
  assert.equal(anteprima.ceilingRaise.promptTokens, passoUno.budget.promptTokens * tentativi, 'said before: budget per attempt × attempts');

  const riprova = randomUUID();
  const esito = await comanda(p, b.runId, 'retry', riprova);
  assert.equal(esito.deduplicated, false);
  ({ eventi, stato } = await b.stato());
  const fatto = eventi.find((evento) => evento.type === 'retry_scheduled' && evento.payload.reasonClass === 'user_retry');
  assert.deepEqual([fatto.nodeId, fatto.commandId, fatto.commandType, fatto.payload.backoffMs], ['uno', riprova, 'retry-node', 0], 'the fact is the receipt');
  assert.ok(eventi.findIndex((evento) => evento.type === 'run_resumed') > eventi.indexOf(fatto), 'then the run leaves «needs attention»');
  assert.equal(stato.budget.ceilingRaise.promptTokens, anteprima.ceilingRaise.promptTokens, 'the fact applied exactly the previewed raise');
  assert.equal(stato.nodes.get('uno').attemptBase, 1);
  assert.equal((await p.orchestrator.requestRunControl({ runId: b.runId, action: 'retry', commandId: riprova })).deduplicated, true);

  // il contratto del fatto: nessuna attesa, e il comando retry-node vale solo per un ritentativo umano
  validateWorkflowEvent(fatto);
  assert.throws(() => validateWorkflowEvent({ ...fatto, payload: { ...fatto.payload, backoffMs: 5 } }), { code: 'WORKFLOW_EVENT_INVALID' });
  assert.throws(() => validateWorkflowEvent({ ...fatto, payload: { ...fatto.payload, reasonClass: 'rate_limit' } }), { code: 'WORKFLOW_EVENT_INVALID' });
  // il budget rispetta il tetto ALZATO: una riserva che ci sta solo grazie all'aumento passa, e senza l'aumento no
  const quasiPieno = structuredClone(stato);
  quasiPieno.nodes.get('uno').state = 'ready';
  quasiPieno.budget.spent.promptTokens = quasiPieno.definition.budgets.promptTokens - 500;
  const riserva = (statoDiProva) => reserveBudget({ state: statoDiProva, definition: statoDiProva.definition, events: eventi, at: new Date().toISOString(),
    input: { reservationId: randomUUID(), runId: b.runId, nodeId: 'uno', activityExecutionId: randomUUID(), leaseId: randomUUID(), leaseEpoch: 9,
      reserved: { promptTokens: 1_000, completionTokens: 0, wallMs: 0, agentSeconds: 0, toolCalls: 0, modelRequests: 0, knownCostUsd: null } } });
  assert.equal(riserva(quasiPieno).type, 'budget_reserved', 'within the raised ceiling');
  delete quasiPieno.budget.ceilingRaise;
  assert.throws(() => riserva(quasiPieno), { code: 'WORKFLOW_BUDGET_EXCEEDED' }, 'the same reservation over the approved ceiling');

  // tentativi DA CAPO: il secondo tentativo fallisce per traffico e si ritenta ancora (senza la base sarebbe il 2° di 2: fallito)
  assert.ok(await aspettaChe(() => b.giri.quanti === 5), 'the failed step runs again');
  b.giri.fallisci(4, 'traffico', 'Troppo traffico presso il fornitore.');
  assert.ok(await aspettaChe(async () => (await b.stato()).eventi.filter((evento) => evento.type === 'retry_scheduled' && evento.nodeId === 'uno').length === 2));
  ({ stato } = await b.stato());
  assert.equal(stato.nodes.get('uno').state, 'retry_wait', 'retried automatically: its attempts started over');
  await new Promise((r) => setTimeout(r, 1_100));
  p.scheduler.sveglia(b.runId);
  assert.ok(await aspettaChe(() => b.giri.quanti === 6), 'third attempt');
  b.giri.rispondi(5);
  assert.ok(await aspettaChe(() => b.giri.quanti === 7), 'then the step that waited for it');
  b.giri.rispondi(6);
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'succeeded'));
  ({ stato } = await b.stato());
  assert.equal(stato.nodes.get('uno').attempt, 3);
  const volte = (testo) => [0, 1, 2, 3, 4, 5, 6].filter((i) => b.giri.giro(i).consegna.startsWith(testo)).length;
  assert.deepEqual([volte('Prepara'), volte('Fai due'), volte('Fai uno'), volte('Dopo uno')], [1, 1, 3, 1],
    'the succeeded steps stay: only «uno» ran again');
  assert.deepEqual(p.errori, []);
});

test('WF-RUN-RETRY-REFUSES: nothing failed, or a run that has ended — refused, and no fact', async (t) => {
  const b = await banco(t);
  const p = b.componi();
  await finoAiDuePassi(b, p);
  const id = randomUUID();
  await assert.rejects(p.orchestrator.requestRunControl({ runId: b.runId, action: 'retry', commandId: id }),
    { code: 'WORKFLOW_RUN_STATE_CONFLICT' }, 'nothing failed yet');
  await comanda(p, b.runId, 'cancel');
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'cancelled'));
  await assert.rejects(p.orchestrator.requestRunControl({ runId: b.runId, action: 'retry', commandId: id }),
    { code: 'WORKFLOW_RUN_STATE_CONFLICT' }, 'an ended run cannot retry');
  assert.ok(!(await b.stato()).eventi.some((evento) => evento.type === 'retry_scheduled'));
});
