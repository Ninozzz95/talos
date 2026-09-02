import assert from 'node:assert/strict';
import test from 'node:test';

import { reconcileKeys } from '../../src/ui/keyed-list.js';

test('PHASE2-VIRTUAL-IDENTITY-06 reconciliation preserves identity and destroys removed keys', () => {
  const previous = new Map([['a', { id: 'A' }], ['b', { id: 'B' }]]);
  const destroyed = [];
  const result = reconcileKeys(
    previous,
    [{ id: 'b' }, { id: 'c' }],
    (item) => item.id,
    () => ({ id: 'C' }),
    (record) => destroyed.push(record.id),
  );
  assert.equal(result.get('b'), previous.get('b'));
  assert.equal(result.get('c').id, 'C');
  assert.deepEqual(destroyed, ['A']);
});

test('PHASE2-VIRTUAL-IDENTITY-06 duplicate keys fail closed', () => {
  assert.throws(() => reconcileKeys(new Map(), [{ id: 'a' }, { id: 'a' }], (item) => item.id, () => ({}), () => {}), /duplicata/);
});

