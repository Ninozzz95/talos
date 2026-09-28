import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { approveDefinition, createDefinition, createRun, createWorkflowStore } from '../src/workflow/store.mjs';
import { approveWorkflowProposal, proposeWorkflowFromTool, workflowIdForToolCall } from '../src/workflow/planning-control.mjs';
import { startWorkflowRun } from '../src/workflow/run-control.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const harnessDir = fileURLToPath(new URL('../', import.meta.url));
const definition = JSON.parse(await readFile(new URL('./fixtures/workflow/records/definition-record-v1.json', import.meta.url), 'utf8'));
const approval = JSON.parse(await readFile(new URL('./fixtures/workflow/records/approval-v1.json', import.meta.url), 'utf8'));
const coreV1 = JSON.parse(await readFile(new URL('./fixtures/workflow/definitions/core-v1-minimal.json', import.meta.url), 'utf8'));

async function availablePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function boot(root, port, extraEnv = {}) {
  /* DESK-TEMP-1, 23/09/2026: il server del test ha una TEMP SUA dentro `root`. Il Doctor di avvio vi crea
     `talos-doctor-*`, e `child.kill()` su Windows è un arresto forzato che salta il suo `finally`: misurato,
     2 cartelle restavano nella TEMP di chi lanciava la suite. Dentro `root` spariscono con lui. */
  const tempDelServer = join(root, 'temp');
  mkdirSync(tempDelServer, { recursive: true });
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: harnessDir, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      TALOS_HARNESS_UI_HOST: '127.0.0.1',
      TALOS_HARNESS_UI_PORT: String(port),
      TALOS_HARNESS_UI_PROJECT_DIRS: join(root, 'workspace'),
      TALOS_HARNESS_UI_SESSIONS_DIR: join(root, 'sessions'),
      TALOS_HARNESS_UI_KEYRING: 'memoria', TALOS_SCRATCH_DIR: join(root, 'scratch'), // 24/09/2026: mai la radice vera %LOCALAPPDATA%TALOS, // 23/09/2026: custodia delle chiavi di prova, mai quella vera di Windows
      TALOS_HARNESS_UI_WORKFLOW_DIR: join(root, 'workflows'),
      TALOS_DESKTOP_DATA_DIR: join(root, 'desktop'),
      TALOS_HARNESS_UI_TOKEN: '',
      OPENROUTER_API_KEY: '',
      TEMP: tempDelServer, TMP: tempDelServer, TMPDIR: tempDelServer,
      ...extraEnv,
    },
  });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => {
    output = (output + chunk.toString()).slice(-4096);
  });
  const base = `http://127.0.0.1:${port}`;
  let healthy = false;
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(`${base}/api/v1/health`, { signal: AbortSignal.timeout(300) });
      if (response.ok) { healthy = true; break; }
    } catch {}
    await delay(100);
  }
  if (!healthy) {
    child.kill();
    throw new Error(`Workflow server did not become healthy; exit=${child.exitCode}; tail=${output}`);
  }
  return { child, base };
}

async function stop(child) {
  if (child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill();
  await Promise.race([exited, delay(10_000, undefined, { ref: false }).then(() => { throw new Error('Workflow server did not stop'); })]);
}

test('WF-HTTP-SERVER-COMPOSITION-MISWIRE / WORKSPACE-ROOT-SHAPE: true server boot and restart expose persisted run', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'talos-workflow-server-wiring-'));
  const sessionId = randomUUID();
  const runId = randomUUID();
  mkdirSync(join(root, 'workspace'));
  mkdirSync(join(root, 'sessions'));
  mkdirSync(join(root, 'desktop'));
  writeFileSync(join(root, 'sessions', `${sessionId}.jsonl`), `${JSON.stringify({
    tipo: 'intestazione', sessionId, taskId: 'task-vero', cartella: join(root, 'workspace'),
    task: { consegna: 'Verifica Workflow persistito' }, modello: 'z-ai/glm-5.3-flash',
    avviataAlle: '2026-09-23T10:00:00.000Z',
  })}\n`);
  const store = await createWorkflowStore({ workflowDataRoot: join(root, 'workflows'),
    workspaceRoots: [join(root, 'workspace')],
    resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 67_108_864 } });
  await createDefinition(store, { record: definition });
  await approveDefinition(store, { approval });
  await createRun(store, { event: {
    schema: 'talos.workflow-event.v1', eventSchemaVersion: 1, engineSchemaVersion: 1,
    eventId: randomUUID(), runId, seq: 1, at: '2026-09-23T10:00:00.000Z', type: 'run_created',
    nodeId: null, commandId: randomUUID(), commandType: 'start-run',
    commandPayloadHash: `sha256:${'c'.repeat(64)}`, causationId: null, correlationId: runId,
    graphVersion: 1, activityExecutionId: null, attempt: null, leaseId: null, leaseEpoch: null,
    payload: { workflowId: definition.workflowId, definitionVersion: definition.version,
      definitionHash: definition.definitionHash, rootSessionId: sessionId,
      workspaceBaselineId: null, workspaceBaselineHash: null },
  } });
  await store.close();
  t.after(() => rimuoviCartellaDiProva(root));
  for (let bootNumber = 0; bootNumber < 2; bootNumber += 1) {
    const server = await boot(root, await availablePort());
    try {
      const response = await fetch(`${server.base}/api/v1/sessions/${sessionId}/workflows`);
      const body = await response.json();
      assert.equal(response.status, 200, `boot ${bootNumber + 1}: ${JSON.stringify(body)}`);
      assert.deepEqual(body.data.items.map((item) => item.runId), [runId]);
    } finally {
      await stop(server.child);
    }
  }
});

test('WF-SESSION-PROPOSE-APPROVE-RESTART: real server creates proposal through model tool without Store seed', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'talos-workflow-server-proposal-'));
  for (const name of ['workspace', 'sessions', 'desktop']) mkdirSync(join(root, name));
  t.after(() => rimuoviCartellaDiProva(root));
  const core = structuredClone(coreV1);
  core.schema = 'talos.workflow-definition-core.v2';
  core.definitionSchemaVersion = 2;
  core.phases = [{ id: 'implementation', label: 'Implementazione' }, { id: 'verification', label: 'Verifica' }];
  core.nodes[0].phaseId = 'implementation';
  core.nodes[1].phaseId = 'verification';
  const toolCallId = 'call_workflow_real_server_1';
  const calls = [];
  const fakeModel = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      if (req.url !== '/v1/chat/completions') {
        res.writeHead(404); res.end(); return;
      }
      const body = JSON.parse(raw);
      calls.push(body);
      const hasToolResult = body.messages?.some((message) => message.role === 'tool' && message.tool_call_id === toolCallId);
      const frames = hasToolResult
        ? [{ choices: [{ delta: { content: 'Piano Workflow proposto per la tua approvazione.' } }] }]
        : [{ choices: [{ delta: { tool_calls: [{ index: 0, id: toolCallId, type: 'function',
          function: { name: 'workflow_plan_propose', arguments: JSON.stringify({ core }) } }] } }] }];
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end(frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('') + 'data: [DONE]\n\n');
    });
  });
  await new Promise((resolve) => fakeModel.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => fakeModel.close(resolve)));
  const ollamaUrl = `http://127.0.0.1:${fakeModel.address().port}`;

  let server = await boot(root, await availablePort(), { OLLAMA_BASE_URL: ollamaUrl });
  try {
    const opened = await fetch(`${server.base}/api/v1/sessions/custom`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cartellaId: '0', consegna: 'Prepara un Workflow e chiedi la mia approvazione.',
        modello: 'ollama:glm-5.3-flash', modalitaOperativa: 'normale' /* F3-10: la proposta nasce in Normale */, reasoning: { effort: 'high' } }),
    });
    const openedBody = await opened.json();
    assert.equal(opened.status, 200, JSON.stringify(openedBody));
    const sessionId = openedBody.data.sessionId;
    const workflowId = workflowIdForToolCall({ sessionId, toolCallId });
    let proposal = null;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const response = await fetch(`${server.base}/api/v1/workflows/${workflowId}/versions/1`);
      if (response.status === 200) { proposal = (await response.json()).data; break; }
      await delay(100);
    }
    assert.ok(proposal, `model calls=${calls.length}; proposal was not published`);
    assert.equal(proposal.status, 'proposed');
    // F3-21 (25/09/2026): revisione limitata, vista v2
    assert.equal(proposal.proposal.initiatingSessionId, sessionId);
    assert.equal(proposal.phases.length, 2);
    assert.ok(calls.some((body) => body.tools?.some((tool) => tool.function?.name === 'workflow_plan_propose')));
    const commandId = randomUUID();
    const approved = await fetch(`${server.base}/api/v1/workflows/${workflowId}/versions/1/approve`, {
      // 23/09/2026: si approva come la finestra di TALOS (Origin + Sec-Fetch-Site). Un client senza
      // intestazioni su un server senza gettone è rifiutato per decisione owner («solo col gettone»).
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: server.base, 'Sec-Fetch-Site': 'same-origin' },
      body: JSON.stringify({ commandId, definitionHash: proposal.definitionHash }),
    });
    const approvedBody = await approved.json();
    assert.equal(approved.status, 200, JSON.stringify(approvedBody));
    const runsBefore = await (await fetch(`${server.base}/api/v1/sessions/${sessionId}/workflows`)).json();
    assert.deepEqual(runsBefore.data.items, []);
    // F3-51c (25/09/2026): la rotta di avvio esiste (prima era 404); una richiesta senza corpo JSON non avvia niente
    const start = await fetch(`${server.base}/api/v1/workflows/${workflowId}/versions/1/start`, { method: 'POST' });
    assert.equal(start.status, 400);
    assert.deepEqual((await (await fetch(`${server.base}/api/v1/sessions/${sessionId}/workflows`)).json()).data.items, [],
      'approving did not start anything, and a malformed start neither');
    await stop(server.child);
    server = await boot(root, await availablePort(), { OLLAMA_BASE_URL: ollamaUrl });
    const reloaded = await fetch(`${server.base}/api/v1/workflows/${workflowId}/versions/1`);
    const reloadedBody = await reloaded.json();
    assert.equal(reloaded.status, 200, JSON.stringify(reloadedBody));
    assert.equal(reloadedBody.data.status, 'approved');
    assert.equal(reloadedBody.data.approval.commandId, commandId);
    assert.deepEqual((await (await fetch(`${server.base}/api/v1/sessions/${sessionId}/workflows`)).json()).data.items, []);
  } finally {
    await stop(server.child);
  }
});

/*
 * ⭐ F3-11b + F3-11c (24/09/2026 notte), decisione owner 40 — il modello vede solo la BOZZA corta e la manda com'è; il server
 *   la compila e pubblica una Definition v2 a fasi, in sola lettura, NON avviata. Stesso banco della prova qui sopra.
 */
test('WF-SESSION-DRAFT-PROPOSE: il modello propone una bozza, il server vero la compila e la pubblica, senza avviarla', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'talos-workflow-server-draft-'));
  for (const name of ['workspace', 'sessions', 'desktop']) mkdirSync(join(root, name));
  t.after(() => rimuoviCartellaDiProva(root));
  const draft = {
    title: 'Revisione dei test', objective: 'Capire quali moduli non hanno test.',
    phases: [{ id: 'raccolta', label: 'Raccolta' }, { id: 'sintesi', label: 'Sintesi' }],
    nodes: [
      { id: 'moduli', phase: 'raccolta', label: 'Elenca i moduli', task: 'Elenca i moduli in src/.' },
      { id: 'prove', phase: 'raccolta', label: 'Elenca i test', task: 'Elenca i file in tests/.' },
      { id: 'buchi', phase: 'sintesi', label: 'Trova i buchi', task: 'Dimmi quali moduli non hanno un test.', dependsOn: ['moduli', 'prove'] },
    ],
  };
  const toolCallId = 'call_workflow_draft_1';
  const calls = [];
  const fakeModel = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      if (req.url !== '/v1/chat/completions') { res.writeHead(404); res.end(); return; }
      const body = JSON.parse(raw);
      calls.push(body);
      const hasToolResult = body.messages?.some((message) => message.role === 'tool' && message.tool_call_id === toolCallId);
      const frames = hasToolResult
        ? [{ choices: [{ delta: { content: 'Ho proposto il workflow.' } }] }]
        : [{ choices: [{ delta: { tool_calls: [{ index: 0, id: toolCallId, type: 'function',
          function: { name: 'workflow_plan_propose', arguments: JSON.stringify({ draft }) } }] } }] }];
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end(frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('') + 'data: [DONE]\n\n');
    });
  });
  await new Promise((resolve) => fakeModel.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => fakeModel.close(resolve)));
  const server = await boot(root, await availablePort(), { OLLAMA_BASE_URL: `http://127.0.0.1:${fakeModel.address().port}` });
  try {
    const opened = await fetch(`${server.base}/api/v1/sessions/custom`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cartellaId: '0', consegna: 'Proponi un workflow per trovare i moduli senza test.', modello: 'ollama:glm-5.3-flash', modalitaOperativa: 'normale' }),
    });
    const openedBody = await opened.json();
    assert.equal(opened.status, 200, JSON.stringify(openedBody));
    const sessionId = openedBody.data.sessionId;
    const workflowId = workflowIdForToolCall({ sessionId, toolCallId });
    let proposal = null;
    for (let attempt = 0; attempt < 100 && !proposal; attempt += 1) {
      const response = await fetch(`${server.base}/api/v1/workflows/${workflowId}/versions/1`);
      if (response.status === 200) proposal = (await response.json()).data; else await delay(100);
    }
    assert.ok(proposal, `model calls=${calls.length}; the draft proposal was not published`);
    assert.equal(proposal.status, 'proposed');
    assert.deepEqual(proposal.phases.map((p) => p.id), ['raccolta', 'sintesi']);
    // F3-21 (25/09/2026): i passi non viaggiano nella revisione — si leggono dal grafo PIANIFICATO del server vero
    const grafo = (await (await fetch(`${server.base}/api/v1/workflows/${workflowId}/versions/1/graph`)).json()).data;
    assert.equal(grafo.status, 'planned');
    assert.equal(grafo.runId, null);
    const passi = [];
    for (const fase of grafo.groups) {
      const pagina = (await (await fetch(`${server.base}/api/v1/workflows/${workflowId}/versions/1/groups/${fase.phaseId}`)).json()).data;
      passi.push(...pagina.items.map((item) => item.nodeId));
    }
    assert.deepEqual(passi.sort(), ['buchi', 'moduli', 'prove']);
    const elenco = (await (await fetch(`${server.base}/api/v1/sessions/${sessionId}/workflow-proposals`)).json()).data;
    assert.deepEqual(elenco.items.map((item) => [item.workflowId, item.status]), [[workflowId, 'proposed']]);
    // ciò che il modello ha visto: la bozza, non il Core
    const offerto = calls[0].tools.find((tool) => tool.function?.name === 'workflow_plan_propose').function.parameters;
    assert.deepEqual(offerto.required, ['draft']);
    // il modello ha ricevuto la ricevuta, non un errore
    const risposta = calls.at(-1).messages.find((m) => m.role === 'tool' && m.tool_call_id === toolCallId)?.content ?? '';
    assert.match(risposta, /"status":"proposed"/);
    assert.deepEqual((await (await fetch(`${server.base}/api/v1/sessions/${sessionId}/workflows`)).json()).data.items, [], 'nessun run parte dalla proposta');
  } finally {
    await stop(server.child);
  }
});

/*
 * ⭐ F3-41b (25/09/2026) — la COMPOSIZIONE VERA che `ORCHESTRATOR-NO-HTTP-OR-REAL-ADAPTER-COMPOSITION` non poteva essere (quella
 *   controlla solo che l'orchestratore non dipenda dal server): il server vero, avviato su un registro con un run v2 preparato
 *   dal comando di avvio, lo porta a `run_started` dopo il recupero e ne ammette il primo passo; un run v1 che non sa eseguire
 *   resta com'era (prima della guardia sarebbe partito e avrebbe girato a vuoto sui rifiuti).
 */
test('F3-41b WF-SERVER-COMPOSES-SCHEDULER: the real server starts a prepared v2 run after recovery, and leaves alone a run it cannot execute', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'talos-workflow-server-scheduler-'));
  for (const name of ['workspace', 'sessions', 'desktop']) mkdirSync(join(root, name));
  t.after(() => rimuoviCartellaDiProva(root));
  const sessionId = randomUUID();
  writeFileSync(join(root, 'sessions', `${sessionId}.jsonl`), `${JSON.stringify({
    tipo: 'intestazione', sessionId, taskId: 'task-vero', cartella: join(root, 'workspace'),
    task: { consegna: 'Radice del Workflow' }, modello: 'z-ai/glm-5.3-flash', avviataAlle: '2026-09-25T08:00:00.000Z',
  })}\n`);
  const store = await createWorkflowStore({ workflowDataRoot: join(root, 'workflows'), workspaceRoots: [join(root, 'workspace')],
    resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 67_108_864 } });
  const esiste = (id) => id === sessionId;
  const proposta = await proposeWorkflowFromTool(store, { sessionId, toolCallId: 'call_scheduler_boot', plannerModel: null,
    sessionModel: 'z-ai/glm-5.3-flash', modalitaOperativa: 'normale', agentRole: 'root',
    draft: { title: 'Avvio', objective: 'Provare lo scheduler nel server vero.', phases: [{ id: 'f', label: 'Fase' }],
      nodes: [{ id: 'a', phase: 'f', label: 'A', task: 'Leggi A.' }, { id: 'b', phase: 'f', label: 'B', task: 'Leggi B.', dependsOn: ['a'] }] } });
  await approveWorkflowProposal(store, { workflowId: proposta.workflowId, version: 1, definitionHash: proposta.definitionHash,
    commandId: randomUUID() }, { sessionExistsFn: esiste });
  const avviato = await startWorkflowRun(store, { workflowId: proposta.workflowId, version: 1, definitionHash: proposta.definitionHash,
    commandId: randomUUID() }, { sessionExistsFn: esiste, supportedNodeKinds: ['agent'] });
  await createDefinition(store, { record: definition });
  await approveDefinition(store, { approval });
  const vecchio = randomUUID();
  await createRun(store, { event: {
    schema: 'talos.workflow-event.v1', eventSchemaVersion: 1, engineSchemaVersion: 1,
    eventId: randomUUID(), runId: vecchio, seq: 1, at: '2026-09-25T08:00:00.000Z', type: 'run_created',
    nodeId: null, commandId: randomUUID(), commandType: 'start-run',
    commandPayloadHash: `sha256:${'d'.repeat(64)}`, causationId: null, correlationId: vecchio,
    graphVersion: 1, activityExecutionId: null, attempt: null, leaseId: null, leaseEpoch: null,
    payload: { workflowId: definition.workflowId, definitionVersion: definition.version,
      definitionHash: definition.definitionHash, rootSessionId: sessionId,
      workspaceBaselineId: null, workspaceBaselineHash: null },
  } });
  await store.close();
  // F3-41c (owner 25/09, «Da parte + rename»): la cartella di un run nato a metà da un crollo non ferma più il runtime
  const aMeta = randomUUID();
  mkdirSync(join(root, 'workflows', 'runs', aMeta, 'journal'), { recursive: true });
  const tipi = (runId) => readFileSync(join(root, 'workflows', 'runs', runId, 'journal', '000001.jsonl'), 'utf8')
    .trim().split('\n').map((riga) => JSON.parse(riga).event.type);
  const server = await boot(root, await availablePort());
  try {
    let visti = [];
    for (let attempt = 0; attempt < 100 && !visti.includes('capacity_claimed'); attempt += 1) {
      visti = tipi(avviato.runId);
      if (!visti.includes('capacity_claimed')) await delay(100);
    }
    assert.ok(visti.includes('run_started'), `the scheduler in the real server starts the prepared run; journal: ${visti}`);
    assert.ok(visti.includes('capacity_claimed'), `and admits its first step; journal: ${visti}`);
    assert.deepEqual(tipi(vecchio), ['run_created'], 'a run this server cannot execute is not started');
    assert.ok(existsSync(join(root, 'workflows', 'runs', `.${aMeta}.quarantena`)), 'the half-born run was set aside, and the runtime started anyway');
    assert.ok(existsSync(join(root, 'workflows', 'runs', aMeta, 'journal')), 'nothing deleted');
  } finally {
    await stop(server.child);
  }
});
