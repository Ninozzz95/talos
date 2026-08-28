/**
 * terminal-ws.mjs — il ponte WebSocket fra il registro di PTY vere
 * (`pty-terminal.mjs`) e il browser. Ledger: `.claude/LEDGER-TERMINALE-REALE.md`.
 *
 * ⛔⛔ Nessuna porta nuova: l'upgrade avviene sullo STESSO `http.Server`
 * già bindato solo su loopback (`config.host`, validato in
 * `config.mjs`) — la WS eredita lo stesso perimetro di rete di ogni
 * altra rotta di questo backend, zero superficie aggiunta.
 *
 * ⛔ Validazione Origin ESPLICITA prima di completare l'upgrade — un
 * browser NON applica la same-origin policy alle WebSocket come la
 * applica a `fetch`/XHR (rischio "cross-site WebSocket hijacking",
 * guardia raccolta in ricerca prima di scrivere). Qui la shell aperta
 * "non ha limiti" (owner, 28/8): il confine giusto da tenere stretto è
 * il TRASPORTO, non la shell stessa.
 */
import { WebSocketServer } from 'ws';

import { codificaFrame, decodificaFrame, TIPO_FRAME_CONTROLLO, TIPO_FRAME_DATI } from './pty-terminal.mjs';

const PERCORSO_WS = '/api/v1/terminal/ws';

export function creaGestoreTerminaleWs({ registro, originiConsentite, risolviCartella }, deps = {}) {
  const WSS = deps.WebSocketServer ?? WebSocketServer;
  const wss = new WSS({ noServer: true });

  function gestisciUpgrade(req, socket, head) {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      socket.destroy();
      return;
    }
    if (url.pathname !== PERCORSO_WS) {
      socket.destroy();
      return;
    }
    const origin = req.headers.origin;
    if (origin && originiConsentite && !originiConsentite.has(origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    const id = url.searchParams.get('id');
    if (typeof id !== 'string' || id.length === 0 || id.length > 200) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      collega(ws, id);
    });
  }

  function collega(ws, id) {
    const cartella = risolviCartella(id);
    const voce = registro.apri({ id, cartella });

    // ⭐ Riconnessione (F5, o WS caduta): replay del backlog PRIMA di tornare live — stesso principio del Last-Event-ID già in uso per SSE, qui su una PTY invece che su un run agente.
    for (const pezzo of voce.backlog) {
      ws.send(codificaFrame(TIPO_FRAME_DATI, pezzo));
    }

    const ascolta = (evento) => {
      if (ws.readyState !== ws.OPEN) return;
      if (evento.tipo === 'dati') {
        ws.send(codificaFrame(TIPO_FRAME_DATI, evento.dati));
      } else if (evento.tipo === 'uscita') {
        ws.send(codificaFrame(TIPO_FRAME_CONTROLLO, JSON.stringify({ evento: 'uscita', codice: evento.exitCode ?? null })));
      }
    };
    voce.ascoltatori.add(ascolta);

    ws.on('message', (dati) => {
      const frame = decodificaFrame(dati);
      if (!frame) return; // AL CONTRARIO: un frame vuoto/di tipo ignoto si scarta, mai un crash della connessione
      if (frame.tipo === TIPO_FRAME_DATI) {
        registro.scrivi(id, frame.payload.toString('utf8'));
        return;
      }
      let comando;
      try {
        comando = JSON.parse(frame.payload.toString('utf8'));
      } catch {
        return;
      }
      if (comando?.tipo === 'resize' && Number.isInteger(comando.cols) && Number.isInteger(comando.rows)) {
        registro.ridimensiona(id, comando.cols, comando.rows);
      }
    });

    ws.on('close', () => {
      voce.ascoltatori.delete(ascolta);
      registro.segnaDisconnesso(id);
    });

    // ⛔ Un errore di trasporto non deve propagarsi come un'eccezione non gestita del processo server.
    ws.on('error', () => { /* 'close' segue comunque, la pulizia avviene lì */ });
  }

  return { gestisciUpgrade };
}
