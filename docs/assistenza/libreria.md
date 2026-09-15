# Libreria

## Cosa fa

È dove finiscono i file prodotti durante il lavoro: documenti generati,
immagini, artefatti. Ogni riga porta il nome, quando è stata creata, e con quale
modello.

Su ogni file le azioni sono **sei**, e **non stanno in fila**: si raccolgono
sotto un bottone solo, «**…**», e le stesse voci arrivano anche col **tasto
destro**. Nell'ordine del menu: **Apri**, **Scarica**, **Rinomina**, **Mostra
nella cartella**, **Copia percorso**, **Elimina**.

⛔ **«Copia percorso» c'è solo se il percorso c'è davvero.** Le voci salvate
prima che il percorso venisse registrato portano **cinque** voci, non sei: un
comando che copierebbe una stringa vuota non viene disegnato.

L'attrito è calibrato sul rischio:

- **Elimina** chiede conferma, e la conferma **dice la conseguenza**:
  «Eliminare definitivamente? Non si torna indietro.» Il fuoco va sulla via
  d'uscita, non sul bottone che cancella: un Invio di troppo non distrugge un
  file.
- Le altre cinque non chiedono niente: scaricare o aprire una cartella non rompe
  nulla, e una rinomina si disfa rinominando di nuovo.
- La **rinomina avviene dentro la riga**, non in una finestra a parte: Invio
  conferma, Esc annulla.

## Cosa non fa

- ⛔ **Non c'è un cestino.** L'eliminazione cancella il file per davvero. È il
  motivo per cui è l'unica azione con una conferma.
- I nomi con caratteri che il sistema non accetta vengono rifiutati subito,
  senza far fare un giro a vuoto.
- ⛔ **Il contenuto della Libreria non entra da solo nel contesto del modello.**
  Il modello lo legge solo se lo cerca o lo apre esplicitamente. Vedi
  [Cosa legge il modello](contesto-del-progetto.md).

## Come si usa

Dalla voce **Libreria** della barra laterale. Apri il menu «…» della riga,
oppure usa il tasto destro. Ogni voce nomina **il suo** file nel nome
accessibile — «Elimina Relazione di prova.docx», non un «Elimina» qualunque —
perché con dieci righe in elenco dieci «Elimina» identici sarebbero
indistinguibili.

## Se va storto

- **Un file risulta in Libreria ma non si apre** — è stato spostato o cancellato
  fuori da TALOS. «Mostra nella cartella» dice dove dovrebbe essere.
- **Una rinomina viene rifiutata** — il nome contiene un carattere che il
  sistema non ammette.

> Verificato in `harness-ui/frontend/src/components/libreria.js`: l'elenco
> `vociMenu` (righe 268-275) porta, in quest'ordine, `apri`, `scarica`,
> `rinomina`, `rivela` («Mostra nella cartella»), `copia-percorso` ed `elimina`,
> e `copiaPercorsoBtn` nasce solo dentro `if(prov.percorso)` (righe 243-244) — di qui
> le **cinque** voci delle registrazioni senza percorso. Il bottone «…» e il
> `riga.vociMenu()` per il tasto destro sono alle righe 276-287; la conferma
> «Eliminare definitivamente? Non si torna indietro.» è alla riga 299, col fuoco
> su «Annulla» (riga 318); la rinomina in linea alla riga 289; i nomi rifiutati
> in `nomeLibreriaValido` (riga 152).
> ⛔ Correzione del 13/09/2026: questa pagina diceva **cinque** azioni affiancate,
> ed è ciò che la Libreria era **prima** del menu overflow. L'unico posto del
> codice dove l'elenco «apri, scarica, rinomina, elimina, mostra nella cartella»
> compare ancora in quella forma è un **commento storico**: `libreria.js:9`, che
> descrive com'era, non com'è. (Il commento di
> `frontend/tests/unit/libreria-azioni.test.mjs:9` parla delle stesse cinque azioni,
> ma **non le elenca**: dice «0 azioni su 5».)
