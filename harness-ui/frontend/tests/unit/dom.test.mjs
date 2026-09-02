import assert from 'node:assert/strict';
import test from 'node:test';

import { delegate, element, replaceChildren, setAttributes, text } from '../../src/ui/dom.js';

function fakeDocument() {
  return {
    createElement(tagName) {
      return {
        nodeType: 1,
        tagName: tagName.toUpperCase(),
        attributes: new Map(),
        children: [],
        append(...nodes) { this.children.push(...nodes); },
        replaceChildren(...nodes) { this.children = nodes; },
        setAttribute(name, value) { this.attributes.set(name, String(value)); },
        removeAttribute(name) { this.attributes.delete(name); },
      };
    },
    createTextNode(value) { return { nodeType: 3, textContent: String(value) }; },
  };
}

test('PHASE2-COMPONENT-LIFECYCLE-05 DOM helpers use properties, attributes and text nodes safely', () => {
  const previous = globalThis.document;
  globalThis.document = fakeDocument();
  try {
    const input = element('input', { value: 'ciao', disabled: true, 'aria-label': 'Messaggio', 'data-id': 'm-1' });
    assert.equal(input.value, 'ciao');
    assert.equal(input.disabled, true);
    assert.equal(input.attributes.get('aria-label'), 'Messaggio');
    assert.equal(input.attributes.get('data-id'), 'm-1');
    setAttributes(input, { disabled: false, 'aria-label': null });
    assert.equal(input.disabled, false);
    assert.equal(input.attributes.has('aria-label'), false);
    const child = text('sicuro');
    replaceChildren(input, child);
    assert.equal(input.children[0].textContent, 'sicuro');
  } finally {
    globalThis.document = previous;
  }
});

test('PHASE2-COMPONENT-LIFECYCLE-05 delegated handlers match only inside the owned root', () => {
  let listener;
  const root = {
    addEventListener(_type, value) { listener = value; },
    removeEventListener() { listener = null; },
    contains(node) { return node?.inside === true; },
  };
  const seen = [];
  const stop = delegate(root, 'click', '[data-action]', (event, match) => seen.push([event.type, match.id]));
  listener({ type: 'click', target: { closest: () => ({ id: 'inside', inside: true }) } });
  listener({ type: 'click', target: { closest: () => ({ id: 'outside', inside: false }) } });
  stop();
  assert.deepEqual(seen, [['click', 'inside']]);
  assert.equal(listener, null);
});

