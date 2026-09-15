# Conversazioni

## Cosa fa

È l'elenco delle sessioni: ogni riga è un lavoro, con il suo titolo, il modello
usato e il suo stato.

Gli stati sono in un ordine voluto, non alfabetico: **prima quelli che chiedono
qualcosa a te**. Nell'elenco laterale sono scritti in minuscolo; sulla
[Board](board.md) gli stessi stati hanno l'iniziale maiuscola.

- **aspetta te** — l'agente si è fermato su una domanda.
- **in corso** — sta lavorando.
- **in attesa del primo messaggio** — creata e mai avviata; la riga si presenta
  come «Nuova · <cartella>».
- **interrotta** — chiusa a metà, o senza più nessuno che la stia eseguendo.
- **fermata** — l'hai fermata tu. ⛔ Fermare non è né concludere né sbagliare: è
  un terzo esito, e ha una parola sua.
- **conclusa** — finita.
- **errore** — finita male. Quando il motivo è noto, al posto di «errore» si
  legge quello: per esempio «giri finiti».
- **conclusa · esito non registrato** — l'ottavo, ed è quello che conta di più:
  vedi qui sotto.

## Cosa non fa

- ⛔ **«conclusa · esito non registrato» non vuol dire «riuscita».** Le sessioni
  vecchie non portano l'esito, e chiamarle riuscite sarebbe inventare un fatto:
  restano senza pallino colorato.
- Giri e modello si mostrano **solo** se il server li ha contati o dichiarati.
  Niente zeri finti al posto di un dato mancante.
- Il nome del fornitore non compare accanto al modello: con il prefisso il nome
  si troncava.

## Come si usa

- Clic su una riga per aprirla.
- Tasto destro su una riga per il menu delle azioni.
- Si possono selezionare più sessioni insieme.
- Una sessione si può **riprendere** anche dopo aver chiuso e riaperto TALOS: è
  registrata come sequenza di eventi, non come testo.

## Se va storto

- **Una sessione non si riapre** — guarda il [Doctor](doctor.md), sezione
  «Ripristino delle sessioni»: dice quante sono state ripristinate, quali sono
  state scartate e perché.
- **Il titolo è sbagliato o manca** — il titolo si forma dal lavoro; se manca,
  la riga resta identificabile dall'ora e dal modello.

> Verificato in `harness-ui/frontend/src/components/session-item.js:45-62`
> (`ETICHETTE`: `attesa` «aspetta te», `vivo` «in corso», `interrotto`
> «interrotta», `errore` «errore», `fermata` «fermata», `successo` «conclusa»,
> `ignoto` «conclusa · esito non registrato», `pendente` «in attesa del primo
> messaggio») e alle righe 69-98 (`statoSessione`: l'ordine dei rami, e «giri
> finiti» quando `motivoChiusura === 'giri-finiti'`). Che l'ordine sia voluto lo
> dice il file stesso alle righe 12-14. Le maiuscole della Board sono in
> `harness-ui/frontend/src/components/board.js:21` (`STATO`). Il modello senza il
> prefisso del fornitore è motivato alle righe 19-20 («con il prefisso il nome si
> troncava»).
> ⛔ Correzione del 13/09/2026: gli stati erano sette e con l'iniziale maiuscola;
> nell'elenco laterale sono otto e minuscoli, e «Fermata da te» / «Nuova» non sono
> le parole che compaiono.
