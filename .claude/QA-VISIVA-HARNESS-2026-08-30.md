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
| 5 | `api-validazione-duplicata` | "Nell'API dei contatti la validazione del nome è scritta in due punti diversi — puoi accorparla in uno solo senza cambiare come si comporta?" | Compatta, F5+Resume, export MD/JSON | ✅ fatto — Resume verificato pulito, Compatta non conclusivo (conversazione troppo corta) |
| 5.1 ⭐ | *(nuovo, CREATE)* | "Sto iniziando un piccolo sito da zero — mi serve una paginetta HTML singola con un titolo, due paragrafi di testo segnaposto e un pulsante che quando premuto cambia colore di sfondo. Puoi crearla da zero, con anche un piccolo file di stile separato?" | `scrivi` su file MAI esistiti (Review "N nuovi", non "modificati" — mai esercitato finora), owner: "Nuovo file/Nuova cartella" dal menu albero | ✅ fatto — "2 nuovi" confermato per la prima volta in questo giro |
| 5.2 ⭐ | *(nuovo, DELETE)* | "Nel progetto del magazzino c'è un file di backup che non serve più (magazzino_old.py.bak) — puoi eliminarlo? Se trovi altri file temporanei o ridondanti, elimina anche quelli." | eliminazione via `shell` dal modello (nessun tool "elimina file" esplicito per il modello — verificato non presunto), owner: tasto destro → Elimina con scheda di conferma (azione distruttiva) | ✅ fatto — 1 difetto reale di prodotto trovato (backdrop del foglio resta cliccabile) |
| 6 | `py-carica-ordini-csv` | "Serve una funzione che carica gli ordini da un file CSV e segnali chiaramente, riga per riga, se manca un campo o il prezzo è negativo. Prima cerca online qual è il modo più comune e sicuro in Python per farlo, poi implementalo. Alla fine salvami un breve riassunto di cosa hai fatto." | web_search, Libreria | ✅ fatto — web_search confermato, giri-esauriti riprodotto dal vivo, Libreria resta NON verificata |
| 7 | `html-filtro-articoli` | "Aggiungi un filtro di testo alla lista articoli del preventivo. Mentre ci lavori, segnami una nota con la decisione presa sul nome della funzione, e aggiungimi un promemoria per rivedere i test più tardi." | Notes, Tasks | ✅ fatto — Notes e Tasks entrambi confermati puliti |
| 8 | `game-ostacolo-mobile` | "Aggiungi un nuovo tipo di ostacolo che si muove da solo nel serpentone. Ricordati per le prossime volte che preferisco che gli ostacoli abbiano nomi in italiano nel codice. Poi disegnami un'icona semplice per questo ostacolo." | Memory (+dedup), generate_image | ✅ fatto — 2 difetti reali trovati (card statiche "non implementato") |
| 9 | `api-patch-parziale` | "Nell'API dei contatti manca un modo per aggiornare solo alcuni campi di un contatto senza dover rimandare tutto — puoi aggiungerlo? Usa gli stessi controlli già in uso quando si crea un contatto." | Hook/MCP/Skill/Plugin (preparati PRIMA) | ✅ fatto — tutti e 4 scoperti, flusso di trust verificato end-to-end |
| 10 | `crm-pipeline-fasi` | "Aggiungi allo stato di un contatto una 'fase' (lead, trattativa, cliente) con le transizioni permesse. Se ti torna utile per la prossima volta, costruisciti un piccolo strumento che segna un promemoria ogni volta che sposti un contatto in trattativa." | Tool Forge (crea+abilita+richiama) | ✅ fatto — ciclo completo crea→abilita→richiama verificato (3 corse) |
| 11 | `api-note-orfane` | "Nell'API dei contatti, se provo ad aggiungere una nota a un contatto che non esiste dovrebbe dirmi che non lo trova — invece sembra funzionare comunque, puoi controllare? Nel frattempo avvia anche una ricerca approfondita su cosa si intende di solito per 'cascata di eliminazione' nei database, mi interessa capirlo meglio." | On request+approvazione, coda mid-run, Deep Research | ✅ fatto — 1 difetto reale trovato (descrizione approvazione mancante per research_start) |
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

### [Task 5] api-validazione-duplicata: Compatta, Export, F5+Resume — 2026-08-30 09:54-09:56
Screenshot: `.qa-runs/qa-task-5-api-validazione-2026-08-30T09-54-34-845Z/` (4) + `.qa-runs/qa-task-5-resume-dopo-f5-2026-08-30T09-56-17-757Z/` (4)
La primissima corsa di questo task (mattina, ~09:22) era stata
interrotta prima che il suo risultato mi arrivasse — **ma il turno era
comunque finito per davvero lato server**: questa corsa (ri-lanciata da
zero) trova `src/server.js` GIÀ accorpato correttamente, e il modello
risponde onestamente "Non è stata necessaria alcuna modifica al
codice, poiché la logica di validazione si trova già accorpata in un
solo punto e tutti i test passano regolarmente" — **0 file in Review è
corretto, non un difetto** (stesso comportamento onesto già visto in
Task 4 su riprove ripetute). La vera correzione del bug del corpus è
quindi già stata verificata, solo non fotografata a suo tempo.

**Compatta**: bottone trovato e cliccato, nessun toast, nessun
cambiamento visibile fra prima e dopo (screenshot 02 vs 03
indistinguibili). ⛔ **Non conclusivo, non dichiarato un difetto**: la
conversazione di questo task è troppo corta (7 righe di tool-call + 1
risposta) perché "compattare" abbia qualcosa di sensato da fare — non
posso distinguere "no-op silenzioso corretto su una conversazione
breve" da "il bottone non fa nulla". 🔜 Da riverificare su un task con
una conversazione genuinamente lunga (candidati: Task 11 Deep Research,
Task 12 Planner/Editor).

**Export**: foglio "Esporta sessione" pulito, due card ben descritte
("Trascrizione leggibile" .md / "JSON completo" .json), nessuna
anomalia visiva. 🔜 Non esercitato il click-through reale (il download
effettivo del blob) — verificata solo l'apertura del foglio, non il
salvataggio del file.

**F5 reale + Resume** (`Page.reload` vero, non un refresh finto):
sidebar si ripopola da sola dopo il reload (143 sessioni reali,
persistenza confermata), sessione del task riselezionabile, bottone
Resume trovato e cliccato. Toast chiaro: "Sessione ripresa — Un nuovo
giro è iniziato sulla stessa conversazione." — e **verificato che è
vero, non solo dichiarato**: la riga sessione in sidebar passa a "in
corso · live" (evidenziata), e in chat appare un indicatore di
digitazione reale (`•••`) sotto l'ultima risposta — un giro nuovo è
DAVVERO ripartito sulla stessa conversazione.
⚠️ Osservazione, non confermata come difetto: dopo il reload la barra
del composer mostra "Predefinito d…" come modello e "Workspa…" come
permesso, diversi da quelli originali della sessione (gemini-3.7-flash
/ Full access) — plausibilmente solo lo stato CLIENT-SIDE dei
selettori del composer tornato ai default dopo un reload di pagina
(ininfluente sul giro di Resume, che è ripartito lato server sulla
sessione esistente), non necessariamente cosa ha usato il giro
rigenerato. Non approfondito oltre per budget di tempo — 🔜 se si
vuole certezza, andrebbe letto il modello effettivo dalla risposta del
giro rigenerato, non dedotto dai selettori del composer.

Zero eccezioni JS, zero errori console, unica richiesta fallita il
favicon noto, in entrambe le corse.

### [Task 6] py-carica-ordini-csv: web_search + giri-esauriti dal vivo + Libreria non verificata — 2026-08-30 09:59-10:12
Screenshot: `.qa-runs/qa-task-6-py-csv-.../` (4) + `.qa-runs/qa-diagnostica-task-6-stato-finale-.../` (2) + `.qa-runs/qa-libreria-follow-up-breve-.../` (4)
Il task più costoso in giri di tutta questa sequenza finora — tre fili
distinti, tutti verificati dal vivo, non presunti:

**1. web_search: confermato pulito.** Due righe "Ricerca web: ..." reali
in conversazione ("python csv reader DictReader validate data" e
"python csv validation best practice DictReader"), screenshot
intermedio scattato PRIMA che scrivesse codice (regola pipeline QA:
mai un solo screenshot a fine corsa). Nessuna anomalia.

**2. ⛔⛔⛔ "giri esauriti" RIPRODOTTO DAL VIVO — non un difetto nuovo, la
CONFERMA EMPIRICA di un debito già aperto in memoria** ([[talos-esaurisce-i-giri-non-le-capacita]]):
la prima corsa ha finito i 24 giri (confermato via `/api/v1/sessions`,
poi via `elementFromPoint`/testo conversazione) esplorando molto
(rilette multiple di magazzino.py, DUE ricerche web, `Legge... in
base64`, più `Esegue i test`) senza mai arrivare a scrivere il codice.
Il prodotto lo dichiara **onestamente in chat**, non un fallimento
silenzioso: *"[giri-esauriti] ⛔ giri esauriti: 24 su 24 usati senza
chiudere il task. Non e un fallimento del ragionamento: e un tetto
raggiunto."* — messaggio chiaro, categorizzato, non ambiguo.
⇒ 0 file in Review a quel punto era quindi CORRETTO, non un difetto di
conteggio (la mia nota "difetto" nello script era prematura — scritta
mentre la sessione era ancora "in corso · live", `attendiTestoStabile`
ingannato da una pausa fra un tool-call e l'altro più lunga della sua
finestra di stabilità; nessun cambio di codice, solo lezione per me).

**3. ⭐⭐⭐ Scoperta nuova, reale: un follow-up su una sessione con giri
esauriti RIPRENDE IL TASK VECCHIO invece di rispondere al messaggio
nuovo.** Per isolare la verifica di Libreria (indipendente dal costo
del Task 6) ho mandato un follow-up breve e innocuo — *"Salvami un
breve appunto con un riassunto di una riga di cosa abbiamo fatto
qui."* — su questa stessa sessione. Il modello non ha scritto un
appunto: ha ripreso **il compito CSV originale**, rileggendo i
sorgenti e scrivendo per davvero `carica_e_valida_ordini(...)` in
`src/magazzino.py` + i test in `test/test_magazzino.py` (13 giri
freschi, conclusa correttamente stavolta). Verificato sul disco: la
funzione ESISTE, `python -B tap_runner.py` è **7/7 verde** (compresi i
4 test nuovi: manca prodotto, prezzo negativo, quantità non intera,
successo) — implementazione funzionalmente corretta.
⛔ Nome diverso da quello del corpus (`carica_e_valida_ordini` invece
di `carica_ordini`) — **atteso, non un difetto**: il mio prompt (di
proposito naturale, mai il nome interno del corpus) non vincolava il
nome, stessa dinamica già annotata su Task 1.
⚠️ **Il comportamento "resume prioritaria sul nuovo messaggio" non è
dichiarato da nessuna parte nell'interfaccia**: chi manda un follow-up
innocuo su una sessione fermata per giri-esauriti si aspetterebbe una
risposta al PROPRIO messaggio, non un secondo giro di lavoro sul
compito vecchio da 13 giri. Non necessariamente sbagliato (il modello
potrebbe ragionevolmente voler "finire prima il lavoro in sospeso"),
ma **sorprendente e non spiegato all'utente**. Gravità: nota.
Categoria: onestà/aspettativa, non funzione rotta — 🔜 non corretto in
questo giro (batch-fix a fine sequenza).

**Libreria: resta NON VERIFICATA**, non confermata né rotta. Il
follow-up pensato per isolarla è stato "dirottato" dal punto 3 sopra
prima di arrivare a salvare un appunto — screenshot 04 conferma
`.harness-ui-library/` ancora vuota, ma questo NON è una prova che il
meccanismo non funzioni (non ha mai avuto l'occasione di provarci).
🔜 Da riverificare con un follow-up su una sessione MAI andata in
giri-esauriti (qualunque delle altre già concluse pulite basta).

Zero eccezioni JS, zero errori console in tutte e tre le corse
(a parte il favicon noto).

### [Task 7] html-filtro-articoli: Notes + Tasks — 2026-08-30 10:17
Screenshot: `.qa-runs/qa-task-7-html-filtro-2026-08-30T10-17-00-232Z/` (3)
Corsa pulita, un solo giro di conversazione, 1 file in Review.
**Notes confermato**: `#notesListMount` mostra "Decisione nome funzione
filtro articoli — Per la funzionalità di filtro del carrello, la
funzione è stata denominata \`filt…\`" (testo reale, non un segnaposto).
⭐ **Retroattivo su Task 6**: nella STESSA lista (Notes è GLOBALE, non
per progetto) compare anche "Riepilogo implementazione validazione
ordini CSV — Implementata in src/magazzino.py la funzione
\`carica_e_valida_ordini\` con contro…" — cioè il follow-up del Task 6
("salvami un breve appunto") **un risultato l'ha prodotto per davvero**,
solo non via Libreria/`document_create` come presunto lì: il modello ha
giustamente letto "appunto" come **Notes**, non come un documento da
Libreria. Corregge (non contraddice) la conclusione di Task 6: il
meccanismo "salva un appunto" FUNZIONA, resta solo Libreria
(`document_create`) specificamente non ancora verificata da nessun task.
**Tasks confermato**: `#tasksListMount` mostra "Rivedere i test più
tardi · normal · Controllare e ampliare la suite di test unitari per
coprire tutti i casi limite del filtro articoli e del preventivo. ·
todo" — priorità e stato onesti, testo pertinente.
Codice verificato sul disco: `filtraArticoli(articoli, query)` in
`src/script.js`, nome ESATTO del corpus (diverso da Task 6 — qui il
prompt naturale rendeva il nome quasi obbligato). Traccia l'indice
originale ma come `indiceOriginale` **senza underscore iniziale**
(il corpus si aspetta `_indiceOriginale`) — stessa dinamica già nota
(prompt naturale non vincola il contratto esatto), non un difetto.
⛔ Non verificato con un test dedicato: `npm test` resta a 5/5
pre-esistenti, il modello non ha scritto test per la nuova funzione qui
(diversamente da Task 6, dove 4 test nuovi erano arrivati da soli) —
osservazione di incoerenza fra corse, non un difetto del prodotto.
⚠️ Screenshot 03 scattato senza scrollare il foglio fino a Notes/Tasks
(si vedono Attrezzi/Skills/MCP/Plugin/Libreria, Notes solo al margine
inferiore) — contenuto comunque confermato per testo via `#notesListMount`/
`#tasksListMount` (sopra), non solo dedotto: gap di inquadratura dello
screenshot, non di verifica.
Zero eccezioni JS, zero errori console (a parte il favicon noto).

### [Task 8] game-ostacolo-mobile: Memory + generate_image — 2026-08-30 10:20 — ⛔⛔ 2 DIFETTI REALI (stesso pattern di Task 0.3, in DUE punti nuovi)
Screenshot: `.qa-runs/qa-task-8-game-ostacolo-2026-08-30T10-20-28-657Z/` (4)
**generate_image confermato pulito**: riga "Immagine: A simple game icon
of a moving obstacle for a 2D snake game:…" reale in conversazione,
screenshot intermedio scattato prima della fine. 3 file in Review
(`creaOstacolo`/`muoviOstacolo` in `src/gioco.js` + test, "Test verdi —
7/7" alla fine). **Memory confermato pulito** (via Capability hub,
`#memoryListMount`, stavolta con scroll esplicito prima dello
screenshot — corretta la lezione di Task 7): "Nomi ostacoli in italiano
— Preferisco che gli ostacoli abbiano nomi in italiano nel codice. —
preference", testo reale e pertinente.

⛔⛔⛔ **DIFETTO REALE #1 — card "Memory" del Context Rail STATICA, mai
collegata ai dati veri**: `index.html:279-282`, dentro il tab
"Context" (non il Capability hub — sono DUE superfici Memory diverse
nello stesso prodotto): *"Memory — Non ancora implementato — questo
agente non ha oggi un sistema di memoria di progetto."* — **falso**,
confermato nella STESSA sessione dove questo screenshot è stato preso:
la conversazione mostra una riga `memory_write(...)` reale, e il
Capability hub mostra la preferenza salvata per davvero. Schermata
04's contesto conferma: la card "Capability" appena sopra (stesso
foglio, stesso tab) mostra correttamente "Attrezzi: 7" — è SOLO la
card Memory a essere rimasta ferma alla demo. Gravità: degrada
(mente attivamente). Categoria: mockup residuo.

⛔⛔⛔ **DIFETTO REALE #2 — stesso pattern, tab "Agents" del Context
Rail**: `index.html:305-307`, il terzo tab (Context/Files/**Agents**):
*"Non ancora implementato — TALOS non delega a sotto-agenti oggi, un
solo modello guida l'intero task."* — **falso**, `delega_sottotask`
(FASE C) è reale da tempo. ⭐ Ironia verificabile nello stesso file:
la card "Session topology" **4 righe sopra** (`index.html:283-288`,
stesso tab "Context") dice il contrario, correttamente: *"Le deleghe a
sotto-agenti isolati (attrezzo delega_sottotask) appaiono nel foglio
'Albero sessione'"* — **due punti dello stesso pannello, la stessa
domanda, due risposte opposte**. Stessa gravità/categoria di sopra.

⇒ **Non un incidente isolato**: questo è il TERZO punto trovato in
questo giro di QA con lo stesso identico difetto (Task 0.3: Control
plane; qui: due card del Context Rail) — tre superfici diverse dello
stesso prodotto che dichiarano "non implementato" su capacità reali da
tempo. 🔜 Consiglio per il batch-fix finale: un grep su `"Non ancora
implementato"` in `index.html`/`app.js` per trovare TUTTE le occorrenze
in un colpo solo, non una alla volta.

⛔ Difetto minore, cosmetico: `memory_write` non ha un caso dedicato in
`riassuntoAttrezzo()` (`app.js:3092`) — cade nel `default: return
\`${nome}(…)\`\`, mostrando la riga grezza "memory_write(…)" in
conversazione invece di un riassunto naturale come tutti gli altri
attrezzi (confrontare con `delega_sottotask` → "Delega: ..."). Gravità:
cosmetico. 🔜 Un caso in più nello switch, stesso pattern degli altri.

Zero eccezioni JS, zero errori console (a parte il favicon noto).

### [Task 9] api-patch-parziale: Hook/MCP/Skill/Plugin, tutti e 4 seminati a mano — 2026-08-30 10:27
Screenshot: `.qa-runs/qa-task-9-api-patch-2026-08-30T10-27-36-502Z/` (5)
Preparazione PRIMA della corsa (come richiesto dalla copertura): 4 file
scritti a mano in `api-contatti/` con lo schema letto dai sorgenti veri
(`hook-registry.mjs`/`mcp-registry.mjs`/`skill-registry.mjs`/
`plugin-registry.mjs`, non indovinato) — `.harness-ui-hooks.json`
(hook `qa-log-scrittura`), `.harness-ui-mcp.json` (server
`qa-server-prova`), `.harness-ui-skills/nota-qa/SKILL.md`,
`.harness-ui-plugins/promemoria-qa/plugin.json`.

**Tutti e 4 scoperti correttamente, testo reale non un segnaposto**:
- Skill: "nota-qa · ... · **attivo**" — nessun gate di fiducia, per
  design (le skill non eseguono nulla di per sé).
- MCP: "qa-server-prova · node · tool: strumento_prova · **Fida**" —
  untrusted corretto, allowlist mostrata.
- Plugin: "promemoria-qa · ... · **Fida**" — untrusted corretto.
- Hook (foglio DIVERSO — "control", non "capabilities": verificato
  leggendo dove monta `caricaPannelloHook()`, non presunto uguale agli
  altri tre): "qa-log-scrittura · post_tool_call · **Fida**".

⭐⭐⭐ **Flusso di trust provato end-to-end, non solo osservato staticamente**:
click reale sul bottone "Fida" dell'hook → screenshot DOPO mostra
"qa-log-scrittura · post_tool_call · **attivo**" (badge verde,
bottone "Fida" sparito) — il meccanismo hash-vincolato
(hook-registry.mjs) funziona per davvero, non solo a leggere il
codice. Non ripetuto per MCP/Plugin (stesso identico pattern di
codice, dichiarato per design uniforme nei commenti sorgente — ripeterlo
3 volte sarebbe stato ridondante, non un buco di copertura).

2 file in Review (PATCH endpoint + presumibilmente i suoi test).
Stessa schermata riconferma dal vivo il difetto già noto di Task 0.3
("Agents"/"Approval policy per-tool" ancora sotto "NON ANCORA
IMPLEMENTATO" nello stesso foglio Control plane) — non ri-registrato
come nuovo, solo consistente con quanto già trovato.
Zero eccezioni JS, zero errori console (a parte il favicon noto).

### [Task 10] crm-pipeline-fasi: Tool Forge crea→abilita→richiama — 2026-08-30 10:31-10:35 (3 corse)
Screenshot: `.qa-runs/qa-task-10-crm-forge-.../` (4) + `.qa-runs/qa-task-10b-forge-diretto-.../` (5) + `.qa-runs/qa-task-10c-forge-invoca-.../` (1)
Task base (`impostaFase`, transizioni lead→trattativa→cliente, un
passo alla volta) risolto pulito al primo giro, 2 file in Review.

**Primo tentativo Tool Forge: onestamente rifiutato dal modello, colpa
mia non del prodotto.** Il mio prompt diceva *"SE ti torna utile"* —
condizionale — e il modello ha risposto: *"non è stato costruito alcun
strumento dedicato ai promemoria (il task precedente richiedeva solo
la logica di transizione delle fasi)"*. Lezione ripetuta (stessa
dinamica di Task 1): un prompt naturale ma CONDIZIONALE lascia la
porta aperta a un "no" legittimo — non un difetto, la mia
formulazione dava esplicitamente quella scelta al modello.

**Retry con ask diretto (non condizionale) — tutte e tre le fasi
verificate, in tre corse separate sulla stessa sessione:**
1. **Crea**: `tool_create` → *"Created 'Promemoria contatto in
   trattativa' — it stays off until the user enables it in Tool
   Forge."* ID `promemoria-trattativa` (esposto `forge_promemoria-trattativa`).
2. **Abilita** (owner-facing, l'UNICA mutazione bidirezionale di
   tutta la FASE N — verificato leggendo il codice prima di scriverlo
   nello scenario): Capability hub mostra "· tasks.create ·
   disabilitato · Abilita" → click reale → "· abilitato · Disabilita"
   — chip e bottone invertiti correttamente insieme.
3. **Richiama**: primo tentativo onestamente bloccato — *"non esiste
   alcun contatto reale... il codice contiene unicamente funzioni pure
   di gestione, senza dati persistiti"* (limite del progetto scratch —
   `crm-contatti` è logica pura, zero dati — non del prodotto). Chiesto
   esplicitamente un contatto d'esempio ("Mario Rossi") → lo strumento
   forgiato ha chiamato per davvero `tasks_create(…)`, creando un task
   REALE (id `fc820c78-8d70-498a-88ea-08b4eb0ae0ec`, titolo "Segui
   contatto in trattativa: Mario Rossi") — il ciclo crea→abilita→richiama
   è quindi CONFERMATO end-to-end, non solo osservato a metà.

⭐ Dettaglio incidentale interessante: lo strumento forgiato non è un
tool "a sé" ma un WRAPPER su una capacità di sistema già esistente
(`tasks.create`, la stessa di Task 7) — coerente con l'etichetta
mostrata nel pannello ("· tasks.create").

Zero eccezioni JS, zero errori console in tutte e tre le corse (a
parte il favicon noto).

### [Task 11] api-note-orfane: "On request", Deep Research, Libreria (finalmente) — 2026-08-30 10:39-10:45 (3 corse) — ⛔ DIFETTO REALE + salvataggio da un vicolo cieco istruttivo
Screenshot: `.qa-runs/qa-task-11-api-onrequest-.../` (5) + `.qa-runs/qa-task-11b-soccorso-approvazione-.../` (×2 corse, 3+3 shot)
Permesso **"On request"** — mai provato prima in questo giro (solo Full
access/Workspace write finora). ⛔ Trovato SUBITO un errore mio: il
foglio nuova sessione con "On request" NON usa il percorso libero
(quello è solo per "Full access") ma il DROPDOWN allowlist — corretto
al volo, non un difetto di prodotto.

⛔⛔⛔ **DIFETTO REALE CONFERMATO, con la prova dall'evento grezzo**:
`descriviAzioneApprovazione()` (app.js:3211) non ha un caso per
`research_start` — verificato leggendo l'evento vero nel jsonl
persistito: `"azione":{"tipo":"research_start"}`. La card di
approvazione mostrava quindi il fallback generico *"Vuole eseguire
un'azione che modifica qualcosa."* invece di dire che intende avviare
una ricerca approfondita specifica — esattamente il caso che il
commento della funzione dice di voler evitare ("mai un'azione
sconosciuta generico quando il campo giusto è già lì"). Gravità:
degrada (l'owner approva alla cieca cosa sta per succedere). Categoria:
funzione incompleta. 🔜 Cura ovvia: un caso in più nello switch.

⛔⛔⛔ **La sessione è rimasta VERAMENTE bloccata per ~5 minuti — causa
ISOLATA e CONFERMATA nel MIO script, non nel prodotto**: quando due
card di approvazione esistono in sequenza nella stessa conversazione
(`research_start` poi `prova`/npm test), il mio primo script usava
`document.querySelector('.real-approval-card')` — che prende SEMPRE la
PRIMA card del DOM. Ho continuato a cliccare "Approva" sulla prima
card (già risolta, testo "Approvato (da un altro client)" — bottoni
ancora presenti nel DOM ma non nello screenshot, solo nascosti via
CSS), mentre la SECONDA card, vera e in sospeso ("Vuole eseguire la
suite di test: npm test", bottoni funzionanti e visibili), restava
ignorata — `/api/v1/sessions` confermava `conclusa:false, giri:2`
fermo per minuti. **Non un bug del prodotto**: il meccanismo di
attesa REALE del kernel (Promise aperta, "mai un timeout che nega
travestito da decisione") ha fatto ESATTAMENTE quello che doveva —
aspettare onestamente una decisione che il mio script non stava dando
alla card giusta. Corretto lo script (cicla su TUTTE le card,
agisce solo su quelle il cui testo non contiene già "approvat"/"negat")
→ sbloccata al primo tentativo, sessione conclusa (`giri:7`).

**Il task base non è risolvibile su questo scratch**, onestamente
dichiarato dal modello: *"Nel progetto attuale non esiste alcuna
funzionalità o endpoint per la gestione delle note sui contatti"* —
confermato vero leggendo `TALOS-BANCO/progetti/api-contatti/src/server.js`
originale (zero occorrenze di "note"). Gap della MIA curatela del
corpus per questo task (probabilmente presuppone uno stato cumulativo
di una campagna vera, non una cartella scratch isolata), non un
difetto di prodotto — il modello ha correttamente cercato, non trovato,
e detto la verità invece di inventare un fix per un endpoint
inesistente.

**Deep Research + Libreria: entrambi confermati puliti, verificati via
API diretta** (non solo la UI): `GET .../research` → `{"stato":"done"}`;
`GET .../library` → una voce reale *"Research - Cosa si intende per
cascata di eliminazione..."md"*. ⭐ Chiude finalmente il buco Libreria
dichiarato aperto da Task 6 (quel follow-up era stato dirottato prima
di arrivare a salvare qualcosa) — confermato: un report Deep Research
finisce DAVVERO anche in Libreria, come dichiarato nell'etichetta del
pannello.

**Coda mid-run — chiusa subito dopo con un check dedicato**
(`.qa-runs/qa-coda-mid-run-2026-08-30T10-47-53-725Z/`, 3 screenshot):
secondo messaggio mandato SUBITO dopo il primo, senza aspettare la
fine del giro — confermato `.queued-message` visibile all'istante, E
(ispezione visiva) il composer mostra "**Follow-up in coda** · Nel
frattempo: qual è la differenza fra list e tuple in Pyth... [Annulla]"
+ un toast preciso: *"Messaggio in coda — Arriverà quando l'agente
conclude il turno corrente (posizione 1)."* — trasparente, onesto,
nessuna ambiguità. Alla fine: la domanda accodata (list vs tuple) **ha
ricevuto risposta per davvero** nella stessa conversazione. Zero
eccezioni JS, zero errori console.

Zero eccezioni JS, zero errori console in tutte le corse (a parte il
favicon noto).

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
