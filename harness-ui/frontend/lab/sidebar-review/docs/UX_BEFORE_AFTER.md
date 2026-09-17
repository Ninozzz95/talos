# File — alleggerimento conservativo

## Obiettivo

Rendere File meno affollata, mantenendo il lavoro approvato: palette Calm, shell di conversazione, sezioni, anteprima, collegamento agli agenti e Review. Nessuna nuova palette, navigazione globale o dashboard sostitutiva.

| Prima | Dopo | Accesso conservato / trade-off |
| --- | --- | --- |
| Cinque filtri a pillola sempre in vista | Un selettore nativo delle viste | Tutti, Modificati, attività agente, Preferiti, Recenti e Cestino restano disponibili |
| Barra inferiore delle azioni presente anche senza un'intenzione esplicita | Barra soltanto con selezione | Conteggio, Al Context e menu Azioni selezione; nessuna auto-selezione iniziale |
| Checkbox e puntini ripetuti su tutte le righe | Esposizione su hover, focus o selezione | Modalità selezione esplicita nelle Opzioni; Spazio e Shift+F10 da tastiera |
| Indicatori agenti con accento persistente | Indicatori più neutri, accento su interazione | Nome/azione accessibili, tooltip e percorso equivalente nel menu |
| Promemoria e comandi secondari distribuiti nella testata | Ricerca e struttura del progetto prioritarie | Sintassi ricerca e strumenti nel menu; un clic aggiuntivo per opzioni secondarie |

## Confronto misurato

Condizioni: Chromium, viewport 1440×1000, scala 1, sidebar 380 px, stato iniziale, puntatore fuori dall'explorer. Si confrontano il **prototipo approvato CP00** e il nuovo HTML, non l'app Talos avviata.

| Misura | CP00 | Attuale |
| --- | ---: | ---: |
| Altezza testata File | 145 px | 137 px |
| Altezza disponibile all'explorer | 638 px | 726 px |
| Barra selezione iniziale | 80 px | 0 px |
| Pulsanti visibili iniziali nel pannello | 32 | 11 |

Il guadagno è **88 px di spazio per i file**. Il conteggio considera i pulsanti con box visibile e opacità diversa da zero: non misura il numero di funzioni disponibili. I controlli contestuali non sono stati eliminati.

Nel ritaglio esterno alla sidebar, x=0…1059 per tutta l'altezza, i pixel dei due screenshot coincidono. È una verifica puntuale della conservazione della shell approvata nello stato iniziale, non una garanzia per ogni stato o font installato.

## Tastiera e stati

Le tab supportano frecce, Home e End. L'albero usa un punto d'ingresso con focus mobile, frecce per navigare/espandere, Spazio per selezionare, F2 per rinominare e Shift+F10 per le azioni. Nel dataset virtuale Home/End raggiungono anche file non montati in quel momento. Il menu supporta frecce, Home/End ed Escape; la guida rende inattivo lo sfondo e restituisce il focus.

Ricerca invalida, nessun risultato, caricamento, vuoto, errore e dati parziali restano espliciti. Le tab non dipendono dalla disponibilità dei dati della vista precedente. A 300 px di sidebar i controlli File entrano nelle finestre desktop provate. Resta necessaria una verifica con screen reader.

## Cosa non è stato cambiato

La palette e i font dichiarati provengono dai token Calm già verificati. I font non sono incorporati e possono usare fallback. Shell, navigazione sinistra e composizione di Chat non sono state ridisegnate. Il CSS aggiuntivo è concentrato nella vista File del laboratorio; il foglio operativo della PR non modifica colori o geometria.
