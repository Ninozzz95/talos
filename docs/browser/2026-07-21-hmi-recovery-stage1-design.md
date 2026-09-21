# Browser HMI reliability — Stage-1 design (recovery lock no longer dead-ends on transient)

**Date:** 2026-07-21 · **Owner:** Codex (backend/integration) · **Scope:** Stage-1 of the browser-reliability epic (recovery-lock only; click ref/locator + scroll = Stage-2).
**Principle:** library-first + reuse existing machinery; **do not weaken the fencing invariants.**

## Root cause (evidence)
- `TalosBrowserHmiController::recoveryRequired()` (`:1151-1201`) sets session `status='recovery_required'` (sticky) and returns HTTP 409 `TALOS_BROWSER_HMI_RECOVERY_REQUIRED` — message *"The browser interaction may have occurred, but TALOS could not commit current evidence."* — **uniformly for transient AND terminal reasons**.
- `TalosBrowserController::reconcileForReuse()` (`:531`) re-affirms `recovery_required` on every re-inspect (`sourceStatus==='recovery_required' → 'recovery_required'`). **There is no in-place clear** → the user must abandon the session and POST a new `/browser/sessions`. This is the wall the user hits.
- The transient reasons are **idempotent commit races** on operations already keyed by `commandId` / `approvalId`+leaseToken, plus worker settling timeouts, plus one genuinely-ambiguous outcome.

## Classification (used by Stage-1)
| Class | Reasons |
|---|---|
| **TRANSIENT** (self-heal / reconcilable) | `EVIDENCE_COMMIT_FAILED` (`:611`), `AUDIT_COMMIT_FAILED` (`:635`), `APPROVAL_RESULT_COMMIT_FAILED` (`:660/663`), `EXECUTION_OUTCOME_UNKNOWN` (`:578`), `EVIDENCE_BINDING_INVALID` (`:582`); worker `quiescence_timeout`, `navigation_settlement_timeout`, `evidence_frame_changed` |
| **TERMINAL** (stay locked → abandon) | `FINAL_URL_DENIED` (`:588`), artifact-integrity (`:805`), worker `dispatch_guard_rejected`, `new_context_opened` / `download_started` / `file_chooser_opened` |

## Change A — self-heal the transient commit races *(SAFE — no fencing change)*
Wrap the three **idempotent** commit ops in a bounded retry (Laravel `retry(attempts, fn, backoffMs)` — a framework primitive, not bespoke) **before** falling through to `recoveryRequired()`:
- `artifacts->storeHmiCapture()` (`:603`, keyed by `commandId`)
- audit `eventOnce()` ×2 (`:616/625`, dedup by `commandId`)
- `approvals->completeExecution()` (`:653`, keyed by `approvalId`+leaseToken)

All three are idempotent → retry is safe and cannot double-apply the click (the click already happened once, upstream). This eliminates the **most common** "could not commit current evidence" outright.
Plus a **narrow** `Http::retry` on `HttpBrowserSessionClient::send()` scoped to **connection-establishment failures only** (pre-dispatch, unambiguously safe) → fewer `WORKER_UNAVAILABLE` / `EXECUTION_OUTCOME_UNKNOWN`.

## Change B — in-place recovery for transient locks *(fencing-sensitive — DESIGN FORK)*
When a transient reason **does** exhaust retries and the session locks, give an in-place exit instead of forcing a new session:

- **B1 — RECOMMENDED (reuse + do NOT weaken the invariant):** keep `reconcileForReuse`'s sticky safety exactly as-is. Add to the 409 body `recoverable: true|false` + `recovery_reason_class` (from the table above). Expose a **verified reconcile transition** that re-inspects the worker + captures the current frame, and clears `recovery_required → operable` **only when the worker is healthy and the evidence reconciles** — leveraging the existing lease-reclaim / replay machinery (`renewExecutionLease` / `reclaimForExecution`, `:1267-1321`) rather than a blind auto-clear. Terminal reasons → `recoverable: false` → FE offers "restart session". The invariant (*unverified evidence ⇒ refuse further interaction*) is preserved; we only add a **verified** path back.
- **B2 — NOT recommended:** weaken `reconcileForReuse:531` to let `recovery_required → operable` whenever the worker looks healthy. Simpler, but it can proceed on **unverified** state → a real safety hole.

## FE (`useTalosBrowse`) — Stage-1 tail
Read `recoverable` + `recovery_reason_class`; transient → a **"Recupera / Riprova"** affordance that triggers the verified reconcile (no restart); terminal → **"Riavvia sessione"**. (No snapshot-scroll here — that's Stage-2.)

## Verification (TDD, then live)
1. transient commit race (store throws once → succeeds): 201, no recovery, session stays operable.
2. transient exhausts: 409 with `recoverable:true`; verified reconcile clears to operable after worker re-verify.
3. terminal (`FINAL_URL_DENIED` / tampered frame): 409 `recoverable:false`; reconcile does **not** clear.
4. connection blip on `send()`: retried, succeeds.
5. **Live**: reproduce against `caradero-web.vercel.app` links on :8088 — confirm the lock no longer forces a new session.

## Non-goals (Stage-2)
ref/locator click model (replace coordinate hit-test), aria-snapshot swap, snapshot **scroll**, worker-side settling via Playwright waiting primitives. Tracked separately.
