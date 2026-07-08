# TALOS AVM Agent Roadmap Checklist

> Control board operativo per orchestrare il lavoro dei sub-agent su TALOS, KADMOS, AVM core, validator, benchmark, sicurezza e UI.

**Master plan di riferimento:** `docs/architecture/talos-avm-feature-gap-full-implementation-plan.md`

**Regola bloccante:** nessun agente deve fare commit. Il commit lo fa solo l'utente.

**Obiettivo:** trasformare il master plan in una tabella di marcia eseguibile, con fasi, task assegnabili, check da barrare, test obbligatori, failsafe e gate di revisione.

---

## 0. Come Usare Questa Checklist

Ogni task ha campi da aggiornare dopo ogni modifica:

```text
Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [x] Verified  [ ] Blocked
Owner agent:
Started:
Last update:
Changed files:
Tests run:
Failsafe triggered:
Reviewer notes:
```

## Stato Corrente Di Esecuzione

- [x] Phase 0 baseline verificata il 2026-07-07.
- [x] Worktree verificato come pulito prima dell'avvio della pipeline.
- [x] Failsafe PHP attivo: ogni comando PHP deve caricare `.tools\env.ps1`.
- [x] Phase 1 verificata: API client, shared types, status mapping, command registry, route contract tests.
- [x] Dashboard cleanup iniziale verificata: rimossi claim e controlli fake da `TalosShell.vue`.
- [x] Phase 2 verificata: persistent chat sessions/messages backend e `/chat` persistente.
- [x] Phase 3 verificata: provider profiles server-side, Model Center reale e `/chat` con `model_profile_id`.
- [x] Phase 4 verificata: Context Vault persistente, upload reale, context set e grounding in `/chat`.
- [x] Phase 5 verificata: run/event/artifact persistence, chat run bridge e timeline reale in dashboard.
- [x] Phase 6 verificata: core recovery contract, HMI recovery API e trace replay UI/API.
- [x] Phase 7 verificata: benchmark persistence, fairness contract, workbench reale e benchmark da chat/run persistito.
- [x] Phase 8 verificata: Tool Registry, connector planning context, execution policy e DNS pinning.
- [x] Phase 9 verificata: Memory retrieval, Skill Registry, chat disclosure e dashboard panels.
- [x] Phase 10 verificata: Deep Research, Documents, Artifacts e provenance.
- [x] Phase 11 verificata: Notes, Tasks, Calendar Drafts, Email read/draft e send-denial policy.
- [x] Phase 12 verificata: admin scoped tokens, role assignment, audit events, Doctor, policy panel e backup dry-run validation.
- [x] Nessun sub-agent ha autorizzazione a fare commit.

Ledger progressivo:

```text
docs/architecture/progress/2026-07-07-talos-avm-implementation-ledger.md
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

- [x] AVM ON/OFF fairness.
- [x] benchmark persistence.
- [x] report export.
- [x] metrics.
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

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [x] Verified  [ ] Blocked

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

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [x] Verified  [ ] Blocked

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

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [x] Verified  [ ] Blocked

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

Status: [x] Verified

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

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [x] Verified  [ ] Blocked

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

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [x] Verified  [ ] Blocked

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
- [x] `git diff --check`
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
- [x] `git diff --check`

---

## 5. Phase 3: Provider Profiles And Secret Safety

**Goal:** togliere API key raw dal browser in modalita' production.

**Phase owner:** Agent B + Agent F + Agent A.

### Task 3.1: Model Profile Persistence

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [x] Verified  [ ] Blocked

**Owner agent:** Agent B

**Files:**

- [x] Create migration `create_talos_model_profiles_table`
- [x] Create `TalosModelProfile.php`
- [x] Create `TalosModelProfileController.php`

**Work checklist:**

- [x] Store provider, model, display name.
- [x] Store secret encrypted or `secret_ref`.
- [x] Store base URL.
- [x] Store capabilities JSON.
- [x] Store probe status/result.

**Tests:**

- [x] Profile create/update/list.
- [x] Secret not returned by API.
- [x] Invalid provider rejected.

**Failsafe:**

- [x] Secrets are encrypted with Laravel `Crypt`; APIs expose `has_secret`, never `secret` or `encrypted_secret`.

### Task 3.2: Provider Probe Service

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [x] Verified  [ ] Blocked

**Owner agent:** Agent B

**Files:**

- [x] Create `TalosModelProbeService.php`
- [x] Add `POST /api/talos/model-profiles/{profile}/probe`

**Probe checklist:**

- [x] Connectivity.
- [x] Simple completion.
- [ ] Structured JSON.
- [ ] JMP-generation sample.
- [x] Timeout handling.
- [ ] Capability classification.

**Tests:**

- [x] Timeout/connection failure -> failed with actionable message.
- [x] Bad endpoint/non-success response -> degraded.
- [ ] Missing structured output -> unsupported for AVM planning.

**Failsafe:**

- [x] Never call external provider in tests without fake HTTP.

### Task 3.3: UI Model Center

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [x] Verified  [ ] Blocked

**Owner agent:** Agent A

**Files:**

- [x] Create `components/talos/models/TalosModelCenter.vue`
- [ ] Create `components/talos/models/TalosModelProbeLog.vue`
- [x] Wire dashboard nav.

**Work checklist:**

- [x] List profiles.
- [x] Add profile form.
- [x] Probe button.
- [x] Show healthy/degraded/failed.
- [x] Chat can select profile.
- [x] Dev API-key fallback clearly marked dev-only if still present.

**Tests:**

- [x] `npm run build`

**Failsafe:**

- [x] Do not expose secret value back into inputs after save.

### Phase 3 Gate

- [x] `php artisan test --filter=TalosModelProfileApiTest`
- [x] `php artisan test --filter=TalosModelCenterTest`
- [x] `php artisan test --filter=TalosChatApiTest`
- [x] `php artisan test --filter=TalosChatPageTest`
- [x] `php artisan test --filter=TalosRouteContractTest`
- [x] `npm run build`
- [x] Security review: browser payloads contain profile id, not raw secret, for production paths.
- [x] `git diff --check`

---

## 6. Phase 4: Context Vault And File Ingestion

**Goal:** utenti caricano file reali e li usano nei run.

**Phase owner:** Agent B + Agent A + Agent F.

### Task 4.1: File And Context Tables

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent B

**Files:**

- [x] Migrations: `talos_files`, `talos_file_chunks`, `talos_context_sets`, `talos_context_sources`
- [x] Models for each table.

**Tests:**

- [x] File metadata persists.
- [x] Context set can attach file/chunk.
- [x] JSON metadata casts.

**Failsafe:**

- [x] Store file metadata even when parsing fails, with status `failed`.

### Task 4.2: Staged Ingestion Service

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [x] Verified  [ ] Blocked

**Owner agent:** Agent B

**Files:**

- [x] Modify `FileIngestionService.php`
- [x] Modify `FileBenchmarkScenarioFactory.php`
- [x] Create parser classes if needed.

**Pipeline checklist:**

- [x] `uploaded`
- [ ] `scanned`
- [ ] `parsed`
- [x] `chunked`
- [x] `embedded` or `available` if embeddings deferred.
- [ ] `quarantined`
- [x] `failed`

**Tests:**

- [x] Unsupported MIME returns 422.
- [x] Oversize returns 422.
- [x] Malformed/post-storage ingestion failure returns `failed` state.
- [x] Prompt-injection string remains data and is injected into chat as untrusted grounding.

**Failsafe:**

- [x] Do not execute file contents.
- [x] Do not send file content to tools without context-set selection.

### Task 4.3: Context Vault UI

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [x] Verified  [ ] Blocked

**Owner agent:** Agent A

**Files:**

- [x] Create `TalosContextVault.vue`
- [x] Create `TalosFileDropzone.vue`
- [x] Create `TalosFileStatusList.vue`
- [x] Create `TalosSourceDrawer.vue`
- [x] Add composer file/context chips through `/chat` context-set selector.

**Tests:**

- [x] `npm run build`

**Failsafe:**

- [x] If upload endpoint fails, show failed state; do not pretend file is indexed.

### Phase 4 Gate

- [x] `php artisan test --filter=FileIngestionTest`
- [x] `php artisan test --filter=TalosContextSetApiTest`
- [x] `php artisan test --filter=TalosContextVaultTest`
- [x] `php artisan test --filter=TalosChatApiTest`
- [x] `php artisan test --filter=TalosChatPageTest`
- [x] `npm run build`
- [x] Security review for file upload limits.
- [x] `git diff --check`

---

## 7. Phase 5: AVM Run Bridge And Event Timeline

**Goal:** ogni run produce eventi visibili.

**Phase owner:** Agent B + Agent C + Agent A.

### Task 5.1: Run/Event/Artifact Persistence

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent B

**Files:**

- [x] Migrations: `talos_runs`, `talos_run_events`, `talos_run_artifacts`
- [x] Models.
- [x] `TalosRunController.php`

**Tests:**

- [x] Create run.
- [x] Append ordered events.
- [x] Fetch events by run.
- [x] Store artifact metadata.

**Failsafe:**

- [x] Reject non-list events before replay.
- [x] Enforce sequence ordering.

### Task 5.2: Run Event Normalizer

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [x] Verified  [ ] Blocked

**Owner agent:** Agent B + Agent C handoff

**Files:**

- [x] Create `RunEventNormalizer.php`
- [x] Extend core benchmark/run output only through explicit contract.

**Work checklist:**

- [x] Normalize validation events.
- [x] Normalize node status changes.
- [x] Normalize worker output.
- [x] Normalize policy decisions.
- [x] Normalize artifacts.

**Tests:**

- [x] Unknown event type becomes generic event.
- [x] Missing node id allowed only where event type permits it.
- [x] Event payload stays JSON serializable.

**Failsafe:**

- [x] Do not parse core output by brittle string position if structured data is available.

### Task 5.3: Timeline And Node Inspector UI

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [x] Verified  [ ] Blocked

**Owner agent:** Agent A

**Files:**

- [x] Create `TalosRunTimeline.vue`
- [x] Create `TalosNodeGraph.vue`
- [x] Create `TalosNodeInspector.vue`

**Work checklist:**

- [x] Poll or load events.
- [x] Render timeline.
- [x] Select event/node.
- [x] Show payload, status, dependency, policy, output.
- [x] Show empty/degraded states.

**Tests:**

- [x] `npm run build`

**Failsafe:**

- [x] If graph library is not introduced yet, render timeline/table first. No fake graph.

### Phase 5 Gate

- [x] `php artisan test --filter=TalosRunApiTest`
- [x] `php artisan test --filter=TalosChatRunBridgeTest`
- [x] `php artisan test --filter=TalosRunTimelineTest`
- [x] `npm run build`
- [x] `php kadmos test`
- [x] `git diff --check`

---

## 8. Phase 6: Failure Recovery And Trace Replay

**Goal:** failure policy diventa operabile da HMI.

**Phase owner:** Agent C + Agent B + Agent A.

### Task 6.1: Core Recovery Contract

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [x] Verified  [ ] Blocked

**Owner agent:** Agent C

**Files:**

- [x] `core/src/ASTOrchestrator.php`
- [x] `core/tests/ASTOrchestratorTest.php`
- [x] Additional recovery tests if needed.

**Test scenarios:**

- [x] A -> B -> C, A fails, B/C blocked.
- [x] A+B -> C, B fails, C blocked.
- [x] A retry success, B/C become pending as eligible.
- [x] Retry does not unblock child with another failed parent.

**Failsafe:**

- [x] No automatic self-healing prune in MVP unless explicitly behind policy.

### Task 6.2: Recovery API

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [x] Verified  [ ] Blocked

**Owner agent:** Agent B

**Files:**

- [x] Create `TalosRecoveryController.php`
- [x] Add `POST /api/talos/runs/{run}/recover`

**Actions:**

- [x] `retry_node`
- [x] `retry_branch`
- [x] `edit_payload_and_retry`
- [x] `skip_node`
- [x] `mark_resolved`

**Tests:**

- [x] Invalid action rejected 422.
- [x] Recovery creates audit event.
- [x] Recovery appends run event.
- [x] High-risk recovery rejected without capability.

**Failsafe:**

- [x] High-risk recovery requires capability.

### Task 6.3: Trace Replay UI And API Hardening

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [x] Verified  [ ] Blocked

**Owner agent:** Agent B + Agent A

**Files:**

- [x] Harden `TraceReplayService.php`
- [x] Create `TalosTraceReplay.vue`
- [x] Create `TalosRecoveryPanel.vue`

**Tests:**

- [x] Non-list `events` rejected with 422.
- [x] Replay reconstructs statuses.
- [x] UI build.

**Failsafe:**

- [x] Replay must not mutate the actual run.

### Phase 6 Gate

- [x] `php kadmos test`
- [x] `php artisan test --filter=TraceReplay`
- [x] `php artisan test --filter=Recovery`
- [x] `npm run build`
- [x] `git diff --check`

---

## 9. Phase 7: Benchmark Workbench

**Goal:** AVM ON/OFF diventa prova centrale e riproducibile.

**Phase owner:** Agent E + Agent A + Agent C.

### Task 7.1: Benchmark Persistence

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [x] Verified  [ ] Blocked

**Owner agent:** Agent E

**Files:**

- [x] Migrations: `talos_benchmark_groups`, `talos_benchmark_results`
- [x] Models.
- [x] Extend `BenchmarkComparisonService.php`

**Tests:**

- [x] Same prompt hash stored across lanes when a real task exists.
- [x] Same context hash stored across lanes when real context material exists.
- [x] Raw log path or inline raw log required.
- [x] Missing prompt/context are stored as `null`, not invented from scenario title or description.

**Failsafe:**

- [x] Do not show third baseline lane unless real tool-agent baseline exists.

### Task 7.2: Benchmark Metrics Contract

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [x] Verified  [ ] Blocked

**Owner agent:** Agent E + Agent C

**Metrics checklist:**

- [x] `task_completion`
- [x] `schema_validity`
- [x] `invalid_actions_proposed`
- [x] `invalid_actions_executed`
- [x] `policy_violations_blocked`
- [x] `recoverable_faults`
- [x] `source_coverage`
- [x] `trace_replayability`
- [x] `latency_ms`
- [x] `token_estimate`
- [x] `cost_estimate`

**Tests:**

- [x] Existing core threshold tests fail on invalid executed action.
- [x] Trace replayability is false unless a replay event stream exists.
- [x] Evaluator version is stored on every group and result.

**Failsafe:**

- [x] Never invent improvement metrics. Unknown cost/source coverage must show `unknown`, not estimated as fact.

### Task 7.3: Benchmark Workbench UI

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [x] Verified  [ ] Blocked

**Owner agent:** Agent A

**Files:**

- [x] Create `TalosBenchmarkWorkbench.vue`
- [x] Create `TalosBenchmarkLane.vue`
- [x] Create `TalosMetricCard.vue`
- [x] Create `TalosDiffViewer.vue`

**Work checklist:**

- [x] Run benchmark from dashboard.
- [x] Run benchmark from chat message.
- [x] Show fairness block: same prompt/model/context/evaluator.
- [x] Show degraded/missing baseline state.
- [x] Export report button only enabled when backend supports it.

**Tests:**

- [x] `npm run build`

**Failsafe:**

- [x] No hardcoded benchmark scores in production component.

### Phase 7 Gate

- [x] `php artisan test --filter=Benchmark`
- [x] `php kadmos test`
- [x] `npm run build`
- [x] `git diff --check`

**Residual Phase 7 item:** packaged report artifacts remain future work; the audited JSON export endpoint is implemented for complete persisted benchmark groups.

---

## 10. Phase 8: Tool Registry, Connectors, Execution Policy

**Goal:** ampliare le capacita' senza perdere sicurezza.

**Phase owner:** Agent F + Agent C + Agent B + Agent A.

### Task 8.1: Tool And Connector Tables

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent B

**Files:**

- [x] Migrations: `talos_connectors`, `talos_tools`
- [x] Models.
- [x] Controllers.

**Tests:**

- [x] Duplicate tool name rejected.
- [x] Disabled connector hides tools.
- [x] Tool schema required.

**Failsafe:**

- [x] Disabled tools must not appear in LLM planning context.
- [x] Registry write routes require `TALOS_REGISTRY_WRITE_TOKEN`.
- [x] Validator/core reject `SPAWN_NODE` types outside the active allowlist.

### Task 8.2: Core Worker Policy Expansion

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [x] Verified  [ ] Blocked

**Owner agent:** Agent C + Agent F

**Files:**

- [x] `core/src/Security/ExecutionPolicy.php`
- [x] `core/src/Workers/*`
- [x] `core/tests/Security/*`

**Policy checklist:**

- [x] Resolve hostnames before allowing HTTP requests.
- [x] Block localhost, metadata IP, private networks by default.
- [x] Cap timeouts.
- [x] Audit decision.
- [x] Fail closed on ambiguous host resolution.
- [x] Pin vetted DNS result during HTTP worker execution.
- [x] Reject provider model base URLs targeting private/local hosts.

**Tests:**

- [x] DNS alias to private IP blocked.
- [x] `localhost.` blocked.
- [x] Metadata IP blocked.
- [x] Allowed host works.
- [x] DNS rebinding primary IP mismatch blocked.
- [x] Private provider base URL rejected.

**Failsafe:**

- [x] If DNS resolution fails, default deny unless explicitly configured otherwise.

### Task 8.3: Tool Registry UI

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [x] Verified  [ ] Blocked

**Owner agent:** Agent A

**Files:**

- [x] Create `TalosToolRegistry.vue`
- [x] Create `TalosConnectorHealth.vue`
- [x] Create `TalosToolSchemaViewer.vue`

**Tests:**

- [x] `npm run build`

**Failsafe:**

- [x] Connector tiles must reflect backend health. No decorative "online" states.

### Phase 8 Gate

- [x] `php artisan test --filter=Connector`
- [x] `php artisan test --filter=Tool`
- [x] `php tests/Security/ExecutionPolicyTest.php`
- [x] `php kadmos test`
- [x] `npm run build`
- [x] `git diff --check`

---

## 11. Phase 9: Memory And Skills

**Goal:** memoria e skills ispezionabili, non prompt stuffing nascosto.

**Phase owner:** Agent B + Agent F + Agent A.

### Task 9.1: Memory Backend

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent B

**Files:**

- [x] Migration `talos_memories`
- [x] Model.
- [x] Controller.
- [x] Retrieval service.

**Tests:**

- [x] Disabled memory not retrieved.
- [x] Scope respected.
- [x] Rejected/quarantined memory not used.

**Failsafe:**

- [x] Memory content is always untrusted context.
- [x] Chat does not inject memory unless request explicitly provides memory scope.
- [x] Chat returns `used_memories` disclosure when memory is used.

### Task 9.2: Skill Registry Backend

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [x] Verified  [ ] Blocked

**Owner agent:** Agent B + Agent F

**Files:**

- [x] Migration `talos_skills`
- [x] Model.
- [x] Controller.
- [x] Skill evaluation hook.

**Tests:**

- [x] Skill without allowed tools cannot invoke tools.
- [x] Skill promotion requires eval pass.
- [x] High-risk skill requires review status `approved`.

**Failsafe:**

- [x] Imported skill cannot modify policy or capabilities.
- [x] Skill write/evaluation routes require `TALOS_REGISTRY_WRITE_TOKEN`.

### Task 9.3: Memory And Skill UI

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [x] Verified  [ ] Blocked

**Owner agent:** Agent A

**Files:**

- [x] Create `TalosMemoryManager.vue`
- [x] Create `TalosSkillRegistry.vue`
- [x] Create `TalosSkillAudit.vue`

**Tests:**

- [x] `npm run build`

**Failsafe:**

- [x] Show "used memory" disclosure. Do not silently inject memory.

### Phase 9 Gate

- [x] `php artisan test --filter=Memory` - 13 passed, 69 assertions.
- [x] `php artisan test --filter=Skill` - 14 passed, 63 assertions.
- [x] `php artisan test` - 145 passed, 783 assertions.
- [x] `npm run build`
- [x] Security review: prompt injection from memory/skills.
- [x] `git diff --check`

---

## 12. Phase 10: Deep Research And Documents

**Goal:** report con fonti, claim verificati e artifact.

**Phase owner:** Agent B + Agent A + Agent E.

### Task 10.1: Research Run Template

Status: [x] Verified

**Owner agent:** Agent B + Agent C

**Pipeline checklist:**

- [x] `plan_queries`
- [x] `search_sources`
- [x] `fetch_sources`
- [x] `extract_claims`
- [x] `deduplicate_claims`
- [x] `verify_claims`
- [x] `synthesize_report`
- [x] `export_report`

**Tests:**

- [x] Claim cannot be verified without source.
- [x] Fetch failure blocks only dependent branch.
- [x] Replay shows source sequence.

**Failsafe:**

- [x] If web search/provider unavailable, research run is degraded, not fake.

### Task 10.2: Documents And Artifacts

Status: [x] Verified

**Owner agent:** Agent B + Agent A

**Files:**

- [x] Document/artifact tables if not covered by run artifacts.
- [x] `TalosDocuments.vue`
- [x] `TalosArtifactGallery.vue`
- [x] `TalosArtifactPreview.vue`

**Tests:**

- [x] Artifact links to run id.
- [x] Export includes metadata.
- [x] Unsupported preview falls back to download.

**Failsafe:**

- [x] No artifact appears as trusted if missing run provenance.

### Phase 10 Gate

- [x] `php artisan test --filter=Research` - 9 passed, 64 assertions.
- [x] `php artisan test --filter=Document` - 8 passed, 64 assertions.
- [x] `php artisan test --filter=Artifact` - 11 passed, 83 assertions.
- [x] `php artisan test` - 165 passed, 913 assertions.
- [x] `npm run build`
- [x] `git diff --check`

---

## 13. Phase 11: Productivity And Email

**Goal:** copertura workspace stile Odysseus, ma con policy enterprise.

**Phase owner:** Agent B + Agent F + Agent A.

### Task 11.1: Notes, Tasks, Calendar Drafts

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [ ] Verified  [ ] Blocked

**Owner agent:** Agent B

**Backend checklist:**

- [x] Notes table.
- [x] Tasks table.
- [x] Calendar draft table.
- [x] Link each object to source run when generated by TALOS.

**Tests:**

- [x] Task from run stores run id.
- [x] Calendar write requires confirmation.
- [x] Note used as context is untrusted.

**Failsafe:**

- [x] Calendar actions are drafts until manually approved.

### Task 11.2: Email Read And Draft

Status: [x] Verified

**Owner agent:** Agent B + Agent F

**Backend checklist:**

- [x] Read-only connector.
- [x] Email draft worker.
- [x] Send worker disabled until HMI confirmation exists.
- [x] Prompt injection tests for email body.

**Tests:**

- [x] AI cannot send email without explicit action.
- [x] Malicious email body cannot change policy.
- [x] Connector failure is degraded state.

**Failsafe:**

- [x] Never auto-send in MVP.

### Task 11.3: Productivity UI

Status: [x] Verified

**Owner agent:** Agent A

**Files:**

- [x] `TalosNotes.vue`
- [x] `TalosTasks.vue`
- [x] `TalosCalendar.vue`
- [x] `TalosEmailTriage.vue`
- [x] `TalosEmailDraftReview.vue`

**Tests:**

- [x] `npm run build`

**Failsafe:**

- [x] Send/write buttons disabled unless backend says capability exists.

### Phase 11 Gate

- [x] `php artisan test --filter=Task` - 3 passed, 9 assertions.
- [x] `php artisan test --filter=Calendar` - 4 passed, 13 assertions.
- [x] `php artisan test --filter=Email` - 11 passed, 79 assertions.
- [x] `php artisan test` - 188 passed, 1028 assertions.
- [x] `npm run build`
- [x] `git diff --check`

---

## 14. Phase 12: Admin, Doctor, Audit, Backup

**Goal:** TALOS credibile per enterprise/pilot.

**Phase owner:** Agent F + Agent B + Agent A.

### Task 12.1: Capability And Token Model

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [x] Verified  [ ] Blocked

**Owner agent:** Agent F + Agent B

**Checklist:**

- [x] Define capabilities.
- [x] Scoped tokens.
- [x] Role assignment.
- [x] Middleware/Policy checks through `TalosAdminGate`.

**Tests:**

- [x] Non-admin cannot access admin endpoints.
- [x] Token without scope cannot access scoped admin endpoints.
- [x] Expired token rejected.
- [x] Policy endpoint exposes token role assignment.

**Failsafe:**

- [x] Default deny for missing capability.

### Task 12.2: Audit Events

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [x] Verified  [ ] Blocked

**Owner agent:** Agent F + Agent B

**Events required:**

- [x] Provider profile created/updated.
- [x] File uploaded.
- [x] Registry/tool write policy denial.
- [x] HMI recovery.
- [x] Email send denial and calendar confirmation.
- [x] Benchmark export audit via `benchmark_report.exported`.

**Tests:**

- [x] Each implemented critical action creates audit row.
- [x] Audit API filters by event type.

**Failsafe:**

- [x] Audit payload must redact secrets.

### Task 12.3: Doctor And Backup UI/API

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [x] Verified  [ ] Blocked

**Owner agent:** Agent B + Agent A

**Doctor checks:**

- [x] PHP/core health.
- [x] Validator health.
- [x] Laravel queue.
- [x] Database.
- [x] Storage writable.
- [x] Provider profiles.
- [x] Model probes.
- [x] File ingestion.
- [x] Benchmark thresholds.
- [x] SSL verification.
- [x] Execution policy.

**Tests:**

- [x] Validator down -> degraded doctor.
- [x] Backup manifest includes required domains.
- [x] Restore rejects incompatible schema.
- [x] Restore rejects incomplete domain manifest.

**Failsafe:**

- [x] Backup restore dry-run first; no destructive restore without explicit approval.

### Phase 12 Gate

- [x] `php artisan test --filter=Admin` - 13 passed, 68 assertions.
- [x] `php artisan test --filter=Audit` - 7 passed, 67 assertions.
- [x] `php artisan test --filter=Doctor` - 7 passed, 53 assertions.
- [x] `php artisan test --filter=Backup` - 8 passed, 55 assertions.
- [x] `npm run build`
- [x] `git diff --check`

---

## 15. Phase 13: KADMOS CLI Alignment

**Goal:** terminale usabile da principianti ma potente per esperti.

**Phase owner:** Agent G + Agent C.

### Task 13.1: CLI Command Registry And JSON Output

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [x] Verified  [ ] Blocked

**Owner agent:** Agent G

**Files:**

- [x] `core/src/Cli/CommandRegistry.php`
- [x] `core/src/Cli/CommandRunner.php`
- [x] `core/src/Cli/Console.php`
- [x] `core/kadmos`
- [x] `core/tests/CliCommandRegistryTest.php`
- [x] `core/tests/CliCommandRoutingTest.php`
- [x] `core/tests/CliConsoleTest.php`

**Commands:**

- [x] `doctor`
- [x] `validate`
- [x] `run`
- [x] `compare`
- [x] `trace replay`
- [x] `fault explain`
- [x] `recover`
- [x] `files ingest`
- [x] `export benchmark`

**Tests:**

- [x] JSON output valid.
- [x] Exit codes stable.
- [x] Missing control-plane fails closed for trace/fault/recover/export.
- [x] Local trace fixture replay covered.
- [x] File ingest dry-run hashes real file bytes.
- [x] Invalid control-plane schemas fail closed instead of printing fake success.

**Failsafe:**

- [x] Live commands never silently use mock validator or fake control-plane data.

### Task 13.2: Guided Shell Tutorial

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [x] Verified  [ ] Blocked

**Owner agent:** Agent G

**Files:**

- [x] `core/src/Cli/GuidedShell.php`
- [x] `core/kadmos-chat-repl.php`
- [x] `core/tests/CliGuidedShellTest.php`

**Checklist:**

- [x] Boot animation first command then shell remains.
- [x] Beginner commands explained.
- [x] Expert slash commands available.
- [x] Modes: `ask`, `semi`, `auto`, `lab`, `enterprise`.

**Tests:**

- [x] Boot animation contract.
- [x] Slash command documentation.
- [x] Mode switch contract.

**Failsafe:**

- [x] `enterprise`, `lab`, and `semi` modes only auto-allow safe read/search tools; dangerous tools still prompt.
- [x] `auto` remains explicit full automation mode and worker execution remains governed by core execution policy.

### Phase 13 Gate

- [x] `cd core && php kadmos test` - all core tests passed.
- [x] `php kadmos doctor --json` - command returned JSON; readiness degraded because provider key is intentionally missing locally.
- [x] `git diff --check`

---

## 16. Phase 14: Browser E2E, Accessibility, Performance

**Goal:** prove whole product, not isolated components.

**Phase owner:** Agent H + Agent A + Captain.

### Task 14.1: Introduce UI Test Harness

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [x] Verified  [ ] Blocked

**Owner agent:** Agent H

**Files:**

- [x] `control-plane/playwright.config.ts`
- [x] `control-plane/tests/e2e/*.spec.ts`
- [ ] Optional Vitest config for composables.

**Tests:**

- [x] App loads `/chat`.
- [x] App loads `/dashboard`.
- [x] Command palette opens.
- [x] Composer sends deterministic test-only mocked message in E2E env.

**Failsafe:**

- [x] Do not require live external provider in E2E.

### Task 14.2: End-To-End Flows

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [x] Verified  [ ] Blocked

**Flows:**

- [x] First run: provider/profile -> chat -> run -> evidence chip.
- [x] File run: upload -> context set creation.
- [x] File run: context -> chat -> source provenance.
- [x] Replay: open persisted run -> replay -> fault evidence.
- [x] Replay: explicit fault filter control traversal.
- [x] Benchmark: inspect persisted lanes -> export audited report.
- [x] Benchmark: run compare -> inspect newly created lanes.
- [x] Admin: doctor degraded validator state.

**Failsafe:**

- [x] If E2E environment cannot run provider/model, use deterministic fake service marked test-only.

### Task 14.3: Accessibility And Responsive Checks

Status: [ ] Not started  [ ] In progress  [ ] Ready for review  [x] Verified  [ ] Blocked

**Checklist:**

- [x] Keyboard can reach chat and composer.
- [ ] Keyboard rail/inspector traversal remains pending until final dashboard UI refactor.
- [ ] Focus trap works in dialogs/sheets.
- [x] Icon-only buttons covered by existing labels in tested routes.
- [x] Reduced motion is emulated in E2E smoke checks.
- [x] Mobile widths do not overlap text in tested routes.
- [x] Semantic command-disabled states expose text, not color-only.

**Failsafe:**

- [ ] If a dense dashboard panel breaks mobile, use drawer/sheet instead of shrinking into overlap.

### Phase 14 Gate

- [x] `php artisan test` - 217 passed, 1205 assertions.
- [x] `npm run build`
- [x] `npm run test:e2e` - 17 passed, 1 skipped desktop-only mobile overflow duplicate.
- [x] Desktop screenshots attached to Playwright report.
- [x] Mobile screenshots attached to Playwright report.
- [x] `git diff --check`

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
| 0 | Preflight and file ownership | Captain | [x] Verified | baseline suites | Baseline verde con `.tools\env.ps1`; PHP diretto usa 8.3 e non va usato |
| 1 | Contracts and UI foundation | A + B | [x] Verified | Talos tests, build | `php artisan test --filter=Talos`, `npm run build`, `git diff --check` verdi; no-fake dashboard cleanup applicata |
| 2 | Persistent chat sessions | A + B | [x] Verified | Session/Message tests | `php artisan test` completo verde: 37 test, 195 assertion; `/chat` persistente |
| 3 | Provider profiles | B + F + A | [x] Verified | ModelProfile/ModelCenter/Chat tests | Server-side provider profiles, Model Center and `/chat` profile selection implemented |
| 4 | Context Vault | B + A + F | [x] Verified | File/Context/Chat tests | Persisted upload, chunks, context sets, dashboard vault, `/chat` grounding |
| 5 | AVM run bridge | B + C + A | [x] Verified | Run/chat/timeline tests, core tests | Persisted runs/events/artifacts and dashboard timeline live from APIs |
| 6 | Recovery and replay | C + B + A | [x] Verified | Recovery/Replay tests | HMI-first recovery and replay APIs/UI verified |
| 7 | Benchmark workbench | E + A + C | [x] Verified | Benchmark tests | Persisted benchmark groups/results and run-to-benchmark bridge verified |
| 8 | Tools and connectors | F + C + B + A | [x] Verified | Policy/Connector tests | Registry, planning context, validator/core enforcement, DNS pinning verified |
| 9 | Memory and skills | B + F + A | [x] Verified | Memory/Skill tests | Memory retrieval, skill registry, chat disclosure and dashboard panels verified |
| 10 | Research and documents | B + A + E | [x] Verified | Research/Artifact tests | Source-backed research, run-linked documents, and artifact previews verified |
| 11 | Productivity and email | B + F + A | [x] Verified | Email/Calendar tests | Notes, tasks, draft-only calendar, read/draft-only email verified |
| 12 | Admin, doctor, backup | F + B + A | [x] Verified | Admin/Audit/Doctor/Backup tests, build | Scoped admin tokens, role assignment, audit events, Doctor, policy and backup dry-run validation verified; benchmark export audit is now implemented for complete persisted benchmark groups |
| 13 | KADMOS CLI alignment | G + C | [x] Verified | `php kadmos test`, `php kadmos doctor --json` | Command registry, JSON routing, local trace replay, fail-closed control-plane commands, file ingest dry-run, and guided modes verified |
| 14 | E2E and hardening | H + A | [x] Verified | Laravel, build, Playwright E2E | Browser harness, strict deterministic API mocks, command palette smoke, file upload/context-set E2E, replay fault-evidence E2E, audited benchmark export E2E, desktop/mobile overflow checks, and screenshot attachments verified |

---

## 20. Final Launch Gate

TALOS can be called product-ready for an internal pilot only when:

- [x] All phase gates are verified.
- [x] Full core suite passes.
- [x] Full validator suite passes.
- [x] Full Laravel suite passes.
- [x] Frontend build passes.
- [x] Browser E2E passes.
- [x] `/chat` is persistent and clean.
- [x] `/dashboard` is real cockpit and not fixture-driven.
- [x] File ingestion works on user-provided files.
- [x] Trace replay works on persisted runs.
- [x] Recovery flow works on failed DAG branches.
- [x] Benchmark workbench proves AVM ON/OFF on same inputs.
- [ ] Provider secrets are not exposed to browser production flow.
- [ ] Tools are policy-checked and audited.
- [ ] Doctor shows real readiness.
- [ ] Backup manifest can be generated and validated.
- [x] KADMOS CLI can validate, run, compare, replay, recover, export.
- [x] No known fake production UI remains.
- [x] `git diff --check` passes.
