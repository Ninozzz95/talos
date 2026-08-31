# LEDGER — Tabella di marcia Desktop, dopo l'harness (30/8)

> ⛔ Richiesta arrivata **a metà** del giro di chiusura di Task 5/Task 12
> (QA visiva, `.claude/QA-VISIVA-HARNESS-2026-08-30.md`), owner: *"vorrei
> che segnassi queste cose e formulo il piano tabella di marcia
> aggiornato"* — **REGISTRATA qui per intero, NON iniziata**: nessun
> file di prodotto toccato per questo lavoro. È l'owner stesso a dire
> che costruirà la tabella di marcia — questo file è solo la
> trascrizione fedele di cosa ha chiesto di segnare, per la stessa
> regola già in uso tutta la sessione (una fase alla volta, un filo
> vero si registra e si lascia per un sì separato — qui il "filo" è
> l'owner stesso, non una scoperta mia).

## Richiesta owner, verbatim (30/8, "RECEPISCI")

> *"Allora vorrei che segnassi queste cose e formulo il piano tabella di
> marcia aggiornato"*

1. **Porting completo delle impostazioni dal mobile al desktop** — *"mi
   interessa un censimento completo delle impostazioni realmente
   applicabili su desktop"* (non un porting cieco 1:1: prima un
   censimento di quali hanno senso fuori da un telefono).
2. **Tutorial e intro come su mobile.**
3. **README ufficiale della repository — riscrittura**: *"molto, molto
   indietro rispetto a tutte le funzioni e prevede solo la versione
   mobile"*. Deve includere **i benchmark del banco contro gli altri
   provider di harness** e mostrare dove TALOS supera. Richiesta
   un'ispezione ATTENTA del README esistente + ricerca web sulle
   pratiche migliori per un README "accattivante e allo stato
   dell'arte, allineato all'ultimo mese, con foto senza essere troppo
   prolisso né troppo corto". L'owner vuole sapere **quali screenshot
   servono** — "li facciamo assieme oppure li fai tu".
4. **Decisione su come rilasciare la versione desktop**: Windows, Linux
   e Mac, con un installer "un po' come fa Hermes". Vuole un piano per
   un installer con **interfaccia super moderna e completa che installa
   tutto in un solo step** — *"l'utente deve fare i meno passi
   possibili"* — con selezione dei componenti disponibile ma opzionale
   dentro il flusso.
5. ⛔⛔⛔ **Dimenticanza importante e cruciale, segnalata dall'owner
   stesso**: la capacità di far girare **modelli locali sul desktop**,
   esattamente come fa il mobile. Porting dell'intera sezione
   "Laboratorio modelli" del mobile, **adattata a un'interfaccia
   desktop**. Ottimizzazioni **allo stato dell'arte dell'ultimo mese su
   desktop** — non solo "far girare qualcosa", pareggiare la cura già
   messa sul motore mobile. Vincolo esplicito: **ogni ottimizzazione
   fatta sul mobile deve essere portata anche sul desktop**, con
   ottimizzazioni ULTERIORI specifiche del desktop (non un sottoinsieme
   del mobile).

## Cosa NON è, per essere precisi

Non è un piano approvato, non è una sequenza di fasi, non ha stime.
Nessuna decisione di design è presa qui (formato installer, quali
impostazioni sono "realmente applicabili", struttura del nuovo README,
architettura del motore locale desktop) — tutte esplicitamente
rimandate al piano che l'owner formulerà. Questo file esiste solo
perché la regola di questa sessione è *i debiti riportati si segnano
SEMPRE, subito, mai lasciati solo in chat* — vale anche per una lista
di richieste dell'owner quanto per un bug trovato in corsa.

## Collegamenti — lavoro già fatto o già aperto che questi punti toccano

- Il punto 1 (porting impostazioni) e il punto 2 (tutorial/intro) si
  intrecciano con [[stessa-ui-mobile-desktop-backend-diverso]] — quella
  nota fissa la direzione opposta per la CHAT (l'harness diventa il
  metro di paragone per il mobile), ma qui la direzione è quella
  dichiarata da questo messaggio: impostazioni/tutorial vanno DAL
  mobile VERSO il desktop. Le due direzioni non si contraddicono (sono
  sottosistemi diversi: chat vs. impostazioni/onboarding) ma vanno
  tenute distinte quando si scrive il piano vero.
- Il punto 3 (benchmark del banco nel README) presuppone TALOS-BANCO
  in uno stato presentabile — vedi il debito aperto
  [[28/8 — TALOS-BANCO: 24 righe su 27 perse]]
  (`corri-riscrive-il-file-se-ripetizioni-non-combacia.md`) e
  [[onesta-batte-velocita-hermes-e-il-peggiore]] (il confronto onestà,
  già misurato, già scomodo per TALOS su un punto preciso — un README
  che mostra "dove TALOS supera" deve reggere anche dove non supera
  ancora, o non è un README onesto).
- Il punto 5 (modelli locali su desktop) riparte dal lavoro già fatto
  sul motore mobile — [[motore-locale-max-performance-22-agosto]] (Fase
  0-3 chiuse, Fase 4/5 in corso) — non da zero: il vincolo "ogni
  ottimizzazione del mobile va portata" implica leggere quel lavoro
  PRIMA di progettare la versione desktop, non reinventarla.
- Il punto 4 (installer) è nuovo, nessun lavoro precedente in questa
  sessione lo tocca.

## Aggiornamento P0 — eseguito (31/08/2026)

La coda P0 registrata sopra non è più aperta. Sono stati chiusi e verificati:

- copy naturale per nuova sessione senza cartelle, con proposta Full access e
  accesso a Doctor;
- menu contestuale CRUD su ogni sessione reale, riusando le azioni già presenti
  per Files e mantenendo la conferma solo su Elimina;
- Settings in otto categorie list-detail, con riga scorrevole nel compatto;
- Settings full width nel pannello centrale, senza il contenitore stretto della
  chat e con container query per evitare sovrapposizioni.

File esatti: `mobile/public/harness-ui/app.js`,
`mobile/public/harness-ui/index.html`, `mobile/public/harness-ui/styles.css`,
`mobile/tests/unit/harness/harnessUiFrontend.test.ts` e
`harness-ui/scripts/qa-visual-pipeline.mjs`. Evidenza: scenario
`qa-p0-ux` a 1440×900 e 1024×800 nelle due directory `.qa-runs` indicate nel
[QA visivo](./QA-VISIVA-HARNESS-2026-08-30.md), tre screenshot per corsa,
zero difetti, zero eccezioni JS e zero richieste fallite.

Gate aggiornati: backend **1.060/1.060**, frontend Harness **197/197**,
typecheck, sintassi e `git diff --check` passati. Commit e push restano fuori
da questo aggiornamento.

## Stato

🔜 **REGISTRATO, non iniziato.** L'owner formulerà la tabella di
marcia; questo file resta la trascrizione fedele della richiesta
finché quel piano non arriva. Nessun file di prodotto toccato.

## Addendum di stato — 31/08/2026

La frase precedente descriveva lo stato al 30/08. Dopo l'esecuzione delle
Fasi 8C/9/10, il perimetro **modelli locali desktop** è operativo e verificato:
catalogo Hugging Face, download diretto, pausa/ripresa/annullamento, SHA-256,
manifest locale, runtime llama.cpp, stream SSE e stop. Vedi il [Ledger Fase
10](./LEDGER-FASE-10-HF-DOWNLOAD-RUNTIME-DESKTOP-2026-08-31.md) e la [Consegna
Fase 10](./CONSEGNA-FASE-10-HF-DOWNLOAD-RUNTIME-DESKTOP-2026-08-31.md).

### Tabella di marcia consolidata

| Fase | Stato | Cosa significa |
|---|---|---|
| 0 — baseline, ricerca e ledger | ✅ chiusa | Contratti mobile, Hermes e competitor confrontati; pin e confini fissati. |
| 1 — Aspetto mobile → desktop | ✅ chiusa | Le 35 impostazioni A01–A35 sono state portate nel theme/motion engine desktop e verificate. |
| 2 — Model Lab preparatorio | ✅ chiusa | Hub, capacità macchina, provider/catalogo reale e stati gated sono presenti. |
| 3 — Contratti runtime e sicurezza | ✅ chiusa | Store, supervisor, adapter, policy, eventi e conformance sono implementati. |
| 4 — Hugging Face → llama.cpp | ✅ chiusa | Download/installazione/caricamento/generazione reali provati su Windows. |
| 5 — Parità Model Lab mobile residua | ⏳ aperta | Import `.gguf`, azioni sugli installati, filtri HF avanzati, probe/fit visibili, provider configurabili e model card completa. |
| 6 — Performance e qualità | ⏳ aperta | Matrice cold/warm, TTFT, tok/s, RAM/GPU, cancel latency, quantizzazioni Q4+ e prove multipiattaforma. |
| 7 — Provider esterni | ⏳ condizionata | Smoke reale Ollama/LM Studio solo quando installati; oggi correttamente `not installed`. |
| 8 — Installer desktop | ⏳ aperta | Packaging Windows/Linux/macOS, gestione runtime, aggiornamenti e rollback installer. |
| 9 — README e release evidence | ⏳ aperta | README desktop con screenshot approvati e benchmark TALOS-BANCO riproducibili. |
| 10 — Gate finale di pubblicazione | ⏳ aperta | Review diff, commit autorizzato, build pulita e release; push sempre separato. |

### Mancanze prima della release desktop

1. Completare la parità funzionale Model Lab: le voci M04–M52 devono essere
   operative oppure marcate esplicitamente `gated`/`non applicabile`.
2. Eseguire la matrice performance reale con almeno una quantizzazione
   produttiva; Q2_K è stato usato per validare il trasporto, non la qualità.
3. Definire e implementare packaging multipiattaforma e ciclo di
   aggiornamento/rollback.
4. Preparare README e benchmark soltanto con evidenza TALOS-BANCO approvata e
   riproducibile.

### Coda P0 aggiunta dall'owner — da eseguire prima delle fasi successive

- **Nuova sessione e cartelle:** eliminare dalla UI ogni termine tecnico
  (`TALOS_HARNESS_UI_PROJECT_DIRS`, server, stack); mostrare un messaggio
  naturale con soluzione proposta e collegamento a Doctor. Il Doctor conserva
  il dettaglio tecnico e il codice diagnostico. File: `mobile/public/harness-ui/app.js`,
  `harness-ui/src/http-app.mjs`, `harness-ui/src/config.mjs`,
  `harness-ui/src/doctor.mjs`, test HTTP/config/Doctor/frontend.
- **Sessioni — menu contestuale:** il tasto destro deve aprire un menu CRUD
  completo come Files (azioni reali soltanto, conferma solo per eliminazione,
  Escape/click esterno e focus corretti). File: `mobile/public/harness-ui/app.js`,
  `mobile/public/harness-ui/styles.css`, `harness-ui/src/http-app.mjs`,
  `harness-ui/src/session-registry.mjs`, test sessioni/HTTP/frontend.
- **Impostazioni — navigazione per sezioni:** adottare list-detail desktop
  (menu verticale categorie + pannello singolo) e tabs/righe scorrevoli sotto
  breakpoint compatto, con sezioni Aspetto, Chat, Modelli, Provider, Strumenti,
  Privacy, File/Workspace, Account/Doctor/Backup. File: `mobile/public/harness-ui/index.html`,
  `app.js`, `styles.css`, test frontend e QA visiva.

Decisione UX registrata dopo ricerca: list-detail è il layout canonico per una
lista con dettaglio; `menu`/Escape resta riservato alle azioni contestuali, non
alla navigazione delle categorie ([Material 3 canonical layouts](https://m3.material.io/foundations/layout/canonical-examples/overview),
[MDN menu role](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/menu_role)).

### Known issue - Full access con radice `C:\\` (31/08/2026)

L'owner ha provato a indicare l'intero disco `C:\\` come cartella della
sessione. Il flusso risulta **estremamente instabile/flaky**: il modello non
risponde correttamente in modo affidabile. Il fatto e registrato come debito
aperto, non come funzione risolta.

- Perimetro: `mobile/public/harness-ui/app.js` (selezione `Full access`),
  `harness-ui/src/custom-task.mjs` (validazione percorso),
  `harness-ui/src/session-registry.mjs` (gate permesso) e
  `mobile/scripts/harness-talos/talosHarness.mjs`/`discoNode.ts` (radice e
  comandi).
- Riproduzione richiesta: nuova sessione `Full access` con radice `C:\\`,
  prompt naturale, risposta completa e percorso contrario; registrare eventi,
  errore, timeout, tool e directory effettivamente usata.
- Non attribuire la causa a WSL o al modello senza una riproduzione
  strumentata end-to-end.
- Gate di chiusura: test RED dedicato, correzione della causa radice, test
  GREEN backend/frontend, prova con un modello reale e screenshot/QA desktop.
  Nessun default globale su `C:\\` finche il debito non e chiuso.

## Fase Provider/API key desktop — chiusa e consegnata (31/08/2026)

La fase intermedia richiesta dall'owner prima del completamento Model Lab è
chiusa. Il desktop ora porta la gestione provider del mobile nel Laboratorio
modelli, con card richiudibili, salvataggio/rimozione chiavi nel portachiavi del
computer, endpoint e timeout validati e messaggi comprensibili. Le sole
preferenze non segrete endpoint/timeout sopravvivono al riavvio tramite file
locale escluso da git; le chiavi non vengono mai scritte nel file o nel browser.

File e ledger completi: [Consegna Provider/API key](./CONSEGNA-FASE-PROVIDER-API-KEY-DESKTOP-2026-08-31.md) e
[Ledger Provider/API key](./LEDGER-FASE-PROVIDER-API-KEY-DESKTOP-2026-08-31.md).

Gate chiusi: store/HTTP **13/13**, frontend Harness **58/58**, build mobile
verde, sintassi e `git diff --check` verdi; QA Chrome senza difetti a 1440×900 e
1024×800 con dodici screenshot ispezionati integralmente. La suite completa del
repository conserva soltanto i fallimenti preesistenti elencati nella
consegna.

### Ordine operativo aggiornato dopo questa fase

1. **5A — parità Model Lab mobile residua:** importazione `.gguf`, azioni sui
   modelli installati, filtri Hugging Face avanzati, scheda modello completa,
   coda download e stati visibili; ogni voce deve essere reale o dichiarata
   `gated`.
2. **5B — collegamento runtime locale desktop:** scelta runtime supportato,
   probe/fit, modello attivo condiviso con Chat, stream, stop e sicurezza; la
   fase Provider appena chiusa fornisce gli accessi, non sostituisce il runtime.
3. **Known issue Full access `C:\\`:** riproduzione strumentata e correzione
   della causa, solo dopo 5A/5B come richiesto dall'owner.
4. **Performance e qualità:** matrice cold/warm, TTFT, tok/s, memoria e
   cancellazione con quantizzazioni produttive.
5. **Provider esterni, installer e README/release evidence:** soltanto dopo
   prove reali e decisioni di packaging.

Per ogni fase restano obbligatori ledger a livello file, ricerca upstream
aggiornata, test contrari, confronto Hermes/competitor, prova visiva desktop e
riepilogo semplice. Nessun commit o push è implicato dalla chiusura di questa
fase.
