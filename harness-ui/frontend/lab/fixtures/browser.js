/*
 * Le due letture del Browser del mockup (05/09, ore di Roma), nella forma delle pagine vere raccolte
 * dall'attrezzo `naviga`: { url, testo, quando }. La seconda è quella mostrata.
 */
export const LETTURE_BROWSER = Object.freeze([
  { url: 'https://example.org', testo: 'Pagina iniziale del progetto\n\nBenvenuto.', quando: '2026-09-05T08:39:00.000Z' },
  { url: 'https://example.org/documentazione', testo: "Registro dei processi\n\nIl registro raccoglie i processi avviati durante una sessione e mostra l’ultimo evento ricevuto.\n\nRiconoscere uno stallo\n- Silenzio prolungato: nessun nuovo evento.\n- Giri a vuoto: la stessa richiesta ripetuta senza progresso.\n- Il processo resta disponibile per una decisione dell’utente.\n\nUna segnalazione di stallo non termina il processo.", quando: '2026-09-05T08:42:00.000Z' },
]);
export const STATO_BROWSER = Object.freeze({ attiva: 1 });
