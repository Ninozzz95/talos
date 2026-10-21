/*
 * Controllo remoto — il FILO dentro uno stream iroh: come si tagliano i messaggi e che forma hanno (contratto v0.3 §F: «la busta
 * della §5, come formato applicativo DENTRO lo stream iroh (versione, tipi, `s`, `n`, errori tipizzati)»).
 *
 * Un messaggio = 4 byte di lunghezza big-endian + il JSON in UTF-8. Non righe JSON (come le sonde del 17/10): un allegato a pezzi
 * (A3, fino a 25 MiB divisi sotto la busta, contratto §13 e nota di Nino3) è testo base64url lungo, e la lunghezza davanti lascia
 * rifiutare un messaggio troppo grande PRIMA di metterlo in memoria. È la forma del framing di QUIC stesso e di HTTP/2
 * (RFC 9113 §4.1, «Length: The length of the frame payload expressed as an unsigned 24-bit integer»).
 *
 * Il tetto di 1 MiB vale sui byte del JSON già codificato, base64url compreso (domanda di Nino3, contratto §18, «dire se 1 MiB è
 * prima o dopo il base64url»): dopo.
 *
 * Gli errori hanno la forma della §14: `{ v:1, t:'error', code, retryAfterMs? }`, codici in inglese; la frase la sceglie chi la mostra.
 */

export const VERSIONE_FILO = 1;
export const BYTE_MASSIMI = 1024 * 1024;

/** Codici della §14 più quelli chiesti dal mobile (§18, Nino3 punto 6) e quelli del modulo. */
export const CODICI = Object.freeze([
  'VERSION_UNSUPPORTED', 'NOT_PAIRED', 'PAIR_TOKEN_INVALID', 'PAIR_LOCKED', 'PAIR_REJECTED', 'PAIR_EXPIRED', 'REVOKED',
  'RATE_LIMITED', 'TOO_LARGE', 'BAD_MESSAGE', 'UNKNOWN_OPERATION', 'NOT_ALLOWED_REMOTELY', 'OPERATION_FAILED', 'WAKE_TOKEN_INVALID',
]);

function errore(code, message) {
  return Object.assign(new Error(message), { code });
}

/** Un messaggio pronto da scrivere sullo stream. Lancia `TOO_LARGE` se supera il tetto. */
export function codifica(messaggio) {
  const corpo = Buffer.from(JSON.stringify({ v: VERSIONE_FILO, ...messaggio }), 'utf8');
  if (corpo.length > BYTE_MASSIMI) throw errore('TOO_LARGE', `A message cannot exceed ${BYTE_MASSIMI} bytes.`);
  const testa = Buffer.alloc(4);
  testa.writeUInt32BE(corpo.length, 0);
  return Buffer.concat([testa, corpo]);
}

export function messaggioDiErrore(code, extra = {}) {
  return { t: 'error', code, ...(Number.isFinite(extra.retryAfterMs) ? { retryAfterMs: Math.max(0, Math.round(extra.retryAfterMs)) } : {}), ...(extra.n ? { n: extra.n } : {}) };
}

/**
 * Il lettore: riceve pezzi di byte nell'ordine dello stream e restituisce i messaggi interi. Un messaggio troppo grande, un JSON
 * rotto o una versione sconosciuta lanciano: chi legge risponde con l'errore e CHIUDE lo stream (non si risincronizza un flusso
 * a lunghezze dopo un errore: il resto non si sa più dove comincia).
 */
export function creaLettore() {
  let accumulo = Buffer.alloc(0);
  return {
    aggiungi(pezzo) {
      accumulo = accumulo.length ? Buffer.concat([accumulo, Buffer.from(pezzo)]) : Buffer.from(pezzo);
      const usciti = [];
      while (accumulo.length >= 4) {
        const lunghezza = accumulo.readUInt32BE(0);
        if (lunghezza > BYTE_MASSIMI) throw errore('TOO_LARGE', `A message cannot exceed ${BYTE_MASSIMI} bytes.`);
        if (accumulo.length < 4 + lunghezza) break;
        const corpo = accumulo.subarray(4, 4 + lunghezza);
        accumulo = accumulo.subarray(4 + lunghezza);
        let m;
        try { m = JSON.parse(corpo.toString('utf8')); } catch { throw errore('BAD_MESSAGE', 'A message is not valid JSON.'); }
        if (!m || typeof m !== 'object' || Array.isArray(m)) throw errore('BAD_MESSAGE', 'A message must be a JSON object.');
        if (m.v !== VERSIONE_FILO) throw errore('VERSION_UNSUPPORTED', 'This version of the remote protocol is not supported.');
        if (typeof m.t !== 'string' || !m.t) throw errore('BAD_MESSAGE', 'A message needs a type.');
        usciti.push(m);
      }
      return usciti;
    },
    /** Byte arrivati che non formano ancora un messaggio (a fine stream sono una troncatura). */
    get inSospeso() { return accumulo.length; },
  };
}
