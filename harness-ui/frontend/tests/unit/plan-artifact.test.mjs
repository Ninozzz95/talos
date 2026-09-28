import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlanArtifact, parsePlanEvent, renderPlanText } from '../../src/components/plan-artifact.js';

function fakeDocument() {
  const htmlWrites = [];
  const create = (tag) => ({
    tag, children: [], dataset: {}, style: {}, attributes: new Map(),
    append(...nodes) { this.children.push(...nodes); },
    appendChild(node) { this.children.push(node); return node; },
    setAttribute(key, value) { this.attributes.set(key, value); },
    set textContent(value) { this._text = String(value); this.children = []; },
    get textContent() { return this._text ?? this.children.map((child) => child.textContent).join(''); },
    set innerHTML(value) { htmlWrites.push(value); },
  });
  return {
    htmlWrites,
    createElement: create,
    createDocumentFragment: () => create('#fragment'),
    createTextNode: (value) => ({ tag: '#text', textContent: String(value), children: [] }),
  };
}

function descendants(root, tag) {
  return (root?.children || []).flatMap((child) => [
    ...(child.tag === tag ? [child] : []), ...descendants(child, tag),
  ]);
}

test('R4-PLAN-FORMATTED-REAL: a proposed Plan renders its actual headings and steps without active approval', () => {
  const document = fakeDocument();
  const text = '# Piano\n\n1. Verificare il contratto\n2. Misurare il risultato';
  const card = createPlanArtifact({ document, text, status: 'proposed' });
  assert.equal(card.dataset.c, 'PlanArtifact');
  assert.equal(card.dataset.status, 'proposed');
  assert.equal(card.attributes.get('aria-label'), 'Piano proposto');
  assert.equal(descendants(card, 'h1').length, 1);
  assert.equal(descendants(card, 'ol').length, 1);
  assert.match(card.textContent, /Verificare il contratto/);
  assert.equal(descendants(card, 'button').length, 0);
  assert.deepEqual(document.htmlWrites, []);
});

test('R4-PLAN-NO-FAKE-APPROVAL: absent/unknown Plan status and empty text make no artifact', () => {
  const document = fakeDocument();
  assert.equal(createPlanArtifact({ document, text: '' }), null);
  assert.equal(createPlanArtifact({ document, text: '# Plan', status: 'approved' }), null);
  const rendered = renderPlanText('<img src=x onerror=alert(1)>', { document });
  assert.equal(descendants(rendered, 'img').length, 0);
  assert.equal(rendered.textContent, '<img src=x onerror=alert(1)>');
  assert.deepEqual(document.htmlWrites, []);
});

test('R4-PLAN-TYPED-REPLAY: only a versioned same-session fact becomes a proposal', () => {
  const value = { schema: 'talos.plan.v1', sessionId: 'session-1', planId: 'plan-1',
    revision: 2, status: 'proposed', content: '# Fase\n\n- Misurare',
    at: '2026-09-23T10:00:00.000Z' };
  assert.deepEqual(parsePlanEvent(value, 'session-1'), {
    planId: 'plan-1', revision: 2, status: 'proposed',
    text: value.content, at: value.at,
  });
  assert.equal(parsePlanEvent(value, 'foreign-session'), null);
  assert.equal(parsePlanEvent({ ...value, schema: 'talos.plan.v2' }, 'session-1'), null);
  assert.equal(parsePlanEvent({ ...value, revision: 0 }, 'session-1'), null);
  assert.equal(parsePlanEvent({ ...value, content: '' }, 'session-1'), null);
});

test('R4-PLAN-UNAVAILABLE: oversized output is a truthful empty state', () => {
  const document = fakeDocument();
  const value = { schema: 'talos.plan.v1', sessionId: 'session-1', planId: 'plan-1',
    revision: 3, status: 'unavailable', content: null, reason: 'PLAN_CONTENT_TOO_LARGE',
    at: '2026-09-23T10:00:00.000Z' };
  const fact = parsePlanEvent(value, 'session-1');
  assert.equal(fact?.status, 'unavailable');
  const card = createPlanArtifact({ document, ...fact, source: 'journal' });
  assert.equal(card.dataset.source, 'journal');
  assert.equal(card.dataset.revision, '3');
  assert.match(card.textContent, /Piano non disponibile/);
  assert.equal(descendants(card, 'button').length, 0);
  assert.equal(parsePlanEvent({ ...value, reason: 'UNKNOWN' }, 'session-1'), null);
});
