# T12-libreria — Libreria: i file del progetto, e quanto costano in contesto

> Prova d'uso sull'istanza 4188 (worktree AVM-harness-prove, base c1984d79), guidata come farebbe una persona. 2026-09-06 14:24

## Passi

- **apro Libreria** ✅
  - atteso: una destinazione della barra laterale (C2)
  - visto: voce="Libreria0" · schermo=schermoLibreria
- **senza sessione aperta** ✅
  - atteso: o i dati, o una frase che dica che serve una sessione
  - visto: Libreria0 file · Token non disponibiliAggiungi documento LibreriaFile del progettoCaricati o generati. Cerca per nome, tipo o provenienza e consulta i dettagli dei file salvati.0 file TuttiCaricatiGen
- **con una sessione aperta** ✅
  - atteso: gli stessi dati, o i file veri
  - visto: Libreria0 file · Token non disponibiliAggiungi documento LibreriaFile del progettoCaricati o generati. Cerca per nome, tipo o provenienza e consulta i dettagli dei file salvati.0 file TuttiCaricatiGen
- **il costo in token dei file** ❌
  - atteso: C21: un file in Libreria dichiara il costo in token
  - visto: «Token non disponibili»

> ⛔ **T12-libreria-D1** (medio): la Libreria dichiara «Token non disponibili» in testata: il costo in token dei file (C21, coerente con B9) non c è — prova: Libreria0 file · Token non disponibiliAggiungi documento LibreriaFile del progettoCaricati o generati. Cerca per nome, t
- **«Aggiungi documento»** ✅
  - atteso: si può mettere un file in libreria
  - visto: Aggiungi documento
- **dove vivono i file** ✅
  - atteso: C29
  - visto: true

> ⛔ **T12-libreria-D2** (medio): la Libreria ha il filtro «Sempre nel contesto / A richiesta» ma dichiara in fondo che «l elenco non indica quali file sono nel contesto»: il filtro promette una cosa che la pagina nega — prova: Sempre nel contesto · A richiesta + «L’elenco non indica quali file sono nel contesto.»

## Verdetto

**PASSA CON RISERVA** — difetti trovati: 2 (T12-libreria-D1, T12-libreria-D2).

> ⚠️ **Il verdetto vale per il codice alla base `c1984d79`.** Un altro agente sta riscrivendo queste
> superfici in parallelo.

## Ispezione della foto

`foto/T12-libreria/01-libreria.png`: pagina intera, testata «Libreria · File del progetto», campo di
ricerca, filtri **Tutti · Caricati · Generati** più **Sempre nel contesto · A richiesta**, il pulsante
**«Aggiungi documento»**, lo stato vuoto «Nessun file in Libreria per questo progetto» e in fondo, in
piccolo, **dove vivono i file** (C29). L'impianto c'è.

> ⛔ **T12-libreria-D3** (medio): la testata dichiara **«0 file · Token non disponibili»**. «Token non
> disponibili» è scritto **sempre**, anche a libreria vuota: non è un dato assente, è una promessa
> ritirata in testata. C21 (e B9, che è il nostro +1 dichiarato) vogliono il costo in token per file

### ⛔ NON VERIFICATO, per nome

- **C21 con file veri**: la Libreria è vuota, e l'unico modo di riempirla dall'interfaccia è
  «Aggiungi documento», che apre un selettore di file di sistema (fuori dalla portata di una prova
  automatica). Il costo in token **per riga** non l'ho potuto vedere su un file vero.
- Il pannello di dettaglio di un file (provenienza, tipo, politica di contesto) per lo stesso motivo.

## Verdetto

**PASSA CON RISERVA** — 3 difetti (tutti medi). La pagina è ben costruita e onesta sui limiti; le due
cose che la decisione C21 le chiede — il costo in token e quali file sono davvero nel contesto — sono
entrambe dichiarate **non disponibili** dalla pagina stessa.

> Base del codice: `c1984d79` (worktree `AVM-harness-prove`, istanza sulla porta **4188**).
