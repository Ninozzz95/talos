# Ledger Astra — fase 2, 05/09/2026

## B3 — consuntivo per la review, 05/09/2026

Stato: implementata e pronta alla revisione del componente. Il cancello generale verify resta ROSSO per il contratto CSS preesistente; non si dichiara chiusa tutta la fase 2.

Mostra 73 sessioni reali: 6 filtri di stato, 4 ordinamenti, filtro delle cartelle lette dagli export, metriche reali, apertura con click/Invio e menu contestuale originale con Shift+F10/tasto destro. Il primo record confrontato conserva 9 giri, 92,1k token totali e 74,2k in cache, aggiunge la percentuale 83%; tempo al primo token non registrato → trattino, con motivo. Costo nascosto secondo fase 3. Nessun endpoint o chiave localStorage aggiunto. I filtri sono stato di questa vista, non preferenze persistenti.

Blocchi riusati: Page, Toolbar, DataTable, FilterChips, Select, Badge, Button. Blocco nuovo: nessuno. Tre regole CSS scoped (titolo riga, modello lungo, altezza tabella), zero token, zero icone. Fixture di sei sessioni nella forma dell'API, valori controllati del mockup; prova separata sulle 73 sessioni dello store copiato. Tutto il prodotto modificato resta nelle funzioni Board e nel componente; Chat/Sidebar/Review/ponte/frammenti/public invariati.

| Dimensione | Originale osservato | Board proposta e prova | Verdetto |
|---|---|---|---|
| Dati | 73 righe, nome/modello/consumo/stato | 73 stessi titoli e identificativi; primi tre consumi e metriche controllati contro API | Copertura conservata |
| Ricerca operativa | Elenco e Aggiorna | Filtri, ordinamenti reali, cartella da RunStarted; Errore trova 8 sessioni su 73 | Beneficio verificato |
| Cache e chiusura | Token cache nella riga | Token cache ancora visibili + percentuale e motivo di chiusura | Beneficio verificato |
| Apertura e azioni | Menu sessione condiviso | Stesso menu; click e Invio aprono la chat, ricarico conserva la sessione | Verificato |
| Tastiera | Riga raggiungibile e menu mouse | Pulsante nativo, filtri roving Home/frecce, Shift+F10, Escape restituisce focus | Verificato in Chrome; screen reader reale non provato |
| Responsive | Elenco scorrevole | Tabella nel proprio scroller, intestazioni ferme; wheel orizzontale mostra tutte le colonne a 1440/1280/1024 | Verificato; sotto 1024 non accettato in B3 |
| Errori e recupero | Messaggio di errore dell'elenco | Stato visibile in alto, assenze esplicite, Aggiorna recupera lista e metriche | Verificato con fault injection separata |
| Confine mobile senza API | Nessun dato mobile collegato | Anche Aggiorna e Cartella rispettano embeddedDemoOnly, nessuna lettura | Regressione nuova riprodotta e corretta |
| Prestazioni | Una lettura di lista | Lista prima delle metriche, massimo 4 letture per batch; export solo al primo uso di Cartella | Funzionale sullo store; scala maggiore non misurata |

Cancellli eseguiti:
- node --test tests/unit/board.test.mjs: **6/6**.
- componenti: suite intera **27/27**, poi **3/3 Board** dopo l'ultimo batch scoped (gli altri componenti non modificati).
- npm run test:lab finale: **195/195**, 1,7 minuti.
- npx playwright test --config=playwright.astra.config.mjs: **12/12**, 25,9 secondi, su 4177 e 4179; lista/metriche/cartelle/apertura reali, errori sintetici solo nel test dichiarato di recupero.
- npm run build e node scripts/verify-build.mjs: **30 asset**, build deterministica.
- npm run verify: **323/324** unità/contratti; fallisce PHASE3-TOKEN-CONTRACT-01 (design-token-contract.test.mjs:45), perché index.css contiene colori grezzi. Verificata la stessa condizione nel file della base 81cc5cc5: 77 occorrenze, prima #1e1f22. Nessun colore grezzo introdotto dal B3; test non aggirato. Le tappe successive del comando sono state eseguite separatamente e riportate sopra.

Tutte le **21 PNG** nel manifest B3 sono state APERTE e confrontate: coppie mockup/componente scuro e coppie originale/app reali con tema chiaro risolto dal browser, 1440/1280/1024. L'originale chiaro mostra testo della chat sotto la Board in queste acquisizioni; dato osservato, nessun intervento su public. Non si attribuisce una causa non investigata. Dati reali confrontati con la stessa copia dello store; la forma è verificata separatamente dal laboratorio sul mockup.

Richieste a Claude / fase 3: allineare il contratto token al CSS generato dal mockup senza modificare il disegno; una rotta leggera di riepilogo con cartella eviterebbe di leggere gli export per il filtro; il costo rimane K-H, nascosto fino a dato e rotta reali. Nessuna richiesta di modifica al ponte.

Non verificato: screen reader fisico, più di 73 sessioni, viewport sotto 1024, login OAuth, conversazione con un modello. TALOS_OWNER_RUNTIME_MODULE non è impostata; questi sono test della UI, non accettazione della capacità agentica. Il metodo dei test in chat resta quello concordato: lingua naturale, più turni, refusi e ricarico attraverso composer/backend reali.

Cosa deve fare l'owner: aprire http://127.0.0.1:4177 e scegliere Board; rivedere questa consegna. Non serve predisporre nulla.
Cosa fai tu dopo: B5, partendo da Memoria, nello stesso metodo e con commit separato.
Cosa rimane: B5 → B4 → B6 → B2 → B7 → B1 → B8; chiusura del contratto CSS da coordinare; OAuth e piano computer-use dopo il mockup.

---

## B3 — Board reale · piano esecutivo, 05/09/2026

Stato: aperto. Base unita e7087b2c; lane/harness-desktop 81cc5cc5. La parte A è consegnata nel ledger dedicato: le vecchie decisioni di conservare intro/palette originali riportate nello storico qui sotto sono SUPERATE dall'ordine dell'owner e dai commit della parte A.

Ricerca prima dell'edit: 05/09/2026, https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-sort (modificata 07/06/2025) e https://www.w3.org/WAI/ARIA/apg/patterns/table/ (data editoriale non dichiarata). Documenti stabili riletti oggi, non novità degli ultimi 30 giorni. Adattare: table nativa, una sola intestazione aria-sort coerente con l'ordine vero; controllo Select nativo; collegamento di apertura raggiungibile da tastiera. Nessun nuovo dossier/audit competitor, come da reindirizzamento owner. APG esempio sortable rispondeva 429; non citato come letto.

Misure prima dell'edit: 4179 /api/v1/sessions → 73 items. Primo id 5b30b23d-008f-479f-a078-7b4aea6fbe37: usage.giri 9, prompt_tokens 89470, completion_tokens 2635; /metrics cache 83%, primoToken.ms null con motivoAssente, giri 1 (non è il contatore usage.giri). /sessions/:id non esiste. Cartella assente dalla lista e dalle metriche, presente negli eventi RunStarted.contesto.cartella di /export. Costo assente (richiesta fase 3 K-H). Il vecchio #sessionsBoardList è nello strato legacy nascosto: si conserva il contratto, si monta il componente esplicitamente nel #schermoBoard esistente dalla funzione posseduta, senza toccare il ponte. Nessun nuovo endpoint né chiave persistita.

Decisioni: riusare DataTable, FilterChips, Select, Badge, Button, Page. Variante NEL mockup: Ordina e Aggiorna; Costo nascosto data-richiede=fase3; Ultima diventa Avviata (solo questo timestamp è noto); titolo della sessione pulsante con testo completo accessibile e troncamento visivo, modello completo in title. Tabella scorrevole orizzontalmente, nessuna pagina allargata. Metriche caricate con concorrenza massima 4 dopo la lista; le cartelle si caricano solo su richiesta del filtro, da export esistente, conservando solo il percorso e scartando la trascrizione. Errori visibili e riprova; niente valori simulati. Target +1 rispetto all'originale: 6 filtri di stato, 4 ordini, filtro cartella reale, cache/chiusura disponibili, apertura diretta e stesso menu contestuale. Nessuna superiorità dichiarata prima delle prove.

File previsti (nessuna cancellazione):
- .claude/MOCKUP-REDESIGN-TALOS-2026-09-04.html
- .claude/LEDGER-ASTRA-FASE-2-2026-09-05.md
- .claude/CONSEGNA-ASTRA-FASE-2-2026-09-05.md
- harness-ui/frontend/src/components/board.js
- harness-ui/frontend/lab/fixtures/board.js
- harness-ui/frontend/lab/main.js
- harness-ui/frontend/tests/unit/board.test.mjs
- harness-ui/frontend/tests/parity/componenti.spec.mjs
- harness-ui/frontend/tests/parity/board-vivo.spec.mjs
- harness-ui/frontend/playwright.astra.config.mjs
- harness-ui/frontend/src/legacy/app.js (solo creaRigaSessioneBoard, renderSessionsBoard, refreshSessionsBoard, renderEmbeddedSessionsBoardDemo e stato Board; import del componente)
- harness-ui/frontend/index.template.html (generato)
- harness-ui/frontend/src/styles/index.css (generato)
- .claude/immagini/astra-fase2/Board/{file nominati nel consuntivo prima dello staging; nessun file esistente sovrascritto}

Simboli pubblici nuovi: statoBoard, tempoBoard, testiBoard, cartellaDaExport, selezionaSessioniBoard, creaRigaBoard, creaTabellaBoard, aggiornaBoard. Compatibilità: creaRigaSessioneBoard/renderSessionsBoard/refreshSessionsBoard/renderEmbeddedSessionsBoardDemo/ensureSessionsBoard, passaASessione e apriMenuAzioniSessione restano; le ultime due non si modificano.

RED: B3-STATO-PRECEDENZA, B3-METRICHE-ONESTE, B3-FILTRI-ORDINE, B3-CARTELLA-EXPORT, B3-TEMPO; import assente prima del componente. Poi parità Board a 1440/1280/1024, screenshot coppie aperti, innesto e prove reali con 73 sessioni. GREEN: node --test tests/unit/board.test.mjs; componenti; test:lab; verify; E2E Board live. Gate reale: nessun mock per lista/metriche/cartelle/apertura, stesso store copiato 4177/4179; fault injection separata per recupero errori. Rollback: revert del solo commit B3, nessuna migrazione o scrittura sullo store. Non è un test conversazionale del modello: runtime owner assente.

Cosa deve fare l'owner: nulla durante l'implementazione, poi rivedere schermate e consegna. Cosa fai tu dopo: componente, parità, innesto, verifica reale e commit. Cosa rimane: B5 → B4 → B6 → B2 → B7 → B1 → B8; OAuth e piano computer-use successivi.

---

## Storico precedente al reindirizzamento (conservato, non piano attivo)

# Ledger Astra — fase 2, 05/09/2026

## Passo attivo — Browser R2 e fixture di confronto, 05/09/2026

Precisazione prima dell'edit HTML: l'originale `Annota` prepara il composer
con un solo clic. Conservare questo percorso e la bozza preesistente, senza
submit. La nota conservata nel lettore è un'azione separata `Nota locale`;
il test verifica entrambi i percorsi (`ASTRA-BROWSER-ANNOTAZIONE-CHAT`).
`annotaPaginaBrowser` prepara la chat; `conservaNotaBrowser` e
`concludiRichiestaBrowser` sono ulteriori helper privati del solo prototipo.
La memoria delle note è volatile e dichiarata: si azzera al ricaricamento.

Primo GREEN R2 ancora rosso: la sostituzione testuale ha ridotto `$$` a `$`
nelle due liste del renderer; interrompe l'aggiornamento di limiti/storia/note.
Radice isolata nel prototipo; correggere nello stesso ciclo RED/GREEN Browser.
I gate cronologia, vuoto, annotazione e annullamento la intercettano e restano
permanenti. Nessun avanzamento di fase prima che siano verdi.

Correzione recupero bozza, durante il ciclo Browser: riprodotta la perdita della nota non ancora
conservata passando alla pagina precedente e tornando. Ricerca aggiornata prima
dell'edit: stesse tre release ufficiali riaperte (pin invariati), documenti
Hermes Desktop, Claude Chrome e OpenAI Browser, più WCAG 3.2.2 On Input.
Hermes/OpenAI separano commento da invio; non documentano qui la durata di una
bozza non salvata: gap, non debolezza attribuita. Claude distingue lettura da
azioni con effetti; non documenta note per lettura. Adattare la separazione
nota/invio e aggiungere un +1 verificabile: nessuna perdita durante il cambio
pagina. Aggiungere solo `bozzeBrowserDemo` (Map privata volatile), nessuna API.
RED permanente `ASTRA-BROWSER-BOZZA-RECUPERATA`: atteso testo precedente, ottenuta
nota salvata precedente. GREEN: bozza identica dopo andata/ritorno; `Annulla`
scarta la sola modifica esplicitamente; reload reset dichiarato. File invariati
rispetto all'elenco del passo; estensione del dossier e gate esistenti.

Reflow mobile: screenshot aperto a 390 px, header Browser allarga il documento
a 523 px e taglia le schede. Gate rosso DOM/immagine, correzione scoped al solo
`#schermoBrowser > .talos-topbar`; CSS originale conservato byte per byte.
Prima dell'edit riaperte le tre docs ufficiali e WCAG 1.4.10 Reflow (05/09,
durante il ciclo Browser). Release/pin verificati nel medesimo ciclo; nessun cambiamento di
versione. Forze comparator: controlli browser contestuali e navigazione; gap:
confronto mobile diretto dei tre non eseguito. Adottare reflow W3C e mantenere
tutte le schede, +1 misurabile zero overflow 320/390 px, azioni raggiungibili.
Nuovo export test `verificaBrowserLayout(tab)`, scenario
`ASTRA-BROWSER-REFLOW`, nessun altro file applicativo. Le prime acquisizioni
originali subito dopo resize risultano dipinte prima della stabilizzazione:
conservarle come prove scartate e ripetere a viewport stabilizzato.

Owner: «cosa aspetti? continua». Riepiloghi da ora in tre frasi brevi:
cosa fa l'owner, cosa fa Astra, cosa rimane. Sottosistemi: prototipo UI e test.
Gate originale/proposta: Browser originale conserva precedente/successiva,
apertura esterna, annotazione nel composer, copia del testo esatto; proposta
perde successiva/annota/copia e simula un DOM web che `naviga` non restituisce.
Fonte originale: `public/app.js` `appendBrowserEntry`, `mostraPaginaBrowser`,
handler `data-browser-action`, `ToolCallResult` di `naviga`; tutti invariati.
Toast originale visto dal vero: role status, massimo tre, timeout 3300 ms.
Albero proposto: menu aperto sotto il bordo del pannello, da verificare/correggere
in passo separato. Non è ancora un verdetto completo degli altri tre gruppi.

Ricerca fresca del passo, 05/09, finestra 06/08–05/09, dossier
`RICERCA-ASTRA-BROWSER-R2-2026-09-05.md`: Hermes release v2026.8.31 al pin
`29112bef099274229cadff79cdff7bf7b99c4b77` e PR #90197 (20/08), Claude Code
v2.1.261 `d7dbd9a09f59775726ed14bbea8fc9dfdff62f7b` e docs Chrome, Codex
0.153.4 `3d2ee51ca2d5db578f328aa75e20aa22c0197c9a` e docs browser OpenAI,
W3C APG Dialog e WCAG status. Adottare i contratti originali, adattare storia
selezionabile/provenienza/annotazione senza invio, respingere l'imitazione di
un browser live. Nessun runtime Computer Use integrato ora.

File da creare/modificare, esatti:
- fase2 `.claude/LEDGER-ASTRA-FASE-2-2026-09-05.md`.
- fase2 `.claude/RICERCA-ASTRA-BROWSER-R2-2026-09-05.md`.
- fase2 `.claude/CONSEGNA-ASTRA-BROWSER-R2-2026-09-05.md`.
- fase2 `.claude/AVVIA-CONFRONTO-SUPERFICI-ASTRA-2026-09-05.mjs`.
- fase2 `.claude/fixtures/browser-pages.json`.
- fase2 `.claude/fixtures/superfici/store/00000000-0000-4000-8000-000000000001.jsonl`.
- fase2 `.claude/fixtures/superfici/workspace/README.md`.
- fase2 `.claude/fixtures/superfici/workspace/src/session-registry.mjs`.
- fase2 `.claude/fixtures/superfici/workspace/tests/session-registry.test.mjs`.
- fase2 `.claude/fixtures/superfici/server.stdout.log`.
- fase2 `.claude/fixtures/superfici/server.stderr.log`.
- fase2 `.claude/fixtures/superfici/server.json`.
- fase2 `.claude/tests/astra-browser-r2-acceptance.mjs`.
- fase2 `.claude/immagini/astra-mockup/superfici-confronto/manifesto.json`.
- fase2 `.claude/immagini/astra-mockup/superfici-confronto/osservazioni.json`.
- anteprima `.claude/ANTEPRIMA-ASTRA-SCHEDE-2026-09-05.html`.
- anteprima `.claude/VERIFICA-ANTEPRIMA-ASTRA-2026-09-05.json`.
- anteprima `.claude/LEDGER-ANTEPRIMA-ASTRA-2026-09-05.md`.
- anteprima `.claude/CONSEGNA-ANTEPRIMA-ASTRA-2026-09-05.md`.
Immagini nominative nel manifesto, catturate e aperte; nessuna eliminazione.

Simboli nuovi privati del prototipo: `pagineBrowserDemo`, `indiceBrowserDemo`,
`annotazioniBrowserDemo`, `selezionaPaginaBrowser`, `renderizzaBrowserDemo`,
`annotaPaginaBrowser`, `copiaPaginaBrowser`. Conservare `cambiaStatoBrowser`,
id `schermoBrowser`, `statoBrowser`, `urlBrowser`, `browserPagina`,
`browserBloccato`, `browserCaricamento` e i percorsi delle altre schermate.
Nuovo export nel solo test: `verificaBrowserR2(tab)`. Nessuna API, schema o
migrazione di prodotto modificata. Fixture JSONL schema 1/AG-UI originali;
renderizzate dal server e frontend originali, non da una copia riscritta.
La fixture si dichiara nel titolo; non prova esecuzioni LLM o navigazioni reali.

RED prima della modifica: `verificaBrowserR2` deve rilevare assenza di Avanti,
Annota/Copia, URL modificabile senza navigazione, cronologia senza selezione,
mancanza stato vuoto. Scenari permanenti `ASTRA-BROWSER-AZIONI`,
`ASTRA-BROWSER-CRONOLOGIA`, `ASTRA-BROWSER-TESTO-ESATTO`,
`ASTRA-BROWSER-URL-SOLA-LETTURA`, `ASTRA-BROWSER-ANNOTAZIONE-NON-INVIA`,
`ASTRA-BROWSER-VUOTO`, `ASTRA-BROWSER-ANNULLA`, `ASTRA-BROWSER-NESSUN-HTML`.
GREEN: stesso gate nel browser app con interazioni, precedente/successiva,
testo letterale non eseguito, annotazione conservata mentre si cambia pagina,
copy con successo solo dopo clipboard riuscita. Prova originale con stessa
fixture tramite API/SSE reali del server isolato. Nessun backend nuovo simulato.
Poi verifica statica anteprima, immagini equivalenti 1440/1280/1024, stato
vuoto/bloccato/caricamento/annullato, tastiera, tema chiaro, responsive mobile,
reload (reset demo dichiarato), diff prodotto vuoto e `git diff --check`.
Rollback: ripristinare solo Browser nell'HTML di anteprima dal testo salvato
nel diff; non cancellare modifiche utente e non ammettere la vecchia proposta.
Non chiudere A/B finché gli altri gruppi e l'owner non hanno concluso i gate.

## Mandato, approvazione e base

L'owner ha approvato l'anteprima («anteprima approvata») e chiesto di creare
la worktree («creala tu la worktree»). Creata
`C:/Users/Antonino/Desktop/projects/AVM-astra-fase2`, branch `lane/astra-fase2`,
da `1813e27a38937a158567b34847b7a7eceeaabd95` come nel brief `da412f23`.
Nessun intervento nel worktree desktop, che contiene modifiche dell'altra sessione.
Le proposte approvate e la prima consegna restano in `AVM-astra-anteprima`.

## A — integrare il mockup approvato

### Revisione owner: primo avvio nuovamente in esame

Estensione successiva dell'owner: questo cancello vale per ogni singolo blocco,
non solo Intro. Per ciascuno serve matrice originale/proposta/beneficio/
regressione/prova/verdetto, screenshot acquisiti e aperti, nessuna capacità
persa. Verde automatico da solo insufficiente; proposta senza vantaggio concreto
da scartare. Regola salvata nei tre AGENTS.md dichiarati sopra.

L'owner ha chiesto di ispezionare il primo avvio originale e scartare la nuova
modale se non è superiore. L'approvazione precedente non vale più per Intro;
restano approvati gli altri gruppi. Nessun markup A o prodotto modificato finora.
Prima dell'integrazione: confronto sorgente e browser della prima versione,
matrice funzione per funzione e decisione motivata. File aggiuntivo previsto:
`.claude/REVISIONE-INTRO-ORIGINALE-2026-09-05.md`.
Misure iniziali: public/app.js 12043–12058 ha Accesso/Modello/Autonomia/Cartella
e quattro policy; la proposta ne offre due e descrive Solo lettura con una
semantica differente. Non accettabile perdere questo contratto.

### Regola critica aggiunta dall'owner durante la fase

Prima di ogni passo implementativo serve un dossier aggiornato agli ultimi
30 giorni su competitor, documentazione, repository e best practice di Hermes,
Claude Code e Codex, con punti di forza/debolezza e un miglioramento TALOS
misurabile per ciascuna dimensione pertinente. Non basta la sola ricerca APG.
La superiorità resta un obiettivo fino alla verifica, non una dichiarazione.
Aggiornamenti persistenti autorizzati dall'owner («memorizzala»):
`C:/Users/Antonino/Desktop/projects/AVM/AGENTS.md`,
`C:/Users/Antonino/.codex/AGENTS.md`, `AGENTS.md` nella worktree corrente.
Ricerca A estesa alla finestra 06/08/2026–05/09/2026 prima di modificare il mockup.

Sottosistema: documentazione/prototipo TALOS UI; nessuna API o logica di prodotto.
La regia precedente, le sue schermate e le maniglie sono contratti da conservare.
L'anteprima aveva una regia autonoma: copiarla integralmente perderebbe i comandi
del riferimento. L'integrazione unisce le nuove proposte alla regia esistente.

### Ledger di esecuzione prima delle modifiche

File da modificare:
- `.claude/MOCKUP-REDESIGN-TALOS-2026-09-04.html`.
- `harness-ui/frontend/index.template.html`, **solo generato**.
- `harness-ui/frontend/src/styles/index.css`, **solo generato**.

File da creare:
- `.claude/LEDGER-ASTRA-FASE-2-2026-09-05.md`.
- `.claude/LEDGER-ASTRA-SCHERMATE-MANCANTI-2026-09-05.md`.
- `.claude/CONSEGNA-ASTRA-FASE-A-2026-09-05.md`.
- `.claude/RICERCA-ASTRA-FASE-A-2026-09-05.md`.
- `.claude/tests/astra-mockup.test.cjs`.
- `.claude/VERIFICA-ASTRA-FASE-A-2026-09-05.json`.
- `.claude/scripts/integra-astra-mockup.cjs` (ausilio documentale riproducibile).

Immagini della fase A: manifesto nominativo nel rapporto JSON; directory di
destinazione `.claude/immagini/astra-mockup/`. Nessun file da eliminare.

Simboli pubblici di prodotto: nessuno. Simboli privati della regia da conservare:
`SCHERMI`, `DI_SESSIONE`, `mostra`, `selezionaTab`, `apri`, `chiudi`, `imposta`,
`larghezza`, `disegnaLingua`. Simboli nuovi documentali: `mostra` nel solo scope
dell'estensione, `attivaTab`, `labGo`, `apriOverlay`, `chiudiDialogo`, `disegnaIntro`,
`apriDialogo`, `filtraComandi`, `apriComandi`, `eseguiComando`, `mostraToast`,
`mostraEsempiToast`, `filtraLista`, `scegliModello`, `scegliFile`, `eseguiDemo`,
`cambiaStatoBrowser`; nessuna esportazione. Conservare gli ID precedenti e
aggiungere quelli dell'anteprima approvata. Un solo script di regia estraibile
dal generatore esistente; le schermate nuove mantengono `data-c` e classi approvate.

RED: `node --test .claude/tests/astra-mockup.test.cjs` deve fallire perché mancano
Model Lab, Browser, intro, palette, toast, albero e dialoghi nuovi.
Scenari permanenti: `ASTRA-A-SCHERMATE`, `ASTRA-A-REGIA-CONSERVATA`,
`ASTRA-A-REGIA-NON-RICORSIVA`, `ASTRA-A-CSS-CONSERVATO`,
`ASTRA-A-SCRIPT-ESTRAIBILE`, `ASTRA-A-DIALOGHI-DOCUMENTATI`.
GREEN: stessa prova, generazione con `scripts/mockup-to-template.mjs`, build,
parità esistente 54 prove; confronto delle schermate nuove a 1440/1280/1024.
Regressioni da controllare: navigazione precedente, regia tema/densità/lingua,
sidebar a icone, maniglie, tre dialoghi preesistenti e loro tab.
Gate upstream: browser reale per la regia; non serve runtime modello in A.
Rollback: ripristinare solo i file del commit A, dopo autorizzazione owner;
le proposte approvate restano disponibili nel worktree di anteprima.

### Ricerca e decisione upstream

Ricerca primaria già eseguita il 05/09/2026 per le proposte: W3C APG Tabs,
Modal Dialog, Tree View, Keyboard; WCAG 2.2 Status Messages; documentazione
LM Studio e Hugging Face. Dossier copiato e integrato in
`RICERCA-ASTRA-FASE-A-2026-09-05.md`.
Verifica aggiuntiva: MDN HTML template e W3C APG Tabs, 05/09/2026.
Adottare HTML template per documentare markup inerte quando utile, conservare
il sistema TALOS al pin `2c554509` e il generatore del pin `1813e27a`.
Nessuna nuova dipendenza. Non sostituire il design con un kit esterno.

### Esito, richieste e limiti

### Revisione Intro — piano di chiusura prima delle modifiche documentali

05/09/2026: la proposta Intro è respinta. Il confronto aperto nel browser
mostra quattro policy originali contro due e la confusione fra divieto di
scrittura e richiesta di conferma. Nessun cambiamento al prodotto è autorizzato
da questo verdetto. La precedente approvazione Intro è superata.

File di questa chiusura (percorsi relativi alla worktree indicata):
- fase2: `.claude/LEDGER-ASTRA-FASE-2-2026-09-05.md` (questo aggiornamento).
- fase2: `.claude/RICERCA-ASTRA-FASE-A-2026-09-05.md` (appendice Intro).
- fase2: `.claude/REVISIONE-INTRO-ORIGINALE-2026-09-05.md` (nuovo rapporto e consegna).
- fase2: `.claude/immagini/astra-mockup/intro-confronto/osservazioni-browser.json` (evidenza).
- fase2: `.claude/immagini/astra-mockup/intro-confronto/manifesto.json` (nuovo elenco nominativo, dimensioni e hash immagini).
- fase2: `.claude/immagini/astra-mockup/intro-confronto/confronto-autonomia-1280.png` (tavola di confronto).
- anteprima: `.claude/ANTEPRIMA-ASTRA-SCHEDE-2026-09-05.html` (solo etichette di scarto, nessuna interazione cambiata).
- anteprima: `.claude/LEDGER-ANTEPRIMA-ASTRA-2026-09-05.md` (verdetto e limiti).
- anteprima: `.claude/CONSEGNA-ANTEPRIMA-ASTRA-2026-09-05.md` (approvazione Intro superata).
- anteprima: `.claude/VERIFICA-ANTEPRIMA-ASTRA-2026-09-05.json` (esito revisione senza cancellare prove storiche).

Simboli pubblici/API/schema/migrazioni modificati: nessuno. Conservare
INTRO_PASSI, INTRO_POLICY, progressoIntro, apriIntroPrimoAvvio, creaModelPicker,
openRealTaskSheet e tutte le chiavi di persistenza originali senza modifiche.
Le immagini nominative sono registrate nel manifesto; gli scatti provvisori
con viewport non corrispondente sono stati ricatturati prima della consegna.

Scenari permanenti di rifiuto del design: ASTRA-INTRO-4-POLICY,
ASTRA-INTRO-READONLY-DENY, ASTRA-INTRO-ACCESSO-CATALOGO,
ASTRA-INTRO-CARTELLA-COMPLETA. I primi due falliscono visibilmente nella proposta.
Non sono regressioni introdotte nel prodotto: la proposta viene scartata.
Nessun nuovo test di comportamento per una modifica alle sole etichette;
eseguiti i sei test esistenti `node --test tests/http-routes-setup.test.mjs`.
GREEN documentale: verifica statica anteprima, parsing script, diff prodotto
vuoto rispetto alla base e `git diff --check`; riaprire le etichette nel browser.

Ricerca aggiornata dello stesso passo: quickstart ufficiali Hermes, Claude Code,
OpenAI e W3C APG Dialog rivisti il 05/09/2026; pin e finestra mensile nel dossier.
Decisione: adottare il flusso TALOS originale, respingere questa sostituzione.
Nessuna nuova dipendenza. Rollback documentale: togliere solo le nuove etichette
se l'owner approverà una futura proposta; non ripristinare implicitamente questa.

La parte A precedente resta da completare. Prima di integrare qualunque altro
componente applicare la stessa matrice originale/proposta, non riutilizzare
la vecchia approvazione come prova di superiorità.

In lavorazione. Nessuna funzione del monolite toccata. Nessun endpoint/fixture
reale in questa parte; dati dimostrativi dichiarati nella regia.
Richieste a Claude: nessuna al momento; eventuali necessità del ponte vanno qui.
Non verificato: tutti i gate B e tutti i runtime/API reali.

**Cosa deve fare l'owner:** approvazione dell'anteprima già ricevuta.
**Cosa fa Astra dopo:** completare gli audit individuali prima di integrare A; poi B3 nell'ordine del brief.
**Cosa rimane:** chiusura tecnica A, B3/B5/B4/B6/B2/B7/B1/B8 e relative consegne.

## Confronto Hermes e revisione palette — piano documentale, 05/09/2026

Ripresa autorizzata dall'owner con «continua adesso». Sottosistemi: docs e
prototipo TALOS UI. Nessun file di prodotto da modificare. Intro: revisione
chiusa con proposta scartata e originale conservato; 16 immagini nel manifesto
Intro, sei test setup passati. Questi esiti non approvano gli altri componenti.

Hermes desktop aperto dalla copia compilata trovata nel confronto precedente.
Ispezionati aspetto, modelli, menu provider, notifiche, scorciatoie e Capability.
Versione del package locale 0.17.0, distinta dalla release web 0.21.0.
Trasparenza iniziale 85%, portata temporaneamente a 0% per leggere la UI.
Il ripristino è pendente: `failed to activate captured window` anche dopo
riscoperta della finestra e un tentativo di recupero. Non è un difetto Hermes
dimostrato. Nessun altro input desktop dopo il recupero fallito.

La palette proposta non passa il gate: 7 voci contro 15 originali, 12 azioni
originali assenti. La ricerca «review» trova una voce originale e zero nella
proposta. «Nuova sessione» apre l'Intro scartata invece del foglio originale
con cartella, modello, ragionamento, planner e quattro policy. Screenshot delle
due coppie aperti a 1280×900. Decisione: SCARTARE questa palette, tenere
l'originale. Non mascherare i test rossi come completamento della fase A.

File esatti di questo passo (prima delle modifiche alle etichette e ai test):
- fase2: `.claude/LEDGER-ASTRA-FASE-2-2026-09-05.md`.
- fase2: `.claude/RICERCA-ASTRA-CONFRONTO-HERMES-2026-09-05.md` (nuovo dossier).
- fase2: `.claude/CONSEGNA-ASTRA-CONFRONTO-HERMES-2026-09-05.md` (nuova consegna).
- fase2: `.claude/tests/astra-palette-acceptance.test.cjs` (gate permanente).
- fase2: `.claude/immagini/astra-mockup/hermes-confronto/manifesto.json`.
- fase2: `.claude/immagini/astra-mockup/hermes-confronto/osservazioni.json`.
- anteprima: `.claude/ANTEPRIMA-ASTRA-SCHEDE-2026-09-05.html` (solo etichette di scarto).
- anteprima: `.claude/VERIFICA-ANTEPRIMA-ASTRA-2026-09-05.json` (appendice, prove storiche conservate).
- anteprima: `.claude/LEDGER-ANTEPRIMA-ASTRA-2026-09-05.md`.
- anteprima: `.claude/CONSEGNA-ANTEPRIMA-ASTRA-2026-09-05.md`.

Nessuna eliminazione. Immagini acquisite elencate nominativamente nel manifesto.
Le due immagini originali di ciascun confronto restano separate e inalterate:
nessuna tavola composita necessaria; si aprono entrambe dalla consegna.
Simboli pubblici, API, schema, migrazioni: nessuno. Conservare senza modifiche
`openCommandPalette`, `filterCommands`, `moveActiveCommand`, `executeCommand`,
`createNewSession`, `openRealTaskSheet` e le relative chiavi di persistenza.
Test privati: `originalCommands`, `proposedCommands`, `normalizza`.

RED permanente: `rtk proxy node --test .claude/tests/astra-palette-acceptance.test.cjs`:
- `ASTRA-PALETTE-COPERTURA-ORIGINALE`: deve segnalare le 12 azioni mancanti.
- `ASTRA-PALETTE-NUOVA-NON-INTRO`: deve segnalare la destinazione Intro errata.
Non rientra nella suite prodotto: è un gate di ammissione della proposta respinta.
GREEN richiesto solo per una futura sostituzione completa, insieme a interazioni
reali, tastiera, persistenza, errori e immagini alle tre larghezze del brief.
Chiusura documentale: verifica statica anteprima, parsing script, immagini aperte,
hash/dimensioni, diff prodotto e mockup congelato vuoti, `git diff --check`.

Ricerca fresca 05/09, finestra 06/08–05/09: release e docs Hermes, Claude Code,
Codex; PR Hermes #88744, Codex #41911/#42874; W3C APG Combobox e WCAG status.
Pin, date, decisioni e gap nel dossier prima delle etichette. Adottare il
catalogo/percorsi originali TALOS; adattare chiarezza di ambito, ricerca e stati
dei competitor in un futuro passo; respingere palette corrente e importazione
di framework/motori non necessaria a questa revisione. Nessuna dipendenza.
Rollback: rimuovere solo l'etichetta di scarto dopo nuova prova e approvazione;
il prodotto originale resta il riferimento funzionante.

### Richiesta owner da affrontare dopo il mockup

05/09/2026, registrata durante questa revisione: valutare insieme una funzione
di **Computer Use integrata in TALOS**. Dopo la chiusura del mockup preparare
una proposta di piano implementativo molto dettagliata e tecnicamente
applicabile, con backend, frontend, tecnologie/API/supporto OS documentati,
versioni e licenze, permessi, isolamento, ciclo osservazione–azione–verifica,
errori/recupero, persistenza/evidenze, test e sequenza di implementazione.
Nessuna supposizione presentata come capacità disponibile: distinguere fatti
verificati, limiti e verifiche tecniche ancora necessarie. La ricerca fresca
Hermes/Claude Code/Codex e i gate del progetto valgono anche per questo piano.
È una richiesta di analisi e valutazione con l'owner, non autorizza a iniziare
ora l'integrazione. Nessuna automazione o nuovo task creato.

### Esito del passo confronto Hermes/palette

Verifica 05/09 alle 09:02 UTC: statica anteprima PASS (CSS originale SHA-256
`3ed26965ddc41a80e1fb8d2740005f6e739c284f05dc311d7081c1f8c45e30f3`, 29 simboli
conservati, script valido, zero rete/storage/icone mancanti); 14 immagini
decodificate, aperte e con dimensioni esatte. `git diff --check` PASS nelle due
worktree; diff `harness-ui` e mockup congelato contro `1813e27a` vuoto.
Gate palette RED: 0/2 passati, due fallimenti attesi che motivano lo scarto.
Etichette riaperte nel browser; viewport ripristinata. Nessun commit/push.
Consegna in `CONSEGNA-ASTRA-CONFRONTO-HERMES-2026-09-05.md`, dossier dedicato,
ledger e consegna anteprima aggiornati. Ripristino trasparenza Hermes pendente.

## Revisione Model Lab — piano prima della chiusura documentale

05/09/2026. Sottosistemi: docs, gate del prototipo TALOS UI. Ispezionati nel
browser originale e proposta a 1280×900: catalogo, runtime, Hugging Face,
installati, download e provider. La pagina dedicata migliora lo spazio leggibile,
ma la revisione corrente perde importazione GGUF, quattro ordinamenti HF,
autore libero/tag/paginazione e selezione backend. Non ammetterla in A/B6.
La differenza fra catalogo reale e fixture non è di per sé una regressione.

Ricerca fresca di questo passo, finestra 06/08–05/09: release Hermes v0.21.0
`29112bef099274229cadff79cdff7bf7b99c4b77`, Claude Code v2.1.261
`d7dbd9a09f59775726ed14bbea8fc9dfdff62f7b`, Codex 0.153.4
`3d2ee51ca2d5db578f328aa75e20aa22c0197c9a`; rispettivi picker/docs/PR,
Hugging Face HfApi e LM Studio lms import. Fonti esatte, date, decisioni e gap
in `RICERCA-ASTRA-MODELLAB-2026-09-05.md`. Adottare i contratti originali,
adattare pagina dedicata e distinzione stima/misura in una futura revisione;
respingere il sostituto corrente. Nessuna dipendenza o motore da integrare.

File esatti di questa chiusura:
- fase2: `.claude/LEDGER-ASTRA-FASE-2-2026-09-05.md`.
- fase2: `.claude/RICERCA-ASTRA-MODELLAB-2026-09-05.md` (nuovo).
- fase2: `.claude/CONSEGNA-ASTRA-MODELLAB-2026-09-05.md` (nuovo).
- fase2: `.claude/tests/astra-modellab-acceptance.mjs` (nuovo gate browser).
- fase2: `.claude/immagini/astra-mockup/modellab-confronto/osservazioni.json`.
- fase2: `.claude/immagini/astra-mockup/modellab-confronto/manifesto.json`.
- anteprima: `.claude/ANTEPRIMA-ASTRA-SCHEDE-2026-09-05.html` (solo etichette).
- anteprima: `.claude/VERIFICA-ANTEPRIMA-ASTRA-2026-09-05.json` (appendice).
- anteprima: `.claude/LEDGER-ANTEPRIMA-ASTRA-2026-09-05.md`.
- anteprima: `.claude/CONSEGNA-ANTEPRIMA-ASTRA-2026-09-05.md`.
Le immagini acquisite sono elencate nominativamente nel manifesto; nessuna
immagine ritoccata o eliminata. Prodotto e mockup congelato restano invariati.

Unico simbolo esportato nuovo, nel solo test: `verificaModelLab(tab)`.
Nessuna API/schema/migrazione cambiata. Conservare `ensureModelLabControls`,
`importaModelloLocaleModelLab`, `renderizzaRuntimeModelLab`,
`renderizzaHfDetailModelLab`, `cercaHuggingFaceModelLab`,
`renderizzaProviderModelLab` e la persistenza originale senza modifiche.

RED: eseguire `verificaModelLab(comparisonProposal)` nel Node REPL del browser
app; restituisce casi nominativi con expected/actual/pass e `ok:false` se
falliscono. Non eseguire browser esterni o connessioni CDP. Scenari permanenti:
`ASTRA-LAB-IMPORT-GGUF`, `ASTRA-LAB-HF-ORDINAMENTI`,
`ASTRA-LAB-HF-AUTORE-LIBERO`, `ASTRA-LAB-HF-FILTRI`,
`ASTRA-LAB-HF-PAGINAZIONE`, `ASTRA-LAB-BACKEND-SELEZIONABILE`,
`ASTRA-LAB-HF-FILE-REVISIONE`, `ASTRA-LAB-CATALOGO-METADATI`,
`ASTRA-LAB-PROVIDER-VERIFICA-COMPLETA`. Attesi fallimenti della proposta,
senza considerare assenza di API nel mockup una regressione aggiuntiva.
Il gate acquisisce dati dal DOM del browser; non certifica upload, credenziali
o esecuzioni reali. GREEN futuro: tutti i casi, poi API reali, errori,
annullamento, reload, tastiera e screenshot 1440/1280/1024 secondo il brief.

Verifica di chiusura: test browser RED registrato, script statico anteprima
PASS, screenshot etichette aperto, dimensioni/hash immagini, diff prodotto
vuoto e `git diff --check` nelle due worktree. Non ripetere suite backend per
sole etichette. Rollback: togliere le etichette di rifiuto solo dopo una nuova
revisione verificata; nessun ripristino implicito del sostituto corrente.
Richiesta Computer Use futura già registrata: resta successiva al mockup.

### Precisazione owner Computer Use — 05/09, durante revisione Model Lab

L'owner richiede il massimo dettaglio della ricognizione tecnica backend e
frontend e nomina esplicitamente **ChatGPT**: includerlo nel confronto insieme
a Hermes, Claude Code e Codex. Ispezionare documentazioni e codice pubblico,
forze e debolezze verificate, e proporre miglioramenti misurabili anche sulle
forze. Nessuna pigrizia, inesattezza o supposizione presentata come fatto.
Piano applicabile fino a componenti, contratti/API, dipendenze, flussi,
recupero e test. Dettagli proprietari non pubblici restano gap espliciti:
non inventare l'architettura interna di ChatGPT. Questa precisazione amplia
la profondità richiesta, non anticipa la fase: resta **dopo il mockup**.


### Chiusura verificata del passo Model Lab

05/09/2026, 09:24 UTC: gate browser aggiornato **0 PASS / 9 FAIL, ok:false**, coerente con il rifiuto della proposta. Verifica statica anteprima PASS: CSS originale SHA-256 `3ed26965ddc41a80e1fb8d2740005f6e739c284f05dc311d7081c1f8c45e30f3`, 29 simboli conservati, script valido, zero rete/storage/icone mancanti. Tutte le 17 immagini decodificate, aperte, con dimensioni 1280×900 e hash corretti. `git diff --check` PASS nelle due worktree; diff di `harness-ui` e mockup congelato contro `1813e27a` vuoto. Etichette riaperte visivamente, viewport e inspector originale ripristinati. Nessun commit/push. Ripristino trasparenza Hermes 85% ancora pendente.


## Coerenza stati Browser — 05/09/2026, durante il ciclo Browser

Ricerca rinnovata prima dell’edit: https://github.com/NousResearch/hermes-agent/releases/tag/v2026.8.31 (31/08, pin 29112be), https://code.claude.com/docs/en/chrome (permessi per azioni, docs stabili), https://learn.chatgpt.com/docs/browser (controllo sito e azioni, docs stabili). Gli altri pin di release verificati nel ciclo restano quelli sopra. Adattare richiesta esplicita e risultato collegato all’URL; nessuna debolezza dei competitor dedotta. +1 locale verificabile: Consenti sulla pagina richiesta deve mostrare quella pagina anche partendo da una lettura diversa. RED ASTRA-BROWSER-PERMESSO-DESTINAZIONE riprodotto: rimaneva home anziché documentazione. Correggere il solo handler consentiBrowser per selezionare la fixture richiesta; vuoto nasconde anche cronologia e conteggio, evitando due pagine visibili quando il totale è zero. Nessuna nuova API o componente, stessi file del ledger.


## Browser R2 — passo del prototipo consegnato, 05/09/2026

Proposta corretta disponibile su http://127.0.0.1:43821/anteprima#browser. 14 test interattivi PASS, testo esatto da fixture comune all’originale, Annota in chat in un clic, storia selezionabile, note e bozze recuperate, stati coerenti, reflow 320/390/1024/1280/1440. 35 immagini acquisite e aperte nel manifesto superfici-confronto; tre prime acquisizioni non stabilizzate escluse dalle prove. CSS originale e 29 simboli conservati, verifica statica PASS, diff prodotto vuoto, nessun commit/push.

Verdetto: pronto per revisione del mockup, non promosso nel prodotto. Maggiore altezza del lettore da valutare con owner; nessuna superiorità totale dichiarata. Copia API risolta ma round-trip clipboard virtuale non verificabile; apertura nel browser OS non osservata; screen reader e reduced-motion emulato non provati. Persistenza reale resta fase B, reset demo dichiarato e verificato.

Rapporto: C:/Users/Antonino/Desktop/projects/AVM-astra-fase2/.claude/CONSEGNA-ASTRA-BROWSER-R2-2026-09-05.md. Dossier: RICERCA-ASTRA-BROWSER-R2-2026-09-05.md. Prove: immagini/astra-mockup/superfici-confronto/{manifesto,osservazioni}.json.

Owner: può provare il Browser R2. Astra: prosegue albero file, notifiche e dialoghi, poi completa le carenze del Model Lab. Rimane: chiusura mockup, A/B e successiva ricognizione Computer Use molto dettagliata anche su ChatGPT. Intro/palette scartate, originali conservate. Ripristino trasparenza Hermes a 85% ancora pendente per errore tool.


## Passo menu file — piano prima dell’edit

Sottosistema: prototipo UI. Problema originale/proposta osservato: menu per file originale accessibile, quello proposto oltre il viewport (904–1102 su 900 px). Ricerca fresca del passo in RICERCA-ASTRA-MENU-FILE-2026-09-05.md, Hermes/Claude/Codex e MDN/W3C, pin e gap espliciti. Adottare Popover API nativa, adattare clamp e tastiera APG; nessuna dipendenza.

File esatti: fase2 .claude/LEDGER-ASTRA-FASE-2-2026-09-05.md; .claude/RICERCA-ASTRA-MENU-FILE-2026-09-05.md; .claude/CONSEGNA-ASTRA-MENU-FILE-2026-09-05.md; .claude/tests/astra-file-menu-acceptance.mjs; .claude/immagini/astra-mockup/superfici-confronto/manifesto.json; .claude/immagini/astra-mockup/superfici-confronto/osservazioni.json. Anteprima .claude/ANTEPRIMA-ASTRA-SCHEDE-2026-09-05.html; .claude/VERIFICA-ANTEPRIMA-ASTRA-2026-09-05.json; .claude/LEDGER-ANTEPRIMA-ASTRA-2026-09-05.md; .claude/CONSEGNA-ANTEPRIMA-ASTRA-2026-09-05.md. Immagini nominative nel manifesto, nessuna eliminazione.

Simboli privati nuovi: posizionaMenuFile, apriMenuFile, chiudiMenuFile. Handler menuFile aggiornato; mostra e apriOverlay chiudono il popover prima del cambio. ID menuFile/apriMenuFile e azioni esistenti conservati. Export test nuovo verificaMenuFile(tab). Nessuna API, schema o prodotto modificato.

RED: ASTRA-FILE-MENU-VISIBILE e SEMANTICA falliscono prima dell’edit. GREEN: misura menu entro margine 8 px, hit testing, focus sul primo comando, frecce e End, Escape ritorna all’invocatore; click fuori e apertura dialogo chiudono il menu. Popover reale, non mock dell’API. Regressione Browser 14 test e verifica statica CSS/simboli; git diff --check. Screenshot catturati E aperti 1280/1440, originale e proposta. Rollback solo le modifiche menu del prototipo, nessun ripristino generale di file. Albero globale NON ammesso: drag/drop, CRUD, radice, Rivela e mobile da completare.

## Audit esteso righe e sottomenu — prima dei test, 05/09/2026

Correzione owner: ispezionare tutte le tipologie di righe Hermes, non soltanto l'albero file; inclusi i sottomenu Appearance e Move to project. Ricerca fresca in `RICERCA-ASTRA-RIGHE-CONTESTUALI-2026-09-05.md`. Nessuna implementazione prodotto in questo passo.

File esatti da creare/aggiornare in fase2: `.claude/RICERCA-ASTRA-RIGHE-CONTESTUALI-2026-09-05.md`; `.claude/CONSEGNA-ASTRA-RIGHE-CONTESTUALI-2026-09-05.md`; `.claude/LEDGER-ASTRA-FASE-2-2026-09-05.md`; `.claude/tests/astra-row-context-acceptance.mjs`; `.claude/immagini/astra-mockup/hermes-righe/manifesto.json`; `.claude/immagini/astra-mockup/hermes-righe/osservazioni.json`; `.claude/immagini/astra-mockup/superfici-confronto/manifesto.json`; `.claude/immagini/astra-mockup/superfici-confronto/osservazioni.json`. File anteprima: `.claude/LEDGER-ANTEPRIMA-ASTRA-2026-09-05.md`; `.claude/CONSEGNA-ANTEPRIMA-ASTRA-2026-09-05.md`; `.claude/VERIFICA-ANTEPRIMA-ASTRA-2026-09-05.json`. Screenshot esatti nel manifesto. Nessuna cancellazione.

Nuovi soli export del test: `verificaMenuContestualeRiga(tab, opzioni)` e `verificaUnicitaMenuRighe(tab, righe)`. Contratti originali stabili: `apriMenuAzioniSessione`, `creaRigaSessioneBoard`, `apriMenuAzioniFile`; nessuna API/schema/migrazione modificata.

RED permanenti: `ASTRA-RIGHE-SESSIONE-MENU`, `ASTRA-RIGHE-SESSIONE-AZIONI`, `ASTRA-RIGHE-SESSIONE-FOCUS` sulla proposta; `ASTRA-RIGHE-MENU-UNICO` sull'originale aprendo file e sessione consecutivamente. Test usa input browser reali e lettura DOM, non invoca handler interni. GREEN futuro: cinque azioni originali conservate, un solo menu visibile, focus corretto; stessa copertura su Board e percorsi distribuiti. Confronto visivo equivalente e gate backend degli effetti prima della promozione. Non aggiungere nuovi effetti mentre Computer Use impedisce il completamento dell'audit richiesto.

Chiusura del passo di sola caratterizzazione: esiti nominativi salvati, screenshot aperti, hash/decodifica, documenti aggiornati, diff check. Rollback: rimuovere soltanto il nuovo modulo di test e le appendici se respinti; non toccare modifiche altrui né eliminare evidenze. Owner: nessuna conferma di design richiesta ora. Rimane l'audit visivo Hermes e la successiva correzione del mockup.


## Righe contestuali e menu file — consegna del passo, 05/09/2026

Corretto soltanto il contenitore menu file: 5 PASS a 1280 e 1440; Browser 14 PASS dopo il cambio. Screenshot superfici-confronto ora 41, inclusa regressione sessioni, aperti e conservati; 7 ulteriori immagini Hermes e 23 hash sorgenti nel manifesto hermes-righe. Nessuna promozione dell’albero o del mockup completo.

Correzione owner recepita: audit esteso a tutte le categorie di righe e ai sottomenu. Sorgenti: Appearance sessione 12 colori con ereditarietà e persistenza locale; progetto 12 colori/28 icone e materializzazione dei progetti automatici; Move to project cambia cwd; Open in split ha quattro direzioni e clic diretto a destra. Effetti ricostruiti dal codice, non dichiarati tutti provati live.

Tre test permanenti RED per menu sessione assente nel prototipo. Un test RED originale per due menu simultanei. File test: C:/Users/Antonino/Desktop/projects/AVM-astra-fase2/.claude/tests/astra-row-context-acceptance.mjs. Rapporti: CONSEGNA-ASTRA-RIGHE-CONTESTUALI-2026-09-05.md e CONSEGNA-ASTRA-MENU-FILE-2026-09-05.md in .claude della worktree fase2.

Computer Use fallisce ancora con failed to activate captured window anche dopo nuovi tentativi richiesti dall’owner, riscoperta, get_window e Raise. Alcune immagini non corrispondevano alla finestra dichiarata; non usate per input. Ripristino trasparenza Hermes 85% ancora pendente; nessuna nuova modifica a colori/sessioni/configurazione. Le verifiche non eseguite rimangono aperte, non convertite in PASS.

Owner: nessuna nuova approvazione richiesta. Astra: completa audit visivo/sottomenu quando il controllo torna operativo, poi corregge il mockup dopo nuova ricerca. Rimane: chiusura mockup e fasi B nell’ordine del brief, quindi piano Computer Use dettagliato anche su ChatGPT. Nessun commit/push. Server anteprima http://127.0.0.1:43821/anteprima.


Verifica finale del passo — 05/09/2026, 10:43 UTC: `git diff --check` PASS nelle due worktree; verifica statica anteprima PASS (CSS originale intatto, 29 simboli, sintassi valida, niente rete/storage). Decodifica/hash di 48 immagini PASS (41 superfici, 7 Hermes), mantenendo le esclusioni qualitative già registrate. Gate menu 5 PASS per viewport, Browser 14 PASS; caratterizzazione righe 3 RED proposta e 1 RED originale, dichiarati e non sanati in questo audit.

## B3 — prima dell’innesto nel monolite

05/09/2026: WAI Table Pattern riletto (URL sopra). RED import assente verificato; unità 5/5, parità Board 3/3. Aperte tutte le sei immagini componente/mockup: forma coincidente; a 1024 la tabella scorre orizzontalmente nel proprio contenitore. Due varianti CSS Board, zero token e zero sprite nuovi. Innesto previsto anche nei nuovi helper privati leggiDettagliBoard e caricaCartelleSessioniBoard, entrambi dentro il blocco posseduto della Board. Nessuna modifica al ponte o alle funzioni protette.

## B3 — taccuino prima della correzione in batch

05/09/2026: WCAG 2.2 Understanding Status Messages riletto https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html. 195/195 statici; prove reali 6/9: tre failure del TEST che presumeva usage non-null, mentre il componente già gestisce l’assenza. Il test ora deve ordinare solo sessioni con conteggio disponibile e verificare che le altre restino in fondo. Ispezione screenshot reale: con 73 righe lo stato del caricamento/errore delle metriche è troppo in basso. Scenario permanente B3-STATO-VISIBILE: richiedere status in viewport; spostarlo nella testata della pagina, con il CSS esistente. verify fallisce sul contratto CSS PHASE3-TOKEN-CONTRACT-01 preesistente; non si altera il test né si riscrive il CSS condiviso.

## B3 — parità dei dettagli e confine embedded

05/09/2026, MDN title (https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/title, aggiornato 17/04/2026): il tooltip da solo non copre touch/tastiera. Decisione: i token in cache già visibili nell’originale restano VISIBILI accanto alla percentuale, nessuna informazione affidata al solo hover. Scenario B3-CACHE-COPERTURA. Revisione del codice: i nuovi callback Aggiorna/Cartella devono rispettare embeddedDemoOnly come il vecchio handler. Scenario B3-EMBEDDED: host senza API, nessuna lettura neppure dopo Aggiorna o focus Cartella. RED prima dei due fix. Nessun file oltre quelli già pianificati.

Ultimo dettaglio visivo B3: la barra orizzontale di una tabella con 73 righe stava in fondo a tutte le righe. Variante funzionale scoped: altezza massima del contenitore Board legata al viewport, intestazioni sticky già esistenti; il corpo scorre e la barra resta raggiungibile. Il test B3-REALE verifica fondo del contenitore entro il viewport e usa wheel orizzontale reale, non una scrittura di scrollLeft. Fonte WAI Table Pattern e Status Messages già rilette nel ciclo. Terza regola CSS Board, nessun token nuovo.

## B3 — manifest esplicito delle prove visive

I nomi sostituiscono il segnaposto immagini del piano iniziale; nessun altro PNG entra nel commit B3.
- .claude/immagini/astra-fase2/Board/mockup-1440.png
- .claude/immagini/astra-fase2/Board/componente-1440.png
- .claude/immagini/astra-fase2/Board/app-reale-1440.png
- .claude/immagini/astra-fase2/Board/originale-1440.png
- .claude/immagini/astra-fase2/Board/app-metriche-destra-1440.png
- .claude/immagini/astra-fase2/Board/app-filtro-errore-1440.png
- .claude/immagini/astra-fase2/Board/app-errore-1440.png
- .claude/immagini/astra-fase2/Board/mockup-1280.png
- .claude/immagini/astra-fase2/Board/componente-1280.png
- .claude/immagini/astra-fase2/Board/app-reale-1280.png
- .claude/immagini/astra-fase2/Board/originale-1280.png
- .claude/immagini/astra-fase2/Board/app-metriche-destra-1280.png
- .claude/immagini/astra-fase2/Board/app-filtro-errore-1280.png
- .claude/immagini/astra-fase2/Board/app-errore-1280.png
- .claude/immagini/astra-fase2/Board/mockup-1024.png
- .claude/immagini/astra-fase2/Board/componente-1024.png
- .claude/immagini/astra-fase2/Board/app-reale-1024.png
- .claude/immagini/astra-fase2/Board/originale-1024.png
- .claude/immagini/astra-fase2/Board/app-metriche-destra-1024.png
- .claude/immagini/astra-fase2/Board/app-filtro-errore-1024.png
- .claude/immagini/astra-fase2/Board/app-errore-1024.png

## B5.1 — Memoria, piano prima dell'edit · 05/09/2026

Base: 6ea01e8 unita con lane/harness-desktop 81cc5cc5. Sottosistema TALOS UI. Originale ispezionato e screenshot APERTO: Gestisci capability → Memory, lista vuota globale. Pagina statica ispezionata e screenshot APERTO: quattro righe fittizie, «7 ricordi / 3 strati» e Correggi senza rotta.

Premesse false registrate PRIMA dell'implementazione: GET /sessions/5b30b23d-008f-479f-a078-7b4aea6fbe37/memory → {memorie:[],errore:null}; /notes → {note:[],errore:null}. memory-store.mjs: GENERI = preference/project_fact/procedure/policy_note; record {id,titolo,contenuto,genere,creataAlle,aggiornataAlle}. Scope globale. Nessun contatore d'uso, tre strati o rotta HTTP di modifica manuale. Si applica l'ordine owner successivo: azioni senza rotta hidden data-richiede=fase3; nessun backend nuovo e nessun dato inventato. La variante funzionante del mockup avrà i quattro generi reali e il contenuto originale; strati/uso/Correggi richiedono fase 3. Il link al deposito deve chiamarsi .memory-store, non .harness-ui-memory.

Ricerca 05/09/2026: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/list_role (12/05/2025, documento stabile riletto); https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/; https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html (nessuna data di aggiornamento verificabile in questi ultimi due). Adattare i ruoli list/listitem al markup approvato; pulsante nativo con aria-expanded per leggere tutto il contenuto; stato/errori senza spostare focus. Non si spaccia questa verifica per una novità mensile. Il vecchio testo è troncato a 80 caratteri: target +1 verificabile = anteprima conservata + lettura integrale senza un modello, filtri reali per genere e ricerca su titolo/contenuto, nessun falso numero.

File da modificare/creare, nessuna cancellazione:
- .claude/MOCKUP-REDESIGN-TALOS-2026-09-04.html
- .claude/LEDGER-ASTRA-FASE-2-2026-09-05.md
- .claude/CONSEGNA-ASTRA-FASE-2-2026-09-05.md
- harness-ui/frontend/src/components/memoria.js
- harness-ui/frontend/lab/fixtures/memoria.js
- harness-ui/frontend/lab/main.js
- harness-ui/frontend/tests/unit/memoria.test.mjs
- harness-ui/frontend/tests/parity/componenti.spec.mjs
- harness-ui/frontend/tests/parity/memoria-vivo.spec.mjs
- harness-ui/frontend/playwright.astra.config.mjs
- harness-ui/frontend/src/legacy/app.js (rigaMemoria, caricaPannelloMemoria, un'attivazione della SOLA pagina memoria in setView, stato/generazione Memoria)
- harness-ui/frontend/index.template.html (generato)
- harness-ui/frontend/src/styles/index.css (generato)

Simboli nuovi: genereMemoria, testiMemoria, filtraMemorie, creaMemoryRow, aggiornaPaginaMemoria. Nessuna modifica a rigaNota in questo componente: l'instradamento delle Note rimane da collegare in B5/B4, il pannello originale rimane accessibile e intatto. Le funzioni della chat/Sidebar/Review, il ponte, public e le 7 chiavi/23 eventi/19 endpoint congelati restano invariati. Nessuno store globale sarà scritto per costruire una prova.

RED: MEMORIA-GENERI, MEMORIA-TESTO-INTEGRO, MEMORIA-RICERCA (query su contenuto completo, ignoto non diventa preferenza); import assente. Poi parità MemoryRow, innesto, API vuota reale 4177/4179, errore e recupero, fixture HTTP esplicitamente sintetica per dettaglio/filtro/cambio sessione durante fetch. GREEN: unità mirate, componenti, test:lab, verify (con debito CSS B3 già registrato), test vivo Memoria. Rollback: revert del solo commit, nessuna scrittura persistente.

Cosa deve fare l'owner: nessuna preparazione. Cosa fai tu dopo: rendere il componente, provare e commit. Cosa rimane: altri componenti B5, B4/B6/B2/B7/B1/B8, rotte e metadati sopra per fase 3, OAuth e piano computer-use.


B5.1 prima dell’innesto, 05/09/2026: unità 3/3 e parità MemoryRow 3/3; aperte tutte le sei immagini (tre mockup e tre componente). Una sola variante CSS per espandere testo/titolo, zero token e zero blocchi nuovi. Per isolare pagina e vecchio foglio si usa il parametro privato pagina e una WeakMap generazioniMemoria per mount; rigaNota e tutto il resto del foglio restano intatti.

B5.1 manifest esplicito prima delle catture:
- .claude/immagini/astra-fase2/MemoryRow/mockup-1440.png
- .claude/immagini/astra-fase2/MemoryRow/componente-1440.png
- .claude/immagini/astra-fase2/MemoryRow/app-vuota-1440.png
- .claude/immagini/astra-fase2/MemoryRow/originale-vuota-1440.png
- .claude/immagini/astra-fase2/MemoryRow/fixture-lettura-1440.png
- .claude/immagini/astra-fase2/MemoryRow/fixture-filtro-vuoto-1440.png
- .claude/immagini/astra-fase2/MemoryRow/app-errore-1440.png
- .claude/immagini/astra-fase2/MemoryRow/mockup-1280.png
- .claude/immagini/astra-fase2/MemoryRow/componente-1280.png
- .claude/immagini/astra-fase2/MemoryRow/app-vuota-1280.png
- .claude/immagini/astra-fase2/MemoryRow/originale-vuota-1280.png
- .claude/immagini/astra-fase2/MemoryRow/fixture-lettura-1280.png
- .claude/immagini/astra-fase2/MemoryRow/fixture-filtro-vuoto-1280.png
- .claude/immagini/astra-fase2/MemoryRow/app-errore-1280.png
- .claude/immagini/astra-fase2/MemoryRow/mockup-1024.png
- .claude/immagini/astra-fase2/MemoryRow/componente-1024.png
- .claude/immagini/astra-fase2/MemoryRow/app-vuota-1024.png
- .claude/immagini/astra-fase2/MemoryRow/originale-vuota-1024.png
- .claude/immagini/astra-fase2/MemoryRow/fixture-lettura-1024.png
- .claude/immagini/astra-fase2/MemoryRow/fixture-filtro-vuoto-1024.png
- .claude/immagini/astra-fase2/MemoryRow/app-errore-1024.png
Le immagini fixture-* mostrano dati HTTP sintetici, non memorie presenti nel deposito. App-vuota e originale-vuota usano la rotta vera, senza intercettazione.

### B5.1 — correzione della prova, 05/09/2026
Fonte riverificata prima dell’edit: https://playwright.dev/docs/actionability e https://playwright.dev/docs/api/class-response#response-finished (documentazione stabile, senza data di modifica dichiarata). Pin locale Playwright 1.62.1. Adotto click con controlli di raggiungibilità, senza force, e attesa esplicita della risposta completata. Il test MEMORIA-REALE falliva a 1024 perché il pannello originale era fuori viewport: prima si apre .desktop-context-toggle, già presente nel codice originale e nelle prove A6. MEMORIA-RECUPERO deve attendere la risposta obsoleta completata prima dell’asserzione, con rilascio in finally. Solo tests/parity/memoria-vivo.spec.mjs; nessun cambiamento del prodotto.

### B5.1 — numero sconosciuto diverso da zero · 05/09/2026
Rilevato guardando app-errore alle tre larghezze: il messaggio di errore è corretto, ma il percorso nella testata mostra ancora 0 ricordi quando la lettura fallisce. Ricerca fresca: WCAG Status Messages, https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html, documento stabile riverificato oggi. Decisione adottata: rappresentare caricamento ed errore esplicitamente, conteggio solo su lettura riuscita. File: src/components/memoria.js (renderMemoria privato), tests/parity/memoria-vivo.spec.mjs (MEMORIA-RECUPERO-NON-ZERO, estensione del caso esistente), ledger e consegna; nessun CSS/contratto/endpoint nuovo. Prima RED a 1440, poi modifica di una assegnazione e GREEN di tutte le prove Memoria.

Confronto documentale compatto prima del fix, finestra 06/08–05/09/2026 (nessun nuovo audit Hermes). Hermes: https://github.com/NousResearch/hermes-agent/releases/tag/v2026.8.31, v0.21.0 commit 29112be, 31/08/2026: continuità/memoria dei cron e protezione dei file istruzione; https://hermes-agent.nousresearch.com/docs/user-guide/features/memory/ documenta depositi distinti e limiti 2200/1375 caratteri. Forza: stato persistente e capacità limitata esplicita; limite: il contenuto va consolidato per entrare nel prompt. Claude Code: https://github.com/anthropics/claude-code/releases/tag/v2.1.261, d7dbd9a, 04/09/2026: motivo della policy non caricata visibile in status/doctor; https://code.claude.com/docs/en/memory: memoria automatica con file tematici, prime 200 righe o 25KB lette all’avvio. Forza: continuità e leggibilità; limite documentato: contenuto oltre soglia non caricato inizialmente. Codex: https://github.com/openai/codex/releases/tag/rust-v0.153.4, 3d2ee51, 04/09/2026, nessuna novità memoria in questa release; https://learn.chatgpt.com/docs/agent-configuration/agents-md: gerarchia esplicita con limite predefinito 32KiB. Forza: istruzioni con scope definito; limite: budget di caricamento finito. Documenti stabili riverificati oggi, data di modifica non verificata; non attribuisco questi limiti alle release citate. Nessun difetto UI dei competitor affermato senza prova. Adatto visibilità dello scope, integrità del testo e motivo di errore al contratto TALOS; rifiuto di importare gli store/protocolli competitor nel componente di sola lettura. +1 misurabile per TALOS su questi aspetti: conteggio solo dopo lettura riuscita, testo intero disponibile e ricercabile senza chiamate modello, dati mancanti distinti da lista vuota. Limiti di prompt/caricamento effettivo del modello restano fuori da B5.1; nessuna superiorità complessiva dichiarata.

RED confermato: MEMORIA-RECUPERO a 1440 attende Ricordi non disponibili e riceve 0 ricordi · globali. Il cancello statico prima del fix è 195/195.

## B5.1 — MemoryRow consegnabile · 05/09/2026

La pagina Memoria usa GET /api/v1/sessions/:id/memory e le righe del mockup. Nello store di confronto non ci sono ricordi: 4177 e 4179 mostrano entrambi il vuoto. Ricerca su titolo e contenuto completo, quattro generi veri, Leggi/Chiudi da tastiera, data di aggiornamento quando presente, errore/ricarico e risposta obsoleta verificati. Correggi resta hidden data-richiede=fase3: nessuna rotta di scrittura inventata.

| Aspetto | Originale desktop | Componente | Evidenza/verdetto |
|---|---|---|---|
| Dati e scope | lista globale nel foglio capability | stessa API e stesso vuoto, genere conservato con nome italiano | app-vuota/originale-vuota a 1440/1280/1024; parità dei dati vuoti |
| Testo | anteprima a 80 caratteri | anteprima + contenuto intero espandibile e data disponibile | MEMORIA-FIXTURE, testo oltre 80 caratteri trovato e letto; beneficio provato con fixture |
| Accesso | aprire il foglio e scorrere alla memoria | voce Memoria, lista dedicata | screenshot aperti; nessuna modifica della sidebar |
| Stato | messaggio nel mount | caricamento, errore distinto da zero, Aggiorna e guardia sulle risposte obsolete | RED numero falso riprodotto e risolto; MEMORIA-RECUPERO 3 viewport |
| Tastiera e forma | righe passive | tab con frecce/Home/End; Enter/Spazio Leggi/Chiudi; focus visibile | parità struttura/parole/pixel e screenshot lettura aperti |
| Responsive | foglio originale con scorrimento | testo espanso va a capo; a 1024 Aggiorna si dispone sotto i filtri ed è raggiungibile | 21 immagini aperte, nessun taglio del contenuto espanso |
| Persistenza | deposito globale sul disco | sola lettura, ricarico rilegge il deposito | niente richieste di scrittura nella prova; filtri temporanei, non impostazioni persistenti |

Blocchi riusati: MemoryRow, MemoryList, FilterChips, Field, Button, Badge, PageHeader, WhereOnDisk e sprite esistente. Blocchi nuovi 0, token nuovi 0; una sola regola CSS scoped alla riga espansa, definita nel mockup e rigenerata. Il codice mobile MemoryScreen.vue conferma ricerca su titolo/contenuto e quattro generi; i suoi scope/CRUD/stato non sono disponibili nell’endpoint desktop e non vengono simulati.

Cancelli: unità Memoria 3/3; componenti completi 30/30, MemoryRow ripetuto dopo il fix 3/3; live Board+Memoria 21/21, Memoria ripetuta dopo il fix 9/9; statico 195/195; build 30 asset e determinismo verde. verify rimane ROSSO per il solo PHASE3-TOKEN-CONTRACT-01 preesistente (326/327 unità/contratti): index.css generato contiene colori già nella base 81cc5cc5; nessun bypass del test. Ultimo fix cambia solo la testata in caricamento/errore, non il mockup statico. Tutti i 21 PNG del manifesto sono stati aperti; i tre errori sono stati riaperti dopo il fix. Dati fixture separati dai risultati reali.

Richieste a Claude: allineare contratto CSS e generazione canonica; collegamento Note assente (decisione C2, NavItem data-conteggio=note senza data-vaia, nessuno schermoNote nel mockup e nessuna mappa nel ponte). Per §9 non invento una rotta o una pagina e non tocco sidebar/ponte. rigaNota resta da estrarre quando il contenitore è definito. C22/C23 richiedono API per strati, ultima lettura e modifica; non certificati da questa pagina.

Non verificato: lettura di memorie realmente scritte da un modello, chat multi-turn, screen reader su dispositivo, volumi superiori alle quattro fixture, CRUD e uso effettivo nel prompt. TALOS_OWNER_RUNTIME_MODULE assente: nessuna prova modello dichiarata.

**Cosa deve fare l’owner:** aprire http://127.0.0.1:4177 → Memoria e valutare gli screenshot.
**Cosa fai tu dopo:** TaskRow/Attività, prossimo componente B5.
**Cosa rimane:** Note e altre pagine B5, B4 → B6 → B2 → B7 → B1 → B8; debito CSS/rotte fase 3; OAuth e piano computer-use.

## B5.2 — TaskRow / Attività · piano prima dell’edit, 05/09/2026

Base 86f108e, merge upstream 81cc5cc5 già aggiornato. Sottosistema TALOS UI. Apertura e screenshot esaminati in browser su 4177 e 4179: il mockup dichiara quattro aperte/undici fatte e autori fittizi; API vera /api/v1/sessions/5b30b23d-008f-479f-a078-7b4aea6fbe37/tasks → {attivita:[],errore:null}, /children → {figli:[]}. Originale Tasks vuoto nel foglio capability.

Premesse false §9: tasks-store.mjs espone {id,titolo,descrizione,priorita,stato,creataAlle,aggiornataAlle}; tre stati todo/doing/done, tre priorità low/normal/high; nessun autore, giro, commit, rimando, scadenza o rotta HTTP di creazione/completamento. http-app.mjs tasksMatch delega solo elencaAttivita. Non inferire autore da stato/sessione; indicarlo come non registrato. Mie/Dell’agente, checkbox di completamento e Nuova attività restano hidden data-richiede=fase3. Nessuna nuova rotta/backend. rigaFiglio appartiene al foglio Albero sessione via /children, contratto diverso da Task: si preserva e si estrae con l’albero in B2/B7, senza spacciare una delega per attività globale.

Fonte mobile letta: mobile/src/screens/TasksScreen.vue e tasks-store.mjs: elenco default, ricerca su titolo/descrizione, filtri all/todo/doing/done e priorità visibile. Si adatta questo modello al markup TaskRow approvato. Nessuna griglia/CRUD/pianificazione introdotta senza rotta. Originale conserva tutta la descrizione nel DOM ma la riga compatta può troncarla; la variante mette Leggi/Chiudi, testo espanso senza taglio, priorità sempre leggibile e stato con testo.

Ricerca fresca, finestra 06/08–05/09/2026: WAI Tabs https://www.w3.org/WAI/ARIA/apg/patterns/tabs/ e Disclosure https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/, stabili riverificati oggi (data aggiornamento non dichiarata); adottare tastiera nativa, aria-selected/expanded e cambio scheda automatico poiché il filtro è locale. Hermes Kanban https://hermes-agent.nousresearch.com/docs/user-guide/features/kanban, lista durabile con stato/assegnatario/filtri: forza tracciabilità, limite un solo assegnatario per attività; non riprodurre il suo dispatch in B5. Claude Code https://code.claude.com/docs/en/interactive-mode#task-list, checklist persistente e richiamabile da tastiera, vista fino a 5 task: forza continuità, limite di esposizione immediata documentato. Codex https://learn.chatgpt.com/docs/features, gestione del lavoro parallelo per progetti: forza contesto del lavoro, nessun limite di una lista CRUD di attività personali verificato (prodotti diversi; non inventarlo). Pin esterni riverificati: Hermes v2026.8.31/29112be del 31/08; Claude v2.1.261/d7dbd9a del 04/09; Codex rust-v0.153.4/3d2ee51 del 04/09, URL tag nei riferimenti B5.1. Le release recenti sono verificate separatamente dalle pagine stabili, non dimostrano novità mensili per queste liste. Nessuna integrazione nuova, contratto desktop esistente adattato. +1 misurabile TALOS per questa estrazione: tutte le righe ricevute accessibili senza richiesta modello, ricerca completa, filtri da tastiera, priorità/stato espliciti, autore sconosciuto dichiarato, nessuna lista vuota in caso d’errore. Confronto di superiorità generale non eseguito.

File esatti, nessuna cancellazione:
- .claude/LEDGER-ASTRA-FASE-2-2026-09-05.md
- .claude/CONSEGNA-ASTRA-FASE-2-2026-09-05.md
- .claude/MOCKUP-REDESIGN-TALOS-2026-09-04.html
- harness-ui/frontend/src/components/attivita.js
- harness-ui/frontend/lab/fixtures/attivita.js
- harness-ui/frontend/lab/main.js
- harness-ui/frontend/tests/unit/attivita.test.mjs
- harness-ui/frontend/tests/parity/componenti.spec.mjs
- harness-ui/frontend/tests/parity/attivita-vivo.spec.mjs
- harness-ui/frontend/playwright.astra.config.mjs
- harness-ui/frontend/src/legacy/app.js
- harness-ui/frontend/index.template.html
- harness-ui/frontend/src/styles/index.css
- .claude/immagini/astra-fase2/TaskRow/mockup-1440.png
- .claude/immagini/astra-fase2/TaskRow/componente-1440.png
- .claude/immagini/astra-fase2/TaskRow/app-vuota-1440.png
- .claude/immagini/astra-fase2/TaskRow/originale-vuota-1440.png
- .claude/immagini/astra-fase2/TaskRow/fixture-lettura-1440.png
- .claude/immagini/astra-fase2/TaskRow/fixture-filtro-vuoto-1440.png
- .claude/immagini/astra-fase2/TaskRow/app-errore-1440.png
- .claude/immagini/astra-fase2/TaskRow/mockup-1280.png
- .claude/immagini/astra-fase2/TaskRow/componente-1280.png
- .claude/immagini/astra-fase2/TaskRow/app-vuota-1280.png
- .claude/immagini/astra-fase2/TaskRow/originale-vuota-1280.png
- .claude/immagini/astra-fase2/TaskRow/fixture-lettura-1280.png
- .claude/immagini/astra-fase2/TaskRow/fixture-filtro-vuoto-1280.png
- .claude/immagini/astra-fase2/TaskRow/app-errore-1280.png
- .claude/immagini/astra-fase2/TaskRow/mockup-1024.png
- .claude/immagini/astra-fase2/TaskRow/componente-1024.png
- .claude/immagini/astra-fase2/TaskRow/app-vuota-1024.png
- .claude/immagini/astra-fase2/TaskRow/originale-vuota-1024.png
- .claude/immagini/astra-fase2/TaskRow/fixture-lettura-1024.png
- .claude/immagini/astra-fase2/TaskRow/fixture-filtro-vuoto-1024.png
- .claude/immagini/astra-fase2/TaskRow/app-errore-1024.png

Export nuovi: statoAttivita, prioritaAttivita, testiAttivita, riepilogoAttivita, filtraAttivita, creaTaskRow, aggiornaPaginaAttivita. Innesto solo rigaAttivita, caricaPannelloAttivita, generazioniAttivita privato e attivazione della pagina in setView; compatibilità delle chiamate originali senza argomenti. Nuova singola variante CSS TaskRow espansa dentro il mockup, nessun token.

RED unità ATTIVITA-STATO-IGNOTO, ATTIVITA-PRIORITA, ATTIVITA-TESTO, ATTIVITA-FILTRI, ATTIVITA-CONTEGGIO; import assente. Poi parità TaskRow a 1440/1280/1024, apertura delle sei immagini, innesto; test live ATTIVITA-REALE (vuoto/reload/confronto originale), ATTIVITA-FIXTURE (4 dati sintetici, tre stati, ricerca completa, tastiera, zero scritture), ATTIVITA-RECUPERO (503, payload non valido, retry, risposta obsoleta). Build, unità, test:lab, verify con debito CSS preesistente, componenti e prova live. Store copiato senza scritture; nessun giro modello dichiarato. Rollback: revert del singolo commit, nessuna migrazione o dato scritto.

Owner: nessuna preparazione. Astra: implementa e verifica TaskRow; aggiorna qui e nella consegna. Rimane: Note/altre B5 e richieste di rotte/campi sopra, poi ordine B4→B6→B2→B7→B1→B8.

Precisazione fonti prima del codice: la pagina Claude attuale conferma fino a cinque task, ma la checklist richiede opt-in sui modelli recenti (sezione Task list, righe 643–650 della lettura odierna); non è una funzione sempre attiva. La pagina OpenAI features ora reindirizza alla panoramica ChatGPT Learn: conferma progetti/chat e lavoro lungo, non una specifica lista personale CRUD; nessuna conclusione più forte. RED import assente confermato.

B5.2 taccuino prima della correzione in batch: 5/5 unità e 3/3 parità, sei immagini APERTE. Difetto visto a occhio non rilevato dalla sola parità: il nuovo campo ricerca manca delle classi talos-field__input/talos-field__icon; adotto il blocco esatto già usato in Memoria, nessun CSS nuovo. Fonte fresca https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/search (05/09/2026, ricerca accessibile con nome esplicito). Scenario permanente ATTIVITA-CAMPO-COERENTE: altezza input 36 px e classe del blocco canonico. Rimuovo il data-c WhereOnDisk aggiunto per errore: il footer riusa talos-where senza nuovo blocco. La riga fatta espansa deve restare leggibile a opacità piena; scoped al solo TaskRow aperto, nessun colore nuovo.

RED ATTIVITA-CAMPO-COERENTE confermato: 27px ricevuti contro 36px del blocco approvato. L’icona Da fare diventa i-list (già nello sprite): i-check-sq contiene una spunta e può confondersi con Fatta. Nessuna icona nuova.

### B5.2 · Passaggio all’API dopo parità (05/09/2026)

Merge lane/harness-desktop: già aggiornato a 81cc5cc5. Ricontrollati prima dell’innesto: https://hermes-agent.nousresearch.com/docs/user-guide/features/kanban/ (documento stabile, data editoriale non esposta), https://code.claude.com/docs/en/interactive-mode#task-list (idem), https://github.com/openai/codex/releases/tag/rust-v0.153.4 (04/09/2026, 3d2ee51). Restano valide le decisioni puntuali e i limiti della matrice B5.2: adottare la leggibilità dello stato, adattare filtri/lettura al contratto reale; non simulare autori o assegnazioni che l’API non registra. Nessuna pretesa di superiorità sul Kanban multiagente. Il +1 verificabile sul pannello originale è trovare il testo completo, filtrare lo stato con tastiera e riprovare senza perdere il contesto.

Parità TaskRow 3/3: aperti personalmente tutti i sei PNG corretti di mockup e componente, 1440×900, 1280×800, 1024×800. Campo coerente alto 36 px, comandi raggiungibili, nessun nuovo tipo di blocco/token/icona. Prima dell’innesto eseguo ATTIVITA-REALE: attesa RED sui dati statici ancora presenti nel bundle.

ATTIVITA-REALE RED confermato prima dell’innesto: nel bundle precedente manca [data-task-esito], test fermo sull’attesa «0 attività» (1280×800). Ora innesto soltanto import, setView, caricaPannelloAttivita e rigaAttivita.

## B5.2 · Consegna TaskRow / Attività — 05/09/2026

**Cosa mostra.** Dati GET /api/v1/sessions/:id/tasks: titolo, descrizione integrale, priorità, stato todo/doing/done, aggiornamento. Autore non registrato perché il contratto non lo contiene. Conteggi derivati, filtri per stato e ricerca su titolo/descrizione/priorità/stato. Leggi/Chiudi espande senza cambiare il dato. Stato vuoto globale, caricamento, errore distinguibili; Aggiorna riprova. Risposte obsolete scartate dopo cambio pagina o sessione. Vecchio foglio mantenuto sullo stesso componente.

**Blocchi riusati.** TasksScreen, Topbar, Page, Toolbar, FilterChips, TaskList, TaskRow, campi, badge e pulsanti canonici. Blocchi nuovi: 0. Token aggiunti: 0. Icone aggiunte: 0. Nel CSS canonico solo due regole circoscritte alla lettura espansa: testo a capo e opacità piena dell’attività conclusa. Template e CSS rigenerati. Nessuna nuova dipendenza né chiave di persistenza.

| Aspetto | Originale osservato | Risultato / beneficio verificato | Limite / verdetto |
|---|---|---|---|
| Copertura | Capability → elenco globale con titolo, descrizione, priorità e stato | Stessi campi dell’API, descrizione completa disponibile, data aggiornata in lettura | Creazione/modifica non erano rotte del pannello originale; restano fase 3 |
| Semantica | todo/doing/done e priorità raw | Da fare/In corso/Fatta; fallback espliciti per valori ignoti | Nessun autore, giro o commit inventato |
| Chiarezza/densità | Sezione bassa del foglio Capability, scorrimento necessario | Pagina propria, quattro righe compatte, testo integrale con Leggi | Non sono i figli delegati; rigaFiglio resta per B2/B7 |
| Passi | Aprire Capability e scorrere | Un clic su Attività; ricerca e filtri sul posto | Leggi richiede un clic per il dettaglio esteso, il sommario resta immediato |
| Tastiera | Righe passive | Tab, Home/End e frecce sui filtri; Enter/Spazio su Leggi/Chiudi | Azioni di modifica nascoste, nessun checkbox finto |
| Dimensioni | Originale e proposta aperti alle tre larghezze | 1440/1280/1024: comandi e testo leggibili, campo alto 36 px | Verifica desktop, nessuna certificazione mobile |
| Stato/recupero | Errore nel foglio; riapertura per rileggere | Errore visibile anche nella testata, pulsante Aggiorna; dato invalido non diventa zero | Fixture 503 e risposta ritardata distinte dal backend reale |
| Persistenza/latenza | Dati globali su disco, GET su apertura | Reload rilegge la stessa API; ricerca locale senza scritture o chiamate modello | Filtri temporanei; nessun benchmark prestazionale su grandi volumi |

**Cosa ho guardato.** Originale 4179 e nuova app 4177; 21 PNG aperti, elencati nel piano B5.2, sotto .claude/immagini/astra-fase2/TaskRow: mockup e componente scuri, app vuota/lettura/filtro vuoto/errore e originale vuoto chiari; tre larghezze. Aperta anche la pagina reale scura nel browser dell’app. Corretto il campo ricerca inizialmente senza classi del mockup: scenario permanente ATTIVITA-CAMPO-COERENTE, RED 27 px → GREEN 36 px. Corretta l’icona Da fare e l’opacità della lettura delle attività concluse.

**Prove.** Unità Task 5/5; Attività dal vivo 9/9 (backend reale vuoto, fixture quattro record, tastiera, filtro sul testo oltre l’anteprima, nessuna scrittura, 503, payload [null], riprova e risposta obsoleta). Statico npx playwright test --config=playwright.lab.config.mjs: 195/195. Build deterministica: 30 file. npm run verify: **331/332**, unico fallimento preesistente PHASE3-TOKEN-CONTRACT-01 sui colori raw del CSS generato, riprodotto già su 81cc5cc5; nessun aggiramento. Log locale: C:/Users/Antonino/AppData/Local/Temp/astra-task-verify.log. Gate generale NON dichiarato verde.

**Confini.** Nessuna modifica a chat, review, sidebar, testata della chat, bridge, frammenti, backend o store. Azioni Nuova attività/Mie/Dell’agente/Segna come fatta nascoste con data-richiede="fase3". Il runtime agente non è configurato su questa istanza: sono prove UI/API, non accettazione conversazionale o esecuzione del modello. Note richiede ancora il contenitore e il canale dedicati (§9 già registrato).

**Cosa deve fare l’owner:** può provare Attività su http://127.0.0.1:4177; nessuna operazione necessaria per proseguire. **Cosa fai tu dopo:** Libreria, poi Ricerca/Officina/Automazioni (resto B5). **Cosa rimane:** Note, B4 → B6 → B2 → B7 → B1 → B8; allineamento del contratto CSS condiviso da Claude; OAuth e piano computer-use dopo le schermate.

Chiusura dei componenti: npx playwright test --config=playwright.componenti.config.mjs, porta laboratorio 4178, **33/33**. TaskRow 3/3, incluso controllo permanente del campo a 36 px.

## B5.3 · Piano esecutivo LibraryRow / Libreria — 05/09/2026

Ricerca prima dell’edit; finestra 06/08–05/09/2026. Merge lane/harness-desktop aggiornato a 81cc5cc5, base locale dopo TaskRow 9bc1fad. Sottosistema TALOS UI, endpoint/backend invariati.

| Fonte esatta | Versione/data e forza osservata | Limite documentato / decisione / +1 verificabile |
|---|---|---|
| https://hermes-agent.nousresearch.com/docs/user-guide/features/document-extraction | Verificata oggi, data editoriale non esposta. Estrazione multi-formato, output paginato, avvisi copertura delle scansioni | PDF senza testo richiede OCR; controllo copertura assente senza Poppler, limite 50 MB. Adattare principio: elenco non equivale a contenuto letto. In questa UI nessun token o copertura inventati; estrazione/OCR fuori contratto B5.3, nessuna superiorità dichiarata |
| https://github.com/NousResearch/hermes-agent/releases/tag/v2026.8.31 | 31/08, v0.21.0, 29112be: document-to-action-items fra le skill, gestione file reale | Non prova un archivio equivalente alla nostra Libreria. Adattare provenienza persistita, rifiutare pipeline simulata |
| https://code.claude.com/docs/en/desktop | Verificata oggi, data editoriale non esposta: allegati immagini/PDF/file e @mention | @mention non disponibile cloud/WSL. Adattare chiarezza del contesto: dichiarare ambito progetto, distinguere elencato/in contesto; test assenza badge Sempre e token finti |
| https://github.com/anthropics/claude-code/releases/tag/v2.1.261 | 04/09, d7dbd9a: errore policy visibile | Nessuna nuova API Libreria equivalente verificata in questa release. Adottare errore distinto da vuoto e riprova visibile |
| https://learn.chatgpt.com/docs/codex/ide | Verificata oggi (redirect da developers.openai.com/codex/ide/features): file aperti e selezioni nel composer | Superficie IDE, non prova un archivio con provenienza. Il +1 locale richiesto è trovare nome completo/provenienza e data senza aprire il file. Gap: non attribuire a Codex mancanze d’archiviazione non provate |
| https://github.com/openai/codex/releases/tag/rust-v0.153.4 | 04/09, 3d2ee51, release verificata oggi | Nessuna novità LibraryRow rivendicata. Tentativo lettura sorgente tools/handlers/read_file.rs non riuscito: non usato come prova |
| https://www.w3.org/WAI/ARIA/apg/patterns/tabs/ | Documento stabile ricontrollato oggi | Adottare tastiera roving, frecce/Home/End; ricerca locale sul nome, tipo, provenienza. Un filtro vuoto non simula un archivio vuoto |

**Originale ispezionato.** Aperto screenshot della pagina mockup 4177 con conteggi/costi statici, e del foglio originale 4179 con Libreria vuota, 1280×720. API reale restituisce {voci:[],errore:null}. Letti caricaPannelloLibreria/rigaVoceLibreria, http-app.mjs e session-registry.mjs elencaLibreria: OGNI voce espone solo id/nome/fileType/origine/aggiornatoIl. Letti library-store.mjs e library-policy-store.mjs interi. Il modello possiede strumenti lettura/mutazione/policy, ma la UI HTTP possiede soltanto GET elenco. Il backend supporta solo agentic_on_demand_v1; policy e contenuto non sono nel payload della pagina. Quindi non dedurre costo token, righe, sessioni d’uso, autore, Sempre o inclusione effettiva. Mobile ha viewer dedicati; nessuna rotta desktop equivalente verificata.

**Decisioni prima di scrivere.** Copiare i blocchi canonici; rendere i metadata reali, filtri Tutti/Caricati/Generati e ricerca esplicitamente per nome/tipo/provenienza. Dettagli/Chiudi rende nome lungo e aggiornamento completo; non apre il contenuto. Aggiungi documento, Apri contenuto, Sempre, A richiesta e costo corrente nascosti data-richiede=fase3. Nessun pacchetto nuovo: adattatore UI sul contratto AVM esistente. +1 sull’originale: un clic dalla sidebar, ricerca e provenienza verificabile, dettagli non troncati, errore/riprova. Target, non promessa di superiorità ai concorrenti.

**File esatti:**
- .claude/LEDGER-ASTRA-FASE-2-2026-09-05.md
- .claude/CONSEGNA-ASTRA-FASE-2-2026-09-05.md
- .claude/MOCKUP-REDESIGN-TALOS-2026-09-04.html
- harness-ui/frontend/src/components/libreria.js
- harness-ui/frontend/lab/fixtures/libreria.js
- harness-ui/frontend/lab/main.js
- harness-ui/frontend/tests/unit/libreria.test.mjs
- harness-ui/frontend/tests/parity/componenti.spec.mjs
- harness-ui/frontend/tests/parity/libreria-vivo.spec.mjs
- harness-ui/frontend/playwright.astra.config.mjs
- harness-ui/frontend/src/legacy/app.js
- harness-ui/frontend/index.template.html
- harness-ui/frontend/src/styles/index.css

**Immagini previste, tutte da aprire:**
- .claude/immagini/astra-fase2/LibraryRow/mockup-1440.png
- .claude/immagini/astra-fase2/LibraryRow/componente-1440.png
- .claude/immagini/astra-fase2/LibraryRow/app-vuota-1440.png
- .claude/immagini/astra-fase2/LibraryRow/originale-vuota-1440.png
- .claude/immagini/astra-fase2/LibraryRow/fixture-dettagli-1440.png
- .claude/immagini/astra-fase2/LibraryRow/fixture-filtro-vuoto-1440.png
- .claude/immagini/astra-fase2/LibraryRow/app-errore-1440.png
- .claude/immagini/astra-fase2/LibraryRow/mockup-1280.png
- .claude/immagini/astra-fase2/LibraryRow/componente-1280.png
- .claude/immagini/astra-fase2/LibraryRow/app-vuota-1280.png
- .claude/immagini/astra-fase2/LibraryRow/originale-vuota-1280.png
- .claude/immagini/astra-fase2/LibraryRow/fixture-dettagli-1280.png
- .claude/immagini/astra-fase2/LibraryRow/fixture-filtro-vuoto-1280.png
- .claude/immagini/astra-fase2/LibraryRow/app-errore-1280.png
- .claude/immagini/astra-fase2/LibraryRow/mockup-1024.png
- .claude/immagini/astra-fase2/LibraryRow/componente-1024.png
- .claude/immagini/astra-fase2/LibraryRow/app-vuota-1024.png
- .claude/immagini/astra-fase2/LibraryRow/originale-vuota-1024.png
- .claude/immagini/astra-fase2/LibraryRow/fixture-dettagli-1024.png
- .claude/immagini/astra-fase2/LibraryRow/fixture-filtro-vuoto-1024.png
- .claude/immagini/astra-fase2/LibraryRow/app-errore-1024.png

**Simboli.** Nuovi esportati tipoVoceLibreria, origineVoceLibreria, testiVoceLibreria, filtraLibreria, creaLibraryRow, aggiornaPaginaLibreria; privati el, renderLibreria, PAGINE. Compatibilità caricaPannelloLibreria({pagina=false}={}), rigaVoceLibreria(voce) mantenuta; solo import e ramo setView libreria aggiunti al monolite. Validazione array/oggetti, generazione per mount/sessione, demo isolata come Memoria/Attività.

**RED/GREEN.** LIBRERIA-TIPO, LIBRERIA-ORIGINE-IGNOTA, LIBRERIA-METADATI, LIBRERIA-FILTRO: prima modulo assente, poi node --test tests/unit/libreria.test.mjs. Parità componente prima dell’innesto. Reale: vuoto e reload; fixture quattro record in schema API, tastiera e dettaglio, nessuna scrittura; 503/payload invalido/riprova e risposta obsoleta. Cancellli statico 195 e componenti, npm run verify (fallimento preesistente CSS esplicitamente atteso), verify-build e git diff --check. Prova umana: aprire screenshot equivalenti e pagina in app. Runtime assente: non è una prova modello. Rollback: ripristino dei soli file della consegna via commit inverso, nessuno store modificato.

RED unità confermato: modulo libreria.js assente. Sprite verificato: i-image non esiste nel mockup; riuso i-files per immagini con etichetta visibile «Immagine», i-doc per documenti. Nessuna nuova icona.

### B5.3 · Correzione dalla visione dei PNG

Ho aperto i tre mockup: i-files disegna una cartella, quindi peggiora il riconoscimento delle immagini rispetto all’originale. Respinta questa scelta prima dell’innesto. Ricerca rinnovata 05/09: https://www.w3.org/WAI/tutorials/images/functional/ (aggiornato 12/04/2017, ricontrollato oggi), e le tre pagine Hermes Document Extraction / Claude Desktop / Codex IDE della matrice. Decisione: riusare ESATTAMENTE i-image da public/index.html:47, nello sprite canonico esistente. Simbolo nuovo nel mockup: 1, importato dall’originale; token 0. La semantica resta anche testuale con «Immagine», SVG decorativo aria-hidden. Scenario permanente LIBRERIA-ICONA-IMMAGINE RED atteso files ≠ image.

Parità LibraryRow corretta 3/3; aperti tutti i sei PNG finali, 1440/1280/1024. Icona immagine ripristinata. Per la copertura della provenienza aggiungo tre confronti originali popolati con le stesse fixture API, nessuna scrittura sul disco:
- .claude/immagini/astra-fase2/LibraryRow/originale-fixture-1440.png
- .claude/immagini/astra-fase2/LibraryRow/originale-fixture-1280.png
- .claude/immagini/astra-fase2/LibraryRow/originale-fixture-1024.png

LIBRERIA-REALE RED confermato sul bundle senza innesto: [data-library-esito] assente. Prima dell’innesto restano le fonti appena riaperte (Hermes Document Extraction, Claude Desktop, Codex IDE, WAI), 05/09. Pagina e vecchio foglio conservano endpoint e sessione; nessun contenuto o policy letti implicitamente.

## B5.3 · Consegna LibraryRow / Libreria — 05/09/2026

**Cosa mostra.** Nome, tipo, provenienza e aggiornamento da GET /api/v1/sessions/:id/library. Filtri Tutti/Caricati/Generati, ricerca sui metadata, Dettagli/Chiudi per nome lungo e data completa. Ambito progetto esplicito. La pagina distingue elenco vuoto, filtro senza risultati, caricamento ed errore; Aggiorna riprova. Le risposte obsolete non sostituiscono quelle nuove.

**Blocchi riusati.** LibraryScreen, Topbar, Page, Toolbar, FilterChips, LibraryList, LibraryRow, campi/pulsanti/badge. Nessun tipo di blocco nuovo, nessun token di design o dipendenza nuova. Una regola CSS canonica circoscritta al testo espanso. Un simbolo aggiunto allo stesso sprite: i-image copiato dall’originale public/index.html:47. Il tentativo con i-files è stato respinto dopo apertura degli screenshot perché mostrava una cartella; scenario permanente LIBRERIA-ICONA-IMMAGINE, RED files → GREEN image.

| Aspetto | Originale osservato | Proposta / beneficio | Limite e verdetto |
|---|---|---|---|
| Copertura | Elenco in Capability, nome/tipo/origine | Stessi file e metadata, aggiornamento reso visibile | Nessuna lettura contenuto né mutazione HTTP prevista dall’originale |
| Semantica | document/image raw, provenienza ripetuta | Documento/Immagine, Caricato/Generato; valori ignoti espliciti | Nessun costo, autore o uso in sessioni inventato |
| Clarity/densità | Sezione sotto altri quattro elenchi | Pagina raggiungibile dalla sidebar, ricerca e filtri nello stesso spazio | Un clic per nome esteso nei casi che eccedono la riga |
| Tastiera | Righe passive | Frecce/Home/End sui filtri; Enter/Spazio sui dettagli; focus visibile | Modifica/caricamento/Apri nascosti con data-richiede=fase3 |
| Responsive | Originale vuoto e popolato alle tre larghezze | 1440/1280/1024: controlli raggiungibili, nome lungo a capo in dettaglio | Verifica desktop, nessuna certificazione mobile |
| Errori/recupero | Errore nel foglio Capability | Testata e messaggio coerenti, riprova senza riaprire, payload invalido segnalato | Un errore non è convertito in archivio vuoto |
| Contesto/persistenza | Elenco metadata per progetto | Reload legge ancora lo stesso endpoint; nessuna scrittura | L’API non espone policy: elenco ≠ nel contesto. Filtri temporanei |
| Prestazioni | Caricamento dei metadata senza contenuto | Ricerca locale senza chiamate al modello o lettura implicita del file | Non misurato su volumi grandi; nessuna superiorità prestazionale dichiarata |

**Cosa ho guardato.** Tutti i 24 PNG finali sotto .claude/immagini/astra-fase2/LibraryRow, percorsi esatti nel piano: sei parità mockup/componente scuri, diciotto app/originale chiari. Originale e nuova app usano gli stessi quattro record sintetici nel confronto popolato; vuoto e reload usano il backend reale senza fixture. Nessun file dei progetti creato o modificato. Il pannello originale non consentiva apertura/aggiunta dalla propria API. Il modello mantiene i suoi strumenti e la policy backend; qui non li simulo.

**Verifiche.** Unità Libreria 5/5. Prove reali/intercettate Libreria 9/9: vuoto/reload, provenienza, nome completo, icona immagine, tastiera, nessuna scrittura, 503, payload invalido, riprova e risposta obsoleta. npm run test:lab **195/195**. Build deterministica **30 file**. npm run verify **336/337**, unico fallimento preesistente PHASE3-TOKEN-CONTRACT-01 sui colori raw del CSS generato: gate generale ancora rosso, nessun bypass. Log in C:/Users/Antonino/AppData/Local/Temp/astra-library-verify.log.

**Cosa deve fare l’owner:** può provare Libreria su http://127.0.0.1:4177; nessuna azione necessaria per proseguire. **Cosa fai tu dopo:** Ricerca, Officina e Automazioni. **Cosa rimane:** Note, resto della parte B, contratto CSS condiviso; integrazioni OAuth e piano computer-use dopo le schermate. Il runtime agente è assente: questa consegna non certifica chat o strumenti con un modello reale.

Chiusura componenti B5.3: npx playwright test --config=playwright.componenti.config.mjs, porta 4178, **36/36**. git diff --check pulito.


## B5.4 — ReportRow / Ricerca — piano esecutivo 05/09/2026 (prima degli edit)
Sottosistema TALOS UI. Base d6b2b99d; merge lane/harness-desktop eseguito, già aggiornato a 81cc5cc5. Nessuna modifica alle superfici di Claude, al ponte, a public/ o al backend.

Ricerca fresca: finestra 06/08–05/09/2026. Release aperte oggi: Hermes v0.21.0/tag v2026.8.31, 29112be, 31/08 (https://github.com/NousResearch/hermes-agent/releases/tag/v2026.8.31); Claude Code v2.1.261, d7dbd9a, 04/09 (https://github.com/anthropics/claude-code/releases/tag/v2.1.261); Codex rust-v0.153.4, 3d2ee51, 04/09 (https://github.com/openai/codex/releases/tag/rust-v0.153.4). Le date di release NON datano automaticamente i comportamenti delle documentazioni seguenti; documenti stabili, data di aggiornamento non esposta, riverificati oggi.

| Fonte ispezionata | Forza e limite documentato | Decisione e +1 TALOS da provare |
|---|---|---|
| Hermes Grounded Citations 1.1.0, MIT — https://hermes-agent.nousresearch.com/docs/user-guide/skills/bundled/research/research-grounded-citations | Lega le citazioni a URL e citazioni verificabili; richiede evidenze recuperate, non dimostra da solo correttezza del rapporto. Non eseguito qui. | Adattare il principio: nessun numero di fonti o giudizio inventato. +1 mirato: elenco persistito per progetto con stati e filtri; RICERCA-SEMANTICA impedisce di confondere conclusione e verifica delle fonti. Nessuna superiorità sulla qualità delle ricerche dichiarata. |
| Claude Code Tools reference, WebSearch — https://code.claude.com/docs/en/tools-reference#websearch-tool-behavior | Titoli/URL, filtri dominio e retry; leggere il contenuto richiede WebFetch. Limite per sessione 200 richieste; notifica del raggiungimento non visibile all'utente. | Adattare distinzione esito/contenuto. +1 obiettivo osservabile: stato interrotto/errore, limiti e recupero visibili nell'elenco. RICERCA-RECUPERO prova 503, payload errato e retry. Backend TALOS non espone fonte, contenuto o contatore: niente false capacità. |
| Codex Web search — https://learn.chatgpt.com/docs/web-search; config — https://learn.chatgpt.com/docs/config-file/config-advanced | Traccia le ricerche e distingue indice/live; custom provider richiede endpoint/modello/runtime compatibili, il solo flag non abilita ricerca. | Adattare trasparenza dello stato: titolo, avvio completo e cinque stati reali ricercabili. +1 obiettivo: archivio trasversale del progetto filtrabile senza scorrere trascrizioni. Non si deduce che Codex non abbia un archivio equivalente: non verificato. |
| WAI APG Tabs e Disclosure — https://www.w3.org/WAI/ARIA/apg/patterns/tabs/ ; https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/ | Tastiera/roving tabindex e pulsante nativo aria-expanded; non sostituiscono verifica del layout o screen reader. | Adottare, senza dipendenze nuove. Enter/Space e frecce/Home/End, campo canonico 36px, titolo intero. |

Ispezione locale: schermoRicerca (5 righe statiche ma testata 6 rapporti, fonti/verdetti dimostrativi); caricaPannelloRicerca/rigaRicerca originali (GET, titolo, data ISO troncata, stato grezzo, nessuna azione); session-registry.elencaRicerche; research-orchestrator.elenca/statoVivo/leggi; research-store.elencaRicerche; HTTP GET /api/v1/sessions/:id/research. Dati reali letti: ricerche:[], errore:null. Schema righe ESATTO: id, titolo, stato, avviataAlle. Ambito progetto. Stati running/paused/done/cancelled/failed. Nessun totale nell'HTTP; page_size richiesto 50 ma orchestratore limita a 20 e registry scarta totale. Elenco ordinato per avvio decrescente. Il report completo esiste nel confine degli attrezzi modello, non in una rotta UI: Apri rapporto e Nuova ricerca restano hidden data-richiede=fase3. Nessun contatore fonti, giudizio qualità, durata o ripresa inventati.
Gap preesistente: research-store converte errori di lettura directory in [] e ignora JSON corrotti. La UI non può diagnosticare un errore che il backend omette; richiesta di Fase 3, non coperta da una falsa promessa di recupero. Endpoint senza paginazione: mostrare esplicitamente massimo 20 ricerche recenti, conteggio delle sole voci elencate. Non introdurre una rotta o navigazione alla chat per un id non verificato.

Confronto iniziale effettuato NEL browser: originale 4179 Capability hub, sezione Deep Research vuota, scroll profondo e testo tenue; mockup 4177 pagina Ricerca, dati dimostrativi. Entrambe le immagini 1280x720 catturate e APERTE. Target: preservare quattro campi, migliorare consultazione con ricerca nel titolo/stato, filtri e data completa; parità di struttura/parole/pixel col mockup aggiornato prima dell'innesto. Nessuna promessa di riapertura rapporto già funzionante: l'originale non aveva tale azione.

File da creare/modificare (nessuna cancellazione):
- .claude/LEDGER-ASTRA-FASE-2-2026-09-05.md
- .claude/CONSEGNA-ASTRA-FASE-2-2026-09-05.md
- .claude/MOCKUP-REDESIGN-TALOS-2026-09-04.html
- harness-ui/frontend/src/components/ricerca.js
- harness-ui/frontend/lab/fixtures/ricerca.js
- harness-ui/frontend/lab/main.js
- harness-ui/frontend/tests/unit/ricerca.test.mjs
- harness-ui/frontend/tests/parity/componenti.spec.mjs
- harness-ui/frontend/tests/parity/ricerca-vivo.spec.mjs
- harness-ui/frontend/playwright.astra.config.mjs
- harness-ui/frontend/src/legacy/app.js
- harness-ui/frontend/index.template.html
- harness-ui/frontend/src/styles/index.css
Immagini esatte da creare:
- .claude/immagini/astra-fase2/ReportRow/mockup-1440.png
- .claude/immagini/astra-fase2/ReportRow/componente-1440.png
- .claude/immagini/astra-fase2/ReportRow/app-vuota-1440.png
- .claude/immagini/astra-fase2/ReportRow/originale-vuota-1440.png
- .claude/immagini/astra-fase2/ReportRow/fixture-dettagli-1440.png
- .claude/immagini/astra-fase2/ReportRow/fixture-filtro-vuoto-1440.png
- .claude/immagini/astra-fase2/ReportRow/app-errore-1440.png
- .claude/immagini/astra-fase2/ReportRow/originale-fixture-1440.png
- .claude/immagini/astra-fase2/ReportRow/mockup-1280.png
- .claude/immagini/astra-fase2/ReportRow/componente-1280.png
- .claude/immagini/astra-fase2/ReportRow/app-vuota-1280.png
- .claude/immagini/astra-fase2/ReportRow/originale-vuota-1280.png
- .claude/immagini/astra-fase2/ReportRow/fixture-dettagli-1280.png
- .claude/immagini/astra-fase2/ReportRow/fixture-filtro-vuoto-1280.png
- .claude/immagini/astra-fase2/ReportRow/app-errore-1280.png
- .claude/immagini/astra-fase2/ReportRow/originale-fixture-1280.png
- .claude/immagini/astra-fase2/ReportRow/mockup-1024.png
- .claude/immagini/astra-fase2/ReportRow/componente-1024.png
- .claude/immagini/astra-fase2/ReportRow/app-vuota-1024.png
- .claude/immagini/astra-fase2/ReportRow/originale-vuota-1024.png
- .claude/immagini/astra-fase2/ReportRow/fixture-dettagli-1024.png
- .claude/immagini/astra-fase2/ReportRow/fixture-filtro-vuoto-1024.png
- .claude/immagini/astra-fase2/ReportRow/app-errore-1024.png
- .claude/immagini/astra-fase2/ReportRow/originale-fixture-1024.png
- .claude/immagini/astra-fase2/ReportRow/prima-mockup-1280.png
- .claude/immagini/astra-fase2/ReportRow/prima-originale-1280.png

Simboli pubblici: statoRicerca, testiRicerca, riepilogoRicerche, filtraRicerche, creaReportRow, aggiornaPaginaRicerca. Fixture RICERCHE, ADESSO fisso. Compatibilità: caricaPannelloRicerca({pagina=false}), rigaRicerca, researchListMount; data-vaia=ricerca e setView esistenti. Unica aggiunta al dispatch setView: caricamento della pagina Ricerca. Gestione pagina/foglio con generazione per mount, id sessione, vista attuale; risposta obsoleta ignorata. Nessun refactor dei caricatori degli altri componenti.
RED: tests/unit/ricerca.test.mjs fallisce per modulo mancante. RICERCA-STATO, RICERCA-SEMANTICA, RICERCA-TITOLO-DATA, RICERCA-FILTRO, RICERCA-ELENCO-PARZIALE. Test live prima dell'innesto fallisce per assenza data-research-esito funzionante. GREEN: node --test tests/unit/ricerca.test.mjs; generatore; parità componente ReportRow 3 viewport; innesto; build; ricerca-vivo 9 scenari (3x3): API vera vuota/reload e originale; sei fixture nella forma vera con filtri/tastiera/dettagli e stesso originale; errore 503/payload/retry/risposta obsoleta. Nessuna scrittura API. Schermate finali prese e aperte a 1440/1280/1024.
Regressione: test:lab, suite componenti completa, npm run verify (difetto preesistente PHASE3-TOKEN-CONTRACT-01 da distinguere), verify-build e git diff --check. Gate upstream reale: UI→GET del server 4177 senza intercept per il vuoto; popolato/errore sono fixture esplicite, nessuna esecuzione modello. Gate conversazionale in lingua naturale resta NON eseguito: server senza runtime owner. Rollback: revert del solo commit ReportRow, senza cambiare dati/contratti/server.
Blocchi riusati: ResearchScreen, Topbar di questa sola pagina, Page, Toolbar, FilterChips, ReportList, ReportRow, Field, Badge, Button e sprite i-globe/i-search. Nuovi blocchi 0, nuovi token 0, nuove icone 0; sola regola CSS locale al titolo/sottotitolo espanso, disegnata prima nel mockup. Il laboratorio precede l'innesto (§3).

Precisazione prima del codice: cinque fixture popolate, una per ogni stato reale, e valore sconosciuto nel test unitario. Nessun sesto stato inventato nel mockup.

§3 step 4–6: RED modulo mancante osservato; unitari 5/5 GREEN; parità ReportRow 3/3 GREEN; aperte le 6 immagini mockup/componente. A 1024 toolbar su due righe, testata della pagina sempre una riga; filtri/azioni leggibili. Nessun difetto visivo nuovo rilevato. Prima dell’innesto: scenario reale del test live deve fallire mostrando le cinque righe statiche.

§3 step 7 — refresh web 05/09 prima dell’innesto: riaperte le stesse URL esatte di Hermes Grounded Citations (evidence), Claude Tools reference (WebSearch error result), Codex Web search (runtime/provider). Confermati confini evidenza/esito e disponibilità; decisioni immutate, nessuna debolezza dedotta da un test non eseguito. Merge nuovamente già aggiornato. RED live osservato: atteso 0 ricerche reali, ricevute 5 statiche.

### RICERCA-TITOLO-NON-TRONCATO — regressione scoperta aprendo gli originali popolati
Il primo 9/9 live non basta: originale-fixture 1280/1024 mostra il titolo intero; il mockup/componente iniziale lo tronca fino al click Dettagli. La frase precedente «nessun difetto» era limitata alla parità, NON al confronto di copertura. Correzione obbligatoria prima della consegna: titolo sempre a capo, data completa su Dettagli. Ricerca fresca 05/09: WAI Reflow https://www.w3.org/WAI/WCAG22/Understanding/reflow.html (stabile, riverificata oggi); riaperte oggi Hermes Grounded Citations, Claude Tools reference e Codex Web search alle URL del piano: preservare la leggibilità delle informazioni senza attribuire loro verifiche non svolte. Nessuna misurazione UI competitor nuova. +1 misurabile rispetto alla proposta scartata: zero click per il titolo completo anche a 1024, test scrollWidth<=clientWidth, titolo sempre presente. Adottare reflow locale, nessun token nuovo. RED aggiunto al test fixture prima dell’edit CSS. File invariati rispetto al piano, tre immagini aggiuntive di elenco completo:
- .claude/immagini/astra-fase2/ReportRow/fixture-elenco-1440.png
- .claude/immagini/astra-fase2/ReportRow/fixture-elenco-1280.png
- .claude/immagini/astra-fase2/ReportRow/fixture-elenco-1024.png

RED RICERCA-TITOLO-NON-TRONCATO osservato a 1024: scrollWidth supera clientWidth. Applicata nel solo mockup la regola di ritorno a capo su ogni titolo ReportRow, senza cambiare componenti o gli altri blocchi.


## B5.4 ReportRow / Ricerca — consegna 05/09/2026
La pagina Ricerca approfondita legge il progetto della sessione reale. Titolo intero sempre leggibile, cinque stati in italiano, filtro per stato e ricerca nel titolo completo; Dettagli aggiunge l'ora di avvio. Pulsante Aggiorna, caricamento, errore esplicito, riprova; risposte obsolete escluse anche uscendo verso Board e rientrando. Il precedente foglio Capability usa lo stesso ReportRow. Nessuna rotta nuova.

| Aspetto | Originale osservato | Proposta verificata / beneficio | Regressione / verdetto |
|---|---|---|---|
| Copertura dati | Titolo, data ridotta, cinque stati grezzi, ambito progetto | Stessi quattro campi, titolo senza tagli, ora completa disponibile, stati italiani distinti | Parità preservata; nessuna fonte o valutazione aggiunta senza dati |
| Consultazione / passi | Nel lungo Capability hub, scroll fino alla ricerca; nessun filtro | Altro → Ricerca approfondita; ricerca su titolo/stato e sei filtri | Zero click per leggere il titolo; Dettagli solo per l'ora. RICERCA-TITOLO-NON-TRONCATO corretto con RED→GREEN |
| Forma / densità / responsive | Modale, testi piccoli, contenuto circondato da sezioni estranee | Stesso linguaggio del mockup, lista centrale; 1440/1280 toolbar su una riga, 1024 su due, titolo mai troncato | Foto originali e finali aperte a tre larghezze; nessuna modifica alla Topbar Chat |
| Tastiera / semantica | Elenco passivo e stati grezzi | Pulsanti nativi, lista, tabs con roving tabindex, Enter/Space, Home/End, aria-expanded | Verificato in Playwright; non dichiarata conformità completa a screen reader o WCAG |
| Limiti / qualità | Nessun totale né fonti dall'API | Numero di voci elencate e limite 20 visibili; Conclusa non significa fonti certificate | Gap backend dichiarato: report/fonti/paginazione non esposti in HTTP; controlli dipendenti hidden fase3 |
| Errori / recupero / persistenza | Messaggi nel foglio, caricatore non proteggeva completamente dal cambio sessione | Errore distinto da zero, Aggiorna, payload non valido respinto, generazione per mount e sessione | 503/[null]/retry/risposta obsoleta provati. Dati ricaricati dal backend dopo reload; filtri locali alla pagina, non preferenze persistite |
| Latenza / sicurezza | GET elenco; nessuna azione di creazione UI | Stesso GET, filtro locale senza nuove chiamate, testo via textContent | Nessun benchmark di latenza né qualità modello eseguito; nessuna mutazione API dalle interazioni provate |

Prove: unitari specifici 5/5; live Ricerca 9/9 dopo la correzione del titolo; suite componenti completa 39/39; build deterministica 30 file e git diff --check verdi. npm run verify: **341/342**, resta solo PHASE3-TOKEN-CONTRACT-01 (colori raw del CSS generato, preesistente su 81cc5cc5 come già documentato in B3). Log locale: C:/Users/Antonino/AppData/Local/Temp/astra-research-verify.log. Il cancello complessivo NON è dichiarato verde.

Evidenza visiva: 27 screenshot finali nella cartella .claude/immagini/astra-fase2/ReportRow/ (mockup, componente, app-vuota, originale-vuota, fixture-elenco, fixture-dettagli, fixture-filtro-vuoto, app-errore, originale-fixture × 1440/1280/1024), tutti aperti; più due catture iniziali 1280x720. Il confronto dark mockup/componente è identico; confronto light originale/app sugli stessi cinque record di fixture o sullo stesso vuoto reale. Contatore sidebar 0 nelle fixture intenzionale: arriva dall'API reale prima dell'intercettazione della sola lista, non è un valore prodotto nel backend. Controllo aggiuntivo manuale nel browser integrato: pagina finale dark 4177, vuoto reale. Le cinque ricerche popolate NON sono ricerche realmente eseguite.
Blocchi nuovi 0, token nuovi 0, simboli sprite nuovi 0. Una regola CSS nel mockup, limitata a ReportRow; template e CSS rigenerati. Backend/store/public/ponte e superfici Claude invariati.

Restano richieste Fase 3: lettura del rapporto e fonti; paginazione/totale; errori di filesystem che research-store oggi nasconde; nessuna simulazione di queste capacità. Il gate di chat naturale con runtime vero resta da fare nell'ambiente owner: il server di confronto non ha quel runtime. OAuth e piano computer-use restano registrati, dopo le schermate.

Cosa deve fare l'owner · Guardare Ricerca approfondita su http://127.0.0.1:4177/ (Altro) e gli screenshot popolati; il progetto locale al momento ha zero ricerche.
Cosa fai tu dopo · Officina attrezzi, poi Automazioni per completare B5, quindi l'ordine B4 → B6 → B2 → B7 → B1 → B8.
Cosa rimane · Chiusura owner, limite CSS condiviso da allineare con Claude, gap Fase 3 e parti B residue. Nessun push.

Chiusura dei cancelli B5.4: npm run test:lab **195/195** (2,1 min); completo, senza errori. Confronto finale e git diff --check eseguiti. Il solo rosso resta il contratto CSS preesistente, 341/342 nel verify.


## B5.5 — Officina / ForgeList — piano prima degli edit, 05/09/2026
Sottosistema TALOS UI. Base 316484d; merge lane/harness-desktop eseguito prima degli edit, già aggiornato. Solo pagina Officina, caricaPannelloForge, rigaToolForgiato e un dispatch pagina; nessuna modifica a backend, ponte, frammenti, Chat/Review/sidebar/testata Chat. Mappa nomi umani centrale riusata, non duplicata.

Ricerca fresca, finestra 06/08–05/09/2026. Release riaperte: Hermes v0.21.0 v2026.8.31 29112be (31/08) https://github.com/NousResearch/hermes-agent/releases/tag/v2026.8.31; Claude Code v2.1.261 d7dbd9a (04/09) https://github.com/anthropics/claude-code/releases/tag/v2.1.261; Codex rust-v0.153.4 3d2ee51 (04/09) https://github.com/openai/codex/releases/tag/rust-v0.153.4. Le pagine seguenti sono documenti correnti riaperti oggi, data propria non verificabile; non spacciati per pubblicati nell'ultimo mese.

| Fonte | Forza / limite documentato | Decisione / +1 misurabile |
|---|---|---|
| Hermes Plugins https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins | Abilitazione esplicita e deny prevalente, pin immutabili; codice Python in-process: capability consent non è isolamento. La stessa pagina contiene un esempio introduttivo di caricamento immediato, chiarito dalla sezione opt-in. | Adattare distinzione installato/abilitato e capacità. +1 obiettivo: elenco leggibile e azione reversibile con esito persistito visibile. Non chiamare sandbox né audit la semplice abilitazione. Nessun giudizio di superiorità esecutiva non misurato. |
| Claude Plugins https://code.claude.com/docs/en/discover-plugins | Ricerca/dettaglio/scope e enable/disable senza disinstallare; cambiamenti non già attivati richiedono reload, con possibile invalidazione cache. | Adattare filtro e dettagli; +1 obiettivo: stato dopo conferma server, persistito e riletto dopo reload della pagina. Non si promette invalidazione cache o attivazione immediata in un giro modello già in corso. |
| Codex MCP https://learn.chatgpt.com/docs/extend/mcp | Enable separato dalla configurazione, deny dopo allow, policy per attrezzo e timeout espliciti; serve configurazione corretta, le policy MCP non dimostrano isolamento del processo. | Adattare separazione stato/capacità/azione; +1 obiettivo: capacità in linguaggio umano prima di abilitare e errore d'azione visibile senza successo ottimistico. Contratto TALOS limitato a enable globale booleano: nessuna finta policy granulare. |
| WAI Listbox https://www.w3.org/WAI/ARIA/apg/patterns/listbox/ | Selezione singola e navigazione tastiera; il contenuto delle opzioni non ospita controlli interattivi. | Adottare per selezione/dettaglio; Abilita/Disabilita nel pannello separato. Frecce/Home/End cambiano solo selezione, mai permessi. |

Ispezione locale: schermoOfficina, caricaPannelloForge/rigaToolForgiato, session-registry.elencaToolForgiati/abilitaToolForgiato, tool-forge-store, forge-contract, createHttpApp e test esistenti. GET reale 4177 confermato strumenti:[], errore:null. Schema sette campi: id, titolo, descrizione, capacita[], rischio, abilitato booleano, installatoAlle. GLOBALE, tutti i progetti. Rischi R1/R2/R3 dichiarati dal contratto; otto capacità con azioni note: tasks.list/create/setStatus, notes.list/create/update, memory.search/create. Non sono moduli JS con filesystem: sono flow validati con capacità limitate. Il mockup attuale mostra codice JS, giro/chiamate/token/ricevuta inventati rispetto all'HTTP. Tutti questi dati non disponibili vengono rimossi o hidden data-richiede=fase3; CodeBlock resta predisposto e nascosto, non sostituito con codice simulato. Originale non espone lettura codice o modifica; preserva invece la mutazione reale POST /api/v1/sessions/:id/tool-forge/:toolId/enable {abilitato:boolean}.
Originale e mockup 4179/4177 visti e screenshot aperti a 1280x720 prima dell'edit. Stato e azione distinti. Descrizione/capacità originali restano visibili per ogni riga; dettaglio aggiunge installazione e rischio riportato, non presunto audit. Titoli/descrizioni sempre a capo, anche a 1024. Nessuna nuova conferma richiesta per l'azione già espressa dal click.

File esatti:
- .claude/LEDGER-ASTRA-FASE-2-2026-09-05.md
- .claude/CONSEGNA-ASTRA-FASE-2-2026-09-05.md
- .claude/MOCKUP-REDESIGN-TALOS-2026-09-04.html
- harness-ui/frontend/src/components/officina.js
- harness-ui/frontend/lab/fixtures/officina.js
- harness-ui/frontend/lab/main.js
- harness-ui/frontend/tests/unit/officina.test.mjs
- harness-ui/frontend/tests/parity/componenti.spec.mjs
- harness-ui/frontend/tests/parity/officina-vivo.spec.mjs
- harness-ui/frontend/playwright.astra.config.mjs
- harness-ui/frontend/src/legacy/app.js
- harness-ui/frontend/index.template.html
- harness-ui/frontend/src/styles/index.css
- harness-ui/frontend/tests/parity/forge-backend-fixture.mjs
Immagini esatte:
- .claude/immagini/astra-fase2/ForgeList/mockup-1440.png
- .claude/immagini/astra-fase2/ForgeList/componente-1440.png
- .claude/immagini/astra-fase2/ForgeList/app-vuota-1440.png
- .claude/immagini/astra-fase2/ForgeList/originale-vuota-1440.png
- .claude/immagini/astra-fase2/ForgeList/fixture-elenco-1440.png
- .claude/immagini/astra-fase2/ForgeList/fixture-dettaglio-1440.png
- .claude/immagini/astra-fase2/ForgeList/originale-fixture-1440.png
- .claude/immagini/astra-fase2/ForgeList/app-errore-1440.png
- .claude/immagini/astra-fase2/ForgeList/errore-abilitazione-1440.png
- .claude/immagini/astra-fase2/ForgeList/mockup-1280.png
- .claude/immagini/astra-fase2/ForgeList/componente-1280.png
- .claude/immagini/astra-fase2/ForgeList/app-vuota-1280.png
- .claude/immagini/astra-fase2/ForgeList/originale-vuota-1280.png
- .claude/immagini/astra-fase2/ForgeList/fixture-elenco-1280.png
- .claude/immagini/astra-fase2/ForgeList/fixture-dettaglio-1280.png
- .claude/immagini/astra-fase2/ForgeList/originale-fixture-1280.png
- .claude/immagini/astra-fase2/ForgeList/app-errore-1280.png
- .claude/immagini/astra-fase2/ForgeList/errore-abilitazione-1280.png
- .claude/immagini/astra-fase2/ForgeList/mockup-1024.png
- .claude/immagini/astra-fase2/ForgeList/componente-1024.png
- .claude/immagini/astra-fase2/ForgeList/app-vuota-1024.png
- .claude/immagini/astra-fase2/ForgeList/originale-vuota-1024.png
- .claude/immagini/astra-fase2/ForgeList/fixture-elenco-1024.png
- .claude/immagini/astra-fase2/ForgeList/fixture-dettaglio-1024.png
- .claude/immagini/astra-fase2/ForgeList/originale-fixture-1024.png
- .claude/immagini/astra-fase2/ForgeList/app-errore-1024.png
- .claude/immagini/astra-fase2/ForgeList/errore-abilitazione-1024.png
- .claude/immagini/astra-fase2/ForgeList/prima-mockup-1280.png
- .claude/immagini/astra-fase2/ForgeList/prima-originale-1280.png
Nessuna cancellazione. Simboli pubblici: statoToolForgiato, capacitaToolForgiato, testiToolForgiato, filtraOfficina, creaForgeRow, aggiornaPaginaOfficina; fixture STRUMENTI_FORGIATI e ADESSO. Compatibilità: caricaPannelloForge({pagina=false}), rigaToolForgiato, forgeListMount e data-vaia=officina. Caricamento/mutazione catturano sessione+generazione+mount; nessun successo prima della risposta. Stato malformato non trattato come false. Il pulsante disponibile mantiene lo stato attuale su errore, permette riprova; richieste duplicate bloccate durante salvataggio. Ricaricamento dopo successo legge dal server. Nel foglio vecchio si mantiene bottone per riga fuori dall'opzione selezionabile; il componente creaForgeRow ha modalità pagina/foglio senza perdere azione.
RED unitario: modulo mancante; FORGE-STATO, FORGE-CAPACITA, FORGE-METADATI, FORGE-FILTRO. Lab parità prima dell'innesto, tre viewport e immagini aperte. Poi RED live pagina vuota finché il monolite non è collegato. GREEN live: vuoto reale 4177/reload + originale; fixture su tre voci vere nello schema, selezione tastiera/ricerca/capacità, enable e disable REALI su store isolato riletto e persistito; 503/errore POST/payload malformato/risposta obsoleta.
Il test forge-backend-fixture.mjs usa createHttpApp + createSessionRegistry + tool-forge-store REALI, sessione di prova ripristinata e manifesti validati in una directory temporanea sotto tmpdir. Porta 4178 soltanto durante i test live, mai insieme al laboratorio di parità. Le sole richieste /tool-forge delle pagine di test vengono inoltrate al laboratorio via route.fetch, con lo stesso id osservato; codice modello mai eseguito. nessun tool/installazione/dato dell'owner modificato. Chiude server e verifica percorso assoluto dentro la cartella temporanea prima della pulizia. Sessione e manifesti sono fixture dichiarate, non prove di generazione da un modello.
Regressioni: unitari frontend, suite componenti, test:lab 195, verify-build, diff --check; npm run verify con unico errore CSS condiviso da segnalare, non aggirare. Contratti backend non modificati. Rollback solo commit Officina, nessuna migrazione. Gate chat naturale su runtime owner resta separato e non eseguito in questo ambiente.
Riusa ForgeScreen, Topbar della pagina, Page, Toolbar, FilterChips, ForgeList, DetailPanel, CodeBlock, Badge/Button/sprite. Blocchi nuovi 0, token nuovi 0, icone nuove 0. CSS strettamente nel mockup per testi lunghi e errore locale; dopo rigenerare template e CSS, mai editarli a mano.

§3 4–6: RED modulo mancante; unitari Officina 4/4; parità ForgeList 3/3 e sei PNG aperti. A 1024 il pannello dettagli passa sotto la lista, come il CSS canonico; la pagina scorre. Precisazione controller prima dell’innesto: salvataggioId identifica l’attrezzo della richiesta; selezionare un altro non deve mostrarlo falsamente «in salvataggio». Test OFFICINA-RECUPERO verifica anche questo e un solo POST mentre occupato.

§3 passo 7, 05/09/2026: RED live osservato OFFICINA-REALE 1440: attesi 0 attrezzi/0 abilitati, ricevuti i 3 esempi/1 abilitato del mockup. Merge upstream ancora aggiornato. Riaperti prima dell'innesto Hermes Plugins, Claude discover-plugins, Codex MCP (URL e pin sopra, finestra invariata). Adattamento: controller unico di mutazione in volo condiviso fra pagina e foglio, sessione/id catturati; selezione mai muta capacità; risposta POST confermata e successivo GET, errore mantiene dati precedenti. I controller ancora visibili ricevono esito anche se si esce e rientra durante la richiesta. Nessuna duplicazione di rotta o gestore del ponte. Il limite upstream installazione/attivazione resta distinto dall'esecuzione; +1 verificabile con store isolato reale e reload.

Regressioni permanenti RED osservate, 05/09: OFFICINA-SELEZIONE-DOPO-SALVATAGGIO (in OFFICINA-PERSISTENZA) perdeva la voce al GET di ricaricamento e mostrava lo stato della prima; OFFICINA-SALVATAGGIO-ID (in OFFICINA-RECUPERO) mostrava Salvataggio anche sull'altra voce selezionata. Correzione prevista: conservare selezione durante caricamento; etichetta di salvataggio solo sull'id interessato, disabilitazione globale per impedire doppio POST. Riaperti Hermes opt-in, Claude reload, Codex enabled e WAI Listbox https://www.w3.org/WAI/ARIA/apg/patterns/listbox/: preservare selezione distinta da focus/azione, nessuna attivazione implicita. Pulizia del test dopo RED attende i route handler in volo (Playwright Page.unrouteAll behavior wait, https://playwright.dev/docs/api/class-page#page-unroute-all, docs stabili riverificate oggi); errore secondario route already handled non è errore prodotto. Rafforzare prova titolo selezionato dopo entrambe le mutazioni.

Verifica aggiuntiva mirata del solo controller introdotto: estendere OFFICINA-RECUPERO con uscita a Board e rientro durante POST sospeso; l'azione resta disabilitata e il nuovo pannello riceve il fallimento, nessun doppio POST. Fonti competitor riaperte oggi nelle sezioni disabled/enable/allowlist (stessi URL/pin); decisione invariata: stato persistito e azione distinta, non un nuovo protocollo. Nessun cambio prodotto in questo passo.


## B5.5 Officina / ForgeList — consegna 05/09/2026
Pagina collegata al GET globale /tool-forge. Titoli e descrizioni completi, capacità in italiano, stato distinto dall'azione; rischio e data installazione riportati dal backend. Abilita/Disabilita usa il POST esistente e rilegge il risultato. Una richiesta alla volta, sessione catturata; cambi di pagina e risposte obsolete gestiti. Nessun codice JS, costo, esecuzione o ricevuta inventati.

| Aspetto | Originale osservato | Proposta / beneficio verificato | Verdetto e limiti |
|---|---|---|---|
| Copertura | Titolo, descrizione, capacità tecniche, stato, Abilita/Disabilita nel foglio lungo | Stessi dati/azioni; capacità in italiano, data completa e rischio dal contratto; stato ignoto non concede azioni | Parità dei comportamenti esposti; nessuna nuova capacità backend dichiarata |
| Ricerca / passi | Scroll nel Capability hub, azione diretta per riga | Accesso Altro → Officina; filtro per stato, ricerca anche per identificatore tecnico; selezione e comando nel dettaglio | Per una voce non selezionata serve selezione + azione. Il foglio conserva l'azione diretta per riga; non dichiarato guadagno di click per ogni uso |
| Forma / densità | Testi piccoli nella modale originale, sezioni estranee attorno | Stesso mockup, descrizioni e titoli senza tagli, capacità sempre visibili | 1440/1280 dettaglio a lato; 1024 sotto e pagina scorre. Azione raggiunta e provata anche sotto la piega |
| Tastiera / semantica | Pulsanti di azione nativi | Tabs e listbox, frecce/Home/End; selezione non invia richieste; azione separata dalle opzioni | Verificato, nessuna attestazione completa WCAG/screen reader |
| Stato / recupero | Fallimento con toast; riga ricaricata dopo successo | Errore di lista distinto da vuoto, Aggiorna; errore di salvataggio nomina la voce e mantiene stato; riprova reale | 503, payload [null], POST fallito, cambio selezione, uscita/rientro in volo, risposta obsoleta provati |
| Persistenza / sicurezza | Enable booleano globale nello store | Stesso endpoint: nuovo stato solo dopo POST+GET, poi reload; nessun doppio POST mentre occupato | Prova reale HTTP → registry → store temporaneo. Fixture dichiarate, nessun flow/modello eseguito; dati owner invariati |
| Prestazioni / limiti | Nessuna API definizione né storico | Stesso GET, ricerca locale; CodeBlock nascosto fase3, limite della definizione visibile | Non misurata latenza/superiorità esecutiva; errori filesystem nascosti dallo store restano gap backend |

Regressioni permanenti corrette con RED→GREEN: OFFICINA-SELEZIONE-DOPO-SALVATAGGIO e OFFICINA-SALVATAGGIO-ID, coperte rispettivamente da OFFICINA-PERSISTENZA e OFFICINA-RECUPERO. Live 9/9, ulteriore recupero con navigazione in volo 3/3; unitari specifici 4/4; suite componenti completa 42/42; build deterministica 30 file, diff --check verde. Verify: **345/346**, unico rosso preesistente PHASE3-TOKEN-CONTRACT-01 del CSS condiviso (stesso di B3, non aggirato). Log C:/Users/Antonino/AppData/Local/Temp/astra-forge-verify.log.

Visivo: 27 PNG finali a 1440/1280/1024 e due iniziali in .claude/immagini/astra-fase2/ForgeList/, tutti aperti. Mockup/componente identici in dark; app/originale confrontate in light con vuoto reale e stessi tre record nello store isolato. Ulteriore ispezione manuale in browser integrato, pagina dark reale 4177. Le tre voci popolate sono fixture validate, non attrezzi creati da un modello owner. Conteggio sidebar zero nella prova popolata: lista inoltrata al server isolato, contatore separato resta quello del server 4177.
Blocchi riusati ForgeScreen, Topbar di pagina, Page, Toolbar, FilterChips, ForgeList, DetailPanel, CodeBlock nascosto; blocchi/token/simboli nuovi **0/0/0**. Due regole CSS per testi lunghi nel mockup; template/CSS rigenerati. Backend, public, ponte, frammenti e superfici Claude non modificati.

Cosa deve fare l'owner · Provare Altro → Officina attrezzi su http://127.0.0.1:4177/; l'ambiente locale ha zero attrezzi, i casi popolati sono negli screenshot.
Cosa fai tu dopo · Automazioni per chiudere B5, poi B4 → B6 → B2 → B7 → B1 → B8.
Cosa rimane · Gate di chat naturale con runtime owner; limite CSS condiviso e richieste Fase 3; OAuth e piano computer-use dopo le schermate. Nessun push.

Chiusura B5.5: test:lab 195/195. La suite componenti 42/42 è partita per omissione della variabile sulla porta di default 4176; processo terminato, controllo mirato ripetuto esplicitamente su 4178: ForgeList 3/3. Nessun uso della 4174. Porte dei due server di confronto sempre 4177/4179.


## B5.6 AutomationRow — piano prima degli edit, 05/09/2026
Sottosistema TALOS UI, base 0ec3598, merge lane/harness-desktop aggiornato. Perimetro: schermoAutomazioni, componente e renderAutomationsReali. La creazione esistente openNewAutomationSheet resta funzionante e sarà convertita come dialogo in B7; qui il pulsante Nuova automazione richiama proprio quel canale. Nessuna modifica allo scheduler/store/ponte/frammenti/sidebar/Chat/Review.

Ricerca fresca finestra 06/08–05/09/2026. Release riaperte oggi: Hermes v0.21.0 v2026.8.31 29112be, 31/08 https://github.com/NousResearch/hermes-agent/releases/tag/v2026.8.31; Claude v2.1.261 d7dbd9a 04/09 https://github.com/anthropics/claude-code/releases/tag/v2.1.261; Codex rust-v0.153.4 3d2ee51 04/09 https://github.com/openai/codex/releases/tag/rust-v0.153.4. Documenti seguenti stabili riverificati oggi, date proprie non verificate, non dichiarati novità dell'ultimo mese.
| Fonte | Forza / limite documentato | Decisione e +1 misurabile |
|---|---|---|
| Hermes Cron https://hermes-agent.nousresearch.com/docs/user-guide/features/cron/ | Cron naturale, cronologia persistente claimed/running/terminal, unknown dopo crash, incidenti riconosciuti; dipende dal processo gateway/scheduler, un tentativo unknown non viene rilanciato automaticamente | Adattare distinzione schedulazione/risultato. +1 obiettivo UI: ogni numero qualificato, ultimo avvio non venduto come successo. Storico Hermes è più ricco dell'HTTP TALOS: gap dichiarato, non finta superiorità |
| Claude Desktop scheduled tasks https://code.claude.com/docs/en/desktop-scheduled-tasks | Elenco, pause, esecuzioni in nuova sessione, frequenza e cartella; app/computer accesi e scarto temporale deterministico | Adattare stato/prossimo avvio/requisiti locali. +1 obiettivo: limite giornaliero e conteggio UTC sulla riga, azione confermata con rilettura; nessun claim di precisione temporale senza test scheduler |
| Codex Scheduled https://learn.chatgpt.com/docs/automations?surface=app | Ricerca All/Active/Paused, worktree/local, run consultabili; locale richiede app/computer attivi, web non accede alla cartella locale | Adattare ricerca/filtri e gestione; +1 obiettivo: pausa persistita e fallimento d'azione accanto alla riga senza stato ottimistico. TALOS non ha storico/esiti/costi collegati e non replica una inbox finta |
| WAI Switch https://www.w3.org/WAI/ARIA/apg/patterns/switch/ | Etichetta stabile, aria-checked booleano, Space attiva; stato sconosciuto non è false | Adottare switch con nome dell'automazione, separare testo Attiva/In pausa e messaggi; test tastiera/salvataggio/errore |

API reali lette: GET /api/v1/automations items:[]; GET /api/v1/tasks items:[] (server 4177). Schema da createAutomationStore: id,taskId,nome,intervalloMinuti,limiteAlGiorno,attiva,creataAlle,ultimaEsecuzione,prossimaEsecuzione,eseguiteOggi,giornoContatore. Create nasce in pausa; intervallo intero >=5, limite intero 1–10. Toggle/elimina reali via POST esistenti. Il contatore è del giorno UTC, lo scheduler tratta come zero il conteggio di una data precedente. registraEsecuzione registra avvio, non completamento; nessun esito/storico/costo dall'HTTP. Lista dello store nasconde errori filesystem/corruzione: gap esistente. Scheduler/timer non viene attivato nel test isolato.
Originale: la sola entrata Automazioni è nella attention-card, che sparisce con elenco vuoto (verificato DOM e sorgente); palette originale non contiene Automazioni. Per ispezionare il flusso popolo soltanto uno store temporaneo reale, inoltro API di test e apro il pulsante Apri visibile. Nessuna scrittura alle automazioni owner. Il mockup attuale mostra cron/esiti/costi/permessi non esposti: sostituire con gli undici campi veri, mai togliere creazione/pausa/attivazione/eliminazione originali.
File esatti:
- .claude/LEDGER-ASTRA-FASE-2-2026-09-05.md
- .claude/CONSEGNA-ASTRA-FASE-2-2026-09-05.md
- .claude/MOCKUP-REDESIGN-TALOS-2026-09-04.html
- harness-ui/frontend/src/components/automazioni.js
- harness-ui/frontend/lab/fixtures/automazioni.js
- harness-ui/frontend/lab/main.js
- harness-ui/frontend/tests/unit/automazioni.test.mjs
- harness-ui/frontend/tests/parity/componenti.spec.mjs
- harness-ui/frontend/tests/parity/automazioni-vivo.spec.mjs
- harness-ui/frontend/tests/parity/automation-backend-fixture.mjs
- harness-ui/frontend/playwright.astra.config.mjs
- harness-ui/frontend/src/legacy/app.js
- harness-ui/frontend/index.template.html
- harness-ui/frontend/src/styles/index.css
Immagini esatte:
- .claude/immagini/astra-fase2/AutomationRow/mockup-1440.png
- .claude/immagini/astra-fase2/AutomationRow/componente-1440.png
- .claude/immagini/astra-fase2/AutomationRow/app-vuota-1440.png
- .claude/immagini/astra-fase2/AutomationRow/fixture-elenco-1440.png
- .claude/immagini/astra-fase2/AutomationRow/fixture-pausa-1440.png
- .claude/immagini/astra-fase2/AutomationRow/fixture-filtro-1440.png
- .claude/immagini/astra-fase2/AutomationRow/app-errore-1440.png
- .claude/immagini/astra-fase2/AutomationRow/errore-azione-1440.png
- .claude/immagini/astra-fase2/AutomationRow/originale-fixture-1440.png
- .claude/immagini/astra-fase2/AutomationRow/originale-creazione-1440.png
- .claude/immagini/astra-fase2/AutomationRow/app-creazione-1440.png
- .claude/immagini/astra-fase2/AutomationRow/mockup-1280.png
- .claude/immagini/astra-fase2/AutomationRow/componente-1280.png
- .claude/immagini/astra-fase2/AutomationRow/app-vuota-1280.png
- .claude/immagini/astra-fase2/AutomationRow/fixture-elenco-1280.png
- .claude/immagini/astra-fase2/AutomationRow/fixture-pausa-1280.png
- .claude/immagini/astra-fase2/AutomationRow/fixture-filtro-1280.png
- .claude/immagini/astra-fase2/AutomationRow/app-errore-1280.png
- .claude/immagini/astra-fase2/AutomationRow/errore-azione-1280.png
- .claude/immagini/astra-fase2/AutomationRow/originale-fixture-1280.png
- .claude/immagini/astra-fase2/AutomationRow/originale-creazione-1280.png
- .claude/immagini/astra-fase2/AutomationRow/app-creazione-1280.png
- .claude/immagini/astra-fase2/AutomationRow/mockup-1024.png
- .claude/immagini/astra-fase2/AutomationRow/componente-1024.png
- .claude/immagini/astra-fase2/AutomationRow/app-vuota-1024.png
- .claude/immagini/astra-fase2/AutomationRow/fixture-elenco-1024.png
- .claude/immagini/astra-fase2/AutomationRow/fixture-pausa-1024.png
- .claude/immagini/astra-fase2/AutomationRow/fixture-filtro-1024.png
- .claude/immagini/astra-fase2/AutomationRow/app-errore-1024.png
- .claude/immagini/astra-fase2/AutomationRow/errore-azione-1024.png
- .claude/immagini/astra-fase2/AutomationRow/originale-fixture-1024.png
- .claude/immagini/astra-fase2/AutomationRow/originale-creazione-1024.png
- .claude/immagini/astra-fase2/AutomationRow/app-creazione-1024.png
- .claude/immagini/astra-fase2/AutomationRow/prima-originale-1280.png
- .claude/immagini/astra-fase2/AutomationRow/prima-creazione-1280.png
- .claude/immagini/astra-fase2/AutomationRow/prima-mockup-1280.png
Nessuna cancellazione. Pubblici: statoAutomazione, testiAutomazione, filtraAutomazioni, riepilogoAutomazioni, creaAutomationRow, aggiornaPaginaAutomazioni; fixture AUTOMAZIONI, ATTIVITA_AUTOMAZIONI, ADESSO; helper avviaAutomazioniDiProva. Compatibilità renderAutomationsReali, aggiornaWidgetAutomazioni e openNewAutomationSheet conservate. Dispatch e data-automation-action=new esistenti, nessuna regia parallela.
RED: import modulo mancante; AUT-STATO/AUT-CONTEGGIO-UTC/AUT-DATE/AUT-FILTRO/AUT-RIEPILOGO. Prima del codice UI: catture originali e mockup aperte. Poi markup canonico, fixture, componente, lab/parità e immagini aperte PRIMA dell'innesto. RED live: pagina ancora esempi finché non collegata. GREEN: vuoto reale, creazione reale in pausa su store isolato, toggle/pause/delete persistiti dopo reload, ricerca/stato, tastiera, errore GET/POST/payload, no doppio POST, ritorno alla pagina in volo. Test originali con stessi record. Form legacy provato ma conversione visiva in B7. Il runtime modello non è disponibile: nessuna promessa di gate chat naturale superato.
Regressioni: componenti completi, test:lab, verify con rosso CSS preesistente esplicito, build deterministica e diff --check. Rollback singolo commit UI, nessuna migrazione. Blocchi/tokens/sprite nuovi previsti 0; CSS solo nel mockup se serve a testo/reflow, generatore dopo ogni modifica canonica.

Aggiornamento base prima degli edit: il merge effettivo ha importato 5df583cb (merge locale 36870e5b), solo documenti. Letto PROMPT-ASTRA-2026-09-05-BROWSER-E-TESTATA.md: requisito browser vero a schede registrato come lavoro residuo; non si dichiarerà sufficiente il lettore di testo. K-I attende kernel/Electron, da trattare nel suo passo e con ricerca primaria propria. Piano Automazioni invariato.

Ispezione iniziale completata: aperte originale-fixture e modulo creazione 1280x800, mockup 1280x720. La prima cattura immediata del click nel browser integrato era ancora il frame Officina; ricatturata dopo DOM Automazioni verificato. Nella prima immagine originale si vede anche testo Chat sovrapposto durante transizione: acquisizioni finali con animazioni disattivate, senza alterare dati. Lista e modulo originali hanno toggle/elimina/creazione reali; la prossima esecuzione a limite raggiunto non è qualificata nell'originale.

Passi 4–6, 05/09: RED modulo mancante osservato. Prima di markup/componente riaperte Hermes Cron (gateway), Claude scheduled (pause), Codex Scheduled (Paused), WAI Switch: etichetta stabile, stato solo confermato, contatore UTC coerente col backend. Form legacy resta operativo, nessun handler di creazione duplicato. Decisioni adottare/adattare/gap del piano confermate.

Correzione del solo raccordo laboratorio: LABORATORI invoca le funzioni senza argomenti, AutomationRow(root) usava root non fornito e non raggiungeva visualReady. Corsa interrotta, nessun verde dichiarato. Adeguamento al pattern document.querySelector degli altri componenti. Fonti di ricerca/stato riaperte (Hermes pause, Claude Status, Codex Search scheduled), decisioni invariate.

QA visiva prima dell'innesto: parità 3/3 ma proposta non accettabile. AUT-FILTRO-STILE-CANONICO: classi talos-chip/talos-filter-chips inesistenti, etichette attaccate; AUT-DENSITA-COMANDI: troppe informazioni espanse, terzo switch fuori viewport a 1280/1024. Registrati come test permanenti in componenti.spec. Correzione batch: usare esattamente FilterChips esistente, tenere prossimo avvio/conteggio/limite visibili e spostare creazione/ultimo avvio/id in disclosure Dettagli. Nessun campo dell'originale nascosto; è solo informazione aggiuntiva. Titolo usa base flessibile per mantenere switch nella testata. Fonti riaperte 05/09: Hermes/Claude/Codex scheduled sopra (lista + dettaglio), WAI Disclosure https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/. Adattare progressive disclosure, obiettivo verificabile: tutti e tre gli switch dentro il viewport delle fixture e filtri con classe canonica.

Ripresa 05/09: merge aggiornato; riaperte le tre fonti scheduled e WAI Disclosure prima della correzione batch. RED AUT-FILTRO-STILE-CANONICO riprodotto a 1024. Contratto disclosure: apertura conservata per id durante refresh, focus sul pulsante; dati originali restano visibili.

Innesto: AUT-VUOTO RED osservato (1280, dati esempio rimasti). Parità corretta 3/3 e sei PNG aperti. Ricerca riaperta 05/09 su Hermes Cron, Claude Desktop Scheduled, Codex Scheduled e WAI Switch. Adattamento API esistente; nessuna libreria necessaria per il renderer. Helper interni mostraAutomazioni e modificaAutomazione, generazione GET globale e blocco POST globale: automazioni sono globali, nessun legame inventato alla sessione. Focus, filtri e disclosure conservati; una scrittura per volta anche uscendo/rientrando.

AUT-RECUPERO prima corsa: timeout nel selettore di navigazione, non nel salvataggio. Trace: il contatore sidebar è omesso quando GET fallisce; pulsante visibile «Automazioni», test pretendeva cifra. Corretto selettore sulla stessa etichetta umana con conteggio opzionale; cleanup store garantito anche a browser già chiuso. B7-DIALOGO-CREAZIONE-AUT registrato: screenshot mostra foglio legacy senza stile; funziona, ma la consegna completa resta aperta finché convertito in B7.

Fixture di errore corretta al contratto envelope HTTP {ok,data/error}: la prima versione con items alla radice provava il rifiuto envelope, non la riga null. Nessuna modifica al contratto o al prodotto per far passare la prova.

## B5.6 AutomationRow — risultato e verifica, 05/09/2026
Renderer della pagina collegato a GET /api/v1/automations, POST toggle/elimina reali. Originale openNewAutomationSheet mantiene creazione e tetti server: test su store temporaneo reale, scheduler spento. Stesse 3 automazioni confrontate nell'originale e nella proposta. Stato reale 4177 vuoto, nessun record owner creato.

| Aspetto | Originale | Proposta / beneficio provato | Verdetto |
|---|---|---|---|
| Dati e semantica | Nome, frequenza, massimo, prossima ora, stato | Stessi campi; giorno UTC, avvii registrati distinti dagli esiti, limite raggiunto esplicito | Conservato, precisione migliorata |
| Ricerca e dettaglio | Elenco, nessun filtro | Nome e attività, Tutte/Attive/In pausa, dettagli espandibili con data creazione/ultimo avvio/id | Aggiunto e provato |
| Pausa/attiva/elimina | POST esistenti, nessun blocco globale | Stesso POST, stato solo dopo rilettura, doppio invio bloccato, errore recuperabile anche uscendo/rientrando | Provato con HTTP/store reali |
| Tastiera e reflow | Pulsanti semplici, descrizione piccola | Switch con etichetta stabile, Space, disclosure Enter/Space, tab con frecce, titolo intero | Tre larghezze verificate; in fondo si scorre |
| Densità | Tre righe più corte | Più dati leggibili; tre switch visibili, metadati aggiuntivi a richiesta | Tradeoff esplicito: più alte dell'originale, nessuna perdita di azioni |
| Creazione | Dialogo resizable stilizzato | Funziona ma foglio legacy è visivamente senza stile nel nuovo corpo | B7-DIALOGO-CREAZIONE-AUT aperto: non accettato come consegna finale |

Prove: unità Automazioni 5/5; percorsi vivo 15/15 (5 scenari x3: originale, vuoto reale, persistenza/filtri/disclosure, creazione, recupero). Componenti completi 45/45 su 4178. Statico: prima corsa 194/195, unico errore filesystem UNKNOWN scrivendo toast-1440.png; caso identico ripetuto senza edit 1/1. Copertura finale 195 casi superati, non dichiarata prima corsa interamente verde. Verify 350/351: unico PHASE3-TOKEN-CONTRACT-01 preesistente, stesso problema già misurato prima degli edit. Build deterministica 30 asset; diff --check verde. Log Temp/astra-automation-verify.log e Temp/astra-automation-lab.log.

Immagini: 33 finali +3 iniziali in .claude/immagini/astra-fase2/AutomationRow/, tutte aperte; confronto mockup/componente dark e app/originale light a 1440/1280/1024. Ulteriore apertura e screenshot manuale nel browser integrato su 4177, dark, vuoto reale. Nessun audit Hermes GUI. Originale contiene anche scorciatoia statica al task sconto-a-scaglioni, separata dalle automazioni API: task assente nel catalogo locale; non presentata come schedulazione disponibile.
Blocchi riusati AutomationsScreen, Topbar di pagina, Page, Toolbar, FilterChips, AutomationRow; nuovi blocchi/token/simboli 0/0/0. CSS due regole circoscritte nel mockup per titolo e valori lunghi, template/CSS generati. Sorgente legacy toccato solo renderAutomationsReali e helper dedicati, import; creazione, widget, backend, ponte, frammenti e superfici Claude conservati.

Cosa deve fare l'owner · Nessuna azione per proseguire; può provare Altro → Automazioni su http://127.0.0.1:4177/.
Cosa fai tu dopo · B4 Capability; B7 chiuderà il difetto visivo del modulo di creazione prima della consegna completa.
Cosa rimane · B4 → B6 → B2 → B7 → B1 → B8 e Browser vero a schede; contratto CSS condiviso; runtime per gate chat naturale, poi OAuth e piano computer-use. Nessun push.

## Raccordo dopo merge 6e0154e8 — 05/09/2026
Upstream 18212e09 +96f02a69 elimina lo strato parallelo (decisione owner), compreso il vecchio test TOKEN-CONTRACT, e sposta nomi-attrezzi.js in components. RED build: Officina importa ancora ../app/nomi-attrezzi.js. File esatti di correzione: harness-ui/frontend/src/components/officina.js (solo import), harness-ui/frontend/src/components/automazioni.js (solo spazio finale riga 30), questo ledger e CONSEGNA-ASTRA-FASE-2-2026-09-05.md. Nessun simbolo pubblico o comportamento cambia. Ricerca 05/09: riaperte le tre release 29112be/d7dbd9a/3d2ee51 e docs di tool inventory già citate; decisione adattare al percorso canonico deciso upstream, nessuna libreria alternativa per una rilocazione. +1 richiesto: unico dizionario umano importabile, nessuna duplicazione. Gate permanente PHASE1-BUILD-PARALLEL-01 + unità Officina + parità ForgeList. La frase precedente diff pulito era prematura: il controllo cached ha segnalato uno spazio finale, il proxy non mostrava il messaggio; corretto qui, nessuna riscrittura dei commit.

Raccordo verificato: npm run verify interamente verde (build, contratti/unità, determinismo 30 file, laboratorio 195/195); parità ForgeList 3/3. La rimozione del vecchio test CSS arriva dal commit upstream che elimina lo strato parallelo, non da un aggiramento locale. Corretto un import dopo la rilocazione del dizionario e uno spazio finale; nessun cambiamento visivo.
Cosa deve fare l'owner · Nulla.
Cosa fai tu dopo · Capability.
Cosa rimane · B4, B6, B2, B7, B1, B8 e Browser; poi OAuth e piano computer-use.

## B4.1 ToolList e DetailPanel — piano prima degli edit, 05/09/2026
Owner TALOS UI. Base 9f12edd; merge lane/harness-desktop aggiornato. Originale aperto nel browser 4179, dialogo Strumenti, skill e connettori: dieci sezioni, permessi in foglio separato; catalogo non osservabile perché runtime non configurato. Non spacciare le sei righe fixture per i 43 attrezzi dell'owner. Skill/MCP/plugin/hook saranno il prossimo componente B4; i loro canali originali restano disponibili durante il raccordo.

Ricerca fresca, finestra 06/08–05/09. Release verificate: Hermes v0.21.0 del 31/08 commit29112be https://github.com/NousResearch/hermes-agent/releases/tag/v2026.8.31 ; Claude Code v2.1.261 del 04/09 d7dbd9a https://github.com/anthropics/claude-code/releases/tag/v2.1.261 ; Codex0.153.4 del04/09 3d2ee51 https://github.com/openai/codex/releases/tag/rust-v0.153.4 . Documenti stabili riverificati oggi, data aggiornamento non esposta: https://hermes-agent.nousresearch.com/docs/user-guide/features/tools/ ; https://code.claude.com/docs/en/permissions ; https://developers.openai.com/codex/mcp (redirect ufficiale learn.chatgpt.com/docs/extend/mcp?surface=cli); WAI https://www.w3.org/WAI/ARIA/apg/patterns/listbox/ e https://www.w3.org/WAI/ARIA/apg/patterns/tabs/ .

| Confronto | Forza documentata | Limite verificato / gap | Decisione e +1 misurabile TALOS |
|---|---|---|---|
| Hermes | Inventario derivato dal codice, toolset per piattaforma; release mostra schema e uso MCP | Disponibilità dipende da credenziali/configurazione; non svolto audit GUI in questo passo | Adattare distinzione offerto/dipendenza/permesso con stato mancante esplicito e filtro; non inventare prestazioni |
| Claude | Regole deny/ask/allow, precedenza esplicita e enforcement | Nomi visibili e canonici possono differire; docs segnalano regole scritte sul nome visibile non corrispondenti | Adattare selezione su nome umano, POST usa id canonico catturato; nessuna sintassi da digitare; 4 scelte persistite e rilette |
| Codex | Allow/deny list, policy per tool, timeout e attivazione server distinti | Modello di configurazione con più livelli; nessuna prova qui di suo fallimento UI | Adattare confini distinti e ambito accanto al selettore; non importare config TOML nel dominio TALOS |
| WAI | Listbox tastiera + dettaglio separato dalle opzioni | Un'opzione non contiene controlli interattivi annidati | Adottare frecce/Home/End, focus conservato; selettore nativo nel dettaglio |

Obiettivi: tutti i campi originali preservati, descrizione intera leggibile senza hover, filtro per nome umano/descrizione, nessun numero di costo o uso inventato, stima incompleta dichiarata. Permessi per cinque attrezzi configurabili, stesso endpoint settings e chiave esistente; nessun controllo spegni inventato. Nessuna nuova dipendenza. Backend e 43 upstream non eseguibili in ambiente: prova HTTP+session-registry+JSONL reali con catalogo fixture dichiarato, nessun modello.

File esatti:
- .claude/MOCKUP-REDESIGN-TALOS-2026-09-04.html
- .claude/LEDGER-ASTRA-FASE-2-2026-09-05.md
- .claude/CONSEGNA-ASTRA-FASE-2-2026-09-05.md
- harness-ui/frontend/src/components/capability.js
- harness-ui/frontend/src/legacy/app.js
- harness-ui/frontend/index.template.html
- harness-ui/frontend/src/styles/index.css
- harness-ui/frontend/lab/fixtures/capability.js
- harness-ui/frontend/lab/main.js
- harness-ui/frontend/tests/unit/capability.test.mjs
- harness-ui/frontend/tests/parity/componenti.spec.mjs
- harness-ui/frontend/tests/parity/capability-backend-fixture.mjs
- harness-ui/frontend/tests/parity/capability-vivo.spec.mjs
- harness-ui/frontend/playwright.astra.config.mjs
Pubblici nuovi: permessoAttrezzo, stimaSchemaAttrezzi, filtraAttrezzi, creaToolListRow, aggiornaPaginaCapability; fixture ATTREZZI; helper test avviaCapabilityDiProva. Compatibilità: caricaPannelloAttrezzi/rigaAttrezzo, setView dispatch proprio, sincronizzaImpostazioniSessione invariato, nomiUmanoAttrezzo canonico invariato. Helper locali mostraCapability e salvaPermessoCapability. Nessuna modifica ponte/main/frammenti/kernel/public/chat.
RED CAP-STIMA-SCONOSCIUTA/CAP-PERMESSO/CAP-FILTRO senza modulo; CAP-VUOTO prima innesto conserva dati finti. GREEN node --test tests/unit/capability.test.mjs; componente ToolList x3; playwright.astra capability-vivo x3; npm run verify + componenti4178. Scenari: CAP-ORIGINALE screenshot dati equivalenti; CAP-PERSISTENZA ricerca/selezione/quattro scelte POST e reload; CAP-RECUPERO null/503/salvataggio fallito/cambio selezione/navigazione. Foto originali/app/stati a1440/1280/1024 in .claude/immagini/astra-fase2/ToolList/, aperte prima del verdetto. Rollback del solo commit, nessuna migrazione né modifica dati owner.

## R-02 — correzione prioritaria, 05/09/2026
Sei pagine e undici mockup ACCETTATI e UNITI, come PROMPT-ASTRA-2026-09-05-R02-SEI-PAGINE.md. Nuovo merge fatto prima degli edit. Automazioni già consegnata d5dfbb76 con prove e immagini; import dizionario corretto9f12edd e verify verde. B4 in preparazione (test non ancora verdi, nessun innesto).
Problema misurato: parita.spec.mjs e gli otto test vivi di Astra scrivono direttamente nelle immagini di consegna. Ricerca fresca finestra06/08–05/09: Playwright1.62.1 locale; https://playwright.dev/docs/test-snapshots e https://playwright.dev/docs/api/class-testinfo#test-info-output-path riverificati oggi (docs stabili, data modifica non esposta). Distinguere baseline approvate da output runtime; adottare artifacts già ignorata, conservare nomi, pixel e soglie. Riaperte release Hermes29112be31/08, Clauded7dbd9a04/09, Codex3d2ee5104/09 agli URL del B4. Forza: evidenze/versioni verificabili; non è documentata da queste release la loro politica locale delle PNG, gap esplicito. Nessuna debolezza inventata. +1 misurabile qui: zero immagini di consegna riscritte dal cancello, tutti gli output ancora disponibili. Non occorre una nuova libreria né modificare UI.
File esatti:
- harness-ui/frontend/tests/parity/attivita-vivo.spec.mjs
- harness-ui/frontend/tests/parity/automazioni-vivo.spec.mjs
- harness-ui/frontend/tests/parity/board-vivo.spec.mjs
- harness-ui/frontend/tests/parity/libreria-vivo.spec.mjs
- harness-ui/frontend/tests/parity/memoria-vivo.spec.mjs
- harness-ui/frontend/tests/parity/officina-vivo.spec.mjs
- harness-ui/frontend/tests/parity/parita.spec.mjs
- harness-ui/frontend/tests/parity/ricerca-vivo.spec.mjs
- harness-ui/frontend/tests/unit/test-artifacts.test.mjs
- .claude/LEDGER-ASTRA-FASE-2-2026-09-05.md
- .claude/CONSEGNA-ASTRA-FASE-2-2026-09-05.md
Anche capability-vivo.spec.mjs appena creato passa ad artifacts, ma resta fuori da questo commit perché B4 aperta. Nessun nuovo simbolo pubblico. Test RED permanente R02-ARTEFATTI-SEPARATI: i produttori sotto tests/parity non puntano alla cartella delle consegne; GREEN node --test tests/unit/test-artifacts.test.mjs, npm run test:lab195/195 e confronto SHA256 di tutte le PNG prima/dopo. Nessuno screenshot nuovo richiesto, pixel invariati. La copia delle sole prove scelte in .claude/immagini avverrà esplicitamente alla consegna. Rollback del commit sui soli test/docs.

| Stato | Proposta | Parità da valutare | +1 da dimostrare | Costo |
|---|---|---|---|---|
| PROPOSTA, non implementare | Accesso account Anthropic e ChatGPT | Flussi documentati Hermes/Codex e possibilità ufficiali dei fornitori | Accesso recuperabile e stato account esplicito senza perdita dei percorsi API | Non misurato |
| PROPOSTA, non implementare | Computer-use integrato e ricognizione tecnica dettagliata | ChatGPT, Hermes, Claude e Codex, API/permessi reali | Piano eseguibile con prove per backend, frontend, controllo owner e recupero | Non misurato |
Promozione riservata all'owner, una proposta alla volta; nessuna implementazione né dossier ora. Coda vincolante: B4→B6→B2→B7→B1→B8→Browser K-I. Cutover/contratto K-A…K-I all'orchestratore.

B4 preparazione: primo confronto originale interrotto per recepire R02; selettore del test corretto da data-tool-permission a data-tool-permission-select, e apertura inspector compatto esplicita a1024. Nessun bug prodotto corretto per far passare il test. Output ora artifacts/astra-fase2/ToolList; copia manuale alla consegna.

R-02 verificata: regressione RED→GREEN1/1; statico195/195 a1440/1280/1024. SHA256 prima/dopo:472 PNG identiche, zero nuovi file nella cartella consegne. Output di esecuzione presenti in artifacts/astra-mockup; nessuna modifica UI né screenshot da promuovere in questa correzione. Diff --check verde. Restano fuori staging le PNG già sporche prima della correzione: non riscrivo prove approvate né modifiche altrui.
Cosa deve fare l'owner · Nulla.
Cosa fai tu dopo · Capability.
Cosa rimane · B4→B6→B2→B7→B1→B8→Browser K-I. OAuth e computer-use solo PROPOSTE.

B4 ripresa dopo R02: merge aggiornato e fonti Hermes Tools, Claude Permissions, Codex MCP, WAI Listbox riverificate05/09 prima del renderer. Prime4 PNG originali aperte: inventario con6 righe, uso reale della sessione copiato, permessi in seconda modale; testi molto piccoli. Obiettivo: selettore nel dettaglio e descrizione leggibile; confronto1024 ancora in corso, nessun verdetto anticipato.

CAP-ORIGINALE1024: trace mostra inspector fuori viewport, ma isVisible=true (solo CSS). Il test ora apre esplicitamente la colonna compatta alla larghezza originale≤1040, senza force-click né mutazioni DOM. Renderer non ancora innestato.

Parità RED sulle sole parole: separatore delle migliaia della fixture manuale (1.601) differente da Intl it-IT di Chrome (1601 per quattro cifre). Allineato il numero dimostrativo al formatter runtime, nessuna soglia o test cambiati.

QA visiva ToolList: tre immagini app aperte; parità3/3 ma CAP-STIMA-PREFISSO raddoppiava ~ perché il token CSS lo aggiunge già. CAP-LISTA-LUNGA: senza limite 43 voci spingerebbero il dettaglio troppo lontano a1024. Batch corretto prima innesto: un solo prefisso, aside su colonna, lista scrollabile entro480px; nessun dato rimosso. Ricerca MDN overflow https://developer.mozilla.org/en-US/docs/Web/CSS/overflow e tre fonti competitor B4 riaperte05/09; adattare scorrimento nativo + listbox WAI, beneficio atteso dettaglio raggiungibile senza scorrere43 righe. Test permanenti nel cancello ToolList: testo non contiene ~ nelle span stimate (pseudo-elemento CSS), lista lunga resta≤480px e ultima voce raggiungibile via End.
CAP-VUOTO RED osservato a1280 prima innesto: dati finti non sostituiti.

Prima dell’innesto: merge e fonti permessi dei tre comparatori riaperte05/09. Adattare endpoint e coda salvataggio esistenti; GET validato distingue null/errore/vuoto, risposte obsolete scartate per generazione e sessione; POST cattura id e nome, blocco globale fino a rilettura. UI mantiene stato confermato, errore visibile e nuovo tentativo. Sincronizzazione locale rollback sul solo attrezzo della stessa sessione in caso di POST fallito; nessuna nuova chiave né endpoint.

Regressioni permanenti CAP-SELEZIONE-DOPO-SALVATAGGIO e CAP-FOCUS-SALVATAGGIO riprodotte nel test CAP-PERSISTENZA (dato salvato corretto, dettaglio tornava al primo attrezzo). Ricerca WAI keyboard-interface https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/ e tre fonti B4 riaperte05/09, merge fatto. Decisione: conservare inventario confermato durante refresh nella stessa sessione, mai azzerare selezione durante loading; ripristinare il fuoco solo se era sul selettore, non se la persona è passata a un altro controllo. Correzione nei soli capability.js e caricaPannelloAttrezzi/salvaPermessoCapability. Rollback del valore al dato confermato del catalogo, non a una preferenza locale vecchia.

Raffinamento della prova equivalente: la fixture iniziale tools aveva permessi espliciti, ma il dialogo originale legge la sessione copiata (Full access, nessuna eccezione). Allineata la sessione isolata a questi valori iniziali per rendere coerenti inventario e dialogo originale. Le quattro scelte vengono poi applicate davvero via POST nella prova nuova. Nessuna modifica dati owner.

## B4.1 consegna ToolList + DetailPanel — 05/09/2026
Componente innestato sul catalogo HTTP e sul salvataggio impostazioni esistente. Ricerca per nome umano e tecnico, tre filtri, descrizione integra, stima e dipendenza separate dal permesso, quattro scelte con conferma server, ricarica e recupero. Nessuna nuova dipendenza, token, icona o blocco; riusati ToolList, DetailPanel, Toolbar, FilterChips, ScopeNote, PendingList. Quattro regole CSS circoscritte nel mockup canonico; template/CSS rigenerati.

| Aspetto | Originale → proposta | Prova e verdetto |
|---|---|---|
| Copertura | Inventario nel foglio + permessi in altro foglio → selettore nel dettaglio, canale originale conservato | Quattro valori, POST/registry/JSONL/reload verificati. B4.1 funzionale; B4 completa ancora aperta |
| Chiarezza | Descrizioni e uso piccoli nella modale → testo intero e separazione offerto/dipendenza/policy | Originale e app con sei voci equivalenti aperti alle tre larghezze; beneficio leggibilità e ricerca |
| Accesso | Lista senza selezione → frecce/Home/End e selettore nativo | Fuoco mantenuto dopo salvataggio senza rubarlo se la persona si sposta; test permanente |
| Responsive/densità | Modale centrata → lista/dettaglio affiancati a1440/1280, sovrapposti a1024 | A1280 la sesta riga con uso può richiedere scroll interno; ricerca mostra un risultato e dettaglio. Non si afferma meno passi in ogni situazione |
| Errori | Toast generico → errore persistente con nome attrezzo e ripristino valore confermato | GET503/null e POST503, selezione diversa e Board/ritorno provati. Toast legacy ancora privo di stile: scenario B7-TOAST-FUORI-REGIONE, da chiudere prima del cutover |
| Persistenza e latenza | Endpoint invariato → azioni serializzate e risposta obsoleta scartata | Salvataggio HTTP vero su registry e file isolati; nessun benchmark di velocità dichiarato |

Verifiche finali: unità Capability3/3; componenti48/48; prova app12/12 a1440/1280/1024; npm run verify verde: build,53 unità/contratti, determinismo30file, statico195/195. Diff --check verde. Parità ToolList: immagini a1440/1280 identiche SHA256;1024 sotto soglia invariata, aperte entrambe. Aperto anche browser reale4177: runtime assente correttamente dichiarato, nessun falso catalogo. Le sei voci del test sono fixture dichiarate; API/registry/JSONL sono reali. Catalogo completo43 e chiamata al modello non verificati perché runtime locale non configurato: nessuna superiorità su tale copertura dichiarata. CAP-LISTA-LUNGA verifica altezza480 e End su sei voci, non uno stress test43.
Prove selezionate e aperte, copiate manualmente da artifacts (23 PNG):
- .claude/immagini/astra-fase2/ToolList/app-catalogo-1024.png
- .claude/immagini/astra-fase2/ToolList/app-catalogo-1280.png
- .claude/immagini/astra-fase2/ToolList/app-catalogo-1440.png
- .claude/immagini/astra-fase2/ToolList/app-dettaglio-1024.png
- .claude/immagini/astra-fase2/ToolList/app-dettaglio-1280.png
- .claude/immagini/astra-fase2/ToolList/app-dettaglio-1440.png
- .claude/immagini/astra-fase2/ToolList/app-dipendenza-1440.png
- .claude/immagini/astra-fase2/ToolList/app-errore-lettura-1440.png
- .claude/immagini/astra-fase2/ToolList/app-errore-salvataggio-1440.png
- .claude/immagini/astra-fase2/ToolList/app-non-osservabile-1440.png
- .claude/immagini/astra-fase2/ToolList/app-ricaricata-1440.png
- .claude/immagini/astra-fase2/ToolList/originale-catalogo-1024.png
- .claude/immagini/astra-fase2/ToolList/originale-catalogo-1280.png
- .claude/immagini/astra-fase2/ToolList/originale-catalogo-1440.png
- .claude/immagini/astra-fase2/ToolList/originale-permessi-1024.png
- .claude/immagini/astra-fase2/ToolList/originale-permessi-1280.png
- .claude/immagini/astra-fase2/ToolList/originale-permessi-1440.png
- .claude/immagini/astra-fase2/ToolList/comp-ToolList-desktop-1440x900-mockup.png
- .claude/immagini/astra-fase2/ToolList/comp-ToolList-desktop-1440x900-app.png
- .claude/immagini/astra-fase2/ToolList/comp-ToolList-desktop-1280x800-mockup.png
- .claude/immagini/astra-fase2/ToolList/comp-ToolList-desktop-1280x800-app.png
- .claude/immagini/astra-fase2/ToolList/comp-ToolList-desktop-1024x800-mockup.png
- .claude/immagini/astra-fase2/ToolList/comp-ToolList-desktop-1024x800-app.png
Cosa deve fare l’owner · Nulla per continuare; prova su http://127.0.0.1:4177/ → Capability.
Cosa fai tu dopo · B4 Skill/Connettori/Plugin/Hook, poi coda R02.
Cosa rimane · B4 estensioni; B6; B2; B7 (anche modulo creazione automazioni e ToastRegion); B1; B8; Browser K-I. OAuth/computer-use restano PROPOSTE. Nessun push.

## B4.2 ExtensionList — piano prima degli edit, 05/09/2026
Owner TALOS UI; merge lane/harness-desktop eseguito dopo8f1674a. Scope: Skill, Connettori MCP, Plugin e Hook della pagina Capability, conservando i quattro canali originali. Componente unico di inventario con lista/dettaglio, ricerca, tastiera, stati vuoto/errore/fiducia, aggiornamento e fiducia via endpoint esistenti. Nessun kernel/processo avviato, nessuna nuova API né store.
Ricerca fresca06/08–05/09: riaperte le release Hermes v2026.8.31/29112be31/08, Claude Code v2.1.261/d7dbd9a04/09, Codex rust-v0.153.4/3d2ee5104/09 agli URL del B4.1. Docs stabili verificate oggi (data modifica non esposta): https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins ; https://code.claude.com/docs/en/plugins ; https://code.claude.com/docs/en/hooks-guide ; https://developers.openai.com/codex/hooks (redirect ufficiale https://learn.chatgpt.com/docs/hooks); https://www.w3.org/WAI/ARIA/apg/patterns/tabs/ .
| Comparatore | Forza | Limite/gap verificato | Decisione e +1 misurabile |
|---|---|---|---|
| Hermes | Inventario distinto enabled/disabled/not enabled, consenso per plugin e scansione | I pack elencano skill ma non le installano automaticamente (gap documentato); non misurata la GUI | Adattare distinzione inventario/fiducia/esecuzione; non importare marketplace né suggerire installazione inesistente. Ogni tab mostra solo capacità API reali |
| Claude Code | Plugin raggruppano componenti, diagnostica errori e reload documentati | Hook eseguibili richiedono sorgenti fidate; nessuna garanzia di sicurezza da installazione | Adattare avvisi e metadati leggibili prima della fiducia; preservare warnings dopo trust; azioni isolate per id/sessione |
| Codex | Fiducia associata a hash hook, modifiche richiedono nuova review | Attivare plugin non implica fidare hook; nessun difetto UI inventato | Adattare stato Fidato esplicito, mai Attivo; verificare reload e invalidazione hash nel registry TALOS |
| WAI | Tab con focus e selezione distinti per pannelli caricati a richiesta | Attivazione automatica con rete può rallentare navigazione | Adottare frecce/Home/End per focus, Enter/Spazio per attivare; lista/dettaglio separati |
Backend letto: skill-registry, mcp-registry, plugin-registry, hook-registry, session-registry. MCP API espone comando/argomenti/allowlist; plugin espone hook/tool e avvisi; hook espone solo id/eventi/fidato, non il comando: non fingere una review del comando. Fiducia hook legata solo al comando, MCP alla dichiarazione, plugin al manifesto; nessuna modifica del confine in questo lavoro. Scope del registro fiducia macchina/id, non inventare isolamento per progetto.
File esatti:
- .claude/MOCKUP-REDESIGN-TALOS-2026-09-04.html
- .claude/LEDGER-ASTRA-FASE-2-2026-09-05.md
- .claude/CONSEGNA-ASTRA-FASE-2-2026-09-05.md
- harness-ui/frontend/src/components/estensioni.js
- harness-ui/frontend/src/legacy/app.js
- harness-ui/frontend/index.template.html
- harness-ui/frontend/src/styles/index.css
- harness-ui/frontend/lab/fixtures/estensioni.js
- harness-ui/frontend/lab/main.js
- harness-ui/frontend/tests/unit/estensioni.test.mjs
- harness-ui/frontend/tests/parity/componenti.spec.mjs
- harness-ui/frontend/tests/parity/estensioni-backend-fixture.mjs
- harness-ui/frontend/tests/parity/estensioni-vivo.spec.mjs
- harness-ui/frontend/playwright.astra.config.mjs
Pubblici nuovi: datiEstensione, filtraEstensioni, creaExtensionRow, aggiornaEstensioni, collegaSchedeCapability, mostraSchedaCapability; fixture ESTENSIONI; helper avviaEstensioniDiProva. Locali monolite caricaCapability, caricaEstensioniCapability, fidaEstensioneCapability; preservare caricaPannelloSkill/Mcp/Plugin/Hooks e rigaSkill/rigaServerMcp/rigaPlugin/rigaHook.
RED EXT-STATO/EXT-DETTAGLI/EXT-RICERCA senza modulo; EXT-PAGINE prima innesto tab non presenti. GREEN node --test tests/unit/estensioni.test.mjs; test componenti ExtensionList quattro tipi x3; playwright.astra estensioni-vivo x3; verify e componenti4178. Scenari permanenti EXT-ORIGINALE, EXT-FIDUCIA-PERSISTITA, EXT-HASH-CAMBIATO, EXT-AVVISI-CONSERVATI, EXT-RECUPERO, EXT-RISPOSTA-OBSOLETA. HTTP/registry/manifeste e fiducia su file temporanei reali; zero sottoprocessi delle estensioni eseguiti. Originale prima edit e proposta dopo a1440/1280/1024, tutte le prove dichiarate aperte. Screenshot in artifacts/astra-fase2/ExtensionList, selezione manuale alla consegna. Rollback del solo commit, nessuna migrazione.

EXT-ORIGINALE: aperte sei PNG a1440/1280/1024: skill/MCP/plugin insieme, Hook nel foglio Control. Stato fidato etichettato attivo senza prova esecuzione; MCP non mostra argomenti, hook eventi tecnici. RED unità modulo assente osservato; EXT-PAGINE attende tab Skill inesistente.

EXT-REGIA-JSON: primo confronto12/12 rosso perché la navigazione era stata inserita per errore nello script dati JSON. Ricerca MDN script + tre docs competitor riaperte05/09: separare dati e codice, nessun token modificato. Sposto le sole righe nuove nello script regia esistente. EXT-ICONA-ESISTENTE: i-link non appartiene allo sprite canonico, riuso i-globe; test permanentemente verifica la destinazione di ogni use del componente.

Prima dell’innesto B4.2: merge e tre fonti plugins/hooks riaperte05/09. Il componente ora coincide nelle prime cinque prove; nessuna nuova dipendenza. Collegamento a GET/POST invariati con generazione per sezione e sessione catturata. Fiducia confermata soltanto dalla rilettura; nessuna azione mentre un salvataggio è in corso.

QA visiva prima versione: aperte quattro schermate app1440. EXT-ETICHETTE-INTEGRE: le chiavi lunghe del dettaglio (Attrezzi ammessi/Istruzioni complete) ereditano ellissi dal KV, da correggere con wrapping circoscritto. EXT-FOCUS-FIDUCIA: dopo Fida il bottone sparisce; prevedere fuoco sul titolo del dettaglio solo se la persona non si è spostata. Test RED aggiunti prima della correzione.

Correzione EXT-FOCUS-FIDUCIA dopo RED: ricerca WAI keyboard-interface e MDN white-space con tre fonti competitor B4.2 riaperte05/09. Ripristino fuoco sul titolo solo se era sul bottone della stessa voce/sessione e nessun altro controllo lo ha preso; chiavi KV complete senza ellissi. File corretti estensioni.js e mockup, poi generazione; nessun handler condiviso modificato.

## B4.2 consegna ExtensionList — 05/09/2026
Skill, Connettori MCP, Plugin e Hook innestati negli endpoint originali. Ricerca per nome, id e metadati, dettaglio completo dei dati disponibili, tab e lista da tastiera, errori persistenti, aggiornamento e fiducia confermata dal server. Riusati Page, Tabs, Toolbar, ToolList, DetailPanel, KeyValue e badge; zero nuovi blocchi, token, icone o dipendenze. Quattro regole CSS circoscritte per lista e testo intero; template/CSS rigenerati. Locale aggiunto anche mostraInventarioEstensioni; sei export del piano invariati.

| Aspetto | Originale → proposta | Prova e verdetto |
|---|---|---|
| Copertura | Inventari nel foglio Control/Capability → quattro pannelli con gli stessi GET e POST trust | Skill senza fiducia inventata; comando/argomenti/allowlist MCP, tool/hook/avvisi plugin, eventi hook presenti. Canali originali conservati |
| Semantica | Etichetta attivo derivata dalla fiducia → Fidato/Da fidare | Fiducia non significa connessione o esecuzione. Per hook il comando non è esposto dall’API: percorso di origine e limite dichiarati |
| Chiarezza | Righe piccole senza ricerca → filtro, descrizione e metadati leggibili | Originale e proposta aperti a1440/1280/1024; etichette senza troncamento dopo correzione |
| Azioni e accessibilità | Fida sulla riga → selezione e revisione del dettaglio prima di Fida | Per altre righe può aggiungere un passo: beneficio è leggere i dati prima di fidare, non una riduzione universale. Tab manuali, frecce/Home/End; fuoco ritorna al dettaglio confermato |
| Stato, errori e recupero | Risposta effimera → errore persistente con bersaglio e retry | Manifesto corrotto/riparato reali, POST503 controllato, nessuna falsa conferma e nessuna scrittura concorrente |
| Persistenza | Registro esistente → stesso id/hash | MCP/plugin/hook restano fidati dopo reload, manifesto MCP cambiato richiede nuova fiducia; warnings plugin restano visibili |
| Responsive | Modale → affiancati a1440/1280, sovrapposti a1024 | Fida raggiungibile; testi interi. Nessun benchmark di latenza o confronto prestazionale dichiarato |

Verifiche: unità4/4; componenti60/60; prova app15/15 alle tre larghezze; persistenza rafforzata dopo reload per tutti e tre i tipi nuovamente3/3. npm run verify verde (build, contratti/unità, determinismo e statico195/195). Prove HTTP con createHttpApp, registry, manifesti e file di fiducia reali in directory temporanee isolate; contenuti di esempio dichiarati, nessuna estensione o processo MCP eseguiti. Istanza4177 senza cataloghi mostra vuoto onesto. Nessuna superiorità end-to-end sui competitor dichiarata: i +1 documentati sono i criteri locali verificati.
Regressioni permanenti chiuse: EXT-REGIA-JSON, EXT-ICONA-ESISTENTE, EXT-ETICHETTE-INTEGRE, EXT-FOCUS-FIDUCIA, EXT-RISPOSTA-OBSOLETA, EXT-RECUPERO. Limite ereditato: trust macchina/id (non isolamento progetto); hash hook sul comando. Nessuna modifica backend.
Prove selezionate e aperte, copiate manualmente da artifacts (29 PNG):
- .claude/immagini/astra-fase2/ExtensionList/app-skills-1440.png
- .claude/immagini/astra-fase2/ExtensionList/app-mcp-1440.png
- .claude/immagini/astra-fase2/ExtensionList/app-plugins-1440.png
- .claude/immagini/astra-fase2/ExtensionList/app-hooks-1440.png
- .claude/immagini/astra-fase2/ExtensionList/originale-plugins-1440.png
- .claude/immagini/astra-fase2/ExtensionList/originale-hooks-1440.png
- .claude/immagini/astra-fase2/ExtensionList/app-skills-1280.png
- .claude/immagini/astra-fase2/ExtensionList/app-mcp-1280.png
- .claude/immagini/astra-fase2/ExtensionList/app-plugins-1280.png
- .claude/immagini/astra-fase2/ExtensionList/app-hooks-1280.png
- .claude/immagini/astra-fase2/ExtensionList/originale-plugins-1280.png
- .claude/immagini/astra-fase2/ExtensionList/originale-hooks-1280.png
- .claude/immagini/astra-fase2/ExtensionList/app-skills-1024.png
- .claude/immagini/astra-fase2/ExtensionList/app-mcp-1024.png
- .claude/immagini/astra-fase2/ExtensionList/app-plugins-1024.png
- .claude/immagini/astra-fase2/ExtensionList/app-hooks-1024.png
- .claude/immagini/astra-fase2/ExtensionList/originale-plugins-1024.png
- .claude/immagini/astra-fase2/ExtensionList/originale-hooks-1024.png
- .claude/immagini/astra-fase2/ExtensionList/app-fidata-plugins-1440.png
- .claude/immagini/astra-fase2/ExtensionList/app-modificata-1440.png
- .claude/immagini/astra-fase2/ExtensionList/app-errore-fiducia-1440.png
- .claude/immagini/astra-fase2/ExtensionList/app-errore-lettura-1440.png
- .claude/immagini/astra-fase2/ExtensionList/app-vuota-1440.png
- .claude/immagini/astra-fase2/ExtensionList/comp-ExtensionList_mcp-desktop-1440x900-mockup.png
- .claude/immagini/astra-fase2/ExtensionList/comp-ExtensionList_mcp-desktop-1440x900-app.png
- .claude/immagini/astra-fase2/ExtensionList/comp-ExtensionList_mcp-desktop-1280x800-mockup.png
- .claude/immagini/astra-fase2/ExtensionList/comp-ExtensionList_mcp-desktop-1280x800-app.png
- .claude/immagini/astra-fase2/ExtensionList/comp-ExtensionList_mcp-desktop-1024x800-mockup.png
- .claude/immagini/astra-fase2/ExtensionList/comp-ExtensionList_mcp-desktop-1024x800-app.png
Cosa deve fare l’owner · Nulla per proseguire; può provare Capability su http://127.0.0.1:4177/.
Cosa fai tu dopo · B6 Diagnostica, Impostazioni e Model Lab.
Cosa rimane · B6→B2→B7 (anche creazione automazioni e ToastRegion)→B1→B8→Browser K-I. OAuth/computer-use restano PROPOSTE. Nessun push.

## B6.1 Doctor — piano prima degli edit, 05/09/2026
Merge lane/harness-desktop aggiornato dopo cad3d10. TALOS UI: SeverityCount/CheckCard sui dati GET /api/v1/doctor; nessun backend né contratto nuovo. Letti doctor.mjs, doctor.test.mjs, eseguiDoctor/riassuntoDoctor e risposta vera4177. Rimpiazzare esempi non osservabili (versioni, peso store, suite) con dati del contratto. Conservare tutti i segnali originali e aggiungere dettaglio, gravità, istante di ricezione, JSON scaricabile e recupero persistente. Le azioni di riparazione senza rotta non vengono promesse.
Ricerca fresca06/08–05/09: release Hermes v2026.8.31/29112be31/08, ClaudeCode v2.1.261/d7dbd9a04/09, Codex rust-v0.153.4/3d2ee5104/09 riaperte agli URL B4.1. Fonti stabili riverificate05/09 (data aggiornamento non esposta): https://hermes-agent.nousresearch.com/docs/getting-started/installation ; https://code.claude.com/docs/en/debug-your-config ; https://developers.openai.com/codex/app/troubleshooting → https://learn.chatgpt.com/docs/reference/troubleshooting ; https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html .
| Fonte | Forza | Limite/gap documentato | Decisione / +1 da verificare |
|---|---|---|---|
| Hermes | Doctor distingue metodo installazione e dipendenze mancanti | Ambienti/service PATH diversi richiedono rimedi diversi; GUI non misurata | Adattare contesto ambiente esplicito; desktop non spacciato per WSL2, nessuna riparazione generica |
| Claude Code | Doctor valida configurazione; comandi dedicati mostrano cosa è caricato | Configurazione corretta non implica MCP avviato o hook eseguito | Adattare distinzione configurato/verificato/non osservato in ogni scheda; nessun falso successo |
| Codex | Diagnostica con log e passaggi di recupero | CLI e desktop possono avere versioni differenti; log da rivedere prima di condividere | Adattare prova ricevuta esportabile localmente senza raccolta log o invio automatico; non inventare versioni mancanti |
| WAI | role=status/alert rende esiti annunciabili | Troppe live region generano rumore | Adottare una sola sintesi status e un solo errore; niente focus rubato dal controllo asincrono |
File esatti:
- .claude/MOCKUP-REDESIGN-TALOS-2026-09-04.html
- .claude/LEDGER-ASTRA-FASE-2-2026-09-05.md
- .claude/CONSEGNA-ASTRA-FASE-2-2026-09-05.md
- harness-ui/frontend/src/components/doctor.js
- harness-ui/frontend/src/legacy/app.js
- harness-ui/frontend/index.template.html
- harness-ui/frontend/src/styles/index.css
- harness-ui/frontend/lab/fixtures/doctor.js
- harness-ui/frontend/lab/main.js
- harness-ui/frontend/tests/unit/doctor.test.mjs
- harness-ui/frontend/tests/parity/componenti.spec.mjs
- harness-ui/frontend/tests/parity/doctor-vivo.spec.mjs
- harness-ui/frontend/playwright.astra.config.mjs
Nuovi export: controlliDoctor, contaGravitaDoctor, creaCheckCard, aggiornaDoctor; fixture DOCTOR e ADESSO_DOCTOR. Locali paginaDoctor, caricaDoctor, esportaDoctor; eseguiDoctor e riassuntoDoctor restano simboli compatibili; refreshDoctorBadge riusa sintesi. CheckCard copia struttura canonica, nessuna libreria nuova.
RED DOCTOR-SEMANTICA (desktop e naviga/configurazione non equivalgono a verifica remota), DOCTOR-PARZIALE, DOCTOR-SCARTI, DOCTOR-INVALIDO e DOCTOR-PAGINA prima innesto. GREEN node --test tests/unit/doctor.test.mjs; componenti CheckCard x3, doctor-vivo x3, npm run verify, intero cancello componenti4178. Flusso originale attivato da Control; pagina nuova dalla nav e da Control; ricarica, fallimento GET, retry, esportazione del dato visto. Prova dati veri4177 e risposte controllate per errori; non si dichiara nuovo test modello o connessione provider. Foto originale/proposta a1440/1280/1024 in artifacts/astra-fase2/Doctor, apertura manuale e sole prove scelte in .claude/immagini alla consegna. Rollback solo commit frontend, nessuna migrazione.

Ancore Doctor: la sidebar non ha una rotta Doctor; il test si apre dal comando Control già esistente. Nessuna voce nuova nella sidebar, proprietà orchestratore. Il pannello Settings verrà collegato in B6.2.

Originale Doctor aperto alle tre larghezze: Control mostra il solo badge. Il dettaglio nasce come toast con durata3,3s; lo screenshot deve attendere anche la chiusura del backdrop, altrimenti documenta la transizione. RED pagina: data-doctor-esito assente, unità: modulo assente.

Prima innesto Doctor: fonti competitor B6.1 riaperte e merge aggiornato05/09. Parità3/3; prima coppia1440 aperta. Mantengo componenti e endpoint, nessun secondo canale di navigazione. EseguiDoctor apre setView(doctor), che carica una richiesta condivisa senza doppioni; gli errori conservano il dato precedente dichiarandolo e il JSON corrisponde al dato esposto.

DOCTOR-FOCUS riprodotto3/3: disabilitare Ricontrolla durante GET fa perdere il focus. Ricerca WAI keyboard-interface e tre fonti B6.1 riaperte05/09 prima della correzione. Ripristinare soltanto il pulsante di partenza se ancora nella pagina Doctor e nessun altro elemento ha il focus. Nessun focus spostato quando la persona naviga altrove. File app.js, test doctor-vivo; nessuna variazione grafica.

## B6.1 consegna Doctor — 05/09/2026
SeverityCount e CheckCard innestati sul GET /api/v1/doctor esistente, dal comando Doctor del foglio Control. Tutti i segnali originali sono conservati; la pagina mostra11 categorie ordinate per gravità, una sintesi annunciabile, errori persistenti, Ricontrolla e download JSON del risultato effettivamente visto. Riusati DoctorScreen, Topbar, Page, SeverityCount e CheckCard; zero nuovi blocchi, token, icone, dipendenze o regole CSS. Locali aggiunti paginaDoctor, mostraDoctor, caricaDoctor, esportaDoctor; eseguiDoctor/riassuntoDoctor/refreshDoctorBadge preservati. Template e CSS rigenerati.

| Aspetto | Originale → proposta | Evidenza e verdetto |
|---|---|---|
| Copertura e chiarezza | Badge e toast3,3s → risultato persistente, categorie e dettaglio | Originale e nuova app aperti a1440/1280/1024 sullo stesso backend: servizio agente e catalogo non pronti, Git disponibile,73 sessioni ripristinate |
| Semantica | Desktop genericamente da controllare → tipo ambiente esplicito; configurazione separata dall’esecuzione | Chiave/navigazione/ricerca non sono prove di connessione. Shell desktop dichiarata senza attestare isolamento WSL2 |
| Errori e recupero | Toast → errore con Ricontrolla | GET503, risposta invalida, dati parziali, retry e ultimo risultato conservato provati; export disabilitato finché manca un dato valido |
| Accessibilità | Feedback effimero → status/alert separati, titolo e gravità testuali | DOCTOR-FOCUS RED→GREEN: Ricontrolla conserva il focus se la persona non si sposta; nessuna informazione affidata al solo colore |
| Responsive e densità | Sintesi breve →11 schede scrollabili | Topbar resta su una riga, controlli accessibili alle tre larghezze, fondo pagina esaminato. A1024 l’ora in testata segue la regola comune di occultamento; resta nel JSON esportato |
| Persistenza e prova | Nessun report scaricabile → JSON del risultato e ora di ricezione | Download letto e confrontato; reload esegue un controllo fresco. Nessuna nuova chiave localStorage né invio dei dati |

Verifiche: unità Doctor4/4; prova app12/12; npm run verify verde:61 unità/contratti, determinismo30file, statico195/195; componenti63/63. Esame visivo:6 originali/proposta,3 fondi pagina,3 casi errore/parziale/scarti,6 immagini di parità. Prove correnti vere su4177; errori e sessioni scartate sono risposte controllate dichiarate. Nessuna chiamata al modello o prova remota provider dichiarata. Nessun pulsante di riparazione inventato.
Prove aperte e copiate manualmente da artifacts (18 PNG):
- .claude/immagini/astra-fase2/Doctor/originale-1440.png
- .claude/immagini/astra-fase2/Doctor/app-1440.png
- .claude/immagini/astra-fase2/Doctor/app-dettagli-1440.png
- .claude/immagini/astra-fase2/Doctor/originale-1280.png
- .claude/immagini/astra-fase2/Doctor/app-1280.png
- .claude/immagini/astra-fase2/Doctor/app-dettagli-1280.png
- .claude/immagini/astra-fase2/Doctor/originale-1024.png
- .claude/immagini/astra-fase2/Doctor/app-1024.png
- .claude/immagini/astra-fase2/Doctor/app-dettagli-1024.png
- .claude/immagini/astra-fase2/Doctor/app-errore-1440.png
- .claude/immagini/astra-fase2/Doctor/app-parziale-1440.png
- .claude/immagini/astra-fase2/Doctor/app-scarti-1440.png
- .claude/immagini/astra-fase2/Doctor/comp-CheckCard-desktop-1440x900-mockup.png
- .claude/immagini/astra-fase2/Doctor/comp-CheckCard-desktop-1440x900-app.png
- .claude/immagini/astra-fase2/Doctor/comp-CheckCard-desktop-1280x800-mockup.png
- .claude/immagini/astra-fase2/Doctor/comp-CheckCard-desktop-1280x800-app.png
- .claude/immagini/astra-fase2/Doctor/comp-CheckCard-desktop-1024x800-mockup.png
- .claude/immagini/astra-fase2/Doctor/comp-CheckCard-desktop-1024x800-app.png
Cosa deve fare l’owner · Nulla per continuare. Prova su http://127.0.0.1:4177/ → Comandi → Agenti, regole e Doctor → Doctor.
Cosa fai tu dopo · Impostazioni e Model Lab (B6).
Cosa rimane · B6 Impostazioni/ModelLab→B2→B7 (creazione automazioni e ToastRegion inclusi)→B1→B8→Browser K-I. OAuth/computer-use solo PROPOSTE. Nessun push.

## B6.2 Impostazioni — ricognizione e piano prima degli edit, 05/09/2026
Merge dopo20004be aggiornato. Letti markup originale,38 controlli DOM reali, appearanceControlMap, normalizzaAspettoDesktop, leggi/salvaImpostazioniDesktop, applicaAspettoDesktop, inizializzaSettingsNavigation, setSettingsSection, renderSettingsRiepiloghi e ponte. Perimetro TALOS UI.
Ricerca fresca06/08–05/09: release Hermes v2026.8.31/29112be31/08, ClaudeCode v2.1.261/d7dbd9a04/09, Codex rust-v0.153.4/3d2ee5104/09 riverificate. Docs stabili verificate05/09 (data modifica non esposta): https://hermes-agent.nousresearch.com/docs/user-guide/configuration/ ; https://code.claude.com/docs/en/settings ; https://developers.openai.com/codex/app/settings → https://learn.chatgpt.com/docs/reference/settings ; https://www.w3.org/WAI/ARIA/apg/patterns/switch/ ; https://www.w3.org/WAI/ARIA/apg/patterns/tabs/ .
| Fonte | Forza | Limite/gap osservato | Decisione / +1 misurabile |
|---|---|---|---|
| Hermes | Configurazione risolta, valori non segreti separati e precedenza esplicita | CLI override/config/env possono differire; GUI non misurata | Adattare ambito locale esplicito e stato effettivo, riusare store TALOS senza nuovo protocollo |
| ClaudeCode | Config salva automaticamente e valida il contenuto | Config tab copre un sottoinsieme; Status elenca fonti ma non origine di ogni chiave | Adattare conservazione di tutti38 controlli originali e ricerca per nome/opzione; nessuna preferenza implicita presentata come attiva |
| Codex | Temi chiaro/scuro/sistema, font separati e personalizzazione | GUI/backend possono divergere; nessun difetto di qualità inventato | Adattare stato osservabile dopo reload e verifica pixel dell’effetto, mantenendo il sistema di token approvato |
| WAI | Switch con nome stabile e stato; tab navigabili | Input senza label (slider originali) non sufficientemente identificabili | Adottare controlli nativi, label esplicite, frecce e Home/End sui tab; ricerca senza perdita delle preferenze |
File previsti esatti:
- .claude/MOCKUP-REDESIGN-TALOS-2026-09-04.html
- .claude/LEDGER-ASTRA-FASE-2-2026-09-05.md
- .claude/CONSEGNA-ASTRA-FASE-2-2026-09-05.md
- harness-ui/frontend/src/components/impostazioni.js
- harness-ui/frontend/src/components/impostazioni-campi.js
- harness-ui/frontend/src/legacy/app.js
- harness-ui/frontend/index.template.html
- harness-ui/frontend/src/styles/index.css
- harness-ui/frontend/lab/fixtures/impostazioni.js
- harness-ui/frontend/lab/main.js
- harness-ui/frontend/tests/unit/impostazioni.test.mjs
- harness-ui/frontend/tests/parity/componenti.spec.mjs
- harness-ui/frontend/tests/parity/impostazioni-vivo.spec.mjs
- harness-ui/frontend/playwright.astra.config.mjs
Pubblici previsti: CAMPI_IMPOSTAZIONI, SEZIONI_IMPOSTAZIONI, filtraImpostazioni, creaSettingRow, montaImpostazioni, mostraSezioneImpostazioni. Fixture IMPOSTAZIONI. Locali: inizializzaSettingsNavigation/setSettingsSection/renderSettingsRiepiloghi/riempiFatti restano; introdurre aggiornaStatoImpostazioni solo se necessario, annotandolo prima. Riusare i38 controlli originali per id, spostandoli dentro le righe canoniche così conservano valori e listener; in laboratorio stessi controlli creati da fixture. Nessun id duplicato, nessun edit a ponte/frammenti.
RED SET-COPERTURA38 e SET-RICERCA (modulo mancante), SET-PERSISTENZA (controlli originali nascosti), SET-SLIDER-NOME, SET-TASTIERA. GREEN unità, componenti SettingsNav/SettingRow x3, prove native app e reload, verify e cancello completo componenti. Originale: tutte8 sezioni e dettaglio dei controlli a1440/1280/1024, output artifacts/astra-fase2/Impostazioni; solo prove aperte promosse alla consegna. Rollback commit senza migrazioni.
Gap da chiudere prima della consegna complessiva: il CSS nuovo non usa ancora chat-full-width, --talos-ui-font-scale, --talos-chat-font-size e gli attributi di stile Chat/composer. applicaThemeDesktop conserva per ora solo chiaro/scuro, come annotato dall’orchestratore. La sola persistenza NON dimostra effetto. Collegamento dei preset/movimento nella tranche B8; adattamenti Chat/composer richiedono raccordo nel perimetro orchestratore, senza modificare le sue schermate. ModelLab e fonte ricerca web restano gli innesti B6 successivi, non vengono dichiarati fatti da questo componente. Non chiamare B6 completa finché tutte queste prove non chiudono.

B6.2 avanti: merge aggiornato e quattro docs B6.2 riaperte05/09 prima implementazione. Aperte27 foto originali (sette sezioni, più due posizioni Aspetto, a tre larghezze). Cursori privi di nome accessibile e titolo sessione sovrapposto riprodotti visivamente; i test permanenti sono SET-SLIDER-NOME e SET-RIEPILOGO-INTEGRO. CSS solo sotto Settings: controlli nativi con classi esistenti, righe che avvolgono testi e valori; nessun token. Canonico usa id demo prefissati per non collidere coi frammenti; innesto trasferisce i nodi originali e gli output. Riepiloghi e azioni originali trasferiti senza clonare listener. ModelLab/search-source restano componenti successivi, preservati intanto negli stessi slot.

SET-BOOT riprodotto3/3 e stack puntuale: una sostituzione testuale dello script di edit ha trasformato il selettore multiplo $$ in $, causando filter is not a function. Diagnosi col test live; ricerca MDN String.replace e tre fonti B6.2 riaperte05/09 prima fix. Correggere unicamente il selettore in inizializzaSettingsNavigation, mantenendo test di avvio/navigazione/persistenza; prossime sostituzioni tramite callback per non interpretare dollari.

SET-NOME-UNIVOCO: dopo lo spostamento il selettore nativo resta associato anche alla label nascosta dell’originale: nome annunciato due volte, SET-PERSISTENZA fallisce sulla scelta Modalità colore. WAI Forms Labels e tre fonti B6.2 riaperte05/09: rimuovere soltanto il vecchio attributo for dalle label del nodo trasferito; la nuova label conserva un nome stabile. File impostazioni.js; accettazione tutti38 nomi accessibili esatti, nessun id duplicato.

SettingsNav: prova resa dai dati rafforzata, il laboratorio svuota davvero i tab prima del montaggio. RED:16 nodi mancanti a1440. Fonti B6.2 e WAI Tabs riaperte05/09 prima completamento: montaImpostazioni crea le otto voci da SEZIONI_IMPOSTAZIONI, poi collega selezione/frecce. Nessun nuovo simbolo pubblico né canale di regia.

SET-PROVIDER-LOCALE RED: GET vero e provider-credential-store.mjs:23 espongono execution=runtime locale, non local; il mio adattamento descriveva Ollama come accesso pubblico. Correggere confronto sul valore reale; Hugging Face resta catalogo/download senza chiave obbligatoria. Foto delle azioni mostrano bottoni adiacenti: sostituire la classe provvisoria talos-inline con elementi dei blocchi già presenti (talos-setting__control e talos-settings__actions), gap8px e wrapping; zero nuovi blocchi/token. Fonti B6.2 e MDN gap riaperte05/09. File: impostazioni.js, mockup/generated, app.js, test impostazioni-vivo. SearchSource e ModelLab non ancora consegnabili graficamente; innesti successivi B6.

Ultima revisione testi (fonti B6.2 riaperte05/09): intestazione nav Sezioni, poiché alcune voci interrogano il server; risultato ricerca Preferenze trovate: N evita il plurale errato. Verifica precedente invalidata da modifiche in corso; seconda verifica194/195 con errore artefatto ENOENT causato da due Playwright nella stessa cartella temporanea. Eseguire ora i cancelli in sequenza, su sorgenti fermi; nessun aggiramento delle asserzioni.

## B6.2 consegna SettingsNav e SettingRow — 05/09/2026
Merge richiesto dal richiamo RICERCA-WEB-NON-PREVISTA eseguito: fast-forward a 8c686aec (solo documenti). Nessuna schermata ricerca web nuova: la configurazione search-source resta nella sezione Strumenti agente e permessi di Impostazioni. Ricerca approfondita già consegnata resta invariata.

Riusati SettingsNav, SettingsSection, SettingRow, Select, Switch, KV, Card, Page e Topbar; nessun nuovo blocco, token, icona o dipendenza. Aggiunti solo elementi CSS talos-setting__control e talos-settings__actions. Tutti38 controlli originali trasferiti con id e listener, comprese14 scelte tema; gli output dei cursori sono conservati. Riepiloghi e azioni originali riusati. Template e CSS rigenerati dal canonico.

| Aspetto | Originale → proposta | Evidenza / verdetto |
|---|---|---|
| Copertura | 38 controlli → stessi38, medesime opzioni e store | Cambio di ogni controllo con mouse/tastiera e reload alle tre larghezze. Nessun id duplicato. Effetto grafico completo ancora da provare nella tranche B8 |
| Ricerca e passi | Nessuna ricerca preferenze → filtro per nome e opzioni | bilanciata trova Qualità in una sola operazione; risultato vuoto esplicito e ripristino della sezione |
| Accessibilità | Cursori privi di nome →38 label esplicite, valore e unità | Nomi accessibili esatti; frecce verticali/Home/End e un solo tab nella sequenza di focus |
| Semantica | Provider descritti genericamente → runtime locale/accesso pubblico/chiave configurata | Ollama e Hugging Face distinti sui dati reali; configurazione non presentata come prova connessione |
| Responsive/densità | Titolo sessione sovrapposto nel riepilogo → testo a capo entro KV | Originale e proposta aperti a1440/1280/1024; topbar su una riga, campi senza sovrapposizioni |
| Persistenza/recupero | Store originale → medesimo store e ripristino movimento | Tutti38 valori ritrovati; reset movimento conserva tema. Nessun nuovo messaggio che prometta salvataggio riuscito |

Cancelli verdi su sorgenti fermi: npm run verify =63 unità/contratti,30 file deterministici,195/195 statici; componenti69/69; prove app15/15 (più3/3 ricognizione originale). Dati reali server4177 e store browser isolato Playwright. Non è una prova agente tramite modello e non viene dichiarata tale. Screenshot:27 originali e30 app esaminati, più12 parità; gli stati finali cambiati sono stati riaperti. Le foto della configurazione ricerca web attuale restano diagnostiche in artifacts perché il suo innesto è ancora da fare. Copiate solo33 prove selezionate elencate sotto.

Ancore delle regressioni corrette (righe al momento di questa consegna):
- SET-BOOT: harness-ui/frontend/src/legacy/app.js:3588, selettore $$ ripristinato; percorso di avvio/navigazione coperto da tests/parity/impostazioni-vivo.spec.mjs:5.
- SET-NOME-UNIVOCO: harness-ui/frontend/src/components/impostazioni.js:17, rimozione della vecchia associazione label; tutti38 nomi verificati in tests/parity/impostazioni-vivo.spec.mjs:12.
- SET-PROVIDER-LOCALE: harness-ui/frontend/src/legacy/app.js:3413, confronto con execution=runtime locale, contratto effettivo.
- SET-RIEPILOGO-INTEGRO: harness-ui/frontend/src/styles/index.css:533 (generato dal canonico), wrapping dei KV, test permanente :26.
- Race degli artefatti Playwright: verifica invalidata da due suite concorrenti sulla stessa directory temporanea; cancelli rieseguiti in sequenza senza modificare asserzioni. Non era un difetto prodotto.

Limiti aperti: B6 NON completa. Fonte/chiave/prova ricerca web e sei schede ModelLab richiedono i prossimi innesti. La persistenza delle preferenze non prova tutti gli effetti: preset/movimento restano B8; dimensioni e stili Chat/composer necessitano raccordo col perimetro orchestratore. Restano B7-DIALOGO-CREAZIONE-AUT e B7-TOAST-FUORI-REGIONE. Nessuna modifica a sidebar/testata/Chat/Review/ponte/frammenti/public. Nessun push.

Prove aperte e selezionate:
- .claude/immagini/astra-fase2/Impostazioni/originale-appearance-1440.png
- .claude/immagini/astra-fase2/Impostazioni/app-aspetto-1440.png
- .claude/immagini/astra-fase2/Impostazioni/originale-movimento-1440.png
- .claude/immagini/astra-fase2/Impostazioni/app-movimento-1440.png
- .claude/immagini/astra-fase2/Impostazioni/app-ricerca-1440.png
- .claude/immagini/astra-fase2/Impostazioni/originale-providers-1440.png
- .claude/immagini/astra-fase2/Impostazioni/app-providers-1440.png
- .claude/immagini/astra-fase2/Impostazioni/originale-appearance-1280.png
- .claude/immagini/astra-fase2/Impostazioni/app-aspetto-1280.png
- .claude/immagini/astra-fase2/Impostazioni/originale-movimento-1280.png
- .claude/immagini/astra-fase2/Impostazioni/app-movimento-1280.png
- .claude/immagini/astra-fase2/Impostazioni/app-ricerca-1280.png
- .claude/immagini/astra-fase2/Impostazioni/originale-providers-1280.png
- .claude/immagini/astra-fase2/Impostazioni/app-providers-1280.png
- .claude/immagini/astra-fase2/Impostazioni/originale-appearance-1024.png
- .claude/immagini/astra-fase2/Impostazioni/app-aspetto-1024.png
- .claude/immagini/astra-fase2/Impostazioni/originale-movimento-1024.png
- .claude/immagini/astra-fase2/Impostazioni/app-movimento-1024.png
- .claude/immagini/astra-fase2/Impostazioni/app-ricerca-1024.png
- .claude/immagini/astra-fase2/Impostazioni/originale-providers-1024.png
- .claude/immagini/astra-fase2/Impostazioni/app-providers-1024.png
- .claude/immagini/astra-fase2/Impostazioni/comp-SettingsNav-desktop-1440x900-mockup.png
- .claude/immagini/astra-fase2/Impostazioni/comp-SettingsNav-desktop-1440x900-app.png
- .claude/immagini/astra-fase2/Impostazioni/comp-SettingRow-desktop-1440x900-mockup.png
- .claude/immagini/astra-fase2/Impostazioni/comp-SettingRow-desktop-1440x900-app.png
- .claude/immagini/astra-fase2/Impostazioni/comp-SettingsNav-desktop-1280x800-mockup.png
- .claude/immagini/astra-fase2/Impostazioni/comp-SettingsNav-desktop-1280x800-app.png
- .claude/immagini/astra-fase2/Impostazioni/comp-SettingRow-desktop-1280x800-mockup.png
- .claude/immagini/astra-fase2/Impostazioni/comp-SettingRow-desktop-1280x800-app.png
- .claude/immagini/astra-fase2/Impostazioni/comp-SettingsNav-desktop-1024x800-mockup.png
- .claude/immagini/astra-fase2/Impostazioni/comp-SettingsNav-desktop-1024x800-app.png
- .claude/immagini/astra-fase2/Impostazioni/comp-SettingRow-desktop-1024x800-mockup.png
- .claude/immagini/astra-fase2/Impostazioni/comp-SettingRow-desktop-1024x800-app.png

Cosa deve fare l’owner · Nulla per proseguire. Impostazioni provabili su http://127.0.0.1:4177/.
Cosa fai tu dopo · Completare fonte/chiave/prova dentro Impostazioni, poi ModelLab.
Cosa rimane · B6→B2→B7→B1→B8→Browser K-I; OAuth e computer-use solo PROPOSTE.

## B6.3 configurazione fonte ricerca dentro Impostazioni — piano prima degli edit, 05/09/2026
Merge dopo dc7ec32 aggiornato. Nessuna nuova schermata: contenitore esistente della sezione tools in schermoImpostazioni. TALOS UI, senza modifiche backend. Letti per intero caricaPannelloRicercaWeb/disegnaPannelloRicercaWeb/azioneRicercaWeb, search-source-store.mjs e test HTTP/store. GET reale: cinque fonti duckduckgo/tavily/brave/searxng/custom più off; source/endpoint/readiness/fonti, mai chiave. POST scelta, key, key/remove, test restano esatti. Chiave nel portachiavi, scelta su JSON server; nessun nuovo storage browser.
Ricerca06/08–05/09, fonti riaperte05/09 prima degli edit: https://github.com/NousResearch/hermes-agent/releases/tag/v2026.8.31 (31/08,29112be), https://github.com/anthropics/claude-code/releases/tag/v2.1.261 (04/09,d7dbd9a), https://github.com/openai/codex/releases/tag/rust-v0.153.4 (04/09,3d2ee51). Docs stabili riverificate, aggiornamento non esposto: https://hermes-agent.nousresearch.com/docs/user-guide/features/web-search ; https://code.claude.com/docs/en/tools-reference ; https://learn.chatgpt.com/docs/config-file/config-basic ; https://www.w3.org/WAI/ARIA/apg/patterns/radio/ . SearXNG motori: https://docs.searxng.org/dev/engines/index.html (build2026.9.5+28b61729c). About espone anche build06/09: non assunto come release disponibile05/09.
| Fonte | Forza | Limite/gap verificato | Decisione / +1 misurabile |
|---|---|---|---|
| Hermes | Scelta esplicita persistita, ricerca/estrazione separate | Auto-config iniziale può scegliere destinatario da credenziali o ring; limiti free-tier dichiarati | Adattare destinatario sempre esplicito e nessun cambio automatico; preservare5 fonti e off, reload prova scelta |
| ClaudeCode | Errori ricerca distinti dai risultati, retry backend | Backend WebSearch fisso; alternative via MCP | Adattare errore persistente e retry manuale, scelta diretta tra5 backend già implementati, zero installazioni |
| Codex | Modi cached/indexed/live/disabled espliciti, risultati non fidati | Cache non è dato live; nessuna equivalenza con verifica connessione | Adattare configurata ≠ prova riuscita e disattivazione ≠ blocco di tutta la rete; non inventare modalità cache assenti nel backend |
| WAI | Un solo ingresso Tab e frecce nel gruppo radio | Originale radio tutti tabulabili senza frecce | Adottare roving e selezione da frecce, preservare focus e bloccare doppie mutazioni |
Originale: sei scelte, chiave/sostituzione/rimozione, indirizzo, link ottenimento chiave, prova con query fissa. +1 locale: query prova editabile nell'API già prevista; chiave opzionale custom finalmente inseribile; errore/retry persistente senza perdere campi; risposta invalida mai successo. Rifiutate note non dimostrate su quote/prezzi e “nessuna terza parte vede la query”: SearXNG interroga altri motori. Riusare ChoiceCards/SettingRow/Card/Button/Input del canonico, zero nuovi blocchi/token/dipendenze.
File esatti:
- .claude/MOCKUP-REDESIGN-TALOS-2026-09-04.html
- .claude/LEDGER-ASTRA-FASE-2-2026-09-05.md
- .claude/CONSEGNA-ASTRA-FASE-2-2026-09-05.md
- harness-ui/frontend/src/components/fonte-ricerca.js
- harness-ui/frontend/src/legacy/app.js
- harness-ui/frontend/index.template.html
- harness-ui/frontend/src/styles/index.css
- harness-ui/frontend/lab/fixtures/fonte-ricerca.js
- harness-ui/frontend/lab/main.js
- harness-ui/frontend/tests/unit/fonte-ricerca.test.mjs
- harness-ui/frontend/tests/parity/fonte-ricerca-vivo.spec.mjs
- harness-ui/frontend/tests/parity/fonte-ricerca-backend-fixture.mjs
- harness-ui/frontend/tests/parity/componenti.spec.mjs
- harness-ui/frontend/playwright.astra.config.mjs
Export nuovi normalizzaFonteRicerca, normalizzaProvaRicerca, creaScelteFonte, aggiornaFonteRicerca; fixture FONTE_RICERCA; fixture backend avviaFonteDiProva. Compatibili caricaPannelloRicercaWeb/disegnaPannelloRicercaWeb/azioneRicercaWeb; locali statoFonteRicerca, ricercaWebInCorso, messaggioFonteRicerca; mount originale searchSourceMount. Caricamento e mutazione seriali; nessun secondo canale di navigazione. Modulo rende DOM soltanto, callbacks dal monolite.
RED FONTE-CONTRATTO, FONTE-PROVA-INVALIDA (modulo assente), FONTE-CUSTOM-CHIAVE (originale non permette inserimento), FONTE-TASTIERA, FONTE-RECUPERO/CONCORRENZA. GREEN node --test tests/unit/fonte-ricerca.test.mjs; componenti FonteRicerca x3; frontend playwright.astra fonte-ricerca-vivo x3; test HTTP/store esistenti, npm run verify e componenti completo in sequenza. Prove in linguaggio umano: scelgo tuttefonti, salvo/rimuovo chiave artificiale in portachiavi in memoria, indirizzo testato su store isolato, reload file reale; prova rete dichiarata fixture. Prova GET reale4177 separata. Non cambiare credenziali personali né impostazioni del server condiviso durante suite. Backend HTTP di laboratorio4178 con store temporaneo e keyring in memoria, come fixture estensioni; trasporto prova controllato, nessuna chiamata pagata. Chiamata agente/composer con modello assente resta gap: questa consegna è configurazione UI, non nuova capacità di ricerca.
Originale e proposta agli stessi stati/viewports1440/1280/1024, artifacts/astra-fase2/FonteRicerca; apertura manuale e copie selezionate solo alla consegna. Rollback commitfrontend senza migrazioni. Limite backend mantenuto: l'indirizzo non è ricordato separatamente per ogni fonte; cambiando fonte si azzera.

RED constatati: unità modulo assente; FONTE-CUSTOM-CHIAVE fallisce perché il campo non esiste. Aperte cinque foto originali1440: scelta e quattro stati. Il layout originale impone scorrimento per i campi; nuova composizione riusa griglia ChoiceCards e campi canonici, con dettaglio della sola fonte scelta.

### Raccordo B6 ricevuto e applicato — 05/09
Merge866a8a9f riuscito dopo stash limitato ai14 file B6.3, riapplicato senza conflitti. Modifiche chat/composer restano integralmente dell'orchestratore. Nessun loro CSS aggiunto da Astra. Regola permanente per gli edit: String.prototype.replace usa sempre callback di rimpiazzo (s.replace(a, () => b)), mai stringa; rileggere tutte le righe toccate. Il significato speciale di $$/$&/$1 è già annotato nella memoria02/09 e ora anche in questo ledger.
Hermes delle foto hermes-confronto1480×964: app desktop Electron0.17.0, NON dashboard web. Eseguibile: C:/Users/Antonino/AppData/Local/Temp/claude/C--Users-Antonino-Desktop-projects-AVM-harness-desktop/af5c3844-a5da-4bb5-a142-7740e39b623d/scratchpad/confronto/hermes-root/node_modules/electron/dist/electron.exe ; argomento assoluto: C:/Users/Antonino/AppData/Local/Temp/claude/C--Users-Antonino-Desktop-projects-AVM-harness-desktop/af5c3844-a5da-4bb5-a142-7740e39b623d/scratchpad/confronto/hermes-root/apps/desktop . Nessuna porta dashboard documentata. Provenienza recuperata da CONSEGNA-ASTRA-CONFRONTO-HERMES e osservazioni.json; bundle electron-main.mjs SHA256942065f5039a18a4afc2a68ee6d39371b8a90f45e9957f4868c0aa17dc53e799, commit sorgente installato87086bc5d7812f9f38c6dd36e391ab0fcec92468. Corrispondenza completa bundle/sorgente non provata. Il vecchio manifesto segnala file con estensionePNG ma codificaJPEG e restorePending della trasparenza: dati storici, non una nuova verifica runtime. Nessun Hermes riavviato in questa fase.
Valori che i38 controlli scrivono attraverso i listener originali, da applicaAspettoDesktop/aggiornaBackgroundDesktop/applicaThemeDesktop: --talos-ui-font-scale, --talos-chat-font-size; data-talos-composer-shape, -composer-plus, -message-style, -streaming-animation, -window-presentation; classi chat-full-width, immersive-header, reduce-motion. Tema: data-talos-theme, -color-mode, -resolved-color-mode, -scene. Movimento: data-talos-motion-mode/-quality/-profile/-easing; variabili --talos-motion-speed/-intensity/-glow/-density/-depth/-trails/-contrast/-parallax/-duration-scale/-ui-intensity/-stagger/-ease/-ease-exit; durate --talos-motion-duration-control/-surface-enter/-surface-exit/-disclosure/-popover/-tab-change/-composer-expand/-composer-collapse/-message-insert/-response-progress/-success-confirm/-theme-transition; --talos-background-cycle/-shift-x/-shift-y. Nessun nuovo protocollo: già emessi dal monolite. B8 chiuderà le prove degli effetti con il raccordo CSS dell'orchestratore.
Prima innesto FonteRicerca: tre fonti competitor riaperte05/09; parità3/3 e6 immagini aperte. Focus preservato soltanto se la persona non si sposta; GET e POST seriali, errori in linea e campi conservati; esito prova distinto dalla sola readiness. Primo test componenti partito con default4176; da qui tutti i cancelli componente con TALOS_LAB_PORT=4178 esplicito.

FONTE-ESITO-SCADUTO RED riprodotto: dopo prova riuscita, prova fallita nasconde i risultati ma conservava la frase «ha risposto». File src/legacy/app.js, catch di azioneRicercaWeb. Ricerca fresca05/09: tre fonti B6.3 e WAI Understanding status-messages riaperte; stato deve riferirsi alla richiesta corrente. Prima di avviare qualsiasi richiesta invalidare la prova precedente e ripristinare la readiness non verificata. Nessun cambio API né CSS. Rimuovere anche RICERCA_LINK ormai inutilizzata nel monolite: link sicuri unicamente nel componente. Test permanente FONTE-PROVA/FONTE-ESITO-SCADUTO.

FONTE-ESITO-VISIBILE: foto app-prova/app-errore-prova1440 mostrano esito sotto il bordo visibile; la sola toBeVisible non basta. FONTE-LETTURA-TERMINATA: placeholder originale «Lettura dello stato…» sopravvive al GET fallito. Ricerca05/09 MDN scrollIntoView e WAI status-messages più tre fonti B6.3 riaperte prima fix. File app.js e fonte-ricerca-vivo: test toBeInViewport(ratio1) su esito/errore, nessun placeholder dopo errore. Scroll nearest/instant solo se focus ancora nell’operazione e se pagina visibile; nessun focus rubato se naviga altrove. Stato iniziale svuota soltanto il placeholder legacy, non i campi.

Raccordo aspetto, verifica richiesta dal prompt: aggiunto al perimetro esatto harness-ui/frontend/tests/parity/impostazioni-vivo.spec.mjs, scenario SET-RACCORDO-ATTRIBUTI. Nessun edit prodotto: guida controlli originali e verifica sulla radice valori usati dal CSS orchestratore (scala/font/stili/classi/movimento), anche dopo reload. Fonti configurazione Hermes/ClaudeCode/Codex B6.2 riaperte05/09. Questa è prova del raccordo dati; non viene spacciata per verifica completa di tutti gli effetti di B8.

FONTE-ESITO-VISIBILE1024: dopo scroll nearest il rettangolo termina0,3px oltre il bordo (intersection ratio0,99799). Mantengo la richiesta di visibilità completa; applico scroll-margin-block12px a esito/errore nel solo Settings, come MDN scrollIntoView Using scroll-margin-top/bottom (riverificato05/09 insieme ai tre competitor). Canonico e generati già nel perimetro. Nessuna soglia di test abbassata.

## B6.3 FonteRicerca — consegna verificata 05/09/2026
Dentro Impostazioni → Strumenti agente e permessi: cinque fonti originali più off, scelta persistita sul server, chiave/sostituzione/rimozione nel portachiavi, indirizzo, collegamenti sicuri e prova reale tramite le rotte esistenti. Nessun endpoint né storage aggiunto. Nuovo modulo FonteRicerca; riusati ChoiceCards, SettingRow, Field, Button, Card, token esistenti. Zero nuovi blocchi visivi, zero token CSS, zero dipendenze. Mockup rigenerato:16 schermate,113 blocchi.

| Aspetto | Originale → proposta | Beneficio verificato / limite |
|---|---|---|
| Copertura | Tutte6 scelte e azioni conservate | Aggiunta chiave facoltativa custom già supportata dal server |
| Prova | Query fissa → testo libero | Invio e retry con frasi naturali; configurazione distinta da connessione verificata |
| Tastiera | Radio tabulabili → gruppo con frecce e ingresso unico | Focus restituito al controllo; nessun richiamo se la persona cambia pagina |
| Errori | Segnalazione generica → errore nel pannello, retry e campi conservati | Risposta malformata non diventa successo; vecchi risultati invalidati |
| Layout | Confronto originale/app1440/1280/1024 | Stesse scelte, forma canonica; campi lunghi scorrono, esito/errore completamente nel viewport |
| Persistenza | Backend originale conservato | Ricarico browser e riapertura store su file; chiave esclusa dal JSON della scelta |
| Limiti | Indirizzo unico per fonte attiva | Cambiare fonte azzera indirizzo come prima; nessuna promessa di prestazioni/superiorità globale |
Verdetto: innesto verificato nel perimetro. Preserva funzioni e migliora configurazione custom, prova e recupero; accettazione visiva finale dell’owner distinta dai cancelli.

Verifiche fresche: build;66 unità/contratti;30 asset deterministici;195/195 statici;72/72 componenti (TALOS_LAB_PORT4178);36/36 percorsi app (18 FonteRicerca +18 Impostazioni, incluso SET-RACCORDO-ATTRIBUTI dopo reload); originale3/3 e backend HTTP/store10/10 nella stessa fase. Nessuno skip né retry automatico. Il test di configurazione usa HTTP/store reali isolati con chiavi artificiali e portachiavi in memoria; la risposta del motore di ricerca è una fixture dichiarata, non una chiamata pagata. GET4177 reale verificato separatamente. Nessuna esecuzione agente dichiarata senza modello disponibile.
Regressioni permanenti: FONTE-ESITO-SCADUTO, FONTE-ESITO-VISIBILE (incluso1024 e margine di scorrimento12px), FONTE-LETTURA-TERMINATA, FONTE-RECUPERO, FONTE-CONCORRENZA. Tutte nel test fonte-ricerca-vivo; normalizzatori unitari rifiutano risposte invalide. Immagini finali aperte personalmente,29 selezionate sotto; le restanti sono diagnostiche negli artifacts ignorati. Parità FonteRicerca identica nelle tre larghezze.
Raccordo866a8a9f unito in7fa26452; ulteriore merge prima consegna già aggiornato. CSS Chat/composer conservato; attributi/variabili originali e provenienza Hermes registrati nel ledger alla voce Raccordo B6. B8 resta responsabile della verifica degli effetti tema/scena/movimento. Nessuna modifica ad AGENTS, ponte, frammenti o public; nessun push.

Prove aperte e selezionate:
- .claude/immagini/astra-fase2/FonteRicerca/originale-scelte-1440.png
- .claude/immagini/astra-fase2/FonteRicerca/app-scelte-1440.png
- .claude/immagini/astra-fase2/FonteRicerca/originale-custom-1440.png
- .claude/immagini/astra-fase2/FonteRicerca/app-custom-1440.png
- .claude/immagini/astra-fase2/FonteRicerca/app-prova-1440.png
- .claude/immagini/astra-fase2/FonteRicerca/app-errore-prova-1440.png
- .claude/immagini/astra-fase2/FonteRicerca/originale-scelte-1280.png
- .claude/immagini/astra-fase2/FonteRicerca/app-scelte-1280.png
- .claude/immagini/astra-fase2/FonteRicerca/originale-custom-1280.png
- .claude/immagini/astra-fase2/FonteRicerca/app-custom-1280.png
- .claude/immagini/astra-fase2/FonteRicerca/app-prova-1280.png
- .claude/immagini/astra-fase2/FonteRicerca/app-errore-prova-1280.png
- .claude/immagini/astra-fase2/FonteRicerca/originale-scelte-1024.png
- .claude/immagini/astra-fase2/FonteRicerca/app-scelte-1024.png
- .claude/immagini/astra-fase2/FonteRicerca/originale-custom-1024.png
- .claude/immagini/astra-fase2/FonteRicerca/app-custom-1024.png
- .claude/immagini/astra-fase2/FonteRicerca/app-prova-1024.png
- .claude/immagini/astra-fase2/FonteRicerca/app-errore-prova-1024.png
- .claude/immagini/astra-fase2/FonteRicerca/app-tavily-1440.png
- .claude/immagini/astra-fase2/FonteRicerca/app-brave-1280.png
- .claude/immagini/astra-fase2/FonteRicerca/app-searxng-1024.png
- .claude/immagini/astra-fase2/FonteRicerca/app-errore-lettura-1280.png
- .claude/immagini/astra-fase2/FonteRicerca/app-errore-salvataggio-1024.png
- .claude/immagini/astra-fase2/FonteRicerca/comp-FonteRicerca-desktop-1024x800-app.png
- .claude/immagini/astra-fase2/FonteRicerca/comp-FonteRicerca-desktop-1024x800-mockup.png
- .claude/immagini/astra-fase2/FonteRicerca/comp-FonteRicerca-desktop-1280x800-app.png
- .claude/immagini/astra-fase2/FonteRicerca/comp-FonteRicerca-desktop-1280x800-mockup.png
- .claude/immagini/astra-fase2/FonteRicerca/comp-FonteRicerca-desktop-1440x900-app.png
- .claude/immagini/astra-fase2/FonteRicerca/comp-FonteRicerca-desktop-1440x900-mockup.png

Cosa deve fare l’owner · Può provare Impostazioni su http://127.0.0.1:4177/. Nessuna azione necessaria per proseguire.
Cosa fai tu dopo · Innestare le sei schede e gli accessi del Model Lab, preservando tutte le funzioni originali.
Cosa rimane · B6 ModelLab → B2 → B7 → B1 → B8 → Browser K-I. OAuth e computer-use restano PROPOSTE.

## R05 — nomi umani nei riepiloghi Impostazioni, piano05/09
R05 accetta dc7ec327 e c6c583bf; merge6e1e09eb eseguito. Catalogo B6.4 accantonato nello stash astra-catalogo-in-corso-prima-R05, da riapplicare subito dopo questa correzione.
Ispezionati renderSettingsRiepiloghi, ETICHETTE_ASPETTO, chat-foot.js#etichettaPermesso, quattro select originali e impostazioni-campi. etichettaPermesso è già importata: riusarla. La vecchia mappa chatFontScale non riconosce balanced/expanded e chiama compact «Compatto» anziché «Piccolo»; anche composerShape/streamingAnimation hanno etichette diverse dai controlli. Eliminare la mappa privata; leggere l’etichetta dell’opzione originale corrispondente al valore, fallback umano «Non impostato». Nessuna modifica ai valori salvati o ai permessi effettivi.
Ricerca fresca05/09 finestra06/08–05/09; pin release Hermes29112be31/08, ClaudeCode d7dbd9a04/09, Codex3d2ee5104/09 già riverificati in questa sessione. Docs riaperte prima fix: https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html ; https://code.claude.com/docs/en/permissions ; https://hermes-agent.nousresearch.com/docs/user-guide/security/ ; https://learn.chatgpt.com/docs/config-file/config-advanced . Percorso /docs/security/sandbox non disponibile, usata documentazione avanzata verificata. Tutte docs stabili, data pubblicazione non esposta.
WAI: etichette comprensibili senza rumore; Claude: allow/ask/deny con ambito esplicito; Hermes: mode tecnico separato dal significato dei controlli; Codex: approvazione e sandbox sono dimensioni distinte. Adattare terminologia alla UI italiana già approvata, nessuna traduzione dei valori del protocollo. +1 misurabile: stessa policy nelle due superfici, zero balanced/expanded/Full access nelle righe riepilogo, tutti11 valori d’aspetto con etichetta identica al select. Nessuna nuova capacità di sicurezza o superiorità globale rivendicata.
File esatti: harness-ui/frontend/src/legacy/app.js; harness-ui/frontend/tests/parity/impostazioni-vivo.spec.mjs; .claude/LEDGER-ASTRA-FASE-2-2026-09-05.md; .claude/CONSEGNA-ASTRA-FASE-2-2026-09-05.md. Simboli: renderSettingsRiepiloghi.etichetta, rimozione ETICHETTE_ASPETTO (solo consumatore), riuso etichettaPermesso invariata. RED SET-NOMI-PERMESSI, SET-NOMI-ASPETTO. GREEN suite Impostazioni/FonteRicerca x3, build,66 contratti, statici195 e componenti72 in sequenza. Prove con le quattro policy in storage browser e inventario sessioni vuoto controllato, nessuna mutazione del backend; screenshot prima/dopo alle tre larghezze. Rollback commit, nessuna migrazione. Hermes: risposta già nel ledger Raccordo B6 (desktop Electron0.17.0, eseguibile/argomento e limiti di provenienza); non riavviato.

R05 RED riprodotti: Read only al posto di Sola lettura; Compatto al posto di Piccolo. Corretta la riga tramite etichettaPermesso già importata e rimossa la mappa privata d’aspetto. GREEN42/42 (24 Impostazioni,18 FonteRicerca); coperti quattro permessi e undici opzioni originali, più reload. Sei screenshot finali aperti e selezionati in R05-Impostazioni. Nessun cambio di stile o valore persistito. Verifica generale in corso.

## R05 — consegna verificata05/09
Policy attiva usa etichettaPermesso condivisa. Tutti gli undici valori d’aspetto usano le etichette dei controlli originali; nessuna mappa privata. Valori salvati e permessi effettivi invariati. RED riprodotti e regressioni permanenti SET-NOMI-PERMESSI/SET-NOMI-ASPETTO verdi.
Gates freschi:42/42 prove live (24 Impostazioni+18 FonteRicerca), npm run verify verde (build30 asset,66 contratti,30 file deterministici,195 statici),72/72 confronti componenti; git diff --check verde. Sei screenshot R05 aperti alle larghezze1440/1280/1024, permessi/aspetto: .claude/immagini/astra-fase2/R05-Impostazioni/. Nessun taglio delle etichette osservato. Prima: nomi tecnici e diciture discordanti documentati dalle prove RED e dalle immagini Settings/FonteRicerca; dopo: etichette umane coerenti. Gli screenshot delle policy usano sessioni vuote controllate, quelli d’aspetto l’inventario esistente: non sono un confronto pixel a parità di dati. Nessuna esecuzione agente rivendicata.
Cosa deve fare l’owner · Nessuna azione necessaria. Impostazioni disponibili su http://127.0.0.1:4177/.
Cosa fai tu dopo · Riprendere il catalogo Model Lab già salvato, poi le altre schede.
Cosa rimane · B6 Model Lab → B2 → B7 → B1 → B8 → Browser K-I. OAuth e computer-use restano proposte.
