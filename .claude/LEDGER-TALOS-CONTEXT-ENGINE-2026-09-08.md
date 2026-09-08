# Ledger TCEC — 2026-09-08
## Autorizzazione e stato
Piano approvato esplicitamente. Autorizzati implementazione con5incarichi e commit locali: prevale su vecchie regole skill/AGENTS che vietavano implementazione delegata/commit. Nessuna regola AGENTS modificata. Ambito desktop confermato dall'owner, niente corePHP/control-plane/mobile.
Base f9ec4eaa; worktree AVM-context-engine isolata.4174 invariato. Stato F0inavvio; nessuna promozione.
## Fonti e contratto
RICERCA-TALOS-CONTEXT-ENGINE-2026-09-08.md; CONTRATTI-TALOS-CONTEXT-ENGINE-2026-09-08.md. Fonti rinnovate08Sep2026 prima edit.
## Inventario esclusivo
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
## Documenti root aggiunti prima comportamento
- .claude/PIANO-TALOS-CONTEXT-ENGINE-2026-09-08.md
- .claude/DECISIONI-TALOS-CONTEXT-ENGINE-2026-09-08.md
- .claude/LEDGER-TALOS-CONTEXT-ENGINE-2026-09-08.md
- .claude/RICERCA-TALOS-CONTEXT-ENGINE-2026-09-08.md
- .claude/RISULTATI-TALOS-CONTEXT-ENGINE-2026-09-08.md
- .claude/CONSEGNA-TALOS-CONTEXT-ENGINE-2026-09-08.md
- .claude/CUSTODIA-BENCHMARK-TALOS-CONTEXT-ENGINE-2026-09-08.md
- .claude/CONTRATTI-TALOS-CONTEXT-ENGINE-2026-09-08.md
EmendamentoF0: aggiunto documento contratti per congelare payload/porte prima delega, nessun cambio prodotto.
## Simboli pubblici
Engine e tipi tutti nel documento CONTRATTI; root parseContextRecord/Settings/Summary, computeContextBudget/planCompaction/selectClosedPrefix, buildSummaryRequest/validateSummary/composeActiveContext/validateContextProfile.
Storage: createSqliteContextStore/ContextStoreError, appendOriginalBatch/commitContextVersion/readContextSnapshot, saveJobProgress/claimContextJob/readContextOutbox/ackContextEvent, importLegacySession/selectLastValidCheckpoint/exportContextArchive/verifyContextArchive/importContextArchive.
Providers: createContextModelAdapter/prepareProviderContext/createContextTokenCounter/countPreparedContext/createNativeCompactionAdapter/qualifyNativeCompaction/createContextToolCatalog/searchToolCatalog/getToolDescriptor/resolveCatalogInvocation/validateCatalogArguments.
Retrieval: chunkContextRecords/rankContextSources/selectContextEvidence/createContextEmbeddingRuntime/ensureEmbeddingModel/embedContextBatch/createToolOutputCompressor/compressCapturedToolOutput/createContextAssetAdapter/archiveContextAsset/resolveContextAsset.
UI: montaContextCompactor/aggiornaContextCompactor/creaSeparatoreContesto/aggiornaSeparatoreContesto/createContextClient.
QA: createTalosContextEngineBenchmarkArm/buildContextEngineCases/scoreContextEngineCase/runContextEngineQualification/verifyContextEngineEvidence/runContextEngineLiveQa.
Compatibilità: talosLavora/chiamaConRitenta/compattaConversazione, createOwnerRuntimeAdapter/createSessionRegistry, vecchioHTTPcompact, AGUIe schema messaggi nativi esistente.
## RED/GREEN
F0 tests/contracts.test.mjs: CTX-CONTRACTS rejects malformed records/settings/summaries; attesoRED module absent.
F1 tests/sqlite-store.test.mjs: CTX-PERSIST-FAILURE/CRASH-PUBLISH/STALE-JOB/SESSION-ISOLATION; RED module absent; GREEN node --test tests/sqlite-store.test.mjs tests/legacy-import.test.mjs tests/context-export.test.mjs (context-engine cwd).
F2 tests/engine.test.mjs+summary.test.mjs+compaction-planner.test.mjs: EMPTY/TRUNCATED/NO-REDUCTION/CANCEL/PIN-CONFLICT/RESTORE-SUFFIX/TOOL-PAIRING; RED module absent. GREEN node --test tests/engine.test.mjs tests/summary.test.mjs tests/compaction-planner.test.mjs.
F3 provider/token/catalog tests: NATIVE-PREFIX/MODEL-SWITCH/NO-IMPLICIT-CLOUD/TOOL-DISCOVERY/POLICY-EQUIVALENCE; RED module absent; GREEN node --test tests/context-provider-adapter.test.mjs tests/context-token-counters.test.mjs tests/context-native-compaction.test.mjs tests/context-tool-catalog.test.mjs (harness-ui).
F3 retrieval/embedding/output/assets tests: RAW-TOOL-8000/ASSET-ROUNDTRIP/SESSION-ISOLATION; RED module absent; GREEN node --test tests/retrieval.test.mjs (context-engine), node --test tests/context-embedding-runtime.test.mjs tests/context-tool-output.test.mjs tests/context-asset-adapter.test.mjs (harness-ui).
F4 frontend: UI-RECONNECT component/unit/browser naturale; RED module/route absent. GREEN npm run test:unit; npm run test:componenti; node scripts/run-browser-tests.mjs tests/browser/context-compactor.spec.mjs --config=playwright.config.mjs.
F5 live: node scripts/qa-context-engine-live.mjs; qualification protocol fixed and storedraw.
Comandi tutti con rtk proxy. Regressioni: npm run verify:all (harness-ui), npm test (context-engine), git diff --check. Prima suiteglobale una sola esecuzione coordinata.
## CancellI reali
SQLiteworkerdisco+fault, sqlite-vecWindows, RTKbinario+stdin, QwenGGUFhash+inferenzalocale,6profilimodello API/locali, chatreale+screenshot3dimensioni. Non sostituibili con mock.
## Rollback
Test soltanto directory temporanee. Pubblicazione transazionale/CAS. BackupAPI+manifest prima trial. Nessuna scrittura negli originali di produzione. Ritorno vecchiaapp mediante exportcompleto validato. Nessun reset/revert del lavoro owner.
## Scenari permanenti
- CTX-RESUME-406 — pianificato, non ancora eseguito
- CTX-RAW-TOOL-8000 — pianificato, non ancora eseguito
- CTX-EMPTY-SUMMARY — pianificato, non ancora eseguito
- CTX-TRUNCATED-SUMMARY — pianificato, non ancora eseguito
- CTX-NO-REDUCTION — pianificato, non ancora eseguito
- CTX-CANCEL — pianificato, non ancora eseguito
- CTX-PERSIST-FAILURE — pianificato, non ancora eseguito
- CTX-CRASH-PUBLISH — pianificato, non ancora eseguito
- CTX-STALE-JOB — pianificato, non ancora eseguito
- CTX-TAIL-RECOVERY-APPEND — pianificato, non ancora eseguito
- CTX-TOOL-PAIRING — pianificato, non ancora eseguito
- CTX-NATIVE-PREFIX — pianificato, non ancora eseguito
- CTX-MODEL-SWITCH — pianificato, non ancora eseguito
- CTX-PIN-CONFLICT — pianificato, non ancora eseguito
- CTX-RESTORE-SUFFIX — pianificato, non ancora eseguito
- CTX-SESSION-ISOLATION — pianificato, non ancora eseguito
- CTX-ASSET-ROUNDTRIP — pianificato, non ancora eseguito
- CTX-TOOL-DISCOVERY — pianificato, non ancora eseguito
- CTX-POLICY-EQUIVALENCE — pianificato, non ancora eseguito
- CTX-NO-IMPLICIT-CLOUD — pianificato, non ancora eseguito
- CTX-UI-RECONNECT — pianificato, non ancora eseguito
- CTX-USAGE-ACCOUNTING — pianificato, non ancora eseguito
## Consegna corrente
Owner: nessuna scelta. Io dopo: test RED e contratti, primaondata. Rimane: implementazione completa e qualificazione.

