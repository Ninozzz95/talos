import assert from 'node:assert/strict';
import test from 'node:test';

import { createApplication } from '../../src/app/application.js';

function fakeDocument() {
  const createElement = (tagName) => ({
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    children: [],
    dataset: {},
    style: {},
    attributes: new Map(),
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = nodes; },
    setAttribute(name, value) { this.attributes.set(name, String(value)); },
    removeAttribute(name) { this.attributes.delete(name); },
    addEventListener() {},
    removeEventListener() {},
    focus() {},
    remove() {},
  });
  return {
    createElement,
    createTextNode: (value) => ({ nodeType: 3, textContent: String(value) }),
    activeElement: null,
    addEventListener() {},
    removeEventListener() {},
    querySelectorAll() { return []; },
  };
}

test('PHASE2-APPLICATION-TEARDOWN-08 application starts truthfully and destroys once', async () => {
  const documentLike = fakeDocument();
  const root = { ...documentLike.createElement('main'), ownerDocument: documentLike };
  const app = createApplication({
    root,
    services: {
      document: documentLike,
      api: { get: async () => ({ data: { projects: [], sessions: [], capabilities: {} }, etag: null }) },
      host: {},
      persistence: { load: () => ({}) },
      clock: () => 1,
      randomId: () => 'id-1',
    },
  });
  assert.equal(app.store.getState().runtime.phase, 'booting');
  await app.start();
  assert.equal(app.store.getState().runtime.phase, 'ready-empty');
  app.destroy();
  app.destroy();
  assert.equal(app.store.getState().runtime.phase, 'offline');
});
