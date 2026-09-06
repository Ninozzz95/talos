# T20-coerenza-e-primo-avvio — La spazzata di coerenza: tre viewport × due temi × due densità, e l’intro a quattro passi

> Prova d'uso sull'istanza 4188 (worktree AVM-harness-prove, base c1984d79), guidata come farebbe una persona. 2026-09-06 14:37

## Passi

- **quante combinazioni misurate** ✅
  - atteso: 3 viewport × 2 temi × 2 densità × 8 luoghi
  - visto: 96 misure
- **altezza della barra in alto** ✅
  - atteso: la stessa in tutte le schermate, dentro una combinazione
  - visto: identica ovunque
- **padding della testata** ✅
  - atteso: lo stesso in tutti i luoghi
  - visto: identico ovunque
- **allineamento delle azioni a destra** ✅
  - atteso: stessa distanza dal bordo in tutte le schermate
  - visto: allineate
- **la densità «Compatta» cambia davvero il disegno** ❌
  - atteso: D23: densità compatta o comoda
  - visto: 0 schermate su 48 cambiano padding o altezza

> ⛔ **T20-coerenza-e-primo-avvio-D1** (grave): scegliere la densità «Compatta» non cambia NESSUNA misura in NESSUNA schermata: padding e altezze restano identici (D23) — prova: 48 confronti, 0 differenze
- **scorrimento orizzontale della pagina** ✅
  - atteso: la pagina non deve mai scorrere in orizzontale
  - visto: mai
- **testo tagliato con overflow nascosto** ❌
  - atteso: niente contenuto tagliato in silenzio
  - visto: ["desktop 1440×900·Comoda·Board: 11","desktop 1440×900·Compatta·Board: 11","desktop 1440×900·Comoda·Board: 11","desktop 1440×900·Compatta·Board: 11"]

> ⛔ **T20-coerenza-e-primo-avvio-D2** (medio): in 12 combinazioni ci sono elementi il cui contenuto è più largo del contenitore con overflow nascosto (testo tagliato in silenzio): desktop 1440×900 · Comoda · Board (11) · desktop 1440×900 · Compatta · Board (11) · desktop 1440×900 · Comoda · Board (11)
- **presenza delle schede** ✅
  - atteso: lo stesso numero di schede in tutte le viewport
  - visto: costante
- **l'intro al primo avvio** ❌
  - atteso: H16-H19: quattro passi, saltabile e ripetibile
  - visto: {}

## Verdetto

**PASSA CON RISERVA** — difetti trovati: 2 (T20-coerenza-e-primo-avvio-D1, T20-coerenza-e-primo-avvio-D2).

## ⚠️ Due rettifiche prima del resto

**1) T20-coerenza-e-primo-avvio-D1 è RITIRATO.** La densità **funziona**. La mia spazzata cambiava il
valore della tendina `#setting-uiDensitySelect` mentre lo schermo delle impostazioni era **chiuso**, e
l'app non se ne accorgeva: ho misurato due volte la stessa cosa. Rifatto **dalla tendina vera**
(`T20b-densita-intro.mjs`), la differenza c'è ed è netta:

```
PRIMA (Comoda)     radice senza data-densita · riga sessione 66 px · voce nav 44 px · padding 10px 10px 10px 12px
DOPO  (Compatta)   radice data-densita=compatta · riga sessione 54 px · voce nav 36 px · padding  6px 10px  6px 12px
```

⇒ **la dimensione «densità» della spazzata va considerata non misurata**: le 96 misure sono in realtà
48 combinazioni contate due volte. Le altre due dimensioni (3 viewport × 2 temi) restano valide.

**2) «L'intro non appare» era anch'esso un errore mio.** Misuravo `#introDialog`, che è il **dialogo
legacy** rimasto nel DOM; l'intro vera vive in `#veloIntro`. A profilo pulito l'intro **si apre da
sola**, a tutto schermo (velo alto 900 px).

## La spazzata: 3 viewport × 2 temi × 8 luoghi — la geometria è coerente

| Misura | Esito |
|---|---|
| altezza della barra in alto | **60 px**, identica in tutti i luoghi, tutte le viewport, tutti i temi |
| padding della testata | **0 / 18 / 0 / 18 px**, identico ovunque |
| allineamento delle azioni al bordo destro | **28 px**, identico ovunque |
| numero di schede per pagina | costante fra viewport e temi (Capability 8 · Board 6 · Memoria 5 · Attività 6 · Ricerca 6 · Libreria 3 · Officina 3 · Automazioni 3) |
| scorrimento orizzontale della pagina | **mai**, in nessuna delle 48 combinazioni — neanche a 1024 px |

Questa è la parte migliore del lavoro fatto finora: a 1024 px, dove le colonne si stringono per prime,
non si rompe niente e non compare una barra orizzontale.

> ⛔ **T20-coerenza-e-primo-avvio-D2** *(già emesso sopra dalla corsa automatica, qui con la lettura per esteso)* (medio): in **12 combinazioni su 48** c'è del contenuto più largo
> del suo contenitore con `overflow-x: hidden` — cioè **testo tagliato in silenzio**. Tutte e dodici
> sono la **Board**, con **11 elementi tagliati** per volta, a ogni viewport e a ogni tema: sono le
> celle `Sessione` con i titoli lunghi e gli identificatori `delega:…`, tagliati senza puntini

## L'intro a quattro passi

Foto: `avvio-4.png`, `wiz-2.png`, `wiz-3.png`, `intro-1.png`.

L'intro **c'è, è a quattro passi ed è ben disegnata**: colonna dei passi a sinistra
(**1 Cartella · 2 Modello · 3 Permessi · 4 Fine**), titolo che conta («Primo avvio · 2 di 4»),
«Salta per ora» in basso a sinistra, «Indietro / Avanti» a destra. Il passo **Modello** mette in
evidenza il locale come vuole H18 («Un modello locale, senza chiave — I file e le richieste restano su
questo computer», col pulsante «Usa il modello locale» a destra) e spiega la conseguenza del remoto
(«le richieste e gli allegati selezionati vengono inviati al fornitore. Le chiavi restano nel
portachiavi del computer»). Il passo **Permessi** ha le quattro carte con il rischio scritto (E2) e
«Consigliato» su «Scrive nel progetto» (E3).

> ⛔ **T20-coerenza-e-primo-avvio-D4** (grave): **«Ripeti il primo avvio» non riapre l'intro.**
> Provato **sette volte** in cinque sessioni di browser diverse (clic reale del mouse sul pulsante,
> attese fino a 8 s, tre clic ripetuti nella stessa sessione): l'intro si è riaperta **una volta sola**.
> In tutti gli altri casi la schermata delle impostazioni resta identica e non succede niente
> — prova: `foto/T20-coerenza-e-primo-avvio/intro-p1.png` (dopo il clic, nessun cambiamento) contro
> `intro-1.png` (l'unica volta in cui si è aperta). H16 la vuole **ripetibile dalle impostazioni**

> ⛔ **T20-coerenza-e-primo-avvio-D5** (medio): l'intro parte dal **passo 2**, non dal primo: il titolo
> dice «Primo avvio · **2 di 4**» e il passo «1 Cartella» viene saltato. Chi apre TALOS per la prima
> volta non sceglie mai la cartella, che è la decisione più importante (F29: «nessuna sessione senza
> cartella») — prova: `avvio-4.png`

> ⛔ **T20-coerenza-e-primo-avvio-D6** (medio): **«Avanti» non è disabilitato quando non può andare
> avanti.** Al passo 2 serve un modello e al passo 3 un permesso; finché non li scegli, «Avanti» ha
> l'aspetto pieno del pulsante primario e **cliccarlo non fa niente**. Il motivo compare **solo dopo**
> il clic («Scegli un modello oppure salta per ora»). Misurato: quattro clic di fila sul passo 2, il
> titolo resta «2 di 4»; poi, scelto un modello, tre clic sul passo 3 e il titolo resta «3 di 4»
> — prova: `avvio-4.png` e `wiz-3.png`

> ⛔ **T20-coerenza-e-primo-avvio-D7** (minore): al passo Modello c'è **«Apri Model Lab»** — nome
> inglese a schermo (H22) — disegnato come testo in grassetto centrato, senza aspetto di pulsante
> — prova: `avvio-4.png`

> ⛔ **T20-coerenza-e-primo-avvio-D8** (minore): la riga di H20 — «**Nessuna telemetria, niente esce da
> questa macchina**» — non compare in nessuno dei quattro passi. C'è una frase vicina, ma sul
> fornitore remoto, che dice il contrario di quello che H20 vuole rassicurare

> ⛔ **T20-coerenza-e-primo-avvio-D9** (minore): nel DOM convivono **due intro**: quella viva
> (`#veloIntro`) e un `#introDialog` legacy con i suoi «Salta per ora / Indietro / Avanti» duplicati,
> invisibile ma presente. Chi scrive una prova (o un lettore di schermo) trova due volte gli stessi
> comandi — prova: le mie prime tre corse hanno misurato il dialogo sbagliato

### ⛔ NON VERIFICATO, per nome

- La **densità** applicata alle **pagine** (Board, Capability, …): l'ho misurata solo sulla barra
  laterale, dove funziona. La spazzata sulle pagine è da rifare con la tendina vera.
- I **veli** (fogli modali) alle tre viewport: la spazzata ha coperto le **schermate**, non i fogli
  («Nuova sessione», permessi, albero dei rami, scorciatoie) — sono stati guardati solo a 1440×900
  nelle altre prove.
- Il passo **4 «Fine»** dell'intro e l'apertura della sessione d'esempio (H19): non ci sono arrivato,
  perché il passo 3 richiede una scelta e non volevo far partire una sessione a nome dell'owner.

## Verdetto (rivisto)

**PASSA CON RISERVA** — 7 difetti veri (D1 ritirato). La **geometria è coerente**: stessa testata,
stesso padding, stesso allineamento, nessuno scorrimento orizzontale, in 48 combinazioni. Quello che
non regge è il **primo avvio**: parte dal secondo passo, non si può ripetere, e il pulsante che deve
farti avanzare non dice mai perché non ti fa avanzare.

> Base del codice: `c1984d79` (worktree `AVM-harness-prove`, istanza sulla porta **4188**).
