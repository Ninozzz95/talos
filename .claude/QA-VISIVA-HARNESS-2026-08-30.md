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

## ⛔⛔⛔ Correzione owner, durante l'esecuzione — copertura CRUD mancante

Owner, testuale: *"una cosa importante il test visivo DEVE prevedere
tutti i tipi di operazioni (CRUD) su ogni tipo di workflow ad esempio
la creazione di un progetto HTML il cancellamento di file ridondanti
etc"*. Verificato guardando indietro: i task 0-5 sono **tutti Update**
(modifica di codice già esistente in progetti pre-costruiti) — zero
Create da zero, zero Delete. Aggiunti Task 5.1 (Create) e 5.2 (Delete)
sotto, prima di proseguire con Task 6.

## Stato di esecuzione

| # | ID reale | Prompt naturale (verbatim) | Copertura | Stato |
|---|---|---|---|---|
| 0 | — | *(ricognizione, nessun prompt)* | stato vuoto, pannello attrezzi, Control-plane | ✅ fatto — 1 difetto reale trovato (label stale Agents/Approval policy) |
| 1 | `py-sconto-a-scaglioni` | "Nel progetto del magazzino serve una funzione che calcoli uno sconto a scaglioni in base a delle soglie di importo — puoi aggiungerla?" | elenca/leggi/scrivi/prova, cancello semantico, streaming, Review, auto-rename | ✅ fatto (+ seguito) |
| 2 | `html-conta-articoli` | "Nel calcolatore di preventivi serve una funzione che conta quanti articoli ci sono nel carrello — dacci un'occhiata?" + dopo: comando umano nel Terminale reale | ciclo base + PTY reale digitata a mano | ✅ fatto — 2 piste false, 1 fix reale al MIO tooling (non al prodotto) |
| 3 | `game-wraparound-negativo` | "Nel gioco del serpentone, quando esce dal bordo sinistro o da quello superiore della griglia il rientro dall'altro lato non funziona bene — sembra un problema col resto sui numeri negativi. Puoi sistemarlo in tutte e quattro le direzioni?" | cerca, Doctor mentre gira, (albero file: selettore sbagliato nello script, non riverificato qui) | ✅ fatto — bug reale trovato E corretto correttamente dal modello |
| 4 | `crm-nome-senza-cognome` | "Nel CRM, quando un contatto non ha il cognome il nome formattato ha uno spazio in più alla fine che non dovrebbe esserci — puoi sistemarlo?" | Workspace write (dropdown allowlist), fork | ✅ fatto — 1 difetto reale del MIO piano (non del prodotto): fork su sessione ancora in corso è correttamente rifiutato |
| 5 | `api-validazione-duplicata` | "Nell'API dei contatti la validazione del nome è scritta in due punti diversi — puoi accorparla in uno solo senza cambiare come si comporta?" | Compatta, F5+Resume, export MD/JSON | 🔄 in corso (interrotto per il punto CRUD sotto) |
| 5.1 ⭐ | *(nuovo, CREATE)* | "Sto iniziando un piccolo sito da zero — mi serve una paginetta HTML singola con un titolo, due paragrafi di testo segnaposto e un pulsante che quando premuto cambia colore di sfondo. Puoi crearla da zero, con anche un piccolo file di stile separato?" | `scrivi` su file MAI esistiti (Review "N nuovi", non "modificati" — mai esercitato finora), owner: "Nuovo file/Nuova cartella" dal menu albero | ✅ fatto — "2 nuovi" confermato per la prima volta in questo giro |
| 5.2 ⭐ | *(nuovo, DELETE)* | "Nel progetto del magazzino c'è un file di backup che non serve più (magazzino_old.py.bak) — puoi eliminarlo? Se trovi altri file temporanei o ridondanti, elimina anche quelli." | eliminazione via `shell` dal modello (nessun tool "elimina file" esplicito per il modello — verificato non presunto), owner: tasto destro → Elimina con scheda di conferma (azione distruttiva) | ✅ fatto — 1 difetto reale di prodotto trovato (backdrop del foglio resta cliccabile) |
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

### [Task 1] py-sconto-a-scaglioni + seguito — 2026-08-30 09:01-09:02
Screenshot: `qa-runs/qa-task-1-py-sconto-.../` (8) + `qa-runs/qa-task-1-seguito-.../` (4)
Automatico: zero eccezioni JS, zero richieste fallite (a parte il
favicon 404 noto) in entrambe le corse.
Manuale — tutto atteso, nessuna anomalia:
- Model picker: cercato "gemini-3.7-flash", trovato
  `google/gemini-3.7-flash · 1049k ctx · $0.75/M in` — prezzo combacia
  col catalogo verificato in altre fasi di questa sessione.
- Il modello ha esplorato da solo (elenca, letto src/magazzino.py +
  test/test_magazzino.py + tap_runner.py, eseguito i test) PRIMA di
  scrivere — comportamento agentico corretto.
- **Non un difetto**: il primo giro ha fatto una domanda di
  chiarimento invece di scrivere subito — le soglie/percentuali dello
  sconto sono un PARAMETRO della funzione (non valori da indovinare),
  e il mio prompt di test non li specificava. Buon comportamento del
  modello (non ha fabbricato valori a caso), cattiva specifica MIA —
  annotato come lezione per i prompt dei task restanti: quando la
  consegna reale del corpus prevede un contratto dati preciso, il
  prompt naturale deve comunicarlo (in prosa, mai nel gergo dello
  schema) o aspettarsi una domanda.
- Titolo sessione auto-rinominato correttamente dal primo messaggio.
- Seguito (resume su sessione conclusa): risposta in linguaggio
  naturale su soglie/percentuali → il modello ha scritto
  `calcola_sconto_scaglioni(importo_centesimi, soglie)` per davvero.
  Review Center: "1 file modificato", diff verde reale, 45 righe,
  numeri di riga, "Approva tutto" — tutto corretto. "Test"/"Rischio"
  mostrano onestamente "—" (debito GIÀ dichiarato in FASE 1.3-BIS del
  piano precedente, non nuovo).
Nessun nuovo difetto oltre a quello già annotato in Task 0.

### [Task 2] html-conta-articoli + Terminale reale — 2026-08-30 09:04-09:13
Screenshot: `qa-runs/qa-task-2-*` (più corse — vedi sotto)
Il task base (compito scritto, Review "2 file modificati") è filato
liscio — nessuna anomalia. La verifica nel **Terminale reale** ha
richiesto un'indagine vera, con DUE piste che sembravano bug seri e si
sono rivelate ENTRAMBE difetti del mio script di prova, non del
prodotto — documentato per intero perché è la lezione più importante
di questo giro finora:

1. **Pista 1 — "il terminale apre nella cartella sbagliata"**: aprendo
   il Terminale SUBITO dopo `avviaSessionePendente` (senza mai mandare
   il primo messaggio), il prompt mostrava `.../AVM (lane/voce-personale)`
   invece della cartella del progetto. Causa reale: `avviaSessionePendente`
   è SOLO stato locale (`state.pendingCustomSession`) — la sessione VERA
   nasce lato server solo al primo invio (`startCustomSession`). Senza
   una sessione vera, `risolviCartella` (server.mjs) cade sul suo ultimo
   ripiego, `process.cwd()` del PROCESSO SERVER — che nella mia shell è
   `AVM` per via di come l'ho avviato oggi (percorso assoluto ma cwd di
   lancio ereditato). ⇒ **Non un difetto del prodotto**: verificato
   mandando per davvero il primo messaggio e aspettando `RunStarted`
   PRIMA di aprire il Terminale — il prompt è apparso ESATTAMENTE sulla
   cartella giusta. Pista chiusa, retrattata.
2. **Pista 2 — "Invio non esegue mai il comando digitato"**: anche con
   una sessione vera, `echo ciao-vero` restava scritto ma MAI eseguito
   (nessun output, nessun nuovo prompt) — provato 3 volte, sempre lo
   stesso esito, fino a un buffer con TRE comandi di corse diverse
   concatenati sulla stessa riga senza mai un invio. Causa reale, **nel
   MIO script di test**: `premiTasto('Enter')` in `qa-visual-pipeline.mjs`
   mandava `Input.dispatchKeyEvent` senza `windowsVirtualKeyCode` — il
   KeyboardEvent sintetico risultante ha `keyCode:0`, e il gestore
   reale del terminale non lo riconosce come Invio. **Corretto**
   (committato, beneficia ogni scenario futuro che usa questo helper):
   aggiunta una tabella minima tasto→keyCode (Enter:13, Tab:9, Escape:27,
   Backspace:8). Riprovato: Invio funziona, output vero, nuovo prompt.
3. **Chiusura pulita**: riaperta la sessione VERA di Task 2 (quella col
   codice scritto dal modello), lanciato `npm test` a mano nel terminale
   reale — **5 pass, 0 fail**, confermato che il codice del modello è
   davvero corretto, non solo dichiarato tale dalla Review.

⭐⭐⭐ Lezione per i task restanti: **sempre mandare il primo messaggio
prima di aprire il Terminale** in ogni scenario di questa sequenza (la
sessione deve esistere per davvero); il fix a `premiTasto` è permanente,
non serve ripeterlo.

### [Task 3] game-wraparound-negativo — 2026-08-30 09:14
Screenshot: `qa-runs/qa-task-3-game-wraparound-.../` (5)
Automatico: zero eccezioni, zero richieste fallite (a parte favicon).
Manuale: **bug reale del corpus trovato E corretto correttamente**
dal modello — ha letto il codice, capito che `%` in JS tronca invece
di comportarsi come il resto matematico, applicato la formula canonica
`((valore % dim) + dim) % dim`, spiegato la correzione in linguaggio
chiaro, test 3/3 verdi. Riassunto naturale in chat, nessun gergo.
Doctor lanciato MENTRE il modello lavorava in background: "Healthy —
Chiave API ok · shell wsl2 · git ok · browser ok", nessuna interferenza
con la sessione in corso — verificato che i due si possono usare
insieme.
⛔ Non verificato in questo giro: tasto destro sull'albero file — il
mio selettore per il tab "Files" dell'inspector era sbagliato (nessun
`[data-inspector-tab]` nel DOM reale), lo script non ha aperto
l'albero. Non un difetto di prodotto presunto — questa specifica
interazione è già stata verificata dal vivo più volte nella storia di
questo progetto (drag&drop, rinomina, rivela, elimina — commit
`46940ae4` e altri), quindi non riprovata qui per economia di tempo;
resta un buco di COPERTURA di questo giro specifico, dichiarato.

### [Task 4] crm-nome-senza-cognome + fork — 2026-08-30 09:17-09:19
Screenshot: `qa-runs/qa-task-4-crm-nome-.../` (più corse)
Server riavviato con `TALOS_HARNESS_UI_PROJECT_DIRS` sui 5 progetti
scratch — **verificato il ramo allowlist/dropdown per la prima volta
in questo giro**: dropdown popolato coi nomi reali, selezione
funzionante, sessione avviata sulla cartella giusta (`crm-contatti`).
Prima corsa: il modello ha trovato e corretto il bug reale (spazio in
eccesso quando manca il cognome), test verdi.
⛔ **Il mio piano aveva un'assunzione sbagliata, trovata dal vivo**: ho
provato a forkare la sessione MENTRE il modello lavorava ancora
("a metà lavoro", come scritto nella Sezione 3 del piano). Il server
rifiuta onestamente: `409, "Fork non riuscito — Sessione non pronta
per questa azione"` (`SESSION_NOT_READY`) — **comportamento corretto e
sensato del prodotto**, non un difetto: forkare un turno a metà
sarebbe ambiguo (da quale punto esatto?). Il piano presumeva che il
fork mid-turn dovesse riuscire senza averlo mai verificato — corretto
qui: **il fork si prova su una sessione CONCLUSA**, non durante.
Riprove successive (stesso prompt, stessa cartella già corretta dalla
prima corsa): il modello ha correttamente detto "il problema non c'è
già più, i test passano, nessuna modifica necessaria" — **buon segno**,
nessuna fabbricazione di un fix inutile solo per sembrare utile.
Nessun nuovo difetto di prodotto in questo task.

### [Task 5.1] Create da zero — 2026-08-30 09:24-09:25 — prima verifica reale di CRUD-Create
Screenshot: `.qa-runs/qa-task-5-1-create-da-zero-2026-08-30T09-24-41-496Z/` (3)
Aggiunto in risposta diretta alla correzione dell'owner sulla copertura
CRUD (vedi sezione dedicata sopra): cartella scratch nuova di zecca
(`sito-nuovo-da-zero/`, mai usata prima da nessun task di questo giro),
permesso Full access, prompt naturale che chiede una paginetta HTML +
CSS separato senza mai nominare i due file per nome.
Automatico: zero eccezioni JS, zero difetti, zero richieste fallite (a
parte il favicon 404 noto). `report.json`: "file in Review: 2",
assaggio conteggio `"2nuov"` (cioè "2 nuovi"), `index.html esiste
davvero sul disco: true` — verificato sul filesystem, non solo
dichiarato dalla UI.
Manuale (screenshot 03 ispezionato): header Review Center "2 file
modificati", stat card **"2 nuovi · 0 modificati · — test · — rischio"**
— la prima volta in tutto questo giro che il contatore "nuovi" è >0.
Le due tab file portano il badge **"nuovo"** (non "modificato"):
`index.html nuovo · 28 righe`, `style.css nuovo · 59 righe`. Contenuto
del diff per `style.css` reale e sensato (reset, `body` centrato in
flex, card `.container`, regole `h1`/`p`/`button` con transizione) —
non uno scheletro vuoto. Nessuna anomalia trovata.
⇒ **CRUD-Create verificato pulito**: il percorso "scrivi su file mai
esistiti" funziona end-to-end, badge/contatori distinguono
correttamente nuovo da modificato. Nessun nuovo difetto di prodotto.

### [Task 5.2] Delete ridondanti + CRUD owner-facing completo — 2026-08-30 09:34-09:51 — ⛔ DIFETTO REALE DI PRODOTTO TROVATO
Screenshot: `.qa-runs/qa-task-5-2-delete-ridondanti-2026-08-30T09-51-35-129Z/` (7, corsa finale pulita — 7 corse totali, le prime 6 usate per diagnosticare due bug di tooling e uno di prodotto, vedi sotto)
Tre percorsi CRUD distinti verificati nello stesso scenario:

**1. Delete via modello (shell)**: prompt naturale su `magazzino_old.py.bak`
+ "altri file ridondanti" (senza nominare `note-temporanee.txt`, seminato
apposta per vedere se il modello lo trova da solo). Il modello ha
esplorato, trovato ENTRAMBI, eliminati con `shell`. Verificato sul
disco (non solo in chat): entrambi spariti. Riprova su cartella già
pulita: il modello dichiara onestamente "non c'è nulla da eliminare",
nessuna fabbricazione — stesso buon comportamento già visto in Task 4.

**2. Create owner-facing** (chiude il buco dichiarato in Task 5.1): tasto
destro sulla RADICE dell'albero → menu ridotto a "Nuovo file"/"Nuova
cartella" (screenshot 04, coerente col codice — `soloCreazione`) → sheet
"Nuovo file" (screenshot 05, pulito) → Crea → toast "File creato" →
verificato **sul disco**, non solo il toast.

**3. Delete owner-facing** (chiude il buco dichiarato in questo stesso
task): tasto destro sul file appena creato → menu con tutte e 6 le voci
attese (`Apri, Allega alla chat, Rinomina, Copia, Rivela in Esplora
File, Elimina` — screenshot 06, ispezionato) → **scheda di conferma
FOTOGRAFATA prima di confermare** (screenshot 07, ispezionata): "Elimina
file — Eliminare **zzz-qa-throwaway-crud.txt**? L'azione scrive DAVVERO
sul disco e non si annulla da qui.", pulsante Elimina in rosso
(danger) — linguaggio chiaro, nessuna ambiguità → confermato → sparito
**sul disco**, verificato.

⛔⛔⛔ **Difetto reale di prodotto, non di tooling** — trovato investigando
perché il tasto destro sul file nuovo non apriva nessun menu (le prime
5 corse fallivano lì): `document.elementFromPoint()` sulla riga, SUBITO
dopo aver chiuso il foglio "Nuovo file" col bottone Crea, restituiva
`<button class="harness-dialog-backdrop motion-enter motion-exit">` —
il BACKDROP del foglio appena chiuso, ancora sopra tutto e ancora
cliccabile, non la riga sottostante. Causa nel codice
(`syncEmbeddedDialogBackdrop`/`closeEmbeddedDialog`, app.js): l'uscita
del backdrop parte solo DOPO che l'animazione di uscita del DIALOG è
finita — due animazioni in serie, non in parallelo — e `hidden` torna
`true` solo al termine della seconda. Finestra reale (non solo di
questo script, per quanto stretta) in cui un click sull'albero appena
sotto un foglio da poco chiuso atterra sul backdrop invece che sul
bersaglio. Gravità: degrada (misclick silenzioso, nessun errore
visibile all'utente — il click semplicemente non fa nulla). Categoria:
funzione rotta (race di animazione). 🔜 Non corretto in questo giro
(batch-fix a fine sequenza, §1.6 del piano).

⛔ **Due bug di TOOLING (miei, non di prodotto) trovati e corretti nello
stesso giro**, entrambi permanenti per gli scenari futuri:
- `[data-open-panel="inspector"]` è un **toggle** su desktop (>1040px,
  `toggleDesktopInspector()`), non un "apri": il pannello è espanso di
  DEFAULT, quindi cliccarlo alla cieca lo COLLASSA. Corretto: si legge
  `#app.classList.contains('inspector-collapsed')` prima, si clicca
  SOLO se serve. ⇒ **Retroattivo**: questo spiega perché in Task 3
  "click sul tab Files: false" non mostrò mai un albero — il pannello è
  stato collassato dal MIO stesso click, non un difetto di selettore
  soltanto (voce originale non riscritta, integrata qui).
- `elemento?.click() ?? false` è un anti-pattern che stampa **sempre**
  `false` (`Element.click()` non ha valore di ritorno) — sia quando il
  click riesce sia quando l'elemento non esiste. Ogni verifica di click
  ora usa una IIFE che restituisce `true`/`false` per davvero.

Nessuna eccezione JS, nessun errore console, unica richiesta fallita il
favicon 404 noto.

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
