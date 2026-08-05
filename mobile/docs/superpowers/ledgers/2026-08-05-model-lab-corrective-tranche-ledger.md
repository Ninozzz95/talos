# Ledger esecutivo — Model Lab mobile tranche correttiva pre-Fase 5

Data: 2026-08-05
Lane: `mobile` soltanto
Owner: main agent
Stato: IN PROGRESS — SLICE A/B/C CLOSED; SLICE D/E OPEN
Prerequisito: Fasi 1–4 `IMPLEMENTED`, soddisfatto
Fase successiva OAuth: `DEFERRED`, non autorizzata da questo ledger

Ricerca:
`../research/2026-08-05-model-lab-corrective-tranche-research.md`
Specifica:
`../specs/2026-08-05-model-lab-download-center-local-compatibility-design.md`
Piano:
`../plans/2026-08-05-model-lab-corrective-tranche-plan.md`

## 1. Baseline e causa

### 1.1 Tree

Il tree è sporco per lavoro intenzionale Fasi 3/4 e relative evidenze. Non deve
essere resettato, ripulito, messo in stash o riscritto. `.codex/` è fuori scope.
Il branch è `lane/talos-mobile`; il root `AGENTS.md` vieta commit e push anche se
una vecchia istruzione conversazionale autorizzava commit locali.

### 1.2 Device

- seriale `2ea6573c`;
- OnePlus OPD2415;
- Android 16/API 36;
- 2400×3392, density 420 nativi;
- package side-by-side `ai.talos.dev` installato;
- zero GGUF presenti: l'owner li ha eliminati volontariamente; il baseline zero
  è confermato e non è un bug. La campagna non ricrea né cancella modelli owner;
- `tcp:9223` è estraneo e va preservato; soltanto `tcp:9222`, se creato da
  questa tranche, va rimosso.

### 1.3 Difetti riproducibili congelati

| ID | Difetto corrente | Evidenza |
|---|---|---|
| C45-01 | Model Lab precede account | `TalosMobileSettingsCenter.vue`: RouterLink prima della riga account |
| C45-02 | semantica tablet incompatibile col nuovo ordine | Model Lab route non può diventare un `tab` che controlla una pane locale |
| C45-03 | chip browse vanno a capo | classe `flex flex-wrap`; test pretende esplicitamente no horizontal rail |
| C45-04 | poller e card trasferimento duplicati | lista e repo creano entrambi `setInterval(1000)` |
| C45-05 | pausa utente può diventare retry | native usa lo stesso reason `stopped` per user/system |
| C45-06 | process death perde request | request static Java + `resumableTransfer` JS in-memory |
| C45-07 | nessun trigger globale | shell non osserva né mostra trasferimenti |
| C45-08 | apertura chat diverge dal fit | Model Lab 4096, adapter 16384 |
| C45-09 | open failure opaco | JNI 0 → unico `TALOS_LLAMA_OPEN_FAILED` |
| C45-10 | dettaglio variante troppo alto | due pulsanti full-width e card per ogni variante a 360×792 |
| C45-11 | primo GGUF mostra `1 modelli` | screenshot fisico `local-installed-compact.png` respinto; stringa senza scelta plurale |
| C45-12 | azioni locali sotto target | gate fisico: Importa, Annulla e Salva misurano 32 px invece del token 48 |
| C45-13 | stato HF nascosto sul telefono | E2E 360×792: `talos-hf-access-status` ha `hidden sm:inline` e nessun bounding box |

Ogni ID diventa test permanente prima della relativa modifica GREEN.

## 2. Inventario esatto dei file

L'inventario è il confine autorizzato. Se l'implementazione dimostra necessario
un file non elencato, il ledger viene emendato con causa prima di toccarlo.

### 2.1 Creare

1. `mobile/src/stores/modelTransfers.ts`
2. `mobile/src/components/shell/TalosMobileDownloadCenterTrigger.vue`
3. `mobile/src/lib/models/localContextPolicy.ts`
4. `mobile/tests/unit/stores/modelTransfers.test.ts`
5. `mobile/tests/unit/shell/TalosMobileDownloadCenterTrigger.test.ts`
6. `mobile/tests/unit/shell/downloadCenterReachability.test.ts`
7. `mobile/tests/unit/models/localContextPolicy.test.ts`
8. `mobile/tests/unit/services/localEngine.test.ts`
9. `mobile/tests/e2e/mobile-model-download-center.e2e.spec.ts`
10. `mobile/android/app/src/main/java/ai/talos/TalosTransferJournal.java`
11. `mobile/android/app/src/test/java/ai/talos/TalosTransferJournalTest.java`
12. `mobile/android/app/src/test/java/ai/talos/TalosLlamaOpenFailureTest.java`
13. `mobile/scripts/run-local-model-compatibility.mjs`
14. `mobile/tests/fixtures/local-model-compatibility.json`
15. `mobile/tests/unit/models/localModelCompatibilityManifest.test.ts`
16. `mobile/docs/superpowers/evidence/model-lab/corrective/settings-intelligence-phone.png`
17. `mobile/docs/superpowers/evidence/model-lab/corrective/settings-intelligence-tablet.png`
18. `mobile/docs/superpowers/evidence/model-lab/corrective/download-chat-running.png`
19. `mobile/docs/superpowers/evidence/model-lab/corrective/download-drawer-running.png`
20. `mobile/docs/superpowers/evidence/model-lab/corrective/download-model-lab-running.png`
21. `mobile/docs/superpowers/evidence/model-lab/corrective/download-center-paused.png`
22. `mobile/docs/superpowers/evidence/model-lab/corrective/download-center-tablet.png`
23. `mobile/docs/superpowers/evidence/model-lab/corrective/local-overview-rail-start.png`
24. `mobile/docs/superpowers/evidence/model-lab/corrective/local-overview-rail-end.png`
25. `mobile/docs/superpowers/evidence/model-lab/corrective/local-installed-compact.png`
26. `mobile/docs/superpowers/evidence/model-lab/corrective/local-repo-compact.png`
27. `mobile/docs/superpowers/evidence/model-lab/corrective/local-repo-tablet.png`
28. `mobile/docs/superpowers/evidence/model-lab/corrective/local-chat-qwen-recovered.png`
29. `mobile/docs/superpowers/evidence/model-lab/corrective/local-compatibility-summary.png`
30. `mobile/docs/superpowers/evidence/model-lab/corrective/local-model-compatibility-report.json`
31. `mobile/docs/superpowers/evidence/model-lab/corrective/manifest.md`
32. `mobile/docs/superpowers/evidence/model-lab/corrective/providers-hf-collapsed.png`
33. `mobile/docs/superpowers/evidence/model-lab/corrective/providers-hf-expanded.png`
34. `mobile/docs/superpowers/evidence/model-lab/corrective/model-lab-route-transition-end.png`
35. `mobile/docs/superpowers/evidence/model-lab/corrective/chat-memory-write-natural.png`
36. `mobile/android/app/src/main/java/ai/talos/TalosTransferDispatcher.java`
37. `mobile/android/app/src/test/java/ai/talos/TalosTransferDispatcherTest.java`
38. `mobile/android/app/src/test/java/ai/talos/TalosStorageReservationTest.java`
39. `mobile/docs/superpowers/evidence/model-lab/corrective/download-center-two-active.png`
40. `mobile/docs/superpowers/evidence/model-lab/corrective/model-lab-route-reduced-motion.png`
41. `mobile/docs/superpowers/evidence/model-lab/corrective/local-chat-open-error-actionable.png`
42. `mobile/docs/superpowers/evidence/model-lab/corrective/local-compat-smollm2-chat.png`
43. `mobile/docs/superpowers/evidence/model-lab/corrective/local-compat-lfm2-chat.png`
44. `mobile/docs/superpowers/evidence/model-lab/corrective/local-compat-granite4-chat.png`
45. `mobile/docs/superpowers/evidence/model-lab/corrective/local-compat-phi3-chat.png`
46. `mobile/docs/superpowers/evidence/model-lab/corrective/local-compat-llama32-chat.png`
47. `mobile/docs/superpowers/evidence/model-lab/corrective/local-compat-gemma3-chat.png`

I quattro documenti di piano/ricerca/spec/ledger sono già stati creati prima
del prodotto e sono parte di questo inventario documentale.

### 2.2 Modificare — prodotto TypeScript/Vue

1. `mobile/src/components/talos/settings/settingsTabs.ts`
2. `mobile/src/components/talos/settings/TalosMobileSettingsCenter.vue`
3. `mobile/src/components/shell/TalosMobileHeader.vue`
4. `mobile/src/components/shell/TalosMobileImmersiveChrome.vue`
5. `mobile/src/components/shell/TalosMobileToolSheet.vue`
6. `mobile/src/components/shell/TalosMobileSidebar.vue`
7. `mobile/src/components/shell/TalosTabletSidebar.vue`
8. `mobile/src/services/modelTransfer.ts`
9. `mobile/src/stores/localModels.ts`
10. `mobile/src/components/talos/models/TalosMobileLocalModels.vue`
11. `mobile/src/components/talos/models/TalosMobileLocalModelRow.vue`
12. `mobile/src/components/talos/models/TalosMobileLocalRepoDetail.vue`
13. `mobile/src/lib/models/modelTools.ts`
14. `mobile/src/services/localEngine.ts`
15. `mobile/src/lib/chat/providers/localAdapter.ts`
16. `mobile/src/i18n/locales/it.ts`
17. `mobile/src/i18n/locales/en.ts`
18. `mobile/package.json`
19. `mobile/scripts/verify-initial-chunk.mjs`
20. `mobile/src/components/talos/models/TalosMobileHuggingFaceAccessCard.vue`
21. `mobile/src/App.vue`
22. `mobile/src/lib/tools/toolLabels.ts`
23. `mobile/src/lib/models/ggufSet.ts`

Emendamento owner 2026-08-05: `mobile/src/App.vue` entra esclusivamente per il
boundary di transizione fra route Model Lab; il Download Center continua a non
usarlo e resta posseduto dai cinque chrome lazy. L'emendamento precede qualsiasi
edit e richiede ricerca/addendum RED nella Slice C.

Emendamento owner 2026-08-05: `toolLabels.ts` entra esclusivamente per impedire
che il wire identifier `memory_write` trapeli nella riga attività chat. Il
componente `TalosMobileStreamingReply.vue` è stato ispezionato e non richiede
modifica: usa già il boundary centralizzato corretto.

Emendamento gate fisico Slice C 2026-08-05: `ggufSet.ts` entra dopo che il
repository ufficiale LiquidAI ha mostrato sul dispositivo due file distinti,
generico e `hip-optimized`, entrambi ridotti dalla label corrente a `Q4_K_M`.
L'edit è limitato alla conservazione del suffisso upstream nella label umana;
path/hash/byte e semantica di grouping restano invariati.

Emendamento build Slice B 2026-08-05: il primo build reale ha misurato 600431
byte contro il tetto immutabile di 600000. Una factory condivisa ha misurato
600436; il filtro fine module-preload ufficiale ma sperimentale ha recuperato
solo 103 byte (600328). Entrambi gli esperimenti task-local sono rimossi. La
misura Rollup per modulo ha invece isolato 13625 byte pre-minify nel menu chat
“⋮”, controllo post-boot già condiviso fra header classico e immersivo. La
soluzione finale adotta il boundary Vue stabile `defineAsyncComponent` anche per
quel menu, già nell'inventario tramite i due chrome e il build gate. Alzare il
budget, disabilitare module-preload globalmente o rendere eager lo store restano
rigettati.

### 2.3 Modificare — native Android

22. `mobile/android/app/src/main/java/ai/talos/TalosModelTransferPlugin.java`
23. `mobile/android/app/src/main/java/ai/talos/TalosTransferSession.java`
24. `mobile/android/app/src/main/java/ai/talos/TalosModelTransferJob.java`
25. `mobile/android/app/src/main/java/ai/talos/TalosModelTransferService.java`
26. `mobile/android/app/src/main/java/ai/talos/TalosTransferNotification.java`
27. `mobile/android/app/src/main/java/ai/talos/TalosTransferControl.java`
28. `mobile/android/app/src/main/java/ai/talos/TalosStorageReservation.java`
29. `mobile/android/app/src/main/java/ai/talos/TalosLlamaNative.java`
30. `mobile/android/app/src/main/java/ai/talos/TalosLlamaEngine.java`
31. `mobile/android/app/src/main/java/ai/talos/TalosLlamaPlugin.java`
32. `mobile/android/app/src/main/cpp/talos_llama_jni.cpp`

`TalosModelStore.java`, `AndroidManifest.xml`, Gradle e il submodule llama.cpp
non sono previsti. Il journal riusa `Slot.resume()`/`discard()` esistenti.

### 2.4 Modificare — test

32. `mobile/tests/unit/settings/settingsGroups.test.ts`
33. `mobile/tests/unit/settings/settingsTabs.test.ts`
34. `mobile/tests/unit/settings/TalosMobileSettingsCenter.test.ts`
35. `mobile/tests/unit/shell/TalosMobileHeader.test.ts`
36. `mobile/tests/unit/shell/TalosMobileSidebar.test.ts`
37. `mobile/tests/unit/shell/TalosMobileToolSheet.test.ts`
38. `mobile/tests/unit/shell/appShell.test.ts`
39. `mobile/tests/unit/services/modelTransfer.test.ts`
40. `mobile/tests/unit/stores/localModels.test.ts`
41. `mobile/tests/unit/models/modelTools.test.ts`
42. `mobile/tests/unit/components/localModelsSection.test.ts`
43. `mobile/tests/unit/models/TalosMobileLocalModelRow.test.ts`
44. `mobile/tests/unit/models/TalosMobileLocalRepoDetail.test.ts`
45. `mobile/tests/unit/chat/localAdapter.test.ts`
46. `mobile/tests/unit/theme/modelLabThemeTokenContract.test.ts`
47. `mobile/tests/unit/build/initialChunkContract.test.ts`
48. `mobile/tests/unit/i18n/localization.test.ts`
49. `mobile/tests/unit/i18n/localizationCoverage.test.ts`
50. `mobile/tests/e2e/mobile-settings-parity.e2e.spec.ts`
51. `mobile/tests/e2e/mobile-model-lab-navigation.e2e.spec.ts`
52. `mobile/tests/e2e/mobile-model-lab-filters.e2e.spec.ts`
53. `mobile/tests/e2e/mobile-model-lab-coherence.e2e.spec.ts`
54. `mobile/tests/e2e/mobile-model-lab-parity.e2e.spec.ts`
55. `mobile/android/app/src/test/java/ai/talos/TalosTransferSessionTest.java`
56. `mobile/android/app/src/androidTest/java/ai/talos/TalosLlamaEngineDeviceTest.java`
57. `mobile/tests/unit/android/transferJobPermissions.test.ts`
58. `mobile/tests/unit/models/TalosMobileHuggingFaceAccessCard.test.ts`
59. `mobile/tests/unit/models/TalosMobileProviderRuntimePanel.test.ts`
60. `mobile/tests/unit/tools/toolLabels.test.ts`
61. `mobile/tests/unit/chat/streamingUi.test.ts`
62. `mobile/tests/unit/models/ggufSet.test.ts`

### 2.5 Modificare — documentazione

60. `mobile/docs/PASSAGGIO-DI-CONSEGNE.md`
61. `mobile/docs/superpowers/plans/2026-08-04-model-lab-mobile-hub-plan.md`
62. `mobile/docs/superpowers/specs/2026-08-04-model-lab-mobile-hub-design.md`
63. `mobile/docs/superpowers/research/2026-08-04-model-lab-mobile-hub-research.md`
64. `mobile/docs/superpowers/ledgers/2026-08-04-model-lab-phase-5-provider-oauth-ledger.md`
65. `mobile/docs/superpowers/COMPETITIVE-ONE-UP-DOCTRINE.md`
66. `mobile/docs/superpowers/research/2026-08-05-model-lab-corrective-tranche-research.md`
67. `mobile/docs/superpowers/specs/2026-08-05-model-lab-download-center-local-compatibility-design.md`
68. `mobile/docs/superpowers/plans/2026-08-05-model-lab-corrective-tranche-plan.md`
69. `mobile/docs/superpowers/ledgers/2026-08-05-model-lab-corrective-tranche-ledger.md`

### 2.6 Eliminare

Nessun file. Le card/poller duplicati vengono rimossi dai componenti senza
eliminare route o componenti pubblici.

## 3. Simboli pubblici e di compatibilità

### 3.1 Settings

- `TalosMobileSettingsTabId`: invariato, include ancora `models`;
- `TALOS_MOBILE_SETTINGS_MODEL_LAB_TAB`: resta parse/deep-link compatibility;
- `TalosMobileSettingsGroup`: firma `label + tabIds` stabile;
- `TALOS_MOBILE_SETTINGS_GROUPS`: Intelligence diventa
  `['models', 'ai_defaults', 'agent_tools']`.

Nessun nuovo tipo route viene introdotto.

### 3.2 Service trasferimento

- `TalosTransferRunner`: invariato;
- nuovo `TalosTransferPhase = 'idle' | 'queued' | 'running' | 'pausing' |
  'paused' | 'verifying' | 'failed'`, emendato con `'waiting'`;
- `TalosTransferStart`: aggiunge `id` e `phase`, conserva runner e
  `networkBound`;
- nuovo `TalosTransferItem`: ID, job ID, createdAt, phase, repo, revision,
  paths, modelName, have/total, runner, networkBound, failure e resumable;
- `TalosTransferStatus`: aggiunge `items: TalosTransferItem[]` e conserva la
  proiezione legacy del primo record più `readFailure`; `readFailure` distingue
  un bridge illeggibile da un registro realmente vuoto, così l'ultimo snapshot
  non viene azzerato;
- `talosStartModelTransfer()` stabile;
- `talosPauseModelTransfer(id?)`, `talosResumeModelTransfer(id?)` e
  `talosCancelModelTransfer(id?)`: l'ID è canonico, l'omissione resta solo per
  APK legacy con un unico record;
- `talosStopModelTransfer()` resta alias compatibile di pause;
- `talosModelTransferStatus()`, `talosModelTransferLeftovers()` e
  `talosDiscardModelTransfer()` restano stabili.

### 3.3 Store globale

- `TalosModelTransferState`;
- `TalosModelTransferState.items` collection readonly;
- `talosModelTransfers` readonly;
- `talosBeginModelTransfer(request)`;
- `talosRefreshModelTransfer()`;
- `talosRetainModelTransferObserver(): () => void`;
- `talosPauseManagedModelTransfer(id?)`;
- `talosResumeManagedModelTransfer(id?)`;
- `talosCancelManagedModelTransfer(id?)`.

Build boundary: `TalosMobileChatOptionsMenu` conserva nome, props ed eventi ma
viene risolto tramite `defineAsyncComponent` nei due chrome che già lo usano.

Compatibilità in `localModels.ts`:

- `TalosLocalModelsState.transfer` resta ma punta alla stessa sorgente;
- `talosStopLocalDownload()`, `talosResumeLocalDownload()` e
  `talosRefreshTransfer()` restano wrapper;
- `TALOS_DEFAULT_LOCAL_CONTEXT` resta alias.

### 3.4 Native transfer

`TalosTransferJournal` espone package-level:

- `SCHEMA_VERSION = 2` e `LEGACY_JOB_ID = 4712`;
- `Phase`;
- `Phase.WAITING`;
- `Snapshot.id`, `jobId`, `createdAtMs` più i campi v1;
- `Storage`;
- `forContext(Context)`;
- `list()`, `read(String)`, `readByJobId(int)`;
- `read()` come vista compatibile non ambigua;
- `begin(Request, Runner, boolean)` con identità canonica e job ID unico;
- `queue(String, Runner, boolean)`;
- `transition(String, Phase, String)`;
- `remove(String)`;
- `idFor(Request)` e allocazione job ID con collision probing;
- `transition(Phase, String)` compatibile soltanto con un record;
- `clear()`.

`TalosTransferSession` aggiunge:

- `StopCause { NONE, USER_PAUSE, USER_CANCEL, SYSTEM_STOP }`;
- `begin(Context, Request, Runner, boolean)` restituisce lo snapshot creato;
- `restoreAll(Context)`, `restore(Context, String)` e vista legacy
  `restore(Context)`;
- `active(String)`, `requestStop(String, StopCause)`, `stopCause(String)`,
  `stopRequested(String)`, `workerRunning(String)`;
- `haveBytes(String)`, `totalBytes(String)`, `runner(String)` e
  `networkBound(String)`;
- `finish(Context, String, String)` e `cancel(Context, String)`;
- `run(Context, String, Request, Network, Report)`;
- `progressFromDisk(Context, Request)`;
- mantiene overload/alias necessari ai test esistenti finché tutti i caller
  sono migrati, ma nessun overload senza ID può agire quando esistono più
  record.

Nuovo `TalosTransferDispatcher` package-level:

- `MAX_ACTIVE_TRANSFERS = 2`;
- `dispatch(Context, Runner)` promuove FIFO soltanto gli slot disponibili;
- `stopHost(Context, Snapshot)` colpisce job/service del solo ID;
- `occupied(List<Snapshot>)` e `availableSlots(List<Snapshot>)` sono pure e
  provate su JVM;
- Job ID è persistito: lo stesso ID non viene mai usato da due record e il job
  legacy mantiene 4712.

`TalosStorageReservation` aggiunge una sezione critica statica e
`reserveAll(Context, TalosModelStore, Request)`: check allocatable e
preallocazione di tutti i pezzi di un set avvengono come una sola decisione.

Plugin methods: `start`, `pause`, `resume`, `cancel`, `stop`, `status`,
`leftovers`, `discard`. `start` ritorna ID/fase; `status` ritorna `items[]`;
pause/resume/cancel ricevono `{ id }` e fanno fallback senza ID soltanto se il
registro contiene esattamente un record.

### 3.5 Policy/runtime locale

In `localContextPolicy.ts`:

- `TALOS_LOCAL_DEFAULT_CONTEXT_TOKENS = 4096`;
- `TALOS_LOCAL_FALLBACK_CONTEXT_TOKENS = 2048`;
- `talosLocalContextCandidates(requested?)`;
- `talosShouldRetryLocalOpen(stage)`.

In `localEngine.ts`:

- `TalosLocalEngineOpenStage`;
- `TalosLocalEngineOpenError extends Error`, con proprietà readonly `stage` e
  `nativeCode`;
- `talosLocalEngineOpen()` conserva firma e normalizza failure;
- nuovo `talosLocalEngineOpenWithFallback()`.

In `localAdapter.ts`, `ensureLoaded()` usa il fallback bounded e converte lo
stadio finale in `TalosMobileProviderError(operation='complete')`. Le chiavi
i18n pubbliche aggiunte sono `models.localModelOpenPath`,
`models.localModelOpenLoad`, `models.localModelOpenContext`,
`models.localModelOpenSampler` e `models.localModelOpenUnknown`; ciascuna
contiene un'azione concreta e nessuna espone path o payload nativi.

In Java:

- `TalosLlamaEngine.FailureStage`;
- `TalosLlamaEngine.OpenAttempt`;
- `TalosLlamaEngine.tryOpen(...)`;
- `OpenAttempt.engine()` e `OpenAttempt.failureStage()`;
- `TalosLlamaEngine.open(...)` resta e delega;
- `TalosLlamaNative.nativeLastOpenError()`;
- JNI `Java_ai_talos_TalosLlamaNative_nativeLastOpenError`.

### 3.6 UI

`TalosMobileDownloadCenterTrigger` non accetta props: legge lo store unico.
Test hook stabili:

- `talos-download-center-trigger`;
- `talos-download-center-content`;
- `talos-download-center-progress`;
- `talos-download-center-pause`;
- `talos-download-center-resume`;
- `talos-download-center-cancel`;
- `talos-download-center-cancel-confirm`.

Ogni `talos-download-center-item` espone `data-transfer-id`; i test hook azione
possono ripetersi fra righe e vengono sempre risolti sotto la riga identificata.
Il DOM è `ul/li`, i controlli hanno label localizzate contenenti il nome modello
e la conferma cancel non può comparire in una riga diversa.

I test hook Model Lab esistenti restano. `talos-models-filters` cambia layout,
non identità.

Il contratto pubblico delle label tool resta stabile:

- `TALOS_TOOL_LABELS`, `TALOS_TOOL_LABEL_KEYS` e `TALOS_TOOL_ICONS` mantengono
  tipo e fallback, aggiungendo la chiave canonica `memory_write`;
- `talosToolActivityLabel(...)` non cambia firma;
- le locale aggiungono `toolActivity.memoryWrite` in inglese e italiano;
- `memory_write` resta invariato nei payload provider, audit, trace e policy di
  consenso.

## 4. Scenari RED → GREEN permanenti

### C45-RED-01 — posizione Settings — GREEN DEVICE

Test: `settingsGroups.test.ts` + `TalosMobileSettingsCenter.test.ts`.
RED: `models` non è nel gruppo e il link precede account.
GREEN: account precede Intelligence e Model Lab è la prima riga del gruppo.

### C45-RED-02 — una grammatica navigazione — GREEN DEVICE

Test: `TalosMobileSettingsCenter.test.ts`.
RED: tablet rende 12 tab e link esterno.
GREEN: phone/tablet non rendono tablist/tab; pane tablet e region labeling
restano funzionanti.

### C45-RED-01A — token route Settings — REVIEW GREEN

Test: `modelLabThemeTokenContract.test.ts` e
`TalosMobileSettingsCenter.test.ts`.
RED: spostando Model Lab nel gruppo, il row e il contenitore ereditano
`rounded-xl`, `min-h-14`, `gap-3`, `px-3`, `size-5/4` e non reagiscono a
density/radius/spacing/icon size del Theme Engine.
GREEN: il boundary statico include l'entry Settings e il DOM usa soltanto
`--talos-radius-card`, `--talos-touch-target`, `--talos-space-inline`,
`--talos-space-card` e `--talos-icon-size` per quella gerarchia.

RED osservato il 2026-08-05, prima del fix prodotto:

```text
rtk npx vitest run tests/unit/settings/TalosMobileSettingsCenter.test.ts tests/unit/theme/modelLabThemeTokenContract.test.ts
Test Files  2 failed (2)
Tests       2 failed | 20 passed (22)
TalosMobileSettingsCenter: attesi i token, ricevuti min-h-14 gap-3 px-3
modelLabThemeTokenContract: ricevuta violazione "literal spacing"
```

Il fallimento coincide con il difetto della review e non introduce rumore in
altri contratti; il GREEN deve mantenere le righe sorelle nello stesso sistema
di densita, raggio e iconografia.

### C45-RED-02A — focus reale route — REVIEW GREEN

Test: `mobile-settings-parity.e2e.spec.ts` e
`mobile-model-lab-navigation.e2e.spec.ts`.
RED: i test inferiscono i tab stop dall'assenza di `tabindex`; lo stub RouterLink
non ha `href` e nessun browser gate prova Account → Model Lab → AI Defaults →
Agent Tools o Enter sul link.
GREEN: Chromium reale prova la sequenza in entrambi i viewport e Enter apre la
route canonica.

### C45-RED-02B — tablet davvero side-by-side — REVIEW GREEN

Test: `mobile-model-lab-navigation.e2e.spec.ts`.
RED: il test tablet controlla i role ma non che nav e region siano visibili e
adiacenti dopo un'interazione inline.
GREEN: a 1024 px apre Account, misura entrambe le pane adiacenti, mantiene nav
visibile, region correttamente etichettata e zero settings tabpanel.

### C45-RED-03 — trigger raggiungibile ovunque

Test: `downloadCenterReachability.test.ts` e shell component tests.
RED: nessuno dei cinque chrome monta il trigger.
GREEN: import sempre dinamico e cinque surface coperte.

### C45-RED-04 — observer unico

Test: `modelTransfers.test.ts`.
RED: due mount producono due poller.
GREEN: refcount con un solo timer e cleanup all'ultimo release.

### C45-RED-05 — pausa non retry

Test: `TalosTransferJournalTest.java` e `TalosTransferSessionTest.java`.
RED: `stopped` è ambiguo.
GREEN: `USER_PAUSE` persiste paused e Job non chiede retry.

### C45-RED-06 — stop sistema riprende

Test: stessi file.
RED: dopo process recreation active request è null.
GREEN: journal ricostruisce request/progresso e SYSTEM_STOP resta queued.

### C45-RED-07 — cancel confinato

Test: journal/session + service test TS.
RED: nessuna API cancel distinta.
GREEN: solo slot della request vengono eliminati; path esterno rifiutato.

### C45-RED-08 — Download Center funzionale

Test: `TalosMobileDownloadCenterTrigger.test.ts`.
RED: nessun popover/stato/azioni.
GREEN: progress, pause, resume, conferma cancel, failure e focus sono reali.

### C45-RED-08A — registro v2 e migrazione v1

Test: `TalosTransferJournalTest.java`.
RED: schema 1 può rappresentare un solo oggetto e non ha ID/job ID.
GREEN: due record fanno round-trip, job ID sono distinti, stessa richiesta è
duplicato, collisione viene risolta, v1 migra atomicamente mantenendo job 4712 e
nessun token/unknown field viene accettato.

### C45-RED-08B — due slot, terzo in coda

Test: `TalosTransferDispatcherTest.java` e `TalosTransferSessionTest.java`.
RED: un singleton rifiuta il secondo oppure un dispatch illimitato avvia anche
il terzo.
GREEN: due record occupano slot, il terzo resta `waiting`, la liberazione di un
solo ID promuove il più vecchio e nessuno stop cause attraversa record.

### C45-RED-08C — collection bridge e azioni per riga

Test: `modelTransfer.test.ts`, `modelTransfers.test.ts`,
`TalosMobileDownloadCenterTrigger.test.ts` e Download Center E2E.
RED: bridge/store/UI proiettano un solo record e i pulsanti sono globali.
GREEN: due righe hanno progresso e label distinti; pausa/cancel inoltrano l'ID
della propria riga, la seconda fase non cambia e la conferma resta confinata.

### C45-RED-08D — riserva concorrente senza overcommit

Test: `TalosStorageReservationTest.java`.
RED: due worker possono eseguire simultaneamente check allocatable e allocate.
GREEN: la sezione critica osserva al massimo un reserver e ogni set viene
preallocato interamente prima del primo byte di rete.

### C45-RED-08E — notifica e job confinati

Test: `TalosTransferDispatcherTest.java`, `TalosTransferSessionTest.java` e
`transferJobPermissions.test.ts`.
RED: job/notification ID 4712 e PendingIntent request code 0 puntano tutti allo
stesso trasferimento.
GREEN: job ID, child notification, action extra e stop sono per ID; due child
sono raggruppabili e la completion di uno non cancella l'altra.

### C45-RED-08F — primo paint e localizzazione fisica

Test: component/E2E più gate device.
RED: dopo restart il popover può mostrare un guscio parzialmente non dipinto e
in locale italiana il titolo è `Download Center`.
GREEN: al primo open post-restart header, entrambe le righe e tutti i controlli
sono visibili; il titolo è `Centro download`, senza clipping/overflow né
children mancanti nello screenshot originale.

### C45-RED-08G — riepilogo trigger singolare e informativo

Test: `TalosMobileDownloadCenterTrigger.test.ts` e Download Center E2E.
RED: sostituendo il trasferimento singolo con una collection il nome accessibile
regredisce a `1 items` e perde modello/progresso.
GREEN: con una riga il trigger annuncia modello e percentuale; con più righe
annuncia un conteggio grammaticalmente corretto in inglese e italiano.

### C45-RED-08H — contratto chat multi-trasferimento

Test: `modelTools.test.ts`.
RED: `local_model_download` dichiara ancora un solo download, il secondo avvio
può ereditare il vincolo rete della prima riga e `local_models_status` proietta
un solo modello anche quando il registro ne contiene più di uno.
GREEN: il tool dichiara due slot più coda, associa la risposta alla riga appena
creata e restituisce tutte le righe durevoli con fase/progresso, mantenendo
`downloading` come proiezione compatibile del primo trasferimento attivo.

### C45-RED-08I — transizione dopo rollback del wall clock

Test: `TalosTransferJournalTest.java`.
RED: un record creato con un wall clock successivamente riportato indietro
produce `updatedAtMs < createdAtMs` e viene rifiutato dal proprio decoder.
GREEN: `updatedAtMs` non scende mai sotto il precedente valore; il registro
resta leggibile senza usare un clock since-boot come timestamp persistente.

### C45-RED-08J — host orphan non blocca uno slot

Test: `TalosTransferDispatcherTest.java`, `TalosTransferSessionTest.java` e
`transferJobPermissions.test.ts`.
RED: ogni job orphan viene considerato ancora `queued`; uno stop FGS con
callback persiste anch'esso `queued`, ma nessun host può più eseguirlo.
GREEN: un job moving resta queued solo se `JobScheduler` possiede ancora il suo
ID; altrimenti, e sempre per un FGS orphan, torna `waiting`. Lo stop sistema FGS
persiste `waiting` con retry differito al prossimo foreground sicuro.

### C45-RED-09 — nessun poller di pagina

Test: `localModelsSection.test.ts` e `TalosMobileLocalRepoDetail.test.ts`.
RED: entrambi invocano `setInterval`.
GREEN: zero interval locali e zero card trasferimento duplicate.

### C45-RED-09A — accesso HF usa la grammatica provider

Test: `TalosMobileHuggingFaceAccessCard.test.ts` e
`TalosMobileProviderRuntimePanel.test.ts`.
RED: la card HF è una superficie speciale sempre aperta e non condivide
disclosure, logo, focus e gerarchia dei provider API key.
GREEN: header provider con logo Hugging Face, collapsed di default, stato
expanded accessibile e contenuto credenziale invariato/sicuro.

### C45-RED-09A2 — stato accesso HF persistente a 360 px

Test: `TalosMobileHuggingFaceAccessCard.test.ts` e
`mobile-model-lab-filters.e2e.spec.ts`.
RED: lo stato esiste ma `hidden sm:inline` lo elimina proprio sul telefono,
mentre ogni altro provider conserva configurazione/modelli nel titolo chiuso.
GREEN: `salvato`/`non configurato` è supporting content dentro il blocco copy,
sempre visibile, senza restringere titolo/descrizione; header, chevron, panel,
secret handling e breakpoint tablet restano invariati. Prova umana: ricattura
fisica collapsed ed expanded con stato leggibile e zero overflow.

### C45-RED-09B — transizioni route Model Lab

Test: `appShell.test.ts` e Model Lab navigation E2E.
RED: il `RouterView` interno al tool sheet sostituisce istantaneamente le route.
GREEN: cambio avanti/Back usa il motion boundary TALOS, mantiene focus e non
anima con reduced motion. Prova umana: click reale hub → Provider sul device,
media emulata `prefers-reduced-motion: reduce`, un solo route view focalizzato,
`transform: none`, `opacity: 1`, zero animazioni attive e durata tecnica globale
`0.001ms` (nessun frame di moto); gli eventi lifecycle istantanei possono
comunque essere emessi. Screenshot fisico `model-lab-route-reduced-motion.png`.

### C45-RED-09C — sezione installati soltanto quando esiste

Test: `localModelsSection.test.ts`.
RED: `Su questo dispositivo` e il suo empty card appaiono dopo una scansione
valida con zero modelli.
GREEN: zero modelli nasconde l'intera sezione; almeno un modello la rende con
ricerca, sort, layout e azioni. Una scansione fallita non viene scambiata per
zero e conserva l'ultimo elenco valido.

### C45-RED-09D — `memory_write` non trapela nella chat

Test: `toolLabels.test.ts` e `streamingUi.test.ts`.
RED: una vera factory `createTalosMemoryWriteTools(...)` resta fuori dalla
guardia completa e la riga renderizzata ricade sul testo tecnico
`memory_write`.
GREEN: la guardia enumera anche il tool di scrittura memoria; label e icona
canoniche esistono; la riga mostra copy naturale nella locale italiana e
inglese e non contiene mai `memory_write`. L'ID tecnico resta identico nei
contratti e nelle trace. Prova umana: vera chiamata memory-write e screenshot
fisico `chat-memory-write-natural.png`.

### C45-RED-10 — rail filtri single-line

Test: `localModelsSection.test.ts`, nome
`LOCAL-FILTER-RAIL-01 keeps every complete filter on one horizontally scrolling row`.
RED: `flex-wrap`, no overflow-x.
GREEN: `flex-nowrap overflow-x-auto overscroll-x-contain`, chip `shrink-0`,
label complete.

### C45-RED-11 — rail mantiene comportamento

Test: stesso file + E2E filtri.
RED: ultimo chip non raggiungibile senza wrap nel nuovo contratto.
GREEN: scroll/tap/tastiera attivano l'ultimo chip, AND/reset/provider stabili.

### C45-RED-12 — lista installati continua

Test: `localModelsSection.test.ts`.
RED: ogni file è una card con gap.
GREEN: un contenitore/divider, due righe max, CRUD e sort invariati.

### C45-RED-12A — conteggio installati grammaticalmente corretto

Test: `localModelsSection.test.ts` e `localization.test.ts`.
RED scoperto dal gate fisico con il GGUF reale
`SmolLM2-135M-Instruct-Q2_K.gguf`: la testata rende `1 modelli` perché
`installedCount` è una semplice interpolazione plurale.
GREEN: il rendering mostra `1 model`/`1 modello` e `2 models`/`2 modelli`
attraverso la pluralizzazione Vue I18n documentata, senza ternari nel
componente. Prova umana: nuova `local-installed-compact.png` ispezionata a
pixel originali; la cattura precedente resta evidenza del RED ma non è prova
di chiusura.

Rollback: ripristinare insieme le due locale e i due test. Non è valido
ripristinare soltanto il testo italiano lasciando l'inglese o il contratto
strutturale divergenti.

### C45-RED-12B — ogni azione locale resta toccabile a 48 dp

Test: `localModelsSection.test.ts` e `modelLabThemeTokenContract.test.ts`.
RED scoperto dal gate fisico del menu installati: le tre voci menu e il campo
sono 48 px, ma Importa, i due footer Rinomina e i due footer Elimina ereditano
il Button da 32 px.
GREEN: tutti e cinque i pulsanti dichiarano
`min-h-[var(--talos-touch-target)]`; nomi, varianti, eventi, dialoghi e ordine
distruttivo restano invariati. Prova umana: apertura reale di menu, Rinomina e
conferma Elimina; misure DOM 48 px e screenshot original-pixel senza clipping.

Rollback: rimuovere congiuntamente i cinque minimi tokenizzati e il test. Non
modificare globalmente Button, perché allargherebbe superfici fuori dalla lane
e dal gate fisico eseguito.

### C45-RED-13 — righe repository compatte

Test: `TalosMobileLocalModelRow.test.ts`.
RED: card separate a tre righe metadata.
GREEN: riga continua, fit/route/gated/revision intatti.

### C45-RED-14 — varianti compatte

Test: `TalosMobileLocalRepoDetail.test.ts`.
RED: due pulsanti full-width per ogni card.
GREEN: label/size/fit sempre visibili, dettaglio disclosure, download 48dp e
incomplete disabilitato.

### C45-RED-14A — scheda repository compatta sul telefono

Test: `TalosMobileLocalRepoDetail.test.ts`.
RED scoperto dal gate fisico 360×792: il riepilogo README usa cinque righe e
spinge la prima lista sotto quasi metà viewport.
GREEN: riepilogo limitato a due righe visive, README completo ancora nel
`details` nativo e touch target 48dp invariato. Prova umana:
`local-repo-compact.png` ispezionato a pixel originali.

### C45-RED-14B — varianti backend non collassate

Test: `ggufSet.test.ts`, fixture reale nominata
`LFM2-350M-Q4_K_M-hip-optimized.gguf`.
RED scoperto dal gate fisico: generico 229309376 byte e HIP 254958528 byte
appaiono entrambi come `Q4_K_M`.
GREEN: label distinte `Q4_K_M` e `Q4_K_M · HIP optimized`; grouping,
ordinamento, path, hash e disponibilità download invariati. La UI non dichiara
incompatibilità CPU finché la matrice runtime non la prova.

RED fisico-conseguente eseguito il 2026-08-05 prima del prodotto:
`TalosMobileLocalRepoDetail.test.ts` e `ggufSet.test.ts`, 18 test totali,
esattamente 2 failure attese (`line-clamp-2` assente e seconda label ancora
`Q4_K_M`), 16 regressioni preesistenti verdi.

### C45-RED-14C — suffisso completo senza riga più alta

Test: `TalosMobileLocalRepoDetail.test.ts`.
RED scoperto nella prima ricattura post-14B a 360×792: la riga distingue HIP ma
mostra `Q4_K_M · HIP opt…`, perché label e byte competono nella stessa linea.
GREEN: identità in una colonna a due righe già contenuta nei 48dp del pulsante
(label completa sopra, byte sotto), download nella seconda colonna; altezza
della riga e touch target non aumentano. Nuova cattura original-pixel
obbligatoria prima della chiusura.

RED eseguito prima del prodotto: 1 failure C45-RED-14C attesa, 5 regressioni
verdi; il primary row non possiede ancora boundary/colonna identità.

### C45-RED-15 — parity contesto

Test: `localContextPolicy.test.ts` e `localAdapter.test.ts`.
RED: adapter chiede 16384, Model Lab 4096.
GREEN: entrambi importano 4096 dallo stesso simbolo.

### C45-RED-16 — fallback limitato

Test: `localEngine.test.ts`.
RED: failure generico non classificabile.
GREEN: context tenta `[4096, 2048]`; altri stage una volta sola.

### C45-RED-17 — open failure azionabile

Test: `localAdapter.test.ts`, `TalosLlamaOpenFailureTest.java`, device test.
RED: system message è solo `TALOS_LLAMA_OPEN_FAILED`.
GREEN: stage attraversa tutti i confini e la chat salva frase localizzata.

RED osservato prima del prodotto il 2026-08-05: il gate TypeScript mirato ha
prodotto 8 failure e 3 regressioni verdi — modulo policy inesistente, classe e
fallback engine inesistenti, adapter ancora sul vecchio open 16384 e nessun
provider error localizzato. Il gate JVM, rilanciato da solo dopo aver escluso
un primo tentativo contaminato da due Gradle concorrenti, è fallito con 12
errori tutti sui simboli pianificati `FailureStage`/`fromWire`; nessun errore
preesistente è stato contato come RED.

### C45-RED-18 — matrice sequenziale sicura

Test: `localModelCompatibilityManifest.test.ts`.
RED: nessun manifest/harness/namespace.
GREEN: revision/hash/byte unici, concurrency 1, target fisso allowlisted,
cleanup obbligatorio, gated distinto.

### C45-RED-19 — compatibilità fisica per famiglia

Test: `TalosLlamaEngineDeviceTest` eseguito dal runner.
RED: un solo `talos-probe.gguf` opzionale non rappresenta lo spettro.
GREEN: ogni caso ammesso fa open/template/generate/close e lascia zero residui.
Dopo il PASS nativo, la stessa unica copia viene spostata atomicamente nel
namespace UI allowlisted `files/models/__talos_compat__/<case>`: la chat reale
deve generare una risposta visibile, acquisita via ADB e ispezionata a pixel
originali, prima della pulizia e del caso seguente. Il caso C2 usa lo screenshot
già inventariato `local-chat-qwen-recovered.png`; gli altri usano i PNG
`local-compat-*-chat.png`. Gemma crea il proprio PNG soltanto se l'accesso gated
è già autorizzato; altrimenti resta `SKIPPED_GATED`.

### Emendamento E1 — staging app-owned su Android 16

Ispezione fisica: un target creato dall'utente `shell` sotto l'area esterna
app-specific è risultato illeggibile a TALOS. Non è un difetto del prodotto:
Android 11+ isola quelle directory e il test aveva assegnato ownership errata.
`run-as ai.talos.dev id` sul device `2ea6573c` è invece PASS e restituisce l'UID
app `10385`.

File esatti già inventariati:

- `mobile/scripts/run-local-model-compatibility.mjs`: export pubblici
  `resolveSelectedCases(manifest, requestedIds)` e
  `assertSafeCampaignRelativePath(manifest, relativePath)`; main CLI con import
  guard, streaming stdin sotto `run-as`, `mv` e cleanup solo sui due path
  allowlisted;
- `mobile/android/app/src/androidTest/java/ai/talos/TalosLlamaEngineDeviceTest.java`:
  metodo pubblico esistente
  `appliesEmbeddedTemplateAndGeneratesAVisibleReply()`; argomenti
  `talosModelPath`, `talosExpectedBytes`, `talosExpectedSha256`, `talosCaseId` e
  helper privato `sha256(File)`;
- `mobile/tests/unit/models/localModelCompatibilityManifest.test.ts`: scenari
  di ordine e path traversal già RED.

RED aggiuntivo atteso: il runner non esiste e il device test non confronta
ancora byte/SHA. GREEN: nessun `adb push` in `Android/data`, nessuna seconda
copia device, integrity check prima dell'open, move atomico soltanto dopo PASS e
cleanup nominativo in `finally`. Rollback: rimuovere runner/argomenti insieme;
non ripristinare lo staging shell che ha già fallito fisicamente.

RED osservato il 2026-08-05 alle 18:35 Europe/Rome: il gate mirato contiene 5
scenari, 3 regressioni verdi e 2 failure esatte: modulo runner assente e
`talosExpectedBytes` assente dal device test. Nessun altro errore è stato contato
come RED.

### C45-RED-18A — discovery path separata dall'ownership

Il dry-run `--cleanup-only` sul device reale ha fallito prima di qualsiasi write:
`run-as ai.talos.dev readlink -f ...` termina 1 senza output, mentre `run-as id`
è verde. La risoluzione read-only del symlink non richiede l'UID app; soltanto le
mutazioni lo richiedono. Test permanente in
`localModelCompatibilityManifest.test.ts`: il runner usa `adb shell readlink
-f` solo per scoprire/validare la root. Il tentativo successivo ha provato che
anche `run-as rm -f` riceve `Permission denied` su quel mount pur quando il path
non esiste; la premessa "run-as sulle mutazioni esterne" è pertanto invalidata,
non implementata.

### C45-RED-18B — stream e cleanup dal vero processo target

Fonti: man page AOSP `adb reverse` e Android app-specific storage. File/simboli:

- runner: server loopback effimero, reverse TCP nominativa, rimozione esatta in
  `finally`; nessun nuovo export pubblico;
- `TalosLlamaEngineDeviceTest`: metodo pubblico esistente
  `appliesEmbeddedTemplateAndGeneratesAVisibleReply()` esteso con
  `talosHostPort` e proiezione atomica; nuovo metodo pubblico test-only
  `cleansCompatibilityCampaignFiles()`; helper privati
  `receiveFixtureFromHost(...)`, `compatibilityNativeFile(...)`,
  `compatibilityUiFile(...)`, `deleteIfPresent(...)`;
- test statico permanente: reverse presente, `run-as` assente dalle mutazioni,
  cleanup instrumentation presente.

RED: dry-run fallisce su `run-as rm`; il runner non contiene reverse e il device
test non contiene socket/cleanup. GREEN: una sola copia scritta dal target,
reverse rimossa, zero file dopo cleanup fisico.

### C45-RED-18C — selettore modello nei due stati del composer

C1 ha completato hash, reverse, integrity check e gate nativo, poi il runner ha
atteso per 30 secondi `talos-composer-model-chip`: nello stato compatto quel chip
non è montato e il controllo equivalente è l'icon button. Il contratto comune
già presente e coerente con WAI-ARIA è `button[aria-haspopup="dialog"]`; il
runner deve cercarlo dentro il composer, mentre il chip resta soltanto una prova
secondaria quando esiste. Test statico permanente nel manifest test. Il
`finally` reale ha lasciato zero fixture host/device e zero reverse.

Ispezione DOM fisica successiva: a prompt vuoto il composer monta soltanto
`Aggiungi alla chat` e `Detta`; dopo input reale monta il chip modello con
`aria-haspopup="dialog"`. Il flusso umano corretto del runner è quindi
scrivere il prompt, attendere l'espansione, scegliere il modello e inviare. Il
test permanente vincola anche quest'ordine, non soltanto il selettore.

### C45-RED-18D — evidenza per caso in una chat pulita

Il primo screenshot C1 originale-pixel mostra correttamente prompt, risposta e
label `talos-compat`, ma contiene sopra il vecchio errore azionabile della prova
precedente. L'immagine è quindi rifiutata come evidenza finale, pur senza difetti
del prodotto. Prima di ogni caso il runner deve premere il vero
`talos-chats-new` nella sidebar tablet; su viewport senza sidebar deve aprire
`/chats` e premere lo stesso controllo. Solo dopo crea prompt/selezione/invio.
Test statico permanente vincola l'ordine. C1 va ricatturato e reispezionato.

### Emendamento D4 — fixture dopo cancellazione owner

Il target originario Qwen3.5 4B non è più disponibile perché l'owner ha
eliminato personalmente tutti i GGUF. La cancellazione non è una regressione e
non autorizza il ripristino del file. D4 usa C2
`Qwen/Qwen3-0.6B-GGUF@23749fefcc72300e3a2ad315e1317431b06b590a`, con byte e
SHA già congelati nella ricerca, per riprodurre fisicamente la classe di guasto
16384→open failure e provarne il recupero a 4096. Cleanup limitato ai due
namespace campagna esatti; baseline finale ancora zero modelli.

### C45-RED-20 — startup boundary

Test: `initialChunkContract.test.ts` + build.
RED: un import eager del popover/store porta Model Lab/transfer nel first graph
già a 599981 byte.
GREEN: trigger/Popover/store restano dynamic e JS ≤600000 senza alzare tetto.
Il gate include anche `TalosMobileChatOptionsMenu.vue`: una regressione eager
deve fallire con `TALOS_CHAT_OPTIONS_NOT_LAZY`.

### C45-RED-21 — Theme Engine

Test: `modelLabThemeTokenContract.test.ts`.
RED: trigger/righe/detail non sono tutti inclusi nel gate.
GREEN: tutte le surface toccate sono scansionate e zero shortcut visuali.

## 5. Cicli TDD focalizzati

I comandi vengono eseguiti dal folder `mobile` salvo indicazione.

### Slice A

```text
rtk npx vitest run tests/unit/settings/settingsGroups.test.ts tests/unit/settings/settingsTabs.test.ts tests/unit/settings/TalosMobileSettingsCenter.test.ts
rtk npx playwright test tests/e2e/mobile-settings-parity.e2e.spec.ts tests/e2e/mobile-model-lab-navigation.e2e.spec.ts --workers=1
```

RED eseguito 2026-08-05 11:36 Europe/Rome:

- comando Vitest focalizzato sopra: exit 1 come atteso;
- 7 failure mirate: tre sui registry/gruppi, quattro sul componente;
- C45-RED-01 prova che `models` manca da Intelligence e segue il link isolato;
- C45-RED-02 prova che il tablet usa ancora `tablist`, roving tabindex e frecce;
- gli altri 19 test del componente restano verdi, quindi non emerge una
  regressione estranea prima del GREEN.

GREEN eseguito 2026-08-05:

- stesso comando Vitest focalizzato: 3 file, 26/26 test verdi;
- E2E desiderato eseguito contro il precedente `dist`: 2 failure mirate su
  link isolato e semantica tab tablet; il precedente 12/12 sul vecchio bundle
  è stato esplicitamente scartato come evidenza stale;
- `rtk npm run build`: GREEN, inclusi typecheck, parity e startup budget
  599981/600000 byte JS, 205108/220000 byte CSS;
- E2E dopo rebuild: 12/12 verdi su telefono e tablet;
- `rtk npx cap sync android`: GREEN e nessun path Android tracciato inatteso;
- Gradle `testDebugUnitTest assembleDebug -PtalosSideBySide`: GREEN,
  591 task, APK SHA-256
  `d4b74953546ea11afae91f4d6571b2ca0a39705e8915c31a9f01d86694a75d77`;
- installazione fisica `ai.talos.dev`: GREEN;
- prove original-pixel ispezionate:
  `../evidence/model-lab/corrective/settings-intelligence-tablet.png` e
  `../evidence/model-lab/corrective/settings-intelligence-phone.png`;
- ordine DOM in entrambe: `account → models → ai_defaults → agent_tools`;
  zero settings tab role e zero overflow; link Model Lab aperto realmente e
  Back verificato;
- override telefono ripristinato a 2400×3392/density 420, DOM account
  ripristinato e forward task-owned `tcp:9222` rimosso; `tcp:9223` preservato;
- manifest: `../evidence/model-lab/corrective/manifest.md`.

Review read-only conclusa dopo il primo gate fisico: **WITH FIXES**, tre
Important e nessun Critical. La Slice A è stata riaperta prima di iniziare B.
I due PNG e l'APK sopra sono baseline pre-fix e verranno sostituiti/hashati di
nuovo dopo C45-RED-01A/02A/02B; non sono prova finale della Slice A finché il
secondo gate fisico non è verde.

Fix review verificato automaticamente il 2026-08-05:

- C45-RED-01A: RED 2/22 come registrato sopra, quindi GREEN 22/22;
- regressione Settings + Theme Engine: 4 file e 29/29 test verdi;
- C45-RED-02A/02B: Chromium reale 13/13, inclusi focus Account → Model Lab →
  AI Defaults → Agent Tools, attivazione con Enter e pane tablet misurate
  orizzontalmente adiacenti con `region` e zero `tabpanel`;
- build completa GREEN; startup 599981/600000 byte JS e 205142/220000 byte CSS;
- secondo build/install/gate screenshot fisico: GREEN;
- APK finale post-review: 30574433 byte, SHA-256
  `7477f92d913f29bae3c8db27aa5970c9a9123f47ef7d1e1d5ea78181c32db588`;
- tablet finale: 2400×3392, SHA-256
  `69a20ba054c9da2477dc143a9e60af5a0867123db064714c9832f6d7c14e82b4`;
- telefono finale: 1080×2376, SHA-256
  `c4e83de1d7fd486c6e871071a79c6e3aeab1ded766c7e7353521109fb9d14b57`;
- entrambi i PNG sono stati ispezionati a pixel originali; route Model Lab e
  Back sono stati azionati sul dispositivo, il nome locale è stato mascherato
  soltanto nel DOM e il ripristino è stato provato senza loggarne il valore;
- stato finale dispositivo: 2400×3392/density 420, `tcp:9222` rimosso e
  `tcp:9223` preservato. La Slice A può procedere alla Slice B.

### Slice B

```text
rtk npx vitest run tests/unit/services/modelTransfer.test.ts tests/unit/stores/modelTransfers.test.ts tests/unit/stores/localModels.test.ts tests/unit/shell/TalosMobileDownloadCenterTrigger.test.ts tests/unit/shell/downloadCenterReachability.test.ts tests/unit/models/modelTools.test.ts
rtk proxy .\gradlew.bat :app:testDebugUnitTest --tests ai.talos.TalosTransferJournalTest --tests ai.talos.TalosTransferSessionTest --rerun-tasks --no-daemon --console=plain
```

RED B1 service/store osservato il 2026-08-05:

```text
rtk npx vitest run tests/unit/services/modelTransfer.test.ts tests/unit/stores/modelTransfers.test.ts
Test Files  2 failed (2)
Tests       8 failed | 6 passed (14)
```

I quattro failure service provano status canonico/metadati assenti, perdita
dell'ultimo snapshot su bridge failure e API pause/resume/cancel mancanti. I
quattro failure store sono tutti `modelTransfers` inesistente. Nessun failure
estraneo: start/refusal/leftovers/discard preesistenti restano verdi.

RED B1 compatibilità `localModels` osservato subito dopo: 1 failure mirata e
15/16 verdi; il resume chiama ancora una seconda volta `start(request)` invece
di delegare al journal nativo. Il nuovo contratto pretende un solo start e una
chiamata `resume()` senza copia JS della request.

RED B2 native osservato dopo la correzione del test harness: Gradle fallisce in
compilazione con 29 errori, tutti e soli sui simboli pianificati mancanti
`TalosTransferJournal`, `StopCause`, `Completion`, `stopCause()` e
`progressFromDisk(...)`. Nessun errore resta nel codice del test né nei test
nativi preesistenti.

Emendamento B5, scoperta durante il primo E2E (2026-08-05): il percorso
`CapacitorCustomPlatform = android` rendeva indisponibile il main thread perché
trascinava l'intero bootstrap web nei rami SQLite/lifecycle/framing nativi. Il
timeout del click non è quindi un difetto di actionability del trigger e non va
aggirato con `force: true`.

Inventario esatto emendato prima del GREEN:

- modificare `mobile/src/services/modelTransfer.ts`, funzione pubblica
  `talosTransfersAreSupported()`: capability check ufficiale
  `Capacitor.isPluginAvailable('TalosModelTransfer')`;
- modificare `mobile/tests/unit/services/modelTransfer.test.ts`: mock
  `isPluginAvailable`, scenario permanente `B5-RED-PLUGIN-01` “container nativo
  senza classe registrata = unsupported”;
- modificare
  `mobile/tests/e2e/mobile-model-download-center.e2e.spec.ts`: bridge ristretto
  al solo `PluginHeader/nativePromise` TALOS; rimuovere custom platform e ogni
  diagnostica temporanea; mantenere pause → reload → resume → cancel e i cinque
  punti di accesso.

RED atteso: prima della fix `B5-RED-PLUGIN-01` chiama ancora `start()` perché il
solo `isNativePlatform()` vale true. GREEN focalizzato: unit service/store e il
singolo E2E senza dipendenze; regressione: intero file E2E con setup, suite B
focalizzata, typecheck/build. Upstream: **ADOPT DIRECTLY** Capacitor 8.4.2
`isPluginAvailable`, fonte e pin nel dossier §12. Prova umana e rollback restano
quelli della Slice B; nessun file prodotto ulteriore.

Emendamento target fisico B5 prima del download: il target 360M pianificato è
già uno dei quattro GGUF owner e viene escluso. Il trasferimento temporaneo usa
soltanto `unsloth/SmolLM2-135M-Instruct-GGUF` revision
`9e6855bc4be717fca1ef21360a1db4b29d5c559a`, file
`SmolLM2-135M-Instruct-Q2_K.gguf`, `88201792` byte, SHA-256 LFS
`c53fe6626c7165ebfd8de5db22edc3f719b813da001e662bc5cb453f2540a076`.
Motivo e fonte primaria sono nel dossier §12. Il cancel deve lasciare quattro
modelli installati e zero slot/sidecar/journal appartenenti esclusivamente al
135M; nessuna pulizia per glob è ammessa.

Emendamento B5 dopo la prima prova fisica: il Q2_K ha completato realmente ma
troppo rapidamente per rendere osservabile `paused`; TALOS lo ha rimosso dal
dialogo nominativo e la scansione è tornata esattamente ai quattro file owner.
Il gate lifecycle viene quindi ripetuto con l'unico target temporaneo
`SmolLM2-135M-Instruct-F16.gguf`, stessa repo/revision, `270885952` byte, LFS
SHA-256 `5157ca60744d21631818364854ac8e4452e1b8022d2ab4c8a2f9cda2344afb30`.
La pausa deve essere richiesta nello stesso flusso fisico dell'avvio; seguono
screenshot paused, process death, verifica journal ripristinato, resume,
secondo process death durante running, rilancio e cancel nominativo. Il
post-gate resta: stato idle, esattamente quattro GGUF owner e nessun artefatto
F16. Nessuna pulizia per glob è ammessa.

Emendamento B6 multi-transfer, precedente ai nuovi RED: l'owner ha scelto due
worker attivi e coda durevole. La prova fisica usa soltanto i due target pin del
dossier §13: SmolLM2 135M F16 (`270885952`, SHA
`5157ca60744d21631818364854ac8e4452e1b8022d2ab4c8a2f9cda2344afb30`)
e LFM2 350M Q4_K_M (`229309376`, SHA
`a4d000c7064bd3b2e42c6845836286a899a4e79cf1791da1a6797b58d575957d`).
Entrambi vengono prima messi in pausa, poi ripresi dallo stesso Download Center
per rendere osservabile la simultaneità senza throttling artificiale. Pausare il
primo deve lasciare il secondo `running`; cancel e cleanup sono per ID/path.

Correzione baseline successiva dell'owner: tutti i GGUF presenti sono stati
cancellati manualmente dall'owner. Il precedente conteggio quattro resta fatto
storico della prima prova, ma non è più un postcondizione corrente. Prima del
nuovo gate si registra l'inventario reale (atteso zero dopo scansione valida), e
dopo il gate devono restare zero target temporanei; l'assenza dei vecchi file
non è classificata come bug TALOS.

Comandi RED/GREEN aggiuntivi Slice B:

```text
rtk proxy .\gradlew.bat :app:testDebugUnitTest --tests ai.talos.TalosTransferJournalTest --tests ai.talos.TalosTransferSessionTest --tests ai.talos.TalosTransferDispatcherTest --tests ai.talos.TalosStorageReservationTest --rerun-tasks --no-daemon --console=plain
rtk npx vitest run tests/unit/services/modelTransfer.test.ts tests/unit/stores/modelTransfers.test.ts tests/unit/stores/localModels.test.ts tests/unit/shell/TalosMobileDownloadCenterTrigger.test.ts tests/unit/android/transferJobPermissions.test.ts
rtk npx playwright test tests/e2e/mobile-model-download-center.e2e.spec.ts --workers=1
```

RED atteso: simboli schema 2/dispatcher/ID/items assenti; singleton nativo e UI
globale falliscono esclusivamente gli scenari 08A–08F. GREEN focalizzato: tutti
i comandi sopra; regressione: intera Slice B, typecheck/build/JVM completa.
Prova umana: `download-center-two-active.png`, screenshot post-restart e
manifest original-pixel. Rollback: reverse patch congiunta di registro,
dispatcher, session, host, bridge/store/UI; non è valido ripristinare soltanto
la proiezione UI lasciando schema 2 o più job attivi.

### Slice C

```text
rtk npx vitest run tests/unit/components/localModelsSection.test.ts tests/unit/models/TalosMobileLocalModelRow.test.ts tests/unit/models/TalosMobileLocalRepoDetail.test.ts tests/unit/theme/modelLabThemeTokenContract.test.ts tests/unit/tools/toolLabels.test.ts tests/unit/chat/streamingUi.test.ts
rtk npx playwright test tests/e2e/mobile-model-lab-filters.e2e.spec.ts tests/e2e/mobile-model-lab-coherence.e2e.spec.ts --workers=1
```

RED eseguito il 2026-08-05 16:52 Europe/Rome, dopo la chiusura dell'addendum
primario §9 del dossier e prima di modificare prodotto:

- 7 file focalizzati eseguiti, 102 test totali;
- **15 failure mirate e 87 test preesistenti verdi**;
- `C45-RED-09A`: toggle/panel HF assenti;
- `C45-RED-09B`: boundary route Model Lab assente;
- `C45-RED-09C`: sezione/empty card ancora emessi a zero e failure letta come
  zero;
- `C45-RED-09D`: `memory_write` manca da label, key, icon, consent e riga chat;
- `C45-RED-10/11`: rail ancora `flex-wrap`, senza overflow orizzontale;
- `C45-RED-12`: installati ancora card separate;
- `C45-RED-13`: repository ancora card separate e metadata su più righe;
- `C45-RED-14`: varianti ancora card con due azioni full-width e nessuna
  disclosure per diagnostica secondaria.

Comando reale esteso anche a HF e shell:

```text
rtk npx vitest run tests/unit/models/TalosMobileHuggingFaceAccessCard.test.ts tests/unit/shell/appShell.test.ts tests/unit/components/localModelsSection.test.ts tests/unit/models/TalosMobileLocalModelRow.test.ts tests/unit/models/TalosMobileLocalRepoDetail.test.ts tests/unit/tools/toolLabels.test.ts tests/unit/chat/streamingUi.test.ts
```

### Slice D/E

```text
rtk npx vitest run tests/unit/models/localContextPolicy.test.ts tests/unit/services/localEngine.test.ts tests/unit/chat/localAdapter.test.ts tests/unit/models/localModelCompatibilityManifest.test.ts
rtk proxy .\gradlew.bat :app:testDebugUnitTest --tests ai.talos.TalosLlamaOpenFailureTest --rerun-tasks --no-daemon --console=plain
rtk npm run test:local-models:device
```

Il Gradle workdir è `mobile/android`; il runner riceve seriale/package e non
assume un device generico.

## 6. Suite di regressione interessate

- unit completa `rtk npm run test:unit`;
- `rtk npm run typecheck`;
- Model Lab navigation/parity/filter/coherence;
- settings parity, shell, chat streaming/local provider;
- i18n structural/localization coverage;
- theme token boundary;
- initial chunk contract;
- HF integration opt-in su revision pin;
- `rtk npm run build` (include parity e chunk);
- `rtk npx cap sync android`;
- JVM Android completa;
- assemble side-by-side;
- instrumentation fisica.

## 7. Gate upstream reale

1. Reka UI resta 2.10.1/tag SHA dichiarato; nessun package install.
2. UIDT viene provato su API 36 reale, inclusi pause e process recreation.
3. HF usa revision e SHA della matrice, non `main`.
4. llama.cpp resta `de699957...`/b10218 finché una failure fisica non prova la
   necessità di un upgrade.
5. Ogni upgrade eventuale richiede emendamento, commit upstream esatto,
   licenza, CVE/compatibilità, build e riesecuzione di tutti i casi precedenti.

## 8. Prova umana obbligatoria

Il manifest `corrective/manifest.md` deve contenere per ogni PNG:

- HEAD e dirty paths;
- APK SHA-256;
- seriale/model/API;
- pixel/viewport/DPR;
- theme/mode/density/radius/reduced motion;
- route e interazione;
- timestamp UTC e SHA-256 PNG;
- metriche DOM/overflow/touch target;
- PII/token audit;
- `Defects: none` oppure difetto nominato che riapre il RED.

Per il Download Center almeno uno screenshot deve provenire da un trasferimento
HF vero; uno stato iniettato da DevTools non chiude il gate funzionale.

## 9. Rollback

Non esiste un commit di fase su cui fare reset. Il rollback è una reverse patch
file-per-file, limitata ai file inventariati:

1. rimuovere trigger e store nuovi;
2. ripristinare wrapper trasferimento precedenti soltanto se journal/plugin sono
   ripristinati nello stesso rollback;
3. ripristinare la policy contesto precedente soltanto con il relativo adapter;
4. rimuovere harness/evidenze create da questa tranche;
5. rieseguire Settings, shell, Model Lab, chat locale, build e Android.

Non si usa `git reset --hard`, `git checkout --`, stash o cancellazione
ricorsiva. I dati sul device vengono eliminati soltanto dal namespace esatto
`files/talos-compat`; i quattro modelli owner restano intatti.

## 10. Condizione di chiusura

La tranche è `IMPLEMENTED` soltanto con C45-RED-01…21 verdi, suite e upstream
verdi, build entro budget, APK corrente installata, screenshot fisici
ispezionati e campagna sequenziale riportata. La Fase 5 resta deferred e richiede
una decisione owner separata.

## 11. Emendamento review C — descrizione tool pubblica multi-download

### C45-RED-08K — i dialetti provider registrano consapevolmente il nuovo limite

File esatti:

- `src/lib/models/modelTools.ts`: `createTalosLocalModelTools`; il nome
  `local_model_download`, lo schema input, le azioni e la conferma restano
  compatibili; cambia soltanto la descrizione inviata al modello;
- `tests/unit/models/modelTools.test.ts`: scenario
  `C45-RED-08H names the two active slots and durable queue honestly`;
- `tests/unit/tools/toolControls.test.ts`: scenario esistente
  `P1-CTX-COMPAT-09 keeps every pre-existing public tool contract byte-compatible`
  con digest distinti Anthropic/OpenAI/Gemini e nota di ripin consapevole;
- `docs/superpowers/research/2026-08-05-model-lab-corrective-tranche-research.md`:
  addendum fonti e decisione upstream;
- `docs/superpowers/ledgers/2026-08-05-model-lab-corrective-tranche-ledger.md`:
  questo scenario permanente.

Nessun file viene creato o eliminato e nessun simbolo pubblico viene aggiunto.
RED osservato nella suite completa: il digest Anthropic atteso
`84f55d…d4b` diventa `a72503…484` dopo la descrizione veritiera; gli altri
dialetti restano da misurare nello stesso gate. Aggiornare alla cieca l'hash o
ripristinare la descrizione falsa non è GREEN.

GREEN: i tre digest vengono ricalcolati e fissati separatamente soltanto dopo
aver provato che il control plane (`name`, `title`, azioni), gli input schema e
il comportamento legacy `downloading` restano compatibili. Comandi focalizzati:
`npm exec vitest -- run tests/unit/tools/toolControls.test.ts
tests/unit/models/modelTools.test.ts`, poi `npm run test:unit` e `npm run build`.
Rollback: ripristinare insieme descrizione e tre digest; non toccare il motore
nativo, la coda o i dati sul dispositivo.

## 12. Chiusura esecutiva Slice B — 2026-08-05

Verdetto: **CLOSED — GREEN AUTOMATION + GREEN DEVICE**. Questo verdetto chiude
soltanto C45-RED-03…09 e 20/21 per il perimetro Download Center. Non promuove
C45-RED-09A…19, che restano nelle Slice C–E.

### 12.1 Implementazione effettiva

- journal nativo atomico schema 2 con migrazione v1, record multipli, ID e job
  ID persistiti, timestamp non decrescenti e validazione fail-closed;
- `TalosTransferDispatcher.MAX_ACTIVE_TRANSFERS = 2`, terzo e successivi in
  `waiting`, promozione FIFO e riconciliazione degli host orphan;
- sessioni, worker, stop cause, notifiche, azioni e cleanup confinati per ID;
- riserva storage serializzata per l'intero set prima del primo byte;
- bridge TypeScript collection-first con proiezione legacy non ambigua;
- store globale con observer ref-counted e azioni pause/resume/cancel per ID;
- `TalosMobileDownloadCenterTrigger` lazy in chat, immersive chrome, drawer,
  tool sheet e sidebar tablet, con `ul/li`, badge, stato e conferma nominativa;
- pagine Model Lab senza poller o seconda autorità di trasferimento;
- descrizione tool veritiera: massimo due attivi e coda durevole; digest
  Anthropic/OpenAI/Gemini ripinnati soltanto dopo la prova di compatibilità.

### 12.2 Gate automatici consolidati

- focused TypeScript Slice B: **95/95 PASS** durante il ciclo integrato;
- Android static contract: **10/10 PASS**;
- focused JVM journal/session/dispatcher/storage, incluso orphan recovery:
  **PASS**;
- full JVM `:app:testDebugUnitTest`: **PASS**;
- full TypeScript: **411 file passati, 3 skipped; 3659 test passati,
  10 skipped**;
- typecheck: **PASS**;
- build/parity: **PASS**, 3419 moduli, JavaScript iniziale
  `590449/600000`, CSS `205811/220000`, parity `9/9`;
- E2E Download Center sul bundle ricostruito: **5/5 PASS**;
- Capacitor sync e assemble side-by-side: **PASS**;
- rerun finale 2026-08-05 16:44 Europe/Rome: focused TypeScript **73/73
  PASS**; focused JVM quattro classi **BUILD SUCCESSFUL**, 264 task.

### 12.3 Gate fisico reale

Device `2ea6573c`, OnePlus OPD2415, Android 16/API 36. APK installata in-place
con `adb install -r -g`: `firstInstallTime` è rimasto
`2026-08-01 23:02:40`; `lastUpdateTime=2026-08-05 15:10:15`. Nessun uninstall,
`pm clear` o modifica al package `ai.talos`.

Target pin:

1. `unsloth/SmolLM2-135M-Instruct-GGUF@9e6855bc4be717fca1ef21360a1db4b29d5c559a` /
   `SmolLM2-135M-Instruct-F16.gguf`, `270885952` byte, SHA-256
   `5157ca60744d21631818364854ac8e4452e1b8022d2ab4c8a2f9cda2344afb30`;
2. `LiquidAI/LFM2-350M-GGUF@8fdc9d526b7ed346b19257551b05816c7912ecc2` /
   `LFM2-350M-Q4_K_M.gguf`, `229309376` byte, SHA-256
   `a4d000c7064bd3b2e42c6845836286a899a4e79cf1791da1a6797b58d575957d`;
3. target più lungo della sola evidenza chrome, stessa repo/revision:
   `LFM2-350M-F16.gguf`, `711482304` byte, SHA-256
   `379ffdcbf08147c0313f6f1ce7ff558a2bc935eda633f4b46c52347032419c42`;
   decisione e fonte primaria nel dossier §17.

Esiti:

- due job simultanei reali con ID 118555 e 676558: **PASS**;
- pausa del primo senza fermare il secondo: **PASS**;
- cancel LFM2 confinato mentre SmolLM2 avanzava 16→32 MB: **PASS**;
- process death del solo PID app e ricostruzione JobScheduler fino al GGUF
  finale: **PASS**;
- terzo record `waiting` e promozione FIFO: **PASS automatizzato**;
- trigger globale raggiungibile in Model Lab, chat, drawer e tablet: **PASS**;
- cleanup nominativo: **PASS**, zero GGUF, `.part`, `.talosdl`, journal o righe
  residue della campagna; la baseline zero deriva dalla cancellazione manuale
  precedente dell'owner e non è un difetto TALOS;
- geometria finale: **PASS**, 2400×3392/density 420,
  viewport 914×1292/DPR 2.625;
- account development temporaneamente anonimizzato e poi ripristinato via UI:
  **PASS**; nessun dato identificativo è entrato nelle evidenze tracciate.

Sei screenshot finali original-pixel, tutti ispezionati e hashati:

- `download-center-tablet.png` —
  `a802fc8b68439fbc159232aaf5e4e05a990e6b2d479029b281e3f7e6c313e393`;
- `download-center-two-active.png` —
  `3b0b94cf37eaf9e9a4e80f715103b594a22d00301d9e9df96641c0518387fc0d`;
- `download-model-lab-running.png` —
  `ecb7133d3606bff40596c0a7c48b9cade71d557871e630248e60efcdc5b01b29`;
- `download-chat-running.png` —
  `cb7e1c944a5e6ddabe77f5eb9f988b85ef03c863b0eb7d04e7a6cad0f7017e49`;
- `download-drawer-running.png` —
  `6314ce2ae6ffde765bb47b399908c56f4d07d775ea8aa303aa68b9a8bcbf8ada`;
- `download-center-paused.png` —
  `b1000be7ac34f1f7028e955bd4d24a25fb08e37b0af4db842ea8f0ab30ae6013`.

Il manifest completo resta
`../evidence/model-lab/corrective/manifest.md`. Il difetto visivo delle card
repository/varianti troppo alte è stato osservato e resta il caso già aperto
`C45-RED-14`; non invalida il componente Download Center.

### 12.4 APK consegnata

- build verificata:
  `android/app/build/outputs/apk/debug/app-debug.apk`;
- byte: `30388012`;
- build UTC: `2026-08-05T13:05:28.3537247Z`;
- SHA-256:
  `4226ab4ee32c1ff3ec34ea050ee9f6be67eb9803e36f2a34aa61d41abd3f3811`;
- copia Desktop richiesta dall'owner, creata senza sovrascrivere:
  `C:\Users\Antonino\Desktop\TALOS-mobile-corrective-slice-b-verified-2026-08-05-4226ab4e.apk`;
- copia creata UTC: `2026-08-05T14:45:29Z`; byte e SHA identici alla build.

### 12.5 Stato successivo obbligatorio

La tranche resta **IN PROGRESS**. La prossima slice è C, iniziando dai RED
`C45-RED-09A`, `09B`, `09C`, `09D`, `10`, `11`, `12`, `13`, `14` e `15`.
Seguono D ed E per il bug `TALOS_LLAMA_OPEN_FAILED` e la matrice Hugging Face
sequenziale, un solo modello temporaneo per volta. OAuth resta `DEFERRED` fino
al dominio e a una nuova decisione esplicita dell'owner. Prima dello stress
test finale servono il batch di reviewer per funzione e poi l'esplorazione
umana completa sul device, un agente alla volta, come congelato nel piano
master.

### C45-RED-18E — C1 anglofono e rifiuto dell'eco del contesto

Scoperta fisica: il secondo screenshot C1 è geometricamente corretto e parte da
una chat nuova, ma la risposta mostra `TALOS_MEMORY_CONTEXT`, `MEMORY 1` e dati
del wrapper memoria. L'immagine non è accettata come prova. Il report macchina
conserva la risposta osservata; cleanup host/device e reverse sono GREEN.

Diagnosi upstream congelata nel dossier §22: `nativeGenerate` accumula soltanto
token nuovi; template ChatML e generation marker coincidono con la fonte
Hugging Face; `llama-cli b10218-de699957b` sul medesimo GGUF/hash riproduce
instabilità italiana e risposte pulite in inglese. Classificazione: limite
qualitativo/linguistico del 360M, non difetto del motore e non autorizzazione a
filtrare il testo in produzione.

File inventory prima dell'edit:

- `mobile/tests/fixtures/local-model-compatibility.json`: modifica, aggiunge il
  solo campo pubblico dati `cases[0].prompt`;
- `mobile/scripts/run-local-model-compatibility.mjs`: modifica interna, usa
  `entry.prompt` con fallback comune e rifiuta i tre marker interni; nessun nuovo
  export;
- `mobile/tests/unit/models/localModelCompatibilityManifest.test.ts`: modifica,
  scenario permanente e tipo test-only aggiornato;
- dossier/plan/spec/ledger correnti: modifica documentale.

RED nominato: `C45-RED-18E` fallisce perché C1 non dichiara un prompt inglese,
il runner costruisce sempre il task italiano e non contiene una guardia contro
l'eco del wrapper. GREEN focalizzato: il singolo file Vitest; regressione:
intero test manifest/runner e poi matrice fisica C1. Real-upstream gate: comando
ufficiale `llama-cli b10218` sul pin/hash C1. Prova umana: nuovo screenshot ADB
original-pixel privo dei marker, con modello locale e reply visibili. Rollback:
rimuovere campo prompt e guardia harness; nessun rollback prodotto perché il
prodotto non cambia.

### C45-RED-18F — identity line copiata da C1

Il rerun C1 successivo a `18E` è PASS meccanico, ma l'ispezione originale-pixel
ha rifiutato anche questa evidenza: il 360M non copia più il wrapper memoria,
ma recita la identity line del system prompt. SHA screenshot
`8568a0682c89e4a058835155f420d4ea7dd55005dfc54721e0da68f24e54f3b7`;
cleanup device/reverse GREEN. Il report PASS è provvisorio e non chiude C1.

File inventory prima dell'edit:

- `mobile/src/lib/tone.ts`: modifica di `buildTalosSystemPrompt`, nessuna firma
  o export nuovo; ramo compatto solo provider `local`;
- `mobile/tests/unit/lib/tone.test.ts`: modifica, nuovo scenario permanente;
- `mobile/scripts/run-local-model-compatibility.mjs`: modifica della sola lista
  marker vietati all'evidenza;
- `mobile/tests/unit/models/localModelCompatibilityManifest.test.ts`: modifica
  della guardia statica;
- dossier/plan/spec/ledger correnti: modifica documentale.

RED atteso: il prompt locale corrente supera 600 caratteri, contiene
`The user's selected tone preset` e non contiene il divieto esplicito di eco;
il runner non rifiuta `When asked who you are`. GREEN focalizzato: tone e
manifest runner. Regressione: typecheck, build e suite chat interessata.
Real-upstream gate: model card SmolLM2 e `llama-cli b10218` già congelati nel
dossier §§22–23. Prova umana: C1 completo sulla build aggiornata, screenshot
ADB originale-pixel. Rollback: rimuovere il ramo provider locale e i marker
harness; provider remoti restano invariati in entrambi i versi.

GREEN `C45-RED-18F`:

- focused tone + manifest runner: **23/23 PASS**;
- regressione tone/local adapter/chat controller/runner: **97/97 PASS**;
- typecheck: **PASS**;
- build/parity: **PASS**, startup JS `592951/600000`, CSS
  `206926/220000`;
- Gradle side-by-side: **BUILD SUCCESSFUL**, 365 task;
- update fisico `adb install -r -g`: **PASS**; `firstInstallTime` invariato
  `2026-08-01 23:02:40`, `lastUpdateTime=2026-08-05 19:12:06`;
- C1 completo: hash/byte, reverse stream, integrity device, open/template/token,
  picker/adapter/chat e cleanup **PASS**;
- screenshot accettato
  `../evidence/model-lab/corrective/local-compat-smollm2-chat.png`, `264222`
  byte, SHA-256
  `6ad87c982f0321570270214c705d96e9a35531184816589a754021fe649b3c96`;
- ispezione originale-pixel 2400×3392: reply soltanto `"TALOS"`, modello
  `talos-compat` visibile, nessun marker interno, clipping, overflow,
  sovrapposizione o controllo irraggiungibile; composer e safe area integri;
- postcondizione: zero reverse e zero `talos-compat.gguf` sul device.

C1 è quindi **GREEN DEVICE + VISUAL ACCEPTED**. Le due immagini precedenti
restano prove diagnostiche sostituite dai rispettivi hash nel ledger e non sono
evidenza finale. Si può avanzare a C2; nessun altro caso è implicato da questo
PASS.

### C45-RED-18G — C2 abortisce su grammatica tool auto-generata

RED fisico già provato sul caso C2 esatto:

- pin `Qwen/Qwen3-0.6B-GGUF@23749fefcc72300e3a2ad315e1317431b06b590a`,
  `Qwen3-0.6B-Q8_0.gguf`, `639446688` byte, SHA-256
  `9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031`;
- stream host→processo target, integrità, open, template e generazione nativa
  **PASS**; il file è stato proiettato una sola volta alla UI;
- chat reale **FAIL** alle `2026-08-05 19:14:41 +02:00`; il report conserva
  `page.waitForFunction: Target page, context or browser has been closed`;
- `ApplicationExitInfo`: PID `17956`, reason `APP CRASH(NATIVE)`, status `6`;
- tombstone: `SIGABRT`, `std::runtime_error: failed to parse grammar`, frame
  `common_sampler_init` → `nativeApplyChatTemplate` → `chatPrompt`;
- cleanup del runner **PASS**: zero reverse, zero `talos-compat.gguf`; C3 non è
  stato avviato.

La causa è deterministica nel confine: `applyGrammar` controlla `nullptr`, ma
llama.cpp `b10218/de699957b` lancia. Il server ufficiale del medesimo pin cattura
la stessa eccezione; l'issue upstream aperto #25967 prova inoltre che liste
ampie di tool possono generare GBNF invalido. Decisione completa nel dossier
§24: **ADAPT**, nessun upgrade del submodule.

File inventory prima dell'edit di comportamento:

- `mobile/android/app/src/main/cpp/talos_llama_jni.cpp`: modifica della sola
  funzione privata `applyGrammar(talos_session *)`; nessuna firma o export JNI
  cambia;
- `mobile/tests/unit/android/llamaGrammarFailureBoundary.test.ts`: nuovo RED
  statico permanente sul doppio confine e sul fallback senza grammatica;
- dossier/plan/spec/ledger correnti: modifica documentale;
- `mobile/docs/superpowers/evidence/model-lab/corrective/local-compat-qwen-c2-native-crash.txt`:
  nuova prova diagnostica testuale priva di prompt/schema;
- al GREEN fisico, il runner aggiornerà il report esistente e creerà
  `local-compat-qwen3-chat.png`.

RED nominato: `C45-RED-18G` fallisce perché nel corpo di `applyGrammar` non
esiste alcun `catch`, quindi l'eccezione upstream attraversa JNI. GREEN
focalizzato: il nuovo Vitest e compilazione C++ Android. Regressione interessata:
suite local adapter/engine/model capability/manifest, typecheck, build/parity,
JVM Android e assemble side-by-side. Real-upstream gate: sorgenti ufficiali del
pin e issue #25967 congelati nel dossier §24. Prova umana: rerun C2 completo,
processo ancora vivo, reply visibile e screenshot ADB 2400×3392 ispezionato a
pixel originali. Rollback: rimuovere il catch/fallback e il test; non toccare il
submodule né le capability. Stato: **RED PROVEN — C3 BLOCCATO**.

### C45-RED-18H — C2 supera la grammatica ma il prompt tool non entra

Il rerun fisico dopo `18G` prova che il fallback grammatica è operativo: il
native bridge resta vivo e registra il formato Qwen. Il prompt della chat reale
con 20 tool misura `5779` token, mentre la sessione è aperta a `4096`; con la
riserva di risposta richiesta servono `6804` token e il target bounded corretto
è `8192`. C3 non è stato avviato e il cleanup C2 ha lasciato zero GGUF campagna.

File inventory prima dell'edit di comportamento:

- `mobile/android/app/src/main/cpp/talos_llama_jni.cpp`: modifica; nuovo export
  JNI `nativePromptTokens`, stesse opzioni di tokenizzazione di
  `nativeGenerate`;
- `mobile/android/app/src/main/java/ai/talos/TalosLlamaNative.java`: modifica;
  dichiarazione compatibile `nativePromptTokens(long, String)`;
- `mobile/android/app/src/main/java/ai/talos/TalosLlamaEngine.java`: modifica;
  nuovo metodo pubblico `promptTokens(String)`;
- `mobile/android/app/src/main/java/ai/talos/TalosLocalContextBudget.java`:
  nuovo value-policy package-private, metodi `requiredTokens` e
  `requiresLargerContext`;
- `mobile/android/app/src/main/java/ai/talos/TalosLlamaPlugin.java`: modifica;
  `chatPrompt` aggiunge `promptTokens/contextTokens`; `generate` usa il
  preflight tipizzato;
- `mobile/android/app/src/test/java/ai/talos/TalosLocalContextBudgetTest.java`:
  nuovo RED JVM permanente;
- `mobile/src/lib/models/localContextPolicy.ts`: modifica; nuovi simboli
  `TALOS_LOCAL_MAX_CONTEXT_TOKENS` e
  `talosLocalEscalatedContextTokens`;
- `mobile/src/services/localEngine.ts`: modifica; nuovi simboli compatibili
  `TalosLocalEngineChatPlan`, `talosLocalEngineChatPlan`,
  `TalosLocalEngineGenerationError`; il vecchio
  `talosLocalEngineChatPrompt` resta stabile;
- `mobile/src/lib/chat/providers/localAdapter.ts`: modifica interna; un solo
  reopen esatto e ricostruzione prompt, tutti i tool invariati;
- `mobile/src/i18n/locales/en.ts` e `it.ts`: modifica; messaggi distinti per
  tetto contesto e failure generazione;
- `mobile/tests/unit/models/localContextPolicy.test.ts`,
  `mobile/tests/unit/services/localEngine.test.ts` e
  `mobile/tests/unit/chat/localAdapter.test.ts`: modifica, scenari permanenti;
- dossier/plan/spec/ledger correnti: modifica documentale;
- `mobile/docs/superpowers/evidence/model-lab/corrective/local-compat-qwen-c2-prompt-overflow.txt`:
  nuova prova diagnostica redatta, senza prompt/schema;
- il report matrice esistente e `local-compat-qwen3-chat.png` cambieranno solo
  durante il gate fisico.

RED nominato: `C45-RED-18H` pretende che `5779 + 1024 + 1` scelga `8192`, che
un piano ordinario resti a `4096` e che un requisito oltre `8192` venga
rifiutato senza troncamento. GREEN focalizzato: policy TS/JVM, local engine e
adapter. Regressione: chat/provider/model fit, typecheck, build/parity e JVM
Android. Real-upstream gate: Qwen model card e guide llama.cpp congelate nel
dossier §25. Prova umana: C2 completo mostra una reply con processo vivo e il
log nativo conferma contesto `8192`; screenshot ADB originale-pixel. Rollback:
rimuovere piano/conteggio/rialzo e relativi test, preservando `18G` e il pin.
Stato: **RED DA SCRIVERE — C3 BLOCCATO**.

### C45-RED-18I — eccezione native non contenuta nel worker Java

Prova fisica: `ApplicationExitInfo` alle 19:23:07 registra
`APP CRASH(EXCEPTION)`; top exception
`TALOS_LOCAL_PROMPT_TOO_LONG: 5779 token, il contesto ne regge 4096` da
`nativeGenerate` → `TalosLlamaEngine.generateBlocking` → lambda di
`TalosLlamaPlugin.generate`. Il `finally` corrente spegne watcher e flag, ma
l'eccezione continua fuori dal `Runnable`, raggiunge l'uncaught handler e
termina il processo.

File inventory prima dell'edit:

- `mobile/android/app/src/main/java/ai/talos/TalosLlamaPlugin.java`: modifica
  del solo task asincrono `generate` e helper privato di rejection;
- `mobile/tests/unit/android/llamaGenerationFailureBoundary.test.ts`: nuovo RED
  statico sul `catch`, rejection e `finally` esterno;
- `mobile/src/services/localEngine.ts`, local adapter e locale: già inventariati
  da `18H`, normalizzano e presentano il rifiuto;
- dossier/plan/spec/ledger ed evidenza redatta `18H`: modifica documentale.

RED nominato: `C45-RED-18I` fallisce finché `engine.generateBlocking` può
lasciare uscire una `RuntimeException` dal worker. GREEN: nessuna eccezione del
task raggiunge l'uncaught handler, la Promise viene rifiutata una volta e
`generating` torna sempre falso. Gate device: errore sintetico controllato senza
process death, poi C2 reale. Rollback: ripristinare il task precedente e il test;
non cambiare JNI o toolset. Stato: **RED DA SCRIVERE — C3 BLOCCATO**.

### C45-RED-18J — payload sensibili nel logging debug Capacitor

Scoperta incidentale ad alta severità: il bridge Capacitor debug ha scritto in
Logcat valori di plugin e header di rete. Nessun valore è conservato nel repo o
in questo ledger. La causa è il default `debug` di Capacitor 8.4.2 e la
serializzazione upstream dell'intero `methodData`, non Secure Storage a riposo.

File inventory prima dell'edit:

- `mobile/capacitor.config.ts`: modifica; aggiunge il simbolo configurativo
  ufficiale `loggingBehavior: 'none'`;
- `mobile/android/app/src/main/assets/capacitor.config.json`: output generato da
  `npx cap sync android`, mai editato a mano;
- `mobile/tests/unit/security/capacitorLoggingPolicy.test.ts`: nuovo RED che
  prova fonte, asset e pin Capacitor `8.4.2`;
- dossier/plan/spec/ledger: modifica documentale;
- `mobile/docs/superpowers/evidence/model-lab/corrective/capacitor-logcat-redaction-gate.txt`:
  nuova prova device con soli marker sintetici e conteggi.

RED nominato: `C45-RED-18J` fallisce perché né fonte né asset dichiarano
`none`. GREEN focalizzato: test configurazione; regressione: typecheck,
build/sync/asset diff, JVM e assemble. Real-upstream gate: Capacitor config,
`Bridge.java` e `CapConfig.java` 8.4.2 congelati nel dossier §26. Prova fisica:
apertura Provider e richiesta con marker sintetico producono zero righe
`methodData`/payload/header Capacitor, mentre la UI resta utilizzabile e viene
screenshotata. Rollback: rimuovere l'opzione e rigenerare l'asset; non patchare
dipendenze. Stato: **RED DA SCRIVERE — REGRESSION STOP**.

### C45-RED-18K — il report device non conserva il contesto realmente aperto

Il rerun C2 del `2026-08-05T17:35:28.539Z` è fisicamente riuscito e mostra una
reply Qwen visibile, ma il runner chiude CDP prima di interrogare il contesto
effettivo del plugin. Il report conserva PID, prompt, reply e screenshot, non
`contextTokens`; dopo il cleanup non è quindi possibile distinguere con prova
diretta una sessione `4096` da quella rialzata a `8192`. Il successo non deve
sostituire una misura disponibile.

Amendamento pre-edit: l'ispezione corrente ha invalidato il primo percorso
annotato, perché `TalosLlama` non espone un metodo `status()` e
`available()` non include il contesto. Il contratto già esistente
`chatPrompt()` restituisce invece `contextTokens` direttamente dall'engine.
Il runner userà quindi una singola sonda innocua `chatPrompt` dopo la reply,
senza registrare il prompt restituito e senza cambiare alcuna API prodotto.

File inventory prima dell'edit del gate:

- `mobile/scripts/run-local-model-compatibility.mjs`: modifica della sola
  funzione privata `exerciseRealChat`; dopo la reply e prima dello screenshot
  interroga `Capacitor.Plugins.TalosLlama.chatPrompt()` con un turno sintetico,
  valida un intero positivo `contextTokens` e registra soltanto tale valore nel
  blocco `ui`;
- `mobile/tests/unit/models/localModelCompatibilityManifest.test.ts`:
  modifica; nuovo RED statico permanente che impone lettura, validazione e
  persistenza del contesto prima della cattura;
- `mobile/docs/superpowers/evidence/model-lab/corrective/local-model-compatibility-report.json`:
  rigenerato soltanto dal rerun reale C2;
- ledger e manifest di evidenza: aggiornamento documentale dopo il gate.

RED nominato: `C45-RED-18K` fallisce finché il sorgente non chiama il confine
`chatPrompt` nativo e non include `contextTokens` nel risultato UI. GREEN focalizzato:
`localModelCompatibilityManifest.test.ts`. Regressione: runner/manifest,
local-engine e adapter; nessun codice prodotto cambia. Decisione upstream:
**ADAPT** il metodo Capacitor già implementato e tipizzato in TALOS; la
documentazione ufficiale Capacitor 8.4.2 già congelata nel dossier §26 resta il
pin, senza nuova dipendenza. Real-device gate: rerun C2, report
`ui.contextTokens=8192`, stessa reply e nuovo screenshot ADB originale-pixel;
cleanup zero GGUF/reverse. Rollback: rimuovere lettura/campo/test, senza toccare
la policy di contesto. Stato prima del GREEN: **RED PROVEN — C3 BLOCCATO**.

### 2026-08-05 — chiusura device 18G–18K e compatibilità C2

Verifica fresca sull'APK side-by-side SHA-256
`111ad3680e9056a7803a5e0214ee3cc95bc5a14ecfedd7dd832c4243034e0802`:

- build/parity **PASS**, startup JS `592951/600000`, CSS `206926/220000`;
- JVM completo + assemble C++/JNI **BUILD SUCCESSFUL**, 370 task;
- update `adb install -r -g` **PASS**;
  `firstInstallTime=2026-08-01 23:02:40` è invariato e
  `lastUpdateTime=2026-08-05 19:36:19` è avanzato;
- regressioni TS local/context/adapter/grammar/generation/security/locales:
  **43/43 PASS**; gate runner 18K: **10/10 PASS**;
- Provider e Hugging Face sono stati aperti e richiusi sul tablet reale;
  screenshot `provider-access-logging-gate.png`, `270622` byte, SHA-256
  `be013dbbce42bcd8f2971656aed1eecf2d7f95edf85c5d17897c1ccc1b3d5502`;
- cold start e percorso provider: zero righe Capacitor, zero firme payload e
  zero crash; la sonda Preferences
  `TALOS_SYNTHETIC_LOG_PROBE_20260805` è stata scritta, rimossa e compare zero
  volte in Logcat. Prova redatta: `capacitor-logcat-redaction-gate.txt`;
- C2 esatto `Qwen/Qwen3-0.6B-GGUF@23749fefcc72300e3a2ad315e1317431b06b590a`,
  `639446688` byte, SHA-256
  `9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031`:
  reverse stream, hash device, open/template/generazione nativa, picker e chat
  reale **PASS**;
- il report fresco misura direttamente `ui.contextTokens=8192`, provando il
  rialzo bounded dal prompt a 20 tool; nessuna eccezione ha raggiunto
  l'uncaught handler;
- screenshot finale `local-chat-qwen-recovered.png`, `306120` byte, SHA-256
  `2c85607d71b9b17c6ea1d18b5e097bba10aa945f512e14a81d75f7ba0f9c7faa`,
  ispezionato a 2400×3392 originali: risposta coerente contenente `TALOS`,
  reasoning collassato, metadati e composer leggibili, nessun clipping,
  overflow, overlap, segreto o controllo irraggiungibile;
- osservazione non mascherata: nell'ultima esecuzione stocastica Qwen ha
  risposto in inglese nonostante il prompt chiedesse italiano. È un limite di
  instruction-following del modello, non un errore del runtime/UI; la matrice
  corrente misura compatibilità di esecuzione e lo conserva nell'evidenza;
- postcondizione: zero reverse, zero GGUF campagna, geometria nativa
  2400×3392/density 420.

Stati correnti: `18G`, `18H`, `18I`, `18J` e `18K` sono **GREEN DEVICE +
VISUAL ACCEPTED**. C2 è **PASS RUNTIME + VISUAL ACCEPTED**. C1 verrà
ricatturato con il nuovo campo di contesto; C3–C7 restano aperti e nessuna loro
assenza è mascherata da questa chiusura.

### C45-RED-18L — C3 passa usando `TALOS` dal footer, non dalla reply

RED fisico: C3
`LiquidAI/LFM2-350M-GGUF@8fdc9d526b7ed346b19257551b05816c7912ecc2`,
`LFM2-350M-Q4_K_M.gguf`, `229309376` byte, supera stream/hash/open/template e
chat. Il corpo visibile è «Calo la risposta che risponde concettualmente
all'utente.» e non contiene `TALOS`; il footer provider dello stesso articolo
contiene invece `TALOS`. `lastAssistant.innerText()` fonde i due livelli e il
runner registra erroneamente `PASS`. C4 è bloccato.

File inventory prima dell'edit:

- `mobile/scripts/run-local-model-compatibility.mjs`: modifica;
  nuovo export pubblico puro
  `validateCompatibilityReply(caseId, reply)`; `exerciseRealChat` seleziona
  il discendente `talos-mobile-message-content`, valida marker positivo ed echo
  sul solo corpo e persiste quel valore;
- `mobile/tests/unit/models/localModelCompatibilityManifest.test.ts`:
  modifica con RED comportamentale e guardia statica sul locator relativo;
- `mobile/docs/superpowers/research/2026-08-05-model-lab-corrective-tranche-research.md`,
  piano e ledger: modifica documentale;
- `mobile/docs/superpowers/evidence/model-lab/corrective/local-compat-lfm2-footer-false-pass.png`:
  copia byte-identica della prova diagnostica corrente, `324702` byte, SHA-256
  `e5652050b02ac71ba5cf366cdadece251f434f84809c416c36fb72f36d562b80`;
- `mobile/docs/superpowers/evidence/model-lab/corrective/local-compat-lfm2-chat.png`
  e report: sostituiti soltanto da un nuovo run fisico C3.

RED nominato: `C45-RED-18L` pretende che il corpo senza `TALOS` fallisca anche
se il contenitore ha quel testo nel footer; pretende inoltre rifiuto del vuoto
e dei marker interni. GREEN focalizzato: test manifest/runner. Regressione:
runner completo, C1/C2 conservati, local adapter e message content. Real-upstream
gate: Playwright `1.61.1` e documentazione locator congelati nel dossier §27.
Prova umana: rerun C3, reply body con `TALOS`, screenshot ADB 2400×3392
originale-pixel e cleanup zero reverse/GGUF. Rollback: rimuovere helper/locator
e test senza alterare UI o modello. Stato: **RED PROVEN — C4 BLOCCATO**.

### C45-RED-18M — C3 riceve una lingua non supportata dal modello

Dopo la correzione 18L, C3 fallisce onestamente con
`TALOS_LOCAL_COMPATIBILITY_REQUIRED_MARKER:C3`. La model card ufficiale LFM2
non include italiano nelle otto lingue supportate, mentre il runner usa un
fallback italiano per ogni caso senza `prompt`. L'errore è nel fixture; toolset
e prodotto non devono essere impoveriti per compensarlo. La stessa classe di
errore è prevenuta ora per C5, il cui upstream definisce l'uso primario inglese.

File inventory prima dell'edit:

- `mobile/tests/fixtures/local-model-compatibility.json`: modifica dei soli
  campi `prompt`; tutti C1–C7 diventano espliciti, C3/C5 in inglese e gli altri
  nella lingua upstream supportata;
- `mobile/scripts/run-local-model-compatibility.mjs`: modifica di
  `validateManifest` ed `exerciseRealChat`; prompt obbligatorio e nessun
  fallback linguistico;
- `mobile/tests/unit/models/localModelCompatibilityManifest.test.ts`:
  modifica con RED su completezza e scelte C3/C5;
- dossier §28, piano e ledger: modifica documentale;
- report e screenshot C3: aggiornati soltanto dal nuovo gate fisico.

RED nominato: `C45-RED-18M` fallisce perché C2–C7 non hanno tutti un prompt e
C3/C5 non dichiarano inglese; il sorgente contiene ancora `entry.prompt ??`.
GREEN focalizzato: test manifest/runner. Regressione: 18K/18L, integrità pin e
ordine/cleanup. Real-upstream gate: model card LiquidAI, IBM, Microsoft, Meta e
Google congelate nel dossier §28; nessun package nuovo. Prova umana: C3 da
zero, reply body con `TALOS`, contesto misurato, screenshot 2400×3392 e cleanup.
Rollback: ripristinare i prompt/fallback e test; non toccare runtime o modelli.
Stato: **RED DA SCRIVERE — C4 BLOCCATO**.

### C45-RED-18N — il runner C3 preme il microfono invece di inviare

RED fisico: durante il rerun col prompt inglese, il file host raggiunge tutti i
`229309376` byte e il processo app resta vivo, ma il viewport mostra chat nuova
vuota e banner «Il riconoscimento vocale non è riuscito. Riprova.». Ispezione
DOM read-only: textarea length `0`; button presenti «Aggiungi alla chat» e
«Detta». Il selector `textarea + button` ha quindi raggiunto l'azione morfica
sbagliata. Il run è stato terminato; dopo force-stop del solo package dev,
cleanup instrumentation **PASS**, zero reverse, zero GGUF e zero temp host.

File inventory prima dell'edit:

- `mobile/scripts/run-local-model-compatibility.mjs`: modifica privata di
  `exerciseRealChat`; model trigger e send diventano role/name semantici,
  refill + exact input check dopo il drawer;
- `mobile/tests/unit/models/localModelCompatibilityManifest.test.ts`:
  modifica con RED statico sull'assenza dei due selector fragili e sull'ordine
  refill → send;
- dossier §29, piano e ledger: modifica documentale;
- `mobile/docs/superpowers/evidence/model-lab/corrective/local-compat-c3-draft-cleared-dictation.png`:
  nuova prova diagnostica, `334876` byte, SHA-256
  `795e709f530a2e866e6179783314f648b1697495973f5bb4068d350061cceb9a`;
- screenshot/report C3 finali: aggiornati soltanto dal rerun valido.

RED nominato: `C45-RED-18N` fallisce finché il runner contiene
`button[aria-haspopup="dialog"]` o `textarea + button`; pretende accessible
name model/send, un secondo `textarea.fill(prompt)` dopo il drawer e controllo
esatto del valore. GREEN focalizzato: manifest/runner test. Regressione:
18K–18M e composer-state E2E. Real-upstream gate: Playwright `1.61.1` §29.
Prova umana: C3 inviato davvero, nessun banner voce, reply body `TALOS`, contesto
e screenshot; cleanup. Rollback: ripristinare selector e test senza toccare
composer/dettatura. Stato: **RED DA SCRIVERE — C4 BLOCCATO**.

### C45-RED-18O — il banco C3 espone memoria owner a un modello di prova

RED fisico: il rerun C3 ha usato una chat ordinaria e il messaggio utente ha
mostrato memorie selezionate. Il body del modello ha incluso il marcatore
diagnostico `TALOS_mem_present` e riferimenti al contesto. Il risultato è stato
immediatamente portato a `FAIL`, la reply nel JSON è stata sostituita con
`[REDACTED_CONTEXT_ECHO]` e il PNG potenzialmente identificante è stato rimosso.
Il contenuto owner non viene riportato qui. C4 resta bloccato.

File inventory completo prima dell'edit comportamentale:

- `mobile/scripts/run-local-model-compatibility.mjs`: modifica di
  `FORBIDDEN_REPLY_MARKERS`, della funzione pubblica compatibile
  `validateCompatibilityReply(caseId, reply)` e della privata
  `exerciseRealChat(context, entry)`; confronto echo case-insensitive, click
  della modalità temporanea, attesa badge e ordinamento prima del prompt;
- `mobile/tests/unit/models/localModelCompatibilityManifest.test.ts`:
  modifica; nuovo RED comportamentale sul marker osservato e guardia statica
  click → badge → primo `textarea.fill(prompt)`;
- `mobile/docs/superpowers/research/2026-08-05-model-lab-corrective-tranche-research.md`:
  modifica documentale con dossier §30 e pin ufficiali;
- `mobile/docs/superpowers/plans/2026-08-05-model-lab-corrective-tranche-plan.md`:
  modifica documentale con fase E13;
- `mobile/docs/superpowers/ledgers/2026-08-05-model-lab-corrective-tranche-ledger.md`:
  modifica documentale di questo scenario e, dopo il gate, del suo stato;
- `mobile/docs/superpowers/evidence/model-lab/corrective/local-model-compatibility-report.json`:
  rigenerazione esclusiva dal rerun reale, senza body rifiutati;
- `mobile/docs/superpowers/evidence/model-lab/corrective/local-compat-lfm2-chat.png`:
  nuova cattura ADB soltanto dopo validazione sicura;
- `mobile/docs/superpowers/evidence/model-lab/corrective/manifest.md`:
  aggiornamento finale di byte, SHA-256 e verdict visivo della nuova cattura.

Nessun file prodotto viene creato o eliminato da questo fix; lo screenshot
sensibile già rimosso non viene ricreato. Simboli compatibili da preservare:
`resolveSelectedCases`, `assertSafeCampaignRelativePath` e formato report v1.

RED nominato: `C45-RED-18O` deve fallire perché il runner non contiene ancora
`talos-make-temporary`/`talos-temporary-chat-badge` e accetta ancora il marker
osservato. GREEN focalizzato:
`tests/unit/models/localModelCompatibilityManifest.test.ts`. Regressioni:
18K–18N, incognito-switch, composer state e runner allowlist. Decisione
upstream: **ADAPT** OWASP LLM02:2025, NIST AI RMF 1.0 Measure 2.10 e Playwright
`1.61.1` dietro i testid TALOS già posseduti; nessuna dipendenza nuova.
Real-upstream gate: fixture LFM2 pin esatto, app side-by-side e tablet reale.
Prova umana: badge temporaneo visibile, nessun chip memoria, reply body `TALOS`,
contesto misurato, PNG 2400×3392 originale-pixel e cleanup zero reverse/GGUF.
Rollback: rimuovere solo isolamento/marker/test del runner; non toccare la
semantica memoria del prodotto. Stato: **RED PROVEN (1/13 FAIL) — C4 BLOCCATO**.

### 2026-08-05 — chiusura C3 e regressioni 18L–18O

Il rerun fresco sul tablet fisico ha chiuso la catena senza cambiare il
prodotto memoria:

- RED 18O provato `1/13 FAIL`; GREEN runner `13/13 PASS`;
- regressione manifest + ChatScreen `47/47 PASS`;
- E2E Playwright incognito-switch con un worker `6/6 PASS`;
- fixture LFM2 pin esatto, stream/hash/open/template/generazione nativa e chat
  reale **PASS**;
- il runner ha mostrato e atteso la modalità temporanea prima del composer,
  ha trovato zero `talos-used-memories` e ha validato il solo body prima di
  report/screenshot;
- report C3: `PASS`, `ui.contextTokens=4096`, reply length 213, marker `TALOS`
  presente e zero marker noti di echo; nessun contenuto owner è persistito;
- screenshot `local-compat-lfm2-chat.png`, 401944 byte, SHA-256
  `75c40e53b39927f7db79e8c75258f9179c3cff6ea78a767e8f19466fb4027ac1`;
  ispezione originale 2400×3392: banner temporaneo visibile, nessun chip
  memoria, risposta/metadati/composer leggibili, nessun clipping, overlap,
  overflow, segreto o PII;
- osservazione qualità conservata: LFM2 contiene `TALOS` ma amplia la risposta
  invece di obbedire a «exactly»; non è classificato come difetto runtime/UI;
- cleanup ripetuto **PASS**: zero reverse, zero GGUF campagna, zero temp host;
  geometria fisica 2400×3392/density 420.

Stati: `18L`, `18M`, `18N` e `18O` sono **GREEN DEVICE + VISUAL ACCEPTED**.
C3 è **PASS RUNTIME + VISUAL ACCEPTED**. C4 è ora sbloccato; C5–C7 restano
seriali e aperti.
