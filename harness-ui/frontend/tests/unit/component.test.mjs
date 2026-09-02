import assert from 'node:assert/strict';
import test from 'node:test';

import { defineComponent } from '../../src/ui/component.js';

test('PHASE2-COMPONENT-LIFECYCLE-05 component exposes canonical lifecycle', () => {
  const calls = [];
  const factory = defineComponent('Counter', ({ props }) => ({
    element: { nodeType: 1 },
    update: (next) => calls.push(['update', next.value]),
    destroy: () => calls.push(['destroy']),
    focus: () => calls.push(['focus', props.value]),
  }));
  const mounted = factory({ props: { value: 1 }, dispatch() {}, services: {}, announce() {} });
  mounted.update({ value: 2 });
  mounted.focus();
  mounted.destroy();
  mounted.destroy();
  mounted.update({ value: 3 });
  assert.deepEqual(calls, [['update', 2], ['focus', 1], ['destroy']]);
});

test('PHASE2-COMPONENT-LIFECYCLE-05 malformed mounts fail closed', () => {
  assert.throws(() => defineComponent('Broken', () => ({ element: null, update() {}, destroy() {} }))({}), /elemento radice/);
  assert.throws(() => defineComponent('Broken', () => ({ element: { nodeType: 1 }, destroy() {} }))({}), /update mancante/);
});

