import test from 'node:test';
import assert from 'node:assert/strict';
import { montaCronologiaWorkflow } from '../../src/components/workflow-history.js';

function documentFinto() {
  const doc = {};
  doc.createElement = (tag) => ({
    tag, ownerDocument: doc, children: [], parent: null, dataset: {}, style: {}, hidden: false, listeners: {},
    append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } },
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); },
    remove() { if (this.parent) this.parent.children = this.parent.children.filter((node) => node !== this); },
    setAttribute(key, value) { (this.attributes ??= {})[key] = String(value); },
    addEventListener(key, fn) { (this.listeners[key] ??= []).push(fn); },
    click() { for (const fn of this.listeners.click ?? []) fn({ preventDefault() {} }); },
    focus() { doc.activeElement = this; },
    set textContent(value) { this.value = String(value); this.children = []; },
    get textContent() { return this.value ?? this.children.map((node) => node.textContent).join(' '); },
  });
  return doc;
}
const all = (node) => [node, ...node.children.flatMap(all)];
const find = (node, cls) => all(node).find((entry) => entry.className?.split(' ').includes(cls));
const run = (id, status = 'succeeded') => ({ runId: id, workflowId: 'wf', version: 1, title: `Piano ${id}`, status,
  createdAt: '2026-09-28T10:00:00.000Z', startedAt: null, finishedAt: null, durationMs: null,
  steps: { total: 2, terminal: 2, failed: 0, active: 0 }, model: 'unknown' });
const tick = async () => { for (let i = 0; i < 8; i++) await new Promise((resolve) => setTimeout(resolve, 0)); };

test('WF-HISTORY-UI-PAGE-FILTER-EXACT: server filters before pagination and the chosen runId is preserved', async () => {
  const doc = documentFinto(); const host = doc.createElement('div');
  const calls = []; const opened = [];
  const fetchFn = async (url) => {
    const query = new URL(url, 'http://test').searchParams;
    calls.push(query.toString());
    const items = query.get('stato') === 'failed' ? [run('old', 'failed')]
      : query.get('offset') === '20' ? [run('old')] : [run('new')];
    return { ok: true, status: 200, json: async () => ({ ok: true, data: { items, total: 21,
      nextOffset: query.get('offset') === '20' ? null : 20 } }) };
  };
  const view = montaCronologiaWorkflow(host, { fetchFn, sessionId: 'session', onApri: (choice) => opened.push(choice) });
  await tick();
  assert.match(view.elemento.textContent, /Piano new/u);
  find(view.elemento, 'talos-wfh__more').click(); await tick();
  all(view.elemento).filter((node) => node.className === 'talos-wfh__open').at(-1).click();
  assert.deepEqual(opened.at(-1), { runId: 'old', workflowId: 'wf', version: 1 });
  find(view.elemento, 'talos-wfh__status').value = 'failed';
  for (const fn of find(view.elemento, 'talos-wfh__status').listeners.change) fn();
  await tick();
  assert.match(calls.at(-1), /stato=failed/u);
  assert.doesNotMatch(calls.at(-1), /offset=20/u);
  view.distruggi();
});

test('WF-HISTORY-UI-EMPTY-ERROR: states are explicit and stale responses cannot replace newer session data', async () => {
  const doc = documentFinto(); const host = doc.createElement('div');
  let fail = true;
  const view = montaCronologiaWorkflow(host, { sessionId: 'session', fetchFn: async () => fail
    ? { ok: false, status: 503, json: async () => ({ ok: false }) }
    : { ok: true, status: 200, json: async () => ({ ok: true, data: { items: [], total: 0, nextOffset: null } }) } });
  await tick(); assert.match(view.elemento.textContent, /non.*caric|errore|riprova/iu);
  fail = false; await view.aggiorna();
  assert.match(view.elemento.textContent, /nessun|vuot/iu);
  view.distruggi(); assert.equal(host.children.length, 0);
});
