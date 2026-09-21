import test from 'node:test';
import assert from 'node:assert/strict';
import { creaSeparatoreContesto, aggiornaSeparatoreContesto } from '../../src/components/context-separator.js';

function node() { return { dataset: {}, children: [], setAttribute() {}, addEventListener() {}, append(...items) { this.children.push(...items); }, querySelectorAll() { return this.children; }, remove() { this.removed = true; } }; }
const document = { createElement: node };
test('CTX-UI-SEPARATOR-DEDUP: replay and reload produce one separator per persisted version', () => {
  const container = node();
  const event = { id: 'e1', sessionId: 's', versionId: 'v1', kind: 'context.committed', createdAt: '2026-09-09T00:00:00Z' };
  aggiornaSeparatoreContesto(container, [event, { ...event, id: 'e2' }], { sessionId: 's', document });
  aggiornaSeparatoreContesto(container, [event], { sessionId: 's', document });
  assert.equal(container.children.length, 1);
  const reloaded = node(); aggiornaSeparatoreContesto(reloaded, [event, event], { sessionId: 's', document });
  assert.equal(reloaded.children.length, 1);
});
test('CTX-UI-SEPARATOR-SCOPE: foreign sessions and uncommitted jobs are not publication evidence', () => {
  const container = node();
  aggiornaSeparatoreContesto(container, [{ id: 'e', sessionId: 'foreign', versionId: 'v', kind: 'context.committed' }, { id: 'p', sessionId: 's', state: 'summarizing', kind: 'context.progress' }], { sessionId: 's', document });
  assert.equal(container.children.length, 0);
  assert.equal(creaSeparatoreContesto({ sessionId: 's' }, { document }), null);
});
