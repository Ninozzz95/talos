# Browser

## Cosa fa

Raccoglie le pagine web che c'entrano con la sessione, in due forme diverse:

- **Letture dell'agente** — una pagina che l'agente ha letto: si vede **il testo
  che il modello ha ricevuto davvero**, con indirizzo, ora e lunghezza.
- **Pagine aperte da te** — scrivi un indirizzo e la pagina si apre dentro
  TALOS, quando il sito lo consente.

Ci sono avanti e indietro, ricarica, indirizzo modificabile (Invio conferma, Esc
annulla), copia dell'indirizzo, e **Annota**, che prepara un commento nel
composer senza inviarlo.

## Cosa non fa

- ⛔ **Alcuni siti non si lasciano aprire dentro un'altra pagina.** Quando
  succede, TALOS **dice perché** e propone di farla leggere all'agente invece di
  mostrare un riquadro bianco.
- ⛔ **Non si annota un singolo elemento dentro una pagina viva.** Si annota la
  pagina. È un limite tecnico dichiarato, non una dimenticanza.
- Non mostra mai un'anteprima inventata di una pagina che non ha letto.
- Del testo letto si mostra la versione leggibile, non il codice sorgente della
  pagina.

## Come si usa

Dalla schermata Browser della sessione: scrivi un indirizzo, oppure scorri le
letture che l'agente ha già fatto.

## Se va storto

- **«Il sito non consente di essere mostrato dentro TALOS»** — è una scelta del
  sito, e la frase è seguita dal rimedio. Usa la proposta di farlo leggere
  all'agente.
- **Una lettura è più corta del previsto** — la lunghezza dichiarata è quella
  vera del testo consegnato al modello: se è corta, il modello ha visto poco.

> Verificato in `harness-ui/frontend/src/components/browser.js:26-28`
> (l'intestazione «Letture della sessione» e il riepilogo che conta «letture
> dell'agente» e «pagine aperte da te») e alla riga 607, dove una pagina
> `bloccata` mostra il motivo del server oppure, in mancanza, «Il sito non
> consente di essere mostrato dentro TALOS» seguito da `rimedioPerIlMotivo`. Lo
> stesso testo è in `harness-ui/frontend/src/legacy/app.js:11808`. «Annota» è
> descritto alla riga 15 dello stesso componente e agisce alla riga 261
> (`paginaAnnotabile`).
> ⛔ Correzione del 13/09/2026: la sezione «Se va storto» citava «Questo sito non
> consente di essere aperto qui», una frase che **nel codice non esiste**.
