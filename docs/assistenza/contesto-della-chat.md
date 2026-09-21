# Il contesto della chat

## Cosa fa

Una conversazione lunga prima o poi riempie la finestra del modello. Questa è la
schermata che la **gestisce**: dice quanto contesto stai usando, prepara una
**sintesi** quando serve, e ti lascia decidere cosa non deve andare perso.

Quattro cose, in ordine di quanto le userai:

1. **La misura** — token in ingresso, finestra del modello, quanto è riservato
   alla risposta. La misura dice anche **da dove viene**: conteggio del motore,
   conteggio del fornitore, oppure stima. E se il contesto è cambiato dopo la
   misura, lo dichiara invece di mostrare un numero vecchio come se fosse fresco.
2. **La compattazione** — la sintesi che libera spazio. Si può lasciar fare
   automaticamente («TALOS prepara una sintesi quando il contesto si riempie»)
   oppure lanciarla a mano con **Compatta ora**.
3. **Da non dimenticare** — i fatti che devono sopravvivere alla sintesi. Restano
   **separati** dalla sintesi, si aggiungono, si modificano e si rimuovono.
4. **Versioni** — le sintesi salvate. Si può **ripristinare** una versione
   precedente; i messaggi successivi restano nella chat.

Una compattazione attraversa stati con un nome ciascuno: **In attesa**,
**Preparazione**, **Compattazione contesto in corso**, **Verifica della
sintesi**, **Pubblicazione in corso**, **Contesto aggiornato** — e, quando va
storto, **Compattazione in pausa**, **Compattazione annullata**, **Compattazione
non riuscita**. ⛔ Le ultime tre portano la parola «Compattazione» davanti: a
schermo non si leggono mai come «In pausa» o «Annullata» da sole.

## Cosa non fa

- ⛔ **Gli originali non vengono cancellati.** La schermata lo dice da sé: «Solo
  questa chat. Gli originali restano disponibili.» La sintesi è ciò che il
  modello legge, non ciò che resta sul disco.
- ⛔ **Non vale per tutte le conversazioni.** Se non è ancora attivo per questa
  chat, lo dichiara — «nessun messaggio è stato modificato» — invece di
  comportarsi come se lo fosse.
- **La misura può mancare.** Quando non c'è, dice «Misura non ancora
  disponibile» o «Non disponibile»: mai uno zero al posto di un dato assente.
- **La ricerca semantica locale può non esserci.** In quel caso lo dice, e la
  ricerca testuale resta attiva.
- **La compattazione nativa non è per tutti i modelli**: dove non è qualificata,
  la riga lo scrive.

## Come si usa

Dalla conversazione, apri la gestione del contesto.

- Per lasciar fare: accendi **Gestisci automaticamente**, e regola in
  **Impostazioni avanzate** a che percentuale partire e a quale scendere.
  ⛔ L'obiettivo deve essere **inferiore** alla soglia di avvio, e il prodotto
  rifiuta la combinazione contraria dicendolo.
- Per decidere tu: **Compatta ora**, oppure **Rigenera sintesi** se quella che
  c'è non ti convince.
- Prima di compattare, metti in **Da non dimenticare** quello che non deve
  sparire.

Il modello che scrive la sintesi può seguire quello della chat o essere scelto a
parte.

## Se va storto

- **«Il contesto è cambiato. I dati sono aggiornati: verifica e ripeti la
  modifica.»** — qualcun altro (o il modello) ha toccato il contesto mentre
  stavi modificando. Rileggi e rifai il gesto.
- **«Contesto non disponibile. Usa Aggiorna per riprovare.»** — la lettura non è
  arrivata.
- **«Compattazione non riuscita»** — la sintesi non è stata prodotta. Gli
  originali sono intatti: riprova, o compatta a mano.
- **Una «Proposta da verificare» su un fatto** — TALOS propone di cambiare un
  fatto protetto. Decidi tu: **Accetta proposta** o **Mantieni il fatto**.

> Verificato in `harness-ui/frontend/src/components/context-compactor.js:5`
> (`JOB_LABELS`, i nove nomi qui sopra parola per parola), e nello stesso file:
> riga 9 «Solo questa chat. Gli originali restano disponibili.»; riga 11 «Misura
> non ancora disponibile.» e «Non disponibile»; riga 15 «Da non dimenticare»,
> «Proposta da verificare», «Accetta proposta», «Mantieni il fatto»; riga 17
> «Compattazione nativa qualificata» / «Non qualificata per questo modello.» e
> «L'obiettivo deve essere inferiore alla soglia di avvio.»; riga 18 «Il contesto
> è cambiato. I dati sono aggiornati: verifica e ripeti la modifica.», «Contesto
> non disponibile. Usa Aggiorna per riprovare.» e «Ricerca semantica non
> disponibile. La ricerca testuale resta attiva.»; riga 177 il caso
> `CTX_NOT_ENABLED` («Nessun messaggio è stato modificato.»). Il servizio è
> `harness-ui/src/context-desktop-service.mjs`.
> ⛔ Correzione del 13/09/2026: i tre stati di guasto erano scritti «In pausa,
> Annullata, Non riuscita»; a schermo hanno «Compattazione» davanti.
