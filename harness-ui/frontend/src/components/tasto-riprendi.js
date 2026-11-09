/**
 * Decisione 198 (owner 04/11/2026, forma con l'OK di Performance, CLI e Mobile; owner 213 D2 a, D4 a) — il ▶ della barra della chat.
 *
 * Prima il ▶ era sempre acceso: dopo una risposta finita mandava `/resume` senza testo e il modello rispondeva di nuovo alla stessa
 * domanda, a pagamento. Ora si accende solo quando c'è un giro da riprendere: dopo uno Stop, un errore, i giri finiti, o
 * un'interruzione (`daRiprendere` del server, `src/da-riprendere.mjs`). Il server resta l'autorità (`nothing-to-resume`); il tasto non
 * promette quello che il server rifiuterebbe.
 *
 * Le regole (una funzione sola, provata dai casi comuni `contracts/da-riprendere.casi.json` e da `tests/riprendi-198-199-pc.test.mjs`):
 * - la riga dell'elenco è l'autorità all'apertura e a ogni rilettura dell'elenco (D4); fra una rilettura e l'altra si piegano gli eventi
 *   VIVI con `passoDaRiprendere` (la rigiocata no: la riga li ha già contati, e l'interruzione la sa solo la riga);
 * - spento a giro in corso, a contatto perso col server, e quando la sessione non c'è più nell'elenco, finché la sua riga non torna
 *   (condizione del Mobile);
 * - spento non vuol dire nascosto: resta raggiungibile da tastiera e il titolo dice quando si accende (niente avvisi).
 */
import { passoDaRiprendere, STATO_INIZIALE_DA_RIPRENDERE, MOTIVI_DA_RIPRENDERE } from '../../../src/da-riprendere.mjs';

/** Lo stato del ▶ da com'è la riga dell'elenco (`daRiprendere` del server). Un valore che non conosce vale «niente». */
export function statoDaRiprendereDallaRiga(riga) {
  const valore = riga?.daRiprendere;
  return { ...STATO_INIZIALE_DA_RIPRENDERE, valore: MOTIVI_DA_RIPRENDERE.includes(valore) ? valore : null };
}

/** Un evento vivo sul ▶: la stessa tabella del server. */
export function piegaEventoDaRiprendere(stato, evento) {
  return passoDaRiprendere(stato ?? STATO_INIZIALE_DA_RIPRENDERE, evento);
}

/**
 * ⇒ `{ acceso, chiaveTitolo }`. `chiaveTitolo` è la chiave del dizionario (`modello.chat.resumeReady` / `modello.chat.resumeNothing`).
 */
export function statoTastoRiprendi({ stato, giroAttivo = false, contattoPerso = false, rigaPresente = true } = {}) {
  const acceso = !giroAttivo && !contattoPerso && rigaPresente !== false && MOTIVI_DA_RIPRENDERE.includes(stato?.valore);
  return { acceso, chiaveTitolo: acceso ? 'modello.chat.resumeReady' : 'modello.chat.resumeNothing' };
}
