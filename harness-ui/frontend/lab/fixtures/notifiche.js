/*
 * Il pannello «Aspetta te» del mockup: una sola notifica di approvazione.
 * ⛔ 31/10/2026: nella forma del registro delle notifiche (la voce del contratto, `src/notifiche-registro.mjs`), non più quella del
 *   monolite (`state.notifiche` = [{ sessione, stato }]): il pannello nuovo legge `{ voci, totaleDaFare }`, e coi dati vecchi non
 *   disegnava nessuna riga (RIV-LAB-01 rossa nella suite del blocco 10).
 */
export const NOTIFICHE = Object.freeze({
  voci: Object.freeze([{
    id: 'approvazione:s-pulizia:k', seq: 1, fatto: 'approvazione', azione: 'scrivi',
    cosa: { tipo: 'sessione', id: 's-pulizia', nome: 'Store sessioni: pulizia' },
    dato: { genere: 'file', valore: '../store/sessioni.jsonl' }, porta: { tipo: 'sessione', id: 's-pulizia' },
    istante: '2026-10-31T17:51:00.000Z', stato: { visto: false, risolto: false },
  }]),
  totaleDaFare: 1,
});
/** L'ora come la scrive il mockup nella riga: «Vuole scrivere fuori dalla cartella · 17:51». */
export const ORA_NOTIFICA = () => '17:51';
export const ETICHETTA_MOCKUP = 'Vuole scrivere fuori dalla cartella';
