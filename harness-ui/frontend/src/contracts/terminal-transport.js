import { CONTROL_FRAME, DATA_FRAME, decodeTerminalFrame, encodeTerminalFrame } from './terminal-protocol.js';

export function createTerminalTransportFactory({ WebSocketImpl = globalThis.WebSocket, endpoint } = {}) {
  if (typeof WebSocketImpl !== 'function' || typeof endpoint !== 'function') throw new TypeError('WebSocket ed endpoint sono obbligatori');
  return Object.freeze({
    open({ terminalId, onData = () => {}, onExit = () => {}, onError = () => {}, onState = () => {} }) {
      if (!terminalId) throw new TypeError('Identificativo terminale obbligatorio');
      const socket = new WebSocketImpl(endpoint(terminalId));
      socket.binaryType = 'arraybuffer';
      let destroyed = false;
      socket.onopen = () => onState('open');
      socket.onerror = () => onError(Object.assign(new Error('Connessione terminale interrotta'), { code: 'TERMINAL_TRANSPORT_ERROR' }));
      socket.onclose = () => onState('closed');
      socket.onmessage = ({ data }) => {
        const frame = decodeTerminalFrame(data);
        if (!frame) return;
        if (frame.type === DATA_FRAME) { onData(frame.payload); return; }
        try {
          const control = JSON.parse(frame.payload);
          if (control.evento === 'uscita') onExit(control.codice ?? null);
        } catch (error) { onError(error); }
      };
      const isOpen = () => socket.readyState === (WebSocketImpl.OPEN ?? 1);
      return Object.freeze({
        send(value) { if (!destroyed && isOpen()) socket.send(encodeTerminalFrame(DATA_FRAME, value)); },
        resize(cols, rows) {
          if (!destroyed && isOpen()) socket.send(encodeTerminalFrame(CONTROL_FRAME, JSON.stringify({ tipo: 'resize', cols: Math.max(1, Math.trunc(cols)), rows: Math.max(1, Math.trunc(rows)) })));
        },
        destroy() { if (destroyed) return; destroyed = true; socket.close(); },
      });
    },
  });
}
