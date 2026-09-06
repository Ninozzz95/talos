# T17-impostazioni — Le Impostazioni: dieci sezioni, la ricerca, e cosa dichiarano di sé

> Prova d'uso sull'istanza 4188 (worktree AVM-harness-prove, base c1984d79), guidata come farebbe una persona. 2026-09-06 14:31

## Passi

- **apro le Impostazioni** ✅
  - atteso: dall'ingranaggio in fondo alla barra laterale
  - visto: true
- **la navigazione a sinistra** ✅
  - atteso: D1: navigazione laterale, non schede in alto
  - visto: ["Aspetto e movimento","Chat e composer","Laboratorio modelli","Provider e accessi","Strumenti agente e permessi","Privacy e dati locali","File e workspace","Account, Doctor e backup","Panoramica","Provider","Catalogo API","Installati","Hugging Face","Download"]
- **dieci sezioni in due gruppi** ✅
  - atteso: D2: comportamento · infrastruttura
  - visto: 14 voci · gruppi=["Sezioni","Aspetto","Tema, testo e pannelli","Movimento","Sfondo e risorse","Interazioni"]

> ⛔ **T17-impostazioni-D1** (minore): le sezioni non sono divise nei due gruppi «comportamento» e «infrastruttura» (D2): occhielli visti = ["Sezioni","Aspetto","Tema, testo e pannelli","Movimento","Sfondo e risorse","Interazioni"]
- **la ricerca in cima alla navigazione** ✅
  - atteso: D3: con dieci sezioni si cerca, non si naviga
  - visto: Cerca una preferenza…
- **esporta · importa · ripristina** ❌
  - atteso: D5: tutte e tre
  - visto: ["Ripristina"]

> ⛔ **T17-impostazioni-D2** (medio): mancano dei comandi fra esporta/importa/ripristina (D5): trovati ["Ripristina"]
- **quando morde una impostazione** ❌
  - atteso: D6: scritto SULLA RIGA (subito o dalla sessione nuova)
  - visto: false

> ⛔ **T17-impostazioni-D3** (medio): nessuna impostazione dichiara quando ha effetto (D6)
- **un modello ausiliario per mestiere** ❌
  - atteso: D7: visione · compattazione · titoli · approvazione
  - visto: false

> ⛔ **T17-impostazioni-D4** (medio): non esiste la sezione dei modelli ausiliari per mestiere (D7)
- **timeout dell approvazione (D14)** ❌
  - atteso: la decisione lo chiede
  - visto: ASSENTE
- **redazione dei segreti (D15)** ❌
  - atteso: la decisione lo chiede
  - visto: ASSENTE
- **comandi permessi per progetto (D16)** ❌
  - atteso: la decisione lo chiede
  - visto: ASSENTE
- **indirizzi privati (D17)** ❌
  - atteso: la decisione lo chiede
  - visto: ASSENTE
- **checkpoint dei file (D18)** ❌
  - atteso: la decisione lo chiede
  - visto: ASSENTE
- **provider con pallino di salute (D19)** ❌
  - atteso: la decisione lo chiede
  - visto: ASSENTE
- **chiavi mai in chiaro (D20)** ❌
  - atteso: la decisione lo chiede
  - visto: ASSENTE
- **sezione Costi (D21-D22)** ❌
  - atteso: la decisione lo chiede
  - visto: ASSENTE
- **aspetto: tema, densità, testo, movimento (D23)** ✅
  - atteso: la decisione lo chiede
  - visto: presente
- **memoria e contesto con la ripartizione (D26)** ❌
  - atteso: la decisione lo chiede
  - visto: ASSENTE
- **archiviare le chat (D27)** ❌
  - atteso: la decisione lo chiede
  - visto: ASSENTE
- **il Doctor dentro le impostazioni (D29)** ✅
  - atteso: la decisione lo chiede
  - visto: presente
- **Informazioni con versione e cartelle (D30)** ✅
  - atteso: la decisione lo chiede
  - visto: presente

> ⛔ **T17-impostazioni-D5** (medio): decisioni delle Impostazioni non implementate: timeout dell approvazione (D14) · redazione dei segreti (D15) · comandi permessi per progetto (D16) · indirizzi privati (D17) · checkpoint dei file (D18) · provider con pallino di salute (D19) · chiavi mai in chiaro (D20) · sezione Costi (D21-D22) · memoria e contesto con la ripartizione (D26) · archiviare le chat (D27) — prova: 10 su 13
- **il valore corrente in monospazio** ✅
  - atteso: D8
  - visto: 11 elementi in monospazio
- **Ctrl+/ apre le scorciatoie** ✅
  - atteso: D10-D12: pannello con ricerca, raggruppate per area
  - visto: {"titolo":"","voci":0,"ricerca":false,"gruppi":[]}

> ⛔ **T17-impostazioni-D6** (minore): il pannello delle scorciatoie non ha la ricerca (D10)

## Verdetto

**PASSA CON RISERVA** — difetti trovati: 6 (T17-impostazioni-D1, T17-impostazioni-D2, T17-impostazioni-D3, T17-impostazioni-D4, T17-impostazioni-D5, T17-impostazioni-D6).

## Le otto sezioni, aperte una per una (`T17b-sezioni.mjs`, otto foto)

| Sezione | Cosa c'è dentro, davvero |
|---|---|
| Aspetto e movimento | 14 temi (Forge · Paper · Terminal · Aurora · Glacier · Ember · Atlas · Noir · Signal · Violet · Claudius · Basicus · Telemetry · Calm), modalità colore, **densità**, **lingua dei menu**, dimensione interfaccia, testo chat, forma del composer, stile messaggi, animazioni, **Riduci movimento**, Renderer |
| Chat e composer | una sola preferenza («Chat a tutta larghezza») più un riepilogo in sola lettura e un rimando: «Regola in Aspetto e movimento» |
| Laboratorio modelli | capacità macchina, runtime locale, Ollama, LM Studio, catalogo fornitori, chiavi («Sostituisci la chiave»), timeout per fornitore |
| Provider e accessi | cinque fornitori con «chiave configurata sul server», e la frase onesta «Una chiave presente **non prova** la connessione» |
| Strumenti agente e permessi | policy attiva, regole per attrezzo, **origine della ricerca web** (DuckDuckGo · Tavily · Brave · SearXNG · endpoint · spenta) con «Prova la ricerca» |
| Privacy e dati locali | i nomi e le **dimensioni** delle preferenze di questo browser, e «Svuota le preferenze di questo browser» |
| File e workspace | workspace attivo, file scritti, pagine lette, «Apri l'albero dei file» |
| Account, Doctor e backup | sei pulsanti e nient'altro |

> ⛔ **T17-impostazioni-D7** (medio): la sezione **«Account, Doctor e backup»** ha sei pulsanti e sono
> **cinque parole inglesi su sei**: **Agents · Hooks · Skills · Plugins · MCP** · Doctor. È l'unica
> pagina dell'app in cui la navigazione stessa è in inglese (H21, H22, H23)
> — prova: `foto/T17-impostazioni/sez-AccountD.png`

> ⛔ **T17-impostazioni-D8** (medio): **D30 non è implementata**. La stessa sezione dichiara «Il backup
> non è disponibile da questa pagina» e non porta **né la versione, né le cartelle, né le licenze, né
> «apri la cartella dei dati»** — prova: `sez-AccountD.png`

> ⛔ **T17-impostazioni-D9** (minore): la sezione **«Chat e composer»** contiene **una sola**
> impostazione modificabile e per il resto rimanda altrove («Regola in Aspetto e movimento»): una
> sezione di navigazione che rimbalza a un'altra sezione — prova: `sez-Chatecom.png`

> ⛔ **T17-impostazioni-D10** (minore): i **temi sono quattordici**. La decisione D23 dice «più i temi
> che l'app ha già, ma **meno confusionario e coerente**» — cioè riordinarli. Quattordici nomi in fila
> in una tendina non è un riordino — prova: `sez-Aspettoe.png`

### Il quadro delle decisioni D del capitolo Impostazioni

**Implementate**: D1 (navigazione a sinistra) · D3 (ricerca «Cerca una preferenza…») · D8 (valori in
monospazio, 11 elementi) · D12 (Ctrl+/ apre le scorciatoie) · D23 (tema, densità, testo, movimento:
tutte e quattro) · D29 (il Doctor sta dentro le impostazioni).

**Non implementate, misurate una per una**: D2 (dieci sezioni in due gruppi: sono **otto**, senza
gruppi) · D5 (esporta/importa/ripristina: c'è solo un «Ripristina movimento») · D6 (quando morde una
impostazione) · D7 (modelli ausiliari per mestiere) · D14 (timeout dell'approvazione) · D15 (redazione
dei segreti) · D16 (elenco dei comandi permessi per progetto) · D17 (indirizzi privati: chiedi ogni
volta) · D18 (checkpoint dei file) · D19 (pallino di salute e ultima verifica del provider) · D21-D22
(sezione Costi, consumo per giorno e per modello) · D26 (memoria e contesto con la ripartizione) ·
D27 (archiviare le chat) · D30 (Informazioni).

⇒ **quattordici decisioni su venti** del capitolo D non hanno ancora una superficie.

## Verdetto (rivisto dopo l'ispezione delle foto)

**PASSA CON RISERVA** — 10 difetti. Le sezioni che ci sono sono scritte bene e sono **oneste sui
limiti** («una chiave presente non prova la connessione», «questo controllo non attesta l'isolamento
WSL2»): è la voce giusta. Manca più della metà del capitolo, e la sezione dell'account parla inglese.

> Base del codice: `c1984d79` (worktree `AVM-harness-prove`, istanza sulla porta **4188**).
