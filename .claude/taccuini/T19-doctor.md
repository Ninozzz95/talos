# T19-doctor — Il Doctor: controlli raggruppati, severità, conteggio, rimedi (H1-H7)

> Prova d'uso sull'istanza 4188 (worktree AVM-harness-prove, base c1984d79), guidata come farebbe una persona. 2026-09-06 14:34

## Passi

- **apro il Doctor** ✅
  - atteso: D29: sta dentro le Impostazioni
  - visto: true
- **il conteggio finale** ✅
  - atteso: H1-H5: «21 ok · 2 avvisi · 0 guasti»
  - visto:  3 ok6 note2 avvisi0 guasti Avviso · Servizio agenteConfigurato
- **la severità dei controlli** ✅
  - atteso: ok · nota · avviso · guasto
  - visto: true
- **ogni avviso dice cosa fare** ❌
  - atteso: H1-H5
  - visto: false

> ⛔ **T19-doctor-D1** (medio): gli avvisi del Doctor non dicono cosa fare (H1-H5)
- **quanto spazio occupano app e store** ✅
  - atteso: H6
  - visto: true
- **si esporta in JSON** ✅
  - atteso: H7: per incollarlo in una segnalazione
  - visto: ["Esporta in JSON","Ricontrolla"]
- **il rimedio eseguibile dove è sicuro** ❌
  - atteso: H1-H5
  - visto: []
- **i gruppi dei controlli** ❌
  - atteso: H1-H5: raggruppati
  - visto: []
- **cosa dice il Doctor, per esteso** ✅
  - atteso: lettura
  - visto: DoctorRicevuto 06/09, 16:34Esporta in JSONRicontrolla 11 controlli · 2 da rivedere. 3 ok6 note2 avvisi0 guasti Avviso · Servizio agenteConfigurato.Il runtime agente non espone il catalogo task richiesto.Avviso · Attività predefiniteL’elenco delle attività predefinite non è disponibile in questa installazione.Nota · Chiave APIConfigurata. La validità presso il fornitore non è verificata da questo controllo.Nota · Ambiente dei comandiComando diagnostico eseguito nell’ambiente desktop; questo contr
- **la rotta /api/v1/doctor** ✅
  - atteso: il server risponde con i controlli
  - visto: {"chiaveApi":true,"shell":"desktop","git":true,"naviga":true,"labs":{"accesi":[],"dettaglio":"Labs accesi: nessuno."},"ricercaWeb":{"fonte":"duckduckgo","etichetta":"DuckDuckGo (senza chiave)","pronta":true,"dettaglio":"Pronta, senza chiave: DuckDuckGo (pagina pubblica, può bloccare sotto uso intens

## Verdetto

**PASSA CON RISERVA** — difetti trovati: 1 (T19-doctor-D1).

## Ispezione della foto — il Doctor è la pagina più riuscita di tutta la campagna

`foto/T19-doctor/01-doctor.png`. Testata «Doctor · Ricevuto 06/09, 16:34», in alto a destra
**«Esporta in JSON»** (H7) e **«Ricontrolla»**. Poi:

> **11 controlli · 2 da rivedere.**  `3 ok`  `6 note`  `2 avvisi`  `0 guasti`

— il conteggio finale per severità di H1-H5, in pastiglie colorate, esattamente nella forma decisa.
Sotto, undici carte, ognuna con **severità · titolo · esito · nota**, e ognuna dichiara **cosa NON ha
guardato**, che è la parte difficile:

- «**Nota · Chiave API** — Configurata. La validità presso il fornitore **non è verificata da questo
  controllo**.»
- «**Nota · Ambiente dei comandi** — Comando diagnostico eseguito nell'ambiente desktop; questo
  controllo **non attesta l'isolamento WSL2**.»
- «**Nota · Navigazione web** — Attrezzo disponibile. Questo controllo **non apre una pagina e non
  verifica la connessione**.»
- «**Nota · Ricerca web** — DuckDuckGo (senza chiave)… **Stato della configurazione; nessuna ricerca
  viene eseguita qui**.»

È la lezione «ogni cancello dice cosa ha guardato», applicata undici volte.

## I due difetti

> ⛔ **T19-doctor-D1** (medio, già registrato sopra): i due **avvisi** dicono cosa non va — «Il runtime
> agente non espone il catalogo task richiesto», «L'elenco delle attività predefinite non è disponibile
> in questa installazione» — ma **non dicono cosa fare**. H1-H5 chiede che «ogni avviso dice cosa
> fare», e che «il rimedio è eseguibile dove è sicuro» (riavvia il server, apri la cartella): non c'è
> nessun pulsante di rimedio su nessuna delle undici carte

> ⛔ **T19-doctor-D2** (minore): i controlli **non sono raggruppati** (H1-H5): sono undici carte in
> fila. Con undici si regge; è la crescita che diventa illeggibile

### Cosa dice il server

`/api/v1/doctor` risponde con la sostanza, non con una pagina: `chiaveApi`, `shell: "desktop"`, `git`,
`naviga`, `labs`, `ricercaWeb {fonte, etichetta}`… — quindi H7 («si esporta in JSON per incollarlo in
una segnalazione») ha davvero qualcosa dietro.

E il Doctor **ha trovato per davvero** l'unico guasto reale della mia istanza: «Il runtime agente non
espone il catalogo task richiesto», lo stesso avviso che il server scrive all'avvio. Non è una pagina
decorativa: dice il vero.

## Verdetto (rivisto dopo l'ispezione della foto)

**PASSA CON RISERVA** — 2 difetti (1 medio, 1 minore). Delle venti superfici che ho guidato, il Doctor
è quella che rispetta meglio le decisioni prese: conteggio, severità, esportazione, e soprattutto
**dichiara i limiti di ogni controllo**. Gli manca solo il rimedio.

> Base del codice: `c1984d79` (worktree `AVM-harness-prove`, istanza sulla porta **4188**).
