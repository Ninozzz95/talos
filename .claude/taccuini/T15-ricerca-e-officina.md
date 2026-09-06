# T15-ricerca-e-officina — Ricerca approfondita e Officina attrezzi: i rapporti riapribili e il codice in sola lettura

> Prova d'uso sull'istanza 4188 (worktree AVM-harness-prove, base c1984d79), guidata come farebbe una persona. 2026-09-06 14:24

## Passi

- **apro Ricerca approfondita** ✅
  - atteso: una sezione con l elenco dei rapporti (C26)
  - visto: schermo=schermoRicerca
- **i rapporti riapribili** ❌
  - atteso: C26: l elenco dei rapporti, RIAPRIBILI
  - visto: dichiara «La consultazione del rapporto e delle fonti non è ancora disponibile qui»

> ⛔ **T15-ricerca-e-officina-D1** (grave): la Ricerca approfondita elenca le ricerche ma dichiara che «la consultazione del rapporto e delle fonti non è ancora disponibile qui»: C26 vuole i rapporti RIAPRIBILI, ed è la funzione stessa della sezione — prova: Ricerca approfondita0 ricerche elencateNuova ricerca RicercaRicerche del progettoCerca per titolo o stato e consulta la data di avvio. Lo stato «Conclusa» non certifica le fonti del rapporto.0 ricerch
- **«Nuova ricerca»** ✅
  - atteso: si può avviare una ricerca da qui
  - visto: true
- **apro Officina attrezzi** ✅
  - atteso: gli attrezzi creati dal modello (C27)
  - visto: schermo=schermoOfficina
- **il codice dell attrezzo in sola lettura** ❌
  - atteso: C27
  - visto: dichiara «La lettura della definizione completa non è ancora disponibile qui»

> ⛔ **T15-ricerca-e-officina-D2** (grave): l Officina non mostra il codice dell attrezzo in sola lettura (C27): dichiara che «la lettura della definizione completa non è ancora disponibile qui», che è proprio ciò che rende l attrezzo giudicabile prima di abilitarlo — prova: Officina attrezzi0 attrezzi · 0 abilitati OfficinaAttrezzi creati dal modelloControlla cosa possono fare prima di abilitarli. La scelta vale in tutte le conversazioni, anche di altri progetti.0 attrez
- **il conteggio e il dettaglio** ❌
  - atteso: devono dire la stessa cosa
  - visto: «0 attrezzi · 0 abilitati» con un dettaglio a schermo = true

> ⛔ **T15-ricerca-e-officina-D3** (grave): l Officina dichiara «0 attrezzi · 0 abilitati» e «Nessun attrezzo creato dal modello», e nella stessa schermata mostra il dettaglio di un attrezzo («Riepilogo delle attività», «Installato 04/09/2026», «Rischio dichiarato R1», «Disabilita questo attrezzo»): il conteggio e il pannello si smentiscono — prova: Officina attrezzi0 attrezzi · 0 abilitati OfficinaAttrezzi creati dal modelloControlla cosa possono fare prima di abilitarli. La scelta vale in tutte le conversazioni, anche di altri progetti.0 attrezzi · 0 abilitati TuttiAbilitatiDisabilitatiAggiorna Nessun attrezzo creato dal modello. Riepilogo de
- **«disabilita» in evidenza** ✅
  - atteso: C27
  - visto: true

## Verdetto

**PASSA CON RISERVA** — difetti trovati: 3 (T15-ricerca-e-officina-D1, T15-ricerca-e-officina-D2, T15-ricerca-e-officina-D3).

> ⚠️ **Il verdetto vale per il codice alla base `c1984d79`.** Un altro agente sta riscrivendo queste
> superfici in parallelo.

## ⚠️ Rettifica: T15-ricerca-e-officina-D3 è un difetto della MIA sonda

Guardando `foto/T15-ricerca-e-officina/02-officina.png` l'Officina mostra **solo** lo stato vuoto —
«0 attrezzi · 0 abilitati», «Nessun attrezzo creato dal modello» — e **nessun pannello di dettaglio**.
La contraddizione che avevo denunciato («Riepilogo delle attività · Installato 04/09/2026 · Rischio
dichiarato R1») veniva dal `textContent` dell'intero schermo, che include il **markup nascosto del
mockup**. A schermo non c'è. **D3 è ritirato.**

*(Resta un debito minore, non un difetto visibile: quel dettaglio finto vive ancora nel DOM come
scheletro del mockup, con una data e un rischio inventati.)*

## Ispezione delle foto

`01-ricerca.png` e `02-officina.png`. Le due pagine sono costruite bene e si dichiarano con
precisione:

- **Ricerca approfondita**: testata «Ricerche del progetto», sei filtri di stato (Tutte · In corso ·
  In pausa · Concluse · Annullate · Non riuscite), «Nuova ricerca», e due frasi oneste: «Lo stato
  *Conclusa* **non certifica le fonti** del rapporto» e «Fino a 20 ricerche recenti di questo
  progetto».
- **Officina attrezzi**: «Controlla cosa possono fare **prima di abilitarli**. La scelta vale in tutte
  le conversazioni, anche di altri progetti» — dichiara la **portata** della modifica, che è C30.

## Le due funzioni che le pagine dichiarano di non avere

Entrambe le sezioni chiudono con una riga che ritira la loro ragione d'essere:

- Ricerca: **«La consultazione del rapporto e delle fonti non è ancora disponibile qui.»** — ma C26
  vuole «l'elenco dei rapporti, **riapribili**»: senza riaprirli, la sezione è un elenco di titoli.
- Officina: **«Attrezzi globali. La lettura della definizione completa non è ancora disponibile qui.»**
  — ma C27 vuole «il **codice** dell'attrezzo in sola lettura», ed è proprio ciò che permette di
  decidere se fidarsi prima di abilitare.

⇒ Sono dichiarazioni oneste, ed è la forma giusta (meglio che un pulsante che non fa niente). Ma è la
**funzione centrale** delle due sezioni a mancare, non un contorno.

### ⛔ NON VERIFICATO, per nome

- **Una ricerca vera dall'inizio alla fine**: non ho avviato una «Nuova ricerca» (costa più di quanto
  il budget di questa campagna consenta, e la sezione dichiara comunque di non saper riaprire il
  rapporto).
- **Un attrezzo creato dal modello** (`tool_create`) e la sua abilitazione: l'Officina è vuota, quindi
  «disabilita in evidenza», il rischio dichiarato e la portata **non si sono potuti vedere su un
  attrezzo vero**.

## Verdetto (rivisto dopo l'ispezione delle foto)

**PASSA CON RISERVA** — 2 difetti veri (D1, D2), entrambi gravi, entrambi la stessa forma: la pagina
c'è, la funzione per cui esiste no. D3 ritirato.

> Base del codice: `c1984d79` (worktree `AVM-harness-prove`, istanza sulla porta **4188**).
