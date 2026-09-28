/*
 * TALOS Graph Engineering R4 — fixture SOLO di laboratorio.
 * Inserite da ChatGPT / GPT-5.6 Sol su istruzione Owner, 22/09/2026.
 *
 * Nessun dato qui è runtime reale. Le fixture servono esclusivamente al mockup
 * owner-gated. Il grafo usa il renderer production `montaGrafoAgenti()`; per
 * 5.000 agenti logici la fixture fornisce una proiezione bounded dichiarata,
 * non 5.000 card DOM.
 */

export const R4_SCALE = Object.freeze({
  tiny: 3,
  medium: 30,
  large: 300,
  massive: 5000,
});

export const R4_RAIL_VARIANTS = Object.freeze([
  'status-first',
  'group-first',
  'hybrid',
]);

export const R4_PRIMARY_SCENES = Object.freeze([
  'baseline-chat',
  'plan-proposed',
  'plan-error',
  'plan-approved',
  'ask-single',
  'ask-multi-review',
  'ask-resolved-receipt',
  'rail-current-3',
  'rail-status-first-300',
  'rail-group-first-300',
  'rail-hybrid-300',
  'workflow-graph-14',
  'workflow-graph-200',
  'workflow-graph-5000',
]);

export const R4_ALL_SCENES = Object.freeze([
  ...R4_PRIMARY_SCENES,
  'plan-expanded',
  'plan-warning',
  'plan-revised',
  'ask-multi',
  'ask-submitting',
  'ask-error-retry',
  'ask-stale',
  'ask-resolved-other-window',
  'ask-after-reload',
  'rail-status-first-30',
  'rail-group-first-30',
  'rail-hybrid-30',
  'rail-status-first-5000',
  'rail-group-first-5000',
  'rail-hybrid-5000',
  'workflow-graph-pending-question',
  'workflow-graph-error',
  'workflow-graph-disconnected',
  'workflow-graph-resync',
  'workflow-graph-reload',
  'keyboard',
  'reduced-motion',
  'long-labels',
  '200-percent-reflow',
]);

const START = Date.parse('2026-09-22T08:00:00Z');
const ROLES = ['Ricerca', 'Implementazione', 'Verifica', 'Integrazione', 'Test', 'Documentazione'];
const MODELS = ['glm-5.3-flash', 'claude-sonnet-5', 'gpt-5.6', 'qwen3.8-flash'];

function iso(minute) {
  return new Date(START + minute * 60_000).toISOString();
}

function stateFor(index, total) {
  if (index === 0) return 'active';
  if (index % 29 === 0) return 'error';
  if (index % 17 === 0) return 'waiting';
  if (index < Math.max(2, Math.floor(total * 0.18))) return 'active';
  return 'done';
}

function agentFrom(index, total, { parent = 'r4-root', labelPrefix = 'Agente', group = null } = {}) {
  const state = stateFor(index, total);
  const role = ROLES[index % ROLES.length];
  const id = `r4-agent-${index}`;
  const file = `src/r4/${role.toLocaleLowerCase('it-IT')}-${String(index).padStart(3, '0')}.mjs`;
  return {
    sessionId: id,
    padreId: parent,
    taskCorto: group ? `${group} · ${labelPrefix} ${index}` : `${labelPrefix} ${index} · ${role}`,
    task: `Fixture R4: ${role}. Scenario visuale dichiarato per validare densità, stato e drill-down.`,
    conclusa: state === 'done' || state === 'error',
    interrotta: false,
    ultimoEsito: state === 'error' ? 'errore' : state === 'done' ? 'ok' : null,
    approvalPendingCount: state === 'waiting' ? 1 : 0,
    avviataAlle: iso(index),
    modello: MODELS[index % MODELS.length],
    permessi: index % 3 === 0 ? 'workspace-write' : 'read-only',
    numeroFigli: 0,
    attivita: {
      chiamate: 2 + (index % 11),
      attrezzoCorrente: state === 'active' ? ['leggi', 'shell', 'cerca_web'][index % 3] : null,
      file: [{ percorso: file, letto: true, scritto: index % 3 === 0, creato: index % 13 === 0 }],
      fileTagliati: 0,
      passi: [
        { tipo: 'avvio', quando: iso(index), attrezzo: null, percorso: null },
        ...(state === 'active'
          ? [{ tipo: 'attrezzo', quando: iso(index + 1), attrezzo: 'leggi', percorso: file }]
          : [{ tipo: state === 'error' ? 'errore' : 'fine', quando: iso(index + 2), attrezzo: null, percorso: null }]),
      ],
      passiTagliati: 0,
    },
  };
}

export function makeGraphFixture(logicalCount, { proxyCount = null, error = '', updatedAt = iso(180) } = {}) {
  const bounded = Number.isInteger(proxyCount) && proxyCount > 0 && proxyCount < logicalCount;
  const visibleCount = bounded ? proxyCount : Math.max(1, logicalCount - 1);
  const root = {
    sessionId: 'r4-root',
    nome: 'Workflow R4 · Coordinamento',
    taskCorto: 'Workflow R4 · Coordinamento',
    task: 'Fixture di laboratorio. Coordina le attività mostrate nel mockup R4.',
    conclusa: false,
    avviataAlle: iso(0),
    modello: 'gpt-5.6',
    attivita: {
      chiamate: 18,
      attrezzoCorrente: 'delega_sottotask',
      file: [{ percorso: 'docs/r4-plan.md', letto: true, scritto: false, creato: false }],
      fileTagliati: 0,
      passi: [{ tipo: 'avvio', quando: iso(0), attrezzo: null, percorso: null }],
      passiTagliati: 0,
    },
  };
  const children = [];
  if (bounded) {
    const groups = Math.min(visibleCount, 48);
    const perGroup = Math.ceil((logicalCount - 1) / groups);
    for (let i = 1; i <= groups; i += 1) {
      const from = 1 + (i - 1) * perGroup;
      const to = Math.min(logicalCount - 1, i * perGroup);
      const count = Math.max(0, to - from + 1);
      const stage = ROLES[(i - 1) % ROLES.length];
      const a = agentFrom(i, groups + 1, {
        labelPrefix: `Cluster ${String(i).padStart(2, '0')}`,
        group: stage,
      });
      a.taskCorto = `${stage} · ${count} agenti logici`;
      a.task = `Proxy visuale R4 per ${count} agenti logici della fase ${stage}. Non rappresenta una singola sessione production.`;
      a.numeroFigli = count;
      children.push(a);
    }
  } else {
    for (let i = 1; i <= visibleCount; i += 1) {
      const level = logicalCount >= 14 && i > 6 ? 1 + ((i - 7) % 6) : 0;
      const parent = level ? `r4-agent-${1 + ((i - 7) % 6)}` : 'r4-root';
      children.push(agentFrom(i, logicalCount, { parent }));
    }
  }
  return {
    logicalCount,
    renderedCount: children.length + 1,
    bounded,
    data: {
      corrente: root,
      sessioni: children,
      figli: children,
      errore: error || null,
      aggiornato: updatedAt,
    },
  };
}

export function makeAgents(count) {
  return Array.from({ length: count }, (_, i) => agentFrom(i + 1, count + 1));
}

function countStates(items) {
  const result = { active: 0, waiting: 0, error: 0, done: 0 };
  for (const a of items) {
    if (a.approvalPendingCount > 0) result.waiting += 1;
    else if (a.conclusa && a.ultimoEsito === 'errore') result.error += 1;
    else if (a.conclusa) result.done += 1;
    else result.active += 1;
  }
  return result;
}

export function makeRailFixture(count) {
  const agents = makeAgents(Math.min(count, 300));
  const factor = count / Math.max(1, agents.length);
  const raw = countStates(agents);
  const counts = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Math.round(v * factor)]));
  const groups = ROLES.map((name, index) => {
    const base = Math.floor(count / ROLES.length);
    const total = base + (index < count % ROLES.length ? 1 : 0);
    const attention = Math.max(0, Math.round(total * (index === 2 ? 0.08 : 0.025)));
    const active = Math.max(attention, Math.round(total * (0.12 + (index % 3) * 0.025)));
    return {
      id: `group-${index}`,
      name,
      total,
      active,
      attention,
      done: Math.max(0, total - active),
      progress: total ? Math.round(((total - active) / total) * 100) : 0,
    };
  });
  const attention = agents
    .filter((a) => a.approvalPendingCount > 0 || a.ultimoEsito === 'errore')
    .slice(0, 6)
    .map((a) => ({
      id: a.sessionId,
      title: a.taskCorto,
      reason: a.approvalPendingCount ? 'Attende una decisione' : 'Errore da verificare',
    }));
  return { count, agents, counts, groups, attention };
}

export const PLAN_FIXTURE = Object.freeze({
  title: 'Refactor Workflow Graph TALOS',
  objective: 'Integrare Plan, Ask e Workflow nella Chat senza introdurre una seconda applicazione.',
  version: 4,
  hash: 'r4-8f31c9a2',
  acceptance: [
    'Grafo reale nella Chat centrale',
    'Ask immediatamente sopra il composer',
    'Rail Agenti adattivo e bounded',
    'Owner visual gate prima della production',
  ],
  warnings: ['La semantica production di cluster/proxy resta da congelare dopo il mockup.'],
  errors: ['Esecuzione senza corrispondenza con hash del piano approvato.'],
});

export const ASK_FIXTURE = Object.freeze({
  source: 'Workflow · Verifica integrazione',
  single: {
    id: 'ask-r4-single',
    title: 'Serve una decisione',
    questions: [{
      id: 'strategy',
      question: 'Come vuoi gestire il conflitto rilevato prima dell’integrazione?',
      options: ['Mantieni la baseline', 'Usa la modifica dell’agente', 'Apri il confronto'],
      multi: false,
      other: true,
    }],
  },
  multi: {
    id: 'ask-r4-multi',
    title: 'Conferma le verifiche finali',
    questions: [
      {
        id: 'checks',
        question: 'Quali verifiche vuoi richiedere prima di integrare?',
        options: ['Security', 'Regression', 'Contract', 'Performance'],
        multi: true,
        other: true,
      },
      {
        id: 'priority',
        question: 'Quale priorità deve avere il blocco?',
        options: ['Blocca tutto', 'Blocca solo il merge', 'Prosegui con warning'],
        multi: false,
        other: true,
      },
    ],
  },
  receipt: {
    question: 'Quali verifiche vuoi richiedere prima di integrare?',
    answer: 'Security, Regression, Contract',
    origin: 'Workflow · Verifica integrazione',
    status: 'Risposta registrata',
  },
});

export function sceneFixture(scene) {
  const railMatch = /^rail-(status-first|group-first|hybrid)-(30|300|5000)$/.exec(scene);
  if (railMatch) return {
    kind: 'rail',
    variant: railMatch[1],
    rail: makeRailFixture(Number(railMatch[2])),
  };
  if (scene === 'rail-current-3') return {
    kind: 'rail-current',
    rail: makeRailFixture(3),
  };
  if (scene.startsWith('plan-')) return {
    kind: 'plan',
    state: scene.slice('plan-'.length),
    plan: PLAN_FIXTURE,
  };
  if (scene.startsWith('ask-')) return {
    kind: 'ask',
    state: scene.slice('ask-'.length),
    ask: ASK_FIXTURE,
  };
  if (scene.startsWith('workflow-graph-')) {
    if (scene === 'workflow-graph-14') return { kind: 'graph', state: 'normal', graph: makeGraphFixture(14) };
    if (scene === 'workflow-graph-200') return { kind: 'graph', state: 'normal', graph: makeGraphFixture(200) };
    if (scene === 'workflow-graph-5000') return { kind: 'graph', state: 'normal', graph: makeGraphFixture(5000, { proxyCount: 48 }) };
    if (scene === 'workflow-graph-error') return { kind: 'graph', state: 'error', graph: makeGraphFixture(14, { error: 'Snapshot non aggiornato' }) };
    if (scene === 'workflow-graph-disconnected') return { kind: 'graph', state: 'disconnected', graph: makeGraphFixture(14) };
    if (scene === 'workflow-graph-resync') return { kind: 'graph', state: 'resync', graph: makeGraphFixture(14) };
    if (scene === 'workflow-graph-reload') return { kind: 'graph', state: 'reload', graph: makeGraphFixture(14) };
    if (scene === 'workflow-graph-pending-question') return { kind: 'graph', state: 'pending-question', graph: makeGraphFixture(14) };
  }
  if (['keyboard', 'reduced-motion', 'long-labels', '200-percent-reflow'].includes(scene)) {
    return { kind: 'accessibility', state: scene, rail: makeRailFixture(30) };
  }
  return { kind: 'baseline' };
}
