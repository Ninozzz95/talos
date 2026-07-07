# TALOS AVM Agent Roadmap Checklist

> Control board operativo per orchestrare il lavoro dei sub-agent su TALOS, KADMOS, AVM core, validator, benchmark, sicurezza e UI.

**Master plan di riferimento:** `docs/architecture/talos-avm-feature-gap-full-implementation-plan.md`

**Regola bloccante:** nessun agente deve fare commit. Il commit lo fa solo l'utente.

**Obiettivo:** trasformare il master plan in una tabella di marcia eseguibile, con fasi, task assegnabili, check da barrare, test obbligatori, failsafe e gate di revisione.

---

## 0. Come Usare Questa Checklist

Ogni task ha campi da aggiornare dopo ogni modifica:

```text
Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked
Owner agent:
Started:
Last update:
Changed files:
Tests run:
Failsafe triggered:
Reviewer notes:
```

### Regole Operative Per Ogni Agente

- [ ] Prima di modificare file, leggere il task assegnato e il master plan.
- [ ] Prima di modificare codice, identificare il boundary: `core`, `validator`, `control-plane`, `TALOS UI`, `KADMOS CLI`, `docs`, `security`, `benchmarks`.
- [ ] Non toccare file fuori dal boundary senza dichiararlo nel report.
- [ ] Non fare commit.
- [ ] Non cancellare o revertare modifiche non proprie.
- [ ] Non introdurre feature visibili se non chiamano endpoint reali o non sono chiaramente marcate come dev/demo.
- [ ] Ogni task deve terminare con test mirati.
- [ ] Ogni fase deve terminare con test di integrazione della fase e `git diff --check`.
- [ ] Se un test fallisce, fermarsi, documentare il fallimento e non marcare il task come verificato.

### Status Semantics

- `Not started`: nessun file modificato.
- `In progress`: file modificati, test non ancora verdi.
- `Ready for review`: test mirati verdi, attesa revisione del capitano.
- `Verified`: revisione completata e test fase verdi.
- `Blocked`: impedimento reale, con causa e prossimo passo scritto.

### Failsafe Globale

Attivare failsafe e fermare il task se accade uno di questi casi:

- [ ] Un agente deve modificare file gia' modificati da un altro agente e non c'e' accordo sul merge.
- [ ] Una feature richiede API non esistenti e rischia di diventare UI finta.
- [ ] Un test core/validator/control-plane critico fallisce per causa non compresa.
- [ ] Una modifica sposta logica core in Laravel o logica product-state nel validator.
- [ ] Un endpoint espone segreti provider al browser in modalita' production.
- [ ] Un worker puo' accedere a rete privata, filesystem o inviare email senza policy/capability.
- [ ] La dashboard mostra metriche benchmark non prodotte da backend o non marcate demo.

---

## 1. Ruoli Degli Agenti

### Captain Agent

**Responsabile:** orchestrazione, assegnazione task, review, integrazione, decisioni architetturali.

- [ ] Mantiene questa checklist aggiornata.
- [ ] Decide se un task puo' partire.
- [ ] Controlla overlap file tra agenti.
- [ ] Esegue review dei report agent.
- [ ] Lancia test di fase.
- [ ] Non fa commit.

### Agent A: UI Foundation

**Boundary:** `control-plane/resources/js`, `control-plane/resources/css`, views Laravel solo quando necessario.

- [ ] shadcn-vue style primitives.
- [ ] component split.
- [ ] command palette.
- [ ] chat UX.
- [ ] dashboard cockpit UX.
- [ ] build frontend.

### Agent B: Laravel Control Plane

**Boundary:** `control-plane/app`, `control-plane/routes`, `control-plane/database`, `control-plane/tests/Feature`.

- [ ] migrations.
- [ ] models.
- [ ] controllers.
- [ ] request validation.
- [ ] services.
- [ ] feature tests.

### Agent C: AVM Core

**Boundary:** `core/src`, `core/tests`, benchmark domain where core-owned.

- [ ] AST orchestration.
- [ ] node state.
- [ ] worker interfaces.
- [ ] execution policy.
- [ ] benchmark semantics.
- [ ] deterministic tests.

### Agent D: Validator

**Boundary:** `validator/src`, `validator/tests`, `validator/dist` after build.

- [ ] Zod schemas.
- [ ] stateless validation routes.
- [ ] compatibility redirects.
- [ ] validator tests and build.

### Agent E: Benchmark Evidence

**Boundary:** `core/src/Benchmark`, `core/tests/benchmarks`, `control-plane/app/Services/Benchmarking`, benchmark UI.

- [ ] AVM ON/OFF fairness.
- [ ] benchmark persistence.
- [ ] report export.
- [ ] metrics.
- [ ] threshold tests.

### Agent F: Security And Policy

**Boundary:** `core/src/Security`, security tests, Laravel capabilities, audit, token scopes.

- [ ] SSRF.
- [ ] worker policy.
- [ ] capability checks.
- [ ] audit events.
- [ ] provider secret handling.

### Agent G: KADMOS CLI

**Boundary:** `core/kadmos`, `core/kadmos.cmd`, `core/src/Cli`, CLI tests.

- [ ] guided shell.
- [ ] slash commands.
- [ ] JSON output.
- [ ] doctor.
- [ ] trace/replay/recovery commands.

### Agent H: QA Docs And E2E

**Boundary:** docs, test harness, Playwright/Vitest when introduced.

- [ ] acceptance docs.
- [ ] test matrix.
- [ ] E2E flows.
- [ ] regression checklist.

---

## 2. Phase 0: Preflight And File Ownership Lock

**Goal:** evitare conflitti tra agenti prima di scrivere codice.

**Captain status:** [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

### Task 0.1: Snapshot Stato Worktree

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner:** Captain Agent

**Check:**

- [ ] Eseguire `git status --short`.
- [ ] Annotare file gia' modificati.
- [ ] Separare modifiche utente da modifiche agent note.
- [ ] Non fare reset/revert.

**Test:** nessuno.

**Failsafe:**

- [ ] Se ci sono modifiche nello stesso file che un agente deve toccare, assegnare quel file a un solo agente.

**Done quando:**

- [ ] Esiste una lista di file lock per la fase successiva.

### Task 0.2: Definire File Lock Per Phase 1

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner:** Captain Agent

**File lock iniziale:**

```text
Agent A:
  control-plane/resources/js/lib/*
  control-plane/resources/js/components/ui/*
  control-plane/resources/js/components/talos/*

Agent B:
  control-plane/database/migrations/*
  control-plane/app/Models/*
  control-plane/app/Http/Controllers/*
  control-plane/app/Services/*
  control-plane/routes/api.php

Agent C:
  core/src/*
  core/tests/*

Agent D:
  validator/src/*
  validator/tests/*
  validator/dist/*
```

**Check:**

- [ ] Confermare che nessun agente tocchi lo stesso file senza handoff.
- [ ] Identificare file condivisi: `routes/api.php`, `app.js`, `TalosChatPage.vue`, `TalosShell.vue`.

**Failsafe:**

- [ ] File condiviso modificato da due agenti -> fermare uno dei due e integrare manualmente.

### Task 0.3: Baseline Test Prima Di Partire

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner:** Captain Agent

**Comandi:**

```powershell
cd core
php kadmos test

cd ..\validator
npm test
npm run build

cd ..\control-plane
php artisan test
npm run build

cd ..
git diff --check
```

**Check:**

- [ ] Core baseline registrata.
- [ ] Validator baseline registrata.
- [ ] Laravel baseline registrata.
- [ ] Frontend baseline registrata.
- [ ] Diff whitespace pulito.

**Failsafe:**

- [ ] Se un test baseline fallisce, aprire task bug separato prima delle nuove feature.

---

## 3. Phase 1: Contracts, API Client, UI Foundation

**Goal:** creare fondamenta stabili per far lavorare agenti in parallelo.

**Phase owner:** Agent A + Agent B, review Captain.

### Task 1.1: API Client Frontend Centralizzato

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent A

**Files:**

- [ ] Create `control-plane/resources/js/lib/api.ts`
- [ ] Create `control-plane/resources/js/lib/talosTypes.ts`

**Work checklist:**

- [ ] Definire `TalosApiError`.
- [ ] Definire `talosFetch<T>()`.
- [ ] Gestire JSON e non-JSON.
- [ ] Gestire 422 validation errors.
- [ ] Gestire network error con messaggio leggibile.
- [ ] Esportare tipi base: `TalosSession`, `TalosMessage`, `TalosRun`, `TalosRunEvent`, `TalosFile`, `TalosBenchmarkGroup`.

**Tests:**

- [ ] `cd control-plane && npm run build`
- [ ] Se Vitest non e' ancora presente, non introdurlo solo per questo task; aggiungerlo in Phase 13.

**Failsafe:**

- [ ] Non sostituire tutte le fetch call in un colpo se rischia regressione UI. Migrare solo chat/sessioni nel task successivo.

**Done quando:**

- [ ] Build passa.
- [ ] Nessuna chiamata nuova usa `fetch` diretto fuori dal client, salvo codice legacy esplicitamente non migrato.

### Task 1.2: Status Mapping Unico

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent A

**Files:**

- [ ] Create `control-plane/resources/js/lib/statusCopy.ts`
- [ ] Create `control-plane/resources/js/lib/statusTone.ts`

**Work checklist:**

- [ ] Mappare `PENDING`.
- [ ] Mappare `VALIDATED`.
- [ ] Mappare `RUNNING`.
- [ ] Mappare `SUCCESS`.
- [ ] Mappare `FAILED`.
- [ ] Mappare `BLOCKED_BY_DEPENDENCY`.
- [ ] Mappare `RETRYING`.
- [ ] Mappare `SKIPPED`.
- [ ] Mappare `PRUNED`.
- [ ] Ogni stato deve avere copy utente, copy inspector, tone, icon key.

**Tests:**

- [ ] `cd control-plane && npm run build`

**Failsafe:**

- [ ] Non nascondere lo stato tecnico dall'inspector; UX friendly in superficie, tecnico disponibile nei dettagli.

### Task 1.3: Command Registry

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent A

**Files:**

- [ ] Create `control-plane/resources/js/lib/commandRegistry.ts`
- [ ] Create `control-plane/resources/js/components/talos/shell/TalosCommandPalette.vue`

**Work checklist:**

- [ ] Definire command ids.
- [ ] Definire `label`, `description`, `category`, `risk`, `capability`, `disabledReason`.
- [ ] Inserire comandi iniziali: `new_session`, `send_message`, `attach_file`, `run_avm_compare`, `open_trace_replay`, `recover_failed_node`, `open_doctor`, `export_report`.
- [ ] UI palette apre, filtra e mostra disabled reason.

**Tests:**

- [ ] `cd control-plane && npm run build`

**Failsafe:**

- [ ] I comandi non devono chiamare funzioni fake; se handler reale manca, comando disabilitato.

### Task 1.4: Route Contract Tests

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent B

**Files:**

- [ ] Create `control-plane/tests/Feature/TalosRouteContractTest.php`

**Work checklist:**

- [ ] Test `/` redirect a `/chat`.
- [ ] Test `/chat` ritorna pagina chat.
- [ ] Test `/dashboard` ritorna cockpit.
- [ ] Test API compatibility endpoints esistenti non spariscono.

**Tests:**

```powershell
cd control-plane
php artisan test --filter=TalosRouteContractTest
```

**Failsafe:**

- [ ] Non cambiare route pubbliche senza aggiornare test e piano.

### Phase 1 Gate

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Captain checklist:**

- [ ] `php artisan test --filter=Talos`
- [ ] `npm run build`
- [ ] `git diff --check`
- [ ] Review manuale: nessuna UI fake nuova.
- [ ] Review manuale: `/chat` resta pulita.
- [ ] Review manuale: `/dashboard` resta cockpit.

---

## 4. Phase 2: Persistent Chat Sessions

**Goal:** trasformare chat e sessioni in prodotto persistente.

**Phase owner:** Agent B + Agent A.

### Task 2.1: Session And Message Migrations

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent B

**Files:**

- [ ] Create migration `create_talos_sessions_table`
- [ ] Create migration `create_talos_messages_table`
- [ ] Create `control-plane/app/Models/TalosSession.php`
- [ ] Create `control-plane/app/Models/TalosMessage.php`

**Work checklist:**

- [ ] Usare UUID o ULID coerenti.
- [ ] `talos_sessions`: user, title, mode, active model profile, metadata.
- [ ] `talos_messages`: session, role, content, model profile, run id, metadata.
- [ ] Cast JSON metadata.
- [ ] Relazioni model definite.

**Tests:**

- [ ] Create `control-plane/tests/Feature/TalosSessionPersistenceTest.php`
- [ ] Test create session.
- [ ] Test create message.
- [ ] Test session has messages.

**Failsafe:**

- [ ] Non aggiungere dipendenza da provider/chat esterna per test di persistenza.

### Task 2.2: Session API

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent B

**Files:**

- [ ] Create `TalosSessionController.php`
- [ ] Modify `control-plane/routes/api.php`
- [ ] Create request validation inline or FormRequest if grows.

**Endpoints:**

- [ ] `GET /api/talos/sessions`
- [ ] `POST /api/talos/sessions`
- [ ] `GET /api/talos/sessions/{session}`
- [ ] `PATCH /api/talos/sessions/{session}`
- [ ] `DELETE /api/talos/sessions/{session}`

**Tests:**

- [ ] `php artisan test --filter=TalosSessionApiTest`

**Failsafe:**

- [ ] Delete should be soft or guarded if linked runs exist. If hard delete is implemented, document it.

### Task 2.3: Message API And Chat Compatibility

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent B

**Files:**

- [ ] Create `TalosMessageController.php`
- [ ] Modify `TalosChatController.php`
- [ ] Modify `routes/api.php`

**Endpoints:**

- [ ] `POST /api/talos/sessions/{session}/messages`
- [ ] Keep `POST /api/talos/chat`

**Work checklist:**

- [ ] Persist user message.
- [ ] Call existing chat proxy behavior.
- [ ] Persist assistant/system response.
- [ ] Return normalized message payload.

**Tests:**

- [ ] Message creates persisted row.
- [ ] Failed chat call persists controlled system message or returns controlled error.
- [ ] Existing `TalosChatApiTest` still passes.

**Failsafe:**

- [ ] If provider call is unavailable, tests must fake HTTP and assert controlled behavior.

### Task 2.4: Chat UI Session Sidebar

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent A

**Files:**

- [ ] Split `TalosChatPage.vue`
- [ ] Create `components/talos/chat/TalosSessionSidebar.vue`
- [ ] Create `components/talos/chat/TalosChatThread.vue`
- [ ] Create `components/talos/chat/TalosComposer.vue`
- [ ] Create `composables/useTalosSessions.ts`
- [ ] Create `composables/useTalosChat.ts`

**Work checklist:**

- [ ] Load sessions.
- [ ] Create new session.
- [ ] Select session.
- [ ] Load messages.
- [ ] Send message through new session endpoint.
- [ ] Empty/loading/error states.
- [ ] Keep page clean, no cockpit panels.

**Tests:**

- [ ] `npm run build`
- [ ] Laravel route test still passes.

**Failsafe:**

- [ ] If API unavailable, show controlled error, not local fake session silently.

### Phase 2 Gate

**Captain checklist:**

- [ ] `php artisan test --filter=TalosSession`
- [ ] `php artisan test --filter=TalosMessage`
- [ ] `php artisan test --filter=TalosChat`
- [ ] `npm run build`
- [ ] Manual route check: `/chat` clean.
- [ ] `git diff --check`

---

## 5. Phase 3: Provider Profiles And Secret Safety

**Goal:** togliere API key raw dal browser in modalita' production.

**Phase owner:** Agent B + Agent F + Agent A.

### Task 3.1: Model Profile Persistence

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent B

**Files:**

- [ ] Create migration `create_talos_model_profiles_table`
- [ ] Create `TalosModelProfile.php`
- [ ] Create `TalosModelProfileController.php`

**Work checklist:**

- [ ] Store provider, model, display name.
- [ ] Store secret encrypted or `secret_ref`.
- [ ] Store base URL.
- [ ] Store capabilities JSON.
- [ ] Store probe status/result.

**Tests:**

- [ ] Profile create/update/list.
- [ ] Secret not returned by API.
- [ ] Invalid provider rejected.

**Failsafe:**

- [ ] If encryption config missing, endpoint must fail controlled, not store plaintext.

### Task 3.2: Provider Probe Service

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent B

**Files:**

- [ ] Create `TalosModelProbeService.php`
- [ ] Add `POST /api/talos/model-profiles/{profile}/probe`

**Probe checklist:**

- [ ] Connectivity.
- [ ] Simple completion.
- [ ] Structured JSON.
- [ ] JMP-generation sample.
- [ ] Timeout handling.
- [ ] Capability classification.

**Tests:**

- [ ] Timeout -> degraded.
- [ ] Bad endpoint -> failed with actionable message.
- [ ] Missing structured output -> unsupported for AVM planning.

**Failsafe:**

- [ ] Never call external provider in tests without fake HTTP.

### Task 3.3: UI Model Center

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent A

**Files:**

- [ ] Create `components/talos/models/TalosModelCenter.vue`
- [ ] Create `components/talos/models/TalosModelProbeLog.vue`
- [ ] Wire dashboard nav.

**Work checklist:**

- [ ] List profiles.
- [ ] Add profile form.
- [ ] Probe button.
- [ ] Show healthy/degraded/failed.
- [ ] Chat can select profile.
- [ ] Dev API-key fallback clearly marked dev-only if still present.

**Tests:**

- [ ] `npm run build`

**Failsafe:**

- [ ] Do not expose secret value back into inputs after save.

### Phase 3 Gate

- [ ] `php artisan test --filter=TalosModelProfile`
- [ ] `npm run build`
- [ ] Security review: browser payloads contain profile id, not raw secret, for production paths.
- [ ] `git diff --check`

---

## 6. Phase 4: Context Vault And File Ingestion

**Goal:** utenti caricano file reali e li usano nei run.

**Phase owner:** Agent B + Agent A + Agent F.

### Task 4.1: File And Context Tables

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent B

**Files:**

- [ ] Migrations: `talos_files`, `talos_file_chunks`, `talos_context_sets`, `talos_context_sources`
- [ ] Models for each table.

**Tests:**

- [ ] File metadata persists.
- [ ] Context set can attach file/chunk.
- [ ] JSON metadata casts.

**Failsafe:**

- [ ] Store file metadata even when parsing fails, with status `failed`.

### Task 4.2: Staged Ingestion Service

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent B

**Files:**

- [ ] Modify `FileIngestionService.php`
- [ ] Modify `FileBenchmarkScenarioFactory.php`
- [ ] Create parser classes if needed.

**Pipeline checklist:**

- [ ] `uploaded`
- [ ] `scanned`
- [ ] `parsed`
- [ ] `chunked`
- [ ] `embedded` or `available` if embeddings deferred.
- [ ] `quarantined`
- [ ] `failed`

**Tests:**

- [ ] Unsupported MIME returns 422.
- [ ] Oversize returns 422.
- [ ] Malformed file returns `failed` state.
- [ ] Prompt-injection string remains data.

**Failsafe:**

- [ ] Do not execute file contents.
- [ ] Do not send file content to tools without context-set selection.

### Task 4.3: Context Vault UI

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent A

**Files:**

- [ ] Create `TalosContextVault.vue`
- [ ] Create `TalosFileDropzone.vue`
- [ ] Create `TalosFileStatusList.vue`
- [ ] Create `TalosSourceDrawer.vue`
- [ ] Add composer file chips.

**Tests:**

- [ ] `npm run build`

**Failsafe:**

- [ ] If upload endpoint fails, show failed state; do not pretend file is indexed.

### Phase 4 Gate

- [ ] `php artisan test --filter=FileIngestion`
- [ ] `php artisan test --filter=Context`
- [ ] `npm run build`
- [ ] Security review for file upload limits.
- [ ] `git diff --check`

---

## 7. Phase 5: AVM Run Bridge And Event Timeline

**Goal:** ogni run produce eventi visibili.

**Phase owner:** Agent B + Agent C + Agent A.

### Task 5.1: Run/Event/Artifact Persistence

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent B

**Files:**

- [ ] Migrations: `talos_runs`, `talos_run_events`, `talos_run_artifacts`
- [ ] Models.
- [ ] `TalosRunController.php`

**Tests:**

- [ ] Create run.
- [ ] Append ordered events.
- [ ] Fetch events by run.
- [ ] Store artifact metadata.

**Failsafe:**

- [ ] Reject non-list events before replay.
- [ ] Enforce sequence ordering.

### Task 5.2: Run Event Normalizer

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent B + Agent C handoff

**Files:**

- [ ] Create `RunEventNormalizer.php`
- [ ] Extend core benchmark/run output only through explicit contract.

**Work checklist:**

- [ ] Normalize validation events.
- [ ] Normalize node status changes.
- [ ] Normalize worker output.
- [ ] Normalize policy decisions.
- [ ] Normalize artifacts.

**Tests:**

- [ ] Unknown event type becomes generic event.
- [ ] Missing node id allowed only where event type permits it.
- [ ] Event payload stays JSON serializable.

**Failsafe:**

- [ ] Do not parse core output by brittle string position if structured data is available.

### Task 5.3: Timeline And Node Inspector UI

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent A

**Files:**

- [ ] Create `TalosRunTimeline.vue`
- [ ] Create `TalosNodeGraph.vue`
- [ ] Create `TalosNodeInspector.vue`

**Work checklist:**

- [ ] Poll or load events.
- [ ] Render timeline.
- [ ] Select event/node.
- [ ] Show payload, status, dependency, policy, output.
- [ ] Show empty/degraded states.

**Tests:**

- [ ] `npm run build`

**Failsafe:**

- [ ] If graph library is not introduced yet, render timeline/table first. No fake graph.

### Phase 5 Gate

- [ ] `php artisan test --filter=TalosRun`
- [ ] `npm run build`
- [ ] `php kadmos test`
- [ ] `git diff --check`

---

## 8. Phase 6: Failure Recovery And Trace Replay

**Goal:** failure policy diventa operabile da HMI.

**Phase owner:** Agent C + Agent B + Agent A.

### Task 6.1: Core Recovery Contract

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent C

**Files:**

- [ ] `core/src/ASTOrchestrator.php`
- [ ] `core/tests/ASTOrchestratorTest.php`
- [ ] Additional recovery tests if needed.

**Test scenarios:**

- [ ] A -> B -> C, A fails, B/C blocked.
- [ ] A+B -> C, B fails, C blocked.
- [ ] A retry success, B/C become pending as eligible.
- [ ] Retry does not unblock child with another failed parent.

**Failsafe:**

- [ ] No automatic self-healing prune in MVP unless explicitly behind policy.

### Task 6.2: Recovery API

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent B

**Files:**

- [ ] Create `TalosRecoveryController.php`
- [ ] Add `POST /api/talos/runs/{run}/recover`

**Actions:**

- [ ] `retry_node`
- [ ] `retry_branch`
- [ ] `edit_payload_and_retry`
- [ ] `skip_node`
- [ ] `mark_resolved`

**Tests:**

- [ ] Unauthorized recovery rejected.
- [ ] Invalid action rejected 422.
- [ ] Recovery creates audit event.
- [ ] Recovery appends run event.

**Failsafe:**

- [ ] High-risk recovery requires capability.

### Task 6.3: Trace Replay UI And API Hardening

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent B + Agent A

**Files:**

- [ ] Harden `TraceReplayService.php`
- [ ] Create `TalosTraceReplay.vue`
- [ ] Create `TalosRecoveryPanel.vue`

**Tests:**

- [ ] Non-list `events` rejected with 422.
- [ ] Replay reconstructs statuses.
- [ ] UI build.

**Failsafe:**

- [ ] Replay must not mutate the actual run.

### Phase 6 Gate

- [ ] `php kadmos test`
- [ ] `php artisan test --filter=TraceReplay`
- [ ] `php artisan test --filter=Recovery`
- [ ] `npm run build`
- [ ] `git diff --check`

---

## 9. Phase 7: Benchmark Workbench

**Goal:** AVM ON/OFF diventa prova centrale e riproducibile.

**Phase owner:** Agent E + Agent A + Agent C.

### Task 7.1: Benchmark Persistence

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent E

**Files:**

- [ ] Migrations: `talos_benchmark_groups`, `talos_benchmark_results`
- [ ] Models.
- [ ] Extend `BenchmarkComparisonService.php`

**Tests:**

- [ ] Same prompt hash stored across lanes.
- [ ] Same context hash stored across lanes.
- [ ] Raw log path or inline raw log required.

**Failsafe:**

- [ ] Do not show third baseline lane unless real tool-agent baseline exists.

### Task 7.2: Benchmark Metrics Contract

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent E + Agent C

**Metrics checklist:**

- [ ] `task_completion`
- [ ] `schema_validity`
- [ ] `invalid_actions_proposed`
- [ ] `invalid_actions_executed`
- [ ] `policy_violations_blocked`
- [ ] `recoverable_faults`
- [ ] `source_coverage`
- [ ] `trace_replayability`
- [ ] `latency_ms`
- [ ] `token_estimate`
- [ ] `cost_estimate`

**Tests:**

- [ ] Threshold tests fail on invalid executed action.
- [ ] Trace replay required for AVM ON result.
- [ ] Missing evaluator version rejects result.

**Failsafe:**

- [ ] Never invent improvement metrics. Unknown cost/token must show `unknown`, not estimated as fact.

### Task 7.3: Benchmark Workbench UI

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent A

**Files:**

- [ ] Create `TalosBenchmarkWorkbench.vue`
- [ ] Create `TalosBenchmarkLane.vue`
- [ ] Create `TalosMetricCard.vue`
- [ ] Create `TalosDiffViewer.vue`

**Work checklist:**

- [ ] Run benchmark from dashboard.
- [ ] Run benchmark from chat message.
- [ ] Show fairness block: same prompt/model/context/evaluator.
- [ ] Show degraded/missing baseline state.
- [ ] Export report button only enabled when backend supports it.

**Tests:**

- [ ] `npm run build`

**Failsafe:**

- [ ] No hardcoded benchmark scores in production component.

### Phase 7 Gate

- [ ] `php artisan test --filter=Benchmark`
- [ ] `php kadmos test`
- [ ] `npm run build`
- [ ] `git diff --check`

---

## 10. Phase 8: Tool Registry, Connectors, Execution Policy

**Goal:** ampliare le capacita' senza perdere sicurezza.

**Phase owner:** Agent F + Agent C + Agent B + Agent A.

### Task 8.1: Tool And Connector Tables

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent B

**Files:**

- [ ] Migrations: `talos_connectors`, `talos_tools`
- [ ] Models.
- [ ] Controllers.

**Tests:**

- [ ] Duplicate tool name rejected.
- [ ] Disabled connector hides tools.
- [ ] Tool schema required.

**Failsafe:**

- [ ] Disabled tools must not appear in LLM planning context.

### Task 8.2: Core Worker Policy Expansion

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent C + Agent F

**Files:**

- [ ] `core/src/Security/ExecutionPolicy.php`
- [ ] `core/src/Workers/*`
- [ ] `core/tests/Security/*`

**Policy checklist:**

- [ ] Resolve hostnames before allowing HTTP requests.
- [ ] Block localhost, metadata IP, private networks by default.
- [ ] Cap timeouts.
- [ ] Audit decision.
- [ ] Fail closed on ambiguous host resolution.

**Tests:**

- [ ] DNS alias to private IP blocked.
- [ ] `localhost.` blocked.
- [ ] Metadata IP blocked.
- [ ] Allowed host works.

**Failsafe:**

- [ ] If DNS resolution fails, default deny unless explicitly configured otherwise.

### Task 8.3: Tool Registry UI

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent A

**Files:**

- [ ] Create `TalosToolRegistry.vue`
- [ ] Create `TalosConnectorHealth.vue`
- [ ] Create `TalosToolSchemaViewer.vue`

**Tests:**

- [ ] `npm run build`

**Failsafe:**

- [ ] Connector tiles must reflect backend health. No decorative "online" states.

### Phase 8 Gate

- [ ] `php artisan test --filter=Connector`
- [ ] `php artisan test --filter=Tool`
- [ ] `php tests/Security/ExecutionPolicyTest.php`
- [ ] `php kadmos test`
- [ ] `npm run build`
- [ ] `git diff --check`

---

## 11. Phase 9: Memory And Skills

**Goal:** memoria e skills ispezionabili, non prompt stuffing nascosto.

**Phase owner:** Agent B + Agent F + Agent A.

### Task 9.1: Memory Backend

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent B

**Files:**

- [ ] Migration `talos_memories`
- [ ] Model.
- [ ] Controller.
- [ ] Retrieval service.

**Tests:**

- [ ] Disabled memory not retrieved.
- [ ] Scope respected.
- [ ] Rejected/quarantined memory not used.

**Failsafe:**

- [ ] Memory content is always untrusted context.

### Task 9.2: Skill Registry Backend

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent B + Agent F

**Files:**

- [ ] Migration `talos_skills`
- [ ] Model.
- [ ] Controller.
- [ ] Skill evaluation hook.

**Tests:**

- [ ] Skill without allowed tools cannot invoke tools.
- [ ] Skill promotion requires eval pass.
- [ ] High-risk skill requires review status `approved`.

**Failsafe:**

- [ ] Imported skill cannot modify policy or capabilities.

### Task 9.3: Memory And Skill UI

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent A

**Files:**

- [ ] Create `TalosMemoryManager.vue`
- [ ] Create `TalosSkillRegistry.vue`
- [ ] Create `TalosSkillAudit.vue`

**Tests:**

- [ ] `npm run build`

**Failsafe:**

- [ ] Show "used memory" disclosure. Do not silently inject memory.

### Phase 9 Gate

- [ ] `php artisan test --filter=Memory`
- [ ] `php artisan test --filter=Skill`
- [ ] `npm run build`
- [ ] Security review: prompt injection from memory/skills.
- [ ] `git diff --check`

---

## 12. Phase 10: Deep Research And Documents

**Goal:** report con fonti, claim verificati e artifact.

**Phase owner:** Agent B + Agent A + Agent E.

### Task 10.1: Research Run Template

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent B + Agent C

**Pipeline checklist:**

- [ ] `plan_queries`
- [ ] `search_sources`
- [ ] `fetch_sources`
- [ ] `extract_claims`
- [ ] `deduplicate_claims`
- [ ] `verify_claims`
- [ ] `synthesize_report`
- [ ] `export_report`

**Tests:**

- [ ] Claim cannot be verified without source.
- [ ] Fetch failure blocks only dependent branch.
- [ ] Replay shows source sequence.

**Failsafe:**

- [ ] If web search/provider unavailable, research run is degraded, not fake.

### Task 10.2: Documents And Artifacts

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent B + Agent A

**Files:**

- [ ] Document/artifact tables if not covered by run artifacts.
- [ ] `TalosDocuments.vue`
- [ ] `TalosArtifactGallery.vue`
- [ ] `TalosArtifactPreview.vue`

**Tests:**

- [ ] Artifact links to run id.
- [ ] Export includes metadata.
- [ ] Unsupported preview falls back to download.

**Failsafe:**

- [ ] No artifact appears as trusted if missing run provenance.

### Phase 10 Gate

- [ ] `php artisan test --filter=Research`
- [ ] `php artisan test --filter=Document`
- [ ] `php artisan test --filter=Artifact`
- [ ] `npm run build`
- [ ] `git diff --check`

---

## 13. Phase 11: Productivity And Email

**Goal:** copertura workspace stile Odysseus, ma con policy enterprise.

**Phase owner:** Agent B + Agent F + Agent A.

### Task 11.1: Notes, Tasks, Calendar Drafts

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent B

**Backend checklist:**

- [ ] Notes table.
- [ ] Tasks table.
- [ ] Calendar draft table.
- [ ] Link each object to source run when generated by TALOS.

**Tests:**

- [ ] Task from run stores run id.
- [ ] Calendar write requires confirmation.
- [ ] Note used as context is untrusted.

**Failsafe:**

- [ ] Calendar actions are drafts until manually approved.

### Task 11.2: Email Read And Draft

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent B + Agent F

**Backend checklist:**

- [ ] Read-only connector.
- [ ] Email draft worker.
- [ ] Send worker disabled until HMI confirmation exists.
- [ ] Prompt injection tests for email body.

**Tests:**

- [ ] AI cannot send email without explicit action.
- [ ] Malicious email body cannot change policy.
- [ ] Connector failure is degraded state.

**Failsafe:**

- [ ] Never auto-send in MVP.

### Task 11.3: Productivity UI

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent A

**Files:**

- [ ] `TalosNotes.vue`
- [ ] `TalosTasks.vue`
- [ ] `TalosCalendar.vue`
- [ ] `TalosEmailTriage.vue`
- [ ] `TalosEmailDraftReview.vue`

**Tests:**

- [ ] `npm run build`

**Failsafe:**

- [ ] Send/write buttons disabled unless backend says capability exists.

### Phase 11 Gate

- [ ] `php artisan test --filter=Task`
- [ ] `php artisan test --filter=Calendar`
- [ ] `php artisan test --filter=Email`
- [ ] `npm run build`
- [ ] `git diff --check`

---

## 14. Phase 12: Admin, Doctor, Audit, Backup

**Goal:** TALOS credibile per enterprise/pilot.

**Phase owner:** Agent F + Agent B + Agent A.

### Task 12.1: Capability And Token Model

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent F + Agent B

**Checklist:**

- [ ] Define capabilities.
- [ ] Scoped tokens.
- [ ] Role assignment.
- [ ] Middleware/Policy checks.

**Tests:**

- [ ] Non-admin cannot access admin endpoints.
- [ ] Token without scope cannot run worker.
- [ ] Expired token rejected.

**Failsafe:**

- [ ] Default deny for missing capability.

### Task 12.2: Audit Events

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent F + Agent B

**Events required:**

- [ ] Provider profile created/updated.
- [ ] File uploaded/quarantined.
- [ ] Tool policy denial.
- [ ] HMI recovery.
- [ ] Email/calendar send confirmation.
- [ ] Benchmark export.

**Tests:**

- [ ] Each critical action creates audit row.
- [ ] Audit API filters by event type.

**Failsafe:**

- [ ] Audit payload must redact secrets.

### Task 12.3: Doctor And Backup UI/API

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent B + Agent A

**Doctor checks:**

- [ ] PHP/core health.
- [ ] Validator health.
- [ ] Laravel queue.
- [ ] Database.
- [ ] Storage writable.
- [ ] Provider profiles.
- [ ] Model probes.
- [ ] File ingestion.
- [ ] Benchmark thresholds.
- [ ] SSL verification.
- [ ] Execution policy.

**Tests:**

- [ ] Validator down -> degraded doctor.
- [ ] Backup manifest includes required domains.
- [ ] Restore rejects incompatible schema.

**Failsafe:**

- [ ] Backup restore dry-run first; no destructive restore without explicit approval.

### Phase 12 Gate

- [ ] `php artisan test --filter=Admin`
- [ ] `php artisan test --filter=Audit`
- [ ] `php artisan test --filter=Doctor`
- [ ] `php artisan test --filter=Backup`
- [ ] `npm run build`
- [ ] `git diff --check`

---

## 15. Phase 13: KADMOS CLI Alignment

**Goal:** terminale usabile da principianti ma potente per esperti.

**Phase owner:** Agent G + Agent C.

### Task 13.1: CLI Command Registry And JSON Output

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent G

**Files:**

- [ ] `core/src/Cli/Console.php`
- [ ] `core/kadmos`
- [ ] `core/tests/CliConsoleTest.php`

**Commands:**

- [ ] `doctor`
- [ ] `validate`
- [ ] `run`
- [ ] `compare`
- [ ] `trace replay`
- [ ] `fault explain`
- [ ] `recover`
- [ ] `files ingest`

**Tests:**

- [ ] JSON output valid.
- [ ] Exit codes stable.
- [ ] Missing validator fails closed.

**Failsafe:**

- [ ] Live commands never silently use mock validator.

### Task 13.2: Guided Shell Tutorial

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent G

**Files:**

- [ ] `core/src/Cli/GuidedShell.php`
- [ ] `core/tests/CliGuidedShellTest.php`

**Checklist:**

- [ ] Boot animation first command then shell remains.
- [ ] Beginner commands explained.
- [ ] Expert slash commands available.
- [ ] Modes: `ask`, `semi`, `auto`, `lab`, `enterprise`.

**Tests:**

- [ ] Boot animation contract.
- [ ] Slash command parsing.
- [ ] Mode switch.

**Failsafe:**

- [ ] `auto` mode still obeys execution policy.

### Phase 13 Gate

- [ ] `cd core && php kadmos test`
- [ ] `php kadmos doctor --json`
- [ ] `git diff --check`

---

## 16. Phase 14: Browser E2E, Accessibility, Performance

**Goal:** prove whole product, not isolated components.

**Phase owner:** Agent H + Agent A + Captain.

### Task 14.1: Introduce UI Test Harness

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent H

**Files:**

- [ ] `control-plane/playwright.config.ts`
- [ ] `control-plane/tests/e2e/*.spec.ts`
- [ ] Optional Vitest config for composables.

**Tests:**

- [ ] App loads `/chat`.
- [ ] App loads `/dashboard`.
- [ ] Command palette opens.
- [ ] Composer sends fake-backed message in test env.

**Failsafe:**

- [ ] Do not require live external provider in E2E.

### Task 14.2: End-To-End Flows

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Flows:**

- [ ] First run: provider/profile -> chat -> run -> evidence chip.
- [ ] File run: upload -> context set -> chat -> source provenance.
- [ ] Replay: open run -> replay -> filter faults.
- [ ] Benchmark: run compare -> inspect lanes -> export report.
- [ ] Admin: doctor degraded validator state.

**Failsafe:**

- [ ] If E2E environment cannot run provider/model, use deterministic fake service marked test-only.

### Task 14.3: Accessibility And Responsive Checks

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Checklist:**

- [ ] Keyboard can reach chat, composer, rail, inspector.
- [ ] Focus trap works in dialogs/sheets.
- [ ] Icon-only buttons have labels/tooltips.
- [ ] Reduced motion disables nonessential animation.
- [ ] Mobile widths do not overlap text.
- [ ] Semantic states have text, not color-only.

**Failsafe:**

- [ ] If a dense dashboard panel breaks mobile, use drawer/sheet instead of shrinking into overlap.

### Phase 14 Gate

- [ ] `php artisan test`
- [ ] `npm run build`
- [ ] E2E command once defined.
- [ ] Manual desktop screenshot.
- [ ] Manual mobile screenshot.
- [ ] `git diff --check`

---

## 17. Captain Review Protocol

Use this after each agent reports completion.

### Review Checklist

- [ ] Task status updated in this checklist.
- [ ] Changed files match assigned boundary.
- [ ] No commits made.
- [ ] No unrelated revert.
- [ ] Tests listed and plausible.
- [ ] Failsafe section addressed.
- [ ] No new fake UI.
- [ ] No provider secret exposure.
- [ ] No core/Laravel/validator boundary violation.
- [ ] If UI changed, `/chat` vs `/dashboard` separation preserved.
- [ ] If benchmark changed, fairness contract preserved.
- [ ] If security/tool changed, default-deny policy preserved.

### Agent Report Template

Each agent must report in this format:

```text
Agent:
Phase / Task:
Status:
Changed files:
Summary:
Tests run:
Test output summary:
Failsafe checks:
Known issues:
Needs captain decision:
```

### Captain Integration Commands

Run these after a phase or cross-cutting integration:

```powershell
git status --short

cd core
php kadmos test

cd ..\validator
npm test
npm run build

cd ..\control-plane
php artisan test
npm run build

cd ..
git diff --check
```

If the full suite is too slow during a small task, run focused tests first, but full suite is mandatory at phase gates.

---

## 18. Failsafe Decision Tree

### If UI Needs Backend That Does Not Exist

- [ ] Do not create fake live UI.
- [ ] Add disabled state with exact missing backend dependency.
- [ ] Create backend task.
- [ ] Mark UI task `Blocked` or `Ready for review` only if disabled state is intentional.

### If Backend Needs Core Feature That Does Not Exist

- [ ] Do not reimplement core logic in Laravel.
- [ ] Create core task for Agent C.
- [ ] Use adapter/interface in Laravel.
- [ ] Mark task blocked until core contract exists.

### If Core Needs Validator Schema

- [ ] Do not validate via regex in PHP.
- [ ] Create validator schema task for Agent D.
- [ ] Add contract test.

### If Security Risk Appears

- [ ] Default deny.
- [ ] Add explicit capability.
- [ ] Add audit event.
- [ ] Add test proving denial.
- [ ] Only then add allow path.

### If Tests Fail

- [ ] Capture failing command.
- [ ] Capture first meaningful error.
- [ ] Determine if failure is related to current task.
- [ ] If related, fix before review.
- [ ] If unrelated but blocks verification, report as blocker.
- [ ] Do not mark verified.

---

## 19. Global Progress Board

Update this board only at phase gates.

| Phase | Name | Owner | Status | Gate tests | Notes |
|---|---|---|---|---|---|
| 0 | Preflight and file ownership | Captain | [ ] Not started [ ] In progress [ ] Verified [ ] Blocked | baseline suites | |
| 1 | Contracts and UI foundation | A + B | [ ] Not started [ ] In progress [ ] Verified [ ] Blocked | Talos tests, build | |
| 2 | Persistent chat sessions | A + B | [ ] Not started [ ] In progress [ ] Verified [ ] Blocked | Session/Message tests | |
| 3 | Provider profiles | B + F + A | [ ] Not started [ ] In progress [ ] Verified [ ] Blocked | ModelProfile tests | |
| 4 | Context Vault | B + A + F | [ ] Not started [ ] In progress [ ] Verified [ ] Blocked | File/Context tests | |
| 5 | AVM run bridge | B + C + A | [ ] Not started [ ] In progress [ ] Verified [ ] Blocked | Run tests, core tests | |
| 6 | Recovery and replay | C + B + A | [ ] Not started [ ] In progress [ ] Verified [ ] Blocked | Recovery/Replay tests | |
| 7 | Benchmark workbench | E + A + C | [ ] Not started [ ] In progress [ ] Verified [ ] Blocked | Benchmark tests | |
| 8 | Tools and connectors | F + C + B + A | [ ] Not started [ ] In progress [ ] Verified [ ] Blocked | Policy/Connector tests | |
| 9 | Memory and skills | B + F + A | [ ] Not started [ ] In progress [ ] Verified [ ] Blocked | Memory/Skill tests | |
| 10 | Research and documents | B + A + E | [ ] Not started [ ] In progress [ ] Verified [ ] Blocked | Research/Artifact tests | |
| 11 | Productivity and email | B + F + A | [ ] Not started [ ] In progress [ ] Verified [ ] Blocked | Email/Calendar tests | |
| 12 | Admin, doctor, backup | F + B + A | [ ] Not started [ ] In progress [ ] Verified [ ] Blocked | Admin/Audit tests | |
| 13 | KADMOS CLI alignment | G + C | [ ] Not started [ ] In progress [ ] Verified [ ] Blocked | `php kadmos test` | |
| 14 | E2E and hardening | H + A | [ ] Not started [ ] In progress [ ] Verified [ ] Blocked | E2E, full suites | |

---

## 20. Final Launch Gate

TALOS can be called product-ready for an internal pilot only when:

- [ ] All phase gates are verified.
- [ ] Full core suite passes.
- [ ] Full validator suite passes.
- [ ] Full Laravel suite passes.
- [ ] Frontend build passes.
- [ ] Browser E2E passes.
- [ ] `/chat` is persistent and clean.
- [ ] `/dashboard` is real cockpit and not fixture-driven.
- [ ] File ingestion works on user-provided files.
- [ ] Trace replay works on persisted runs.
- [ ] Recovery flow works on failed DAG branches.
- [ ] Benchmark workbench proves AVM ON/OFF on same inputs.
- [ ] Provider secrets are not exposed to browser production flow.
- [ ] Tools are policy-checked and audited.
- [ ] Doctor shows real readiness.
- [ ] Backup manifest can be generated and validated.
- [ ] KADMOS CLI can validate, run, compare, replay, recover, export.
- [ ] No known fake production UI remains.
- [ ] `git diff --check` passes.

