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

/*
 * ⭐⭐⭐ Il segnale «agganciato»: il ponte dichiara se ha ripreso la shell viva
 * o ne ha aperta una nuova. Le prove stanno QUI, dove vive la guardia — nella
 * superficie arrivava già normalizzato, quindi lì una mutazione di questa
 * riga non faceva rosso: la prova era nel posto sbagliato, e l'ho scoperto
 * mutando invece che rileggendo.
 */
import { encodeTerminalFrame } from '../../src/contracts/terminal-protocol.js';

const agganciato = (payload) => encodeTerminalFrame(CONTROL_FRAME, JSON.stringify(payload));

function trasportoPerTest() {
  const visti = [];
  const factory = createTerminalTransportFactory({ WebSocketImpl: FakeWebSocket, endpoint: (id) => `ws://127.0.0.1/${id}` });
  factory.open({ terminalId: 't-1', onAttach: (v) => visti.push(v) });
  return { socket: FakeWebSocket.instances.at(-1), visti };
}

test('TRASPORTO-AGGANCIO-01 ⭐ un ripreso booleano passa così com\'è', () => {
  const { socket, visti } = trasportoPerTest();
  socket.onmessage({ data: agganciato({ evento: 'agganciato', ripreso: true }) });
  socket.onmessage({ data: agganciato({ evento: 'agganciato', ripreso: false }) });
  assert.deepEqual(visti, [true, false]);
});

test('TRASPORTO-AGGANCIO-02 ⭐⭐ un ripreso ASSENTE o non booleano diventa null, mai false', () => {
  const { socket, visti } = trasportoPerTest();
  // ⛔ `Boolean(undefined)` sarebbe `false`, cioè «la tua shell è stata
  // chiusa»: una bugia detta a chi non ci ha detto niente. L'ignoto resta
  // ignoto e l'interfaccia lo scrive.
  socket.onmessage({ data: agganciato({ evento: 'agganciato' }) });
  socket.onmessage({ data: agganciato({ evento: 'agganciato', ripreso: 'si' }) });
  socket.onmessage({ data: agganciato({ evento: 'agganciato', ripreso: 1 }) });
  assert.deepEqual(visti, [null, null, null]);
});

test('TRASPORTO-AGGANCIO-03 un evento di controllo sconosciuto non chiama onAttach né rompe la connessione', () => {
  const { socket, visti } = trasportoPerTest();
  socket.onmessage({ data: agganciato({ evento: 'qualcosa-di-nuovo', ripreso: true }) });
  assert.deepEqual(visti, []);
});

test('TRASPORTO-AGGANCIO-04 l\'uscita resta l\'uscita: non passa da onAttach', () => {
  const visti = [];
  const usciti = [];
  const factory = createTerminalTransportFactory({ WebSocketImpl: FakeWebSocket, endpoint: (id) => `ws://127.0.0.1/${id}` });
  factory.open({ terminalId: 't-1', onAttach: (v) => visti.push(v), onExit: (c) => usciti.push(c) });
  const socket = FakeWebSocket.instances.at(-1);
  socket.onmessage({ data: agganciato({ evento: 'uscita', codice: 130 }) });
  assert.deepEqual(usciti, [130]);
  assert.deepEqual(visti, []);
});
