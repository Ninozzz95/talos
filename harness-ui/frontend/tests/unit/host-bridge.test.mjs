import assert from 'node:assert/strict';
import test from 'node:test';

import { createHostBridge } from '../../src/contracts/host-bridge.js';

test('PHASE1-HOST-STORAGE-01 usa callback host opzionali senza autorità implicita', () => {
  const events = [];
  const windowObj = {
    __talosHarnessHostViewChange: (value) => events.push(['view', value]),
    __talosHarnessHostPermissionChange: (value) => events.push(['permission', value]),
    __talosHarnessHostBack: () => events.push(['back']),
  };
  const bridge = createHostBridge({ windowObj });
  assert.equal(bridge.changeView('terminal'), true);
  assert.equal(bridge.changePermission({ mode: 'workspace-write' }), true);
  assert.equal(bridge.back(), true);
  assert.deepEqual(events, [['view', 'terminal'], ['permission', { mode: 'workspace-write' }], ['back']]);
  assert.equal(createHostBridge({ windowObj: {} }).back(), false);
});
