/*
 * I tre toast del mockup (#toast-nota, #toast-riuscito, #toast-guasto), nella
 * forma dei dati che `toast()` del monolite passa: titolo (= badge), messaggio,
 * azione facoltativa. Il tono è dichiarato perché i titoli del mockup sono le
 * parole del tono stesso.
 */
export const TOAST = Object.freeze([
  { id: 'nota', tono: 'nota', titolo: 'Nota', messaggio: 'La lettura della pagina è pronta.', azione: { etichetta: 'Esamina pagina', dati: 'browser' } },
  { id: 'riuscito', tono: 'riuscito', titolo: 'Riuscito', messaggio: 'Qwen3 8B è disponibile sul disco.', azione: { etichetta: 'Apri modelli', dati: 'installati' } },
  { id: 'guasto', tono: 'guasto', titolo: 'Guasto', messaggio: 'Download interrotto. I dati già ricevuti sono conservati.', azione: { etichetta: 'Vedi download', dati: 'download' } },
]);
