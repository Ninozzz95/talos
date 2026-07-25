# R1→R3 — Remediation program (owner VIA 2026-07-24, autonomous through R3)

Source of truth: `2026-07-24-talos-mobile-f1-f6-critical-review.md` (TOP 10 + 3 device-bite debts).
Rite per phase: TDD, gates (unit/e2e/tsc/budget), SF-critic subagent, commit, APK delivery.

## R1 — Device-critical
1. Dialog sweep: MemoryScreen / ContextScreen / TalosMobileSidebar (rename+delete) /
   TalosMobileBrowserInteractiveFrame off reka Dialog onto device-proven surfaces.
2. Stream inactivity watchdog (reset-on-chunk) in the shared stream reader.
3. PIN re-lock on appStateChange resume (grace window) + inert workspace under lock.
4. BASE_PROMPT: restore the desktop image-injection defense sentence.
5. Streaming render isolation: dedicated child subscribes to streamingText; precompute
   hasPreviousUser (O(n²) → O(n)).
6. Fenced bridge gateway `talosBridge` for boot-critical native awaits (settings hydrate/persist,
   secure key store, sqlite connect+reads, export delivery, biometric).

## R2 — Structural
7. sessionLifecycle module (delete/rename/select/new with draft flush + attachment revocation)
   shared by ChatScreen / ChatsScreen / sidebar / tablet panel.
8. chatController slim-down: stations consume repository ports directly.
9. Perf: batch session-list refresh (no double full-table round-trip per append),
   setSessionOrder single transaction.
10. Physical removal of the dormant sensitive-censor mechanism (owner obliteration directive).
11. Row-action grammar unification (chats hold-menu vs message overflow).

## RICERCA WEB R3 (2026-07-24, obbligo owner — query/fonti/impatto)
5. **Drift file portati** — query: "detect drift vendored copied file hash checksum fail on
   divergence". Fonti: monorepo best-practice (golden lockfiles + checksum in manifest versionati,
   validati in CI, fail automatico su mismatch); confermano il pattern già usato per shadcn. →
   R3-13 replica `shadcnConformance` per i lib portati dal desktop (hash pin del contenuto desktop
   al revision congelato; divergenza = build rossa).
6. **e2e = default spediti** — query: "playwright match production defaults shipped experience".
   Fonti: playwright best-practice (no shared state tra spec, getByRole, full suite nightly). →
   R3-12: aggiungo una spec DEDICATA che gira col default SPEDITO (immersive+drawer) sui flussi
   core, invece di riscrivere i 54 test classic-seeded (evita di rompere le coperture esistenti;
   la spec nuova NON condivide stato — file separato). Pragmatico > big-bang flip.

## R3 — Guardrail
12. e2e default storageState = SHIPPED shell (immersive+drawer); classic override pack.
13. Ported-file conformance gate (hash-pin desktop-ported libs like shadcnConformance).
14. Emulator/device smoke floor (documented + scripted where host allows; adb absent → script ready).
15. Commit-granularity policy: phases as branches, N reviewable commits, --no-ff merge (from R2 on).

## R3 COMPLETA (2026-07-24)
- R3-13 DONE: `upstream/desktop-ported-libs-manifest.json` + `desktopPortedConformance.test.ts`
  (2 test). Pin dell'hash di 5 lib portate (talosChatLayout/Contrast = port puri whitespace-
  identici a desktop@76a0aa9; talosMessageMarkdown/AppearancePreferences/Themes = fork
  mobile-specifici documentati). Ogni modifica a un file portato = build ROSSA finché non
  aggiorni il manifest coscientemente (checksum-in-manifest, best practice monorepo).
- R3-12 DONE: `mobile-shipped-defaults.e2e.spec.ts` (2 test) sul default SPEDITO (immersive+
  drawer, storageState file-locale): invio end-to-end via drawer composer + **delete Memory col
  dialog device-proven R1** (il debito device-bite #1 ora ha copertura e2e sulla config reale
  dell'owner). Scelta pragmatica vs flip dei 54 classic-seeded (nessuno stato condiviso, file
  separato — best practice playwright).
- R3-14 DONE: `scripts/device-smoke.mjs` — floor device host-gated (adb: install→launch→8s
  logcat→assert no-FATAL/ANR + WebView booted→stampa tail + "apri Doctor per lo STT"). Fallisce
  con messaggio chiaro senza adb (pronto per quando l'owner collega un device); la metà
  automatizzata del floor è la suite Playwright (rende il bundle reale in chromium).
- R3-15: policy commit registrata — dalle fasi future, branch + N commit reviewabili + merge
  `--no-ff` per bisectabilità (le mega-commit di fase F4=86 file uccidevano git bisect). In
  autonomous mode l'auto-commit per fase resta; il refinement è la granularità interna.
- GATES R3: upstream unit 63 · e2e 56/56 (54+2 shipped-defaults) · full unit 1295. Commit + APK.

## PROGRAMMA R1→R3 CHIUSO
- R1 `fd37031` (device-critical + owner device fixes) · R2 `809a3a5` (strutturale) · R3 (guardrail).
- Ricerca web preventiva applicata (dopo il richiamo owner): 6 checkpoint loggati, 2 correzioni
  reali (stall 60s, grace 5min). systematic-debugging usato per il root-cause long-press.
- Restano fuori-scope/backlog: R2-9b (setSessionOrder single-tx), preset grace in Settings,
  debiti F6 accettati (iOS<14, CLS boot, RTL), verifica device mic (owner con Doctor su APK R1+).

## R1-bis — Owner device report (2026-07-24, integrated mid-R1)
A. **MIC ROOT CAUSE PINNED by Doctor F5.3**: `registered:true` + `import:FAIL
   TALOS_SPEECH_STEP_import_TIMEOUT 4000ms` → native plugin fine, the DYNAMIC import micro-chunk
   never settles on the owner's WebView. FIX: static import of the capgo wrapper (hop removed);
   budget 470.0k/512k. The diagnostics channel paid for itself.
B. **TONE_SUGGESTION leaked into visible+persisted reply**: marker on the SAME line as prose;
   the strip regex required a newline. FIX: trailing-anchor regex (mid-text still untouched),
   characterized with the owner's exact reply.
C. **Tablet drawers ~half width, coherent**: all four bottom drawers share
   TalosMobileComposerSheet → `md:w-[clamp(480px,50vw,600px)] mx-auto border-x` in ONE place.
D. Doctor also confirms: SQLCipher ready, share ready, biometric genuinely absent on device.

## Status log
- 2026-07-24: ledger opened, R1 started.
- 2026-07-24: R1-4 (BASE_PROMPT injection line) + R1-3 (resumeRelock service 5/5, lock screen →
  Teleport+modal surface z-90, App wiring + dispose) done. R1-bis A/B/C integrated.
- 2026-07-24: R1 COMPLETE.
  - R1-2 stall watchdog: `stallMs` fence in talosFetchStream (45s default, reset-on-chunk,
    reader.cancel → visible error). 2 characterizations (silent stall rejects keeping delivered
    text; slow-but-alive never killed).
  - R1-1 dialog sweep: Memory + Context + Sidebar rename/delete → TalosMobileConfirmDialog;
    browser capture lightbox → manual Teleport + shared modality. Vendored reka dialog files are
    hash-locked (cannot delete) → QUARANTINE guard test forbids any product import.
  - R1-5 render isolation: TalosMobileStreamingReply subscribes to the store alone (token bursts
    no longer re-diff the list; ChatScreen template no longer reads streamingText);
    hasPreviousUser precomputed O(n).
  - R1-6 talosBridge gateway: settings/preferences/theme hydrate+persist, Keystore backend,
    export import+write (Share stays unfenced: interactive), sqlite connect 20s. Characterized:
    hung Preferences.get rejects hydrate with TIMEOUT.
  - R1-owner-2 (mid-flow): calm re-seeded NEUTRAL GREY `#1e1f22` (dark) + `#f1f2f4` (light,
    calm-specific special case — the generic accent tint warmed it to cream); characterization
    updated to the new directive (channel spread ≤8). 37 launcher/splash PNGs regenerated from
    the canonical logo-short.svg two-tone on the new grey; colors.xml + ic_launcher_background
    aligned. Lock screen z bumped to 90 (above confirm 85).
  - GATES: tsc 0 · unit 1289 (+18 new) · e2e 54/54 · budget 470.7k/512k.
- 2026-07-24: SF-critic R1 verdict FIX-FIRST (2 BLOCKER + 2 MAJOR + 4 minor) — ALL fixed:
  - B1 modality-at-mount froze the app under browser evidence → useTalosModalSurface gained an
    `active` ref option (state-driven engage/release; sync focus preserved in mount-mode).
  - B2 teleported dialogs hit-test transparent over the modal vaul drawer (body pointer-events
    none) → `pointer-events-auto` on ALL teleported surface roots; sidebar dialogs moved OUTSIDE
    the Drawer subtree + drawer closes when they open; relock closes the drawer before locking.
  - M3 45s fence doubled as first-byte budget and silently re-requested (double billing; cold
    Ollama) → separate firstByteMs 180s with distinct verdict; chatCompletion never falls back
    on stall/first-byte errors. m5: verdict sticky post-cancel (silent truncation is worse).
  - M4 values-night colors still warm charcoal → #1e1f22.
  - m6 connect fence wraps the caller's wait, in-flight establish never raced by retry.
  - m7 Context delete close busy-guarded. m8 stale dictation comment fixed.
- FINAL GATES R1: tsc 0 · unit 1290 · e2e 54/54 · budget 470.9k/512k.
- R1 COMMITTED `fd37031` (76 file) · APK R1 sha `cc46a3f5…` consegnato (zip chat + Desktop).
- R2 IN CORSO:
  - R2-10 DONE: censor fisicamente rimosso (prop `sensitive` + classe blur cancellate da
    MessageContent/MessageList; `sensitive_blur` resta solo nel resolver ported zero-consumer;
    `confirm_sensitive` del browser è un ALTRO concetto, resta).
  - R2-9a DONE: `bumpSessionRecency` locale al posto del listSessions full-table per append
    (283/283 chat+stores verdi). R2-9b (setSessionOrder transazione unica) DEFERRED con
    motivazione: percorso raro (drag riordino), richiede nuova API repository+contract su
    entrambe le impl; costo>beneficio ora.
  - R2-7 NEXT (design deciso): il draft controller vive in ChatScreen → si espone sul
    CONTROLLER un `sessionLifecycle` con `register(orchestrator)` (ChatScreen registra le sue
    azioni orchestrate draft+attachments; fallback = metodi bare). ChatsScreen (pagina+panel
    tablet) e App/sidebar chiamano `controller.sessionLifecycle.*` — spariscono i cast
    duck-typed e il delete-da-Chats smette di saltare la revoca attachment.
  - R2-8: stations → repository port diretti (togliere i pass-through memories/tasks/notes dal
    controller). R2-11: hold-to-open ADDITIVO sull'overflow dei messaggi (grammatica unica).
  - Poi: gates, SF-critic R2, commit, APK. R3 dopo (e2e default shell spedita, conformance hash
    ported-file, smoke device scriptato, policy commit --no-ff).

## RICERCA WEB RETROATTIVA (2026-07-24, obbligo owner — query/fonti/impatto)
1. **SSE stall timeout** — query: "SSE streaming LLM client timeout inactivity between chunks".
   Fonti: vscode#308823 (Copilot hardcoda 60s inter-chunk e RICEVE lamentele sotto congestione),
   qwen-code stream-inactivity-timeout design (reset su OGNI raw chunk, solo il silenzio vero
   scatta), MCP ts-sdk#1883. Verdetto: il mio design (reset-on-raw-chunk + first-byte separato)
   COINCIDE col pattern consolidato; il valore 45s è più aggressivo dello standard 60s →
   **CORREZIONE: stall default 45s→60s** (first-byte 180s confermato ragionevole vs il
   request-level 120s degli SDK).
2. **Re-lock policy** — query: "Android app lock re-lock resume grace period banking".
   Fonti: developer.android.com fraud-prevention/authentication (~15 min + preset 1/5/15),
   nextcloud/android#3754 (grace period configurabile), guida banking (EncryptedSharedPreferences
   + revalidate cold start = già nostro). Verdetto: 30s è PIÙ severo dello standard e frizionerà
   ogni app-switch → **CORREZIONE: grace default 30s→5min**; preset utente in Settings =
   ticket backlog.
3. **Vaul nested dialog** — query: "vaul drawer dialog body pointer-events none nested modal".
   Fonti: vaul#245 ("Can't interact with Dialog opened on top of Drawer" — ESATTAMENTE il nostro
   B2), vaul#509/#496. Verdetto: bug class upstream nota; il fix R1 (drawer chiuso prima +
   dialoghi fuori dal subtree + pointer-events-auto) è la workaround di comunità. Nessuna modifica.
4. **Orchestrazione cross-store** — query: "pinia composing stores cross-store actions".
   Fonti: pinia.vuejs.org/cookbook/composing-stores (comporre via azioni; store PICCOLI a
   responsabilità singola). Verdetto: il facade sessionLifecycle = composizione ad azioni ok;
   la guida "small stores" SUPPORTA l'estrazione R2-8 delle station facades dal god-controller.

## R2 COMPLETA (2026-07-24)
- R2-10 censor rimosso fisicamente (prop+classe cancellate).
- R2-9a `bumpSessionRecency` locale (niente listSessions full-table per append). R2-9b deferred.
- R2-7 `sessionLifecycle` facade sul controller (register/unregister dall'orchestrator di
  ChatScreen); ChatsScreen/pannello tablet/sidebar/App tutti attraverso il facade; via i cast
  duck-typed di App.vue → azioni con toast d'errore. Delete-da-Chats ora revoca gli attachment.
- R2-8 station facades estratte in `stores/stationFacades.ts` (controller sgonfiato).
- R2-11 grammatica row-action UNICA: long-press sul messaggio apre il MEDESIMO overflow (nessun
  secondo menu). Correzioni web-research applicate: stall 60s, grace 5min.
- Applicati i fix di ricerca: stall 45→60s, grace 30s→5min.
- **DEBUG (systematic-debugging skill)**: il long-press messaggio non apriva il menu.
  Evidenza: direct click apre (menu=true) ma hold no (capturedClicks=1, menu=false). ROOT CAUSE
  = il mio guard `@click.capture` (suppressNextMessageClick settato PRIMA del click programmatico)
  faceva preventDefault+stopPropagation sul mio stesso click prima che raggiungesse reka. Fix:
  click PRIMA, suppress DOPO (per il solo click reale del dito). NON era reka.
- GATES R2: tsc 0 · unit 1292 · e2e 54/54 · budget 472.4k/512k.
- SF-critic R2: FIX-FIRST (0 BLOCKER, 3 MAJOR + 5 minori) — ALL fixed:
  - M1 `touch-action:pan-y` sull'article uccideva lo scroll orizzontale touch di tabelle/code
    (intersezione touch-action) → rimosso (l'hold già cancella a >10px, pan-y inutile).
  - M2 shell aveva perso il busy-guard col facade: doppio-tap New Chat = DUE sessioni, nessuno
    spinner → `shellActionBusy` (re-entrancy refusal + indicatore); `creatingSession` morto rimosso.
    Caratterizzato (RED: 2 sessioni → GREEN: 1 + disabled).
  - M3 ChatsScreen select/new senza try-catch = rejection silenziosa → try/catch+actionError+busy.
  - m6 toggle "Sensitive blur" morto rimosso dai controlli (direttiva obliterazione); campo
    resolver resta inerte per parità shape desktop.
  - m4 CRLF→LF su streamShared/resumeRelock; m5 JSDoc grace; m7 long-press assistant (dead
    affordance + suppress leak) gated a role user.
  - m8 (defineExpose/cast) NON toccato: sessionActionBusy è realmente esposto e usato (retry
    storage nel template ChatScreen) — il cast legge un valore reale, non vestigiale.
  - Verificati corretti dall'SF-critic senza azione: R2-9a bump (ordine == DB), R2-8 facades
    (call-time scope), R2-7 register sincrono pre-mount, tap normali R2-11, sanity R1.
- FINAL GATES R2: tsc 0 · unit 1293 · e2e 54/54 · budget 472.3k/512k. Commit + APK, poi R3.
