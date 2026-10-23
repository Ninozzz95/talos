/*
 * Controllo remoto — l'IDENTITÀ di questo PC: la chiave segreta dell'endpoint iroh (Ed25519, 32 byte) e la coppia VAPID (P-256)
 * che firma le sveglie Web Push (contratto v0.3 §B.4 ed §E). Tutte e due nel PORTACHIAVI del sistema, come le chiavi dei fornitori
 * (adattatore con lo scope del desktop: `adattatore-keyring.mjs`), mai su file.
 *
 * Una chiave per processo (condizione B.4 di Nino1): il desktop ha la sua, la CLI la sua, e sul telefono compaiono come due voci.
 * La chiave nasce alla prima accensione del remoto e resta: cambiarla vorrebbe dire riaccoppiare tutti i telefoni.
 *
 * La VAPID si genera con `crypto.createECDH('prime256v1')`, la stessa curva e la stessa forma di `web-push.generateVAPIDKeys()`
 * (chiave pubblica non compressa da 65 byte, privata da 32, in base64url: RFC 8292 §3.2, «uncompressed form … base64url»).
 */

import { createECDH, randomBytes } from 'node:crypto';

export const SERVIZIO_REMOTO = 'talos-harness-remote';

function errore(code, message) {
  return Object.assign(new Error(message), { code });
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');

/*
 * ⛔ 20/10/2026, IDX-03 rossa una volta su ~256: `ECDH.getPrivateKey()` toglie gli zeri in testa, e una privata che comincia
 *   con 0x00 esce da 31 byte. `web-push` 3.6.7 lo sa e la riempie (`src/vapid-helper.js:47-54`, «Occassionally the keys will
 *   not be padded to the correct lengh», web-push-libs/web-push#295); noi no, e alla lettura dopo la dichiaravamo «rovinata».
 *   ⇒ Si riempie alla nascita, e una privata già salvata più corta (da questa versione) si riempie alla lettura: è la stessa
 *   chiave, non una chiave guasta.
 */
const aSinistra = (buf, n) => (buf.length >= n ? buf : Buffer.concat([Buffer.alloc(n - buf.length), buf]));

function vapidNuova() {
  const e = createECDH('prime256v1');
  e.generateKeys();
  return { publicKey: b64url(aSinistra(e.getPublicKey(), 65)), privateKey: b64url(aSinistra(e.getPrivateKey(), 32)) };
}

export function creaIdentitaRemoto({ keyring, casuale = (n) => randomBytes(n), nuovaVapid = vapidNuova } = {}) {
  if (!keyring || typeof keyring.get !== 'function' || typeof keyring.set !== 'function') {
    throw errore('REMOTE_KEYRING_MISSING', 'Remote control needs the system keyring.');
  }
  const leggi = (voce) => {
    const v = keyring.get(SERVIZIO_REMOTO, voce);
    return typeof v === 'string' && v ? v : null;
  };
  return {
    /** I 32 byte della chiave dell'endpoint, creati alla prima volta. Una voce illeggibile NON si rigenera in silenzio. */
    chiaveEndpoint() {
      const salvata = leggi('endpoint');
      if (salvata) {
        const byte = Buffer.from(salvata, 'base64url');
        if (byte.length !== 32) throw errore('REMOTE_KEY_INVALID', 'The saved computer key is damaged: unpair the devices and reset remote control.');
        return Uint8Array.from(byte);
      }
      const nuova = Buffer.from(casuale(32));
      keyring.set(SERVIZIO_REMOTO, 'endpoint', b64url(nuova));
      return Uint8Array.from(nuova);
    },
    /** `{ publicKey, privateKey }` in base64url, creati alla prima volta. */
    vapid() {
      const salvata = leggi('vapid');
      if (salvata) {
        let v = null;
        try { v = JSON.parse(salvata); } catch { /* sotto */ }
        const privata = typeof v?.privateKey === 'string' ? Buffer.from(v.privateKey, 'base64url') : null;
        if (typeof v?.publicKey !== 'string' || !privata
          || Buffer.from(v.publicKey, 'base64url').length !== 65 || privata.length < 1 || privata.length > 32 || privata.every((b) => b === 0)) {
          throw errore('REMOTE_KEY_INVALID', 'The saved notification key is damaged: unpair the devices and reset remote control.');
        }
        /* Revisione del 20/10 (D8): accettare una privata più corta di 32 byte è sicuro solo se, riempita, dà ANCORA la pubblica
           salvata. Una privata troncata (un byte solo) prima era «rovinata» e ora passerebbe: le sveglie fallirebbero dopo, dal
           servizio push, invece di dirlo subito. */
        const piena = aSinistra(privata, 32);
        let coppiaGiusta = false;
        try { const verifica = createECDH('prime256v1'); verifica.setPrivateKey(piena); coppiaGiusta = b64url(verifica.getPublicKey()) === v.publicKey; } catch { /* fuori dalla curva: rovinata */ }
        if (!coppiaGiusta) throw errore('REMOTE_KEY_INVALID', 'The saved notification key is damaged: unpair the devices and reset remote control.');
        return { publicKey: v.publicKey, privateKey: b64url(piena) };
      }
      const nuova = nuovaVapid();
      keyring.set(SERVIZIO_REMOTO, 'vapid', JSON.stringify(nuova));
      return nuova;
    },
  };
}
