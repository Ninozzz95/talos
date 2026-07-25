# F4 — Functional block: device fixes, chat export, Memory station

**Opened:** 2026-07-23 on the owner's GO · **Owner:** Fable (full mobile) · **Mode:** autonomous rite
(TDD, gates, SF-critic at phase end, commit, APK zipped in chat).
**Inputs:** owner device reports #17–#20 + backlog #16 + gap report Part A.3 (Memory first).

## Task order
1. **#18 MIC** — invert the pattern: on native the mic is ALWAYS visible; unavailability reported honestly AT
   TAP (banner already exists). Permission requested at the intro CTA (completed) and on first mic tap — never
   at cold start. In-app diagnostics row (Settings→Account: native/plugin/available/raw error) so the owner can
   report exact evidence without adb. Plugin 7.0.1 peer `>=7.0.0` — formally Capacitor-8 compatible; runtime
   registration verified through the diagnostics row.
2. **#19 LINK STRIPPED** — reproduce with a failing E2E (paste URL → send → text intact), then fix (suspect:
   markdown/DOMPurify rendering chain; the browse-suggestion pipeline is read-only).
3. **#20 ENHANCER DISABLED** — reproduce the gating on device flows; fix any real bug; make the disabled
   reason VISIBLE so it never reads as unimplemented.
4. **#16 EXPORT CHAT** — immersive 3-dot menu gains "Export chat" with the 4 desktop functions (evidence pack /
   transcript / context manifest / benchmark scenario), local-first files + system share sheet.
5. **#17 ICON ZOOM** — enlarge the launcher glyph further (crop the first-frame's outer padding).
6. **MEMORY STATION** — durable local store on the proven SQLite pattern, CRUD surface, `used_memories`
   disclosure in chat, untrusted boundary identical to desktop.

7. **#21 BLACK BLOCKS** *(owner report, human device test)* — words censored with black blocks.
8. **#22 RENAME/DELETE CHAT** *(owner report)* — cannot rename or delete a chat on device.
9. **#23 LIST GESTURES** *(owner request)* — slide-to-archive/delete + hold-to-move on the chat list.

10. **#24 LOADING-ANSWER BUBBLE INDICATOR** *(owner proposal 2026-07-23, NOT urgent — cosmetic, schedule
    after the functional items)* — in the assistant "loading answer" bubble, replace the 3 animated dots with
    a themed horizontal line in the boot-logo style: a single line crossing 3 EMPTY nodes; each node fills
    the moment the line passes through it. Owner clarification: this targets the loading-answer bubble
    specifically.

11. **#25 SETTINGS: SHORTCUTS OUT + PIN UX** *(owner 2026-07-23, schedule when fitting)* — (a) the Shortcuts
    section in mobile Settings makes no sense on a phone: TOTAL removal; (b) PIN setup gets a clean,
    professional OTP-style interface (segmented digit boxes) with a confirm step; (c) PIN removal requires
    re-entering the PIN — or biometric authentication when enabled.

12. **#26 DEDICATED DRAWERS: MODEL+EFFORT / ENHANCER** *(owner 2026-07-23)* — the model selector + reasoning
    effort get a DEDICATED bottom drawer, and the prompt enhancer gets one too — exactly the same pattern as
    the "+" Add-to-chat drawer (Teleport, organized sheet). Naturally follows #20 (same composer area).

13. **#27 SELF-KNOWLEDGE MEMORY (IMPORTANT — scheduled WITH the Claude-parity program)** *(owner
    2026-07-23)* — desktop TALOS carries a whole memory of how TALOS works and the AVM architecture. Mobile
    integrates the same dynamic/adaptive memory technology WITH A PRE-SEEDED BASE covering how the mobile
    app, the desktop app and ALL functionalities work at 100%, so the user can ask the AI how anything in
    the product works. Owner scheduling: parallel to the
    `proposta-refactor-funzionale-claude-ultra-tecnica.md` program (spec integrated at
    `docs/superpowers/specs/2026-07-23-claude-functional-parity-proposal-v2.md`) — NOT inside F4; the F4
    Memory station builds the substrate it will plug into.

14. **#28 STREAMING SCROLL HIJACK + BACK-TO-BOTTOM** *(owner device report 2026-07-23, scheduled NEXT
    PHASE)* — while the model streams a long reply the user cannot scroll up: every printed character
    forces the view back to the bottom (the `userScrolledUp` guard is broken or insufficient on device).
    Fix the anchoring so a user scroll ALWAYS wins during streaming, and add a floating "back to bottom"
    pill to jump to the latest message when scrolled up (live-edge pattern; ties into gap report A.3-bis).

## Status log
- 2026-07-23: ledger opened; starting #18.
- 2026-07-23: **#18 DONE** — visibility inverted on native (`visible = native || supported`), failures surface
  at tap in the existing banner, permission requested at intro CTA 'completed' + first tap, diagnostics row in
  Settings→Account (platform/plugin/recognizer/error). TSC 0, composable 10/10.
- 2026-07-23: **#19 + #21 CLOSED TOGETHER — root cause was the sensitive censor.** The `secret` detector
  (`[A-Za-z0-9+/_=-]{48,}`) matched long URLs/paths → links looked "removed" (#19) and words showed as black
  blocks (#21). E2E proved the link WAS rendered (strict-mode double match). **Owner directive (verbatim):
  "questa censura non ha assolutamente senso e va letteralmente obliterata dal codice, ricordalo."**
  → OBLITERATED, not refined: `src/lib/talosSensitiveCensor.ts` deleted, wiring + `censorEnabled` prop +
  `.talos-censored` CSS removed from `TalosMobileMessageContent.vue`, censor unit spec deleted, component spec
  now asserts never-censor (email/password/URL all render verbatim), parity E2E asserts zero `.talos-censored`.
  Registered in persistent memory (`no-sensitive-censor`) — never reintroduce; flag the desktop default when
  that lane opens. Gates: TSC 0, unit 667/667 (114 files), affected E2E 3/3 (rebuilt dist — preview serves
  stale `dist`, rebuild before E2E after src changes).
- 2026-07-23: #20 web contract PASSED (wand enabled with text, classic bar); remaining work = visible disabled
  reason on device drawer flow.
- 2026-07-23: **#22 HARDENED (device confirmation pending)** — web E2E reproduced the FLOWS clean on both
  surfaces (immersive 3-dot + Chats-page rows, real defaults seed): the web path works, so the break is
  device-only. The only device-only seam in rename/delete was trusting the native driver's `changes` counter
  (they were the sole writes that did; message INSERTs never check it — matching "chats work, rename/delete
  don't"). Two-pronged fix, all TDD:
  1. `sqliteChatRepository` is now **driver-independent**: existence guarded by SELECT, rename verified by
     read-back inside the transaction (`TALOS_CHAT_RENAME_UNVERIFIED`), delete verified by read-back
     (`TALOS_CHAT_DELETE_UNVERIFIED`); same hardening applied to updateSession / updateToolActivity /
     updateVaultFile / deleteVaultFile. `changes` is never consulted anywhere (repo tests 18/18, incl.
     zero-changes-quirk simulations).
  2. **No silent failures anywhere**: ChatsScreen dialogs stay open with the real error (`role=alert`);
     ChatScreen session actions run through `createSessionActionRunner` — a rejection becomes a 6s toast
     ("Rename chat failed: <code>") instead of an unhandled rejection (was `void runSessionAction(...)`).
  Honest status per reproduce-before-claiming: the root cause is the best-supported hypothesis, not
  device-proven. The next APK either just works or shows the exact error code on screen — real evidence
  either way. Gates: TSC 0, unit 676/676 (115 files), full E2E 42/42.
- 2026-07-23: **#23 DONE** — chat-list management, all TDD:
  - **Model**: `metadata.archived` + `metadata.sort_index` (no schema migration, restart-proof); store gains
    `setSessionArchived` / `setSessionOrder`; ordering lib `chatListGestures.ts` (un-indexed by recency first,
    then manual order; archived split out).
  - **Swipe**: pure state machine `createSwipeReveal` (axis lock cedes to vertical scroll, half-tray snap,
    trailing-click swallow at the ROW level — a finger ending over the tray must never trigger Delete);
    tray = Archive (accent) + Delete (danger, behind the existing confirm dialog); collapsible Archived
    section with Unarchive.
  - **Hold-to-move**: SortableJS 1.15.6 (pinned, upstream) with hold delay 350ms, drop persisted as
    sort_index for the whole visible list; disabled while searching.
  - **PRODUCT FIND (papercut fixed)**: reka-ui/vaul overlays kept eating input while animating OUT — the
    `data-open:`/`data-closed:` utility variants on the vendored overlays never matched (tw-animate-css
    maps them, but the inline `pointer-events` of the dismissable layer wins). Patched DrawerOverlay +
    DialogOverlay with `data-[state=closed]:pointer-events-none!` (important beats the inline style);
    manifest hashes updated (schema forbids notes — deviation documented HERE). Body-lock during drawer
    exit is upstream-standard and stays; the swipe E2E waits for release like a real user.
  - Gates: conformance 2/2 (sortablejs + @types pinned exact), F4 e2e 5/5, full e2e 43/43, TSC 0.
- 2026-07-23: **#20 DONE** — no more mute disabled enhancer: the control stays tappable; a tap with missing
  prerequisites emits the REASON (`enhanceBlocked`) which ChatScreen surfaces as a toast + focuses the
  composer; the "+"-drawer row explains itself with a live subtitle (title tooltips don't exist on touch).
- 2026-07-23: **#26 DONE** — dedicated bottom drawers on the "+"-drawer pattern via a shared
  `TalosMobileComposerSheet` shell (Teleport, modal semantics): **Model & reasoning** (model catalog +
  effort/thinking, both classic triggers and the drawer-mode chip open it; select → close + focus restore)
  and **Improve prompt** (progress → error → result with Insert/Replace/Cancel; decisions only emit — the
  parent state transition dismisses, popover-parity; manual dismissal cancels the enhancement). Old model /
  effort / enhancer popovers REMOVED. Enhancement testids preserved (`talos-mobile-enhancer-status/error`,
  `talos-mobile-prompt-enhancer-popover` now inside `talos-enhancer-drawer`). Gates: TSC 0, unit 692/692,
  e2e 43/43, entry 454.5k/512k.
- 2026-07-23: **#16 DONE** — "Export chat" in the immersive 3-dot menu, desktop-parity artifacts generated
  LOCALLY (BE `TalosSessionExportService` used as the reference contract per owner's "guarda anche il be"):
  same 4 formats + report_type strings (`talos_session_export` / markdown / context_manifest /
  `talos_benchmark_scenario_export`), manifest redaction (names+sha256, never storage paths — vault hash via
  new `chat.exportSnapshot()`), benchmark readiness from the last completed exchange (js-sha256 pinned,
  deterministic hashes), delivery via @capacitor/share 8.0.1 (Cache file + system share sheet; web download).
  Export sheet reuses the #26 `TalosMobileComposerSheet` shell; preview testid mirrors desktop
  (`talos-session-export-preview`). Gates: export lib 6/6, store 15/15, e2e F4 6/6, entry 455.4k/512k.
- 2026-07-23: **#17 DONE** — launcher glyph zoomed (foreground 0.58→0.78 within the adaptive safe zone,
  legacy 0.72→0.86, round 0.66→0.80); splash intentionally untouched (owner approved it). 15 icons
  regenerated, conformance 58/58, visual check on xxxhdpi ok.
- 2026-07-23: **#25 DONE** — (a) Shortcuts section OBLITERATED (tab, panel, store subtree, lib, tests —
  hardware bindings make no sense on a phone; registry now 11 desktop categories); (b) PIN setup is an
  OTP-style flow (`TalosMobilePinInput`: one real numeric input driving segmented boxes; 6 digits → confirm
  step → auto-arm on match, mismatch restarts confirm via explicit `clear()` — same-tick prop resets are
  invisible to diff patching); (c) disabling REQUIRES the current PIN (`verifyAppLockPin`) or biometrics
  when enabled — the lock never falls unverified. Enhancer drawer retitled 'Prompt enhancement' (accessible
  name collided with the Improve prompt button). Gates: unit 700/700 (117 files), e2e 44/44, TSC 0.
- 2026-07-23: **MEMORY STATION DONE** — full local pipeline, desktop-parity, all TDD:
  - **Schema v3**: `talos_memories` (scope/kind/status constrained, `trust_level` fixed 'untrusted', no
    destructive migration); repository CRUD on BOTH engines via the shared contract (guard-SELECT pattern,
    never the driver's changes counter) + lazy delegation.
  - **Injection**: `memoryContext.ts` reproduces the desktop block VERBATIM (TALOS_MEMORY_CONTEXT +
    untrusted-boundary instruction + numbered MEMORY blocks capped 2000 + USER_TASK); applied in the
    controller completion wrapper to the LAST user turn of the PROVIDER payload only — the persisted message
    stays verbatim; `used_memories` disclosure (desktop shape) lands in the user message metadata;
    `last_used_at` touched; send/resend/retry all covered; retrieval = active ∩ (global|project|THIS
    session), cap 20.
  - **Station**: route `memory` (7 tab routes), sidebar Tools entry, `MemoryScreen` (create
    title/content/kind/scope, list with status+scope badges and "Used …" provenance, enable/disable,
    delete behind dialog, untrusted banner) — substrate ready for #27 (pre-seeded self-knowledge base).
  - **Chat disclosure**: "N memories used" chip on the user message (`talos-used-memories`).
  - Gates: schema 4/4, repos 27/27 + contract, memoryContext 5/5, controller 31/31, route wiring 3/3,
    E2E journey (create → inject → disclose → verbatim persistence → disable → no injection) 1/1,
    entry 456.2k/512k, TSC 0.
- 2026-07-23: **#24 DONE** — the loading-answer bubble now shows the boot-logo line loader: faint gold
  track (first-frame 0.18 opacity echo), a sweep drawing left→right, 3 empty nodes that FILL exactly as the
  line reaches them (delays matched to node x-positions); reduced-motion = static filled state; streaming
  footer dots intentionally kept (they signal active token flow). Contract test updated (13/13).
- 2026-07-23: **F4 final gates** — unit 706/706 (118 files) · e2e 45/45 · TSC 0 · entry 456.5k/512k ·
  10 ultra-critical captures in `docs/superpowers/evidence/f4-captures/` (swipe tray, model drawer +
  used-memories chip visually verified).
- 2026-07-23: **SF-CRITIC (subagent) — 13 findings, all adjudicated:**
  - **FIXED (all 6 MAJOR)**: SF-1 legacy-PIN lock trap (verify input is 8 wide + explicit Confirm from 4
    digits — a pre-F4 4-8 digit PIN can always disable the lock); SF-2 stale swipe flag ate the next real
    tap on TOUCH (no trailing click there) — `start()` now clears it, unit-tested; SF-3
    `revokeFileAuthorityGrant` no longer early-returns on `changes===1` — read-back always decides
    (unit-tested with a lying driver); SF-4 undisclosed memory injection impossible — disclosure+selection
    set together, any failure resets both, touch is best-effort, in-flight sends keep their selection; SF-5
    reorder/archive are metadata-only via new `updateSessionMetadata` — recency (`updated_at`) preserved
    (unit-tested); SF-6 write-queue mutex in `transaction()` + `actionBusy` guard on every ChatsScreen
    action (no more "transaction within a transaction" store poisoning on double-taps).
  - **FIXED (MINOR)**: SF-8 tray buttons `tabindex=-1`/aria-hidden while the reveal is closed; SF-9
    Sortable rebinds via `watch(listRef)` (survives empty-list unmounts); SF-10 session-scoped memories die
    with their session (contract-tested on both repos); SF-11 native export deletes the plaintext Cache
    file after sharing; SF-13 PinInput doc drift corrected.
  - **DEFERRED with justification**: SF-7 ComposerSheet full modality (focus trap + inert) — real but
    needs the reka-ui DialogContent migration for all four sheets; scheduled next phase with #28; initial
    focus + Escape + backdrop already work. SF-12 memory-title header injectability — desktop shares the
    IDENTICAL weakness (TalosChatController.php:2841); owner-authored titles = low risk; goes into the
    Codex coordination ticket as a JOINT desktop+mobile fix so the two products stay byte-identical.
  - **Post-SF gates**: unit 708/708 (118 files) · e2e 45/45 · TSC 0 · build green.

## F5 queue (owner device feedback on the F4 APK, 2026-07-23 — install succeeded via USB bypass)
15. **#29 MIC RECORDING DEAD AT TAP** — permission granted, button visible (per #18), but tapping it does
    NOTHING: no recording, no error banner. The #18 contract promised honest failure at tap — something in
    `start()`/listener wiring fails silently on device. F5: reproduce with the in-app diagnostics row
    (Settings → Account) as evidence, add tap-level feedback that can never be silent, fix the native start
    path.
16. **#30 ENHANCER DRAWER LOADER** — the prompt-enhancer drawer gets a modern TALOS-style loading state
    (reuse the #24 boot-logo line loader for coherence) instead of the plain text status.
17. **#31 CHAT ROW STYLE** — swipe rows on the Chats page: LESS rounded corners; and the border visible on
    the RIGHT edge (tray/row edge peeking under the content) must be cleaned up.
18. **#32 PIN AS FULLSCREEN MODAL** — the PIN setup flow becomes a SEPARATE FULLSCREEN modal surface, not
    inline in the Account panel.
Plus already queued: **#28** streaming scroll hijack + back-to-bottom pill; **SF-7** sheet focus-trap/inert
(reka-ui DialogContent migration); then Tasks/Notes/Doctor stations; #27 with the Claude-parity program.

## Coordination tickets (relay to Codex — desktop/integration lane)
1. **CODEX-F4-01 · Sensitive censor default (desktop)** — owner directive (verbatim in `no-sensitive-censor`
   memory + this ledger): the mobile censor was OBLITERATED as senseless. Desktop still ships
   `sensitive_censor` default ON. Surface to the owner for the desktop decision; do NOT silently change.
2. **CODEX-F4-02 · JOINT memory-header injection hardening** — `TalosChatController.php:2841`
   (`withMemoryContext`) and mobile `src/lib/chat/memoryContext.ts` share an unescaped
   `title=${memory.title}` in the MEMORY block header: a newline in a title can forge block boundaries.
   Fix must land on BOTH sides with the identical escaping (desktop already JSON-wraps FILE names for this
   exact reason) so the block format stays byte-identical.
3. **CODEX-F4-03 · Overlay exit input-eating (desktop check)** — mobile found reka-ui/shadcn overlays
   eating input while animating OUT (`data-open:`/`data-closed:` variants never matching + inline
   pointer-events of the dismissable layer). Mobile fix: `data-[state=closed]:pointer-events-none!` on
   Drawer/Dialog overlays. If desktop vendors the same shadcn recipes, mirror the audit.
4. **CODEX-F4-04 · Export contract coupling** — mobile now generates the 4 session-export artifacts
   LOCALLY with the desktop `TalosSessionExportService` report_type strings and redaction rules as the
   frozen reference. Any future change to the desktop export shapes MUST be mirrored in
   `src/lib/chat/sessionExport.ts` (mobile) — add to the desktop-change checklist.
5. **CODEX-F4-05 · Streaming scroll + back-to-bottom (#28, next mobile phase)** — desktop gap report
   A.3-bis already lists the live-edge pill; when mobile lands #28, evaluate the desktop mirror.
