# T04-coda-e-reindirizzo — Scrivere MENTRE il modello lavora: coda, bivio, reindirizzo

> Prova d'uso sul 4174, guidata come farebbe una persona. 2026-09-06 13:01

## Passi

- **la pillola del permesso** ✅
  - atteso: dice il permesso E le eccezioni per attrezzo che valgono davvero (B11)
  - visto: Accesso completo
- **cancelli per attrezzo rimessi a «come la sessione»** ✅
  - atteso: il giro di prova parte senza eccezioni addosso
  - visto: 0 rimessi
- **sessione avviata** ✅
  - atteso: una sessione vera in corso
  - visto: 42272ac4
- **cosa promette il composer** ✅
  - atteso: il segnaposto dice come si accoda e come si indirizza
  - visto: Scrivi un follow-up… Invio per scegliere, Ctrl+Invio accoda
- **Ctrl+Invio durante il giro** ✅
  - atteso: il messaggio va in coda e la coda si VEDE, col modo di toglierlo (B15)
  - visto: composer="" · banner={"visibile":true,"testo":"1 in coda «Aggiungi anche un esempio di uso per ogni funzione.» — parte alla fine di questo giro Tog"} · toast=["Avvio in corsoprogetto-5 · esecuzione diretta sulla cartella vera, nessuna copia.","Messaggio in codaArriverà quando l'agente conclude il turno corrente (posizione 1)."]
- **Invio durante il giro** ✅
  - atteso: due pulsanti sotto il composer: indirizza ora / accoda, e il testo resta scritto (B14)
  - visto: {"visibile":true,"domanda":"«E dimmi anche quanto costa in tempo.» — il giro è in corso: lo indirizzo adesso o lo mett","pulsanti":["Indirizza ora","Accoda Ctrl ↵","Annulla"],"composer":"E dimmi anche quanto costa in tempo."}
- **Esc sul bivio** ✅
  - atteso: chiude il bivio, lascia la frase nel composer e NON chiede ancora di fermare il giro
  - visto: {"bivio":true,"composer":"E dimmi anche quanto costa in tempo.","velo":false}
- **Esc con niente da chiudere** ❌
  - atteso: chiede conferma prima di fermare il giro (B16)
  - visto: null

> ⛔ **T04-coda-e-reindirizzo-D1** (medio): Esc non chiede di fermare il giro: la decisione B16 vuole Esc, conferma, stop
- **il pulsante «Reindirizza»** ✅
  - atteso: compare quando c'è un giro in corso e testo scritto
  - visto: {"visibile":true,"etichetta":"Reindirizza con il testo scritto","disabilitato":false}
- **dopo il reindirizzo** ✅
  - atteso: il composer si svuota e lo schermo dice che il reindirizzo è partito
  - visto: {"toast":["Messaggio in codaArriverà quando l'agente conclude il turno corrente (posizione 1).","Reindirizzamento richiestoLa correzione verrà applicata al prossimo punto sicuro."],"composer":""}
- **esito del giro** ✅
  - atteso: la sessione si conclude
  - visto: conclusa=true · esito successo
- **il messaggio accodato** ✅
  - atteso: consegnato al modello quando il giro lo permette, e visibile in chat
  - visto: in chat

## Verdetto

**PASSA CON RISERVA** — difetti trovati: 1 (T04-coda-e-reindirizzo-D1).
