/*
 * Controllo remoto — il TRASPORTO iroh del PC (contratto v0.3 §A): un endpoint QUIC con TLS 1.3 a chiavi nude (RFC 7250), la cui
 * identità È la chiave Ed25519 del PC. Diretto quando si può, altrimenti un relay: quelli gratuiti di n0 o `talos-relay` della
 * persona (scelta «al primo avvio», owner 17/10, contratto §19.2).
 *
 * Fa solo il trasporto: per ogni connessione legge `remoteId()` (dall'handshake, mai da un messaggio) e l'ALPN, prende il PRIMO
 * bi-stream che il telefono apre e lo passa al servizio (`servizio.mjs`), che decide tutto il resto. Le forme usate qui sono quelle
 * del binding Node `@number0/iroh` 1.1.0 (index.d.ts, letto il 18/10/2026) e delle sonde del 17/10 (`TALOS-RICERCHE/prove/
 * iroh-2026-10-17/probe-reverse.mjs`, `remoto-lato-pc-2026-10-17/pc-node.mjs`): `acceptNext()` → `accept()` → `connect()`,
 * `acceptBi()`, `recv.read(n)` che torna null a fine stream, `send.writeAll/finish`, `close(codice, motivo)`, `closed()`.
 *
 * ⛔ Una chiave per processo (condizione B.4): «make sure no other endpoint is using the same key at the same time». Il servizio
 *   desktop ha la SUA chiave nel portachiavi; la CLI la sua.
 * ⛔ Il modulo nativo arriva dal binding compilato nella nostra CI (owner 18/10, rustls ≥ 0.23.45, RUSTSEC-2026-0285): qui si
 *   riceve già caricato (`iroh`), così le prove usano un finto e il pacchetto sceglie quale binario.
 */

import { ALPN_ACCOPPIAMENTO, ALPN_LAVORO } from './accoppiamento.mjs';

const BYTE_PER_LETTURA = 64 * 1024;
const PORTA_QUIC_RELAY = 7842;

/** L'indirizzo del relay da mostrare nella finestra: senza il gettone. */
export function relaySenzaGettone(url) {
  try {
    const u = new URL(String(url));
    if (!u.searchParams.has('token')) return String(url);
    u.searchParams.delete('token');
    return u.toString();
  } catch { return String(url); }
}
export const ATTESA_STREAM_MS = 10_000;
const comeByte = (testo) => Array.from(Buffer.from(testo, 'utf8'));
const daByte = (arr) => Buffer.from(arr ?? []).toString('utf8');

function errore(code, message) {
  return Object.assign(new Error(message), { code });
}

/**
 * La regola dell'indirizzo di un server proprio, in UN posto solo: un URL valido, in `https` (`http` solo verso la propria macchina,
 * per le prove). Torna l'URL analizzato o lancia `REMOTE_RELAY_INVALID`. La usano l'accensione (`configuraRelay`) e — revisione a
 * blocco 3, 24/10/2026, D-C3 — anche il salvataggio della scelta (`relayValido` di index.mjs): prima un indirizzo storto si salvava
 * a remoto spento e l'errore arrivava solo all'accensione, dopo il «sì» della carta.
 */
export function analizzaIndirizzoRelay(url) {
  let analizzato;
  try { analizzato = new URL(String(url ?? '')); } catch { throw errore('REMOTE_RELAY_INVALID', 'The relay address is not a valid URL.'); }
  /* `http:` solo verso la propria macchina (le prove): fuori casa il relay va in https */
  const locale = ['127.0.0.1', 'localhost', '[::1]'].includes(analizzato.hostname);
  if (analizzato.protocol !== 'https:' && !(analizzato.protocol === 'http:' && locale)) throw errore('REMOTE_RELAY_INVALID', 'The relay address must use https.');
  return analizzato;
}

/** La modalità del relay dalla scelta della persona: `{ modo: 'n0' }` o `{ modo: 'proprio', url }`. */
export function configuraRelay(iroh, builder, relay) {
  if (relay?.modo === 'proprio') {
    const url = String(relay.url ?? '');
    const analizzato = analizzaIndirizzoRelay(url);
    iroh.presetMinimal(builder);
    /* R5.9 (owner 18/10, «gettone nell'indirizzo»): `talos-relay` stampa `https://dominio/?token=…`. Il gettone si stacca
       dall'indirizzo e va nell'header `Authorization` (`RelayConfig.authToken` del binding), così non finisce nei registri del
       server; iroh-relay v1.3.0 lo leggerebbe anche dalla query, ed è per questo che il QR può portare l'indirizzo intero.
       La porta QUIC è quella che `fromUrls` mette di serie (iroh-relay `DEFAULT_RELAY_QUIC_PORT` = 7842). */
    const gettone = analizzato.searchParams.get('token');
    if (gettone) {
      analizzato.searchParams.delete('token');
      const mappa = iroh.RelayMap.empty();
      mappa.insert({ url: analizzato.toString(), quicPort: PORTA_QUIC_RELAY, authToken: gettone });
      builder.relayMode(iroh.RelayMode.custom(mappa));
      return;
    }
    builder.relayMode(iroh.RelayMode.customFromUrls([url]));
    return;
  }
  /* Solo percorso diretto, nessun relay e nessuna scoperta: le prove sulla stessa macchina (mai la rete vera nelle prove,
     contratto §17) e chi vuole restare in casa. */
  if (relay?.modo === 'solo-diretto') {
    iroh.presetMinimal(builder);
    builder.relayMode(iroh.RelayMode.disabled());
    return;
  }
  iroh.presetN0(builder);
}

/** Lo stream iroh nella forma che il servizio si aspetta. */
function adattaStream(bi) {
  return {
    async leggi() {
      const pezzo = await bi.recv.read(BYTE_PER_LETTURA);
      return pezzo == null ? null : Uint8Array.from(pezzo);
    },
    scrivi: (byte) => bi.send.writeAll(Array.from(byte)),
    finisci: () => bi.send.finish(),
  };
}

/**
 * Avvia l'endpoint e accetta per sempre. Torna `{ id, indirizzo(), ferma() }`.
 * `chiaveSegreta`: 32 byte (dal portachiavi). `gestisci(connessione)`: `servizio.gestisci`.
 */
export async function avviaTrasportoIroh({ iroh, chiaveSegreta, relay = { modo: 'n0' }, gestisci, avvisa = () => {} }) {
  if (!iroh?.Endpoint) throw errore('REMOTE_NO_TRANSPORT', 'The remote-control transport is not available on this computer.');
  if (!chiaveSegreta || chiaveSegreta.length !== 32) throw errore('REMOTE_KEY_INVALID', 'The computer key must be 32 bytes.');
  const builder = iroh.Endpoint.builder();
  configuraRelay(iroh, builder, relay);
  builder.alpns([comeByte(ALPN_LAVORO), comeByte(ALPN_ACCOPPIAMENTO)]);
  builder.secretKey(Array.from(chiaveSegreta));
  const endpoint = await builder.bind();
  let fermato = false;

  const accetta = async (incoming) => {
    let conn;
    try { conn = await (await incoming.accept()).connect(); } catch (e) { avvisa({ tipo: 'handshake-fallito', motivo: String(e?.message ?? e).slice(0, 200) }); return; }
    const remoteId = conn.remoteId().toString();
    const alpn = daByte(conn.alpn());
    let chiusaGia = false;
    const chiudi = (codice) => {
      if (chiusaGia) return;
      chiusaGia = true;
      try { conn.close(0n, comeByte(String(codice ?? 'DONE').slice(0, 64))); } catch { /* già chiusa */ }
    };
    const chiusa = conn.closed().then(() => {}, () => {});
    const percorso = () => {
      const p = conn.paths?.().find((x) => x.isSelected);
      return p ? { tipo: p.isRelay ? 'relay' : 'diretto', rttMs: Number.isFinite(Number(p.rttMs)) ? Math.round(Number(p.rttMs)) : null } : null;
    };
    let bi;
    /* Il telefono apre UN bi-stream per connessione (filo v1 §2-3); l'ALPN sconosciuto si chiude senza aspettarlo. */
    if (alpn !== ALPN_LAVORO && alpn !== ALPN_ACCOPPIAMENTO) return gestisci({ remoteId, alpn, chiusa, stream: null, chiudi, percorso });
    /* Contratto §13: una connessione muta si chiude dopo 10 s, non resta a occupare il PC. */
    let scadenza;
    const tetto = new Promise((_, rifiuta) => { scadenza = setTimeout(() => rifiuta(errore('NO_STREAM', 'No stream opened in time.')), ATTESA_STREAM_MS); });
    try { bi = await Promise.race([conn.acceptBi(), tetto]); } catch { chiudi('NO_STREAM'); return; } finally { clearTimeout(scadenza); }
    await gestisci({ remoteId, alpn, chiusa, stream: adattaStream(bi), chiudi, percorso });
  };

  (async () => {
    while (!fermato) {
      let incoming;
      try { incoming = await endpoint.acceptNext(); } catch (e) { avvisa({ tipo: 'accettazione-fallita', motivo: String(e?.message ?? e).slice(0, 200) }); continue; }
      if (!incoming) break;
      accetta(incoming).catch((e) => avvisa({ tipo: 'connessione-fallita', motivo: String(e?.message ?? e).slice(0, 200) }));
    }
  })();

  return {
    id: endpoint.id().toString(),
    /** Il relay di casa che il QR porta (null se non è ancora in linea). */
    relayDiCasa() {
      try { return endpoint.addr().relayUrl() ?? null; } catch { return null; }
    },
    /** Gli indirizzi diretti di adesso (il QR può portarli quando la scoperta è spenta, contratto §B.6). */
    indirizziDiretti() {
      try { return endpoint.addr().directAddresses() ?? []; } catch { return []; }
    },
    online: () => endpoint.online(),
    async ferma() {
      fermato = true;
      try { await endpoint.close(); } catch { /* già chiuso */ }
    },
  };
}
