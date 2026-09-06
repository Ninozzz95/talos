# T05-fermare — Fermare un giro: il pulsante «ferma», Esc con conferma, e la sessione dopo lo stop

> Prova d'uso sull'istanza 4188 (worktree AVM-harness-prove, base c1984d79), guidata come farebbe una persona. 2026-09-06 13:48

## Passi

- **sessione avviata** ✅
  - atteso: una sessione vera in corso
  - visto: 9d1915dc
- **il pulsante di invio durante il giro** ✅
  - atteso: diventa «ferma» (B17), con etichetta che lo dice
  - visto: {"stop":true,"etichetta":"Interrompi risposta","titolo":"Interrompi al prossimo punto sicuro","disabilitato":false}
- **Esc durante il giro** ✅
  - atteso: chiede conferma prima di fermare (B16): titolo, cosa succede, due pulsanti
  - visto: {"titolo":"Fermo il giro?","corpo":"Leggi TUTTI i file del progetto uno per uno e scrivimi un riassunto lunghissimo,In corsoSi ferma al prossimo punto sicuro: il lavoro già fatto resta, i file già","pulsanti":["Continua","Ferma il giro"]}
- **annullo la conferma** ✅
  - atteso: il giro continua, il velo sparisce
  - visto: velo=false · conclusa=false
- **confermo lo stop** ✅
  - atteso: un pulsante che ferma davvero
  - visto: Ferma il giro
- **la sessione dopo lo stop** ✅
  - atteso: risulta conclusa/interrotta, non «in corso» per sempre
  - visto: conclusa=true · esito=errore
- **il pulsante torna «invia»** ✅
  - atteso: finito il giro, il pulsante non è più «ferma»
  - visto: {"stop":false,"etichetta":"Invia","titolo":"Invia","disabilitato":false}
- **la chat dice che il giro è stato fermato** ❌
  - atteso: una nota esplicita, non il silenzio
  - visto: null

> ⛔ **T05-fermare-D1** (medio): nessuna riga in conversazione dice che il giro è stato fermato da te: resta un messaggio troncato senza spiegazione
- **si può scrivere di nuovo** ✅
  - atteso: il composer accetta un nuovo messaggio dopo lo stop
  - visto: true

## Verdetto

**PASSA CON RISERVA** — difetti trovati: 1 (T05-fermare-D1).

## Ispezione delle foto — difetti trovati GUARDANDO, fuori da ciò che stavo provando

Foto lette una per una (`04-dopo-lo-stop.png`, `05-fine.png`, `02-esc-conferma.png`).

> ⛔ **T05-fermare-D2** (grave): uno stop **chiesto da me** viene raccontato come un **guasto**. In chat
> compare una carta rossa `Errore · TALOS · errore` col testo `[internal-error] This operation was
> aborted` — codice tecnico, **in inglese**, senza una frase che dica cosa è successo né cosa fare.
> Viola H11-H13 (due frasi in italiano, niente gergo in prima battuta) e B20. E l'API registra
> `ultimoEsito: 'errore'`: un'interruzione voluta dovrebbe essere **«interrotta»**, distinta dagli
> errori (G28 tiene distinte «interrotte» e «concluse») — prova: `foto/T05-fermare/04-dopo-lo-stop.png`

> ⛔ **T05-fermare-D3** (grave): nella barra laterale la sessione continua a dire **«in corso»** col
> pallino acceso anche **dopo** che il giro è finito (API: `conclusa=true`). Misurato su due foto
> distinte a ~15 s di distanza, `04-dopo-lo-stop.png` e `05-fine.png`: la riga non si aggiorna mai.
> Chi guarda l'elenco crede che stia ancora lavorando — prova: `foto/T05-fermare/05-fine.png`

> ⛔ **T05-fermare-D4** (minore): il pannello di destra intitola **«File toccati in questa sessione»**
> e poi, vuoto, scrive **«Nessun file scritto finora»**. Toccati e scritti non sono la stessa cosa: il
> giro aveva **letto** dei file. La decisione B22 parla di file *toccati* — prova: `04-dopo-lo-stop.png`

> ⛔ **T05-fermare-D5** (minore): l'albero della cartella nella colonna di destra mostra **`.git`** fra
> le cartelle di primo livello: rumore che nessun editor moderno mostra per default — prova: `05-fine.png`

> ⛔ **T05-fermare-D6** (minore): il segnaposto del composer promette **«Invio indirizza il giro in
> corso, Ctrl+Invio accoda»** anche quando **nessun giro è in corso**: promette un comportamento che in
> quel momento non esiste — prova: `05-fine.png`, giro già concluso

> ⛔ **T05-fermare-D7** (minore): i toast in basso a destra (**«Avvio in corso»**, poi **«Stop
> richiesto»**) restano a schermo **sopra** la colonna di destra e ne coprono l'elenco dei file; nelle
> due foto a ~15 s di distanza il toast è ancora lì — prova: `04-dopo-lo-stop.png` e `05-fine.png`

## Verdetto (rivisto dopo l'ispezione delle foto)

**PASSA CON RISERVA** — difetti trovati: 7 (T05-fermare-D1 … T05-fermare-D7).
Il meccanismo dello stop (pulsante «ferma», conferma con Esc, ripartenza) **funziona**; quello che non
funziona è il **racconto** di ciò che è successo.

> Base del codice: `c1984d79` (worktree `AVM-harness-prove`, istanza sulla porta **4188**).
