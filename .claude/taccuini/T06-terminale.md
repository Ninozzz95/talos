# T06-terminale — Il Terminale: schede, un comando vero, e cosa dichiara di sé

> Prova d'uso sull'istanza 4188 (worktree AVM-harness-prove, base c1984d79), guidata come farebbe una persona. 2026-09-06 13:51

## Passi

- **sessione avviata** ✅
  - atteso: una sessione vera, il terminale vive dentro una sessione
  - visto: ed4af91d
- **la vista Terminale si apre** ✅
  - atteso: un terminale vero, non un segnaposto
  - visto: {"visibile":true,"schede":3,"pillola":"Aperta da te·C:\\Users\\Antonino\\Desktop\\projects\\AVM-harness-prove\\scratchpad\\prove\\banco\\progetto-5·connessaOgni scheda dichiara chi l'ha aperta e dove."}
- **cosa dichiara la barra** ✅
  - atteso: cartella di partenza E se è isolato o gira sulla tua macchina (G8-G9)
  - visto: ["Stessa macchina, senza isolamento","progetto-5/"]
- **il piede del terminale** ✅
  - atteso: dice CHI ha lanciato il comando: tu o l'agente (G10)
  - visto: Aperta da te·C:\Users\Antonino\Desktop\projects\AVM-harness-prove\scratchpad\prove\banco\progetto-5·connessaOgni scheda dichiara chi l'ha aperta e dove.
- **apro una scheda nuova** ✅
  - atteso: compare una scheda in più, e diventa quella scelta
  - visto: 3 → 4 · [{"testo":"tu · Git Bash","scelta":false},{"testo":"tu · Git Bash 2","scelta":false},{"testo":"tu · Git Bash 3","scelta":true},{"testo":"Nuovo","scelta":false}]
- **un comando vero** ❌
  - atteso: l'output del comando compare nel terminale
  - visto: NON compare — corpo:  .xterm .xterm-scrollable-element > .scrollbar > .slider { background: #d6d2ca33; } .xterm .xterm-scrollable-element > .scrollbar > .slider:hover { background: 

> ⛔ **T06-terminale-D1** (blocco): un comando digitato nel terminale non produce output a schermo: il terminale non è usabile — prova:  .xterm .xterm-scrollable-element > .scrollbar > .slider { background: #d6d2ca33; } .xterm .xterm-scrollable-element > .scrollbar > .slider:hover { background: #d6d2ca66; } .xterm .xterm-scrollable-el
- **rinomino una scheda (F2)** ✅
  - atteso: il nome scelto resta scritto sulla scheda
  - visto: campo=true · schede=[{"testo":"tu · Git Bash","scelta":false},{"testo":"tu · Git Bash 2","scelta":false},{"testo":"la mia scheda","scelta":true},{"testo":"Nuovo","scelta":false}]
- **ciclo le schede con le frecce** ✅
  - atteso: la freccia sposta la scheda scelta (WAI-ARIA tabs)
  - visto: scelta all'indice 1 · [false,true,false,false]
- **chiudo una scheda (Canc)** ❌
  - atteso: la scheda sparisce e il fuoco passa alla vicina
  - visto: 4 → 4

> ⛔ **T06-terminale-D2** (minore): Canc non chiude la scheda del terminale — prova: [{"testo":"tu · Git Bash","scelta":false},{"testo":"tu · Git Bash 2","scelta":true},{"testo":"la mia scheda","scelta":false},{"testo":"Nuovo","scelta":false}]
- **menu del tasto destro sulla scheda** ✅
  - atteso: Chiudi · Chiudi le altre · Chiudi tutte
  - visto: ["Rinomina","Chiudi","Chiudi le altre","Chiudi tutte"]

## Verdetto

**FALLISCE** — difetti trovati: 2 (T06-terminale-D1, T06-terminale-D2).

## ⚠️ Rettifica: T06-terminale-D1 è un difetto della MIA sonda, non della app

Guardando `foto/T06-terminale/03-comando.png` il comando **ha funzionato**: si legge
`$ echo CIAO-TALOS-T06` e sotto `CIAO-TALOS-T06`, col prompt nuovo. La mia lettura prendeva il
`textContent` di `#realTerminalMount`, che comincia col foglio di stile interno di xterm.js: leggevo
CSS, non lo schermo. **T06-terminale-D1 è ritirato** — il terminale esegue davvero.

## Ispezione delle foto — difetti trovati GUARDANDO

Foto lette una per una (`01-terminale-aperto.png`, `03-comando.png`, `05-chiusura.png`).

> ⛔ **T06-terminale-D3** (grave): la dichiarazione **«Stessa macchina, senza isolamento»** — la riga
> che dice a una persona che i comandi girano sul suo computer vero (G9) — **sparisce quando le schede
> aperte diventano tre**. Con due schede c'è (`01-terminale-aperto.png`), con tre non c'è più
> (`03-comando.png`, `05-chiusura.png`): resta il solo `progetto-5/`. Una dichiarazione di sicurezza
> che si perde quando la barra si riempie non è una dichiarazione

> ⛔ **T06-terminale-D4** (medio): aprendo la vista Terminale su una sessione **appena creata** ci sono
> già **due shell** («tu · Git Bash» e «tu · Git Bash 2»), nessuna delle due chiesta da me. Il tetto
> dichiarato nel componente è 8 per via dei `conhost` superstiti su Windows: partire da due ne brucia
> un quarto senza motivo — prova: `01-terminale-aperto.png`, sessione `ed4af91d` appena nata

> ⛔ **T06-terminale-D5** (medio): il piede del terminale — quello che secondo G8-G10 dice **dove** gira
> e **chi** l'ha aperta — è **tagliato in due punti su tre** a 1440 px:
> `C:\Users\Antonino\Desktop\projects\AVM-harnes…` e `Ogni scheda dichiara chi l'ha aperta e d…`.
> Il percorso, cioè l'informazione, è la parte tagliata — prova: `01-terminale-aperto.png`

> ⛔ **T06-terminale-D6** (minore): la scheda rinominata («la mia scheda») **perde la dichiarazione di
> chi l'ha aperta**: le altre dicono «tu · Git Bash», questa dice solo il nome. Il piede lo recupera per
> la scheda scelta, ma la barra no — prova: `05-chiusura.png`

## Verdetto (rivisto dopo l'ispezione delle foto)

**PASSA CON RISERVA** — difetti veri: 5 (D2, D3, D4, D5, D6). D1 ritirato: era la mia sonda.
Le schede sono la parte più matura che ho visto finora (apertura, rinomina con F2, frecce, menu del
tasto destro con «Chiudi · Chiudi le altre · Chiudi tutte», contatore sulla linguetta «Terminale 3»,
un comando vero che gira). Restano fuori posto: **Canc non chiude** (dichiarato nel componente), la
dichiarazione d'isolamento che sparisce, e due shell aperte da sole.

> Base del codice: `c1984d79` (worktree `AVM-harness-prove`, istanza sulla porta **4188**).
