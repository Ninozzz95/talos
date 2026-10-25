/**
 * 24/10/2026 — il punto di un ramo (`forkPrimaDelGiro`): l'id di un giro, nella grammatica degli id di sessione (la stessa delle
 * operazioni del remoto). Qualunque altra cosa (null, '', un oggetto) vuol dire «ramo dell'intera conversazione», e il campo NON si
 * scrive: assente, mai null (richiesta della CLI, 24/10, perché «assente = come oggi» valga per ogni lettore).
 *
 * Un modulo suo perché lo leggono il registro (intestazione, ripristino, elenco) e la rotta HTTP del fork, e la rotta non importa il
 * registro.
 */
export function puntoDelRamo(valore) {
  return typeof valore === 'string' && /^(?!\.+$)[A-Za-z0-9._:-]{1,200}$/u.test(valore);
}
