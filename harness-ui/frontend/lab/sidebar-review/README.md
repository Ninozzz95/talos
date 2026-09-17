# Sidebar destra — primo checkpoint

Base analizzata: `13f65c15cdeaf8986b882993a0773cdeafb867d2`.

## Modifica di produzione

`src/styles/inspector-tab-visibility.css`, importato in coda a `src/styles/main.css`, limita la visibilità dell'ospite della conversazione figlia alla tab Agenti. Non cambia selezione, eventi, richieste o stato del dettaglio. Nessun nuovo colore, token o layout globale.

## Evidenze dell'audit

- `bridge/legacy-dom.js:210–230` mappa `data-rail` contesto/file/agenti/processi e gli attributi ARIA dei pannelli.
- `components/conversazione-figlia.js:380–405` documenta l'ospite fratello di `railAgenti` e la sua catena di scorrimento. Essere fratello significa non ereditare la visibilità del pannello.
- `styles/index.css:46–125` contiene i token reali Calm scuro: sfondo `#1e1f22`, accento `#c08b3c`, famiglie Instrument Sans e JetBrains Mono.
- `index.template.html` conserva una shell di conversazione, con Chat/Terminale/Review/Browser e gruppi Spazi di lavoro/Strumenti. Non è il generico IDE blu delle precedenti immagini, che non sono usate in questo lavoro.

Problema → dettaglio separato dal tabpanel. Alternativa → smontarlo a ogni navigazione, perdendo contesto. Scelta → guardia di visibilità basata sulla tab selezionata; mantenimento del DOM. Trade-off → dipendenza da `:has()` e dalla correttezza di `aria-selected` nel ponte legacy.

## Test della guardia

Aprire `visibility-regression.html` attraverso il server del frontend o come fixture locale. Carica il foglio effettivo, senza backend. Verifica 10 condizioni: visibilità, esclusione della lista sovrapposta, File/Context/Processi, ritorno al dettaglio, identità del nodo, scroll, chiusura e ritorno all'elenco. Tutte passate nel Chromium disponibile nell'ambiente di lavoro, con il foglio incorporato per superare il blocco amministrativo di file:// del browser di test.

Questo NON è un test end-to-end dell'app con sessione reale. La build completa, il lint del repository, le WebView distribuite e la correttezza del routing del monolite restano da verificare. Se il monolite cambia erroneamente la tab attiva, il presente foglio non corregge quel diverso problema.

## Prototipo HTML separato

Consegnato come allegato nella conversazione, con sorgenti e test. Le nuove interazioni File/Agenti/diagramma/review sono implementate nel laboratorio offline, NON collegate al backend Talos. Il laboratorio riusa i token verificati; la shell è ridotta e i font non sono incorporati. Non viene presentato come copia pixel-per-pixel dell'app avviata.

Verifiche del laboratorio: 8 test del modello di stato e 55 controlli browser, passati. Include selezione persistente, CRUD in memoria, ricerca sui dati demo, grafo, filtri, scope, replay, review, conflitti, stati e resize. Dati, costi, eventi, file, test ed esecuzioni sono simulati. Nessuna falsa integrazione AI.

## Ricerca iniziale

- W3C APG Tabs: https://www.w3.org/WAI/ARIA/apg/patterns/tabs/
- VS Code Custom Layout: https://code.visualstudio.com/docs/configure/custom-layout
- Claude Code Subagents: https://code.claude.com/docs/en/sub-agents
- Aider Repository Map: https://aider.chat/docs/repomap.html
- Pi: https://github.com/badlogic/pi-mono
- Hermes: https://github.com/NousResearch/hermes-agent

La consultazione iniziale non sostituisce il benchmark di cinque fonti per ciascuna futura funzionalità avanzata. Quella matrice resta da completare prima delle rispettive implementazioni di produzione.

## Fuori da questo checkpoint

Nuovo runtime event-driven, ricerca semantica e simboli reali, indicizzazione filesystem, grafi realtime reali, worktree e approvazioni reali, refactor globale, mobile/tablet. Il documento generale non è dichiarato completato da questa PR.
