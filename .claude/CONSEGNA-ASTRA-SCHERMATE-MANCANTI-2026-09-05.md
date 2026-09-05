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
