import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry as createSessionRegistryReale, SCHEMA_SESSIONE } from '../src/session-registry.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { talosLavora, verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';


function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new TaskCatalogError('Task non ammesso');
  return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'prova' } };
}

function registroCon(avviaSessioneFn) {
  return createSessionRegistryReale({
    avviaSessioneFn,
    preparaEsecuzioneFn: preparaEsecuzioneFinta,
    guardaWorkspaceFn: () => () => {},
    modello: 'm',
    chiave: 'k',
    cartellaEsisteFn: () => true,
  });
}

function sessioneSospesa() {
  let input = null;
  let resolveRun;
  const run = new Promise((resolve) => { resolveRun = resolve; });
  return {
    avviaSessioneFn: async (arg) => {
      input = arg;
      arg.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' });
      return run;
    },
    get input() { return input; },
    conclude() {
      input?.onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
      resolveRun({ ok: true, esito: { detto: 'fatto', comeFinita: 'concluso', messaggiFinali: [] } });
    },
  };
}

function rispostaTool(nome, argomenti, id = 'call_1') {
  return {
    role: 'assistant',
    content: '',
    tool_calls: [{ id, function: { name: nome, arguments: JSON.stringify(argomenti) } }],
  };
}

const FINE = { role: 'assistant', content: 'fatto', tool_calls: [] };

function sportello(risposte, osserva = () => {}) {
  let i = 0;
  return async (_url, opzioni) => {
    const body = JSON.parse(opzioni.body);
    osserva(body);
    return {
      ok: true,
      json: async () => ({ choices: [{ message: risposte[i++] ?? FINE }], usage: {} }),
    };
  };
}

test('M001_PLAN_WRITE_GATE_REMOVED', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-plan-mode-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const risultato = await talosLavora({
    cartella,
    task: { consegna: 'prova Piano' },
    modello: 'x',
    chiave: 'y',
    modalitaOperativa: 'piano',
    permessiPerAttrezzo: { scrivi: 'sempre' },
    fetchDiRete: sportello([
      rispostaTool('scrivi', { percorso: 'vietato.txt', contenuto: 'no' }),
      FINE,
    ]),
  });
  assert.equal(existsSync(join(cartella, 'vietato.txt')), false);
  const tool = risultato.messaggiFinali.find((m) => m.role === 'tool');
  assert.match(tool.content, /Plan mode|modalità Piano/i);
});

// F3-10 (23/09/2026, decisione owner D01-a): la delega è un attrezzo di Normale, non di Piano (era «solo in workflow»).
test('DELEGA — delega_sottotask è visibile in Normale e non in Piano; Domanda resta disponibile', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-workflow-mode-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  for (const [modalita, attesa] of [['normale', true], ['piano', false]]) {
    let tools = [];
    let descrizioneAsk = '';
    await talosLavora({
      cartella,
      task: { consegna: 'ispeziona gli strumenti' },
      modello: 'x',
      chiave: 'y',
      modalitaOperativa: modalita,
      strumentiEstesi: ['delega_sottotask', 'ask_user_question'],
      fetchDiRete: sportello([FINE], (body) => {
        tools = (body.tools ?? []).map((tool) => tool.function?.name).filter(Boolean);
        descrizioneAsk = (body.tools ?? []).find((tool) => tool.function?.name === 'ask_user_question')?.function?.description ?? '';
      }),
    });
    assert.equal(tools.includes('delega_sottotask'), attesa, modalita);
    assert.equal(tools.includes('ask_user_question'), true, 'Domanda deve restare disponibile in ' + modalita);
    assert.match(descrizioneAsk, /whenever a clarification/i, 'Ask resta una scelta naturale del modello');
  }
});

// F3-10 (23/09/2026, decisione owner D02-a): il root propone in Normale E in Piano (prima: Piano/Workflow, non Normale).
test('WF-PROPOSAL-TOOL-MODES: the root may propose in Normal and Plan, children may not', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-workflow-proposal-modes-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  for (const mode of ['normale', 'piano']) {
    let calls = 0;
    let toolNames = [];
    const result = await talosLavora({
      cartella, task: { consegna: 'proponi un workflow' }, modello: 'x', chiave: 'y',
      modalitaOperativa: mode, strumentiEstesi: ['workflow_plan_propose'],
      onWorkflowPlanPropose: async ({ core, toolCallId }) => {
        calls += 1;
        assert.deepEqual(core, { schema: 'test-core' });
        assert.equal(toolCallId, 'proposal_call_1');
        return { workflowId: 'w', version: 1, definitionHash: 'h', status: 'proposed' };
      },
      fetchDiRete: sportello([
        rispostaTool('workflow_plan_propose', { core: { schema: 'test-core' } }, 'proposal_call_1'), FINE,
      ], (body) => { toolNames = (body.tools ?? []).map((tool) => tool.function?.name); }),
    });
    assert.equal(toolNames.includes('workflow_plan_propose'), true, mode);
    assert.equal(calls, 1, mode);
    const output = result.messaggiFinali.find((message) => message.role === 'tool')?.content ?? '';
    assert.match(output, /proposed/i, mode);
  }
  let childCalls = 0;
  let childTools = [];
  const child = await talosLavora({
    cartella, task: { consegna: 'figlio' }, modello: 'x', chiave: 'y',
    modalitaOperativa: 'normale', agentRole: 'child', strumentiEstesi: ['workflow_plan_propose'],
    onWorkflowPlanPropose: async () => { childCalls += 1; },
    fetchDiRete: sportello([
      rispostaTool('workflow_plan_propose', { core: { schema: 'test-core' } }, 'proposal_call_2'), FINE,
    ], (body) => { childTools = (body.tools ?? []).map((tool) => tool.function?.name); }),
  });
  assert.equal(childTools.includes('workflow_plan_propose'), false);
  assert.equal(childCalls, 0);
  assert.match(child.messaggiFinali.find((message) => message.role === 'tool')?.content ?? '', /REFUSED/i);
});

test('ASK-NATURAL-SYSTEM-GUIDANCE: il root riceve guida condizionale, il figlio no', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-ask-guidance-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  for (const modalitaOperativa of ['normale', 'piano']) {
    let captured = null;
    await talosLavora({ cartella, task: { consegna: 'prima chiarisci la preferenza' }, modello: 'x', chiave: 'y',
      modalitaOperativa, strumentiEstesi: ['ask_user_question'],
      fetchDiRete: sportello([FINE], (body) => { captured = body; }) });
    assert.equal(captured.tools.some((tool) => tool.function?.name === 'ask_user_question'), true);
    assert.match(captured.messages[0].content, /ask_user_question.*instead of.*plain text/i,
      `guida Ask mancante in ${modalitaOperativa}`);
  }
  let child = null;
  await talosLavora({ cartella, task: { consegna: 'analizza' }, modello: 'x', chiave: 'y',
    modalitaOperativa: 'normale', agentRole: 'child', strumentiEstesi: ['ask_user_question', 'ask_parent'],
    fetchDiRete: sportello([FINE], (body) => { child = body; }) });
  assert.equal(child.tools.some((tool) => tool.function?.name === 'ask_user_question'), false);
  assert.doesNotMatch(child.messages[0].content, /ask_user_question.*instead of.*plain text/i);
});

// F3-10 (23/09/2026): la delega è di Normale; il cancello al dispatch resta, e nega in Piano (era «fuori da workflow»).
test('PIANO — una tool-call inattesa di delega non delega in Piano', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-workflow-dispatch-gate-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  for (const modalitaOperativa of ['piano']) {
    let deleghe = 0;
    const risultato = await talosLavora({
      cartella,
      task: { consegna: 'non delegare in Piano' },
      modello: 'x',
      chiave: 'y',
      modalitaOperativa,
      strumentiEstesi: ['delega_sottotask'],
      onDelega: async () => {
        deleghe += 1;
        return { esito: 'concluso', riassunto: 'non deve accadere' };
      },
      /* Un adapter o modello compromesso può nominare un tool mai pubblicizzato: il dispatcher
         deve mediare di nuovo, non fidarsi del fatto che la richiesta non lo conteneva. */
      fetchDiRete: sportello([
        rispostaTool('delega_sottotask', { task: 'tentativo inatteso' }),
        FINE,
      ]),
    });
    assert.equal(deleghe, 0, `${modalitaOperativa}: il callback non deve essere raggiunto`);
    const tool = risultato.messaggiFinali.find((m) => m.role === 'tool');
    assert.match(tool.content, /REFUSED\./);
  }
});

test('AGENT-CHILD-CANNOT-ASK-USER: tool assente e dispatch forzato non apre Ask', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-child-ask-gate-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  let chiamateUtente = 0;
  let nomiTool = [];
  const risultato = await talosLavora({
    cartella,
    task: { consegna: 'sotto-agente' },
    modello: 'x', chiave: 'y',
    agentRole: 'child',
    modalitaOperativa: 'normale', // F3-10: i figli nascono in Normale
    strumentiEstesi: ['ask_user_question', 'ask_parent'],
    chiediDomandaFn: async () => { chiamateUtente += 1; return { status: 'answered' }; },
    fetchDiRete: sportello([
      rispostaTool('ask_user_question', { questions: [{ id: 'scelta', question: 'Chiedi?' }] }),
      FINE,
    ], (body) => { nomiTool = (body.tools ?? []).map((tool) => tool.function?.name).filter(Boolean); }),
  });
  assert.equal(nomiTool.includes('ask_user_question'), false);
  assert.equal(nomiTool.includes('ask_parent'), true);
  assert.equal(chiamateUtente, 0);
  assert.match(risultato.messaggiFinali.find((m) => m.role === 'tool').content, /REFUSED|parent/i);
});

test('M002_PLAN_DYNAMIC_TOOL_EXPOSED', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-plan-dynamic-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  let toolsOfferti = [];
  let esecuzioni = 0;
  const chiamata = (name, id) => ({ id, function: { name, arguments: '{}' } });
  const risultato = await talosLavora({
    cartella,
    task: { consegna: 'ispeziona senza eseguire' },
    modello: 'x',
    chiave: 'y',
    modalitaOperativa: 'piano',
    strumentiEstesi: ['ask_user_question'],
    toolMcp: [{ name: 'mcp_mutante', description: 'muta', inputSchema: { type: 'object', properties: {} } }],
    chiamaToolMcpFn: async () => { esecuzioni += 1; return { content: [{ type: 'text', text: 'mai' }] }; },
    toolPlugin: [{ nome: 'plugin_mutante', descrizione: 'muta', parametri: { type: 'object', properties: {} } }],
    eseguiToolPluginFn: async () => { esecuzioni += 1; return 'mai'; },
    toolForge: [{ name: 'forge_mutante', description: 'muta', inputSchema: { type: 'object', properties: {} } }],
    eseguiToolForgeFn: async () => { esecuzioni += 1; return { status: 'succeeded', output: 'mai', trace: [] }; },
    fetchDiRete: sportello([
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          chiamata('mcp_mutante', 'mcp-1'),
          chiamata('plugin_mutante', 'plugin-1'),
          chiamata('forge_mutante', 'forge-1'),
        ],
      },
      FINE,
    ], (body) => {
      if (toolsOfferti.length === 0) toolsOfferti = (body.tools ?? []).map((tool) => tool.function?.name).filter(Boolean);
    }),
  });

  for (const nome of ['mcp_mutante', 'plugin_mutante', 'forge_mutante']) {
    assert.equal(toolsOfferti.includes(nome), false, nome + ' non deve essere pubblicizzato in Piano');
  }
  assert.equal(toolsOfferti.includes('ask_user_question'), true);
  assert.equal(esecuzioni, 0, 'anche una risposta malevola del modello deve fermarsi al secondo gate di Piano');
  const rifiuti = risultato.messaggiFinali.filter((m) => m.role === 'tool').map((m) => String(m.content));
  assert.equal(rifiuti.length, 3);
  assert.ok(rifiuti.every((testo) => /Plan mode|modalità Piano/i.test(testo)));
});

test('PIANO + PLANNER — il planner resta una fase read-only distinta, il main resta Piano e Ask resta solo nel main', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-plan-planner-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const chiamate = [];
  await talosLavora({
    cartella,
    task: { consegna: 'prepara un piano' },
    modello: 'editor-x',
    modelloPlanner: 'planner-x',
    chiave: 'y',
    modalitaOperativa: 'piano',
    strumentiEstesi: ['ask_user_question', 'delega_sottotask', 'time_now'],
    fetchDiRete: sportello([FINE, FINE], (body) => {
      chiamate.push({
        model: body.model,
        tools: (body.tools ?? []).map((tool) => tool.function?.name).filter(Boolean),
        messages: body.messages ?? [],
      });
    }),
  });
  assert.equal(chiamate.length, 2, 'una chiamata planner e una main, non due planner annidati');
  const [planner, main] = chiamate;
  for (const nome of ['scrivi', 'shell', 'file_edit', 'delega_sottotask', 'ask_user_question']) {
    assert.equal(planner.tools.includes(nome), false, 'planner read-only: ' + nome);
  }
  assert.equal(planner.tools.includes('time_now'), true, 'il planner può usare l’esteso read-safe');
  assert.equal(main.tools.includes('ask_user_question'), true, 'Ask resta disponibile al Plan Mode principale');
  assert.equal(main.tools.includes('delega_sottotask'), false, 'Piano non diventa Workflow perché esiste un planner');
  assert.ok(main.messages.some((m) => typeof m?.content === 'string' && m.content.includes('[Piano dell\'architetto')),
    'il risultato del planner è contesto del main, non approvazione/esecuzione autonoma');
});

test('DOMANDA — il kernel non chiude il giro prima della risposta umana', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-user-question-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  let resolveQuestion;
  const risposta = new Promise((resolve) => { resolveQuestion = resolve; });
  const run = talosLavora({
    cartella,
    task: { consegna: 'chiedi una scelta' },
    modello: 'x',
    chiave: 'y',
    strumentiEstesi: ['ask_user_question'],
    chiediDomandaFn: async (questions) => {
      assert.equal(questions[0].id, 'scelta');
      return risposta;
    },
    fetchDiRete: sportello([
      rispostaTool('ask_user_question', {
        questions: [{
          id: 'scelta',
          question: 'Quale strada?',
          why: 'Decide quale file cambia per primo.', // 24/09/2026, decisione owner 32: obbligatorio per il modello
          options: [
            { label: 'A', description: 'Prima strada' },
            { label: 'B', description: 'Seconda strada' },
          ],
        }],
      }),
      FINE,
    ]),
  });
  let concluso = false;
  run.then(() => { concluso = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(concluso, false, 'la richiesta deve essere davvero bloccante');
  resolveQuestion({ status: 'answered', answers: { scelta: 'A' } });
  const risultato = await run;
  const tool = risultato.messaggiFinali.find((m) => m.role === 'tool');
  assert.match(tool.content, /"status":"answered"/);
  assert.match(tool.content, /"scelta":"A"/);
});

test('DOMANDA — argomenti del tool invalidi non mettono mai in pausa la persona', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-user-question-invalid-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  let interpellata = 0;
  const risultato = await talosLavora({
    cartella,
    task: { consegna: 'chiedi una scelta' },
    modello: 'x',
    chiave: 'y',
    strumentiEstesi: ['ask_user_question'],
    chiediDomandaFn: async () => { interpellata += 1; return { status: 'skipped' }; },
    fetchDiRete: sportello([
      rispostaTool('ask_user_question', {
        questions: [{ id: 'NonSnake', question: 'Scelta?' }],
      }),
      FINE,
    ]),
  });
  assert.equal(interpellata, 0, 'un payload invalido deve essere respinto prima del canale umano');
  const tool = risultato.messaggiFinali.find((m) => m.role === 'tool');
  assert.match(tool.content, /ask_user_question failed/i);
});

test('ASK-OVERLAP-TYPED-TOOL: la seconda Ask non appare come risposta cancellata', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-ask-overlap-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const risultato = await talosLavora({
    cartella,
    task: { consegna: 'chiedi una preferenza' },
    modello: 'x',
    chiave: 'y',
    strumentiEstesi: ['ask_user_question'],
    chiediDomandaFn: async () => {
      throw Object.assign(new Error('Una domanda e gia in attesa'), { code: 'QUESTION_ALREADY_PENDING' });
    },
    fetchDiRete: sportello([
      // 24/09/2026, decisione owner 32: `why` obbligatorio per il modello, o la prova misurerebbe il rifiuto del contratto.
      rispostaTool('ask_user_question', { questions: [{ id: 'scelta', question: 'Quale preferisci?', why: 'Cambia il formato del rapporto.' }] }),
      FINE,
    ]),
  });
  const tool = risultato.messaggiFinali.find((messaggio) => messaggio.role === 'tool');
  assert.match(tool.content, /QUESTION_ALREADY_PENDING/);
  assert.doesNotMatch(tool.content, /"status":"cancelled"/);
});

test('REGISTRO — la risposta deve rispettare la forma della domanda prima di risolvere la Promise', async () => {
  const finta = sessioneSospesa();
  const registro = registroCon(finta.avviaSessioneFn);
  const { sessionId } = registro.avvia('task-vero');
  const attesa = finta.input.chiediDomandaFn([{
    id: 'scelta',
    question: 'Scegli?',
    options: [
      { label: 'A', description: 'prima' },
      { label: 'B', description: 'seconda' },
    ],
    multiSelect: true,
  }]);
  await Promise.resolve();
  // Un id sbagliato è già provato sotto: qui serve l'id corrente dalla riga persistita nel registro.
  const elenco = registro.esporta(sessionId);
  const richiestaCorrente = elenco.eventi.find((e) => e.type === 'UserQuestionRequested');
  const invalida = await registro.rispondiDomanda(sessionId, richiestaCorrente.requestId, {
    status: 'answered', answers: { scelta: 'A' },
  });
  assert.equal(invalida.code, 'QUERY_INVALID');
  const valida = await registro.rispondiDomanda(sessionId, richiestaCorrente.requestId, {
    status: 'answered', answers: { scelta: ['A', 'Altro'] },
  });
  assert.deepEqual(valida, { ok: true });
  assert.deepEqual(await attesa, { status: 'answered', answers: { scelta: ['A', 'Altro'] } });
  finta.conclude();
});

test('ASK-OVERLAP-PROMISE-LOST: la seconda Ask rifiuta senza perdere la prima attesa', async () => {
  const finta = sessioneSospesa();
  const registro = registroCon(finta.avviaSessioneFn);
  const { sessionId } = registro.avvia('task-vero');
  const prima = finta.input.chiediDomandaFn([{ id: 'prima', question: 'Prima scelta?' }]);
  const richiesta = registro.esporta(sessionId).eventi.find((evento) => evento.type === 'UserQuestionRequested');
  try {
    const seconda = finta.input.chiediDomandaFn([{ id: 'seconda', question: 'Seconda scelta?' }]);
    const esitoSeconda = await Promise.race([
      seconda.then(() => 'resolved', (error) => error?.code ?? 'untyped'),
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 30)),
    ]);
    assert.equal(esitoSeconda, 'QUESTION_ALREADY_PENDING');
    assert.equal(registro.esporta(sessionId).eventi.filter((evento) => evento.type === 'UserQuestionRequested').length, 1);
    assert.deepEqual(
      await registro.rispondiDomanda(sessionId, richiesta.requestId, { status: 'answered', answers: { prima: 'A' } }),
      { ok: true },
    );
    assert.deepEqual(await prima, { status: 'answered', answers: { prima: 'A' } });
  } finally {
    registro.ferma(sessionId);
    finta.conclude();
  }
});

test('M003_QUESTION_STALE_ACCEPTED', async () => {
  const finta = sessioneSospesa();
  const registro = registroCon(finta.avviaSessioneFn);
  const { sessionId } = registro.avvia('task-vero', { modalitaOperativaScelta: 'piano' });
  assert.equal(finta.input.modalitaOperativa, 'piano');

  const eventi = [];
  registro.iscriviti(sessionId, (evento) => eventi.push(evento));
  const attesa = finta.input.chiediDomandaFn([{ id: 'scelta', question: 'Scegli?' }]);
  await Promise.resolve();
  const richiesta = eventi.find((evento) => evento.type === 'UserQuestionRequested');
  assert.ok(richiesta?.requestId);

  const vecchia = await registro.rispondiDomanda(sessionId, 'request-id-vecchio', { status: 'answered', answers: { scelta: 'A' } });
  assert.equal(vecchia.code, 'QUESTION_NOT_PENDING');

  registro.ferma(sessionId);
  assert.deepEqual(await attesa, { status: 'cancelled', reason: 'run-cancelled' });
  assert.ok(eventi.some((evento) => evento.type === 'UserQuestionResolved' && evento.requestId === richiesta.requestId && evento.status === 'cancelled'));
  finta.conclude();
});

test('REGISTRO — il modo di lavoro si cambia solo fra due giri', async () => {
  const finta = sessioneSospesa();
  const registro = registroCon(finta.avviaSessioneFn);
  const { sessionId } = registro.avvia('task-vero');
  const durante = await registro.aggiornaImpostazioni(sessionId, { modalitaOperativa: 'piano' }); // F3-10: due modi soli
  assert.equal(durante.code, 'SESSION_NOT_READY');
  finta.conclude();
  await new Promise((resolve) => setImmediate(resolve));
  const dopo = await registro.aggiornaImpostazioni(sessionId, { modalitaOperativa: 'piano' });
  assert.deepEqual(dopo, { ok: true });
  assert.equal(registro.elenca().find((s) => s.sessionId === sessionId).modalitaOperativa, 'piano');
});

/*
 * ⛔⛔ Riparazione CTX del 23/09/2026 notte — i due SECONDI cancelli che nessuna prova guardava.
 *   La revisione avversaria li ha tolti uno alla volta (mutazioni M8 e M5b) e la suite è rimasta verde:
 *   erano coperti solo perché il primo cancello (la lista offerta al modello, o l'allowlist del Piano)
 *   reggeva. Un modello che nomina un attrezzo non offerto deve trovare il secondo cancello da solo.
 *   ⛔ F3-10 (23/09/2026, decisione owner D03-a) — M008 RISCRITTO, non tolto: il dialogo col figlio è ora
 *   un attrezzo di Normale (non di Piano). Il secondo cancello che resta raggiungibile è «nessun canale verso
 *   il figlio»: in Normale gli attrezzi sono offerti, e senza canale devono essere negati senza chiamare
 *   niente. In Piano risponde il primo cancello (`bloccatoDalPiano`), e il ramo Piano del secondo resta
 *   difesa in profondità (irraggiungibile finché il primo regge — come M5b prima dell'export).
 */
test('M008_ASK_CHILD_SECOND_GATE — ask_child e answer_child_question: in Normale senza canale e in Piano sono rifiutati al dispatch', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-ask-child-gate-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const chiamate = [
    { id: 'a', function: { name: 'ask_child', arguments: JSON.stringify({ childId: 'c1', question: 'Quale test?' }) } },
    { id: 'b', function: { name: 'answer_child_question', arguments: JSON.stringify({ childId: 'c1', requestId: 'r1', answer: 'v1' }) } },
  ];
  // 1) Normale SENZA canale: offerti (primo cancello aperto), negati dal secondo.
  let offerti = null;
  const senzaCanale = await talosLavora({
    cartella, task: { consegna: 'coordina il figlio' }, modello: 'x', chiave: 'y', modalitaOperativa: 'normale',
    strumentiEstesi: ['ask_child', 'answer_child_question'],
    fetchDiRete: sportello([{ role: 'assistant', content: '', tool_calls: chiamate }, FINE], (body) => { offerti ??= (body.tools ?? []).map((a) => a.function?.name); }),
  });
  assert.equal(offerti.includes('ask_child'), true, 'in Normale il dialogo col figlio è offerto');
  assert.equal(offerti.includes('answer_child_question'), true);
  const esitiSenza = senzaCanale.messaggiFinali.filter((m) => m.role === 'tool').map((m) => m.content);
  assert.equal(esitiSenza.length, 2);
  assert.match(esitiSenza[0], /^REFUSED\. ask_child requires a parent channel\./);
  assert.match(esitiSenza[1], /^REFUSED\. answer_child_question requires a parent channel\./);

  // 2) Piano CON canale: non offerti, negati, canale mai chiamato.
  let chieste = 0;
  let risposte = 0;
  offerti = null;
  const inPiano = await talosLavora({
    cartella, task: { consegna: 'coordina il figlio' }, modello: 'x', chiave: 'y', modalitaOperativa: 'piano',
    strumentiEstesi: ['ask_child', 'answer_child_question'],
    askChildFn: async () => { chieste += 1; return { status: 'requested' }; },
    answerChildQuestionFn: async () => { risposte += 1; return { ok: true }; },
    fetchDiRete: sportello([{ role: 'assistant', content: '', tool_calls: chiamate }, FINE], (body) => { offerti ??= (body.tools ?? []).map((a) => a.function?.name); }),
  });
  assert.equal(offerti.includes('ask_child'), false, 'in Piano non è offerto');
  assert.equal(offerti.includes('answer_child_question'), false);
  for (const esito of inPiano.messaggiFinali.filter((m) => m.role === 'tool').map((m) => m.content)) assert.match(esito, /^REFUSED\./);
  assert.equal(chieste, 0, 'il canale verso il figlio non deve mai essere chiamato in Piano');
  assert.equal(risposte, 0);
});

test('M005B_PLAN_SECOND_GATE — verificaPermessoScrittura nega in Piano ogni azione che non è una lettura, anche con «sempre»', async () => {
  let chiesto = 0;
  const chiediApprovazioneFn = async () => { chiesto += 1; return true; };
  for (const tipo of ['scrivi', 'file_edit', 'shell', 'document_create', 'tool_create', 'notes_create', 'memory_write']) {
    const opzioni = { permessiPerAttrezzo: { [tipo]: 'sempre' }, chiediApprovazioneFn, cartella: tmpdir() };
    const azione = { tipo, percorso: join(tmpdir(), 'piano.txt'), comando: 'echo piano' };
    // Controllo: fuori dal Piano lo stesso «sempre» passa, quindi il no qui sotto viene dal Piano e da nient'altro.
    assert.equal((await verificaPermessoScrittura(azione, { ...opzioni, modalitaOperativa: 'normale' })).consentito, true, tipo);
    const inPiano = await verificaPermessoScrittura(azione, { ...opzioni, modalitaOperativa: 'piano' });
    assert.equal(inPiano.consentito, false, tipo);
    assert.equal(inPiano.via, 'modalita-piano', tipo);
  }
  assert.equal(chiesto, 0, 'il Piano non chiede: nega');
  const lettura = await verificaPermessoScrittura({ tipo: 'leggi', percorso: join(tmpdir(), 'x.txt') }, { modalitaOperativa: 'piano', cartella: tmpdir() });
  assert.equal(lettura.consentito, true, 'la lettura resta permessa in Piano');
});

/*
 * ⛔⛔⛔ F3-10 — ritiro del modo «Workflow» (decisione owner 23/09/2026 notte): un solo selettore
 *   Normale / Piano. Delega, `ask_child` e `answer_child_question` diventano attrezzi di Normale (non di
 *   Piano); `workflow_plan_propose` si offre al root in Normale e in Piano; i figli nascono in Normale;
 *   un journal storico con `workflow` si rilegge come Normale senza riscrivere il file.
 */
function nomiOfferti(body) { return (body.tools ?? []).map((tool) => tool.function?.name).filter(Boolean); }

test('MODE-TWO-VALUES-ONLY — il registro rifiuta «workflow» con un errore tipizzato, in avvio e in cambio', async () => {
  let avvii = 0;
  const finta = sessioneSospesa();
  const registro = registroCon(async (arg) => { avvii += 1; return finta.avviaSessioneFn(arg); });
  const daCatalogo = registro.avvia('task-vero', { modalitaOperativaScelta: 'workflow' });
  assert.equal(daCatalogo.code, 'MODE_WORKFLOW_RETIRED');
  assert.equal(daCatalogo.sessionId, undefined);
  const libera = registro.avviaLibero({ cartellaLibera: tmpdir(), consegna: 'prova', modalitaOperativa: 'workflow' });
  assert.equal(libera.code, 'MODE_WORKFLOW_RETIRED');
  assert.equal(registro.avvia('task-vero', { modalitaOperativaScelta: 'automatico' }).code, 'QUERY_INVALID');
  await new Promise((r) => setImmediate(r));
  assert.equal(avvii, 0, 'nessun modello avviato con un modo ritirato');
  assert.deepEqual(registro.elenca(), []);

  const { sessionId } = registro.avvia('task-vero');
  await new Promise((r) => setImmediate(r));
  finta.conclude();
  await new Promise((r) => setImmediate(r));
  const cambio = await registro.aggiornaImpostazioni(sessionId, { modalitaOperativa: 'workflow' });
  assert.equal(cambio.code, 'MODE_WORKFLOW_RETIRED');
  assert.equal(registro.elenca().find((s) => s.sessionId === sessionId).modalitaOperativa, 'normale');
  assert.deepEqual(await registro.aggiornaImpostazioni(sessionId, { modalitaOperativa: 'piano' }), { ok: true });
});

test('DELEGA-GATE-V2 — delega_sottotask è un attrezzo di Normale: offerto ed eseguito in Normale, negato in Piano', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-delega-v2-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  // «workflow» arriva al kernel solo da un chiamante vecchio: vale come Normale, mai come un modo a parte.
  for (const [modalitaOperativa, attesa] of [['normale', true], ['piano', false], ['workflow', true]]) {
    let deleghe = 0;
    let offerti = null;
    const risultato = await talosLavora({
      cartella, task: { consegna: 'delega un pezzo' }, modello: 'x', chiave: 'y', modalitaOperativa,
      strumentiEstesi: ['delega_sottotask'],
      onDelega: async () => { deleghe += 1; return { esito: 'avviato', childId: 'c1', riassunto: 'avviato' }; },
      fetchDiRete: sportello([rispostaTool('delega_sottotask', { task: 'indaga' }), FINE], (body) => { offerti ??= nomiOfferti(body); }),
    });
    assert.equal(offerti.includes('delega_sottotask'), attesa, modalitaOperativa);
    assert.equal(deleghe, attesa ? 1 : 0, modalitaOperativa);
    const esito = risultato.messaggiFinali.find((m) => m.role === 'tool').content;
    if (attesa) assert.doesNotMatch(esito, /REFUSED/, modalitaOperativa);
    else assert.match(esito, /^REFUSED\./, modalitaOperativa);
  }
});

test('DIALOGUE-GATE-V2 — ask_child e answer_child_question: offerti ed eseguiti in Normale, negati in Piano', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-dialogo-v2-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  for (const [modalitaOperativa, attesa] of [['normale', true], ['piano', false], ['workflow', true]]) {
    let chieste = 0;
    let risposte = 0;
    let offerti = null;
    const risultato = await talosLavora({
      cartella, task: { consegna: 'coordina il figlio' }, modello: 'x', chiave: 'y', modalitaOperativa,
      strumentiEstesi: ['ask_child', 'answer_child_question'],
      askChildFn: async () => { chieste += 1; return { status: 'requested', requestId: 'r2', childId: 'c1' }; },
      answerChildQuestionFn: async () => { risposte += 1; return { ok: true }; },
      fetchDiRete: sportello([
        { role: 'assistant', content: '', tool_calls: [
          { id: 'a', function: { name: 'ask_child', arguments: JSON.stringify({ childId: 'c1', question: 'Quale test?' }) } },
          { id: 'b', function: { name: 'answer_child_question', arguments: JSON.stringify({ childId: 'c1', requestId: 'r1', answer: 'v1' }) } },
        ] },
        FINE,
      ], (body) => { offerti ??= nomiOfferti(body); }),
    });
    assert.equal(offerti.includes('ask_child'), attesa, modalitaOperativa);
    assert.equal(offerti.includes('answer_child_question'), attesa, modalitaOperativa);
    assert.equal(chieste, attesa ? 1 : 0, modalitaOperativa);
    assert.equal(risposte, attesa ? 1 : 0, modalitaOperativa);
    for (const esito of risultato.messaggiFinali.filter((m) => m.role === 'tool').map((m) => m.content)) {
      if (attesa) assert.doesNotMatch(esito, /REFUSED/, modalitaOperativa);
      else assert.match(esito, /^REFUSED\./, modalitaOperativa);
    }
  }
});

test('WF-PROPOSAL-TOOL-MODES-V2 — il root propone in Normale e in Piano; un figlio mai', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-proposta-v2-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  for (const [agentRole, modalitaOperativa, attesa] of [
    ['root', 'normale', true], ['root', 'piano', true], ['root', 'workflow', true],
    ['child', 'normale', false], ['child', 'piano', false],
  ]) {
    let chiamate = 0;
    let offerti = null;
    let ricevuto = null;
    const risultato = await talosLavora({
      cartella, task: { consegna: 'proponi' }, modello: 'x', chiave: 'y', modalitaOperativa, agentRole,
      strumentiEstesi: ['workflow_plan_propose'],
      onWorkflowPlanPropose: async (input) => { chiamate += 1; ricevuto = input; return { workflowId: 'w', version: 1, definitionHash: 'h', status: 'proposed' }; },
      fetchDiRete: sportello([rispostaTool('workflow_plan_propose', { core: { schema: 'test-core' } }, 'p1'), FINE], (body) => { offerti ??= nomiOfferti(body); }),
    });
    const caso = `${agentRole}/${modalitaOperativa}`;
    assert.equal(offerti.includes('workflow_plan_propose'), attesa, caso);
    assert.equal(chiamate, attesa ? 1 : 0, caso);
    if (attesa) assert.deepEqual(ricevuto, { core: { schema: 'test-core' }, toolCallId: 'p1' }, caso);
    const esito = risultato.messaggiFinali.find((m) => m.role === 'tool').content;
    assert.match(esito, attesa ? /proposed/ : /^REFUSED\./, caso);
  }
});

/*
 * ⭐ F3-11b (24/09/2026 notte), decisione owner 40 — il kernel accetta ESATTAMENTE uno fra `draft` (ciò che si annuncia al
 *   modello) e `core` (prove e API interne): la bozza arriva al server intatta; entrambi o nessuno si rifiutano col motivo,
 *   senza chiamare il server.
 */
test('WF-DRAFT-UNKNOWN-OR-AMBIGUOUS — la bozza passa intatta; entrambi, nessuno o un altro campo si rifiutano senza chiamare il server', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-proposta-bozza-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const bozza = { title: 'T', objective: 'O', phases: [{ id: 'a', label: 'A' }], nodes: [{ id: 'n1', phase: 'a', label: 'L', task: 'fai' }] };
  for (const [caso, argomenti, passa] of [
    ['solo draft', { draft: bozza }, true],
    ['solo core', { core: { schema: 'test-core' } }, true],
    ['entrambi', { draft: bozza, core: { schema: 'test-core' } }, false],
    ['nessuno', {}, false],
    ['campo sbagliato', { workflow: bozza }, false],
    ['draft non oggetto', { draft: 'fasi: a' }, false],
  ]) {
    let ricevuto = null;
    let chiamate = 0;
    const risultato = await talosLavora({
      cartella, task: { consegna: 'proponi' }, modello: 'x', chiave: 'y', modalitaOperativa: 'normale', agentRole: 'root',
      strumentiEstesi: ['workflow_plan_propose'],
      onWorkflowPlanPropose: async (input) => { chiamate += 1; ricevuto = input; return { workflowId: 'w', version: 1, definitionHash: 'h', status: 'proposed' }; },
      fetchDiRete: sportello([rispostaTool('workflow_plan_propose', argomenti, 'p9'), FINE]),
    });
    const esito = risultato.messaggiFinali.find((m) => m.role === 'tool').content;
    assert.equal(chiamate, passa ? 1 : 0, caso);
    if (passa) assert.deepEqual(ricevuto, { ...argomenti, toolCallId: 'p9' }, caso);
    else assert.match(esito, /failed \[QUERY_INVALID\].*exactly one "draft"/, caso);
  }
});

test('CHILD-MODE-NOT-WORKFLOW — il figlio nasce in Normale', async () => {
  const run = [];
  const registro = registroCon(async (input) => {
    run.push(input);
    input.onEvento({ type: 'RunStarted', threadId: `t${run.length}`, runId: `r${run.length}` });
    return new Promise(() => {});
  });
  const { sessionId } = registro.avvia('task-vero');
  await new Promise((r) => setImmediate(r));
  assert.equal(run[0].modalitaOperativa, 'normale');
  const delega = await run[0].onDelega('indaga', '/tmp/figlio');
  assert.equal(delega.esito, 'avviato');
  assert.equal(run[1].modalitaOperativa, 'normale');
  const figlia = registro.elenca().find((s) => s.padreId === sessionId);
  assert.equal(figlia.modalitaOperativa, 'normale');
  assert.equal(figlia.usavaModalitaWorkflow, false);
  registro.ferma(delega.childId); registro.ferma(sessionId);
});

/*
 * ⛔ CTX D1 della revisione avversaria (23/09/2026) — riscritto il 24/09/2026 con la decisione dell'owner
 *   «Come Claude» (sostituisce il rifiuto MODE_CHANGE_CHILDREN_ACTIVE della prima consegna):
 *   1) il padre PUÒ passare a Piano con figli vivi;
 *   2) i figli vivi continuano, ma ogni loro chiamata esecutiva passa dal cancello del Piano finché il padre è
 *      in Piano, e torna libera quando il padre torna in Normale (il modo si legge dal padre A OGNI chiamata);
 *   3) il padre in Piano riceve le domande dei figli e RISPONDE: `answer_child_question` resta offerto in Piano
 *      quando c'è almeno un figlio vivo; `delega_sottotask` e `ask_child` no.
 */
function registroConFigli() {
  const run = [];
  const registro = registroCon((input) => {
    let risolvi;
    const promessa = new Promise((r) => { risolvi = r; });
    run.push({ input, risolvi });
    input.onEvento({ type: 'RunStarted', threadId: `t${run.length}`, runId: `r${run.length}` });
    return promessa;
  });
  const concludi = (i) => {
    run[i].input.onEvento({ type: 'RunFinished', threadId: `t${i + 1}`, runId: `r${i + 1}` });
    run[i].risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'attendo' }] } });
  };
  return { registro, run, concludi };
}

/** Il giro del figlio col kernel VERO, cablato con ciò che il registro gli ha passato. */
function giroDelFiglio(inputFiglio, cartella, risposte, osserva) {
  return talosLavora({
    cartella, task: { consegna: 'lavora' }, modello: 'x', chiave: 'y', agentRole: 'child',
    modalitaOperativa: inputFiglio.modalitaOperativa,
    modalitaOperativaCorrenteFn: inputFiglio.modalitaOperativaCorrenteFn,
    permessiPerAttrezzo: { scrivi: 'sempre' },
    strumentiEstesi: ['delega_sottotask', 'ask_parent'],
    onDelega: async () => { osserva?.delega?.(); return { esito: 'avviato', childId: 'n1', riassunto: 'avviato' }; },
    fetchDiRete: sportello(risposte, osserva?.corpo),
  });
}

test('D1-PLAN-SWITCH-ALLOWED — con un figlio vivo il padre passa a Piano; il figlio resta vivo', async () => {
  const { registro, run, concludi } = registroConFigli();
  const { sessionId: parentId } = registro.avvia('task-vero');
  await new Promise((r) => setImmediate(r));
  const { childId } = await run[0].input.onDelega('indaga', '/tmp/figlio');
  concludi(0);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(await registro.aggiornaImpostazioni(parentId, { modalitaOperativa: 'piano' }), { ok: true });
  const elenco = registro.elenca();
  assert.equal(elenco.find((s) => s.sessionId === parentId).modalitaOperativa, 'piano');
  const figlia = elenco.find((s) => s.sessionId === childId);
  assert.equal(figlia.conclusa, false, 'il figlio continua');
  registro.ferma(childId); registro.ferma(parentId);
});

test('D1-CHILD-INHERITS-PLAN-GATE — padre in Piano ⇒ la scrittura del figlio vivo è negata; padre in Normale ⇒ la stessa scrittura passa', async (t) => {
  const { registro, run, concludi } = registroConFigli();
  const { sessionId: parentId } = registro.avvia('task-vero');
  await new Promise((r) => setImmediate(r));
  const { childId } = await run[0].input.onDelega('indaga', '/tmp/figlio');
  concludi(0);
  await new Promise((r) => setImmediate(r));
  const inputFiglio = run[1].input;
  assert.equal(inputFiglio.modalitaOperativa, 'normale', 'il figlio nasce in Normale');
  assert.equal(typeof inputFiglio.modalitaOperativaCorrenteFn, 'function', 'il registro dà al figlio il modo del padre, letto al momento');
  const cartella = mkdtempSync(join(tmpdir(), 'talos-d1-gate-'));
  t.after(() => rimuoviCartellaDiProva(cartella));

  assert.deepEqual(await registro.aggiornaImpostazioni(parentId, { modalitaOperativa: 'piano' }), { ok: true });
  let deleghe = 0;
  const inPiano = await giroDelFiglio(inputFiglio, cartella, [
    { role: 'assistant', content: '', tool_calls: [
      { id: 'w1', function: { name: 'scrivi', arguments: JSON.stringify({ percorso: 'figlio.txt', contenuto: 'x' }) } },
      { id: 'd1', function: { name: 'delega_sottotask', arguments: JSON.stringify({ task: 'nipote' }) } },
      { id: 's1', function: { name: 'shell', arguments: JSON.stringify({ comando: 'echo x > shell.txt' }) } },
    ] },
    FINE,
  ], { delega: () => { deleghe += 1; } });
  for (const esito of inPiano.messaggiFinali.filter((m) => m.role === 'tool').map((m) => m.content)) assert.match(esito, /Plan mode is active/);
  assert.equal(existsSync(join(cartella, 'figlio.txt')), false, 'la scrittura del figlio è negata dal cancello del Piano');
  assert.equal(existsSync(join(cartella, 'shell.txt')), false);
  assert.equal(deleghe, 0, 'nessun nipote in Piano');

  assert.deepEqual(await registro.aggiornaImpostazioni(parentId, { modalitaOperativa: 'normale' }), { ok: true });
  const inNormale = await giroDelFiglio(inputFiglio, cartella, [
    rispostaTool('scrivi', { percorso: 'figlio.txt', contenuto: 'x' }, 'w2'), FINE,
  ]);
  assert.doesNotMatch(inNormale.messaggiFinali.find((m) => m.role === 'tool').content, /REFUSED|Plan mode/);
  assert.equal(existsSync(join(cartella, 'figlio.txt')), true, 'col padre in Normale la stessa scrittura passa');
  registro.ferma(childId); registro.ferma(parentId);
});

test('D1-CHILD-MODE-READ-AT-EACH-CALL — il modo del padre cambia A METÀ del giro del figlio: la chiamata dopo lo vede', async (t) => {
  const { registro, run, concludi } = registroConFigli();
  const { sessionId: parentId } = registro.avvia('task-vero');
  await new Promise((r) => setImmediate(r));
  const { childId } = await run[0].input.onDelega('indaga', '/tmp/figlio');
  concludi(0);
  await new Promise((r) => setImmediate(r));
  const cartella = mkdtempSync(join(tmpdir(), 'talos-d1-dinamico-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  let giri = 0;
  let ultimoCorpo = null;
  const risultato = await giroDelFiglio(run[1].input, cartella, [
    rispostaTool('scrivi', { percorso: 'primo.txt', contenuto: '1' }, 'a'),
    rispostaTool('scrivi', { percorso: 'secondo.txt', contenuto: '2' }, 'b'),
    FINE,
  ], { corpo: (body) => {
    ultimoCorpo = body;
    giri += 1;
    // Fra il primo e il secondo giro del figlio, la persona mette il padre in Piano.
    if (giri === 2) registro.aggiornaImpostazioni(parentId, { modalitaOperativa: 'piano' });
  } });
  const esiti = risultato.messaggiFinali.filter((m) => m.role === 'tool').map((m) => m.content);
  assert.equal(existsSync(join(cartella, 'primo.txt')), true, 'prima del cambio la scrittura passa');
  assert.equal(existsSync(join(cartella, 'secondo.txt')), false, 'dopo il cambio la stessa azione è negata');
  assert.match(esiti[1], /Plan mode is active/);
  // Il cancello cambia, il prompt no: lista e messaggio di sistema restano quelli d'avvio (la cache per prefisso regge).
  assert.equal(giri, 3);
  assert.equal(JSON.stringify(ultimoCorpo.messages).includes('Plan mode is on'), false);
  registro.ferma(childId); registro.ferma(parentId);
});

test('D1-PARENT-IN-PLAN-ANSWERS — padre in Piano: la domanda del figlio arriva, answer_child_question è offerto e la risposta è consegnata', async () => {
  const { registro, run, concludi } = registroConFigli();
  const { sessionId: parentId } = registro.avvia('task-vero');
  await new Promise((r) => setImmediate(r));
  const { childId } = await run[0].input.onDelega('indaga', '/tmp/figlio');
  concludi(0);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(await registro.aggiornaImpostazioni(parentId, { modalitaOperativa: 'piano' }), { ok: true });

  const pending = run[1].input.askParentFn('Quale versione?');
  await new Promise((r) => setImmediate(r));
  const svegliato = run[2]?.input;
  assert.ok(svegliato, 'la domanda del figlio risveglia il padre anche in Piano');
  assert.equal(svegliato.modalitaOperativa, 'piano');
  assert.equal(svegliato.figliViviAllAvvio, true);
  const requestId = registro.esporta(parentId).eventi.find((e) => e?.name === 'talos.agent-dialogue' && e.value?.status === 'requested').value.requestId;
  const cartella = mkdtempSync(join(tmpdir(), 'talos-d1-risposta-'));
  let offerti = null;
  let chieste = 0;
  let deleghe = 0;
  let risultato;
  try {
    risultato = await talosLavora({ cartella, task: { consegna: 'rispondi' }, modello: 'x', chiave: 'y',
      modalitaOperativa: svegliato.modalitaOperativa, figliViviAllAvvio: svegliato.figliViviAllAvvio,
      agentRole: 'root', strumentiEstesi: ['answer_child_question', 'ask_child', 'delega_sottotask'],
      answerChildQuestionFn: (i) => svegliato.answerChildQuestionFn(i),
      askChildFn: async () => { chieste += 1; return { status: 'requested' }; },
      onDelega: async () => { deleghe += 1; return { esito: 'avviato' }; },
      fetchDiRete: sportello([
        { role: 'assistant', content: '', tool_calls: [
          { id: 'x', function: { name: 'answer_child_question', arguments: JSON.stringify({ childId, requestId, answer: 'v1' }) } },
          { id: 'y', function: { name: 'ask_child', arguments: JSON.stringify({ childId, question: 'altro?' }) } },
          { id: 'z', function: { name: 'delega_sottotask', arguments: JSON.stringify({ task: 'altro' }) } },
        ] },
        FINE,
      ], (b) => { offerti ??= (b.tools ?? []).map((x) => x.function?.name); }) });
  } finally { rimuoviCartellaDiProva(cartella); }
  assert.equal(offerti.includes('answer_child_question'), true, 'in Piano con un figlio vivo si può rispondere');
  assert.equal(offerti.includes('ask_child'), false);
  assert.equal(offerti.includes('delega_sottotask'), false);
  const esiti = risultato.messaggiFinali.filter((m) => m.role === 'tool').map((m) => m.content);
  assert.doesNotMatch(esiti[0], /REFUSED/);
  assert.match(esiti[1], /^REFUSED\./);
  assert.match(esiti[2], /^REFUSED\./);
  assert.equal(chieste, 0);
  assert.equal(deleghe, 0);
  assert.deepEqual(await Promise.race([pending, new Promise((r) => setTimeout(() => r('appeso'), 500))]),
    { status: 'answered', requestId, answer: 'v1' });
  registro.ferma(childId); registro.ferma(parentId);
});

test('D1-PLAN-NO-CHILDREN-NO-ANSWER — in Piano senza figli vivi answer_child_question non è offerto e al dispatch è negato', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-d1-senza-figli-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  for (const figliViviAllAvvio of [false, undefined]) {
    let offerti = null;
    let risposte = 0;
    const r = await talosLavora({ cartella, task: { consegna: 'x' }, modello: 'x', chiave: 'y', modalitaOperativa: 'piano', figliViviAllAvvio,
      strumentiEstesi: ['answer_child_question'], answerChildQuestionFn: async () => { risposte += 1; return { ok: true }; },
      fetchDiRete: sportello([rispostaTool('answer_child_question', { childId: 'c', requestId: 'r', answer: 'a' }), FINE], (b) => { offerti ??= (b.tools ?? []).map((x) => x.function?.name); }) });
    assert.equal(offerti.includes('answer_child_question'), false, String(figliViviAllAvvio));
    assert.match(r.messaggiFinali.find((m) => m.role === 'tool').content, /^REFUSED\./);
    assert.equal(risposte, 0);
  }
});


test('MODE-LEGACY-WORKFLOW-RESTORE — un journal storico con «workflow» si rilegge come Normale, senza riscrivere il file', async () => {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-legacy-workflow-'));
  try {
    const sessionId = 'sess-storica-workflow';
    const file = join(cartellaStore, `${sessionId}.jsonl`);
    const righe = (id) => [
      { tipo: 'intestazione', schema: SCHEMA_SESSIONE, sessionId: id, taskId: 'libero:x', cartella: cartellaStore, task: { consegna: 'vecchia', consegnaCorta: 'vecchia' },
        avviataAlle: '2026-09-20T10:00:00.000Z', modello: 'm', permessi: 'Workspace write', modalitaOperativa: 'workflow' },
      { tipo: 'impostazioni-sessione', modello: 'm', modelloPlanner: null, reasoning: null, permessi: 'Workspace write', modalitaOperativa: 'workflow', permessiPerAttrezzo: null, modelId: 'm' },
      { type: 'RunStarted', threadId: 't1', runId: 'r1', contesto: { modalitaOperativa: 'workflow' }, _sequenza: 1 },
      { type: 'RunFinished', threadId: 't1', runId: 'r1', _sequenza: 2 },
    ];
    const testo = (id) => righe(id).map((r) => JSON.stringify(r)).join('\n') + '\n';
    writeFileSync(file, testo(sessionId));
    writeFileSync(join(cartellaStore, 'sess-storica-2.jsonl'), testo('sess-storica-2'));
    const impronta = () => createHash('sha256').update(readFileSync(file)).digest('hex');
    const prima = impronta();
    const avviati = [];
    const avviaSessioneFn = async (input) => { avviati.push(input); input.onEvento({ type: 'RunStarted', threadId: 't2', runId: 'r2' }); return new Promise(() => {}); };
    const registro = createSessionRegistryReale({ cartellaStore, modello: 'm', chiave: 'k', guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true, avviaSessioneFn });
    await registro.ripristina();
    const voce = registro.elenca().find((s) => s.sessionId === sessionId);
    assert.ok(voce, 'la sessione storica si ripristina');
    assert.equal(voce.modalitaOperativa, 'normale');
    assert.equal(voce.usavaModalitaWorkflow, true);
    assert.equal(registro.esporta(sessionId).eventi.find((e) => e.type === 'RunStarted').contesto.modalitaOperativa, 'workflow', 'la storia si legge come era');
    assert.equal(impronta(), prima, 'il ripristino non riscrive il file');

    assert.deepEqual(await registro.aggiornaImpostazioni(sessionId, { modalitaOperativa: 'piano' }), { ok: true });
    const dopo = registro.elenca().find((s) => s.sessionId === sessionId);
    assert.equal(dopo.modalitaOperativa, 'piano');
    assert.equal(dopo.usavaModalitaWorkflow, false, 'scelto un modo, la fascia sparisce');
    const byte = readFileSync(file, 'utf8');
    assert.ok(byte.startsWith(testo(sessionId)), 'solo righe in coda, mai una riscrittura');
    assert.doesNotMatch(byte.slice(testo(sessionId).length), /"workflow"/, 'nessuna riga nuova emette «workflow»');

    // Una storica mai toccata, ripresa con un messaggio, lavora in Normale.
    const ripresa = registro.resume('sess-storica-2', 'continua');
    assert.equal(ripresa.erroreAvvio, undefined);
    assert.equal(avviati.at(-1).modalitaOperativa, 'normale');
    registro.ferma('sess-storica-2');
    await new Promise((r) => setTimeout(r, 50));

    const riavviato = createSessionRegistryReale({ cartellaStore, modello: 'm', chiave: 'k' });
    await riavviato.ripristina();
    const riletta = riavviato.elenca().find((s) => s.sessionId === sessionId);
    assert.equal(riletta.modalitaOperativa, 'piano');
    assert.equal(riletta.usavaModalitaWorkflow, false);
  } finally {
    await new Promise((r) => setTimeout(r, 50));
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('D1-GRANDCHILD-INHERITS-FROM-ROOT — radice in Piano ⇒ anche la nipote (madre in Normale) è sotto il cancello', async (t) => {
  const { registro, run, concludi } = registroConFigli();
  const { sessionId: rootId } = registro.avvia('task-vero');
  await new Promise((r) => setImmediate(r));
  const figlia = await run[0].input.onDelega('indaga', '/tmp/figlio');
  concludi(0);
  const nipote = await run[1].input.onDelega('sotto-indagine', '/tmp/figlio');
  assert.equal(nipote.esito, 'avviato', JSON.stringify(nipote));
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(await registro.aggiornaImpostazioni(rootId, { modalitaOperativa: 'piano' }), { ok: true });
  const cartella = mkdtempSync(join(tmpdir(), 'talos-d1-nipote-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const r = await giroDelFiglio(run[2].input, cartella, [rispostaTool('scrivi', { percorso: 'nipote.txt', contenuto: 'x' }), FINE]);
  assert.match(r.messaggiFinali.find((m) => m.role === 'tool').content, /Plan mode is active/);
  assert.equal(existsSync(join(cartella, 'nipote.txt')), false);
  registro.ferma(nipote.childId); registro.ferma(figlia.childId); registro.ferma(rootId);
});

test('D1-CHILD-MODE-READER-FAILS-CLOSED — un lettore del modo che lancia o risponde un valore ignoto nega come Piano', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-d1-lettore-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  for (const [caso, lettore] of [['lancia', () => { throw new Error('padre sparito'); }], ['ignoto', () => 'workflow'], ['vuoto', () => undefined]]) {
    const r = await talosLavora({ cartella, task: { consegna: 'x' }, modello: 'x', chiave: 'y', agentRole: 'child', modalitaOperativa: 'normale',
      modalitaOperativaCorrenteFn: lettore, permessiPerAttrezzo: { scrivi: 'sempre' },
      fetchDiRete: sportello([rispostaTool('scrivi', { percorso: `${caso}.txt`, contenuto: 'x' }), FINE]) });
    assert.match(r.messaggiFinali.find((m) => m.role === 'tool').content, /Plan mode is active/, caso);
    assert.equal(existsSync(join(cartella, `${caso}.txt`)), false, caso);
  }
  // Controllo: lo stesso giro con un lettore che dice «normale» scrive davvero.
  const ok = await talosLavora({ cartella, task: { consegna: 'x' }, modello: 'x', chiave: 'y', agentRole: 'child', modalitaOperativa: 'normale',
    modalitaOperativaCorrenteFn: () => 'normale', permessiPerAttrezzo: { scrivi: 'sempre' },
    fetchDiRete: sportello([rispostaTool('scrivi', { percorso: 'controllo.txt', contenuto: 'x' }), FINE]) });
  assert.doesNotMatch(ok.messaggiFinali.find((m) => m.role === 'tool').content, /REFUSED|Plan mode/);
  assert.equal(existsSync(join(cartella, 'controllo.txt')), true);
});

/*
 * ⛔ 24/09/2026 — decisioni owner 29, 30 e 32 (AskUserQuestion del 24/09 pomeriggio):
 *   32: «perché conta» obbligatorio per ogni domanda del MODELLO e al più un'opzione consigliata, per prima;
 *   29: la domanda sopravvive a un riavvio ⇒ il kernel consegna al registro la storia del giro nel momento della domanda;
 *   30: dove nessuna interfaccia può rispondere, l'attrezzo risponde subito «procedi con l'ipotesi più prudente e DICHIARALA».
 */
const DOMANDA_CON_PERCHE = {
  id: 'scelta',
  question: 'Quale strada?',
  why: 'Decide quale file cambia per primo.',
  options: [
    { label: 'A', description: 'Prima strada' },
    { label: 'B', description: 'Seconda strada', recommended: true },
  ],
};

test('ASK-WHY-REQUIRED-AT-MODEL-DOOR: senza «why» il modello è respinto prima di disturbare la persona', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-ask-why-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  let interpellata = 0;
  const risultato = await talosLavora({
    cartella, task: { consegna: 'chiedi una scelta' }, modello: 'x', chiave: 'y',
    strumentiEstesi: ['ask_user_question'],
    chiediDomandaFn: async () => { interpellata += 1; return { status: 'skipped' }; },
    fetchDiRete: sportello([
      rispostaTool('ask_user_question', { questions: [{ id: 'scelta', question: 'Quale strada?' }] }),
      FINE,
    ]),
  });
  assert.equal(interpellata, 0);
  const tool = risultato.messaggiFinali.find((m) => m.role === 'tool');
  assert.match(tool.content, /ask_user_question failed \[QUERY_INVALID\].*why/u);
});

test('ASK-TOOL-SCHEMA-WHY-RECOMMENDED: lo schema offerto al modello chiede «why» e conosce la consigliata', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-ask-schema-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  let offerto = null;
  await talosLavora({
    cartella, task: { consegna: 'chiedi' }, modello: 'x', chiave: 'y',
    strumentiEstesi: ['ask_user_question'],
    chiediDomandaFn: async () => ({ status: 'skipped' }),
    fetchDiRete: sportello([FINE], (body) => {
      offerto ??= (body.tools ?? []).find((tool) => tool.function?.name === 'ask_user_question')?.function;
    }),
  });
  const item = offerto.parameters.properties.questions.items;
  assert.deepEqual(item.required, ['id', 'question', 'why']);
  assert.equal(item.properties.why.type, 'string');
  assert.equal(item.properties.options.items.properties.recommended.type, 'boolean');
  assert.match(offerto.description, /first/u);
});

test('ASK-CONTEXT-FOR-RESUME: il registro riceve la storia del giro fino alla chiamata della domanda, e l\'id della chiamata', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-ask-contesto-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  let contesto = null;
  let domande = null;
  await talosLavora({
    cartella, task: { consegna: 'chiedi una scelta' }, modello: 'x', chiave: 'y',
    strumentiEstesi: ['ask_user_question'],
    chiediDomandaFn: async (questions, ctx) => { domande = questions; contesto = ctx; return { status: 'answered', answers: { scelta: 'B' } }; },
    fetchDiRete: sportello([rispostaTool('ask_user_question', { questions: [DOMANDA_CON_PERCHE] }, 'call_ask'), FINE]),
  });
  assert.equal(domande[0].options[0].label, 'B', 'la consigliata arriva per prima');
  assert.equal(contesto?.toolCallId, 'call_ask');
  const ultimo = contesto.messaggi.at(-1);
  assert.equal(ultimo.role, 'assistant');
  assert.equal(ultimo.tool_calls[0].id, 'call_ask');
  assert.equal(contesto.messaggi.some((m) => m.role === 'user' && JSON.stringify(m.content).includes('chiedi una scelta')), true);
});

test('ASK-NO-LISTENER-DECLARES-ASSUMPTION: senza interfaccia l\'attrezzo chiede di procedere con l\'ipotesi più prudente e di dichiararla', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-ask-nessuno-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const risultato = await talosLavora({
    cartella, task: { consegna: 'chiedi una scelta' }, modello: 'x', chiave: 'y',
    strumentiEstesi: ['ask_user_question'],
    fetchDiRete: sportello([rispostaTool('ask_user_question', { questions: [DOMANDA_CON_PERCHE] }), FINE]),
  });
  const tool = risultato.messaggiFinali.find((m) => m.role === 'tool');
  const esito = JSON.parse(tool.content);
  assert.equal(esito.status, 'unanswerable');
  assert.match(esito.instruction, /most prudent assumption/u);
  assert.match(esito.instruction, /state/u);
  assert.equal(risultato.messaggiFinali.at(-1).content, 'fatto', 'il giro prosegue');
});

/*
 * ⛔ 24/09/2026 — PIANO vincolante (fetta F3-30), decisioni owner 2, 3, 36-39 (memoria `decisioni-owner-f3-workflow-plan-ask-23-09.md`):
 *   36: il piano si presenta con un ATTREZZO («presenta il piano», come ExitPlanMode di Claude Code); il giro si ferma sulla scheda
 *       e dopo la scelta LO STESSO GIRO prosegue;
 *   37: le quattro scelte come Claude Code (procedi chiedendo conferma / accettando le modifiche / conversazione pulita / continua a
 *       pianificare), il permesso scelto resta alla sessione;
 *   38: il piano approvato resta nella conversazione come esito dell'attrezzo.
 * Ricerca: `.claude/RICERCA-10x4-WORKFLOW-PLAN-ASK-2026-09-23.md` (Q1, Q2; D1 Claude Code ExitPlanMode, Gemini exit_plan_mode,
 * OpenCode plan_exit, Kilo, Codex plan_implementation).
 */
const PIANO_MD = '## Piano\n1. Leggo `a.txt`.\n2. Scrivo `b.txt` con il riassunto.';

test('PLAN-TOOL-OFFERED-ONLY-IN-PIANO: «present_plan» si offre al root solo in Piano', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-plan-offerto-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const offerti = {};
  for (const [modalitaOperativa, agentRole] of [['piano', 'root'], ['normale', 'root'], ['piano', 'child']]) {
    await talosLavora({ cartella, task: { consegna: 'pianifica' }, modello: 'x', chiave: 'y', modalitaOperativa, agentRole,
      strumentiEstesi: ['present_plan', 'ask_user_question', 'ask_parent'], presentaPianoFn: async () => ({ decisione: 'continua-a-pianificare' }),
      fetchDiRete: sportello([FINE], (body) => { offerti[modalitaOperativa + '-' + agentRole] ??= (body.tools ?? []).map((tl) => tl.function?.name); }) });
  }
  assert.equal(offerti['piano-root'].includes('present_plan'), true);
  assert.equal(offerti['normale-root'].includes('present_plan'), false);
  assert.equal(offerti['piano-child'].includes('present_plan'), false);
});

test('PLAN-APPROVE-CONTINUES-TURN: dopo «procedi accettando le modifiche» lo STESSO giro esce dal Piano e scrive', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-plan-procedi-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const offertiPerChiamata = [];
  let ricevuto = null;
  const risultato = await talosLavora({ cartella, task: { consegna: 'pianifica e poi scrivi' }, modello: 'x', chiave: 'y',
    modalitaOperativa: 'piano', strumentiEstesi: ['present_plan'],
    presentaPianoFn: async (argomenti) => { ricevuto = argomenti; return { decisione: 'procedi-accetta-modifiche', revision: 1, hash: 'sha256:abc', livelloAccesso: undefined }; },
    fetchDiRete: sportello([
      rispostaTool('present_plan', { plan: PIANO_MD }, 'call_piano'),
      rispostaTool('scrivi', { percorso: 'b.txt', contenuto: 'fatto' }, 'call_scrivi'),
      FINE,
    ], (body) => offertiPerChiamata.push((body.tools ?? []).map((tl) => tl.function?.name))),
  });
  assert.equal(ricevuto.plan, PIANO_MD);
  assert.equal(ricevuto.toolCallId, 'call_piano');
  assert.equal(ricevuto.messaggi.at(-1).tool_calls[0].id, 'call_piano', 'la storia fino alla presentazione, per la ripresa dopo un riavvio');
  assert.equal(offertiPerChiamata[0].includes('scrivi'), false, 'prima del sì il Piano non offre scritture');
  assert.equal(offertiPerChiamata[1].includes('scrivi'), true, 'dopo il sì lo stesso giro offre gli attrezzi di Normale');
  assert.equal(existsSync(join(cartella, 'b.txt')), true, 'la scrittura dopo il sì passa il cancello');
  const esitoPiano = risultato.messaggiFinali.find((m) => m.role === 'tool' && m.tool_call_id === 'call_piano');
  assert.match(esitoPiano.content, /approved/u);
  assert.match(esitoPiano.content, /revision 1/u);
  const secondaChiamata = risultato.messaggiFinali.find((m) => m.role === 'system' && /Plan mode is on/u.test(m.content ?? ''));
  assert.equal(secondaChiamata, undefined, 'l’istruzione del Piano non resta nella storia');
});

test('PLAN-CONTINUE-PLANNING: «continua a pianificare» resta in Piano e porta al modello la correzione', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-plan-continua-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const offertiPerChiamata = [];
  const risultato = await talosLavora({ cartella, task: { consegna: 'pianifica' }, modello: 'x', chiave: 'y',
    modalitaOperativa: 'piano', strumentiEstesi: ['present_plan'],
    presentaPianoFn: async () => ({ decisione: 'continua-a-pianificare', feedback: 'Aggiungi i test prima della scrittura.', revision: 1 }),
    fetchDiRete: sportello([rispostaTool('present_plan', { plan: PIANO_MD }, 'call_piano'), FINE],
      (body) => offertiPerChiamata.push((body.tools ?? []).map((tl) => tl.function?.name))),
  });
  assert.equal(offertiPerChiamata[1].includes('scrivi'), false, 'resta in Piano');
  const esito = risultato.messaggiFinali.find((m) => m.role === 'tool' && m.tool_call_id === 'call_piano');
  assert.match(esito.content, /Aggiungi i test prima della scrittura\./u);
  assert.match(esito.content, /present_plan again/u);
});

test('PLAN-PRESENT-INVALID: un piano vuoto è respinto prima della scheda', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-plan-vuoto-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  let chiamato = 0;
  const risultato = await talosLavora({ cartella, task: { consegna: 'pianifica' }, modello: 'x', chiave: 'y',
    modalitaOperativa: 'piano', strumentiEstesi: ['present_plan'], presentaPianoFn: async () => { chiamato += 1; return {}; },
    fetchDiRete: sportello([rispostaTool('present_plan', { plan: '   ' }, 'call_piano'), FINE]) });
  assert.equal(chiamato, 0);
  assert.match(risultato.messaggiFinali.find((m) => m.role === 'tool').content, /present_plan failed \[QUERY_INVALID\]/u);
});

/*
 * ⭐ 27/09/2026, decisione owner 46 — la forma VERA che glm-5.3-flash ha mandato nella sessione 56066b64: un `id` dentro ogni
 *   opzione. Prima: «ask_user_question failed [QUERY_INVALID]: … campi non riconosciuti» e una riprova. Ora arriva pulita.
 */
test('DOMANDA-CAMPI-IN-PIU — il kernel ripulisce i campi in più del modello e lo schema li dichiara vietati; «why» resta obbligatorio', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-user-question-extra-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const ricevute = [];
  let schema = null;
  const risultato = await talosLavora({
    cartella,
    task: { consegna: 'chiedi una scelta' },
    modello: 'x',
    chiave: 'y',
    strumentiEstesi: ['ask_user_question'],
    chiediDomandaFn: async (questions) => { ricevute.push(questions); return { status: 'answered', answers: { features: 'Economia' } }; },
    fetchDiRete: sportello([
      rispostaTool('ask_user_question', {
        questions: [{
          id: 'features', question: 'Che cosa aggiungo?', why: 'Decide che cosa costruisco per primo.',
          options: [
            { id: 'u1', label: 'Economia', description: 'Un idle-game completo', recommended: true },
            { id: 'u2', label: 'Terminale', description: 'Un terminale finto' },
          ],
        }],
      }),
      rispostaTool('ask_user_question', { questions: [{ id: 'senza', question: 'E questa?', options: [{ label: 'A', description: 'a' }, { label: 'B', description: 'b' }] }] }, 'call_2'),
      FINE,
    ], (body) => { schema ??= body.tools?.find((s) => s.function?.name === 'ask_user_question')?.function?.parameters ?? null; }),
  });
  assert.equal(ricevute.length, 1, 'la domanda coi campi in più arriva alla persona; quella senza «why» no');
  assert.deepEqual(ricevute[0][0].options.map((o) => Object.keys(o).sort()), [['description', 'label', 'recommended'], ['description', 'label']]);
  const esiti = risultato.messaggiFinali.filter((m) => m.role === 'tool').map((m) => m.content);
  assert.match(esiti[0], /"status":"answered"/u);
  assert.match(esiti[1], /ask_user_question failed \[QUERY_INVALID\]: questions\[0\]\.why is required/u);
  // lo schema che il modello riceve dice «nient'altro» a ogni livello
  assert.equal(schema?.additionalProperties, false);
  assert.equal(schema?.properties?.questions?.items?.additionalProperties, false);
  assert.equal(schema?.properties?.questions?.items?.properties?.options?.items?.additionalProperties, false);
});

test('DOMANDA-CAMPI-IN-PIU-SENZA-INTERFACCIA — anche senza chi risponde il kernel ripulisce i campi in più; «why» resta obbligatorio', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-user-question-extra-headless-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const risultato = await talosLavora({
    cartella,
    task: { consegna: 'chiedi una scelta' },
    modello: 'x',
    chiave: 'y',
    strumentiEstesi: ['ask_user_question'],
    fetchDiRete: sportello([
      rispostaTool('ask_user_question', { questions: [{ id: 'features', question: 'Che cosa aggiungo?', why: 'Decide il primo passo.', extra: 1,
        options: [{ id: 'u1', label: 'Economia', description: 'Un idle-game' }, { id: 'u2', label: 'Terminale', description: 'Un terminale finto' }] }] }),
      rispostaTool('ask_user_question', { questions: [{ id: 'senza', question: 'E questa?', options: [{ label: 'A', description: 'a' }, { label: 'B', description: 'b' }] }] }, 'call_2'),
      FINE,
    ]),
  });
  const esiti = risultato.messaggiFinali.filter((m) => m.role === 'tool').map((m) => m.content);
  assert.doesNotMatch(esiti[0], /QUERY_INVALID/u, 'i campi in più non respingono la domanda');
  assert.match(esiti[1], /ask_user_question failed \[QUERY_INVALID\]: questions\[0\]\.why is required/u);
});
