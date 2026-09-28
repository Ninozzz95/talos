/*
 * ⭐⭐⭐ F3-11a (24/09/2026 sera) — il compilatore della bozza del Workflow. Ledger: `.claude/LEDGER-F3-11A-BOZZA-2026-09-24.md`.
 * Decisioni dell'owner: 40 (bozza corta), 1 e 14 (sola lettura, scrittori respinti), 41 (passo umano respinto), 15 (tetti
 * prudenti e visibili), 42 (modello della sessione, eccezioni verificate).
 * Ogni rifiuto ha il suo verso contrario: la bozza giusta compila, passa il validatore del Core v2 e il preflight.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { validateWorkflowDefinitionCore } from '../src/workflow/contract.mjs';
import { compileWorkflowDraft, DRAFT_POLICY, WORKFLOW_DRAFT_INPUT_SCHEMA, WorkflowDraftError } from '../src/workflow/draft-compiler.mjs';

function bozza(overrides = {}) {
  return {
    title: 'Analisi del modulo di ricerca',
    objective: 'Capire come funziona la ricerca approfondita e dove può rompersi.',
    phases: [{ id: 'lettura', label: 'Lettura' }, { id: 'sintesi', label: 'Sintesi' }],
    nodes: [
      { id: 'leggi-store', phase: 'lettura', label: 'Leggi il negozio', task: 'Leggi research-store.mjs e riassumi i file che scrive.' },
      { id: 'leggi-orchestratore', phase: 'lettura', label: 'Leggi l’orchestratore', task: 'Leggi research-orchestrator.mjs.' },
      { id: 'sintesi', phase: 'sintesi', label: 'Sintesi', task: 'Unisci le due letture in un rapporto.', dependsOn: ['leggi-store', 'leggi-orchestratore'] },
    ],
    ...overrides,
  };
}
const rifiuta = (d, code, testo, context) => assert.throws(() => compileWorkflowDraft(d, context), (errore) => {
  assert.ok(errore instanceof WorkflowDraftError, `atteso WorkflowDraftError, arrivato ${errore}`);
  assert.equal(errore.code, code, errore.message);
  if (testo) assert.match(errore.message, testo);
  return true;
});

test('WF-DRAFT-COMPILES: la bozza giusta diventa un Core v2 a fasi che passa validatore e preflight', () => {
  const { core, definitionHash, preflight } = compileWorkflowDraft(bozza());
  assert.equal(core.schema, 'talos.workflow-definition-core.v2');
  assert.doesNotThrow(() => validateWorkflowDefinitionCore(core));
  assert.deepEqual(preflight.errors, []);
  assert.match(definitionHash, /^sha256:[0-9a-f]{64}$/u);
  assert.deepEqual(core.phases, [{ id: 'lettura', label: 'Lettura' }, { id: 'sintesi', label: 'Sintesi' }]);
  assert.deepEqual(core.edges.map((e) => [e.id, e.from, e.to, e.type]), [
    ['leggi-store.sintesi', 'leggi-store', 'sintesi', 'control'], ['leggi-orchestratore.sintesi', 'leggi-orchestratore', 'sintesi', 'control'],
  ]);
  assert.equal(core.nodes[2].instructions, 'Unisci le due letture in un rapporto.');
});

test('WF-DRAFT-DETERMINISTIC: la stessa bozza dà gli stessi byte e la stessa impronta; una bozza diversa no', () => {
  const a = compileWorkflowDraft(bozza());
  const b = compileWorkflowDraft(structuredClone(bozza()));
  assert.equal(a.definitionHash, b.definitionHash);
  assert.deepEqual(a.core, b.core);
  assert.notEqual(compileWorkflowDraft(bozza({ title: 'Un altro titolo' })).definitionHash, a.definitionHash);
});

test('WF-DRAFT-READ-ONLY-BY-CONSTRUCTION: ogni nodo è un agente in sola lettura, nessuna mutazione, nessun passo umano', () => {
  const { core } = compileWorkflowDraft(bozza());
  for (const node of core.nodes) {
    assert.equal(node.kind, 'agent');
    assert.equal(node.capabilityProfile, 'read');
    assert.equal(node.workspacePolicy.mode, 'shared-read');
    assert.deepEqual(node.writeSetHint, []);
  }
  assert.equal(core.policy.capabilityCeiling, 'read');
  assert.equal(core.policy.graphMutation.mode, 'forbidden');
  assert.equal(core.policy.human.maxPending, 0);
});

test('WF-DRAFT-POLICY-DEFAULTS-VISIBLE: i tetti del nodo e del run sono quelli dichiarati in DRAFT_POLICY', () => {
  const { core } = compileWorkflowDraft(bozza());
  const { attempts, ...perNodo } = DRAFT_POLICY.nodeBudget;
  for (const node of core.nodes) assert.deepEqual(node.budget, { ...perNodo, attempts });
  // F3-41a, owner 25/09 «Budget pieno a ogni tentativo»: il run conta tutti i tentativi di ogni passo, sotto i tetti assoluti
  assert.equal(core.budgets.promptTokens, Math.min(perNodo.promptTokens * 3 * attempts, DRAFT_POLICY.runBudgetCap.promptTokens));
  assert.equal(core.budgets.completionTokens, Math.min(perNodo.completionTokens * 3 * attempts, DRAFT_POLICY.runBudgetCap.completionTokens));
  assert.equal(core.budgets.wallMs, Math.min(perNodo.wallMs * 3 * attempts, DRAFT_POLICY.runBudgetCap.wallMs));
  assert.equal(core.limits.maxAgentSessions, 3);
  assert.equal(core.budgets.knownCostUsd, null, 'un costo non dichiarato resta null, non zero');
});

test('WF-DRAFT-WRITER-REJECTED: un passo che scrive si respinge con motivo (decisione 14)', () => {
  const d = bozza();
  d.nodes[2].access = 'write';
  rifiuta(d, 'WORKFLOW_DRAFT_WRITER', /read-only in this version/u);
});

test('WF-DRAFT-APPROVAL-NODE-NOT-ASK: un nodo «approval» si respinge, non diventa una domanda né un passo umano (decisione 41)', () => {
  const d = bozza();
  d.nodes[2].type = 'approval';
  rifiuta(d, 'WORKFLOW_DRAFT_HUMAN_STEP', /cannot stop halfway to ask the person/u);
});

test('WF-DRAFT-UNSUPPORTED-KIND: un nodo che dichiara un altro tipo si respinge', () => {
  const d = bozza();
  d.nodes[0].kind = 'fanout';
  rifiuta(d, 'WORKFLOW_DRAFT_UNSUPPORTED_KIND', /Only plain steps/u);
});

test('WF-DRAFT-CYCLE: due passi che si aspettano a vicenda si respingono, col percorso', () => {
  const d = bozza();
  d.nodes[0].dependsOn = ['leggi-orchestratore'];
  d.nodes[1].dependsOn = ['leggi-store'];
  rifiuta(d, 'WORKFLOW_DRAFT_CYCLE', /leggi-store → leggi-orchestratore → leggi-store|leggi-orchestratore → leggi-store → leggi-orchestratore/u);
  const se = bozza();
  se.nodes[2].dependsOn = ['sintesi'];
  rifiuta(se, 'WORKFLOW_DRAFT_CYCLE', /depends on itself/u);
});

test('WF-DRAFT-DISCONNECTED: un passo scollegato si respinge, e il motivo lo nomina', () => {
  const d = bozza();
  d.nodes[2].dependsOn = ['leggi-store'];
  rifiuta(d, 'WORKFLOW_DRAFT_DISCONNECTED', /leggi-orchestratore/u);
});

test('WF-DRAFT-UNDECLARED-DEP: una dipendenza verso un passo che non c’è si respinge', () => {
  const d = bozza();
  d.nodes[2].dependsOn = ['leggi-store', 'fantasma'];
  rifiuta(d, 'WORKFLOW_DRAFT_UNDECLARED_DEP', /fantasma/u);
});

test('WF-DRAFT-PHASE-ORDER: un passo non può aspettare un passo di una fase successiva', () => {
  const d = bozza();
  d.nodes[0].dependsOn = ['sintesi'];
  d.nodes[2].dependsOn = ['leggi-orchestratore'];
  rifiuta(d, 'WORKFLOW_DRAFT_PHASE_ORDER', /later phase/u);
});

test('WF-DRAFT-DUPLICATE-ID: id doppi di passi o di fasi si respingono', () => {
  const d = bozza();
  d.nodes[1].id = 'leggi-store';
  rifiuta(d, 'WORKFLOW_DRAFT_DUPLICATE_ID', /used twice/u);
  const f = bozza({ phases: [{ id: 'lettura', label: 'A' }, { id: 'lettura', label: 'B' }] });
  rifiuta(f, 'WORKFLOW_DRAFT_DUPLICATE_ID', /used twice/u);
});

test('WF-DRAFT-EMPTY-PHASE: una fase senza passi si respinge (il Core non ammette fasi vuote)', () => {
  const d = bozza({ phases: [...bozza().phases, { id: 'verifica', label: 'Verifica' }] });
  rifiuta(d, 'WORKFLOW_DRAFT_EMPTY_PHASE', /verifica/u);
});

test('WF-DRAFT-BOUNDS: fasi, passi, dipendenze e testi hanno un tetto', () => {
  const troppe = bozza({ phases: Array.from({ length: DRAFT_POLICY.bounds.maxPhases + 1 }, (_, i) => ({ id: `f${i}`, label: `F${i}` })) });
  rifiuta(troppe, 'WORKFLOW_DRAFT_BOUNDS', /at most 12/u);
  const tanti = bozza({ nodes: Array.from({ length: DRAFT_POLICY.bounds.maxNodes + 1 }, (_, i) => ({ id: `n${i}`, phase: 'lettura', label: `N${i}`, task: 'x' })) });
  rifiuta(tanti, 'WORKFLOW_DRAFT_BOUNDS', /at most 50/u);
  const lungo = bozza();
  lungo.nodes[0].task = 'x'.repeat(DRAFT_POLICY.bounds.taskMax + 1);
  rifiuta(lungo, 'WORKFLOW_DRAFT_BOUNDS', /too long/u);
  const idPunto = bozza();
  idPunto.nodes[0].id = 'leggi.store';
  rifiuta(idPunto, 'WORKFLOW_DRAFT_INVALID', /letters, digits/u);
});

test('WF-DRAFT-MODEL-AVAILABLE: un modello per nodo passa solo se è fra i disponibili (decisione 42)', () => {
  const d = bozza();
  d.nodes[0].model = 'z-ai/glm-5.3-flash';
  const ok = compileWorkflowDraft(d, { availableModelIds: ['z-ai/glm-5.3-flash', 'google/gemini-3.8-flash'] });
  assert.deepEqual(ok.core.nodes[0].modelPolicy, { mode: 'explicit', model: 'z-ai/glm-5.3-flash', reasoning: null });
  assert.deepEqual(ok.core.nodes[1].modelPolicy, { mode: 'inherit', model: null, reasoning: null }, 'senza model eredita la sessione');
  rifiuta(d, 'WORKFLOW_DRAFT_MODEL_UNAVAILABLE', /not available/u, { availableModelIds: ['google/gemini-3.8-flash'] });
  rifiuta(d, 'WORKFLOW_DRAFT_MODEL_UNAVAILABLE', /not known/u, {});
});

test('WF-DRAFT-GLM-REAL-CASE: gli argomenti del GLM del 23/09 si respingono dicendo il campo giusto; corretti, compilano', () => {
  // Chiavi viste il 23/09 (harness-ui/docs/WF-GLM-LIVE-TOOL-SCHEMA-RED-2026-09-23.md): nodi `id, name, next, phaseId, prompt, title, type`.
  const glm = bozza();
  glm.nodes = [
    { id: 'n1', name: 'Leggi', phaseId: 'lettura', prompt: 'Leggi research-store.mjs', next: ['n2'] },
    { id: 'n2', name: 'Sintesi', phaseId: 'sintesi', prompt: 'Riassumi' },
  ];
  rifiuta(glm, 'WORKFLOW_DRAFT_INVALID', /Did you mean "label"\?/u);
  const approvazione = bozza();
  approvazione.nodes[2] = { id: 'ok', title: 'Approva', type: 'approval', phaseId: 'sintesi', prompt: 'Chiedi conferma' };
  rifiuta(approvazione, 'WORKFLOW_DRAFT_HUMAN_STEP', /human approval step/u);
  const corretto = bozza({
    nodes: [
      { id: 'n1', label: 'Leggi', phase: 'lettura', task: 'Leggi research-store.mjs' },
      { id: 'n2', label: 'Sintesi', phase: 'sintesi', task: 'Riassumi', dependsOn: ['n1'] },
    ],
  });
  assert.doesNotThrow(() => compileWorkflowDraft(corretto));
});

test('WF-DRAFT-SCHEMA-DESCRIBED: lo schema per il modello descrive ogni campo e richiede fasi e passi con id', () => {
  const s = WORKFLOW_DRAFT_INPUT_SCHEMA;
  assert.equal(s.properties.phases.items.properties.id.type, 'string');
  assert.equal(s.properties.nodes.items.properties.id.type, 'string');
  assert.deepEqual(s.required, ['title', 'objective', 'phases', 'nodes']);
  const descritti = (props) => Object.values(props).every((p) => typeof p.description === 'string' && p.description.length > 0);
  assert.ok(descritti(s.properties.nodes.items.properties) && descritti(s.properties.phases.items.properties));
  assert.ok(Object.isFrozen(s.properties.nodes.items.properties.task), 'lo schema non si cambia a runtime');
});

/*
 * 25/09/2026, decisione owner D28: il ruolo del passo, facoltativo, arriva nella Definition (prima `role: null` a ogni passo,
 * `draft-compiler.mjs:260`) e darà l'icona della fase. Fuori dai sei del contratto si RESPINGE con l'elenco (il compilatore
 * fallisce chiuso, righe 15-16), mai indovinato.
 */
test('WF-DRAFT-ROLE: an optional role reaches the Definition; outside the six it is rejected with the list; absent stays null', () => {
  const conRuoli = bozza();
  conRuoli.nodes[0].role = 'researcher';
  conRuoli.nodes[2].role = 'reviewer';
  const { core } = compileWorkflowDraft(conRuoli);
  assert.deepEqual(core.nodes.map((n) => [n.id, n.role]), [['leggi-store', 'researcher'], ['leggi-orchestratore', null], ['sintesi', 'reviewer']]);
  assert.doesNotThrow(() => validateWorkflowDefinitionCore(core));
  const sbagliata = bozza();
  sbagliata.nodes[1].role = 'writer';
  rifiuta(sbagliata, 'WORKFLOW_DRAFT_INVALID', /role must be one of: coordinator, researcher, implementer, reviewer, integrator, tester/u);
  const maiuscola = bozza();
  maiuscola.nodes[1].role = 'Researcher';
  rifiuta(maiuscola, 'WORKFLOW_DRAFT_INVALID', /role must be one of/u);
  // il ruolo cambia la Definition, quindi l'impronta (una bozza con i ruoli è un'altra proposta)
  assert.notEqual(compileWorkflowDraft(conRuoli).definitionHash, compileWorkflowDraft(bozza()).definitionHash);
  assert.deepEqual(WORKFLOW_DRAFT_INPUT_SCHEMA.properties.nodes.items.properties.role.enum,
    ['coordinator', 'researcher', 'implementer', 'reviewer', 'integrator', 'tester']);
});
