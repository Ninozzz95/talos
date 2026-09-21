# Ricerca approfondita

## Cosa fa

Fa produrre a TALOS **un rapporto**, non una conversazione: una domanda, molte
letture, e alla fine un documento con le affermazioni, i passaggi, i verdetti e
le fonti.

Il principio, uno solo: **una ricerca approfondita è un artefatto.** Quello che
si consulta è il rapporto e le sue prove; la sessione è solo il modo in cui è
stato prodotto.

Gli stati che una ricerca può avere sono **otto**, più uno che il server
distingue a parte. Sono le parole esatte che compaiono a schermo:

- **In corso** — sta cercando e leggendo.
- **In pausa** — è ferma a metà, e si riprende.
- **Conclusa** — c'è un rapporto. ⛔ È l'**unico** stato che può dirlo.
- **Annullata** — fermata prima del rapporto; quello che aveva raccolto resta
  nelle Fonti.
- **Non riuscita** — si è fermata su un errore.
- **Senza rapporto** — è arrivata in fondo senza depositare il documento.
- **Bloccata** — la sessione era in sola lettura e non ha potuto consegnare.
- **Giri esauriti** — ha finito i giri a disposizione prima di concludere.

E il nono, che non è uno stato a sé ma una lettura più fine dello stesso «Non
riuscita»:

- **Interrotta dal fornitore** — il servizio del modello si è fermato a metà per
  un problema passeggero. ⛔ Non è un errore della ricerca, e la differenza
  conta: una «Non riuscita» si **rifà**, una «Interrotta» si **riprende**. Lo
  decide il server, non una parola indovinata dall'interfaccia.

Uno stato che il prodotto non conosce diventa **«Stato non registrato»**, mai
«Conclusa».

> Verificato in `harness-ui/frontend/src/components/ricerca-dettaglio.js:63-78`
> (`STATI_RICERCA`: le otto `parola` sono esattamente «In corso», «In pausa»,
> «Conclusa», «Annullata», «Non riuscita», «Senza rapporto», **«Bloccata»** —
> chiave `bloccata-dal-permesso` — e «Giri esauriti»); riga 82
> (`statoRicercaApprofondita` ripiega su «Stato non registrato», mai su
> «Conclusa»); riga 106 (`INTERROTTA_DAL_FORNITORE`, parola «Interrotta dal
> fornitore», decisa dal server con `riprendibile` +
> `motivoErrore.transitorio`). L'esportazione bibliografica comincia alla riga 491 con gli aiuti `bibtexSicuro` (491) e
> `risSicuro` (493, col commento «In RIS ogni riga è un campo», riga 492);
> `bibtexDaCitazioni` è alla riga **507**.
> ⛔ Correzione del 13/09/2026: la sezione «Se va storto» citava la chiave interna
> *bloccata-dal-permesso* al posto della parola a schermo. La parola era giusta
> più in alto e sbagliata più in basso, nella stessa pagina: una correzione
> applicata a metà è indistinguibile da una correzione mai fatta, per chi legge
> la seconda metà.

Le citazioni si esportano nei formati bibliografici standard.

## Cosa non fa

- ⛔ **L'ultimo messaggio del modello non è il rapporto.** L'11/09/2026 una
  ricerca è finita con 290 byte di scuse del modello salvati come se fossero il
  rapporto. Ora l'ultimo messaggio compare solo dentro «Come è andata», con
  l'etichetta che dice che cos'è, e il pannello del rapporto non lo tocca.
- **«Conclusa» vale solo quando il rapporto c'è.** Gli altri esiti hanno una
  parola propria e una frase che dice **cosa fare**, non solo cosa è successo.
- Se il bilancio del rapporto non si rilegge, **non viene stimato**: si dice che
  non c'è e si mostra il testo com'è.
- Nessun pulsante promette un'azione che non esiste: le azioni compaiono solo
  negli stati in cui possono davvero fare qualcosa.

## Come si usa

Dalla voce **Ricerca approfondita** della barra laterale. Su una ricerca si può
**mettere in pausa**, **riprendere**, **ri-verificare** ed **eliminare**, quando
lo stato lo consente.

## Se va storto

- **«Giri esauriti»** — la domanda era troppo larga per i passaggi disponibili.
  Restringila e rilancia.
- **«Bloccata»** — la sessione era in sola lettura e non ha potuto consegnare:
  riprendila con il permesso giusto. Vedi [I permessi](permessi-di-sessione.md).
  ⛔ La parola a schermo è **«Bloccata»** e basta: `bloccata-dal-permesso` è la
  chiave interna dello stato, non ciò che leggi.
- **«Interrotta dal fornitore»** — non è colpa della domanda: riprova.
