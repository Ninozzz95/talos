/*
 * I conteggi dei Luoghi come li mostra il mockup — nella forma in cui il
 * monolite li calcola: `attrezzi.length` di GET /api/v1/tools, `items.length`
 * di GET /api/v1/sessions, le liste della sessione aperta (`voci`, `memorie`,
 * `attivita`, `note`, `ricerche`, `strumenti` di tool-forge) e `items` delle
 * automazioni. Qui sono già ridotti al numero: il componente riceve il
 * conteggio, non la lista.
 */
export const CONTEGGI = Object.freeze({
  capability: 43,
  board: 69,
  libreria: 18,
  memoria: 7,
  attivita: 4,
  note: 11,
  ricerca: 6,
  officina: 2,
  automazioni: 3,
});
