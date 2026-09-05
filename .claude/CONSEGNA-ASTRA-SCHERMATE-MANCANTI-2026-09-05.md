# Consegna schermate nel mockup — 05/09/2026

## Browser
Integrato in schermoBrowser nel mockup canonico. Stesso CSS, sprite e regia; template e CSS frontend rigenerati. URL, cronologia, testo letterale, copia, apertura esterna, annotazione in bozza, note locali, permesso, caricamento, rilettura e stato vuoto. Fixture esplicite; backend nella parte B.

Riusa Topbar, Tabs, Page, Field, Button, Badge, Card. Nuovi BrowserViewport e BrowserHistory, documentati in inventario. Nessun token nuovo.

Verifiche: test:lab 60/60; npx playwright richiesto 60/60; ultimo controllo Browser 6/6 dopo correzione dello stato selezionato nelle prove. Screenshot aperti a 1440, 1280, 1024 in immagini/astra-mockup/browser-{larghezza}.png. Controllati tagli, tab attiva, testo a capo, azioni e cronologia.

Annullate le aggiunte datate 05/09 ai due AGENTS indicati dall’owner. Nessun push.

Cosa deve fare l’owner: esaminare le schermate quando desidera.
Cosa faccio dopo: Palette completa, poi altre schermate A.
Cosa rimane: Intro, Model Lab, Toast, albero, dialoghi; Parte B.

## Palette
Tutti i 15 comandi originali sono presenti e trovabili, con gruppi, descrizioni, Kbd, selezione e stato vuoto. Ctrl K, frecce, Invio ed Escape verificati. I comandi che richiedono backend sono dimostrativi nella regia; Rinomina/Esporta si collegano ai fogli A7. Nessuna funzione originale esclusa dal piano di collegamento B.
Riusa Dialog, Field, ListRow, Kbd e sprite originale; zero token nuovi. 66/66 nel cancello e nel comando npx, poi 6/6 mirati alla correzione visiva. Aperti i tre PNG palette-1440/1280/1024 dopo la correzione dell’icona e della ricerca fissa.
Cosa deve fare l’owner: può guardare i PNG. Cosa faccio dopo: Intro. Cosa rimane: Model Lab, Toast, albero, dialoghi e Parte B.

## Intro
Quattro passi nel veloIntro: cartella → modello e accesso → permessi → fine. Conservate tutte le quattro politiche originali, prova accesso con errori, scelta modello, ritorno, salto e apertura Nuova sessione. Regia esplicitamente dimostrativa; niente chiavi salvate o inviate.
72/72 test:lab e 72/72 npx. Aperti tutti i dodici PNG intro-{passo}-{larghezza}; corretti stato selezionato e riepilogo italiano. Zero token nuovi.
Cosa deve fare l’owner: può esaminare i quattro passi. Cosa faccio dopo: Model Lab. Cosa rimane: altre quattro consegne A e Parte B.

## Model Lab
Sei schede integrate nel mockup, tutte le nove lacune UI recuperate. Catalogo, Hugging Face, coda download, runtime e prova condividono lo stesso stile. Cinque dialoghi di supporto inclusi. Operazioni con dati dimostrativi espliciti; collegamento reale in parte B.
18 screenshot aperti (6 schede × 3 larghezze). Corrette spaziature e selezioni incoerenti. Rigenerazione, build e test:lab 96/96 verdi. Zero token e icone nuovi.
Cosa deve fare l’owner: può guardare le sei schede. Cosa faccio dopo: Toast. Cosa rimane: albero, dialoghi, server e parte B.

Verifica finale Model Lab: anche npx playwright test --config=playwright.lab.config.mjs 96/96.

## Base aggiornata dell’orchestratore
Merge da lane/harness-desktop a 28b1a035. Conflitti risolti conservando Browser e nuove azioni di testata. Template rigenerato. Parità statica 96/96; componenti 12/12 sulla 4178.
Cosa deve fare l’owner: nulla per sbloccare. Cosa faccio dopo: completamento Intro H16–H20. Cosa rimane: adeguamento Palette e Model Lab, Toast, albero, dialoghi e parte B.

## Intro dopo il reindirizzamento
H16–H20: quattro passi, riapertura dalle Impostazioni, locale in evidenza, scelta dei fornitori conservata, privacy con portata locale/remota, compito iniziale nel compositore della nuova conversazione. E4: conferma esplicita per Accesso pieno; niente avanzamento dalla rail che scavalchi i campi obbligatori. Tolti i controlli degli esiti dimostrativi. Riusa Dialog/Steps/Field/Callout/Toolbar; zero token nuovi.
Test:lab 99/99; npx completo 99/99 dopo la correzione visiva; 6/6 mirati Intro, 3/3 originali sulla 4179 e 3/3 riferimento Nuova. Aperti tutti i 15 PNG Intro, sei PNG originali e tre Nuova; riaperti i sei Modello/Remoto dopo aver compattato il richiamo locale. Dialogo conforme alla grammatica Nuova; a 1024 il corpo conserva lo scorrimento e il piede visibile.
Non verificato/parte B7: salvataggio e prova chiave nel portachiavi; lettura setup dal backend; creazione persistita della sessione; catalogo dinamico. La regia verifica il percorso di disegno con la propria configurazione; non è prova di questi collegamenti. Riprendi/completa usa ancora la chiave locale del mockup, da non portare nel prodotto. Richiesta al ponte per B7: mappare #introDialog/#introBody/#introRail/#introBack/#introNext/#introSkip su veloIntro e relativi elementi; conservare talos.harness.desktop.intro.v1 del contratto.
Cosa deve fare l’owner: approvare il disegno dagli screenshot. Cosa faccio dopo: Palette sulla base unita. Cosa rimane: adeguamento Model Lab, Browser senza controlli di stato nel prodotto, Toast, albero, dialoghi e parte B.

## Palette dopo il reindirizzamento
Comandi dalla testata funzionante, 15 identità originali conservate, etichette umane con alias precedenti ricercabili, Home/End e frecce, Invio/Escape. Nessun controllo di stato dimostrativo nella palette. Riusa CommandPalette/Dialog/Field/ListRow/Kbd; zero blocchi e token nuovi.
Test:lab 102/102; originale 4179 6/6 (Intro e Palette). Aperti i tre PNG Palette e i tre dell’originale; confronto con Nuova canonica già aperta: stessa testata, corpo scorrevole, piede e focus. Il contenuto scorre sotto la ricerca fissa; tutti i comandi trovati uno per uno. La ricerca originale ha gli stessi 15 data-command, verificati nel DOM e nel sorgente.
Non verificato: collegamento ai metodi operativi originali, affidato a B7; Rinomina/Esporta attendono i veli A7. Nessuna pretesa che le bozze della regia sostituiscano resume/fork/compact/export/share.
Cosa deve fare l’owner: approvare il disegno dagli screenshot. Cosa faccio dopo: Model Lab secondo la revisione. Cosa rimane: altre schermate A e tutta la parte B.

### Model Lab — riallineamento A3, 05/09/2026
Sei schede e sette fornitori. Rimossi i controlli per simulare l'esito. Accesso dalle Impostazioni (D1), fornitori in Dialog. Riusa lo stesso sistema del mockup; zero token aggiunti. Screenshot aperti: modellab-{installati,catalogo,hf,download,runtime,prova,fornitori}-{1440,1280,1024}.png; confronto originale-modellab-{overview,providers,catalog,installed,huggingface,downloads} alle stesse larghezze e veloNuova.
Copertura ripristinata: import .gguf, quattro ordinamenti HF, autore/tag, altri risultati, tre motori, tutti i file, risposta/parametri del catalogo, accessi avanzati. Legenda memoria, file conservato quando si scarica dalla RAM, pausa/ripresa e risposta parziale sono visibili. Le fixture non attestano chiamate ai servizi: B6 deve collegare quelle originali.
Cosa deve fare l'owner: valutare gli screenshot alla consegna della parte A. Cosa fa Astra dopo: Browser, Toast, albero e dialoghi. Cosa rimane: parte A restante e tutti i collegamenti della parte B.

Verifica finale A3: build 30 asset; test:lab 108/108; Playwright diretto 108/108; confronto originale 9/9.

### Browser — riallineamento A1, 05/09/2026
Nessun selettore di stati nella schermata. Cronologia, autore/orario, lettura testuale, permessi e annotazione conservati; Terminale 2 e Review 3 in testata. Screenshot browser-1440/1280/1024 e originale-browser-1440/1280/1024 aperti. Gate 111/111, poi 123/123 includendo originale; 12/12 dopo correzione della sola attesa nelle catture. Resta l'innesto dei dati reali.
Cosa deve fare l'owner: valutare alla consegna A. Cosa fa Astra dopo: Toast e campanella. Cosa rimane: albero, dieci dialoghi e parte B.

## A5 — consuntivo Toast e campanella, 05/09/2026
Tre toni, azioni contestuali, chiusura per messaggio; campanella limitata alle richieste in attesa secondo G22/G29. Riusi Card/Toolbar/Badge/Button/ListRow; nuovi ToastRegion/Toast/NotificationPanel; zero token. Aperti tutti i 12 PNG toast/campanella/originale-notifiche/originale-toast a 1440/1280/1024, e Chat canonica sottostante. Originale osservato senza sessioni: popup vuoto e messaggio Riprendi; fixture nuova con richiesta, nessuna equivalenza dei dati dichiarata. Benefici verificati: azione e chiusura raggiungibili, ritorno del fuoco alla campanella, nessuna scomparsa durante lettura nella regia.
Generazione e build verdi; test:lab 120/120; Playwright diretto con originale 135/135, zero flaky. Regressione doppio gestore coperta in modo permanente. Non verificato B7: timer del motore reale, raggruppamento notifiche e apertura della sessione/richiesta corretta. Il clic della fixture apre veloPermessi solo per il disegno; NON equivale all'approvazione del tool reale. Richiesta al ponte/orchestratore: mantenere l'identità sessione e approval della notifica.
Cosa deve fare l'owner: nulla per sbloccare. Cosa fa Astra dopo: albero nella rail File. Cosa rimane: albero, dieci dialoghi, parte B.

## A6 — consuntivo 05/09/2026
Albero aperto nella rail File con toggle Nascondi/Mostra, cinque comandi originali, filtro limitato ai file caricati, cartelle e tipi di file, selezione, tastiera e menu con sei azioni. Nessuna pagina aggiunta. Dettagli apre la rail a 1024; chiusura riporta al pulsante. Riuso InspectorCard/Toolbar/Field/Button/Badge; nuovi FileTree/FileTreeRow/ContextMenu inventariati. Zero token e icone nuove.
Generazione/build verdi; test:lab 126/126; npx con originale 144/144, zero flaky. Aperti e riaperti i sei PNG albero-file/menu-file dopo correzione del filtro, tre originali 4179, confronto con la rail canonica. L'originale senza sessioni mostra albero vuoto e comandi disabilitati; nessun confronto numerico con la fixture. Beneficio verificato: albero separabile dai file toccati, filtro con portata esplicita, menu raggiungibile da Shift+F10 e contenuto entro il viewport.
Limiti parte B2: lettura lazy reale, cache/sessione, risalita con fratelli reali, mutazioni ed errori. La risalita della regia espone la portata di sola lettura ma non carica dati. Apri/rinomina/elimina/radice e creazione si collegano ai dialoghi A7 ancora da consegnare. I file toccati restano nel riepilogo: B2 deve collegare anche quelle righe al menu comune.
Cosa deve fare l'owner: nulla per sbloccare. Cosa fa Astra dopo: dieci dialoghi A7, iniziando da Modello. Cosa rimane: A7 e parte B.

## Merge orchestratore c5b570a2 (include 9d1db1ba)
Review a schede, Chat, composer, stato vuoto e collassi ricevuti. Generazione/build verdi; parità 126/126, componenti 24/24. Parti riservate conservate; dettaglio dei due conflitti e osservazione sulla selezione della scheda Review nel ledger.
Cosa deve fare l'owner: nulla. Cosa fa Astra dopo: riprende i dialoghi, Intro compatta e maniglie. Cosa rimane: parte A residua e parte B; B8 solo densità, chiaro, lingua.

## A7.1 — Modello e maniglie comuni, consuntivo 05/09/2026
Modello: due fonti, ricerca nome/autore/ID, gruppi richiudibili, selezione locale/remota, refresh, accesso al Model Lab, sei livelli e Automatico, Mostra ragionamento. Tre maniglie per ciascuno degli undici dialoghi, tastiera 16 px, trascinamento, misura ricordata nella chiave originale, doppio clic per ripristinare. Riusi OverlayLayer/Dialog/Tabs/Field/ListRow/SettingRow/Resizer; nuovi ModelPicker e Range; zero token e icone. Nessuna modifica ai blocchi riservati di Claude.
Generazione e build verdi (30 asset), test:lab 135/135, Playwright diretto con originale 156/156, zero flaky. Aperti dialogo-modello, originale-dialogo-modello, dialogo-misura, nuova-riferimento e palette a 1440/1280/1024. Confronto: tutte le capacità del selettore originale rappresentate; originale 431 remoti/0 locali, fixture 3/2, nessuna equivalenza dei dati dichiarata. Beneficio verificato: Mostra ragionamento visibile alla misura iniziale, recuperabile con la sua etichetta dopo riduzione; reset esplicito di Automatico e dimensioni. Scorrimento confinato alla lista alla misura iniziale; corpo scorrevole quando ridotto a mano.
Regressioni corrette e testate: controllo sotto piega, destinazione Model Lab errata; test Palette aggiornato al CSS responsive di Claude, senza force. Richiesta a Claude: Comandi non raggiungibile col puntatore quando la colonna centrale misura meno di 640 px; Ctrl+K verificato. Testata lasciata intatta.
Non verificato/B7: creaModelPicker e creaEffortPicker con catalogo e sincronizzazione server; nessuna chiamata API della regia. Maniglie da innestare nel gestore originale senza duplicarlo. Gli altri nove dialoghi devono ancora essere disegnati; Intro deve ancora ricevere il chooser compatto.
Cosa deve fare l’owner: valutare gli screenshot alla consegna A. Cosa fa Astra dopo: albero compatto nell’Intro. Cosa rimane: nove dialoghi A7 e parte B, con B8 limitata a densità/chiaro/lingua.

## A2 — Intro con chooser compatto, consuntivo 05/09/2026
Cartella scelta nel primo passo: percorso e risalita, tre categorie, albero compatto, ricerca sui nodi caricati, crea cartella, aggiorna, comprimi e copia. Conservati tutti e quattro i passi, ritorno alle scelte, fornitori/locali, permessi e riepilogo. Riusi FolderPicker/FileTree/FileTreeRow/Field/FilterChips/Toolbar/Steps/Dialog; zero nuovi blocchi, token e icone. Markup iniziale dell’albero presente anche nel template senza regia.
Generazione e build verdi (30 asset); test:lab 138/138; Playwright diretto con originale 162/162. Aperti i 24 PNG intro-cartella/modello/remoto/permessi/fine, intro-chooser-albero/vuoto e originale-chooser alle tre larghezze. Corrette e coperte da test: percorso su più righe, categorie prive di stile, bordo vuoto residuo, scelta e privacy sotto piega nel passo Cartella. Nel passo Modello remoto il contenuto lungo scorre; nessun controllo perso. Il precedente errore UNKNOWN di salvataggio PNG non si è ripetuto nel cancello completo.
Originale ispezionato: l’Intro rimanda alla scelta cartella dopo la fine; il nuovo la integra al primo passo. Beneficio verificato: selezione visibile insieme al contesto, tastiera con fuoco distinto dalla scelta, ricerca con portata esplicita, avanti/indietro conserva il percorso. Originale: C:/ e 32 cartelle, fixture: C:/progetti e sette nodi iniziali; nessuna equivalenza dei dati dichiarata.
B7 ancora necessario: creaWorkspaceChooser e /api/v1/workspace-browser, allowlist e validazione server, creazione reale della cartella, configurazione modello/effort/planner della Nuova sessione. La regia modifica solo dati dimostrativi; nessuna operazione reale sul disco. Anche i nuovi aggiornamenti di Claude fino a fb0e5fda sono stati uniti; nessuna modifica ai suoi blocchi.
Cosa deve fare l’owner: nulla per sbloccare. Cosa fa Astra dopo: dialogo Ambiente e altri otto dialoghi. Cosa rimane: nove dialoghi A7 e parte B nell’ordine richiesto.

## A7.2 — Ambiente, consuntivo 05/09/2026
Dialogo nello stesso mockup: ramo, worktree esplicitamente non osservata, percorso selezionabile/copiabile, repository annidati con fiducia separata, nuova sessione altrove. Riusi Dialog/OverlayLayer/Resizer/InspectorCard/Field/Toolbar/Button/Badge e righe KV; zero nuovi blocchi, token, icone e CSS. Aperti i sei PNG dialogo-ambiente/originale-dialogo-ambiente a 1440/1280/1024. Tutte le azioni visibili, nessun overflow orizzontale; copia con fallback manuale e chooser con focus verificati.
Generazione/build verdi; test:lab 144/144; Playwright diretto con originale 171/171. Originale propone cinque ambienti ma non li avvia e non persiste le tre checkbox; queste promesse non operative non sono riportate come funzioni. Il nuovo dettaglio segue i fatti già esposti da aggiornaPannelloAmbiente; fixture dimostrativa, collegamento B7 ancora richiesto. Dati originali e fixture diversi, nessuna equivalenza dichiarata. Accesso originale alle larghezze strette osservato dopo apertura a 1440 e ridimensionamento; nessun force click.
Cosa deve fare l’owner: nulla per sbloccare. Cosa fa Astra dopo: Rinomina sessione. Cosa rimane: otto dialoghi A7 e parte B.

Controllo sul merge finale: ricevuti breakpoint e testata su una riga, anello di focus del composer e tastiera sidebar di Claude (non una modifica ai dialoghi). Rigenerazione/build e test:lab ripetuti: 144/144; riaperti i tre PNG Ambiente con il guscio aggiornato. Il diretto 171/171 precede questo ultimo merge; nessuna modifica ai riferimenti originali.

## A7.3 — Rinomina sessione, consuntivo 05/09/2026
Un campo preselezionato, limite 80, Annulla/Salva, errore associato al campo vuoto, trim e suffisso per nome già usato. Conferma nel Toast e nome conservato alla riapertura della fixture; Escape/Annulla conservano il precedente. Riusi Dialog/OverlayLayer/Resizer/Field/Button/Toast: zero blocchi, token, CSS e icone nuovi. Aperti i sei PNG dialogo-rinomina/originale-dialogo-rinomina a 1440/1280/1024. Il nuovo campo comunica il limite e la gestione dei doppioni prima della conferma; errore vuoto ora esplicito. Nessuna modifica al markup riservato.
Generazione/build verdi; test:lab 150/150; Playwright diretto con originale 180/180. Test di nome con markup (<img>) conferma testo inerte, nessuna interpretazione HTML. Originale osservato senza sessione, fixture con nome dimostrativo; nessuna equivalenza dei dati dichiarata. Il salvataggio API e l’aggiornamento delle etichette reali restano B7, riusando renameForm e nomeUnicoSessione originali; nessuna persistenza server dichiarata per la regia.
Cosa deve fare l’owner: nulla per sbloccare. Cosa fa Astra dopo: Riferimenti @. Cosa rimane: sette dialoghi A7 e parte B.

## A7.4 — Riferimenti @, consuntivo 05/09/2026
Suggerimenti nel Dialog comune: ricerca per nome/percorso, file modificati prima dei caricati, selezione con frecce/Invio, sostituzione dell’ultimo @ e ritorno al composer. Ricerca vuota con spiegazione e Apri albero funzionante anche a 1024. Riusi Dialog/OverlayLayer/Resizer/Field/ListRow/Button; zero nuovi blocchi, token, CSS e icone. Nessuna modifica al markup del composer riservato.
Generazione/build verdi; test:lab 156/156; Playwright diretto con originale 189/189. Aperti i nove PNG dialogo-riferimenti/riferimenti-vuoto/originale-dialogo-riferimenti a 1440/1280/1024; icone rivedute dopo correzione. Corrette con scenari permanenti due regressioni: escape perso nel riconoscimento dello spazio prima di @; riferimento SVG i-file inesistente, sostituito da i-doc. Controllo statico aggiuntivo: nessun use del mockup rimanda a un simbolo assente.
Originale aperto senza sessioni (vuoto); fixture nuova con tre percorsi, nessuna equivalenza dei dati dichiarata. Beneficio verificato: ricerca con ambito dichiarato e recupero diretto all’albero; inserimento conserva il prefisso e non invia il messaggio. B7 deve mantenere suggerimentiRiferimentiReali (reviewFiles/treeCache, massimo 12, nessuna fetch aggiuntiva) e autoGrowTextarea.
Cosa deve fare l’owner: nulla per sbloccare. Cosa fa Astra dopo: anteprima File e operazioni collegate. Cosa rimane: sei dialoghi A7 e parte B.

Coordinamento owner 05/09/2026: 81cc5cc5 già unito; testata su una riga preservata. Intro compatta 893f9d18, Palette beaf93f9 e Model Lab 822a28d1 sono già consegnati in questa worktree. In B Browser usa data-vaia="browser", le maniglie setupModalResize e talos-harness-modal-sizes-v1, le rotte fase 3 restano nascoste con data-richiede="fase3".

## Richiesta owner — accesso account Anthropic e ChatGPT, 05/09/2026
Richiesta acquisita durante A7. Implementazione distinta dalla sostituzione UI, che conserva priorità A → B. Nessun login avviato e nessuna credenziale letta/copiata.
Fonti aperte oggi: https://learn.chatgpt.com/docs/app-server (account/login/start chatgpt e chatgptDeviceCode, completed, cancel, logout, rateLimits/read); https://learn.chatgpt.com/docs/auth (abbonamento distinto da API); https://hermes-agent.nousresearch.com/docs/integrations/providers/ (Hermes documenta ChatGPT OAuth e Anthropic Max + extra usage; quota ChatGPT dichiarata non documentata da Hermes); https://code.claude.com/docs/en/legal-and-compliance (autenticazione utente nel binario Claude Code non modificato, con condizioni; vieta login Claude.ai proprio e intermediazione credenziali). Pagine correnti rilette, date di revisione non esposte; snippet di ricerca Anthropic meno aggiornato del testo aperto, usato solo quest’ultimo.
Decisione preliminare: valutare Codex App Server come integrazione upstream; per Claude valutare binario ufficiale non modificato con autenticazione propria, oppure API. Non dichiarare il token OAuth abbonamento come API key universale. Prima del codice: pin delle versioni, contratto adapter, ledger file/funzioni/test, confini esecuzione Talos/runtime esterno e test reali login/annulla/scadenza/logout/quota senza segreti in browser/log. Nessuna implementazione né superiorità rivendicata.
Cosa deve fare l’owner: nulla ora; in prova completa personalmente il login ufficiale. Cosa fa Astra dopo: chiude i dialoghi UI e la parte B; poi slice autenticazione dedicata. Cosa rimane: verifica tecnica end-to-end e implementazione, oltre al piano computer-use già richiesto.

## A7.5 — Anteprima File, consuntivo 05/09/2026
Consegna nel mockup: testo in sola lettura, percorso, copia con recupero quando Clipboard non disponibile, allegato alla chat, errore e Riprova. Riusi OverlayLayer/Dialog/Resizer/CodeBlock/Callout/Button; zero CSS, token, icone o blocchi nuovi. Guardati nove PNG dialogo-file/file-guasto/originale-dialogo-file, ciascuno 1440/1280/1024; dopo ispezione corretto percorso che spariva nell’errore e contenuti distinti per cinque file fixture. Originale csb.log letto dal vivo e fotografato; dati diversi dalla fixture dichiarati, nessuna equivalenza quantitativa. Originale mantiene chiusura, maniglie e lettura; beneficio: copia/allega in una sola azione dall’anteprima e recupero errore.
Generazione e build 30 asset verdi; test:lab 162/162, Playwright diretto 162/162; sei prove mirate con originale 4179 verdi prima delle ultime correzioni, controllo percorso/README incluso in entrambe le suite finali. I test originali delle precedenti consegne conservano i loro screenshot: la nuova copia store cambia i dati, il confronto File usa il nuovo store. Nessuna richiesta a runtime modello. B7 riusa apriFileAlbero, mount.isConnected, limite 512 KiB, endpoint reale e setupModalResize.
Cosa deve fare l’owner: guardare la consegna, nulla per sbloccare. Cosa fa Astra dopo: Rinomina file. Cosa rimane: cinque dialoghi A7, recupero Copia/Rivela A6, parte B; accessi account e piano computer-use registrati.
