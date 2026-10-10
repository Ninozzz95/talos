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
import { attendiScritture, registraRiga } from '../src/session-store.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { createWorkflowOrchestrator } from '../src/workflow-orchestrator.mjs';
import { createAgentSessionAdapter } from '../src/workflow/adapters/agent-session.mjs';
import { creaOnWorkflowFn } from '../src/workflow/per-il-modello.mjs';
import { approveWorkflowProposal, proposeWorkflowFromTool } from '../src/workflow/planning-control.mjs';
import { resolveNodeCommandHash, runControlCommandHash, startWorkflowRun } from '../src/workflow/run-control.mjs';
import { reserveBudget } from '../src/workflow/budget.mjs';
import { validateWorkflowEvent } from '../src/workflow/contract.mjs';
import { workflowApply, workflowReplay } from '../src/workflow/run.mjs';
import { buildWorkflowIndexes } from '../src/workflow/indexes.mjs';
import { createCapacitaAdattiva, createWorkflowScheduler } from '../src/workflow/scheduler.mjs';
import { appendEvent, createWorkflowStore, readDefinition, readEvents } from '../src/workflow/store.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { creaAttesaAProgresso } from './aiuto/attesa-a-progresso.mjs';

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
function giriFinti({ ritardoChiusuraMs = 0 } = {}) {
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
        // Y-2b-1: il giro fermato può assestarsi DOPO l'errore annunciato (la finestra di chiusura del registro)
        if (ritardoChiusuraMs > 0) setTimeout(() => giro.chiudi({ ok: false, esito: 'fermato' }), ritardoChiusuraMs);
        else giro.chiudi({ ok: false, esito: 'fermato' });
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

/* 01/10/2026: l'attesa conta il tempo SENZA progresso delle cartelle dati del banco (tests/aiuto/attesa-a-progresso.mjs). */
const { aspettaChe, segui } = creaAttesaAProgresso({ ms: 3_000 });
const calma = () => new Promise((r) => setTimeout(r, 120));
async function svuota(cartellaStore) {
  for (let i = 0; i < 3; i += 1) { try { await attendiScritture({ cartellaStore }); } catch { /* */ } await new Promise((r) => setImmediate(r)); }
}

async function banco(t, { ritardoChiusuraMs = 0, spiaRiga = null } = {}) {
  const cartellaStore = segui(cartellaDiProva('talos-wf-controlli-sessioni-'));
  const radiceWorkflow = segui(mkdtempSync(join(tmpdir(), 'talos-wf-controlli-store-')));
  const opzioniRegistro = (giri) => ({ guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k', cartellaStore,
    avviaSessioneFn: giri.avviaSessioneFn, cartellaEsisteFn: () => true, workflowPlanProposeFn: async () => ({}),
    // C3-21 (bugfixer, 09/10): una spia sulle righe del registro, per far cadere una scrittura nel punto esatto
    ...(spiaRiga ? { registraRigaFn: (argomenti) => spiaRiga(argomenti, registraRiga) } : {}),
    preparaEsecuzioneFn: (taskId) => {
      if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
      return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'radice' } };
    } });
  const giri = giriFinti({ ritardoChiusuraMs });
  const registro = createSessionRegistry(opzioniRegistro(giri));
  /* ⛔ 01/10/2026 — la manopola del DISCO LENTO, solo per le prove: ogni scrittura del giornale attende tanto prima e dopo (il
     `failpoint` dello store, come `banco` di workflow-scheduler-loop.test.mjs). Serve a rifare qui, a comando, il runner Windows
     della PR #45 dove WF-RUN-PAUSE-DRAINS è caduta (10,8 s). Spenta di serie. */
  const ritardoScrittureMs = Number(process.env.TALOS_PROVA_RITARDO_SCRITTURE_MS) || 0;
  const store = await createWorkflowStore({ workflowDataRoot: radiceWorkflow, workspaceRoots: [],
    resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 } },
  ritardoScrittureMs > 0 ? { failpoint: async (nome) => { if (nome.startsWith('store.journal.')) await new Promise((r) => setTimeout(r, ritardoScrittureMs)); } } : {});
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
  return { componi, riavvia, giri, runId, stato, workflowId: proposta.workflowId, store, rootSessionId: radice.sessionId, registro, cartellaStore };
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

/* ═══════════════════════════════════════════════════════════════════════════════════
 * ⛔⛔ A10 (07/10/2026, `desktop-bugfixer`) — IL RIFIUTO DICE COSA SI PUÒ FARE ADESSO, E PERCHÉ IL RUN ASPETTA.
 *   Prima: «only a paused run can be resumed» e basta; un run in «Serve attenzione» senza passi falliti non aveva nessuna
 *   azione valida per il modello e il rifiuto non lo diceva. Regola pura in `workflow/azioni-del-run.mjs`.
 * ═══════════════════════════════════════════════════════════════════════════════════ */

test('A10-06 RIFIUTO-CON-AZIONI: un resume su un run in corso è rifiutato nominando le azioni valide, sull errore e nel testo', async (t) => {
  const b = await banco(t);
  const p = b.componi();
  await finoAiDuePassi(b, p);
  await assert.rejects(p.orchestrator.requestRunControl({ runId: b.runId, action: 'resume', commandId: randomUUID() }), (errore) => {
    assert.equal(errore.code, 'WORKFLOW_RUN_STATE_CONFLICT');
    assert.deepEqual(errore.allowedActions, ['pause', 'cancel']);
    assert.deepEqual(errore.attentionReasons, []);
    assert.match(errore.message, /only a paused run can be resumed \(this one is running\)\. Nothing was changed\. Allowed actions now: pause, cancel\./);
    return true;
  });
});

test('A10-07 SERVE-ATTENZIONE: con un passo fallito il rifiuto di resume dice cancel e retry, e il motivo node_failed', async (t) => {
  const b = await banco(t);
  const p = b.componi();
  await finoAiDuePassi(b, p);
  b.giri.fallisci(b.giri.indice('Fai uno'), 'credenziale', 'Credenziale rifiutata dal fornitore.');
  b.giri.rispondi(b.giri.indice('Fai due'));
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'needs_attention'));
  await assert.rejects(p.orchestrator.requestRunControl({ runId: b.runId, action: 'resume', commandId: randomUUID() }), (errore) => {
    assert.deepEqual(errore.allowedActions, ['cancel', 'retry']);
    assert.deepEqual(errore.attentionReasons, ['node_failed']);
    assert.match(errore.message, /Allowed actions now: cancel, retry\. The run needs attention because: node_failed\./);
    return true;
  });
  // il MODELLO: workflow_control ha solo pause/resume/cancel ⇒ gli si dice cosa può usare lui, e che retry è della persona
  const onWorkflowFn = creaOnWorkflowFn({ store: b.store, runtimeFn: () => ({ orchestrator: p.orchestrator, scheduler: p.scheduler }) });
  const testo = await onWorkflowFn('workflow_control', { runId: b.runId, azione: 'resume' }, { rootSessionId: b.rootSessionId });
  assert.match(testo, /only a paused run can be resumed \(this one is needs_attention\)/);
  assert.match(testo, /Nothing was changed\./);
  assert.match(testo, /You can use now: cancel\./);
  assert.doesNotMatch(testo, /Allowed actions now/, 'il motivo viene dal campo refusalReason, non dal messaggio intero');
  assert.match(testo, /retry.*Workflow panel/);
  assert.match(testo, /needs attention because: node_failed/);
  // e lo stato del run, letto dal modello, lo dice prima ancora di provarci
  const stato = await onWorkflowFn('workflow_status', { runId: b.runId }, { rootSessionId: b.rootSessionId });
  assert.match(stato, /allowed actions now: cancel; the person can retry the failed steps from the Workflow panel, or, on one failed step, mark it done \(with a summary of what was done\), set it aside \(the steps waiting for it will not start\) or redo it with another model; needs attention because: node_failed$/m);
  assert.doesNotMatch(stato, /allowed actions now: [^;]*retry/, 'retry non è un azione del modello');
  assert.match(stato, /needs attention because: node_failed/);
  assert.ok(!(await b.stato()).eventi.some((evento) => evento.type === 'run_resumed'), 'nothing was written');
});

/* ── A10, review di «talos desktop»: il caso del difetto con l'orchestratore vero, e i rami senza prova ───────────── */
function adattatoreCheRestaIncerto() {
  let apri;
  const cancello = new Promise((resolve) => { apri = resolve; });
  const consumo = { promptTokens: 1, completionTokens: 1, wallMs: 0, agentSeconds: 0, toolCalls: 0, modelRequests: 1, knownCostUsd: null };
  return {
    id: 'finto-incerto-per-sempre', apri: () => apri(),
    async execute(ctx) {
      if (ctx.nodeId === 'due') { await cancello; throw new Error('la fine del passo non è arrivata'); }
      return { status: 'completed', receiptRef: `finto:${ctx.nodeId}`, results: [], actualUsage: consumo };
    },
    async reconcile() { return { outcome: 'still_unknown', receiptRef: null, resultIds: [], actualUsage: null }; },
    async cancel() { return { outcome: 'cancelled', evidenceResultIds: [] }; },
  };
}

test('A10-08 INCERTO-SENZA-FALLITI: «Serve attenzione» per un passo incerto, nessun passo fallito ⇒ il modello sa che può solo annullare', async (t) => {
  const b = await banco(t);
  const finto = adattatoreCheRestaIncerto();
  const p = b.componi({ adattatori: new Map([['agent-session', finto]]) });
  await p.orchestrator.recover();
  await p.scheduler.avvia();
  assert.ok(await aspettaChe(async () => (await b.stato()).eventi.some((evento) => evento.type === 'activity_started' && evento.nodeId === 'due')));
  finto.apri();
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'needs_attention'), 'il passo incerto mette il run in attenzione');
  const { stato } = await b.stato();
  assert.equal([...stato.nodes.values()].filter((n) => n.state === 'failed').length, 0, 'premessa: nessun passo fallito');
  assert.match(stato.run.needsAttentionReasons.join(','), /^activity_uncertain:/);
  await assert.rejects(p.orchestrator.requestRunControl({ runId: b.runId, action: 'resume', commandId: randomUUID() }), (errore) => {
    assert.deepEqual(errore.allowedActions, ['cancel']);
    assert.match(errore.attentionReasons[0], /^activity_uncertain:/);
    return true;
  });
  const onWorkflowFn = creaOnWorkflowFn({ store: b.store, runtimeFn: () => ({ orchestrator: p.orchestrator, scheduler: p.scheduler }) });
  const testo = await onWorkflowFn('workflow_control', { runId: b.runId, azione: 'resume' }, { rootSessionId: b.rootSessionId });
  assert.match(testo, /You can use now: cancel\./);
  assert.doesNotMatch(testo, /Allowed actions now/, 'il motivo viene dal campo refusalReason, non dal messaggio intero');
  assert.doesNotMatch(testo, /retry/, 'nessun passo fallito: niente riprova da proporre');
  assert.match(testo, /needs attention because: activity_uncertain:/);
  const statoPerIlModello = await onWorkflowFn('workflow_status', { runId: b.runId }, { rootSessionId: b.rootSessionId });
  assert.match(statoPerIlModello, /allowed actions now: cancel; needs attention because: activity_uncertain:/);
});

test('A10-09 RIPROVA-SENZA-FALLITI: anche il rifiuto «there is no failed step to retry» porta azioni e motivi', async (t) => {
  const b = await banco(t);
  const p = b.componi();
  await finoAiDuePassi(b, p);
  await assert.rejects(p.orchestrator.requestRunControl({ runId: b.runId, action: 'retry', commandId: randomUUID() }), (errore) => {
    assert.equal(errore.code, 'WORKFLOW_RUN_STATE_CONFLICT');
    assert.match(errore.message, /there is no failed step to retry\. Nothing was changed\. Allowed actions now: pause, cancel\./);
    assert.deepEqual(errore.allowedActions, ['pause', 'cancel']);
    assert.deepEqual(errore.attentionReasons, []);
    return true;
  });
});

test('A10-10 ERRORE-NON-DI-CONFLITTO: workflow_control lascia passare INTATTO un errore che non è un rifiuto di stato', async (t) => {
  const b = await banco(t);
  const guasto = Object.assign(new Error('the workflow store needs attention'), { code: 'WORKFLOW_STORE_NEEDS_ATTENTION' });
  const runtime = { orchestrator: { requestRunControl: async () => { throw guasto; } }, scheduler: { sveglia() {} } };
  const onWorkflowFn = creaOnWorkflowFn({ store: b.store, runtimeFn: () => runtime });
  await assert.rejects(onWorkflowFn('workflow_control', { runId: b.runId, azione: 'pause' }, { rootSessionId: b.rootSessionId }), (errore) => {
    assert.equal(errore, guasto, 'lo stesso errore, non un testo di rifiuto inventato');
    return true;
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * ⭐ C3, tappa 1 (09/10/2026, «talos desktop») — LE AZIONI DELLA PERSONA SU UN PASSO FALLITO, come Hermes (decisione owner del
 *   07/10): Segna come fatto · Metti da parte · Rifai con un altro modello. Contratto `C3-CONTRATTO-WORKFLOW-E-DELEGHE-2026-10-07.md`
 *   §2-bis, ledger `LEDGER-C3-CICLO-DI-VITA-2026-10-09.md`. Un comando `resolve-node` per passo, durevole e idempotente come gli
 *   altri. Hermes: `complete_task` pretende un riassunto non vuoto (`kanban_db.py:2731`), `reassign_task` è «the "this profile's
 *   model is broken" path» (`:2602`).
 * ═══════════════════════════════════════════════════════════════════════════════════ */

/** Il run fino a «Serve attenzione» con `uno` fallito e `due` finito: `dopo` (che dipende da `uno`) resta fermo. */
async function finoAUnoFallito(b, p) {
  await finoAiDuePassi(b, p);
  b.giri.fallisci(b.giri.indice('Fai uno'), 'credenziale', 'Credenziale rifiutata dal fornitore.');
  b.giri.rispondi(b.giri.indice('Fai due'));
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'needs_attention'), 'the failed step asks for attention');
  // e lo scheduler ha finito di saldare «due» (posto e budget): misurato, `budget_settled due` arriva dopo l'attenzione
  assert.ok(await aspettaChe(async () => {
    const { stato } = await b.stato();
    return stato.nodes.get('due').state === 'succeeded' && [...stato.capacityClaims.values()].every((claim) => claim.state !== 'active')
      && stato.budget.reservations.size === 0;
  }), 'the scheduler has settled the other step');
}
const risolvi = async (p, input) => {
  const esito = await p.orchestrator.resolveFailedStep({ commandId: randomUUID(), ...input });
  p.scheduler.sveglia(input.runId);
  return esito;
};

test('C3-02 MARK-DONE: «Segna come fatto» on a failed step — its dependent starts and reads the person\'s summary; an empty summary is refused with no fact', async (t) => {
  const b = await banco(t);
  const p = b.componi();
  await finoAUnoFallito(b, p);
  const prima = (await b.stato()).eventi.length;
  for (const summary of ['', '   \n\t ']) {
    await assert.rejects(p.orchestrator.resolveFailedStep({ runId: b.runId, nodeId: 'uno', action: 'mark-done', summary, commandId: randomUUID() }),
      { code: 'QUERY_INVALID' }, `summary ${JSON.stringify(summary)}: like Hermes, a completion needs evidence`);
  }
  await assert.rejects(p.orchestrator.resolveFailedStep({ runId: b.runId, nodeId: 'due', action: 'mark-done', summary: 'x', commandId: randomUUID() }),
    { code: 'WORKFLOW_RUN_STATE_CONFLICT' }, 'only a failed step can be marked done');
  // C3 tappa 2b: «Riprendi verificando» non vale per un passo FALLITO (non c'è un effetto incerto da verificare)
  await assert.rejects(p.orchestrator.resolveFailedStep({ runId: b.runId, nodeId: 'uno', action: 'resume-verify', commandId: randomUUID() }),
    (errore) => errore.code === 'WORKFLOW_RUN_STATE_CONFLICT' && /nothing to verify/u.test(errore.message), 'a failed step has nothing to verify');
  assert.equal((await b.stato()).eventi.length, prima, 'a refused command writes nothing');

  const id = randomUUID();
  const RIASSUNTO = 'Done by hand: the report is in docs/report.md.';
  const esito = await risolvi(p, { runId: b.runId, nodeId: 'uno', action: 'mark-done', summary: RIASSUNTO, commandId: id });
  assert.equal(esito.deduplicated, false);
  let { eventi, stato } = await b.stato();
  const fatto = eventi.find((evento) => evento.type === 'node_succeeded' && evento.nodeId === 'uno');
  assert.deepEqual([fatto.payload.by, fatto.payload.summary, fatto.commandType], ['person', RIASSUNTO, 'resolve-node'], 'the fact is the receipt');
  const risultato = eventi.find((evento) => evento.type === 'result_recorded' && evento.nodeId === 'uno');
  assert.ok(risultato && eventi.indexOf(risultato) < eventi.indexOf(fatto), 'the summary is recorded as the step result first');
  assert.deepEqual([risultato.payload.resultRef.kind, risultato.payload.resultRef.trust, risultato.payload.resultRef.provenance.model],
    ['text', 'validated', null], 'a person\'s result: text, vouched for, no model');
  assert.deepEqual(fatto.payload.resultIds, [risultato.payload.resultRef.id]);
  assert.equal(stato.nodes.get('uno').state, 'succeeded');
  assert.ok(eventi.findIndex((evento) => evento.type === 'run_resumed') > eventi.indexOf(fatto), 'then the run leaves «needs attention»');
  // il contratto del fatto: «by» è solo la persona, e il riassunto non è vuoto
  validateWorkflowEvent(fatto);
  assert.throws(() => validateWorkflowEvent({ ...fatto, payload: { ...fatto.payload, by: 'model' } }), { code: 'WORKFLOW_EVENT_INVALID' });
  assert.throws(() => validateWorkflowEvent({ ...fatto, payload: { ...fatto.payload, summary: '  ' } }), { code: 'WORKFLOW_EVENT_INVALID' });

  assert.ok(await aspettaChe(() => b.giri.indice('Dopo uno') >= 0), 'the dependent starts');
  assert.match(b.giri.giro(b.giri.indice('Dopo uno')).consegna, /Done by hand: the report is in docs\/report\.md\./, 'and reads the summary as the result of the step it depends on');
  assert.equal((await p.orchestrator.resolveFailedStep({ runId: b.runId, nodeId: 'uno', action: 'mark-done', summary: RIASSUNTO, commandId: id })).deduplicated, true);
  await assert.rejects(p.orchestrator.resolveFailedStep({ runId: b.runId, nodeId: 'uno', action: 'mark-done', summary: 'another summary', commandId: id }),
    { code: 'WORKFLOW_COMMAND_CONFLICT' }, 'the same id with another content');
  b.giri.rispondi(b.giri.indice('Dopo uno'));
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'succeeded'));
  ({ stato } = await b.stato());
  assert.equal(stato.nodes.get('uno').attempt, 1, '«uno» never ran again');
  assert.deepEqual(p.errori, []);
});

test('C3-03 SET-ASIDE: «Metti da parte» — the step that waited for it never starts, and the run ends «done, with steps set aside»', async (t) => {
  const b = await banco(t);
  const p = b.componi();
  await finoAUnoFallito(b, p);
  const quanti = b.giri.quanti;
  const id = randomUUID();
  await risolvi(p, { runId: b.runId, nodeId: 'uno', action: 'set-aside', commandId: id });
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'succeeded_with_set_aside'), 'the run ends');
  await calma();
  const { eventi, stato } = await b.stato();
  assert.equal(b.giri.quanti, quanti, 'nothing started: «dopo» waited for the step set aside');
  assert.deepEqual([stato.nodes.get('uno').state, stato.nodes.get('dopo').state, stato.nodes.get('dopo').terminalReason],
    ['set_aside', 'skipped', 'dependency_set_aside']);
  const fatto = eventi.find((evento) => evento.type === 'node_set_aside');
  assert.deepEqual([fatto.nodeId, fatto.commandId, fatto.commandType, fatto.payload.reason], ['uno', id, 'resolve-node', 'user']);
  const fine = eventi.at(-1);
  assert.equal(fine.type, 'run_succeeded_with_set_aside');
  assert.deepEqual([fine.payload.setAsideNodeIds, fine.payload.skippedNodeIds], [['uno'], ['dopo']], 'the summary names both');
  assert.ok(fine.payload.finalResultIds.length > 0, 'the results of the steps that succeeded stay');
  validateWorkflowEvent(fatto);
  validateWorkflowEvent(fine);
  const saltato = eventi.find((evento) => evento.type === 'node_skipped');
  assert.equal(saltato.payload.reason, 'dependency_set_aside');
  assert.deepEqual(p.errori, []);
});

test('C3-04 OTHER-MODEL: «Rifai con un altro modello» — a new session for that step only, on the chosen model, written in the fact', async (t) => {
  const b = await banco(t);
  const p = b.componi();
  await finoAUnoFallito(b, p);
  const ALTRO = 'openai/gpt-5-nano';
  await assert.rejects(p.orchestrator.resolveFailedStep({ runId: b.runId, nodeId: 'uno', action: 'retry-other-model', model: '', commandId: randomUUID() }),
    { code: 'QUERY_INVALID' }, 'a model is required');
  const id = randomUUID();
  await risolvi(p, { runId: b.runId, nodeId: 'uno', action: 'retry-other-model', model: ALTRO, commandId: id });
  let { eventi } = await b.stato();
  const fatto = eventi.find((evento) => evento.type === 'retry_scheduled' && evento.nodeId === 'uno');
  assert.deepEqual([fatto.commandType, fatto.payload.schema, fatto.payload.reasonClass, fatto.payload.resume],
    ['resolve-node', 'talos.workflow-retry-fact.v2', 'user_retry', { mode: 'fresh', modelPolicy: { mode: 'explicit', model: ALTRO, reasoning: null } }]);
  validateWorkflowEvent(fatto);
  assert.ok(await aspettaChe(() => b.giri.quanti === 5), 'the failed step runs again');
  // il fatto della sessione arriva DOPO l'avvio del giro (`agent-session.mjs`: avvia, poi `agent_session_created`)
  const sessioniDiUno = (lista) => lista.filter((evento) => evento.type === 'agent_session_created' && evento.nodeId === 'uno');
  assert.ok(await aspettaChe(async () => sessioniDiUno((await b.stato()).eventi).length === 2), 'the new session is in the journal');
  ({ eventi } = await b.stato());
  const sessioni = sessioniDiUno(eventi);
  assert.deepEqual(sessioni.map((evento) => evento.payload.model), [CLOUD, ALTRO], 'a new session, on the chosen model');
  assert.notEqual(sessioni[0].payload.sessionId, sessioni[1].payload.sessionId);
  b.giri.rispondi(4);
  assert.ok(await aspettaChe(() => b.giri.indice('Dopo uno') >= 0), 'then the step that waited for it');
  const dopo = eventi.filter((evento) => evento.type === 'agent_session_created' && evento.nodeId === 'dopo');
  assert.equal(dopo.length, 0);
  b.giri.rispondi(b.giri.indice('Dopo uno'));
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'succeeded'));
  ({ eventi } = await b.stato());
  assert.equal(eventi.find((evento) => evento.type === 'agent_session_created' && evento.nodeId === 'dopo').payload.model, CLOUD,
    'the other steps keep their model');
  assert.deepEqual(p.errori, []);
});

test('C3-05 REDUCER-GUARDS: the reducer itself refuses a person\'s «done» or «set aside» on a step that has not failed', async (t) => {
  const b = await banco(t);
  const p = b.componi();
  await finoAUnoFallito(b, p);
  const { eventi, stato } = await b.stato();
  const ultimo = eventi.at(-1);
  const fatto = (type, nodeId, payload) => ({ ...ultimo, eventId: randomUUID(), seq: ultimo.seq + 1, type, nodeId, payload,
    commandId: randomUUID(), commandType: 'resolve-node', commandPayloadHash: `sha256:${'0'.repeat(64)}`, causationId: null,
    activityExecutionId: null, attempt: null, leaseId: null, leaseEpoch: null });
  // «dopo» aspetta ancora (pending/blocked), «due» è finito: nessuno dei due è fallito
  for (const [type, nodeId, payload] of [
    ['node_set_aside', 'dopo', { reason: 'user' }],
    ['node_set_aside', 'due', { reason: 'user' }],
    ['node_succeeded', 'dopo', { resultIds: [randomUUID()], by: 'person', summary: 'done by hand' }],
  ]) {
    const evento = fatto(type, nodeId, payload);
    validateWorkflowEvent(evento);
    assert.throws(() => workflowApply(stato, evento), { code: 'WORKFLOW_TRANSITION_INVALID' }, `${type} on «${nodeId}» (${stato.nodes.get(nodeId).state})`);
  }
  // e sul passo fallito lo stesso fatto passa: la guardia rifiuta il caso sbagliato, non tutto
  assert.equal(workflowApply(stato, fatto('node_set_aside', 'uno', { reason: 'user' })).nodes.get('uno').state, 'set_aside');
});

test('C3-06 SKIPPED-AFTER-SET-ASIDE: a step skipped because it waited for a step set aside does not free the steps under it', () => {
  // a → b → c: «a» messo da parte, «b» saltato per colpa sua. «c» NON deve diventare pronto (indici), mentre un «b» saltato per
  // una condizione falsa lo libera come sempre.
  const definition = { nodes: ['a', 'b', 'c'].map((id) => ({ id, priority: 0 })), edges: [{ from: 'a', to: 'b', type: 'data' }, { from: 'b', to: 'c', type: 'data' }] };
  const nodi = (b) => new Map([['a', { nodeId: 'a', state: 'set_aside', terminalReason: 'user' }], ['b', { nodeId: 'b', ...b }], ['c', { nodeId: 'c', state: 'pending' }]]);
  assert.equal(buildWorkflowIndexes(definition, { nodes: nodi({ state: 'skipped', terminalReason: 'dependency_set_aside' }) }).remainingDeps.get('c'), 1,
    'c still waits');
  assert.equal(buildWorkflowIndexes(definition, { nodes: nodi({ state: 'skipped', terminalReason: 'condition_false' }) }).remainingDeps.get('c'), 0,
    'an ordinary skip frees it, as before');
  assert.equal(buildWorkflowIndexes(definition, { nodes: nodi({ state: 'pending' }) }).remainingDeps.get('b'), 1, 'set aside never satisfies');
});

/*
 * C3 — review avversaria 09/10: «Metti da parte» interrotto DOPO il fatto decisivo (`node_set_aside`, che è la ricevuta) e PRIMA dei
 *   salti. Prima della cura la ripetizione rispondeva «già fatto» e «dopo» restava fermo per sempre. Il fatto si scrive a mano, come
 *   l'avrebbe lasciato un processo caduto; poi le due uscite: lo stesso comando ripetuto, e il riavvio senza nessun comando.
 */
async function messoDaParteAMeta(b, p) {
  await finoAUnoFallito(b, p);
  p.scheduler.ferma();
  const { eventi } = await b.stato();
  const ultimo = eventi.at(-1);
  const commandId = randomUUID();
  const commandPayloadHash = resolveNodeCommandHash({ workflowId: b.workflowId, version: 1, runId: b.runId, nodeId: 'uno', action: 'set-aside' });
  await appendEvent(b.store, { event: { ...ultimo, eventId: randomUUID(), seq: ultimo.seq + 1, at: new Date(Date.now() + 60_000).toISOString(),
    type: 'node_set_aside', nodeId: 'uno', payload: { reason: 'user' }, commandId, commandType: 'resolve-node', commandPayloadHash,
    causationId: null, activityExecutionId: null, attempt: null, leaseId: null, leaseEpoch: null } });
  const { stato } = await b.stato();
  assert.deepEqual([stato.nodes.get('uno').state, stato.nodes.get('dopo').state === 'skipped'], ['set_aside', false], 'interrupted before the skips');
  return commandId;
}

test('C3-07 SET-ASIDE-RESUMES (repeat): the same command repeated finishes what an interruption left half done', async (t) => {
  const b = await banco(t);
  const p = b.componi();
  const commandId = await messoDaParteAMeta(b, p);
  // lo STESSO orchestratore, già pronto: nessun recupero d'avvio può fare il lavoro al posto della ripetizione
  const esito = await p.orchestrator.resolveFailedStep({ runId: b.runId, nodeId: 'uno', action: 'set-aside', commandId });
  assert.equal(esito.deduplicated, true);
  const { stato, eventi } = await b.stato();
  assert.deepEqual([stato.nodes.get('dopo').state, stato.nodes.get('dopo').terminalReason], ['skipped', 'dependency_set_aside'], 'the repeat skipped it');
  assert.ok(eventi.some((evento) => evento.type === 'run_resumed'), 'and the run left «needs attention»');
  assert.equal(esito.status, 'running');
});

test('C3-08 SET-ASIDE-RESUMES (restart): the startup recovery finishes an interrupted «set aside» with no command at all', async (t) => {
  const b = await banco(t);
  const p = b.componi();
  await messoDaParteAMeta(b, p);
  const dopo = await b.riavvia();
  await dopo.orchestrator.recover();
  const { stato, eventi } = await b.stato();
  assert.deepEqual([stato.nodes.get('dopo').state, stato.nodes.get('dopo').terminalReason], ['skipped', 'dependency_set_aside'], 'skipped by the recovery');
  assert.ok(eventi.some((evento) => evento.type === 'run_resumed'), 'and the run left «needs attention»');
  await dopo.scheduler.avvia();
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'succeeded_with_set_aside'), 'the run ends');
  assert.deepEqual(dopo.errori, []);
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * ⭐ C3, tappa 2a (09/10/2026) — il passo INCERTO deciso dalla persona (contratto §2-bis punto 1, decisioni owner 09/10: budget
 *   RILASCIATO «consumo sconosciuto»). Il passo «uno» finisce incerto e il sistema non riesce a riconciliarlo (sessione ancora
 *   viva): il run chiede attenzione. La persona sceglie una delle tre azioni; prima la sessione si ferma, poi `uncertain_resolved`
 *   (la ricevuta, con l'azione dentro), poi posto e riserva si rilasciano, poi l'azione.
 * ═══════════════════════════════════════════════════════════════════════════════════ */
function adattatoreConUnoIncerto(b) {
  const vero = createAgentSessionAdapter({ sessions: b.registro });
  const fermati = [];
  return {
    fermati,
    adattatori: new Map([['agent-session', {
      id: vero.id,
      async execute(ctx) {
        if (ctx.nodeId !== 'uno') return vero.execute(ctx);
        return { status: 'uncertain', reasonClass: 'receipt_missing', observedReceiptRef: null, actualUsage: null };
      },
      async reconcile(ctx) {
        if (ctx.nodeId !== 'uno') return vero.reconcile(ctx);
        return { outcome: 'still_unknown', receiptRef: null, resultIds: [], actualUsage: null };
      },
      async cancel(ctx) {
        if (ctx.nodeId !== 'uno') return vero.cancel(ctx);
        fermati.push(ctx.reason);
        return { outcome: 'cancelled', evidenceResultIds: [] };
      },
    }]]),
  };
}
async function finoAUnoIncerto(b, p) {
  await p.orchestrator.recover();
  await p.scheduler.avvia();
  assert.ok(await aspettaChe(() => b.giri.indice('Prepara') >= 0), 'prepara starts');
  b.giri.rispondi(b.giri.indice('Prepara'));
  assert.ok(await aspettaChe(() => b.giri.indice('Fai due') >= 0), 'due starts');
  b.giri.rispondi(b.giri.indice('Fai due'));
  assert.ok(await aspettaChe(async () => {
    const { stato } = await b.stato();
    return stato.run.status === 'needs_attention' && stato.run.needsAttentionReasons.some((motivo) => motivo.startsWith('activity_uncertain:'))
      && stato.nodes.get('due').state === 'succeeded';
  }), 'the uncertain step asks for a decision');
  // e lo scheduler ha finito di saldare «due»: il giornale resta fermo per due letture di fila (misurato: il saldo arriva dopo)
  let quanti = -1;
  assert.ok(await aspettaChe(async () => {
    const adesso = (await b.stato()).eventi.length;
    const fermo = adesso === quanti;
    quanti = adesso;
    if (!fermo) await calma();
    return fermo;
  }), 'the journal is quiet');
  const { stato } = await b.stato();
  assert.equal(stato.nodes.get('uno').state, 'uncertain');
}

test('C3-10 UNCERTAIN-MARK-DONE: the session stops, the decision is the receipt, the slot is released WITHOUT a settlement, the step is done', async (t) => {
  const b = await banco(t);
  const finto = adattatoreConUnoIncerto(b);
  const p = b.componi({ adattatori: finto.adattatori });
  await finoAUnoIncerto(b, p);
  const id = randomUUID();
  const RIASSUNTO = 'Checked by hand: the change is already in place.';
  const esito = await risolvi(p, { runId: b.runId, nodeId: 'uno', action: 'mark-done', summary: RIASSUNTO, commandId: id });
  assert.equal(esito.deduplicated, false);
  assert.deepEqual(finto.fermati, ['person_resolved'], 'the live session of the attempt was stopped first');
  const { eventi, stato } = await b.stato();
  const decisione = eventi.find((evento) => evento.type === 'uncertain_resolved');
  assert.deepEqual([decisione.commandId, decisione.commandType, decisione.payload], [id, 'resolve-node', { reason: 'user', action: 'mark-done', summary: RIASSUNTO }]);
  validateWorkflowEvent(decisione);
  assert.throws(() => validateWorkflowEvent({ ...decisione, commandId: null, commandType: null, commandPayloadHash: null }),
    { code: 'WORKFLOW_EVENT_INVALID' }, 'a decision without the person\'s command is not a decision');
  assert.throws(() => validateWorkflowEvent({ ...decisione, payload: { reason: 'user', action: 'mark-done' } }),
    { code: 'WORKFLOW_EVENT_INVALID' }, 'mark-done without its summary');
  const ordine = ['uncertain_resolved', 'capacity_released', 'budget_released', 'result_recorded', 'node_succeeded']
    .map((tipo) => eventi.findIndex((evento) => evento.type === tipo && evento.nodeId === 'uno'));
  assert.ok(ordine.every((i, k) => i >= 0 && (k === 0 || i > ordine[k - 1])), `decision, release, budget, result, done — in this order (${ordine})`);
  assert.equal(eventi.find((evento) => evento.type === 'budget_released' && evento.nodeId === 'uno').payload.reason, 'person_resolved');
  assert.equal(eventi.some((evento) => evento.type === 'budget_settled' && evento.nodeId === 'uno'), false, 'no settlement: the usage is unknown');
  assert.equal(stato.audit.unknownUsageAttempts, 1, 'one attempt with unknown usage, counted');
  assert.equal(stato.nodes.get('uno').state, 'succeeded');
  assert.equal(stato.run.status, 'running', 'the run left «needs attention»');
  assert.ok(await aspettaChe(() => b.giri.indice('Dopo uno') >= 0), 'the step that waited for it starts');
  assert.match(b.giri.giro(b.giri.indice('Dopo uno')).consegna, /Checked by hand: the change is already in place\./u);
  assert.equal((await p.orchestrator.resolveFailedStep({ runId: b.runId, nodeId: 'uno', action: 'mark-done', summary: RIASSUNTO, commandId: id })).deduplicated, true);
  b.giri.rispondi(b.giri.indice('Dopo uno'));
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'succeeded'));
  assert.deepEqual(p.errori, []);
});

test('C3-11 UNCERTAIN-SET-ASIDE: the same decision path, then «set aside» of stage 1; a step neither failed nor undecided is refused', async (t) => {
  const b = await banco(t);
  const finto = adattatoreConUnoIncerto(b);
  const p = b.componi({ adattatori: finto.adattatori });
  await finoAUnoIncerto(b, p);
  const prima = (await b.stato()).eventi.length;
  await assert.rejects(p.orchestrator.resolveFailedStep({ runId: b.runId, nodeId: 'due', action: 'set-aside', commandId: randomUUID() }),
    { code: 'WORKFLOW_RUN_STATE_CONFLICT' });
  assert.equal((await b.stato()).eventi.length, prima, 'a refusal writes nothing');
  await risolvi(p, { runId: b.runId, nodeId: 'uno', action: 'set-aside', commandId: randomUUID() });
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'succeeded_with_set_aside'), 'the run ends with the step set aside');
  const { stato } = await b.stato();
  assert.deepEqual([stato.nodes.get('uno').state, stato.nodes.get('dopo').terminalReason], ['set_aside', 'dependency_set_aside']);
  assert.deepEqual(p.errori, []);
});

test('C3-12 UNCERTAIN-INTERRUPTED: a decision written before a restart is completed with no command (release, then the action)', async (t) => {
  const b = await banco(t);
  const finto = adattatoreConUnoIncerto(b);
  const p = b.componi({ adattatori: finto.adattatori });
  await finoAUnoIncerto(b, p);
  p.scheduler.ferma();
  // la decisione durevole, come l'avrebbe lasciata un processo caduto subito dopo: posto e riserva ancora aperti, azione non compiuta
  const { eventi, stato } = await b.stato();
  const ultimo = eventi.at(-1);
  const attivita = stato.activities.get(stato.nodes.get('uno').activeActivityExecutionId);
  const commandPayloadHash = resolveNodeCommandHash({ workflowId: b.workflowId, version: 1, runId: b.runId, nodeId: 'uno', action: 'retry-other-model', model: 'openai/gpt-5-nano' });
  await appendEvent(b.store, { event: { ...ultimo, eventId: randomUUID(), seq: ultimo.seq + 1, at: new Date(Date.now() + 60_000).toISOString(),
    type: 'uncertain_resolved', nodeId: 'uno', activityExecutionId: attivita.activityExecutionId, attempt: attivita.attempt,
    leaseId: attivita.leaseId, leaseEpoch: attivita.leaseEpoch, payload: { reason: 'user', action: 'retry-other-model', model: 'openai/gpt-5-nano' },
    commandId: randomUUID(), commandType: 'resolve-node', commandPayloadHash, causationId: null } });
  const dopo = await b.riavvia();
  await dopo.orchestrator.recover();
  await dopo.scheduler.avvia();
  assert.ok(await aspettaChe(() => dopo.giri.indice('Fai uno') >= 0), 'the step runs again, from the recorded decision');
  const fatti = (await b.stato()).eventi;
  assert.equal(fatti.find((evento) => evento.type === 'budget_released' && evento.nodeId === 'uno').payload.reason, 'person_resolved');
  assert.deepEqual(fatti.find((evento) => evento.type === 'retry_scheduled' && evento.nodeId === 'uno').payload.resume,
    { mode: 'fresh', modelPolicy: { mode: 'explicit', model: 'openai/gpt-5-nano', reasoning: null } });
  assert.ok(await aspettaChe(async () => (await b.stato()).eventi.some((evento) => evento.type === 'agent_session_created' && evento.nodeId === 'uno')));
  assert.equal((await b.stato()).eventi.find((evento) => evento.type === 'agent_session_created' && evento.nodeId === 'uno').payload.model, 'openai/gpt-5-nano');
  assert.deepEqual(dopo.errori, []);
});

/*
 * ⛔ Prima stesura (09/10) sbagliata, presa dalla suite intera: una riconciliazione APPESA tiene la coda delle operazioni del run
 *   (`reconcileActivity` gira lì dentro), quindi la chiamata della persona aspettava dietro di lei o passava avanti secondo chi
 *   arrivava prima — la prova misurava i tempi, non la regola. La finestra vera in cui un passo è incerto SENZA motivo d'attenzione
 *   è prima che lo scheduler lo riconcili: qui si apre fermando lo scheduler nel momento in cui il passo risponde «incerto».
 */
test('C3-13 UNCERTAIN-NOT-YET-RECONCILED: before the system has tried to reconcile an uncertain step, the person cannot decide it', async (t) => {
  const b = await banco(t);
  const finto = adattatoreConUnoIncerto(b);
  const adattatore = finto.adattatori.get('agent-session');
  const esegui = adattatore.execute;
  let p = null;
  adattatore.execute = async (ctx) => {
    if (ctx.nodeId === 'uno') p.scheduler.ferma(); // nessuno riconcilierà: il passo resta incerto, senza decisione chiesta
    return esegui(ctx);
  };
  p = b.componi({ adattatori: finto.adattatori });
  await p.orchestrator.recover();
  await p.scheduler.avvia();
  assert.ok(await aspettaChe(() => b.giri.indice('Prepara') >= 0));
  b.giri.rispondi(b.giri.indice('Prepara'));
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.nodes.get('uno').state === 'uncertain'), 'uno is uncertain');
  const { stato } = await b.stato();
  assert.equal(stato.run.needsAttentionReasons.some((motivo) => motivo.startsWith('activity_uncertain:')), false, 'no decision asked yet');
  await assert.rejects(p.orchestrator.resolveFailedStep({ runId: b.runId, nodeId: 'uno', action: 'set-aside', commandId: randomUUID() }),
    { code: 'WORKFLOW_RUN_STATE_CONFLICT' });
  assert.deepEqual(finto.fermati, [], 'its session was not stopped');
  assert.equal((await b.stato()).eventi.some((evento) => evento.type === 'uncertain_resolved'), false);
});

/*
 * Review del bugfixer sulla tappa 1 (09/10, YELLOW): Y1 — il run riparte solo se aspettava SOLO per passi falliti; Y2 — il riduttore
 *   rifiuta l'azione della persona finché l'ultimo tentativo tiene il suo posto. Le due guardie c'erano, le prove no (mutanti MD, MC).
 */
test('C3-14 OTHER-ATTENTION-STAYS (review Y1): with a second reason (budget) the action is done but the run keeps asking for attention', async (t) => {
  const b = await banco(t);
  const p = b.componi();
  await finoAUnoFallito(b, p);
  p.scheduler.ferma();
  const { eventi } = await b.stato();
  const ultimo = eventi.at(-1);
  const zero = { promptTokens: 0, completionTokens: 0, wallMs: 0, agentSeconds: 0, toolCalls: 0, modelRequests: 0, knownCostUsd: null };
  await appendEvent(b.store, { event: { ...ultimo, eventId: randomUUID(), seq: ultimo.seq + 1, at: new Date(Date.now() + 60_000).toISOString(),
    type: 'budget_overrun_observed', nodeId: null, payload: { reservationId: null, source: 'reconciliation', dimensions: ['promptTokens'], observed: { ...zero, promptTokens: 1 } },
    commandId: null, commandType: null, commandPayloadHash: null, causationId: null, activityExecutionId: null, attempt: null, leaseId: null, leaseEpoch: null } });
  assert.deepEqual((await b.stato()).stato.run.needsAttentionReasons, ['budget_overrun', 'node_failed']);
  await p.orchestrator.resolveFailedStep({ runId: b.runId, nodeId: 'uno', action: 'set-aside', commandId: randomUUID() });
  const { stato, eventi: dopo } = await b.stato();
  assert.equal(stato.nodes.get('uno').state, 'set_aside', 'the action is done');
  assert.equal(stato.run.status, 'needs_attention', 'the budget still waits for the person');
  assert.equal(dopo.some((evento) => evento.type === 'run_resumed'), false);
});

test('C3-15 LAST-ATTEMPT-RELEASED (review Y2): the reducer refuses the person\'s action while the last attempt still holds its slot', async (t) => {
  const b = await banco(t);
  const p = b.componi();
  await finoAUnoFallito(b, p);
  const { eventi } = await b.stato();
  const fallimento = eventi.findIndex((evento) => evento.type === 'node_failed' && evento.nodeId === 'uno');
  const rilascio = eventi.findIndex((evento, i) => i > fallimento && evento.type === 'capacity_released' && evento.nodeId === 'uno');
  assert.ok(fallimento >= 0 && rilascio > fallimento, `the slot is released after the failure (${fallimento}, ${rilascio})`);
  const definizione = await readDefinition(b.store, { workflowId: eventi[0].payload.workflowId, version: eventi[0].payload.definitionVersion });
  // lo stato FRA il fallimento e il rilascio del posto: il passo è fallito, il suo posto è ancora preso
  const fra = workflowReplay({ definition: definizione.core, runId: b.runId, events: eventi.slice(0, rilascio) });
  assert.equal(fra.nodes.get('uno').state, 'failed');
  const ultimo = eventi[rilascio - 1];
  const fatto = (type, payload) => ({ ...ultimo, eventId: randomUUID(), seq: ultimo.seq + 1, type, nodeId: 'uno', payload,
    commandId: randomUUID(), commandType: 'resolve-node', commandPayloadHash: `sha256:${'0'.repeat(64)}`, causationId: null,
    activityExecutionId: null, attempt: null, leaseId: null, leaseEpoch: null });
  if (fra.run.status === 'running' || fra.run.status === 'needs_attention') {
    assert.throws(() => workflowApply(fra, fatto('node_set_aside', { reason: 'user' })), /released/u, 'set aside waits for the slot');
    assert.throws(() => workflowApply(fra, fatto('node_succeeded', { resultIds: [randomUUID()], by: 'person', summary: 'done' })), /released/u, 'done waits for the slot');
  } else assert.fail(`unexpected run status ${fra.run.status}`);
});

/*
 * ⭐ C3 tappa 2b (09/10/2026, decisione owner 09/10 sera) — «Riprendi verificando»: il tentativo nuovo riprende la STESSA sessione del
 *   tentativo incerto con un MESSAGGIO NUOVO (la frase di verifica). Il primo tentativo di «uno» apre una sessione vera nel registro
 *   e risponde «incerto» mentre la sessione è ancora viva (il caso di `still_unknown`); i tentativi dopo li fa l'adattatore vero.
 */
function adattatoreConUnoIncertoVivo(b) {
  const vero = createAgentSessionAdapter({ sessions: b.registro });
  const fermati = [];
  return {
    fermati,
    adattatori: new Map([['agent-session', {
      id: vero.id,
      async execute(ctx) {
        if (ctx.nodeId !== 'uno' || ctx.attempt > 1) return vero.execute(ctx);
        const legame = { runId: ctx.runId, nodeId: ctx.nodeId, activityExecutionId: ctx.activityExecutionId, attempt: ctx.attempt,
          leaseId: ctx.leaseId, leaseEpoch: ctx.leaseEpoch };
        const avvio = b.registro.avviaSessioneDiPasso({ legame, rootSessionId: ctx.run.rootSessionId, consegna: 'Fai uno.', titolo: 'Uno' });
        assert.ok(avvio.sessionId, 'the first attempt opened a real session');
        return { status: 'uncertain', reasonClass: 'receipt_missing', observedReceiptRef: null, actualUsage: null };
      },
      async reconcile(ctx) {
        if (ctx.nodeId !== 'uno' || ctx.attempt > 1) return vero.reconcile(ctx);
        return { outcome: 'still_unknown', receiptRef: null, resultIds: [], actualUsage: null };
      },
      async cancel(ctx) {
        if (ctx.nodeId === 'uno') fermati.push(ctx.reason);
        return vero.cancel(ctx);
      },
    }]]),
  };
}

test('C3-16 RESUME-VERIFY: the new attempt resumes the SAME session with the verification message, then the step and its dependent go on', async (t) => {
  const b = await banco(t);
  const finto = adattatoreConUnoIncertoVivo(b);
  const p = b.componi({ adattatori: finto.adattatori });
  await finoAUnoIncerto(b, p);
  const giroPrimo = b.giri.indice('Fai uno');
  assert.ok(giroPrimo >= 0 && !b.giri.giro(giroPrimo).chiuso, 'the session of the uncertain attempt is still alive');
  b.giri.consuma(giroPrimo, { prompt_tokens: 1_000, completion_tokens: 1 }); // il tentativo incerto ha consumato: non va contato nel nuovo
  // un passo FALLITO non ha niente da verificare
  await assert.rejects(p.orchestrator.resolveFailedStep({ runId: b.runId, nodeId: 'due', action: 'resume-verify', commandId: randomUUID() }),
    { code: 'WORKFLOW_RUN_STATE_CONFLICT' });
  await risolvi(p, { runId: b.runId, nodeId: 'uno', action: 'resume-verify', commandId: randomUUID() });
  assert.deepEqual(finto.fermati, ['person_resolved'], 'its session was stopped first');
  assert.equal(b.giri.giro(giroPrimo).fermato, true, 'and the live turn really stopped');
  assert.ok(await aspettaChe(() => b.giri.indice('A previous attempt at this step') >= 0), 'the verification message starts a turn');
  const giroVerifica = b.giri.indice('A previous attempt at this step');
  const { eventi } = await b.stato();
  const fatto = eventi.find((evento) => evento.type === 'retry_scheduled' && evento.nodeId === 'uno');
  assert.deepEqual(fatto.payload.resume, { mode: 'verify', modelPolicy: null });
  validateWorkflowEvent(fatto);
  assert.throws(() => validateWorkflowEvent({ ...fatto, payload: { ...fatto.payload,
    resume: { mode: 'verify', modelPolicy: { mode: 'explicit', model: 'openai/gpt-5-nano', reasoning: null } } } }),
  { code: 'WORKFLOW_EVENT_INVALID' }, 'a verify resume keeps the step model: it carries none');
  assert.ok(await aspettaChe(async () => (await b.stato()).eventi.filter((evento) => evento.type === 'agent_session_created' && evento.nodeId === 'uno').length === 1));
  const sessioneDelPrimo = b.registro.trovaSessioneDiPasso({ activityExecutionId: (await b.stato()).stato.nodes.get('uno').activeActivityExecutionId });
  const creata = (await b.stato()).eventi.find((evento) => evento.type === 'agent_session_created' && evento.nodeId === 'uno');
  assert.equal(creata.payload.sessionId, sessioneDelPrimo, 'the SAME session, now bound to the new attempt');
  assert.deepEqual(b.giri.giro(giroVerifica).input.task?.seguito, true, 'a follow-up message in that session, not a new session');
  b.giri.rispondi(giroVerifica, 'Checked: the change was already there.');
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.nodes.get('uno').state === 'succeeded'), 'the step ends');
  const completato = (await b.stato()).eventi.find((evento) => evento.type === 'activity_completed' && evento.nodeId === 'uno');
  assert.equal(completato.payload.actualUsage.promptTokens, 10, 'the resumed attempt counts only its own turn (not the 1,000 of the uncertain one)');
  assert.ok(await aspettaChe(() => b.giri.indice('Dopo uno') >= 0), 'its dependent starts');
  assert.match(b.giri.giro(b.giri.indice('Dopo uno')).consegna, /Checked: the change was already there\./u, 'and reads the verified answer');
  assert.deepEqual(p.errori, []);
});

/*
 * ⛔ Y-2b-1 (review del bugfixer, 09/10/2026, riprodotto con un kernel finto che chiude il giro fermato 400 ms DOPO l'errore):
 *   la ripresa cadeva nella finestra di chiusura (`closing-turn-history-pending`), il passo finiva `failed internal` senza
 *   verificare e la sessione restava legata a un tentativo che lì non aveva mai girato. C3-16 passava solo perché il giro finto si
 *   chiudeva nell'istante dell'errore.
 */
test('C3-19 RESUME-VERIFY-CLOSING (review Y-2b-1): the stopped turn settles late — the resume waits for it, verifies in the same session, and the step goes on', async (t) => {
  const b = await banco(t, { ritardoChiusuraMs: 400 });
  const finto = adattatoreConUnoIncertoVivo(b);
  const p = b.componi({ adattatori: finto.adattatori });
  await finoAUnoIncerto(b, p);
  const primo = (await b.stato()).stato.nodes.get('uno').activeActivityExecutionId;
  const sessione = b.registro.trovaSessioneDiPasso({ activityExecutionId: primo });
  await risolvi(p, { runId: b.runId, nodeId: 'uno', action: 'resume-verify', commandId: randomUUID() });
  assert.ok(await aspettaChe(() => b.giri.indice('A previous attempt at this step') >= 0), 'the verification turn starts, after the late settle');
  const giroVerifica = b.giri.indice('A previous attempt at this step');
  assert.deepEqual(b.giri.giro(giroVerifica).input.task?.seguito, true, 'in the SAME session, not a new one');
  const nuovo = (await b.stato()).stato.nodes.get('uno').activeActivityExecutionId;
  assert.notEqual(nuovo, primo);
  assert.equal(b.registro.trovaSessioneDiPasso({ activityExecutionId: nuovo }), sessione, 'the session is now bound to the resumed attempt');
  b.giri.rispondi(giroVerifica, 'Checked: done already.');
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.nodes.get('uno').state === 'succeeded'), 'the step ends through the verification');
  const { eventi } = await b.stato();
  assert.equal(eventi.some((evento) => evento.type === 'activity_failed' && evento.nodeId === 'uno'), false, 'never a failure for «not now»');
  assert.deepEqual(p.errori, []);
});

/* Y-2b-1, la finestra di un crollo: il legame nuovo è sul disco ma la ripresa non è partita. Il tentativo nuovo non deve
   prendere come suoi l'esito e il consumo del giro di prima: lì non ha fatto niente (interrotto, consumo zero). */
test('C3-20 LINK-WITHOUT-TURN (review Y-2b-1): after a new step link with no turn behind it, the outcome is «interrupted» with nothing spent', async (t) => {
  const b = await banco(t);
  const p = b.componi();
  await finoAUnoFallito(b, p);
  const vecchio = [...(await b.stato()).stato.activities.values()].find((activity) => activity.nodeId === 'uno');
  const sessionId = b.registro.trovaSessioneDiPasso({ activityExecutionId: vecchio.activityExecutionId });
  const prima = await b.registro.leggiEsitoSessioneDiPasso({ sessionId });
  assert.deepEqual([prima.esito, prima.consumo.promptTokens], ['failed', 10], 'premise: the old turn failed and spent');
  const nuovo = { runId: b.runId, nodeId: 'uno', activityExecutionId: randomUUID(), attempt: vecchio.attempt + 1, leaseId: randomUUID(), leaseEpoch: 0 };
  await registraRiga({ cartellaStore: b.cartellaStore, sessionId, record: { tipo: 'legame-passo', workflow: nuovo } });
  const dopo = await b.registro.leggiEsitoSessioneDiPasso({ sessionId });
  assert.equal(dopo.legame.activityExecutionId, nuovo.activityExecutionId, 'the file now names the new attempt');
  assert.deepEqual([dopo.esito, dopo.consumo.promptTokens, dopo.consumo.modelRequests], ['interrupted', 0, 0], 'and the new attempt did nothing here');
});

/* C3-21 — scritta dal bugfixer nella review di 73afa7ec3 (09/10/2026), portata qui così com'era: `resume` rifiuta DOPO l'attesa
   (una scrittura delle impostazioni dei comandi aperta proprio quando parte il legame, `settings-being-saved`). La sessione di
   prima resta del primo tentativo e la verifica parte in una sessione nuova. Uccide «legame non rimesso dopo il rifiuto». */
test('C3-21 RESUME-REFUSED-AFTER-WAIT: resume refuses (command settings being saved) — the old session keeps its attempt, the check runs in a new session', async (t) => {
  let registroVivo = null;
  let colpito = false;
  const spiaRiga = (argomenti, scrivi) => {
    if (argomenti?.record?.tipo === 'impostazioni-comandi') return new Promise((ok) => setTimeout(ok, 300)).then(() => scrivi(argomenti));
    if (argomenti?.record?.tipo === 'legame-passo' && !colpito) { colpito = true; registroVivo.comandiNellaConversazione(argomenti.sessionId, true); }
    return scrivi(argomenti);
  };
  const b = await banco(t, { spiaRiga });
  registroVivo = b.registro;
  const finto = adattatoreConUnoIncertoVivo(b);
  const p = b.componi({ adattatori: finto.adattatori });
  await finoAUnoIncerto(b, p);
  const primo = (await b.stato()).stato.nodes.get('uno').activeActivityExecutionId;
  const sessione = b.registro.trovaSessioneDiPasso({ activityExecutionId: primo });
  await risolvi(p, { runId: b.runId, nodeId: 'uno', action: 'resume-verify', commandId: randomUUID() });
  assert.ok(await aspettaChe(() => b.giri.indice('A previous attempt at this step') >= 0), 'the verification turn starts anyway');
  assert.equal(colpito, true, 'premise: the settings write was in flight when the link was written');
  const giroVerifica = b.giri.indice('A previous attempt at this step');
  assert.notEqual(b.giri.giro(giroVerifica).input.task?.seguito, true, 'a NEW session (the old one refused)');
  const nuovo = (await b.stato()).stato.nodes.get('uno').activeActivityExecutionId;
  assert.equal(b.registro.trovaSessioneDiPasso({ activityExecutionId: primo }), sessione, 'the old session is still bound to its own attempt');
  assert.notEqual(b.registro.trovaSessioneDiPasso({ activityExecutionId: nuovo }), sessione, 'and the new attempt is not bound to it');
  b.giri.rispondi(giroVerifica, 'Checked.');
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.nodes.get('uno').state === 'succeeded'));
  assert.deepEqual(p.errori, []);
});

/*
 * ⭐ C3 tappa 3 (09/10/2026, owner «quanto serve per finire») — «Alza il tetto e riprendi». Il tetto del run del banco è quello
 *   della bozza compilata (4 passi × 2 tentativi × 400.000 token = 3.200.000); `uno` ne spende 2.900.000 contro i 400.000 riservati:
 *   uno sforamento, e il run chiede attenzione con `dopo` ancora da fare.
 */
const SFORAMENTO = 2_900_000;
async function finoAlloSforamento(b, p) {
  await finoAiDuePassi(b, p);
  b.giri.rispondi(b.giri.indice('Fai due'));
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.nodes.get('due').state === 'succeeded'));
  const uno = b.giri.indice('Fai uno');
  b.giri.consuma(uno, { prompt_tokens: SFORAMENTO, completion_tokens: 0 });
  b.giri.rispondi(uno);
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'needs_attention'), 'the overrun asks for attention');
}
const alzaIlTetto = async (p, runId, amount, commandId = randomUUID()) => {
  const esito = await p.orchestrator.raiseCeiling({ runId, commandId, amount });
  p.scheduler.sveglia(runId);
  return esito;
};

test('C3-17 RAISE-CEILING: an overrun asks for attention; the preview says what the rest needs, the raise is exactly that, and the run goes on', async (t) => {
  const b = await banco(t);
  const p = b.componi();
  await finoAlloSforamento(b, p);
  let { eventi, stato } = await b.stato();
  assert.deepEqual(stato.run.needsAttentionReasons, ['budget_overrun']);
  assert.equal(stato.nodes.get('dopo').state, 'ready', 'the step that waited for «uno» is ready, and does not start');
  assert.equal(b.giri.quanti, 4);

  const anteprima = await p.orchestrator.ceilingPreview({ runId: b.runId });
  const tetto = stato.definition.budgets.promptTokens;
  const passoDopo = stato.definition.nodes.find((node) => node.id === 'dopo');
  assert.equal(anteprima.waiting, true);
  assert.deepEqual(anteprima.nodeIds, ['dopo'], 'one reserve for each step still to do');
  assert.equal(anteprima.amount.promptTokens, stato.budget.spent.promptTokens + passoDopo.budget.promptTokens - tetto,
    'spent + what is left − the ceiling of now');
  assert.ok(anteprima.amount.promptTokens > 0);
  assert.equal(anteprima.amount.completionTokens, 0, 'a dimension that still fits does not rise');

  // una cifra che non è quella detta si rifiuta, e non scrive niente
  const prima = eventi.length;
  await assert.rejects(() => alzaIlTetto(p, b.runId, { ...anteprima.amount, promptTokens: anteprima.amount.promptTokens + 1 }),
    (errore) => errore.code === 'WORKFLOW_RUN_STATE_CONFLICT' && errore.ceilingRaise.promptTokens === anteprima.amount.promptTokens);
  assert.equal((await b.stato()).eventi.length, prima, 'no fact for a refused raise');

  const comando = randomUUID();
  const esito = await alzaIlTetto(p, b.runId, anteprima.amount, comando);
  assert.equal(esito.deduplicated, false);
  ({ eventi, stato } = await b.stato());
  const fatto = eventi.find((evento) => evento.type === 'budget_ceiling_raised');
  assert.deepEqual([fatto.commandId, fatto.commandType, fatto.nodeId], [comando, 'raise-ceiling', null], 'the fact is the receipt');
  assert.deepEqual(fatto.payload, { reason: 'user', amount: anteprima.amount });
  assert.ok(eventi.findIndex((evento) => evento.type === 'run_resumed') > eventi.indexOf(fatto), 'then the run goes on by itself');
  assert.equal(stato.budget.ceilingRaise.promptTokens, anteprima.amount.promptTokens, 'raised by exactly what was said');
  assert.equal((await alzaIlTetto(p, b.runId, anteprima.amount, comando)).deduplicated, true, 'the same command is a repeat');
  await assert.rejects(() => alzaIlTetto(p, b.runId, { ...anteprima.amount, toolCalls: 1 }, comando), { code: 'WORKFLOW_COMMAND_CONFLICT' });

  assert.ok(await aspettaChe(() => b.giri.indice('Dopo uno') >= 0), 'the step left over starts');
  b.giri.rispondi(b.giri.indice('Dopo uno'));
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'succeeded'));

  // il contratto: il fatto vuole il comando della persona, e il riduttore lo vuole su un run in attenzione per il budget
  validateWorkflowEvent(fatto);
  assert.throws(() => validateWorkflowEvent({ ...fatto, commandId: null, commandType: null, commandPayloadHash: null }), { code: 'WORKFLOW_EVENT_INVALID' });
  assert.throws(() => validateWorkflowEvent({ ...fatto, payload: { ...fatto.payload, amount: { ...fatto.payload.amount, knownCostUsd: null } } }), { code: 'WORKFLOW_EVENT_INVALID' });
  const ripresa = eventi.findIndex((evento) => evento.type === 'run_resumed' && evento.seq > fatto.seq);
  const inCorsa = workflowReplay({ definition: stato.definition, runId: b.runId, events: eventi.slice(0, ripresa + 1) });
  assert.throws(() => workflowApply(inCorsa, { ...fatto, eventId: randomUUID(), seq: eventi[ripresa].seq + 1 }), { code: 'WORKFLOW_TRANSITION_INVALID' },
    'a running run cannot take a raise');
  assert.deepEqual(p.errori, []);
});

/* Il segnale aspetta i passi IN VOLO: uno che finisce sotto la sua riserva libera spazio, e il passo che oggi non entra poi entra.
   `uno` sfora mentre `due` gira; dopo l'aumento parte `dopo`, `due` fallisce per traffico e il suo ritentativo sfora il tetto di 10
   token finché `dopo` tiene la sua riserva. Alla fine di `dopo` il ritentativo entra: nessuna «Serve attenzione» prematura. */
test('C3-22 SIGNAL-WAITS-FOR-STEPS-IN-FLIGHT: a step that does not fit while another one runs waits for it, and then fits', async (t) => {
  const b = await banco(t);
  const p = b.componi();
  await finoAiDuePassi(b, p);
  const uno = b.giri.indice('Fai uno');
  b.giri.consuma(uno, { prompt_tokens: SFORAMENTO, completion_tokens: 0 });
  b.giri.rispondi(uno);
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'needs_attention'), 'the overrun asks for attention, «due» still running');
  await alzaIlTetto(p, b.runId, (await p.orchestrator.ceilingPreview({ runId: b.runId })).amount);
  assert.ok(await aspettaChe(() => b.giri.indice('Dopo uno') >= 0), '«dopo» starts after the raise');
  b.giri.fallisci(b.giri.indice('Fai due'), 'traffico', 'Troppo traffico presso il fornitore.');
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.nodes.get('due').state === 'retry_wait'));
  await new Promise((r) => setTimeout(r, 1_100));
  p.scheduler.sveglia(b.runId);
  await calma(); await calma();
  let { eventi, stato } = await b.stato();
  assert.equal(stato.nodes.get('due').state, 'ready', 'premise: the retry is ready and does not fit while «dopo» holds its reserve');
  assert.equal(eventi.some((evento) => evento.type === 'budget_overrun_observed' && evento.payload.source === 'admission'), false, 'no signal while a step is in flight');
  assert.equal(stato.run.status, 'running');
  const quanti = b.giri.quanti;
  b.giri.rispondi(b.giri.indice('Dopo uno'));
  assert.ok(await aspettaChe(() => b.giri.quanti === quanti + 1), 'when «dopo» ends under its reserve, the retry fits and starts');
  b.giri.rispondi(quanti);
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'succeeded'));
  ({ eventi } = await b.stato());
  assert.equal(eventi.some((evento) => evento.type === 'budget_overrun_observed'), false, 'never asked for attention at admission');
  assert.deepEqual(p.errori, []);
});

test('C3-18 CEILING-AT-ADMISSION: a step that no longer fits the run ceiling asks for attention instead of waiting in silence forever', async (t) => {
  const b = await banco(t);
  const p = b.componi();
  await finoAlloSforamento(b, p);
  await alzaIlTetto(p, b.runId, (await p.orchestrator.ceilingPreview({ runId: b.runId })).amount);
  // il tetto basta per UNA riserva di `dopo`: il suo ritentativo automatico non ci sta più
  assert.ok(await aspettaChe(() => b.giri.indice('Dopo uno') >= 0));
  b.giri.fallisci(b.giri.indice('Dopo uno'), 'traffico', 'Troppo traffico presso il fornitore.');
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.nodes.get('dopo').state === 'retry_wait'));
  await new Promise((r) => setTimeout(r, 1_100));
  p.scheduler.sveglia(b.runId);
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'needs_attention'), 'not «running» forever');
  let { eventi, stato } = await b.stato();
  const segnale = eventi.findLast((evento) => evento.type === 'budget_overrun_observed');
  assert.deepEqual([segnale.nodeId, segnale.payload.source, segnale.payload.reservationId, segnale.payload.dimensions], ['dopo', 'admission', null, ['promptTokens']]);
  assert.ok(segnale.payload.observed.promptTokens > stato.definition.budgets.promptTokens + stato.budget.ceilingRaise.promptTokens, 'what it would reach');
  validateWorkflowEvent(segnale);
  assert.equal(b.giri.quanti, 5, 'the retry did not start');
  assert.deepEqual(p.errori, [], 'no silent error any more');

  // lo scheduler svegliato di nuovo non scrive un secondo segnale
  p.scheduler.sveglia(b.runId);
  await calma();
  assert.equal((await b.stato()).eventi.filter((evento) => evento.type === 'budget_overrun_observed').length, 1);

  const anteprima = await p.orchestrator.ceilingPreview({ runId: b.runId });
  assert.deepEqual(anteprima.nodeIds, ['dopo']);
  const passoDopo = stato.definition.nodes.find((node) => node.id === 'dopo');
  assert.equal(anteprima.amount.promptTokens, stato.budget.spent.promptTokens + passoDopo.budget.promptTokens
    - (stato.definition.budgets.promptTokens + stato.budget.ceilingRaise.promptTokens), 'the raise already granted counts: only what is missing now');
  await alzaIlTetto(p, b.runId, anteprima.amount);
  assert.ok(await aspettaChe(() => b.giri.quanti === 6), 'the retry starts after the raise');
  b.giri.rispondi(5);
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'succeeded'));
  ({ stato } = await b.stato());
  assert.equal(stato.budget.ceilingRaise.promptTokens > 0, true);
  assert.deepEqual(p.errori, []);
});

/*
 * C3 tappa 5 (09/10/2026, prova dal vivo con glm-5.3-flash) — un passo la cui sessione NON PARTE (il server era ripartito senza la
 *   chiave del fornitore): `activity_failed` senza consumo né ricevuta e nessuna sessione. Prima la riserva restava aperta e il
 *   passo «still being settled» per sempre: «Segna come fatto» rifiutato col run fermo (misurato dal giornale vero). Ora la riserva
 *   si rilascia (`failed_before_session`) e la persona decide il passo come ogni altro fallito.
 */
test('C3-23 FAILED-BEFORE-SESSION: a step whose session cannot start fails with its reservation released, and «Segna come fatto» works', async (t) => {
  const b = await banco(t);
  // il registro è congelato: una copia con il solo avvio del passo «uno» che rifiuta, come senza la chiave del fornitore
  const sessioni = { ...b.registro, avviaSessioneDiPasso: (input) => (String(input?.consegna ?? '').startsWith('Fai uno')
    ? { erroreAvvio: 'The key for OpenRouter is missing.', code: 'PROVIDER_KEY_MISSING' }
    : b.registro.avviaSessioneDiPasso(input)) };
  const p = b.componi({ sessioni });
  await p.orchestrator.recover();
  await p.scheduler.avvia();
  assert.ok(await aspettaChe(() => b.giri.indice('Prepara') >= 0), 'prepara starts');
  b.giri.rispondi(b.giri.indice('Prepara'));
  assert.ok(await aspettaChe(() => b.giri.indice('Fai due') >= 0), 'due starts');
  b.giri.rispondi(b.giri.indice('Fai due'));
  assert.ok(await aspettaChe(async () => {
    const { stato } = await b.stato();
    return stato.run.status === 'needs_attention' && stato.nodes.get('uno').state === 'failed' && stato.budget.reservations.size === 0;
  }), 'the step fails, the run asks for attention, and no reservation is left open');
  const { eventi } = await b.stato();
  assert.equal(eventi.filter((e) => e.type === 'agent_session_created' && e.nodeId === 'uno').length, 0, 'premise: no session was born for «uno»');
  assert.deepEqual(eventi.filter((e) => e.type === 'budget_released' && e.nodeId === 'uno').map((e) => e.payload.reason), ['failed_before_session']);
  await risolvi(p, { runId: b.runId, nodeId: 'uno', action: 'mark-done', summary: 'Done by hand: the three files are read.' });
  assert.ok(await aspettaChe(() => b.giri.indice('Dopo uno') >= 0), 'the dependent starts');
  b.giri.rispondi(b.giri.indice('Dopo uno'));
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'succeeded'));
  assert.deepEqual(p.errori, []);
});
