# TALOS Interactive Browser Evidence

TALOS can expose the Browser Worker as an evidence-backed assistant tool and,
separately, as an explicitly authorized human interaction surface. Both paths
use real Playwright browser state, but they have different capabilities and
trust boundaries.

## Product Boundary

- Model tools are procedural and schema-bound. They can navigate, inspect,
  read, and capture evidence according to policy.
- Human interaction is a separate HMI contract. A pointer action originates
  from an authenticated user clicking a current screenshot in TALOS.
- Model output cannot manufacture user authority, coordinates, approval IDs,
  owner IDs, session IDs, or execution leases.
- Laravel owns users, sessions, policy, approvals, audit, artifacts, and
  replay. The Browser Worker remains an internal execution service.

## Human Flow

1. Browse mode starts an owner-bound Browser Worker session.
2. A browser operation produces a screenshot plus viewport, page, frame,
   capture, integrity, and state-version metadata.
3. TALOS opens that current frame in the upstream shadcn-vue Dialog.
4. A click is mapped from the painted image rectangle to browser CSS pixels;
   letterboxing, zoom, and pan are accounted for.
5. Laravel requests a worker preflight for the exact session, frame,
   fingerprint, coordinates, owner, and current state version.
6. An ordinary target can execute immediately under
   `confirm_sensitive`. A sensitive, ambiguous, privileged, or consequential
   target returns an upstream AlertDialog challenge bound to the same facts.
7. Confirmation consumes a single-use approval and dispatches the exact
   action under a fenced execution lease. Laravel signs a short-lived ES256
   action capability bound to that complete request; the worker service token
   alone cannot authorize the click.
8. The worker returns the post-action screenshot and accessibility snapshot
   atomically. Laravel persists both the event and immutable artifact
   provenance before TALOS renders the new frame.

The UI never guesses that a click succeeded. It advances only from persisted
server evidence.

## Interaction Policies

- `read_only`: no human pointer action is dispatched.
- `confirm_sensitive`: ordinary interactions execute directly; sensitive or
  uncertain interactions require an exact second confirmation.
- `confirm_every_interaction`: every interaction requires confirmation.

Workspace policy can only make the effective mode stricter. Browser
preferences do not contain credentials, approval material, or capabilities.

## Concurrency And Recovery

Every HMI request carries an end-to-end `interaction_id`. Durable command and
event IDs are protected by database uniqueness. The Browser Worker serializes
session operations and advances a monotonic state version.

An execution lease token fences terminal status, evidence, and recovery
mutations. TALOS automatically retries only when the worker proves that a
request was rejected before dispatch. A timeout or transport failure after
possible dispatch is ambiguous and enters recovery instead of risking a
duplicate click.

Within one live worker session, the action ledger binds the action ID,
idempotency key, request hash, precondition state version, completion status,
and outcome hash. An exact duplicate can return the retained result; a changed
request conflicts; an unknown post-dispatch outcome is recovery-required.

A process restart intentionally discards isolated browser contexts. The new
worker has a new instance identity and rejects the old session before consuming
a retry capability. It does not infer that the prior action never happened.
Laravel owns durable action records and later task/checkpoint reconciliation.

Stale frames, reused approvals, expired approvals, wrong owners, wrong hashes,
wrong state versions, duplicate commands, and unavailable workers fail
closed. User intent also fences the UI: disabling Browse while startup is in
flight cannot be reversed by a late response.

Whole-viewport hashes are provenance, not a target-stability heuristic. Modern
pages can update unrelated pixels continuously, so the worker retains a
four-entry, state-scoped in-memory cache of frame bytes it actually returned to
the user. Preflight and execution use Chromium's stable CDP border box for the
hit-tested actionable target and compare the exact raw pixels in that bounded
target region plus a guard margin. The persisted source artifact hash remains
unchanged in every Laravel contract and target fingerprint. Live document,
backend-node, destination, visibility, disabled-state, event-listener, policy,
owner and action-capability checks still run immediately before dispatch.

Post-action settlement follows the main browsing context rather than global
network silence. A committed main-frame or same-document navigation waits for
`domcontentloaded` and a browser paint boundary before capture. A non-navigation
action requires a bounded DOM-stable window. Background analytics, prefetch,
streaming and long-poll requests do not block evidence indefinitely. The final
screenshot and accessibility snapshot still form one guarded transaction: if
the document identity changes or meaningful DOM mutation occurs between them,
the worker enters typed recovery and never replays the action.

Worker code and evaluated page code execute in separate virtual machines. The
paint boundary is therefore sent to Playwright as a self-contained browser
expression with a bounded numeric argument; it cannot inherit helper symbols
inserted by the locked `tsx`/esbuild production transform. A subprocess
conformance test executes the real helper through `tsx` and pinned Chromium so
Vitest-only transformation cannot hide production evaluation failures.

Target crop decoding uses the directly integrated `sharp` `0.35.3` upstream
package (Apache-2.0), pinned in `browser-worker/package-lock.json`. PNG type,
viewport dimensions, channel count, decoded pixel count, compressed byte size,
cache count and region geometry are bounded. A missing/evicted frame, malformed
PNG, dimension mismatch, target-region change or target identity change remains
fail-closed and never replays a pointer. Cache contents are disposable worker
concurrency evidence, are cleared on recovery/disposal, and never become
authorization or durable product state.

## Evidence And Replay

Browser artifacts are owner-scoped and served through authenticated TALOS
routes. A verified artifact means its stored bytes, size, hash, and provenance
match; it does not mean that web content is trusted.

Replay physically rereads artifact bytes and revalidates size, hash, MIME,
owner, session, capture, frame, and command provenance. Integrity failures are
audited once per deterministic failure identity and never converted into a
successful replay.

Raw accessibility nodes and diagnostic evidence are untrusted. They are
server-blocked in production and available in local/testing environments only
when `TALOS_DEV_BROWSER_EVIDENCE=true`; the disclosure is collapsed by
default and resets closed after reload.

## Network Isolation

- Browser Worker traffic passes through an internal DNS-pinning egress proxy.
- Loopback, link-local, metadata, private, reserved, and disallowed resolved
  addresses are rejected fail-closed.
- Direct browser DNS and service-worker bypasses are denied.
- Chromium launches with non-proxied WebRTC UDP disabled.
- The worker requires a strong shared token in production.
- Consequential actions also require a one-use ES256 capability issued by
  Laravel; private and public key halves are process-separated.
- Compact capabilities and private key material are never persisted or logged.
- Plain HTTP worker transport requires an explicit development-only opt-in.
- The MCP endpoint rejects browser Origins and enforces the configured host
  allowlist. The Browser Worker must never be internet-facing.

## Protocol Surfaces

Laravel uses the internal REST adapter so product state stays in the control
plane. Standards-based internal clients can use the stateless MCP Streamable
HTTP endpoint implemented by the pinned official TypeScript SDK. The pinned
official PHP SDK exercises a live conformance round trip in CI; mocks do not
replace this gate.

The worker advertises `talos.browser.worker.v2` and the exact HMI runtime
identifier `talos_browser_hmi_runtime_v2.1.0` from authenticated readiness and
public liveness envelopes. Its authenticated handshake also declares the ES256
action-capability schema, type, issuer, audience, key ID, and maximum TTL.
Laravel, the native launcher, Doctor, Docker and CI fail closed when any part is
absent or incompatible. This prevents an old but still-running worker from
accepting sessions and failing only when a user clicks the current frame.

## Verification

From the repository root, use the repo-local toolchain:

```bash
cd browser-worker
../.tools/bin/npm.cmd test
../.tools/bin/npm.cmd run build

cd ../control-plane
../.tools/bin/php.cmd artisan test
../.tools/bin/npm.cmd run test:browser-gates-config
../.tools/bin/npm.cmd run test:unit
../.tools/bin/npm.cmd run build

cd ..
bash scripts/tests/talos-live-browser-worker-ci.sh
```

The live script starts a production-mode worker and requires the official MCP
round trip, Laravel integration, and authenticated Playwright UI click. It then
commits one real HMI action, terminates the process, starts a different worker
instance, and proves that the exact old-session retry is rejected before
redispatch. The UI gate decodes the owner-scoped artifact and compares sampled
RGBA pixels with the frame TALOS rendered; deterministic UI mocks are kept in a
separate non-live path and cannot satisfy this gate.

The E2E matrix covers desktop and mobile interaction, sensitive confirmation,
stale and unavailable states, artifact reload, development disclosure,
production disclosure absence, keyboard/focus, reduced motion, and a live
Chromium DOM mutation through the real Browser Worker. The real dynamic-page
gate also proves that several different whole-viewport hashes do not block an
unchanged target, while a visual mutation intersecting that target is rejected
before physical dispatch. Dependency upgrades must review `sharp` release and
license notes, rebuild the Linux worker image, rerun the full worker suite and
repeat this live gate; rollback removes the adapter and restores the prior
whole-frame rejection without weakening any owner, policy or capability check.
