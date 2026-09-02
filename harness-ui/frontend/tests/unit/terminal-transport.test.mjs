import assert from 'node:assert/strict';
import test from 'node:test';

import { CONTROL_FRAME, DATA_FRAME, decodeTerminalFrame } from '../../src/contracts/terminal-protocol.js';
import { createTerminalTransportFactory } from '../../src/contracts/terminal-transport.js';

class FakeWebSocket {
  static instances = [];
  static OPEN = 1;
  constructor(url) { this.url = url; this.readyState = 1; this.sent = []; this.closeCount = 0; FakeWebSocket.instances.push(this); }
  send(value) { this.sent.push(value); }
  close() { this.closeCount += 1; this.readyState = 3; }
}

test('PHASE1-TERMINAL-FRAME-01 invia dati resize e distrugge una sola volta', () => {
  const received = [];
  const factory = createTerminalTransportFactory({ WebSocketImpl: FakeWebSocket, endpoint: (id) => `ws://127.0.0.1/${id}` });
  const transport = factory.open({ terminalId: 't-1', onData: (value) => received.push(value), onExit: (value) => received.push(value) });
  const socket = FakeWebSocket.instances.at(-1);
  transport.send('pwd\r');
  transport.resize(100, 30);
  assert.equal(decodeTerminalFrame(socket.sent[0]).type, DATA_FRAME);
  assert.equal(decodeTerminalFrame(socket.sent[1]).type, CONTROL_FRAME);
  socket.onmessage({ data: socket.sent[0] });
  assert.deepEqual(received, ['pwd\r']);
  transport.destroy(); transport.destroy();
  assert.equal(socket.closeCount, 1);
});
