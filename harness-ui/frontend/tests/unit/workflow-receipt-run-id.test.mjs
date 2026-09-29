import test from 'node:test';
import assert from 'node:assert/strict';
import { creaClientGrafo } from '../../src/components/workflow-graph-client.js';
import { creaClientProposta } from '../../src/components/workflow-proposal-client.js';
import { creaCardProposta, disegnaCardProposta } from '../../src/components/workflow-proposal-card.js';

const W = '11111111-1111-4111-8111-111111111111';
const HASH = `sha256:${'a'.repeat(64)}`;
const runs = [
  { runId: 'run-new', workflowId: W, version: 1, status: 'running', createdAt: '2026-09-28T12:00:00.000Z' },
  { runId: 'run-receipt', workflowId: W, version: 1, status: 'succeeded', createdAt: '2026-09-28T11:00:00.000Z' },
];
const response = (data) => ({ ok: true, status: 200, json: async () => ({ ok: true, data }) });

test('F-013-EXACT-SOURCE: a receipt opens its run even when another run of the same version is newer', async () => {
  const fetchFn = async (url) => response({ items: url.includes('workflow-proposals') ? [] : runs });
  const client = creaClientGrafo({ sessionId: 's', fetchFn });
  assert.equal((await client.sorgente({ workflowId: W, version: 1, runId: 'run-receipt' }))?.runId, 'run-receipt');
  assert.equal(await client.sorgente({ workflowId: W, version: 1, runId: 'run-missing' }), null,
    'a missing exact run must not open another run or the proposal');
});

test('F-013-AMBIGUOUS: a lost start response cannot claim a preexisting run as this command result', async () => {
  const requests = [];
  const fetchFn = async (url, options = {}) => {
    requests.push({ url, method: options.method ?? 'GET' });
    if (options.method === 'POST') throw new Error('lost response');
    if (url.includes('workflow-proposals')) return response({ items: [] });
    if (url.includes('/versions/')) return response({ schema: 'talos.workflow-proposal-view.v2', workflowId: W, version: 1, status: 'approved' });
    return response({ items: runs });
  };
  const client = creaClientProposta({ sessionId: 's', fetchFn, uuid: () => '22222222-2222-4222-8222-222222222222' });
  const result = await client.avvia({ workflowId: W, version: 1, definitionHash: HASH });
  assert.equal(result.ok, false);
  assert.equal(result.ambiguo, true);
  assert.equal(requests.filter((r) => r.method === 'POST').length, 1);
});

function fakeDocument() {
  const createElement = (tag) => ({
    tag, children: [], dataset: {}, attributes: new Map(), listeners: {},
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = nodes; },
    setAttribute(k, v) { this.attributes.set(k, String(v)); },
    addEventListener(k, fn) { (this.listeners[k] ??= []).push(fn); },
    set textContent(v) { this._text = String(v); this.children = []; },
    get textContent() { return this._text ?? this.children.map((n) => n.textContent).join(' '); },
  });
  return { createElement };
}

test('F-013-CARD-RECEIPT: the card displays the exact run ID and its Board action', () => {
  const document = fakeDocument();
  const card = creaCardProposta({ document, ricevuta: { workflowId: W, version: 1 } });
  const opened = [];
  disegnaCardProposta(card, { document,
    revisione: { schema: 'talos.workflow-proposal-view.v2', workflowId: W, version: 1, definitionHash: HASH,
      status: 'approved', title: 'Prova', objective: 'Prova', phases: [], budgets: {}, preflight: { errors: [], warnings: [] } },
    run: runs[1], onApriDiagramma: () => opened.push(runs[1].runId) });
  assert.match(card.textContent, /run-receipt/u);
  const walk = (n) => [n, ...(n.children ?? []).flatMap(walk)];
  const button = walk(card).find((n) => n.tag === 'button' && /Apri (in Board|diagramma)/u.test(n.textContent));
  assert.ok(button);
  button.listeners.click[0]();
  assert.deepEqual(opened, ['run-receipt']);
});
