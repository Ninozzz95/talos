/**
 * spegnimento.mjs — come si ferma il server del Codice (SIGINT/SIGTERM da `server.mjs`).
 *
 * ⛔⛔⛔ 24/09/2026 (difetto 6 del ledger B3, trovato sul Pad): dopo reinstallazione e riavvio dell'app restavano DUE
 * server. Il plugin (`TalosTerminalPlugin.kt`) manda SIGTERM al vecchio e ne lancia uno nuovo; lo spegnimento era
 * `server.close(() => process.exit(0))`. Ma `close()` chiude solo le connessioni INATTIVE — non quelle «sending a
 * request or waiting for a response» (Node, `http.Server.close`, https://nodejs.org/api/http.html, letto il 24/09/2026)
 * — e il flusso di eventi del Codice (`/api/v1/sessions/:id/events`) è una risposta che non finisce mai. L'app ne aveva
 * aperto uno un istante prima del SIGTERM: la callback di `close` non è mai arrivata, il processo è rimasto vivo per
 * sempre (PPID 1, fuori porta) e l'app è rimasta attaccata al codice vecchio.
 *
 * Cura, dalla stessa pagina di Node:
 *  - `closeAllConnections()` (dalla v18.2.0; sul Pad gira la v24.18.0) chiude anche le connessioni attive, e va
 *    chiamata DOPO `close()` «to avoid race conditions where new connections are created between» le due chiamate;
 *    il client (EventSource) si ricollega da solo — al server nuovo, che ora ha la porta;
 *  - una rete di sicurezza: se qualcos'altro tiene vivo il processo, dopo `attesaMassimaMs` esce comunque, con codice 1
 *    perché non è stata un'uscita pulita. Il timer è `unref`: non tiene vivo il processo da solo.
 * Una volta sola: SIGINT e SIGTERM possono arrivare entrambi.
 *
 * Stava in una riga di `server.mjs`; è qui per poterlo provare senza avviare il server intero
 * (`tests/unit/harness/codiceSpegnimento.test.ts`).
 *
 * @param {{
 *   server: import('node:http').Server,
 *   fermaAltro?: () => void,
 *   esci?: (codice: number) => void,
 *   attesaMassimaMs?: number,
 * }} opzioni
 * @returns {() => void}
 */
export function creaSpegnimento({
  server,
  fermaAltro = () => {},
  esci = (codice) => process.exit(codice),
  attesaMassimaMs = 2000,
}) {
  let avviato = false;
  return () => {
    if (avviato) return;
    avviato = true;
    try {
      fermaAltro();
    } catch (errore) {
      // Lo scheduler che non si ferma non deve impedire al server di chiudersi.
      console.error('[spegnimento] arresto dei servizi interni fallito:', errore instanceof Error ? errore.message : errore);
    }
    const reteDiSicurezza = setTimeout(() => {
      console.error(`[spegnimento] connessioni ancora aperte dopo ${attesaMassimaMs} ms: uscita forzata`);
      esci(1);
    }, attesaMassimaMs);
    reteDiSicurezza.unref?.();
    server.close(() => {
      clearTimeout(reteDiSicurezza);
      esci(0);
    });
    server.closeAllConnections?.();
  };
}
