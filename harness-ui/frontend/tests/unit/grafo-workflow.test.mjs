/*
 * F3-42 (25/09/2026) — il diagramma del workflow: le regole pure (famiglie dei conteggi D29, icone dai ruoli D28, durate
 * derivate D27, soglia della decisione 6) e il cliente dati (sorgente D30, unione del compito dalla versione, flusso dal vivo,
 * evidenze). Il comportamento a schermo si prova nel browser (`tests/browser/grafo-workflow.spec.mjs`).
 * Ledger: `.claude/LEDGER-F3-WORKFLOW-UI-2026-09-25.md`, sezione F3-42.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SOGLIA_AGENTI, cifra, conteggiFase, durataDelPasso, formattaDurata, iconaDelPasso, iconaDellaFase, livelloPer, modelloDelPasso,
  percentualeFase, tonoFase,
} from '../../src/components/grafo-workflow.js';
import { creaClientGrafo } from '../../src/components/workflow-graph-client.js';

test('WF-UI-PHASE-COUNTS: the phase families add up and errors stay apart (D29)', () => {
  const counts = { succeeded: 3, skipped: 1, running: 2, leased: 1, pending: 4, ready: 1, retry_wait: 1, waiting_human: 1, failed: 2, uncertain: 1, cancelled: 1 };
  assert.deepEqual(conteggiFase(counts), { conclusi: 4, inCorso: 3, inAttesa: 7, errori: 3, annullati: 1 });
  const somma = Object.values(conteggiFase(counts)).reduce((a, b) => a + b, 0);
  assert.equal(somma, Object.values(counts).reduce((a, b) => a + b, 0), 'every state belongs to exactly one family');
  assert.deepEqual(conteggiFase({ planned: 5 }), { conclusi: 0, inCorso: 0, inAttesa: 5, errori: 0, annullati: 0 });
});

test('WF-UI-PHASE-PERCENT: terminated/total rounded down, null for a plan (no invented state)', () => {
  assert.equal(percentualeFase({ progress: 26 / 40 }), 65);
  assert.equal(percentualeFase({ progress: 39 / 40 }), 97, '100% only when the phase is over');
  assert.equal(percentualeFase({ progress: 1 }), 100);
  assert.equal(percentualeFase({ progress: null }), null);
  assert.equal(tonoFase({ progress: 1, total: 2, terminated: 2, counts: { succeeded: 2 } }), 'ok');
  assert.equal(tonoFase({ progress: 0.5, total: 2, terminated: 1, counts: { succeeded: 1, running: 1 } }), 'corso');
  assert.equal(tonoFase({ progress: 0.5, total: 2, terminated: 1, counts: { failed: 1, running: 1 } }), 'errore');
  assert.equal(tonoFase({ progress: null, total: 2, terminated: 0, counts: { planned: 2 } }), 'neutro');
});

test('WF-UI-PHASE-ICON: the phase icon comes from the roles of its steps, then from the kinds (D28)', () => {
  assert.equal(iconaDellaFase({ roles: { researcher: 3, implementer: 1 } }), 'i-search');
  assert.equal(iconaDellaFase({ roles: { implementer: 2, tester: 2 } }), 'i-code', 'a tie goes to the contract order');
  assert.equal(iconaDellaFase({ roles: {}, kinds: { test: 2, agent: 1 } }), 'i-flask');
  assert.equal(iconaDellaFase({ roles: {}, kinds: { agent: 3 } }), 'i-robot');
  assert.equal(iconaDelPasso({ role: 'reviewer', kind: 'agent' }), 'i-shield');
  assert.equal(iconaDelPasso({ role: null, kind: 'artifact' }), 'i-doc');
});

test('WF-UI-DURATION: finished from the server, running from the viewer, waiting has none (D27)', () => {
  const adesso = Date.parse('2026-09-25T12:10:00.000Z');
  assert.equal(durataDelPasso({ state: 'succeeded', durationMs: 11_943 }, adesso), 11_943);
  assert.equal(durataDelPasso({ state: 'running', startedAt: '2026-09-25T12:08:00.000Z', finishedAt: null, durationMs: null }, adesso), 120_000);
  assert.equal(durataDelPasso({ state: 'pending', startedAt: null, durationMs: null }, adesso), null);
  assert.equal(durataDelPasso({ state: 'retry_wait', startedAt: '2026-09-25T12:08:00.000Z', durationMs: null }, adesso), null, 'a step waiting to retry is not running');
  assert.deepEqual([formattaDurata(9_500), formattaDurata(12 * 60_000 + 5), formattaDurata((23 * 60 + 23) * 60_000), formattaDurata(null)],
    ['9 s', '12 min', '23 h 23 min', null]);
});

test('WF-UI-MODEL: the effective model wins, then the chosen one, then the session one', () => {
  assert.equal(modelloDelPasso({ effectiveModel: { model: 'a' }, model: 'b' }, 'c'), 'a');
  assert.equal(modelloDelPasso({ model: 'b' }, 'c'), 'b');
  assert.equal(modelloDelPasso({ model: null }, 'c'), 'c');
});

test('WF-UI-NUMBERS: numbers are grouped like the mockup, four digits included («5.000», «1.120»)', () => {
  assert.deepEqual([cifra(5_000), cifra(1_120), cifra(200), cifra(1_234_567)], ['5.000', '1.120', '200', '1.234.567']);
});

test('WF-UI-THRESHOLD: one card per step up to the measured threshold, groups beyond (decision 6)', () => {
  assert.equal(livelloPer(14), 'agenti');
  assert.equal(livelloPer(SOGLIA_AGENTI), 'agenti');
  assert.equal(livelloPer(SOGLIA_AGENTI + 1), 'gruppi');
  assert.equal(livelloPer(5_000), 'gruppi');
});

/* ——— il cliente ——— */
const risposta = (status, corpo) => ({ ok: status >= 200 && status < 300, status, json: async () => corpo });
function finto(rotte) {
  const chieste = [];
  const fetchFn = async (url) => {
    chieste.push(url);
    for (const [prefisso, valore] of rotte) if (url.startsWith(prefisso)) return typeof valore === 'function' ? valore(url) : valore;
    return risposta(404, { ok: false, error: { code: 'NOT_FOUND' } });
  };
  return { fetchFn, chieste };
}
const ok = (data, meta = null) => risposta(200, { ok: true, data, ...(meta ? { meta } : {}) });
const S = 'sessione-1';

test('WF-UI-SOURCE: the run wins, a newer unstarted proposal wins over an old run, the card chooses its own (D30)', async () => {
  const run = { runId: 'r1', workflowId: 'w1', version: 1, status: 'succeeded', createdAt: '2026-09-25T10:00:00.000Z' };
  const propostaVecchia = { workflowId: 'w1', version: 1, status: 'approved', createdAt: '2026-09-25T09:59:00.000Z' };
  const propostaNuova = { workflowId: 'w2', version: 1, status: 'proposed', createdAt: '2026-09-25T11:00:00.000Z' };
  const client = (runs, proposte) => creaClientGrafo({ sessionId: S, fetchFn: finto([
    [`/api/v1/sessions/${S}/workflows?`, ok({ items: runs })], [`/api/v1/sessions/${S}/workflow-proposals?`, ok({ items: proposte })],
  ]).fetchFn });
  assert.equal((await client([run], [propostaVecchia]).sorgente()).tipo, 'run');
  const nuova = await client([run], [propostaNuova, propostaVecchia]).sorgente();
  assert.deepEqual([nuova.tipo, nuova.workflowId], ['piano', 'w2']);
  const scelta = await client([run], [propostaNuova, propostaVecchia]).sorgente({ workflowId: 'w1', version: 1 });
  assert.deepEqual([scelta.tipo, scelta.runId], ['run', 'r1']);
  // un run PIÙ NUOVO di una proposta mai avviata di un altro workflow: si parla del run (trovato dalla mutazione G17)
  const runNuovo = { ...run, createdAt: '2026-09-25T12:00:00.000Z' };
  assert.equal((await client([runNuovo], [propostaNuova, propostaVecchia]).sorgente()).tipo, 'run');
  assert.equal(await client([], []).sorgente(), null, 'nothing to show: the caller falls back to the classic delegations');
  // una lettura che fallisce non inventa una sorgente
  const rotto = creaClientGrafo({ sessionId: S, fetchFn: async () => risposta(500, null) });
  assert.equal(await rotto.sorgente(), null);
});

test('WF-UI-TASK-FROM-VERSION: run rows take the chosen model and the task preview from the version, by nodeId', async () => {
  const s = { tipo: 'run', runId: 'r1', workflowId: 'w1', version: 2 };
  const { fetchFn, chieste } = finto([
    [`/api/v1/sessions/${S}/workflows/r1/groups/f1?`, ok({ items: [{ nodeId: 'a', state: 'running' }, { nodeId: 'patch', state: 'pending' }], total: 2 })],
    ['/api/v1/workflows/w1/versions/2/groups/f1?', ok({ items: [{ nodeId: 'a', state: 'planned', model: 'm', taskPreview: 'Riassumi.' }] })],
    [`/api/v1/sessions/${S}/workflows/r1/nodes/a`, ok({ nodeId: 'a', state: 'running', stepSessionId: 'x' })],
    ['/api/v1/workflows/w1/versions/2/nodes/a', ok({ nodeId: 'a', instructions: 'Riassumi.\nPoi elenca.', model: 'm' })],
  ]);
  const client = creaClientGrafo({ sessionId: S, fetchFn });
  const pagina = await client.gruppo(s, 'f1', { offset: 0, limit: 50 });
  assert.deepEqual(pagina.items.map((r) => [r.nodeId, r.state, r.taskPreview ?? null, r.model ?? null]),
    [['a', 'running', 'Riassumi.', 'm'], ['patch', 'pending', null, null]], 'the run state stays; a patched step has no task');
  const passo = await client.passo(s, 'a');
  assert.deepEqual([passo.state, passo.stepSessionId, passo.instructions], ['running', 'x', 'Riassumi.\nPoi elenca.']);
  assert.ok(chieste.every((url) => !/\/(approve|start|pause|resume|cancel|retry)\b/u.test(url)), 'reads only');
});

test('WF-UI-SAMPLE-BY-STATE: the sample asks the run for sort=stato and takes each task from the planned step, not from a page', async () => {
  const s = { tipo: 'run', runId: 'r1', workflowId: 'w1', version: 2 };
  const { fetchFn, chieste } = finto([
    [`/api/v1/sessions/${S}/workflows/r1/groups/f1?offset=0&limit=4&sort=stato`, ok({ items: [{ nodeId: 'z', state: 'running' }], total: 900 })],
    ['/api/v1/workflows/w1/versions/2/nodes/z', ok({ nodeId: 'z', instructions: 'Lungo.', model: null, taskPreview: 'Compito di z.' })],
  ]);
  const pagina = await creaClientGrafo({ sessionId: S, fetchFn }).gruppo(s, 'f1', { offset: 0, limit: 4, perStato: true });
  assert.deepEqual(pagina.items.map((r) => [r.nodeId, r.taskPreview]), [['z', 'Compito di z.']]);
  assert.equal(chieste.some((url) => url.includes('/versions/2/groups/')), false, 'a sorted run page is not joined with an unsorted version page');
});

class FintoFlusso {
  static ultimo = null;
  constructor(url) { this.url = url; this.chiuso = false; this.readyState = 1; this.ascoltatori = {}; FintoFlusso.ultimo = this; }
  addEventListener(tipo, fn) { (this.ascoltatori[tipo] ??= []).push(fn); }
  close() { this.chiuso = true; this.readyState = 2; }
  emetti(tipo, data, lastEventId = '') { for (const fn of this.ascoltatori[tipo] ?? []) fn({ data: JSON.stringify(data), lastEventId }); }
}

test('WF-UI-LIVE: the run stream starts after the known sequence, hands over frames, and stops on 204', async () => {
  const s = { tipo: 'run', runId: 'r1', workflowId: 'w1', version: 1 };
  const client = creaClientGrafo({ sessionId: S, fetchFn: async () => risposta(404, null), EventSourceCtor: FintoFlusso });
  const fotogrammi = []; let finito = false;
  const chiudi = client.segui(s, { after: 41, onUpdate: (f) => fotogrammi.push(f), onFine: () => { finito = true; } });
  const flusso = FintoFlusso.ultimo;
  assert.equal(flusso.url, `/api/v1/sessions/${S}/workflows/r1/events?after=41`);
  flusso.emetti('run-update', { status: 'running', nodes: [{ nodeId: 'a' }] }, '42');
  assert.equal(fotogrammi.length, 1);
  flusso.readyState = 2; flusso.onerror();
  assert.equal(finito, true); assert.equal(flusso.chiuso, true);
  chiudi();
  assert.equal(client.segui({ tipo: 'piano', workflowId: 'w1', version: 1 }, {})(), undefined, 'a plan has no stream');
});

test('WF-UI-EVIDENCE: the last tools of the step session, newest first, bounded, never a verdict', () => {
  const client = creaClientGrafo({ sessionId: S, fetchFn: async () => risposta(404, null), EventSourceCtor: FintoFlusso });
  let visto = null;
  const chiudi = client.evidenze('passo-1', (voci) => { visto = voci; }, { programma: (f) => f() });
  const flusso = FintoFlusso.ultimo;
  assert.equal(flusso.url, '/api/v1/sessions/passo-1/events');
  const msg = (evento) => flusso.onmessage({ data: JSON.stringify(evento) });
  for (let i = 0; i < 30; i++) {
    msg({ type: 'ToolCallStart', toolCallId: `c${i}`, toolCallName: 'leggi' });
    msg({ type: 'ToolCallArgs', toolCallId: `c${i}`, delta: JSON.stringify({ percorso: `f${i}.md` }) });
    if (i < 29) msg({ type: 'ToolCallResult', toolCallId: `c${i}`, content: 'ERRORE: no' });
  }
  assert.deepEqual(visto, [
    { nome: 'leggi', oggetto: 'f29.md', esito: null },
    { nome: 'leggi', oggetto: 'f28.md', esito: 'concluso' },
    { nome: 'leggi', oggetto: 'f27.md', esito: 'concluso' },
  ], 'newest first; a finished call is «concluso», never «riuscito» or «fallito»');
  chiudi();
  assert.equal(flusso.chiuso, true);
  msg({ type: 'ToolCallStart', toolCallId: 'dopo', toolCallName: 'scrivi' });
  assert.equal(visto[0].oggetto, 'f29.md', 'nothing arrives after closing');
});

test('WF-UI-BLOCKED-AND-CANCELLED (real run on the 4174, 25/09): a step waiting on a previous one is «In attesa», and a phase of cancelled steps is not green', async () => {
  const { STATI_PASSO } = await import('../../src/components/grafo-workflow.js');
  assert.deepEqual(STATI_PASSO.blocked, { parola: 'In attesa', tono: 'attesa' }, 'the reducer state `blocked` (run.mjs:134) was «Stato sconosciuto»');
  assert.equal(conteggiFase({ blocked: 2, pending: 1 }).inAttesa, 3);
  assert.equal(tonoFase({ progress: 1, total: 2, terminated: 2, counts: { cancelled: 2 } }), 'neutro');
  assert.equal(tonoFase({ progress: 1, total: 2, terminated: 2, counts: { succeeded: 1, cancelled: 1 } }), 'neutro');
  assert.equal(tonoFase({ progress: 1, total: 2, terminated: 2, counts: { succeeded: 1, skipped: 1 } }), 'ok');
});

test('WF-UI-LIVE-COUNTS (real run on the 4174, 25/09): a known step moves its phase count with its card, an unknown one waits for the re-read', async () => {
  const { spostaConteggi } = await import('../../src/components/grafo-workflow.js');
  const gruppi = [{ phaseId: 'lettura', total: 2, terminated: 1, progress: 0.5, counts: { succeeded: 1, running: 1 } }, { phaseId: 'sintesi', total: 1, terminated: 0, progress: 0, counts: { blocked: 1 } }];
  spostaConteggi(gruppi, [{ phaseId: 'lettura', da: 'running', a: 'succeeded' }]);
  assert.deepEqual([gruppi[0].counts, gruppi[0].terminated, gruppi[0].progress], [{ succeeded: 2 }, 2, 1]);
  spostaConteggi(gruppi, [{ phaseId: 'sintesi', da: 'blocked', a: 'cancelled' }]);
  assert.deepEqual([gruppi[1].counts, gruppi[1].terminated], [{ cancelled: 1 }, 1]);
  // stato di prima ignoto (riga non caricata) o che non torna coi conteggi: niente di inventato, decide la rilettura
  const intatti = JSON.stringify(gruppi);
  spostaConteggi(gruppi, [{ phaseId: 'lettura', da: undefined, a: 'failed' }, { phaseId: 'lettura', da: 'running', a: 'failed' }, { phaseId: 'nessuna', da: 'succeeded', a: 'failed' }]);
  assert.equal(JSON.stringify(gruppi), intatti);
  // un piano (progress null) resta senza percentuale
  const piano = [{ phaseId: 'f', total: 1, terminated: 0, progress: null, counts: { planned: 1 } }];
  spostaConteggi(piano, [{ phaseId: 'f', da: 'planned', a: 'succeeded' }]);
  assert.equal(piano[0].progress, null);
});
