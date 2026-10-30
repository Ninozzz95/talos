/*
 * Controllo remoto — la CHIAMATA IN PROCESSO al gestore HTTP del server, senza rete.
 *
 * Perché così (decisione di Nino1 del 18/10/2026, che precisa la regola scritta il 17/10 in ELENCO-AZIONI §6): il telefono deve
 * poter fare «tutto come dal PC» (owner 14/10), e il PC fa tutto attraverso le rotte di `http-app.mjs`, coi loro validatori, tetti
 * e messaggi d'errore. Riscriverli per il telefono sarebbe una seconda verità, cioè ciò che questo progetto ha già pagato altrove.
 * Le due ragioni della regola del 17/10 restano vere:
 *   · niente rete e niente proxy verso 127.0.0.1 (orientamento del 14/10): la richiesta è un oggetto in memoria passato alla
 *     funzione del gestore, non un pacchetto su una porta;
 *   · l'origine resta scritta: `x-talos-origine: telefono:<id>` (diagnostica, `origineDellaRichiesta`, http-app.mjs:2163).
 * L'elenco resta CHIUSO: chi chiama questa funzione è solo `operazioni.mjs`, con un percorso fisso per ogni operazione. Nessuna
 * operazione del telefono passa un metodo o un percorso suoi.
 *
 * Il gettone della finestra (cookie `talos_token`, http-app.mjs W1-10) lo mette il server stesso, che lo conosce: il telefono ha
 * già passato l'ammissione per elenco, che è il suo confine (contratto v0.3 §B.1).
 */

import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { ORIGINE_REMOTA } from '../origine-remota.mjs';

function errore(code, message) {
  return Object.assign(new Error(message), { code });
}

class RispostaInMemoria extends EventEmitter {
  constructor(fine) {
    super();
    this.statusCode = 200;
    this.headersSent = false;
    this.writableEnded = false;
    this.destroyed = false;
    this.intestazioni = {};
    this.pezzi = [];
    this.fine = fine;
  }
  setHeader(k, v) { this.intestazioni[String(k).toLowerCase()] = v; }
  getHeader(k) { return this.intestazioni[String(k).toLowerCase()]; }
  hasHeader(k) { return Object.hasOwn(this.intestazioni, String(k).toLowerCase()); }
  removeHeader(k) { delete this.intestazioni[String(k).toLowerCase()]; }
  writeHead(stato, intestazioni = {}) {
    this.statusCode = stato;
    for (const [k, v] of Object.entries(intestazioni ?? {})) this.setHeader(k, v);
    this.headersSent = true;
    return this;
  }
  flushHeaders() { this.headersSent = true; }
  write(pezzo) { if (pezzo != null) this.pezzi.push(Buffer.from(pezzo)); return true; }
  end(pezzo) {
    if (this.writableEnded) return this;
    if (pezzo != null && typeof pezzo !== 'function') this.pezzi.push(Buffer.from(pezzo));
    this.writableEnded = true;
    this.emit('finish');
    this.fine();
    return this;
  }
  destroy() { this.destroyed = true; this.emit('close'); this.fine(); }
}

/**
 * `httpApp`: la funzione di `createHttpApp(...)`. `porta`: quella su cui il server ascolta (serve al controllo dell'Host).
 * Torna `chiama({ metodo, percorso, corpo?, origine })` → `{ stato, dati }`; lancia con il `code` della busta d'errore.
 */
export function creaChiamataInterna({ httpApp, porta, gettone = null, attesaMassimaMs = 120_000 } = {}) {
  if (typeof httpApp !== 'function') throw errore('REMOTE_NO_APP', 'The remote module needs the HTTP handler.');
  return function chiama({ metodo, percorso, corpo, origine, origineRemota = null }) {
    /* ⛔ Revisione del 19/10/2026, difesa in profondità: il gestore legge il percorso con `new URL`, che risolve «.», «..» e i
       loro equivalenti in percentuale. Un percorso che la normalizzazione cambierebbe non è più quello fisso dell'operazione. */
    let normalizzato = null;
    try { const u = new URL(String(percorso ?? ''), 'http://127.0.0.1'); normalizzato = u.pathname + u.search; } catch { normalizzato = null; }
    if (typeof percorso !== 'string' || !percorso.startsWith('/') || percorso.startsWith('//') || normalizzato !== percorso) {
      return Promise.reject(errore('BAD_MESSAGE', 'Invalid internal path.'));
    }
    return new Promise((risolvi, rifiuta) => {
      const byte = corpo === undefined ? null : Buffer.from(JSON.stringify(corpo), 'utf8');
      const req = Readable.from(byte ? [byte] : []);
      req.method = metodo;
      req.url = percorso;
      req.aborted = false;
      req.headers = {
        host: `127.0.0.1:${porta}`,
        'sec-fetch-site': 'same-origin',
        ...(byte ? { 'content-type': 'application/json', 'content-length': String(byte.length) } : {}),
        ...(gettone ? { cookie: `talos_token=${gettone}` } : {}),
        ...(origine ? { 'x-talos-origine': String(origine).slice(0, 200) } : {}),
      };
      req.socket = { remoteAddress: 'talos-remote', localPort: porta };
      if (origineRemota) req[ORIGINE_REMOTA] = origineRemota; // «dal telefono X» nella bolla: lo mette solo questo percorso
      let fatto = false;
      const scadenza = setTimeout(() => { if (!fatto) { fatto = true; rifiuta(errore('OPERATION_FAILED', 'The computer did not answer in time.')); } }, attesaMassimaMs);
      scadenza.unref?.();
      const res = new RispostaInMemoria(() => {
        if (fatto) return;
        fatto = true;
        clearTimeout(scadenza);
        const testo = Buffer.concat(res.pezzi).toString('utf8');
        let busta = null;
        try { busta = testo ? JSON.parse(testo) : null; } catch { /* non JSON */ }
        if (res.statusCode >= 200 && res.statusCode < 300) return risolvi({ stato: res.statusCode, dati: busta?.ok === true ? (busta.data ?? null) : busta });
        const code = busta?.error?.code ?? busta?.code ?? 'OPERATION_FAILED';
        const message = busta?.error?.message ?? busta?.message ?? `HTTP ${res.statusCode}`;
        /* D-RM4-5 (Mobile, 20/10/2026): il MOTIVO e i suoi parametri (`reason`, `params` della busta, come li usa la finestra del PC
           per scegliere la frase) viaggiano con l'errore; li ripulisce chi li manda al telefono (`servizio.mjs`). */
        rifiuta(Object.assign(errore(code, message), { stato: res.statusCode,
          ...(busta?.error?.reason !== undefined ? { reason: busta.error.reason } : {}),
          ...(busta?.error?.params !== undefined ? { params: busta.error.params } : {}),
          /* Mobile 27/10/2026 (censimento «Avvisi ed errori»): anche la frase PRECISA del rifiuto (`explanation` della busta, già
             pubblicabile: public-problem.mjs `messaggioPubblicabile`), senza la quale il telefono vedeva solo quella generica del codice */
          ...(typeof busta?.error?.explanation === 'string' ? { explanation: busta.error.explanation } : {}) }));
      });
      try { httpApp(req, res); } catch (e) { if (!fatto) { fatto = true; clearTimeout(scadenza); rifiuta(e); } }
    });
  };
}
