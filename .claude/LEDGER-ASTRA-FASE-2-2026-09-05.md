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
