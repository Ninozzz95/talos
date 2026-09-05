# Consegna delle schermate nel mockup — 05/09/2026

Ordine owner: consegnare nel file canonico; interrompere anteprima 43821, audit Hermes e dossier. Intro, Palette e Model Lab obbligatori con parità completa. Commit per schermata, senza push né trailer.

## A3 Browser — piano prima degli edit
Sottosistema: TALOS UI, mockup dimostrativo. Base allineata fast-forward 1813e27a per avere il generatore richiesto. Nessun file HTML separato nuovo.

Fonti riverificate il 05/09/2026: https://www.w3.org/WAI/ARIA/apg/patterns/tabs/ (documento stabile: tab attivo e tastiera); https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/hidden (aggiornato 17/04/2026, stabile: hidden esclude rendering). Decisione: adattare la regia esistente, condividere tab e hidden; niente dipendenze nuove. Non sono novità dichiarate degli ultimi 30 giorni.

File modificati: .claude/MOCKUP-REDESIGN-TALOS-2026-09-04.html; harness-ui/frontend/index.template.html; harness-ui/frontend/src/styles/index.css; harness-ui/frontend/tests/parity/parita.spec.mjs. File creati: questo ledger; .claude/CONSEGNA-ASTRA-SCHERMATE-MANCANTI-2026-09-05.md; .claude/immagini/astra-mockup/browser-1440.png; .claude/immagini/astra-mockup/browser-1280.png; .claude/immagini/astra-mockup/browser-1024.png.

Contratti: schermoBrowser, SCHERMI, DI_SESSIONE, mostra, selezionaTab; selezionaPaginaBrowser, renderizzaBrowserDemo, annotaPaginaBrowser, conservaNotaBrowser, copiaPaginaBrowser, concludiRichiestaBrowser, cambiaStatoBrowser restano meccanica dimostrativa della stessa regia. Nessuna API aggiunta; integrazione backend nella parte B.

RED: ASTRA Browser navigazione, letture e permessi (schermo assente). GREEN: rigenerazione, build, npm run test:lab e npx playwright test --config=playwright.lab.config.mjs. Cancello esistente mantenuto, esteso Browser; nessun allentamento soglie. Prova visiva: tre screenshot aperti. Rollback: revert del solo commit della schermata (solo su richiesta owner).

Mostra: URL, testo letterale, cronologia con autore/orario, annotazione in bozza, note locali, copia, apertura esterna, vuoto, caricamento e permesso. Riusa: Topbar, Tabs, Page, Toolbar, Card, Field, Button, Badge, Callout. Nuovi: BrowserViewport, BrowserHistory, BrowserReader. Token aggiunti: da consuntivare. Cosa guardato: markup canonico e Browser già approvato; non riaperta l’anteprima 43821.

Ispezione aggiuntiva: mostra richiama selezionaTab che emette nuovamente talos:tab; correggere la sincronizzazione senza riemettere eventi. Scenario permanente ASTRA Browser include errori JS e navigazione. RED confermato: schermoBrowser assente (05/09/2026).

Regole annullate su ordine owner: rimosse esclusivamente le due aggiunte datate 05/09/2026 da C:/Users/Antonino/.codex/AGENTS.md e AVM/AGENTS.md. Conservato il rinvio RTK e tutte le regole preesistenti; nessuna nuova regola scritta.

05/09/2026 — correzione emersa dal test funzionale: String.replace interpreta $$ nel testo sostitutivo e ha duplicato il nome $. Fonte riverificata: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace . Adottata sostituzione tramite callback; lo scenario funzionale resta obbligatorio.

05/09/2026 — il test a 1280 evidenzia la nuova quarta tab fuori dall’area centrale: adattare solo le Topbar con data-vistetab usando flex-wrap, altezza minima originale e spazi dai token. Fonte: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/flex-wrap . Aggiunta Rileggi come stato dimostrativo richiesto dal §2.3. Accettazione: click reale a tutte le viewport, nessun overflow della sezione; nota conservata e ricarica annullabile.

Ispezione dei tre PNG: impaginazione senza tagli; evidenziata Chat invece di Browser perché il preparatore statico non aggiornava aria-selected. Corretto il preparatore su entrambe le pagine secondo APG Tabs (riverificato 05/09/2026); aggiunta asserzione della tab attiva nel percorso reale. Entrambi i comandi richiesti prima di questa correzione: 60/60 verdi.

### A3 consuntivo
Browser nel file canonico; template/CSS rigenerati. 29 simboli originali, zero token aggiunti. Screenshot browser-1440.png, browser-1280.png, browser-1024.png riaperti e guardati dopo la correzione della tab attiva: URL e azioni leggibili, testo a capo, cronologia riconoscibile, nessun overflow. npm run test:lab 60/60; comando npx richiesto 60/60; dopo correzione preparatore/inventario, 6/6 Browser. git diff --check verde. Regia e dati dimostrativi: niente invio chat, navigazione reale o persistenza dichiarati.

Cosa deve fare l’owner: può esaminare i PNG, nessuna decisione bloccante. Cosa faccio dopo: Palette con i 15 comandi. Cosa rimane: Intro, Model Lab, Toast, albero file, dialoghi, poi Parte B in ordine owner.

## A4 Palette — piano prima degli edit
05/09/2026. Fonti stabili riverificate: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ e https://www.w3.org/WAI/ARIA/apg/patterns/combobox/ . Adattare dialogo modale esistente e ricerca con lista/aria-activedescendant; conservare tutti i 15 data-command di public/index.html e executeCommand di public/app.js. File: mockup canonico, index.template.html, src/styles/index.css, tests/parity/parita.spec.mjs, questo ledger, CONSEGNA-ASTRA-SCHERMATE-MANCANTI-2026-09-05.md; nuove immagini palette-1440.png, palette-1280.png, palette-1024.png nella cartella di consegna. Simboli: veloComandi, apriComandi, filtraComandi, attivaComando, eseguiComando, aggiornaModalita. Riusa Dialog medium, ListRow, Field, Kbd, Badge. Nessun token nuovo. RED: ASTRA Palette 15 comandi ricerca tastiera; attesa assenza veloComandi. GREEN: cancello intero e percorso, tre PNG aperti. Azioni backend restano fuori dalla regia dimostrativa e vanno collegate nella parte B.

PNG Palette aperti: icona ricerca non allineata al Field e campo che scorre insieme ai risultati. Correzione prima della consegna: classe talos-field__icon originale e scorrimento solo della lista. Fonte riverificata 05/09/2026: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overflow-y . Nessun token nuovo.

### A4 consuntivo
Palette con 15 comandi originali ricercabili per nome e descrizione, gruppi, riga attiva, Ctrl K, frecce/Invio/Escape. Ricerca fissa e lista scorrevole. Dialoghi con focus contenuto e sfondo inert. Zero token, sprite invariato. test:lab 66/66; npx completo 66/66; dopo correzione del Field e dello scorrimento 6/6 mirati. PNG palette-1440/1280/1024 riaperti: icona allineata, lista e piede leggibili, nessun taglio esterno. Rinomina/Esporta puntano ai fogli della prossima consegna A7; Riprendi/Compatta/Condividi nella regia preparano esempi in bozza, nessuna esecuzione backend. Non dichiarata parità delle operazioni reali, prevista nella parte B.
Cosa deve fare l’owner: nulla per sbloccare. Cosa faccio dopo: Intro e dialoghi. Cosa rimane: resto A e parte B.

## A2 Intro — piano prima degli edit
05/09/2026. Fonti: https://www.w3.org/WAI/tutorials/forms/multi-page/ e APG dialog-modal, stabili riverificate oggi. Adattare indicatore di passi e ritorno senza perdere dati. Ordine owner Cartella → Modello (comprende accesso al fornitore e prova chiave) → Permessi → Fine. Conservare le quattro politiche originali, scelta esplicita, indietro/salta/Escape, configurazione provider locale/remoto, scelta modello, riepilogo. Non memorizzare chiavi nel mockup. File: mockup canonico, index.template.html, src/styles/index.css, tests/parity/parita.spec.mjs, ledger e consegna correnti. Screenshot nuovi: intro-cartella-1440.png, intro-cartella-1280.png, intro-cartella-1024.png; intro-modello-1440.png, intro-modello-1280.png, intro-modello-1024.png; intro-permessi-1440.png, intro-permessi-1280.png, intro-permessi-1024.png; intro-fine-1440.png, intro-fine-1280.png, intro-fine-1024.png, tutti in immagini/astra-mockup. Simboli: veloIntro, mostraPassoIntro, concludiIntro, provaAccessoIntro. Nuovo IntroDialog; riuso Dialog, Steps, Picker, ListRow, Field, Select, Badge. Token: zero previsti. RED: ASTRA Intro quattro passi e quattro politiche (veloIntro assente). Rollback del solo commit su richiesta owner. Backend originale di accesso e preferenze da cablare in B, qui fixture esplicite.

Ispezione Intro a 1440: struttura coerente, ma politica selezionata e passo corrente non avevano enfasi persistente; il riepilogo mostrava il valore tecnico Workspace write. Correggere con stessi token di selezione e nome italiano. Fonte APG Radio riverificata 05/09/2026: https://www.w3.org/WAI/ARIA/apg/patterns/radio/ . Aggiungere frecce e roving tabindex alle quattro politiche e copertura prova accesso/errori.

### A2 consuntivo
Intro integrato: Cartella, Modello con accesso provider e prova chiave, quattro politiche, Fine. Indietro conserva i campi; Salta/Escape registrano esito demo; Inizia apre Nuova. Chiavi svuotate dopo prova e mai salvate. Controllati anche esito rifiutato e stato locale. 72/72 test:lab; 72/72 npx completo dopo correzioni visive. Dodici PNG dei quattro passi alle tre larghezze aperti; riaperti Permessi/Fine dopo correzione evidenza selezionata e nomi italiani. Riusa Picker, Steps, Dialog, Field, Select, ListRow e Badge; nuovo IntroDialog; zero token aggiunti. Link Model Lab completato nella prossima schermata A1.
Cosa deve fare l’owner: nulla per sbloccare. Cosa faccio dopo: Model Lab. Cosa rimane: Model Lab, Toast, albero, dialoghi e Parte B.
