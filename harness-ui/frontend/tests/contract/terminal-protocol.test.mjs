import assert from 'node:assert/strict';
import test from 'node:test';

import { CONTROL_FRAME, DATA_FRAME, decodeTerminalFrame, encodeTerminalFrame } from '../../src/contracts/terminal-protocol.js';

test('PHASE1-TERMINAL-FRAME-01 conserva i frame binari 0 e 1', () => {
  const data = encodeTerminalFrame(DATA_FRAME, 'dir\r');
  const control = encodeTerminalFrame(CONTROL_FRAME, JSON.stringify({ tipo: 'resize', cols: 120, rows: 36 }));
  assert.equal(new Uint8Array(data)[0], 0);
  assert.equal(new Uint8Array(control)[0], 1);
  assert.deepEqual(decodeTerminalFrame(data), { type: DATA_FRAME, payload: 'dir\r' });
  assert.deepEqual(JSON.parse(decodeTerminalFrame(control).payload), { tipo: 'resize', cols: 120, rows: 36 });
  assert.equal(decodeTerminalFrame(new Uint8Array([9]).buffer), null);
});
