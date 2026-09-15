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

function leggiCookieGrezzo(grezzo, nome) {
  if (typeof grezzo !== 'string' || grezzo === '') return null;
  for (const parte of grezzo.split(';')) {
    const i = parte.indexOf('=');
    if (i !== -1 && parte.slice(0, i).trim() === nome) return parte.slice(i + 1).trim();
  }
  return null;
}

/**
 * ⭐⭐⭐ W1-01 (05/9) — `?id=` non è più il `sessionId`: è il **`terminalId`**,
 * e una sessione può averne più d'uno.
 *
 * ⛔⛔⛔ Il parametro `risolviCartella` (che tornava SEMPRE una cartella, al
 * peggio la prima configurata) è stato sostituito da `risolviScheda`, che ha
 * il diritto di dire **no**: `null` ⇒ upgrade rifiutato, e nessuna PTY nasce.
 * Prima di oggi un id sconosciuto non veniva respinto — cadeva sul primo
 * progetto — quindi con un `terminalId` libero qualunque stringa avrebbe
 * aperto una shell. È la forma esatta di **CVE-2026-59224** (Open WebUI,
 * 2026): un id scelto dal client che decide a quale PTY ti attacchi. E il
 * terminale è l'endpoint dove un buco non è un buco: **CVE-2026-39987**
 * (Marimo, 2026) era `/terminal/ws`, l'unica WebSocket senza controllo
 * d'autenticazione, cioè RCE pre-auth. Entrambe lette il 05/09/2026, fonti nel
 * ledger `.claude/LEDGER-W1-01-SCHEDE-TERMINALE-2026-09-05.md`.
 */
export function creaGestoreTerminaleWs({ registro, originiConsentite, risolviScheda, token = null }, deps = {}) {
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
    // ⭐ 04/9, W1-10 — stesso cancello a token di /api/*: senza il cookie talos_token l'upgrade è 401, la PTY non nasce nemmeno.
    if (token && leggiCookieGrezzo(req.headers.cookie, 'talos_token') !== token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    const id = url.searchParams.get('id');
    if (typeof id !== 'string' || id.length === 0 || id.length > 200) {
      socket.destroy();
      return;
    }
    /*
     * ⛔⛔⛔ 05/9, W1-01 — IL CANCELLO. Si chiede al registro delle schede
     * PRIMA di completare l'upgrade: un `terminalId` che il server non ha
     * creato (e che non è un `sessionId` vivo) riceve 403 e il socket muore
     * QUI. ⛔ `registro.apri` non viene nemmeno sfiorato: la prova che conta
     * non è lo status code, è che la PTY non nasca — ed è così che i test la
     * misurano (contano gli spawn, non le risposte).
     */
    const scheda = risolviScheda(id);
    if (!scheda) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      collega(ws, scheda);
    });
  }

  function collega(ws, scheda) {
    /* ⛔ L'id e la cartella vengono dalla SCHEDA del registro, mai dalla query: il client nomina, il server decide. */
    const id = scheda.terminalId;
    /*
     * ⭐⭐⭐ Il segnale «ripreso», PRIMA di qualunque byte.
     *
     * ⛔ Senza, il client non poteva sapere se la sua shell fosse sopravvissuta:
     * il ponte rigioca il backlog sia quando riaggancia una PTY viva sia
     * quando il reaper l'ha chiusa e ne nasce una nuova (backlog vuoto — che è
     * anche l'aspetto di una shell viva che non ha ancora stampato niente).
     * L'interfaccia era costretta a dire «riconnesso, non sappiamo se la shell
     * è ancora quella». Lo stato dell'arte separa l'identità della CONNESSIONE
     * da quella della SESSIONE e fa dichiarare al server se ha ripreso davvero
     * (un pattern noto come "connection state recovery"; ricerca del 05/09/2026,
     * websocket.org/guides/reconnection/).
     *
     * ⛔ Va PRIMA del backlog: chi legge deve sapere di che shell sono i byte
     * che sta per ricevere, non scoprirlo dopo averli scritti a schermo.
     *
     * ⛔ Sicuro per il monolite congelato (`public/app.js`), verificato alla
     * fonte: alla riga 7702 tratta solo `evento === 'uscita'` e ignora in
     * silenzio ogni altro evento di controllo — nessun `else`, nessun crash.
     */
    const { voce, ripresa } = registro.apriDichiarando({ id, cartella: scheda.cartella });
    /* 06/9 B1 — la scheda prende il nome della shell che il server ha scelto DAVVERO (`enforcement` di `sceltaShell`), non uno indovinato dal client. */
    ws.send(codificaFrame(TIPO_FRAME_CONTROLLO, JSON.stringify({ evento: 'agganciato', ripreso: ripresa, shell: voce.enforcement ?? null, comando: voce.comando ?? null })));

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
