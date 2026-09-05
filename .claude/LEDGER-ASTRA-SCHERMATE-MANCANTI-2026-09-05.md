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
