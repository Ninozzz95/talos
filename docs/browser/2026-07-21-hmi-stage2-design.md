# Browser HMI reliability — Stage-2 design (scrollable snapshot + reliable ref/locator click)

**Date:** 2026-07-21 · **Owner:** Codex (backend/integration) · **Scope:** Stage-2 of the browser-reliability epic. Stage-1 (recovery-lock self-heal + verified reconcile) is the sibling doc `2026-07-21-hmi-recovery-stage1-design.md`.
**Principle:** library-first + reuse existing machinery; **do NOT weaken the fencing invariants.** Read-only investigation — no product code changed by this doc.

Two independent stages:
- **2a — Scrollable snapshot** (do FIRST; contained, no attestation change).
- **2b — Reliable ref/locator click** (replace coordinate hit-test with Playwright actionability; additive during migration).

---

## 0. How the HMI click works today (the thing we are changing)

The HMI path is coordinate-based, end to end:

1. **FE** — `TalosBrowserInteractiveFrame.vue` maps a click on the screenshot `<img>` to `normalized_x/y` (`onStageClick :372` → `mapBrowserImagePointer` → `dispatchPointer :345`), emits `interact`. `useTalosBrowse.interactWithScreenshot` (`:653`) POSTs `talos_browser_hmi_pointer_v2` with `normalized_x/y`, `artifact_id`, `artifact_sha256`, `state_version` (`:662-676`).
2. **Control-plane** — `TalosBrowserHmiController::pointer` (`:45`) → `workerPointer` (`:679-691`) builds the worker `talos_browser_hmi_pointer_v2`, `commandId` (`:694-713`) is a sha256 over the click binding; `preflightPointer` (`:105`) → `classify` runs `navigationPolicy->inspect(href)` on the target (`:949-968`); then `execute` (`:469`) dispatches, and after the click re-checks `navigationPolicy->inspect(finalUrl)` → `FINAL_URL_DENIED` (`:585-589`), then `validExecuteResult` (`:891-942`).
3. **Worker** — `BrowserHmiService.execute` (`:70`): `point()` (`:312`) converts normalized→viewport px via `viewportPixel` (`:446`, clamped to viewport); `inspectedTarget` (`:321`) hit-tests via CDP `DOM.getNodeForLocation` (`BrowserHmiAttestation.inspectBrowserTarget :100`), derives a viewport pixel `targetFrameRegion` (`:400`), compares it against the source frame (`compareFrameTargetRegion :335` → `TALOS_BROWSER_FRAME_STALE :342`), and computes the **fingerprint** (`:375-390`) over `{session_id, state_version, source_frame_sha256, target_region_sha256, target_region, frame_id, loader_id, backend_node_id, document_url_digest, current_page_url_digest, normalized_x, normalized_y, destination_digest, target facts}`. Dispatch is `dispatchGuardedBrowserClick` (`BrowserHmiAttestation :204`): re-hit-test at (x,y), verify frame identity + backendNodeId, install a **trusted-event guard listener** on the element (`:263-365`, checks `event.isTrusted`, button, `detail===clickCount`, `path.includes(target)`, `effectMatches`), then `page.mouse.click(point.x, point.y)` (`:373`), then verify the guard saw a clean trusted sequence → else `dispatch_guard_rejected` (`:393`).

**Why it is fragile.**
- The screenshot is **viewport-only** (`BrowserFrameCapture.ts :5-10`, `page.screenshot` with no `fullPage`); `viewportPixel` clamps to the viewport (`:446`); there is **no scroll op** → below-the-fold content is unreachable (harness step-6 confirms the wheel does nothing, `browse-debug.mjs :544-565`).
- `FRAME_STALE`/`TARGET_STALE` are pixel-region bindings (`targetFrameRegion :400`, `compareTargetRegion` in `BrowserFrameEvidenceStore.ts :96`). Any late paint / animation / cookie-wall fade between preflight and execute changes the region pixels → 409, even though the intended element never moved. This is the class the user hits on `caradero-web.vercel.app`.
- Hit-testing the topmost element at (x,y) means a **cookie-wall overlay** returns the overlay as the target — the click lands on the wrong thing (or is denied) rather than on what the user meant.

**Key reuse asset.** The agentic *tools* path already does exactly the model we want for 2b: `BrowserToolDispatcher.click` (`:246-487`) resolves a snapshot **ref → `ElementHandle`** (`stored.value.refBindings.get(node.ref) :278`), re-verifies element identity (role/name/`documentToken`/visibility, `:281-403`), then calls **`binding.click()`** (`:422`) — a Playwright handle click that brings **actionability auto-wait + auto-`scrollIntoViewIfNeeded`** and errors cleanly on obstruction. Stage-2b is essentially: bring that ref/handle model into the HMI path **while keeping the HMI trusted-event attestation + navigation post-check + command ledger**. The refBindings map already exists on every snapshot (`BrowserSnapshot.ts :293-303, :327`) and is disposed on state change (`BrowserSessionManager.disposeSnapshot :670`).

---

## Stage 2a — Scrollable snapshot *(do first; no attestation change)*

### Options evaluated
| # | Approach | Verdict |
|---|---|---|
| (i) | **`page.mouse.wheel(dx,dy)` → advance state → re-capture frame+snapshot** | **RECOMMENDED.** Keeps the viewport-only coordinate model intact (each frame is still a viewport screenshot the existing click path already understands). Scroll is just another state-advancing mutation, exactly like `browser_wait_for`/`navigate`. Minimal blast radius. |
| (ii) | `locator.scrollIntoViewIfNeeded()` for a target | Rejected as the *scroll primitive* — it needs a target ref, so it only makes sense **inside** 2b's click (where `handle.click()` already does it for free). Not a general "scroll the stage" affordance. |
| (iii) | `fullPage:true` screenshot (whole page in one snapshot) | Rejected. Changes the coordinate model (normalized y no longer maps to the viewport; `viewportPixel :446`, `documentCoordinates :538` and the whole pixel-region binding assume viewport height). Would break `FRAME_STALE`/`TARGET_STALE` and inflate the artifact past `MAX_VIEWPORT_PIXELS` (`BrowserFrameEvidenceStore :7`). High risk, defers nothing. |

### 2a recommended design — a new state-advancing **scroll** verb

A wheel scroll is a mutation that changes what is visible → it must **advance `state_version`** (like `advanceState`, used by `browser_wait_for` `BrowserToolDispatcher :241`) so the frame-region binding and stale-detection stay sound, and re-capture a fresh **frame + snapshot** at the new version. This reuses the exact evidence pipeline `navigate`/`screenshot` already use.

**Worker verb — `BrowserHmiService.scroll` (new method, mirrors `preflight`'s structure `:42`).** Runs under `sessions.runExclusive`. Steps:
1. `assertCapability` (`:303`) + `assertState(state_version)` (reuse `:82`).
2. `session.page.mouse.wheel(0, dy)` (bounded `dy`, see contract).
3. Settle using the **existing** quiescence machinery (`createQuiescenceTracker` / `installDomProbe` `:547/611`) — a scroll can trigger lazy-load/IntersectionObserver paints; reuse, don't invent.
4. `advanceState(sessionId)` (`BrowserSessionManager :378`).
5. `captureCanonicalBrowserFrame` (`:159`) + `captureSnapshot` (`:208`); `recordFrame`/`recordSnapshot` at the new version (`:227-228`).
6. Return a **result envelope shaped exactly like `talos_browser_hmi_result_v2`** minus the `target`/`command_id`/effect fields — i.e. `{schema_version, session_id, source_state_version, state_version, url, title, screenshot{...}, snapshot{...}, captured_at}`. Reusing the result shape lets the control-plane store it with the identical `validExecuteResult`-style validator and evidence path.

**Contract — new schema `talos_browser_hmi_scroll_v2`** (add to `BrowserHmiContracts.ts`, alongside `pointerRequestBase :28`):
```
Request  talos_browser_hmi_scroll_v2:
  schema_version: "talos_browser_hmi_scroll_v2"
  interaction_id: uuid
  command_id:     commandIdSchema           # idempotent, same ledger as pointer
  state_version:  int >= 0
  expected_frame_sha256: sha256:…           # binds to the frame the user scrolled from
  delta_y:        int, -3*viewport_h … +3*viewport_h   # bounded; delta_x fixed 0 for now
Response talos_browser_hmi_scroll_result_v2:
  schema_version, session_id, source_state_version, state_version (=source+1),
  frame_sha256(source), url, title, screenshot{mime,width,height,sha256,base64}, snapshot{…}, captured_at
```
Idempotency: route the scroll through the **existing `BrowserHmiCommandLedger`** (`claim/markDispatched/commit :50-112`) exactly like `execute` (`:76`), so a replayed `command_id` returns the stored result rather than double-scrolling. Scroll needs **no action-capability** (it is read-only-ish, mutates only scroll offset, opens nothing) — do NOT add it to the consequential list in `actionCapabilityFor` (`HttpBrowserSessionClient :676`); keep it a plain worker-token request like `/snapshot`.

**Worker route** (`server.ts`, sibling of `:317`/`:330`):
`POST /sessions/:id/hmi/scroll` → `BrowserHmiScrollRequestSchema.safeParse` → `ownedSession` → `browserHmi.scroll(...)`. No `verifyAndConsume` (unlike execute `:340`).

**Control-plane route + controller.** New `Route::post('/browser/sessions/{browserSession}/scroll', [TalosBrowserHmiController::class, 'scroll'])` in `routes/api.php` (next to `:82`). New `TalosBrowserHmiController::scroll` that: `owned`+`operable` (`:1122/:1107`), validates `delta_y`, calls a new `BrowserSessionClient::scroll`, validates the result envelope (a trimmed `validExecuteResult :891`), then **stores the frame + promotes it exactly like `TalosBrowserController::screenshot` (`:280-311`)** but with `worker_state_version` advanced to `source+1` (like `navigate :213-230`): store artifact, `update(['worker_state_version'=>newV, 'last_screenshot_artifact_id'=>artifact->id])` guarded by `where('worker_state_version', $sourceStateVersion)`. Also store the snapshot artifact like `snapshot :337-342`. Emit `hmi.scroll.captured` audit event.

**FE affordance** (`TalosBrowserInteractiveFrame.vue` + `useTalosBrowse.ts`). The evidence stage (`browser-evidence-stage :636`) currently swallows the wheel. Add:
- A `@wheel` handler on the stage that, only when `isCurrentInteractiveFrame` (`:162`) and zoom===1, accumulates `deltaY` and (debounced) calls a new `useTalosBrowse.scrollFrame(deltaY)`.
- `scrollFrame` POSTs `/browser/sessions/{id}/scroll` with `{schema_version:'talos_browser_hmi_scroll_v2', interaction_id, command_id, state_version, artifact_id, artifact_sha256, delta_y}`, then `refreshActive` (`:358`) so `last_screenshot_artifact_id`/`state_version` roll forward and the stage repaints the new frame — the same promote-and-repaint loop `applyInteraction` uses after a click (`:594-606`). When zoom>1 keep the current pan behaviour (`onPointerMove :416`); scroll only drives the remote page at 1×.
- Optional explicit "Scroll down / up" buttons in the stage toolbar (`:617-633`) for discoverability and for keyboard/a11y parity.

### How coordinates/refs stay valid after scroll
- **Coordinates:** each scroll produces a **new viewport frame at a new `state_version`**; the FE's next click binds `expected_frame_sha256`/`state_version` to *that* frame. `viewportPixel`/`documentCoordinates` (`:446/:538`) keep mapping normalized→viewport of the current frame — nothing about the coordinate math changes, because we never leave the viewport model. The old (pre-scroll) frame's `state_version` is now stale, so a late click on it correctly 409s `STALE_STATE` (`assertState :82`) — no silent mis-click.
- **Refs:** `captureSnapshot` runs after the scroll, so `refBindings` (`:293-303`) point at the elements now in view; the previous snapshot is disposed by `recordSnapshot`→`disposeSnapshot` (`:670`). The `documentToken` is unchanged by a same-document scroll, so a 2b ref captured post-scroll stays resolvable until the next state change.

---

## Stage 2b — Reliable ref/locator click *(additive; preserves attestation)*

### Design — resolve a **snapshot ref → Playwright handle → attested `handle.click()`**

Replace the coordinate hit-test with the ref model the tools path already proves (`BrowserToolDispatcher.click :246`), but keep every HMI fence. New worker verb `BrowserHmiService.executeRef` (peer of `execute :70`):

1. **Resolve + re-verify identity** (reuse `BrowserToolDispatcher.click :256-403` verbatim in spirit): load `stored = sessions.snapshot(sessionId)`; require `stored.stateVersion === session.stateVersion` and `stored.value.snapshotId === input.snapshot_id`; find `node = stored.value.nodes.find(ref===input.ref)`; require `stored.value.documentToken === documentToken(page)`; `binding = stored.value.refBindings.get(node.ref)`; `binding.evaluate(...)` to re-read live `role/name/visible/disabled/fileChooser/download/newContext` and require they still equal the snapshot node. This *is* the freshness check — it replaces `FRAME_STALE`/pixel-region entirely.
2. **Policy gates** (same as `execute :101-134`): deny on `!visible || disabled`, `opens_new_context`, `input_type==='file'`, `is_download`, and the sensitive-effect classification. `href`/destination still runs `navigationPolicy->inspect` in the control-plane preflight (`:949`).
3. **Attested dispatch — keep `dispatchGuardedBrowserClick`, feed it the ref-resolved element.** Refactor `dispatchGuardedBrowserClick` (`:204`) to accept the **target element (resolved from the ref's `backendNodeId`)** instead of re-deriving it from (x,y):
   - Install the **same trusted-event guard listener** on that element (`:263-365`) — unchanged: `event.isTrusted`, button===0, `detail===clickCount`, `path.includes(target)`, `effectMatches()`.
   - Run the **same** `hasUnexpectedRelevantListeners` check for ordinary effects (`:367-370`).
   - Replace `page.mouse.click(point.x, point.y)` (`:373`) with **`binding.click({button:'left', clickCount})`** (Playwright handle click). This dispatches **trusted** OS-level mouse events (so `isTrusted` stays true), and adds actionability auto-wait (visible/stable/enabled/**receives-events**) + auto-`scrollIntoViewIfNeeded`. If a cookie-wall overlays the target, Playwright's receives-events hit-test fails → it retries then throws `TimeoutError` → we map to a **clean** recovery reason (`obstructed_target`) instead of clicking the overlay.
   - Keep the post-click guard verification (`:378-401`) → `dispatch_guard_rejected` unchanged.
4. **Evidence + quiescence + recovery**: identical to `execute :183-296` (arm fence, quiescence, evidence-frame-changed check, `recordSnapshot`/`recordFrame`, command-ledger commit / ambiguous-recovery).

### New target fingerprint (ref/element-identity attestation)
Drop the two viewport-pixel terms that scroll invalidates — `target_region_sha256` and `target_region` — and the `normalized_x/normalized_y` terms. Compute the fingerprint (`inspectedTarget :375`) over **element identity**:

```
fingerprint = sha256(canonicalJson({
  session_id, state_version,
  source_frame_sha256,            # still binds to the frame the user acted from (what-you-saw)
  snapshot_id,                    # binds to the exact snapshot the ref came from
  ref,                            # r-index within that snapshot
  frame_id, loader_id,            # document identity (unchanged)
  backend_node_id,                # stable element identity from DOM.describeNode
  document_url_digest, current_page_url_digest,
  aria_role, aria_name,           # role + accessible name re-read live (:281-392)
  destination_digest,             # href/form action (unchanged)
  target: facts                   # tag/role/name/input_type/href/form_method/is_editable/is_submit/…
}))
```
This keeps **document + element identity + accessible name/role + destination** in the fingerprint (everything the trusted-event `effectMatches()` guard already validates at dispatch, `:281-336`), so preflight↔execute agreement still proves "same element, same document, same consequence". It removes only the pixel geometry that scrolling legitimately changes. `source_frame_sha256` + `snapshot_id` preserve the "what the user saw is what gets clicked" guarantee: the ref is only valid against the snapshot captured for the frame the user was looking at.

### What happens to `FRAME_STALE` / `TARGET_STALE`
- `TALOS_BROWSER_FRAME_STALE` (pixel-region mismatch, `inspectedTarget :342`) and the geometry `TALOS_BROWSER_TARGET_STALE` (`targetFrameRegion :411`) **disappear for the ref path** — there is no pixel-region comparison. `compareFrameTargetRegion` (`:335`) is not called by `executeRef`.
- Freshness is enforced instead by **snapshot/state identity** (`snapshot_id` + `state_version` + `documentToken`) and the **live role/name re-read** (`:396-398` style → `TALOS_BROWSER_REF_CHANGED`/`REF_MISSING`). Auto-wait absorbs the transient late-paint races that today spuriously trip `FRAME_STALE`.
- The fingerprint-mismatch guard (`execute :96`) stays, but now compares the element-identity fingerprint. A genuinely swapped element (SPA re-render) → `REF_CHANGED`/`TARGET_STALE` as today; a mere repaint no longer trips it.

### Contract changes (FE sends a ref, not x/y)
New additive schemas in `BrowserHmiContracts.ts` (peer of `pointerRequestBase :28`):
```
talos_browser_hmi_ref_v2 (preflight + execute):
  schema_version, interaction_id, state_version,
  expected_frame_sha256,          # source frame binding (kept)
  snapshot_id: ^snap_[A-Za-z0-9-]+$
  ref:         ^r[0-9]+$          # reuse the exact ref grammar (BrowserToolContracts :152)
  element?:    string<=512        # optional descriptive name, cross-checked like tools click (:266)
  click_count: 1|2
  # execute adds: command_id, expected_fingerprint, effect_classification, sensitive_effect_authorized
```
Result stays `talos_browser_hmi_result_v2` (already carries `snapshot.nodes` `:125-131`), so the control-plane `validExecuteResult` (`:891`) and FE `applyInteraction` are unchanged. The control-plane `workerPointer` (`:679`) gains a `workerRefPointer` sibling; `commandId` (`:694`) binds over `{…, snapshot_id, ref, click_count}` instead of `{normalized_x, normalized_y}`.

**FE.** Today the interactive frame renders only the screenshot image and captures x/y. For the ref path, render the returned `snapshot.nodes` (role/name/`visible`) as an **interactive overlay/list** over the stage — each actionable node (roles in `SEMANTIC_CLICK_ROLES :34`) becomes a clickable ref target. `useTalosBrowse.interactWithScreenshot` (`:653`) gains a `interactWithRef(ref, snapshotId)` sibling posting `talos_browser_hmi_ref_v2`. The x/y `dispatchPointer` (`:345`) can remain during migration.

### Migration / back-compat — **make 2b additive** (recommended)
- **B-add (RECOMMENDED):** ship `talos_browser_hmi_ref_v2` as a **new pointer op alongside** the coordinate `talos_browser_hmi_pointer_v2`. New worker route `POST /sessions/:id/hmi/ref/{preflight,execute}` + new control-plane route `…/interactions/ref`; the coordinate routes (`server.ts :317/:330`, `api.php :82`) stay byte-for-byte. Gate the FE ref UI behind a flag; validate on `caradero` via the harness; only then flip the default and later retire the coordinate op. The `hmiActions` capability already implies both `click`+`interactive_frame` (`HttpBrowserSessionClient :231`), so no handshake change.
- **B-replace (NOT recommended for first cut):** swap the coordinate hit-test in place. Smaller surface but couples the scroll rollout to a click-model change and loses the A/B fallback if a site defeats ref resolution.

---

## Per-stage harness verification plan (`control-plane/tests/live/browse-debug.mjs`)

**Existing harness already probes both** — extend its assertions:
- **2a scroll (step 6 `:544-565`).** Today it records `scrollWorks:false` ("static frame — wheel does not scroll"). New assertion: after the wheel/scroll-button drives `POST …/scroll`, `report.keyFindings.scrollWorks === true` **and** the stage `img` `src`/`data-browser-artifact-id` changed **and** `state_version` incremented **and** `analyzeImage` (`:752`) shows different `snapshotPixelSummary` (content below the fold now visible). Add a check that a click on the *pre-scroll* frame returns `STALE_STATE` (proves the state fence).
- **2b click through the cookie-wall (step 7 `:568-628`).** Target `caradero-web.vercel.app` (`:35`). New assertion: a ref-based click on a vehicle-card link **succeeds (201)** with **no `FRAME_STALE`/`TARGET_STALE`** in `apiLog`, and `keyFindings.clickFinalStatus===201`, even with the cookie banner present (auto-`scrollIntoViewIfNeeded` + actionability). Negative case: click a ref that is genuinely covered by a modal → expect a **clean** `obstructed_target` recovery, never a wrong-element 201. Keep step-8 retry (`:631`) asserting the session is **not** stuck (ties into Stage-1 verified reconcile).

TDD before live: unit-test `executeRef` identity re-verify (ref/role/name/documentToken mismatch → `REF_CHANGED`/`REF_MISSING`), fingerprint recomputation, and `dispatchGuardedBrowserClick` still rejecting a synthetic (non-trusted) event; unit-test `scroll` advances state + re-captures + is idempotent by `command_id`.

---

## Security review checklist (every invariant preserved)

| Invariant | Where today | Under Stage-2 |
|---|---|---|
| **Trusted-event dispatch guard** | `dispatchGuardedBrowserClick :263-401` (isTrusted, button, detail, path, `effectMatches`, `dispatch_guard_rejected`) | **Unchanged.** 2b only swaps `page.mouse.click(x,y)` → `binding.click()`; both dispatch **trusted** events, guard installed on the same element (now ref-resolved). 2a does not click. |
| **Navigation policy pre-check** | `classify`→`navigationPolicy->inspect(href)` (`:949-968`) | **Unchanged** — runs on the target `href` in ref preflight too. |
| **Navigation policy post-check** | `navigationPolicy->inspect(finalUrl)` → `FINAL_URL_DENIED` (`:585-589`) | **Unchanged** — `executeRef` returns the same result envelope; controller path identical. |
| **Terminal recovery reasons** | `FINAL_URL_DENIED`, artifact-integrity (`:805`), `dispatch_guard_rejected`, `new_context`/`download`/`file_chooser` (`recoveryReason :517`, tripwires `BrowserSessionManager :615-641`) | **Unchanged**; 2b adds one new *terminal-ish* reason `obstructed_target` (Playwright actionability timeout) — fails safe (no click landed). Scroll adds none. |
| **Per-command idempotency** | `BrowserHmiCommandLedger` (`:50-131`); controller `commandId`/approval lease | **Reused** by both `scroll` and `executeRef` (same `claim/markDispatched/commit/markAmbiguous`). `commandId` rebound over ref/scroll fields. |
| **Signed action capability on execute** | `verifyAndConsume(hmi_pointer_execute)` (`server.ts :340`; `actionCapabilityFor :676`) | **Kept** for `executeRef` (new op id e.g. `hmi_ref_execute` added to the consequential list). **Scroll is read-only → intentionally no capability**, like `/snapshot`. |
| **Single-page / no new context / no download** | `assertSinglePage :268`, tripwires, `execute :106-120/:188-194` | **Unchanged** — `executeRef` runs the identical post-dispatch guards; `binding.click()`'s auto-scroll cannot open tabs. |
| **Evidence frame integrity** (screenshot↔snapshot same document, no mid-capture mutation) | `execute :197-225` mutation-count + document-identity check | **Reused verbatim** by `executeRef` and by `scroll`'s capture. |
| **Bounded outputs / no fullPage bloat** | viewport screenshot (`BrowserFrameCapture :5`), `MAX_VIEWPORT_PIXELS` (`BrowserFrameEvidenceStore :7`) | **Preserved** — 2a stays viewport-only (rejected fullPage option iii for this reason). |
| **What-you-saw-is-what-you-click** | pixel-region binding (`targetFrameRegion`) | **Re-expressed**, not dropped: `source_frame_sha256` + `snapshot_id` in the fingerprint bind the ref to the frame/snapshot the user was shown; ref only resolves against that snapshot's `refBindings`. |

**Top risk to watch.** Dropping the **pixel-region** binding (`target_region_sha256`) is the one real trust-model change: the ref fingerprint now trusts DOM identity (`backendNodeId` + aria role/name + `documentToken`) instead of "these exact on-screen pixels." A hostile page that keeps `backendNodeId`/role/name stable while repainting the pixels under the cursor could, in principle, make the click land on visually-different content. Mitigation: keep `snapshot_id`+`documentToken`+live role/name re-read (already in the tools path `:396`), keep `source_frame_sha256` in the fingerprint, and — belt-and-braces — have `binding.click()`'s actionability (visible/stable/**receives-events**) reject a target that has been moved/covered since capture. This is a **net security improvement** over "click whatever pixel is topmost," but it must be called out and reviewed as a trust-model change, not a silent refactor.

---

## Recommendation summary
- **Scroll approach:** option (i) — `page.mouse.wheel` → `advanceState` → re-capture frame+snapshot as a new `talos_browser_hmi_scroll_v2` state-advancing verb reusing the `screenshot`/`navigate` evidence pipeline. Reject fullPage (breaks the coordinate/pixel-region model) and reject bare `scrollIntoViewIfNeeded` as the stage primitive.
- **Ref-attestation scheme:** fingerprint over `{session_id, state_version, source_frame_sha256, snapshot_id, ref, frame_id, loader_id, backend_node_id, document_url_digest, current_page_url_digest, aria_role, aria_name, destination_digest, target facts}` — element identity, not viewport pixels. Dispatch stays through `dispatchGuardedBrowserClick` (trusted-event guard) but clicks via `binding.click()` (actionability + auto-scroll + obstruction detection).
- **Files to change — Stage 2a:** `browser-worker/src/`: `BrowserHmiService.ts` (+`scroll`), `BrowserHmiContracts.ts` (+scroll schemas), `server.ts` (+`/hmi/scroll` route). control-plane: `TalosBrowserHmiController.php` (+`scroll`), `HttpBrowserSessionClient.php`/`BrowserSessionClient.php` (+`scroll`), `routes/api.php` (+route). FE: `useTalosBrowse.ts` (+`scrollFrame`), `TalosBrowserInteractiveFrame.vue` (+wheel/buttons). Harness: `browse-debug.mjs` step-6 assertions.
- **Files to change — Stage 2b (additive):** `browser-worker/src/`: `BrowserHmiService.ts` (+`executeRef`/`preflightRef`, reusing `BrowserToolDispatcher.click`'s ref-resolution), `BrowserHmiAttestation.ts` (`dispatchGuardedBrowserClick` accepts a ref-resolved element; fingerprint recompute in `BrowserHmiService.inspectedTarget`), `BrowserHmiContracts.ts` (+`talos_browser_hmi_ref_v2`), `server.ts` (+`/hmi/ref/*` routes). control-plane: `TalosBrowserHmiController.php` (+ref pointer/`workerRefPointer`/`commandId`), `HttpBrowserSessionClient.php` (+ref preflight/execute + `hmi_ref_execute` consequential), `routes/api.php` (+`…/interactions/ref`). FE: `useTalosBrowse.ts` (+`interactWithRef`), `TalosBrowserInteractiveFrame.vue`/`TalosBrowserScreenshotEvidence.vue` (+snapshot-node overlay). Harness: `browse-debug.mjs` step-7 assertions.
- **Sequence:** 2a first (low risk, unlocks below-the-fold), then 2b additive behind a flag, validated on `caradero` before flipping the default and retiring the coordinate op.
