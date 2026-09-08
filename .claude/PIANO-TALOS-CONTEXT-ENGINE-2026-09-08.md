# TALOS Context Engine Compactor — piano esecutivo approvato
Owner ha approvato il piano nella chat il2026-09-08. Questa copia operativa registra tutti i vincoli, assegnazioni e cancelli; dettagli dei payload in CONTRATTI-TALOS-CONTEXT-ENGINE-2026-09-08.md.
Base f9ec4eaa2162fc1dd93882ff3f195f784e2ee325, worktree principale AVM-context-engine, branch codex/talos-context-engine.
## Decisioni
1. Motore TALOS con riuso OSS qualificato; desktop prima, package comune senza HTTP/DOM.
2. Memoria soltanto della chat corrente; nessuna ricerca automatica in altre chat.
3. Autocompattazione attiva di default; preparazione anticipata su copia, barriera soltanto quando serve.
4. Modello sintesi segue sessione, selezione indipendente avanzata, nessun fallback cloud implicito.
5. Chat prioritaria, una inferenza GPU locale alla volta; indicizzazione e sintesi cedono risorse.
6. SQLite locale autorevole per le chat importate; originali conservati e versioni verificabili.
7. Import legacy alla riapertura; importazione collettiva facoltativa; sorgenti immutate.
8. Ricerca lessicale e semantica; embedding locale scaricato con consenso guidato e hash; FTS subito.
9. Da non dimenticare visibile: aggiungi/modifica/rimuovi; conflitto con pin richiede owner.
10. Ripristino di versione conserva e riaggancia i messaggi successivi; nessun undo filesystem.
11. Annullamento e crash non promuovono checkpoint parziali; ripresa job alla riapertura chat.
12. Nessun retry identico per overflow o mancata riduzione; recupero limitato poi intervento.
13. Interrompere nuove chiamate ripetitive; lasciare attivi processi già avviati.
14. Originali tool archiviati prima del taglio a 8000 caratteri; RTK non riesegue comandi.
15. Catalogo completo con descrizioni on demand, modulo del runtime collegato al compattatore.
16. Allegati recuperabili con byte/hash/MIME; limiti e capacità visive del provider rispettati.
17. Contatore euristico dichiarato; conteggio provider non automaticamente etichettato esatto.
18. Native compaction opzionale, visibile, abilitata solo dopo qualificazione con portabilità.
19. Modale semplice, sezioni avanzate, barra onesta e separatore persistente deduplicato.
20. Opzioni manuali modello/obiettivo/tail/istruzioni, valori incompatibili rifiutati.
21. Budget economico della sessione esterno: porta comune e contabilizzazione, niente doppio gestore.
22. Priorità correttezza, poi prestazioni misurate; non promettere superiorità o risparmio.
23. Qualificare due GGUF e quattro collegamenti cloud; indisponibilità = non qualificato.
24. Prove chat naturali multi-turn, refusi, stop, switch, reload; screenshot 1080p/1440p/4K.
25. Cinque incarichi Astra, root architettura/sicurezza/integratore; tre contemporanei in due ondate.
26. Attivazione prima su chat prova, diffusione generale soltanto dopo verifica owner.
27. Un commit per consegna verificabile; niente push/trailer; aggiornare ledger/consegna.
28. Custodia privata risultati grezzi, configurazioni e insuccessi per futura documentazione ufficiale.
## Pipeline
Archivio originale prima di normalizzazione/taglio; misura input effettivo completo; prepara candidato su prefisso chiuso stabile; segmenta entro finestra sintesi; sintetizza JSON senza strumenti; verifica citazioni/copertura/stop reason/testo/riduzione; compone sistema+pin+riassunto+tail+fonti; riconta richiesta; CAS pubblica versione+evento insieme.
Riusa segmenti verificati con riferimenti agli originali, mai deriva solo da riassunti di riassunti. Nessuna pubblicazione con tool pendenti. Modello/impostazioni/pin/redirect invalidano candidato incompatibile. Auto threshold75%, target55%, preferenza2scambi recenti: profilo iniziale da qualificare.
## Persistenza
SQLite context/context.sqlite sotto cartellaStore configurata; worker dedicato, singolo writer e transazioni; JSONL rimane per legacy non come autorevole di chat migrata.
Tabelle: context_sessions,original_records,content_blobs,record_assets,context_versions,summary_nodes,protected_facts,compaction_jobs,context_outbox,search_chunks+FTS5+vettori,usage_records.
Originali immutabili, hash, export con allegati e manifest; importidempotente ultima versione valida, sorgenteJSONL conservata. Nessun GC automatico originali.
## API
Engine: createContextEngine,appendOriginal,prepareForRequest,startCompaction,cancelCompaction,resumeCompaction,getContextState,updateContextSettings,listContextVersions,restoreContextVersion,upsertProtectedFact,removeProtectedFact,resolveFactConflict,searchContext,readContextSource,exportContext,importContext.
HTTP base /api/v1/sessions/:id/context: GET /, PATCH /settings, POST /jobs, GET/DELETE /jobs/:jobId, GET /versions, POST /versions/:versionId/restore, GET/POST /facts, PATCH/DELETE /facts/:factId, POST /facts/:factId/resolve, GET /sources/:sourceId, GET /export. Revisione e idempotenza nelle mutazioni. POST /compact compatibile tramite engine.
## UI
Modale canonica con auto-on, occupazione/riserva/metodo conteggio, stato, avvia/annulla, progress senza percentuali inventate. Sezioni pin/versioni/fonti/avanzate. Riusa dialoghi.js e chiave misure esistente. Separatore persistente con id evento/versione deduplicato. Nessun nuovo HTML separato.
## Concorrenza e responsabilità
Cinque incarichi Astra: storage/provider/retrieval xhigh prima ondata, UI/qualificazione high seconda. Root xhigh architettura/kernel/globali/merge/package+lockfile/docs. Worktree separate, nessuna sovrapposizione. Main solo runner globale/porte/GPU.
## Inventario esatto
## root
- context-engine/package.json
- context-engine/package-lock.json
- context-engine/README.md
- context-engine/THIRD_PARTY_NOTICES.md
- context-engine/src/contracts.mjs
- context-engine/src/engine.mjs
- context-engine/src/compaction-planner.mjs
- context-engine/src/summary.mjs
- context-engine/src/profiles.mjs
- context-engine/tests/contracts.test.mjs
- context-engine/tests/engine.test.mjs
- context-engine/tests/compaction-planner.test.mjs
- context-engine/tests/summary.test.mjs
- harness-ui/package.json
- harness-ui/package-lock.json
- harness-ui/server.mjs
- harness-ui/src/config.mjs
- harness-ui/src/agent-service.mjs
- harness-ui/src/session-registry.mjs
- harness-ui/src/session-store.mjs
- harness-ui/src/runtime-owner-adapter.mjs
- harness-ui/src/native-provider-adapter.mjs
- harness-ui/src/http-app.mjs
- harness-ui/src/agui-events.mjs
- harness-ui/src/kernel/talosHarness.mjs
- harness-ui/src/kernel/talosHarness.test.mjs
- harness-ui/frontend/src/legacy/app.js
- harness-ui/frontend/src/bridge/legacy-dom.js
- harness-ui/frontend/src/components/inspector.js
- harness-ui/frontend/src/components/contesto.js
- harness-ui/frontend/playwright.componenti.config.mjs
- harness-ui/frontend/index.template.html
- harness-ui/frontend/src/styles/index.css

## storage
- context-engine/src/node/sqlite-store.mjs
- context-engine/src/node/sqlite-worker.mjs
- context-engine/src/node/migrations/001-context.sql
- context-engine/src/node/legacy-import.mjs
- context-engine/src/node/context-export.mjs
- context-engine/tests/sqlite-store.test.mjs
- context-engine/tests/legacy-import.test.mjs
- context-engine/tests/context-export.test.mjs

## providers
- harness-ui/src/context-provider-adapter.mjs
- harness-ui/src/context-token-counters.mjs
- harness-ui/src/context-native-compaction.mjs
- harness-ui/src/context-tool-catalog.mjs
- harness-ui/tests/context-provider-adapter.test.mjs
- harness-ui/tests/context-token-counters.test.mjs
- harness-ui/tests/context-native-compaction.test.mjs
- harness-ui/tests/context-tool-catalog.test.mjs

## retrieval
- context-engine/src/retrieval.mjs
- context-engine/tests/retrieval.test.mjs
- harness-ui/src/context-embedding-runtime.mjs
- harness-ui/src/context-tool-output.mjs
- harness-ui/src/context-asset-adapter.mjs
- harness-ui/tests/context-embedding-runtime.test.mjs
- harness-ui/tests/context-tool-output.test.mjs
- harness-ui/tests/context-asset-adapter.test.mjs

## ui
- harness-ui/frontend/src/components/context-compactor.js
- harness-ui/frontend/src/components/context-separator.js
- harness-ui/frontend/src/services/context-client.js
- harness-ui/frontend/mockup/talos-mockup.html
- harness-ui/frontend/tests/unit/context-compactor.test.mjs
- harness-ui/frontend/tests/unit/context-separator.test.mjs
- harness-ui/frontend/tests/unit/context-client.test.mjs
- harness-ui/frontend/tests/parity/context-compactor.spec.mjs

## qualification
- harness-ui/benchmarks/autocompact/talos-context-engine.mjs
- harness-ui/benchmarks/autocompact/talos-context-engine.test.mjs
- harness-ui/benchmarks/autocompact/context-engine-cases.mjs
- harness-ui/benchmarks/autocompact/context-engine-protocol.json
- harness-ui/benchmarks/autocompact/engines.mjs
- harness-ui/benchmarks/autocompact/qualification.mjs
- harness-ui/benchmarks/autocompact/qualification.test.mjs
- harness-ui/benchmarks/autocompact/README.md
- harness-ui/tests/context-engine-integration.test.mjs
- harness-ui/tests/context-engine-recovery.test.mjs
- harness-ui/tests/context-engine-routes.test.mjs
- harness-ui/frontend/tests/browser/context-compactor.spec.mjs
- harness-ui/scripts/qa-context-engine-live.mjs
## Prove permanenti
- CTX-RESUME-406
- CTX-RAW-TOOL-8000
- CTX-EMPTY-SUMMARY
- CTX-TRUNCATED-SUMMARY
- CTX-NO-REDUCTION
- CTX-CANCEL
- CTX-PERSIST-FAILURE
- CTX-CRASH-PUBLISH
- CTX-STALE-JOB
- CTX-TAIL-RECOVERY-APPEND
- CTX-TOOL-PAIRING
- CTX-NATIVE-PREFIX
- CTX-MODEL-SWITCH
- CTX-PIN-CONFLICT
- CTX-RESTORE-SUFFIX
- CTX-SESSION-ISOLATION
- CTX-ASSET-ROUNDTRIP
- CTX-TOOL-DISCOVERY
- CTX-POLICY-EQUIVALENCE
- CTX-NO-IMPLICIT-CLOUD
- CTX-UI-RECONNECT
- CTX-USAGE-ACCOUNTING
## Qualificazione
3ripetizioni per 2GGUF, resume/memoria5compattazioni/tools/continuità; estendere20compattazioni, fatti distribuiti, negazioni/revoche/nomisimili, outputlunghi, allegati/model-switch/memoria.
Stesso hardware/modello/hash/finestra/riserva/prompt, un locale alla volta. Confronti componente separati dalle app; vecchi raw immutabili. API4provider da qualificare separatamente, indisponibile nonqualificato.
Chat reale composer/backend/provider, naturali e refusi, followup/reload/stop; screenshot1920x1080,2560x1440,3840x2160 e regressioni viewportesistenti.
## Consegne e rollback
Contratti/RED -> archivio -> engine -> provider/ricerca/toolcatalog -> UI -> qualificazione -> provaowner. Commit perconsegna, nopush/notrailer. Backup verificato prima trial. Rollback tramite exportoriginali compatibile.4174 invariato, istanzaprove separata. Custodia privata con manifest/hash/insuccessi.

