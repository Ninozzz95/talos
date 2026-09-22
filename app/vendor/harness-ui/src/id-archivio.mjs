/*
 * ⛔⛔⛔ 14/09/2026 — L'ID DI UN ARCHIVIO (Note/Attività/Memoria) ARRIVA DA FUORI, e finiva dritto nel percorso di un file.
 *
 * Trovato dalla review ingegneristica del 13/09 (F01) e CONFERMATO dal vivo su un banco a porta effimera: una
 * `DELETE /api/v1/sessions/<id>/notes/..%5C<nome>` rispondeva 200 e cancellava un file FUORI da `.notes-store/`. La causa:
 * `http-app.mjs` fa `decodeURIComponent` dell'id e lo passa a `percorsoDi(cartella, id) = join(cartella, id + '.json')`,
 * senza nessun controllo — e lo stesso id arriva ANCHE dagli attrezzi del modello (`agent-service.mjs`, `argomenti?.id`),
 * quindi la porta era aperta pure a un prompt-injection, non solo a una richiesta HTTP sul loopback.
 *
 * La Libreria aveva già chiuso lo stesso buco il 10/09 (`library-store.mjs#idVoceLibreriaValido`), con QUESTA identica
 * grammatica. Le tre restanti no. La difesa sta nel magazzino, in un posto solo, così vale per tutti e due i chiamanti
 * (la persona via HTTP e il modello via attrezzo) e non c'è una seconda copia che un giorno diverge.
 *
 * ⛔ Un id fuori grammatica NON è un'eccezione: `percorsoDi` torna `null` e chi lo chiama si comporta come per un id
 *   assente — «questa voce non c'è». È vero (un id con una barra o `..` dentro non può nominare nessuna voce reale),
 *   tiene l'idempotenza delle `elimina*` (un id già assente non è un errore) e non arriva in faccia al modello come un
 *   guasto nuovo per una chiamata che oggi si chiude con un «non trovato». È la stessa scelta della Libreria.
 *
 * ⛔ La grammatica è quella della Libreria, non quella (più stretta, coi nomi riservati di Windows) della patch della
 *   review: gli id di questi archivi li genera SEMPRE `randomUUID()` (solo esadecimali e trattini), il primo carattere
 *   dev'essere alfanumerico — quindi `..`, `a/b`, `a\b`, un id vuoto e ogni separatore o `..` sono già respinti, cioè
 *   TUTTO ciò che fa uscire dalla cartella. Restare sulla stessa grammatica della Libreria è la regola di casa: una
 *   difesa sola, non due che divergono.
 */
export function idArchivioValido(id) {
  return typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id);
}
