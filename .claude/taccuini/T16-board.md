# T16-board — La Board: il cruscotto su TUTTE le sessioni

> Prova d'uso sull'istanza 4188 (worktree AVM-harness-prove, base c1984d79), guidata come farebbe una persona. 2026-09-06 14:29

## Passi

- **apro Board dalla barra laterale** ✅
  - atteso: G1-G2: la Board sta nella SIDEBAR, non fra le viste della sessione
  - visto: voce="Board11" · schermo=schermoBoard
- **le colonne** ✅
  - atteso: le sette nostre PIÙ tre nuove: cache, tempo al primo token, motivo di chiusura (G3-G4)
  - visto: ["Sessione","Stato","Modello","Giri","Token","Cache","Primo token","Chiusa per","Costo","Avviata"]
- **una riga per sessione** ✅
  - atteso: la Board vede tutte le sessioni
  - visto: 11 righe · 11 sessioni nell API
- **la colonna del costo** ❌
  - atteso: G6: il costo dichiarato come STIMA
  - visto: dice «stima»=false · righe col costo vuoto: 11/11

> ⛔ **T16-board-D1** (medio): la colonna Costo non dichiara da nessuna parte di essere una STIMA (G6, e H25 vuole che le stime lo dicano)

> ⛔ **T16-board-D2** (grave): la colonna Costo è vuota su TUTTE le 11 righe: la Board promette una colonna che non ha mai un valore — prova: ["Fai queste tre cose, una per una, usando i tuoi attrezzi, e poi fermati: 1) salv","Conclusa","glm-5.3-flash","2","16,3k","0% · 0","7,0 s","fine lavoro","","7 min fa"]
- **i filtri di stato** ✅
  - atteso: G5: pastiglie per stato
  - visto: ["Tutte","In corso","Aspettano te","Concluse","Errore","Interrotte"]
- **il filtro per cartella o progetto** ✅
  - atteso: G7
  - visto: [{"etichetta":"Cartella","opzioni":["Tutte le cartelle"]},{"etichetta":"Ordina","opzioni":["Più recenti","Meno recenti","Nome A–Z","Più token"]}]
- **ordinare per colonna** ✅
  - atteso: clic sull intestazione «Token» riordina
  - visto: prima ["Fai queste tre cose,","delega:667b9d42-4b10","delega:0617c753-9e3d"] → dopo ["Fai queste tre cose, una","delega:667b9d42-4b10-4e6","delega:0617c753-9e3d-43d"]
- **gli identificatori a schermo** ❌
  - atteso: H22: nessun nome tecnico
  - visto: le righe delle deleghe si chiamano «delega:667b9d42-4b10-4e63-926e-942a83a480c0»

> ⛔ **T16-board-D3** (grave): la Board usa come TITOLO di sessione l identificatore grezzo `delega:667b9d42-4b10-4e63-926e-942a83a480c0`, ripetuto per intero su più righe: H22 lo vieta, e per giunta non si distinguono fra loro

## Verdetto

**PASSA CON RISERVA** — difetti trovati: 3 (T16-board-D1, T16-board-D2, T16-board-D3).

## Le due promesse della Board, provate una per una (`T16b-board.mjs`)

```
COLONNA COSTO                {"larghezza":0,"altezza":0,"visibile":false,"stile":"none"}
MENU TASTO DESTRO SULLA RIGA null
INTESTAZIONE TOKEN           {"tag":"TH","ariaSort":null}
TOKEN PRIMA  ["16,3k","—","83,1k","100,3k","147,1k","76,8k","15,5k","42,3k","24,2k","7,6k","—"]
TOKEN DOPO   ["16,3k","—","83,1k","100,3k","147,1k","76,8k","15,5k","42,3k","24,2k","7,6k","—"]
CAMBIATO?    false
```

> ⛔ **T16-board-D4** (grave): la colonna **Costo** esiste nel markup ma è **`display:none`**, larga
> **0 px**: a schermo le colonne sono nove, non dieci. Il costo per sessione — G6, e B26 lo vuole
> «per sessione, non per messaggio» — **non si vede da nessuna parte nella Board**
> — prova: `foto/T16-board/01-board.png` (contare le intestazioni) + la misura qui sopra

> ⛔ **T16-board-D5** (medio): il piede della Board promette, verbatim, «**il tasto destro mostra le
> sue azioni**». Il tasto destro su una riga **non apre niente** — prova: `03-tasto-destro.png`

> ⛔ **T16-board-D6** (medio): l'intestazione di colonna è un `<th>` senza pulsante e **senza
> `aria-sort`**; cliccarla non riordina nulla. G5 chiede di «ordinare per colonna ricordando la
> scelta»: si ordina solo con la tendina «Ordina» (Più recenti · Meno recenti · Nome A–Z · Più token),
> che non copre le altre otto colonne — e H27 (tastiera come cancello) non è soddisfatta su una
> tabella senza intestazioni azionabili

## Ispezione della foto — quello che invece è ben fatto

`foto/T16-board/01-board.png`. La Board è, con la Review e i Processi, una delle superfici migliori:

- **una riga per sessione, tutte e undici**, contate contro l'API;
- le **nove colonne visibili** sono esattamente quelle decise, comprese le **tre nuove** di G3-G4:
  `CACHE` (percentuale **e** token riutilizzati: `98% · 80,1k`), `PRIMO TOKEN` (`1,3 s`), `CHIUSA PER`
  (`fine lavoro` / `errore`);
- i **filtri di stato a pastiglie** (Tutte · In corso · Aspettano te · Concluse · Errore · Interrotte)
  e il **filtro per cartella** (G5, G7);
- il **piede spiega le unità** (H24): «`—` indica un dato non registrato. Token = ingresso + uscita.
  Cache = percentuale e token riutilizzati». È la riga che manca in mezza app.

E la Board fa emergere due difetti già trovati altrove, con la loro prova:

- la sessione che avevo **fermato io** in T05 è marcata **`Errore`** con «chiusa per: **errore**»
  (rinforza `T05-fermare-D2`);
- tre righe si chiamano **`delega:667b9d42-4b10-4e63-926e-942...`**, troncate allo stesso punto:
  a schermo sono **indistinguibili** l'una dall'altra (rinforza `T09-colonna-destra-D3`).

## Verdetto (rivisto dopo l'ispezione delle foto)

**PASSA CON RISERVA** — 6 difetti (3 gravi, 3 medi). Il cruscotto c'è ed è buono; mancano il costo
(nascosto), l'ordinamento per colonna e il menu che la pagina stessa promette.

> Base del codice: `c1984d79` (worktree `AVM-harness-prove`, istanza sulla porta **4188**).
