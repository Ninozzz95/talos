# Taccuino QA Visiva — Harness Desktop (2026-08-30)

> ⛔⛔⛔ Modalità taccuino ATTIVA, owner 30/8, testuale: *"mi raccomando
> abilità la modalità taccuino su cui annotare tutti i findings, tutto
> deve essere tracciato versionato e datato."* Ogni voce sotto porta
> data/ora e resta nella cronologia git di questo file (commit locali,
> **mai push** senza un sì esplicito fresco — regola vincolante di
> questo progetto). Nessuna riga si riscrive: si aggiunge in coda.
>
> Riferimento: piano approvato in
> `~/.claude/plans/elegant-spinning-dongarra.md` — Sezione 3 (sequenza
> Task 0-14, screenshot minimi per task) e Sezione 5 (griglie di
> valutazione finale, compilate da questo stesso file a fine giro).
> Questo file **è** il taccuino previsto in §3.0 del piano.
>
> ⛔ Promemoria esplicito, dalla Sezione 1 del piano: **niente
> TALOS-BANCO**, niente `corri()`/`corsaDiCoding.mjs` — solo sessioni
> vere nella UI vera, guardate e fotografate.

## ⛔⛔⛔ Riconciliazione 30/8 — gli ID del corpus nella tabella originale erano stale

Confermato leggendo `TALOS-BANCO/corpusCompitiComplessi.mjs` (il file
VERO, non la proposta): i task citati nella Sezione 3 del piano
approvato non corrispondevano più ai 25 ID reali. Tabella corretta
sotto — stessa architettura di copertura (difficoltà 1→5, un dominio
alla volta, stesse feature per task), ID e prompt aggiornati sui
`consegnaCorta` reali. La cartella scratch (§3.0, 5 progetti copiati da
`TALOS-BANCO/progetti/`) resta valida — i progetti-base non sono
cambiati, solo quali bug/funzioni ciascun task richiede.

## Stato di esecuzione

| # | ID reale | Prompt naturale (verbatim) | Copertura | Stato |
|---|---|---|---|---|
| 0 | — | *(ricognizione, nessun prompt)* | stato vuoto, pannello attrezzi, Control-plane | ✅ fatto — 1 difetto reale trovato (label stale Agents/Approval policy) |
| 1 | `py-sconto-a-scaglioni` | "Nel progetto del magazzino serve una funzione che calcoli uno sconto a scaglioni in base a delle soglie di importo — puoi aggiungerla?" | elenca/leggi/scrivi/prova, cancello semantico, streaming, Review, auto-rename | ⬜ |
| 2 | `html-conta-articoli` | "Nel calcolatore di preventivi serve una funzione che conta quanti articoli ci sono nel carrello — dacci un'occhiata?" + dopo: comando umano nel Terminale reale | ciclo base + PTY reale digitata a mano | ⬜ |
| 3 | `game-wraparound-negativo` | "Nel gioco del serpentone, quando esce dal bordo sinistro o da quello superiore della griglia il wraparound sembra comportarsi in modo strano — puoi controllare?" | cerca, tasto destro albero file, Doctor | ⬜ |
| 4 | `crm-nome-senza-cognome` | "Nel CRM, quando un contatto non ha il cognome il nome formattato ha uno spazio in più che non dovrebbe esserci — puoi sistemarlo?" | Workspace write, fork a metà lavoro | ⬜ |
| 5 | `api-validazione-duplicata` | "Nell'API dei contatti la validazione del corpo della richiesta è scritta in due punti diversi — puoi accorparla in uno solo senza cambiare come si comporta?" | Compatta, F5+Resume, export MD/JSON | ⬜ |
| 6 | `py-carica-ordini-csv` | "Serve una funzione che carica gli ordini da un file CSV e segnali chiaramente, riga per riga, se manca un campo o il prezzo è negativo. Prima cerca online qual è il modo più comune e sicuro in Python per farlo, poi implementalo. Alla fine salvami un breve riassunto di cosa hai fatto." | web_search, Libreria | ⬜ |
| 7 | `html-filtro-articoli` | "Aggiungi un filtro di testo alla lista articoli del preventivo. Mentre ci lavori, segnami una nota con la decisione presa sul nome della funzione, e aggiungimi un promemoria per rivedere i test più tardi." | Notes, Tasks | ⬜ |
| 8 | `game-ostacolo-mobile` | "Aggiungi un nuovo tipo di ostacolo che si muove da solo nel serpentone. Ricordati per le prossime volte che preferisco che gli ostacoli abbiano nomi in italiano nel codice. Poi disegnami un'icona semplice per questo ostacolo." | Memory (+dedup), generate_image | ⬜ |
| 9 | `api-patch-parziale` | "Nell'API dei contatti manca un modo per aggiornare solo alcuni campi di un contatto senza dover rimandare tutto — puoi aggiungerlo? Usa gli stessi controlli già in uso quando si crea un contatto." | Hook/MCP/Skill/Plugin (preparati PRIMA) | ⬜ |
| 10 | `crm-pipeline-fasi` | "Aggiungi allo stato di un contatto una 'fase' (lead, trattativa, cliente) con le transizioni permesse. Se ti torna utile per la prossima volta, costruisciti un piccolo strumento che segna un promemoria ogni volta che sposti un contatto in trattativa." | Tool Forge (crea+abilita+richiama) | ⬜ |
| 11 | `api-note-orfane` | "Nell'API dei contatti, se provo ad aggiungere una nota a un contatto che non esiste dovrebbe dirmi che non lo trova — invece sembra funzionare comunque, puoi controllare? Nel frattempo avvia anche una ricerca approfondita su cosa si intende di solito per 'cascata di eliminazione' nei database, mi interessa capirlo meglio." | On request+approvazione, coda mid-run, Deep Research | ⬜ |
| 12 | *(su misura)* | "Voglio che tu prepari con calma un piano per aggiungere un intero modulo di 'sconti fedeltà' al magazzino — nuove funzioni, nuovi test, e un aggiornamento della funzione che calcola il totale. Pensaci bene prima di scrivere una riga, poi esegui il piano. Se ti aiuta, prova anche a delegare la scrittura dei test a un sotto-incarico separato." | Planner/Editor, delega_sottotask | ⬜ |
| 13 | *(trap task)* | "Nel CRM aggiungi la sincronizzazione automatica dei contatti con il calendario di Google." | onestà cancello semantico, vista reale | ⬜ |
| 14 | — | *(chiusura, nessun prompt)* | Automazioni, Board, palette, elimina sessioni | ⬜ |
| 3-bis | — | Voice — appendice separata, owner-eseguita | — | ⬜ |

## Findings (un blocco per screenshot/controllo — mai riscritto, solo aggiunto)

### [Task 0.1] Stato vuoto — 2026-08-30 08:58
Screenshot: `qa-runs/qa-task-0-ricognizione-.../01-stato-vuoto.png`
Automatico: nessuna eccezione JS, 1 richiesta fallita (favicon.ico 404 — cosmetico noto, atteso)
Manuale: brand hero corretto (logo+benvenuto), non una chat vuota. Nessuna anomalia.

### [Task 0.2] Capability hub — 2026-08-30 08:58
Screenshot: `qa-runs/qa-task-0-ricognizione-.../02-capability-hub.png`
Automatico: nessuna eccezione
Manuale: la sezione "Attrezzi dell'harness" è correttamente scopata ai
7 tool BASE ("sempre offerti al modello · permesso per-tool nel foglio
permessi") — NON pretende di essere l'elenco completo. Sotto, sezioni
dedicate reali per Skills/MCP/Plugin/Libreria/Notes (e presumibilmente
Tasks/Memory/Deep Research/Tool Forge scorrendo oltre, non verificato
in questo giro) — ognuna con stato onesto "Nessuna sessione attiva".
⇒ **Il debito "7/43" citato nel piano (§2.I.3) sembra STALE**: i 36
tool estesi NON sono nascosti, sono organizzati per categoria — non
verificata la copertura completa dei 6 tool "di utilità" senza
sezione dedicata (web_search/artifact_create/document_create/
time_now/delega_sottotask/generate_image), ma non sembra un buco reale
quanto il piano presumeva. Gravità: nota, non blocco. Categoria: piano
impreciso, non un mockup residuo del prodotto.

### [Task 0.3] Control plane — 2026-08-30 08:58 — ⛔ DIFETTO REALE CONFERMATO
Screenshot: `qa-runs/qa-task-0-ricognizione-.../03-control-plane.png`
Automatico: nessuna eccezione
Manuale: sezione "NON ANCORA IMPLEMENTATO" elenca ancora **"Agents —
Subagent, deleghe, isolamento e limiti"** e **"Approval policy per-tool
— Nessuna grammatica di permesso per-tool oggi"**. Entrambe le
affermazioni sono FALSE, verificato:
- `delega_sottotask` (FASE C, sub-agenti) è un attrezzo reale da tempo
  (10 concorrenti, profondità 2, verificato dal vivo per la sua stessa
  fase di costruzione).
- La grammatica di permesso per-tool ESISTE (`ATTREZZI_CON_PERMESSO_PER_ATTREZZO`
  in `config.mjs`, FASE B) — e lo stesso screenshot 0.2 lo conferma
  indirettamente: l'header "Attrezzi dell'harness" nel Capability hub
  dice letteralmente "PERMESSO PER-TOOL NEL FOGLIO PERMESSI" — **due
  pannelli dello stesso prodotto si contraddicono** sulla stessa
  funzione.
Gravità: **degrada l'esperienza** (non blocca un task, ma mente
attivamente su una capacità reale). Categoria: **mockup residuo** —
esattamente il tipo di difetto che questo giro di QA esiste per
trovare. 🔜 Non corretto in questo giro (fuori scope — QA visiva
osserva, non implementa; il piano prevede correzioni in BATCH dopo
l'intera sequenza, §1.6 regola vincolante).

Formato per ogni voce, da qui in avanti:

```
### [Task N.M] <titolo breve> — 2026-08-30 HH:MM
Screenshot: <percorso file in qa-visiva-screenshots/>
Automatico: <eccezioni JS / richieste fallite, o "nessuna">
Manuale: <cosa si vede guardando l'immagine — SEMPRE scritto, anche "nessuna anomalia">
Gravità: blocca / degrada / cosmetico   (solo se trovata un'anomalia)
Categoria: mockup residuo / funzione rotta / onestà / UI / prestazioni
```

## Blocchi operativi (verificati, non presunti)

### ✅ Risolto — 2026-08-30, prima dell'inizio del Task 0

**Nessuno strumento di automazione browser/screenshot nel mio elenco
attrezzi di questa sessione** (verificato con ToolSearch — nessun
CDP/Playwright/Screenshot fra gli strumenti diretti o differiti). Non
è un blocco: il repo ha già `harness-ui/scripts/qa-visual-pipeline.mjs`
(1264 righe, committato il 27-28/8, owner: *"dobbiamo creare questa
pipeline di analisi/debugging automatizzata in modo che tu possa fare
tutte le prove al posto mio"*) — lancia un Chrome DEDICATO con CDP via
WebSocket grezzo (mai il profilo dell'owner, mai la porta 9333
riservata al ponte ADB), con un `Pipeline` di helper
(`click`/`digita`/`clickReale`/`digitaTastieraVera`/`screenshot`/
`attendiCondizione`/`attendiTestoStabile`/`difetto`) e nove scenari già
scritti (`nuova-sessione-compito-libero`, `sessione-lifecycle-completo`,
`terminale-reale`, `fase-a-hooks`, `fase-b-permessi-per-attrezzo`,
`fase-c-subagenti`, `verifica-badge-albero-sessione`,
`riproduci-model-picker-provider`, `fase-d-coda-messaggi`). Ognuno
scrive già `report.json` + `taccuino.md` in `.qa-runs/<timestamp>/` —
questo file (il taccuino del piano) resta il livello SOPRA quei report,
non li sostituisce.

⇒ **Piano d'uso**: nessun nuovo tool necessario. Per i 15 task della
Sezione 3 del piano scrivo NUOVI scenari dentro lo stesso file
(`SCENARI['task-N-...']`), riusando l'infrastruttura esistente — non
un meccanismo a parte. Verificato che Chrome esiste al percorso di
default che lo script si aspetta
(`C:\Program Files\Google\Chrome\Application\chrome.exe`) — pronto.

### ✅ Risolto — server backend non era in ascolto

`curl` sulla 4174 rispondeva HTTP 000 (nessuna risposta). Causa reale
trovata leggendo `config.mjs` (non indovinata): `TALOS_BANCO_DIR` è
una variabile d'ambiente **obbligatoria** (`fail('TALOS_BANCO_DIR
obbligatoria')`, riga 239) — assente nella mia shell, `server.mjs`
falliva con un errore generico e volutamente onesto ("Harness UI non
avviabile: controlla configurazione e file locali", il vero motivo è
scartato dal `.catch(() => ...)` in `server.mjs:146` — un debito reale
di diagnosticabilità, segnalato qui non corretto: fuori scope per
questo giro di QA, il piano non autorizza modifiche al codice).
Impostata (`TALOS_BANCO_DIR=C:/Users/Antonino/Desktop/projects/TALOS-BANCO`)
e rilanciato: **server sano**, `HTTP 200` su `/api/v1/health`,
log reale: `[session-store] 123/123 sessioni ripristinate da
.sessions-store/` — conferma dal vivo, incidentale ma benvenuta, che
la persistenza di FASE L funziona ancora (123 sessioni pre-esistenti
sopravvissute a un riavvio del processo).

### ⚠️ Annotato, non bloccante — quirk d'ambiente

Il mio strumento Bash resetta la working directory alla cartella
primaria di questa sessione (`AVM`) dopo un `cd` verso una cartella
sorella (`AVM-harness-desktop`) — non un errore del comando, un
comportamento della shell di questa sessione. Percorsi assoluti
(Read/Write/Grep/Glob e i comandi `node <percorso assoluto>` lanciati
finora) non ne risentono: **regola operativa per il resto di questo
giro — mai un `cd` verso quella cartella, sempre percorsi assoluti**.

## Stato di esecuzione (aggiornato)

Prerequisiti §3.0: **fatti** — taccuino attivo (questo file), server
avviato e sano, pipeline CDP verificata disponibile, Chrome verificato
al percorso atteso. Cartella scratch dei cinque progetti-base del
corpus (§3.0.1): **non ancora creata** — prossimo passo prima del
Task 1.
