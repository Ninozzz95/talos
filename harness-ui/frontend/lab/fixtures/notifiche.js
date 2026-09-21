/*
 * Il pannello «Aspetta te» del mockup: una sola notifica di approvazione, nella
 * forma dei dati del monolite (`state.notifiche` = [{ sessione, stato }]).
 */
export const NOTIFICHE = Object.freeze([
  { stato: 'approvazione', sessione: { sessionId: 's-pulizia', nome: 'Store sessioni: pulizia', taskId: 'pulizia' } },
]);
/** L'ora come la scrive il mockup nella riga: «Vuole scrivere fuori dalla cartella · 17:51». */
export const ORA_NOTIFICA = () => '17:51';
export const ETICHETTA_MOCKUP = 'Vuole scrivere fuori dalla cartella';
