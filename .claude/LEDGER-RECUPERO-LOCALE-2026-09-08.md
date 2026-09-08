# LOCAL-RESUME-01 — recupero nella stessa conversazione

Base UI consegnata `00328868`. Decisione esplicita owner: stessa conversazione, eventi originali conservati, correzione tracciata. Il piano non autorizza riscritture del file dell'owner o prove di invio sulla 4174. La correzione si applica al prossimo resume attraverso il prodotto; prima prove su store isolato.

## Evidenza e upstream, prima del codice

Ricerca `.claude/RICERCA-MOTORE-LOCALE-2026-09-08.md`, consultazione 08/09. llama.cpp b10517 (`dc72703fc69698b1ea68ece8d2dd8a96e6a4e1fe`) riparsa lo storico: issue #25510 e chiamata `{` effettivamente persistita nella sessione owner. La versione corrente non garantisce un rimedio tramite upgrade. Hermes v2026.9.7 (`2237be355906fbe6065ce1815711eee52b2d646e`) distingue archivio e contenuto API e conserva gli eventi storici; AG-UI StateDelta è già il contratto TALOS per aggiornamenti di stato.

Decisione upstream: adattare questi confini al JSONL/checkpoint TALOS esistente. Nessuna migrazione SQLite, nuovo SDK o protocollo di persistenza per questo bug. Nessun argomento inventato per rieseguire una chiamata: le chiamate storiche illeggibili e i loro risultati diventano una nota testuale esplicitamente marcata nel contesto inviato al modello, mentre le coppie valide rimangono intatte. La nota conserva nome, id, argomenti grezzi ed esiti storici; non è un comando. Gli eventi originali rimangono byte per byte nel prefisso del JSONL.

## File e simboli esatti

1. `harness-ui/src/session-registry.mjs`: nuova funzione privata `recuperaCronologiaTool(messaggi)` → `{messaggi, correzioni}`; `resume(sessionId, nuovoMessaggioUtente)` prepara una proiezione senza mutare lo storico. `persistiCheckpointRipresa(voce, messaggi, versioneGiro, recupero)` aggiunge metadati opzionali al record esistente. Persistenza del checkpoint prima dell'avvio; fallimento disco restituisce SESSION_STORE_WRITE_FAILED, nessun nuovo giro. `broadcast` e firma pubblica resume restano compatibili. Id mancanti/ambigui nelle chiamate corrotte falliscono esplicitamente anziché associare un risultato sbagliato.
2. `harness-ui/tests/session-registry.test.mjs`: LOCAL-RESUME-JSON-01 (stesso id, JSON valido per l'upstream, originali intatti), LOCAL-RESUME-JSON-02 (riavvio dal checkpoint recuperato e nessun doppio recupero), LOCAL-RESUME-JSON-03 (scrittura fallita non avvia runtime), più controprove su chiamate valide e gruppi misti. Fixture con `{` e risultato reale controllato, non dati sensibili dell'owner.
3. `harness-ui/frontend/src/legacy/app.js`: `handleRealEvent`, ramo StateDelta `/recuperoCronologia`, mostra una nota di stato sobria col conteggio, senza riversare JSON tecnico nella chat. Dedup `_sequenza` esistente, nessun listener nuovo.
4. `harness-ui/frontend/tests/browser/chat-attesa-fondo.spec.mjs`: CHAT-RECUPERO-01, nota visibile una volta anche al replay duplicato.
5. `harness-ui/public/app.js`: generato dalla build.
6. `harness-ui/public/build-manifest.json`: generato dalla build.
7. `.claude/RICERCA-MOTORE-LOCALE-2026-09-08.md`: dossier e limiti delle evidenze.
8. Questo ledger: progressione e risultati.
9. `.claude/taccuini/astra-chat-locali-2026-09-08.md`: nuove immagini realmente aperte, alle sei risoluzioni richieste per la UI.

Nessuna modifica prevista a kernel, schema AG-UI, session-store o dipendenze. Il checkpoint porta `recupero` con schema `talos.history-recovery.v1`, versione giro e correzioni (indici/call/result originali). Il contenuto wire resta quello già supportato dal kernel. Eventuale cambio di questi percorsi richiede aggiornamento del piano.

## Cancelli

Ripresa 08/09 dopo fix hover `e7bf5088`: ricerca issue llama.cpp #25510 e documentazione AG-UI events riconfermata. RED JSON-01 riprodotto senza errori di cleanup del test. Dettaglio associazione: chiamata corrotta associata solo ai risultati tool contigui del proprio turno; id duplicato nel gruppo, assente o risultato duplicato falliscono con HISTORY_RECOVERY_AMBIGUOUS. Gli id possono ricomparire in turni distinti. Le stringhe JSON valide e gli argomenti già oggetto rimangono invariati; nessuna normalizzazione generalista. Contenuto multimodale conservato aggiungendo un solo blocco testo. Nessuna nuova API pubblica. Comandi: `node --test --test-name-pattern=LOCAL-RESUME-JSON tests/session-registry.test.mjs`, `node --test tests/session-registry.test.mjs`, `npm test` da harness-ui; `npm run test:unit` e `node scripts/run-browser-tests.mjs --config=playwright.config.mjs tests/browser/chat-attesa-fondo.spec.mjs --workers=1` da frontend (porta isolata 4316). Prova reale: copia dello storico nel banco 4314, stesso id interno e modello locale, con invio dal composer.

RED: resume passa `{` al runtime e non registra recupero. GREEN: test nuovi, suite session-registry completa, backend completo, frontend unità e suite chat/replay. Controllare assenza di chiamate orfane, mantenimento contenuto e prompt, nessuna mutazione di input, persistenza e fallimento disco. Prova reale sul banco isolato: richiesta in italiano, follow-up con refuso, cambio sessione e ritorno, reload e nuova domanda; conservare richiesta/eventi ed esito. Non confondere adapter simulato con upstream reale.

Rollback: ritorno al codice precedente mantenendo record aggiuntivi e prefisso originale; i lettori vecchi ignorano i metadati aggiuntivi nel checkpoint. Nessuna cancellazione o riscrittura dello storico. L'overhaul generale (qualificazione, context size, nuovi runtime, benchmark comparativo) resta separato e non è dichiarato completo.

**Cosa deve fare l'owner:** nessuna nuova scelta per recuperare nella stessa sessione. **Cosa faccio io:** RED e implementazione. **Cosa rimane:** GREEN, prova upstream, consegna e benchmark.

Banco reale: 4314 già occupata da altro processo, lasciata intatta; nuova istanza 4317 con store scratchpad/prove/recupero-locale-20260908/sessions. Copia byte per byte della sessione owner più record di permessi Read only per la prova. Stesso id interno e modello; nessuna riscrittura del prefisso o del file owner. Nessun modello locale risultava caricato prima della prova. Il comando backend completo corretto è node --test tests/*.test.mjs (npm test non è definito); 1774/1774 verdi, frontend 463/463 e browser 15/15.

## Consegna verificata — 08/09, recupero JSON circoscritto

- RED JSON-01 riprodotto; GREEN session-registry 296/296, backend 1774/1774, frontend 463/463, browser 15/15. JSON-02 copre riavvio dopo checkpoint, JSON-03 disco ENOSPC senza avvio, JSON-04 tre ambiguità, JSON-05 contenuto multimodale e id riutilizzato in un turno distinto. CHAT-RECUPERO-01 copre replay duplicato e cambio sessione alle sei dimensioni.
- Foto ispezionate: larghezze 1024/1280/1440 e 1920×1080, 2560×1440, 3840×2160. Giudizi nel taccuino. Nuove copie di prova e verdetto in `scratchpad/prove/recupero-locale-20260908/verdetto.json`; indice visuale anche in `scratchpad/prove/ispezioni.md` (artefatti locali, esclusi dal commit).
- Binario reale: llama-server b10517, 0.1.2-dev, commit dc72703fc; Nemotron Cascade 2 30B-A3B Q4_0. Due invii reali dal composer sul banco 4317: «ci sie? Come ti avevo chiesto di chiamarmi?…» → ricorda Livia; dopo reload «Ora leggi README.md… non indovinare» → una lettura reale, risultato e risposta `sole-47`. Cambio sessione durante l'attesa superato. Lo storico iniziale di questa seconda prova è una fixture dichiarata, l'inferenza e lo strumento sono reali. Nessun invio sulla 4174.
- Copia dello storico owner: eliminato il rifiuto del JSON `{`, ma il runtime rifiuta 30.821 token su una finestra di 16.384. **La conversazione owner non è ancora riprendibile.** Il file owner rimane identico al prefisso della copia, verificato byte per byte. Nessuna compattazione o cambio modello applicati.
- LOCAL-CONTEXT-OVERFLOW-06: caso reale registrato nel verdetto; traduzione UI già coperta da `harness-ui/frontend/tests/unit/errori.test.mjs`. Preflight e recupero da saturazione restano da implementare, non chiusi dalla sola traduzione. Conteggio sullo snapshot originale: 398 chiamate, 397 `elenca` con `{}` identici; 398 risultati tutti identici. Una sola chiamata ha JSON incompleto.
- Stima `/fit` per 32.768 token: 36.593.045.952 byte richiesti, 23.014.629.376 disponibili, stato blocked/memory. È una stima del prodotto, non una prova dell'impossibilità hardware. Finestra non forzata. L'attuale `compatta` usa il modello globale e aggiorna memoria senza checkpoint durevole: non adoperato per aggirare questo blocco locale.
- Osservazione separata LAB-STATO-CARICATO-01: Installati e Panoramica davano indicazioni discordanti sul modello in memoria; nessuna cura in questa consegna, riproduzione automatizzata da preparare nella fase Model Lab.
- Modello del banco scaricato dalla memoria tramite UI a prove concluse. Build di 31 asset e riavvio 4174 riusciti. Nessun push. Nessuna modifica a kernel, modello, finestra, policy o file owner.

**Cosa deve fare l'owner:** decidere la strategia di riduzione delle ripetizioni prima della prossima modifica al contesto. **Cosa faccio io dopo:** proporre il recupero del contesto sulla base delle 397 chiamate identiche, con originali conservati. **Cosa rimane:** rendere riprendibile lo storico lungo, prevenire i loop, qualificare i tool e fare benchmark comparativi reali. Nessuna superiorità sui competitor dimostrata da questi due invii.
