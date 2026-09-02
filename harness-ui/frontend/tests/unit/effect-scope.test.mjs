import assert from 'node:assert/strict';
import test from 'node:test';

import { createEffectScope } from '../../src/app/effect-scope.js';

test('PHASE2-EFFECT-TEARDOWN-04 destroy owns resources once in LIFO order', () => {
  const calls = [];
  const target = {
    addEventListener(_type, listener) { this.listener = listener; },
    removeEventListener() { calls.push('listener'); },
  };
  const scope = createEffectScope('session:s-1');
  const controller = scope.abortController();
  scope.listen(target, 'message', () => {});
  scope.own({ close: () => calls.push('close') });
  scope.add(() => calls.push('cleanup'));
  scope.destroy();
  scope.destroy();
  assert.equal(controller.signal.aborted, true);
  assert.deepEqual(calls, ['cleanup', 'close', 'listener']);
});

test('PHASE2-EFFECT-TEARDOWN-04 generation tokens reject replaced work', () => {
  const scope = createEffectScope('files');
  const first = scope.nextGeneration();
  const second = scope.nextGeneration();
  assert.equal(scope.isCurrent(first), false);
  assert.equal(scope.isCurrent(second), true);
  scope.destroy();
  assert.equal(scope.isCurrent(second), false);
});

test('PHASE2-EFFECT-TEARDOWN-04 late cleanup is executed immediately', () => {
  const calls = [];
  const scope = createEffectScope('destroyed');
  scope.destroy();
  scope.add(() => calls.push('late'));
  assert.deepEqual(calls, ['late']);
});

test('PHASE2-EFFECT-CLEANUP-ISOLATION-13 one failing cleanup cannot strand earlier resources', () => {
  const calls = [];
  const scope = createEffectScope('fault-isolation');
  scope.add(() => calls.push('early'));
  scope.add(() => { calls.push('throwing'); throw new Error('cleanup failure'); });
  scope.add(() => calls.push('late'));
  assert.throws(() => scope.destroy(), AggregateError);
  assert.deepEqual(calls, ['late', 'throwing', 'early']);
  assert.equal(scope.destroy(), false);
});

test('PHASE2-EFFECT-TIMEOUT-16 a fired one-shot removes its cleanup record', async () => {
  const fired = new Promise((resolve) => {
    const scope = createEffectScope('one-shot');
    const dispose = scope.timeout(() => {
      assert.equal(dispose(), false);
      assert.equal(scope.destroy(), true);
      resolve();
    }, 0);
  });
  await fired;
});
