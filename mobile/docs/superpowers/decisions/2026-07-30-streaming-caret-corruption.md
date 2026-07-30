# Difetto: il cursore di streaming sposta i caratteri, non solo sé stesso

Segnalato dall'owner 2026-07-30 con screenshot. Stato: **da investigare**.

## Cosa dice l'owner

«Il cursore quando sta per renderizzare il testo va prima di alcune parole, non
sta mai alla fine.»

## Cosa mostra davvero lo screenshot

Peggio di così. Non è il cursore fuori posto: è **testo corrotto**.

    Un **classificatore intelligentetrategica**▌ non è altro
    che un classificatore applicato a un contesto dinamico e
    complesso, dove la "categoria" da assegnare determina un'azione s

Tre fatti, non uno:

1. Il cursore `▌` sta **in mezzo** alla risposta, con altro testo dopo di sé.
2. `intelligentetrategica` = «intelligente» + «trategica» — **«strategica» ha
   perso la sua «s» iniziale**, e le due parole sono saldate.
3. L'ultima riga finisce con una **«s» orfana**: `un'azione s`.

La «s» mancante da (2) e la «s» orfana in (3) sono quasi certamente lo stesso
carattere, finito nel posto sbagliato.

## Perché conta più di quanto sembri

Un cursore mal posizionato è estetica. **Caratteri riordinati sono una risposta
che il modello non ha dato.** Se succede su una cifra, un nome o una negazione,
l'utente legge una cosa diversa da quella generata e non ha modo di accorgersene.

## Ipotesi da verificare (nessuna ancora provata)

- Il marcatore del cursore viene inserito nel markdown GREZZO prima del parsing,
  quindi il parser lo tratta come testo e rifluisce il resto attorno.
- L'indice a cui viene inserito è calcolato su una stringa diversa da quella
  renderizzata (grezza vs sanificata), quindi cade all'offset sbagliato.
- L'animazione di rivelazione a caratteri (typewriter) e il chunk in arrivo
  concorrono sulla stessa stringa.

Nota: l'owner ha in coda anche «fluidità dell'animazione di streaming» (F-5).
Potrebbero essere lo stesso cantiere.

## Metodo

systematic-debugging: riprodurre PRIMA di proporre qualunque correzione. Un
difetto che riordina caratteri va riprodotto con un flusso reale, non dedotto.
