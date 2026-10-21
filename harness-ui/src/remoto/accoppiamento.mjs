/*
 * Controllo remoto — l'ACCOPPIAMENTO di un telefono a questo PC (contratto v0.3 §D, mockup v5 approvato dall'owner il 17/10/2026).
 *
 * Tre gesti (§19.1): il PC mostra il QR · il telefono lo inquadra e chiama il PC sull'ALPN d'accoppiamento presentando il gettone ·
 * la persona confronta il codice di 6 cifre e conferma SUL PC. Nessun server tiene niente: gettoni e attese vivono qui, in memoria.
 *
 * Tetti presi da Hermes (`gateway/pairing.py:29-37`, clone hermes-agent-2026-10-07, letto il 18/10/2026: «max 3 pending per
 * platform … lockout after 5 failed approvals … codes never logged»), stretti dove il nostro gettone vale di più:
 *   · gettone monouso di 128 bit, valido 5 minuti (Hermes: 1 ora, ma il loro codice apre una chat, il nostro l'Accesso pieno);
 *   · al più 3 offerte aperte: la quarta chiude la più vecchia (le apre la persona davanti al PC, non può restare chiusa fuori);
 *   · 5 tentativi sbagliati ⇒ 15 minuti di blocco. Contano anche i codici RIFIUTATI dalla persona (Nino1, contratto §18.2).
 *   · il gettone non entra mai in un messaggio d'errore né in un registro.
 *
 * Il codice di 6 cifre è un SAS «a confronto numerico», come il Numeric Comparison del Bluetooth (Core Spec v5.4, Vol 3 Part H
 * §2.3.5.6.4, funzione g2: valore a 32 bit mod 10^6 calcolato sulle chiavi dei due capi e su un nonce): qui SHA-256 su etichetta di
 * dominio, i due EndpointId e il gettone. Un QR fotografato e rigiocato da un altro telefono dà un codice DIVERSO, perché cambia
 * l'EndpointId di chi chiama. Il telefono lo calcola nello stesso modo (contratto, sezione del filo).
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const ALPN_LAVORO = 'talos-remote/1';
export const ALPN_ACCOPPIAMENTO = 'talos-remote-pair/1';
export const ETICHETTA_CODICE = 'talos-remote-pair/v1';
export const DURATA_OFFERTA_MS = 5 * 60_000;
export const OFFERTE_APERTE_MASSIME = 3;
export const TENTATIVI_SBAGLIATI_MASSIMI = 5;
export const BLOCCO_MS = 15 * 60_000;
/* Una conferma lasciata a metà sul PC non resta aperta per sempre: stessa vita del gettone che l'ha aperta. */
export const DURATA_ATTESA_MS = DURATA_OFFERTA_MS;
const BYTE_GETTONE = 16;

function errore(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}

const base64url = (buf) => Buffer.from(buf).toString('base64url');

/** Il codice di 6 cifre: SHA-256(etichetta ‖ 0 ‖ pcId ‖ 0 ‖ telefonoId ‖ 0 ‖ gettone), primi 4 byte big-endian, mod 10^6. */
export function codiceDiVerifica({ pcId, telefonoId, gettone }) {
  if (typeof pcId !== 'string' || !pcId || typeof telefonoId !== 'string' || !telefonoId) throw errore('PAIR_BAD_INPUT', 'Both endpoint ids are needed.');
  const byteGettone = Buffer.from(String(gettone ?? ''), 'base64url');
  if (byteGettone.length !== BYTE_GETTONE) throw errore('PAIR_BAD_INPUT', 'The pairing token must be 16 bytes.');
  const zero = Buffer.from([0]);
  const impronta = createHash('sha256')
    .update(Buffer.from(ETICHETTA_CODICE, 'utf8')).update(zero)
    .update(Buffer.from(pcId, 'utf8')).update(zero)
    .update(Buffer.from(telefonoId, 'utf8')).update(zero)
    .update(byteGettone)
    .digest();
  return String(impronta.readUInt32BE(0) % 1_000_000).padStart(6, '0');
}

/** Il testo del QR (contratto v0.3 §D). `exp` in secondi Unix. */
export function testoDelQr({ pcId, relay, gettone, scadeAlle }) {
  const parti = [`pc=${encodeURIComponent(pcId)}`];
  if (relay) parti.push(`relay=${encodeURIComponent(relay)}`);
  parti.push(`t=${gettone}`, `exp=${Math.floor(scadeAlle / 1000)}`);
  return `talos-remote:1?${parti.join('&')}`;
}

/**
 * Le offerte e le conferme in attesa di QUESTO PC. `clock` e `casuale` si iniettano nelle prove.
 * Nessun metodo restituisce un gettone diverso da quello appena creato da `apri()`.
 */
export function creaAccoppiamento({ clock = () => Date.now(), casuale = (n) => randomBytes(n) } = {}) {
  /** gettone (base64url) → { scadeAlle } */
  const offerte = new Map();
  /** id dell'attesa → { telefonoId, nome, sveglia, codice, scadeAlle, risolvi } */
  const attese = new Map();
  let sbagliati = 0;
  let bloccatoFinoA = 0;

  const pulisci = () => {
    const ora = clock();
    for (const [g, o] of offerte) if (o.scadeAlle <= ora) offerte.delete(g);
    for (const [id, a] of attese) if (a.scadeAlle <= ora) { attese.delete(id); a.risolvi({ esito: 'scaduto' }); }
    if (bloccatoFinoA && bloccatoFinoA <= ora) { bloccatoFinoA = 0; sbagliati = 0; }
  };
  const bloccato = () => {
    if (bloccatoFinoA > clock()) throw errore('PAIR_LOCKED', 'Too many wrong pairing attempts: pairing is paused for a while.', { retryAfterMs: bloccatoFinoA - clock() });
  };
  const sbaglia = () => {
    sbagliati += 1;
    if (sbagliati >= TENTATIVI_SBAGLIATI_MASSIMI) {
      bloccatoFinoA = clock() + BLOCCO_MS;
      offerte.clear(); /* nel blocco nessun QR già mostrato resta buono */
    }
  };
  const confronta = (a, b) => {
    const x = Buffer.from(a, 'utf8'); const y = Buffer.from(b, 'utf8');
    return x.length === y.length && timingSafeEqual(x, y);
  };

  return {
    /** Una nuova offerta per il QR. Lancia `PAIR_LOCKED` durante il blocco. */
    apri({ pcId, relay = null } = {}) {
      pulisci(); bloccato();
      if (offerte.size >= OFFERTE_APERTE_MASSIME) {
        const piuVecchia = [...offerte.entries()].sort((p, q) => p[1].scadeAlle - q[1].scadeAlle)[0];
        offerte.delete(piuVecchia[0]);
      }
      const gettone = base64url(casuale(BYTE_GETTONE));
      const scadeAlle = clock() + DURATA_OFFERTA_MS;
      offerte.set(gettone, { scadeAlle });
      return { gettone, scadeAlle, qr: pcId ? testoDelQr({ pcId, relay, gettone, scadeAlle }) : null };
    },

    /** La persona ha chiuso la finestra del QR: il gettone non vale più. */
    chiudi(gettone) { offerte.delete(String(gettone ?? '')); },

    /**
     * Il telefono ha chiamato sull'ALPN d'accoppiamento. `telefonoId` è `remoteId()` della connessione (mai un campo del messaggio).
     * Il gettone si BRUCIA qui, giusto o sbagliato che poi sia il codice. Torna `{ id, codice, attendi }`: `attendi()` si risolve con
     * `{ esito: 'confermato' | 'rifiutato' | 'scaduto' | 'annullato' }`.
     */
    presenta({ gettone, pcId, telefonoId, nome = null, piattaforma = null, sveglia = null }) {
      pulisci(); bloccato();
      const presentato = String(gettone ?? '');
      let trovato = null;
      for (const g of offerte.keys()) if (confronta(g, presentato)) trovato = g;
      if (!trovato) {
        sbaglia();
        if (bloccatoFinoA) bloccato();
        throw errore('PAIR_TOKEN_INVALID', 'This pairing code is unknown, already used or expired.');
      }
      offerte.delete(trovato);
      const codice = codiceDiVerifica({ pcId, telefonoId, gettone: trovato });
      const id = base64url(casuale(12));
      let risolvi;
      const promessa = new Promise((r) => { risolvi = r; });
      const testo = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
      attese.set(id, { telefonoId, nome: testo(nome, 64), piattaforma: testo(piattaforma, 40), sveglia, codice, scadeAlle: clock() + DURATA_ATTESA_MS, risolvi });
      return { id, codice, attendi: () => promessa };
    },

    /** Le conferme che il PC sta mostrando (per l'interfaccia): mai il gettone. */
    inAttesa() {
      pulisci();
      return [...attese.entries()].map(([id, a]) => ({ id, telefonoId: a.telefonoId, nome: a.nome, piattaforma: a.piattaforma, codice: a.codice, scadeAlle: a.scadeAlle }));
    },

    /** I dati del telefono di un'attesa ancora viva (per registrarlo PRIMA di risvegliare chi aspetta), o lancia. */
    dati(id) {
      pulisci();
      const a = attese.get(id);
      if (!a) throw errore('PAIR_NOT_PENDING', 'This pairing request is no longer waiting.');
      return { telefonoId: a.telefonoId, nome: a.nome, piattaforma: a.piattaforma, sveglia: a.sveglia };
    },

    /** «Collega» sul PC. `extra` arriva a chi aspetta (il dispositivo appena registrato). Lancia se l'attesa non c'è più. */
    conferma(id, extra = {}) {
      pulisci();
      const a = attese.get(id);
      if (!a) throw errore('PAIR_NOT_PENDING', 'This pairing request is no longer waiting.');
      attese.delete(id);
      a.risolvi({ ...extra, esito: 'confermato' });
      return { telefonoId: a.telefonoId, nome: a.nome, sveglia: a.sveglia };
    },

    /** «Annulla» sul PC: conta come un tentativo sbagliato (il codice non tornava, o non era la persona). */
    rifiuta(id) {
      pulisci();
      const a = attese.get(id);
      if (!a) return false;
      attese.delete(id);
      sbaglia();
      a.risolvi({ esito: 'rifiutato' });
      return true;
    },

    /** Il telefono ha annullato o è caduto prima della conferma: non conta come sbagliato. */
    annulla(id) {
      const a = attese.get(id);
      if (!a) return false;
      attese.delete(id);
      a.risolvi({ esito: 'annullato' });
      return true;
    },

    stato() {
      pulisci();
      return { offerteAperte: offerte.size, inAttesa: attese.size, sbagliati, bloccatoFinoA: bloccatoFinoA || null };
    },
  };
}
