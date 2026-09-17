# Sidebar sinistra desktop — audit e checkpoint del 17 settembre 2026

## Stato del lavoro

Base: `main` a `13f65c15cdeaf8986b882993a0773cdeafb867d2`.
Branch: `refactor/desktop-left-sidebar-2026-09-17`.
Questo lavoro non riprende né modifica la PR #27.

Questo è un audit del sorgente, non una certificazione visuale dell'applicazione. Il refactor complessivo e la Definition of Done dei due documenti dell'owner **non sono completati**. Le osservazioni sotto distinguono fatti letti nel codice, rischi da riprodurre nell'app e proposte ancora da implementare. Le scelte storiche commentate nel repository descrivono il comportamento di partenza: non sostituiscono i requisiti di questo incarico.

Scope: sidebar sinistra desktop e dipendenze strettamente necessarie. Nessun intervento su mobile/tablet, sidebar destra, contenuto principale, routing globale, theme engine o backend in questo checkpoint.

## 1. Mappa tecnica verificata

Percorsi relativi a `harness-ui/frontend/`, salvo indicazione diversa.

| Area | Sorgente e responsabilità |
| --- | --- |
| Avvio | `src/main.js`: monta il ponte DOM prima dell'import dinamico di `src/legacy/app.js`; poi monta le animazioni. Il contratto `window.__talosHarnessHost` distingue l'host embedded dal caso standalone. |
| Guscio | `src/bridge/legacy-dom.js`: associa la sidebar a `#sessionsPanel`, il collapse a `#sessionsCollapseBtn`, ricerca a `#sessionSearch`, nuova sessione a `#newSessionBtn`, elenco a `#sessionList`; il resizer riceve `data-resize="sessions"`. |
| Navigazione | `src/components/nav-item.js`, verificato anche attraverso `tests/unit/componenti-sidebar.test.mjs`: gruppi Spazi di lavoro e Strumenti. Il primo comprende Chat, Note, Attività, Libreria, Memoria, Ricerca, Progetti, Board; il secondo Modelli, Capability, Officina, Automazioni, Doctor. |
| Elenco reale | `src/legacy/app.js`: `contenitoreSessioniReali`, `aggiornaElencoSessioniReali`, selezione multipla, azioni di gruppo, apertura delle sessioni, menu e roving tabindex. |
| Riga | `src/components/session-item.js`: nome leggibile, tassonomia, ordine dell'albero, riga compatta e aggiornamento DOM puntuale. |
| Consumo | `src/components/consumo-sessione.js`: consumo della sessione distinto dall'ultimo invio; i giri fermati sono conteggiati senza inventare token. |
| Stato rete | `src/components/connessione.js`: sorveglianza delle fetch/SSE/browser e battito di recupero; l'indicatore è montato nella barra di stato della chat, non costituisce una prova di sincronizzazione dell'intero elenco. |
| Piede e stile | `src/components/workspace-footer.js`; `src/styles/primitives.css`, `mockup-sidebar.css`, `sessioni-vive.css`, importati da `main.css`. Riutilizzare i token `--talos-*`; nessun CSS viene cambiato nel primo blocco. |

Albero DOM rilevante: `#sessionsPanel` contiene brand/azioni, ricerca/nuova sessione, navigazione, `#sessionList > #realSessionsBlock`, piede e resizer. Le righe reali sono avvolte in `.td-session-row`: il bottone di apertura e il menu overflow sono fratelli.

Il ponte rimuove le righe dimostrative e inizialmente nasconde Fissate. Questo **non basta** a concludere che pin e persistenza siano assenti a runtime: completare il tracciamento di quei percorsi prima di modificarli.

## 2. Stato e contratti da preservare

La UI è JavaScript con DOM incrementale, non React. Non serve introdurre un framework o un nuovo store globale per ottimizzare questa superficie.

La precedenza attuale di `statoSessione` è: approvazione richiesta; interruzione; esecuzione non conclusa; stop esplicito; errore; successo; esito non registrato. La riga pendente è un'opzione distinta. Conservare la differenza fra fermata volontaria, interruzione del processo ed errore reale.

`statoSessione` e le funzioni di identità sono consumate anche da Board e altre superfici. Una nuova classe di stato richiede una verifica dei consumatori: non cambiare la semantica condivisa incidentalmente per curare la sola sidebar.

L'ordine corrente mantiene le deleghe sotto la madre, conserva le orfane, evita di perdere le sessioni nei cicli e promuove gli alberi attivi. Fra gli alberi attivi usa l'ultima risposta **terminata**, non i token. Il primo blocco deve restituire esattamente lo stesso ordine e gli stessi nomi distintivi.

## 3. Problemi e rischi identificati

### A01 — aggiornamento puntuale e ricostruzione totale convivono

`aggiornaSessionItem` aggiorna stato e giri senza sostituire la riga. Ma `aggiornaElencoSessioniReali` costruisce nuovamente tutti i bottoni, wrapper e listener e termina con `contenitore.replaceChildren(...pezzi)`. Il refresh periodico richiama questa seconda funzione.

Rischio concreto: identità DOM persa e focus/roving tabindex ricostruiti durante l'interazione, anche quando cambiano poche informazioni. La perdita effettiva di focus e lo scroll vanno misurati nel browser: non sono stati presentati come verificati visualmente.

Direzione: riconciliazione per `sessionId`, patch delle sole proprietà cambiate, riordino strutturale differito durante focus/menu/interazione. Non aggirare il problema intercettando o sovrascrivendo `replaceChildren` globalmente.

### A02 — il realtime delle altre sessioni non è dimostrato

È presente `notificheTimer`, ogni 15.000 ms a documento visibile, che rilegge l'elenco. Gli `EventSource` individuati ascoltano la singola sessione aperta, una figlia aperta o una prova Model Lab; lo stream del browser ha un'altra finalità. Questo non dimostra un canale aggregato per tutte le sessioni.

Lo stream della sessione gestisce anche replay e `talos.fine-rigiocata`. Un futuro adattatore non deve trasformare la storia rigiocata in nuova attività né contare due volte gli eventi.

Prima di implementare il canale aggregato: completare la lettura di `harness-ui/src/session-registry.mjs` e delle rotte effettive. Non promettere un frontend completamente event-driven senza la corrispondente sorgente. Un'eventuale aggiunta server dovrà essere minima, necessaria alla sidebar e documentata separatamente.

### A03 — freschezza dei contatori diversa dal loro valore

`aggiornaContatoriLuoghi` limita le riletture a 15 secondi o al cambio sessione. I contatori per sessione verificano l'id dopo le richieste asincrone; un errore conserva il dato precedente invece di inventare zero. È una buona base, ma un valore conservato non equivale a un valore live.

`creaSorveglianzaConnessione` può dichiarare il ritorno della rete dopo una fetch o un health check riuscito. Questa informazione non prova che un eventuale stream della sidebar abbia recuperato tutti gli eventi. Tenere separati stato operativo, stato del trasporto e freschezza dello snapshot.

### A04 — errori e risposte concorrenti dell'elenco

La fetch dell'elenco fallita viene ignorata senza segnalazione locale; evita toast invasivi ma lascia la sidebar senza spiegazione della propria freschezza. Il codice usa anche `elenco.length` prima della normalizzazione con `Array.isArray`. La funzione non contiene un token di generazione per escludere una risposta vecchia arrivata dopo una nuova.

Da coprire nel blocco del controller: risposta malformata, fetch sovrapposte, disconnessione, recupero, elenco precedente conservato ma esplicitamente stale, primo caricamento distinto da elenco vuoto.

### A05 — dato parziale scambiato per stato attivo

`!sessione.conclusa` considera attivo anche un oggetto privo del campo. È un caso limite del classificatore verificabile da sorgente, non la prova che il server produca oggi quel payload. Prima della correzione, definire validazione del contratto e rappresentazione dei dati parziali senza regressioni dei consumatori condivisi.

### A06 — selezione multipla e semantica

Il menu overflow è correttamente fratello del bottone di apertura. In selezione multipla, invece, `creaSessionItem` inserisce un `input[type=checkbox]` dentro il bottone. Occorre separare i controlli preservando i selettori della selezione, il click di apertura, le frecce/Home/End, Tab verso il menu e il ripristino del focus.

Il roving tabindex esiste già. Non aggiungere un secondo gestore di tastiera concorrente né attribuire indiscriminatamente il ruolo `tree` senza implementarne tutto il contratto.

### A07 — finestra temporale della novità

La guardia attuale verifica solo `adesso - ultimaRisposta <= 60.000`: un timestamp futuro soddisfa la condizione. Il primo blocco aggiunge il limite inferiore senza cambiare la finestra di 60 secondi o l'esclusione della sessione corrente.

La scadenza del segnale rimane inoltre legata al ridisegno. Il clock centralizzato e la distinzione fra novità temporanea e non-letto persistente appartengono al blocco del controller; questo checkpoint non dichiara risolti quei requisiti.

### A08 — allocazioni quadratiche nel completamento dell'albero

L'ultima passata di `ordinaSessioniAdAlbero` esegue `fuori.slice(i + 1).find(...)` per ogni riga. Anche su un elenco piatto copia complessivamente `n × (n − 1) / 2` riferimenti: 19.900 per 200 righe. È un costo identificato nel codice, non un tempo di rendering misurato nell'app.

Sostituire solo questa passata con uno stack: ogni riga viene inserita e rimossa al massimo una volta. Verificare equivalenza completa dell'output. Non attribuire complessità lineare all'intero ordinamento: rimangono le operazioni di sort precedenti.

Virtualizzazione: `@tanstack/virtual-core` è già una dipendenza del frontend. Non aggiungerne un'altra e non montare una virtual list prima di misurare il costo residuo e il comportamento di focus/gerarchia.

### A09 — stato derivato dal testo renderizzato

Quando il modello non viene passato a `aggiornaSessionItem`, viene recuperato spezzando il testo su ` · `. Anche un'etichetta di stato può contenere quel separatore. Da eliminare nella definizione del modello di presentazione: la UI deve leggere dati strutturati, non ricostruirli dal proprio testo.

## 4. Benchmark iniziale: fonti primarie consultate

Consultazione: 17 settembre 2026. I riferimenti sono comparativi; non rappresentano test eseguiti su quelle applicazioni e non provano capacità equivalenti in Talos.

| Riferimento | Pattern e contesto | Beneficio | Limite / decisione per Talos |
| --- | --- | --- | --- |
| [Claude Code, sessioni](https://code.claude.com/docs/it/sessions) | Selettore CLI con nomi descrittivi, ricerca, metadati compatti, gruppi e navigazione da tastiera. | Identità e contesto riconoscibili senza aprire tutto. | Preservare nomi e genealogia; non copiare scorciatoie del terminale né confondere cronologia con telemetria realtime. |
| [Hermes, sessioni](https://hermes-agent.nousresearch.com/docs/user-guide/sessions) | Metadati strutturati, nomi leggibili, ricerca e ripresa della cronologia. | Separazione fra identità persistente e contenuto della conversazione. | Conservare gli identificatori internamente e nomi umani nella lista; non trasferire il suo modello di persistenza/backend a Talos. |
| [Aider, comandi](https://aider.chat/docs/usage/commands.html) | Azioni esplicite e ispezioni contestuali, fra cui file e token. | Mostrare il dettaglio quando serve, invece di caricare ogni riga di metriche. | Non è una sidebar multi-sessione: riferimento per progressive disclosure, non prova di una tassonomia o di un ordinamento live. |
| [Pi, extension API](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md) | API con eventi di sessione/agente/modello/tool e rendering separato. | Eventi operativi distinti dalle scelte di presentazione. | Usare la separazione concettuale; non importare un sistema di estensioni o inventare stati assenti nei contratti Talos. |
| [VS Code, Views](https://code.visualstudio.com/api/ux-guidelines/views) | Viste focalizzate e gerarchie adatte al contenuto, evitando superfici duplicate. | Navigazione prevedibile con densità controllata. | Preferire le primitive esistenti; non moltiplicare gruppi, rail o pannelli. |
| [WAI-ARIA APG, Disclosure](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/) | Bottone di apertura/chiusura con stato espanso e comportamento da tastiera. | Semantica verificabile, coerente fra mouse e tastiera. | Applicare ai disclosure reali, non come sostituto di markup corretto o come motivo per cambiare tutte le liste in alberi ARIA. |

Le future decisioni significative su ricerca, raggruppamento, riordino durante l'interazione, selezione e navigazione richiedono una matrice di almeno cinque riferimenti **pertinenti alla specifica decisione**, come richiesto dall'owner. Questa ricognizione di sei fonti non è un'autorizzazione indiscriminata a introdurre tutti quei pattern. Il primo blocco non introduce un nuovo interaction pattern: corregge la finestra di novità e conserva l'output dell'albero.

## 5. Sequenza e checkpoint

### A0 — audit del sorgente

Area: entry point, lista, righe, consumo, connessione, contratto della navigazione.
Problemi: A01–A09 sopra. File modificato: questo documento.
Scelta: mettere in sicurezza derivazioni verificabili prima del controller realtime e della UI.
Alternative scartate: restyling immediato, nuovo framework, un EventSource per ogni riga, virtualizzazione preventiva, dati inventati.
Verifiche: lettura dei sorgenti e dei test esistenti; nessuna build o QA visuale dichiarata.

### A1 — primo blocco implementativo previsto

File: `src/components/session-item.js` e nuovi test unitari pertinenti.
Prima/dopo: identico ordine, nomi, gerarchia, markup e semantica degli stati; niente segnale di novità per date future; passata finale dell'albero senza copie quadratiche.
Test: confini temporali, data invalida, sessione corrente, orfane/cicli, ordine delle deleghe, immutabilità, equivalenza su dataset da 5/50/200 sessioni e archivi più grandi. Nessuna soglia temporale fragile nella suite.
Rischio: regressione di `ultima` sui cambi di profondità; testare il risultato contro la definizione precedente. Il primo blocco non risolve A01–A06, A09 o la scadenza autonoma della novità.

### A2–A4 — lavoro ancora necessario

Controller e fonte realtime aggregata; riconciliazione keyed e snapshot/replay/stale; clock condiviso; poi layout, tooltip/status e selezione accessibile; infine test integrati e QA visuale desktop. Completare l'audit di ricerca, Fissate, persistenza, collapse/resize e interazioni dei menu prima di cambiarli.

## 6. Cancelli di verifica e limiti dell'ambiente

Il frontend dichiara Node `>=24.18.0 <27`, `npm run test:unit`, `npm run test:componenti`, `npm run build` e `npm run verify`. Nell'ambiente di questa sessione è disponibile Node 22.16.0; il clone locale non è riuscito per risoluzione DNS. L'accesso al codice e alla branch avviene tramite il connettore GitHub.

Eventuali prove isolate eseguite qui devono riportare runtime, dipendenze effettivamente caricate e limitazioni. Non sostituiscono i gate del progetto sul runtime richiesto. Non risultano eseguiti lint/typecheck globali, suite completa, build desktop, contrasto, screen reader, keyboard-only nell'app, screenshot before/after o profili di rendering.

La PR non deve essere dichiarata pronta finché i gate richiesti non siano passati o le failure preesistenti siano riprodotte e documentate. Nessuna failure viene attribuita alla baseline senza una prova.
