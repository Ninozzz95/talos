# Code review — rilievi e trattamento

Revisione della guardia CSS della PR e dei sorgenti del laboratorio approvato. Priorità indicate come impatto nel relativo contesto: un P1 della demo non è la prova di un incidente nel runtime Talos. I rilievi sono stati trasformati in correzioni e regressioni quando verificabili nell'ambiente disponibile.

## Rilievi corretti

| ID / priorità | Problema osservato | Correzione e punto da leggere | Copertura |
| --- | --- | --- | --- |
| R01 / P1 produzione | Il dettaglio poteva sopravvivere a una selezione assente/incoerente; un figlio nascosto poteva sopprimere la lista | Guardia negativa su tab Agenti, gestione della selezione concorrente, esclusione del figlio `hidden` in `inspector-tab-visibility.css` | 16 condizioni in `visibility-regression.html` |
| R02 / P2 produzione | Il selettore semplice `[hidden]` era nella stessa lista di un selettore `:has()` | Regola semplice separata e blocco `@supports`. Non si dichiara un fallback funzionale completo per vecchie WebView | Ispezione CSS e test Chromium; vecchie WebView non provate |
| R03 / P1 demo | Lookup con fallback ai dati iniziali e riferimenti non aggiornati dopo eliminazione/rinomina | Lookup solo sui file vivi; `remapReferences` aggiorna selezioni, contesti delle sessioni, agenti e clipboard tagliata | Browser: rinomina fra sessioni, cestino, ripristino, reset |
| R04 / P1 demo | Copia e duplicazione potevano perdere il contenuto; collisioni non governate | Copia del corpo, nomi deterministici `copia-n-`, controllo case-insensitive anche nel cestino | Unit: nomi/collisioni; browser: duplicate/copy/paste mantengono `renderInspector` |
| R05 / P1 demo | Review dipendeva dal nome mutabile del CSS: rinominandolo si rompeva il rendering | Snapshot immutabile della proposta in `workspace-views.js`, separato dalla mappa dell'explorer | Browser: `review snapshot survives explorer rename` |
| R06 / P1 demo | Stati terminali e conflitto non erano protetti in modo uniforme | Reducer: APPLY solo da ready senza conflitto; DISCARD solo da ready; nuova revisione esplicita | Unit e browser su conflitto, integrazione, scarto e revisione |
| R07 / P2 demo | Regex arbitraria nel percorso di input e messaggi di errore insufficienti | Query compilata una volta; limite 128; subset regex dichiarato e input limitato; errore visibile con `aria-invalid` | Unit su pattern invalidi/pericolosi; browser su errore e ricerca |
| R08 / P2 demo | Geometria virtuale non allineata alla densità; apertura di fixture sintetiche instabile | Altezza letta da CSS, intervallo virtuale puro, seed una sola volta e lookup stabile | Unit geometria; browser scroll, densità, conteggio, Home/End |
| R09 / P2 demo | Focus, menu, gestione dello scroll e cancellazione del trascinamento incompleti | Roving focus, gruppi tree, tastiera menu, background inert, chiavi scroll per sessione/tab e pointercancel | Browser tastiera, cambio tab, modal, resize e larghezze desktop |
| R10 / P2 demo | Script unico difficile da ispezionare | Separazione in stato puro, modello ricerca, rendering e controller/eventi; build deterministica | Syntax check, typecheck dei due moduli puri, verifica build e blob Git |

## Controlli di scope e manutenibilità

Il solo CSS operativo aggiunto dalla PR è circoscritto a `.talos-inspector`. Non aggiunge colori né altera il theme engine. L'import resta in coda al foglio esistente. La shell, i token e la composizione del prototipo approvato non sono stati sostituiti da un nuovo design.

Le stringhe dei file inserite nell'HTML passano da `esc`; i messaggi dell'utente sono inseriti con `textContent`. I gestori rimangono registrati una volta a livello di documento. Sono stati aggiunti cleanup per pointercancel e dragend. Nessuna chiamata filesystem, fetch, socket o modello è presente nel laboratorio; nessuna richiesta è stata osservata nel percorso browser provato.

Il renderer usa ancora template HTML e stato mutabile locale per le fixture. La suddivisione dei file riduce il costo di lettura del diff, ma non trasforma questa struttura in un runtime pronto per eventi remoti non fidati.

## Rilievi residui e limiti

**R11 — routing reale da verificare.** La CSS legge `aria-selected`; non corregge chi imposta erroneamente la tab. Un reset di `activeTab` nel monolite richiede una correzione distinta. Riprodurre il caso reale Agenti → dettaglio → File in una sessione viva prima del merge.

**R12 — accessibilità non certificata.** Le prove coprono interazioni da tastiera, nomi, attributi e ripristino del focus su percorsi scelti. Non sostituiscono screen reader, audit di contrasto completo, navigazione vocale o validazione di ogni combinazione tree/nodo/azione. Nel grafo restano controlli annidati nei nodi; verificare la semantica con tecnologie assistive prima del porting.

**R13 — limiti degli identificativi e delle operazioni.** Gli ID dei file sono nomi di fixture, non identità filesystem persistenti. La validazione non costituisce una difesa server per path traversal, symlink, case folding o operazioni concorrenti. I dati non devono essere collegati al disco con questo solo controller.

**R14 — prestazioni non generalizzabili.** L'explorer è virtualizzato nel dataset di prova; la sidebar attiva può essere ricostruita su interazione. Non ci sono prove di throughput realtime, centinaia di agenti o consumo memoria prolungato.

**R15 — affidabilità delle prove.** I test browser usano Chromium e `set_content`; la fixture CSS usa `--inline` perché HTTP/file sono bloccati dall'ambiente. Non provano il caricamento dell'import nel bundle finale né tutte le WebView distribuite.

## Esito della self-review

Correzioni e documentazione sono utilizzabili per la review del laboratorio e della guardia circoscritta. L'integrazione nell'app completa resta subordinata ai controlli manuali riportati in `REVIEWER_CHECKLIST.md`. Nessuna auto-approvazione o equivalenza tra test locali e CI è dichiarata.
