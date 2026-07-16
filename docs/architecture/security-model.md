# Security Model

## Problem

Enterprise users need assurance that Kadmos will not leak credentials, call internal hosts by default, or execute arbitrary model output.

## Design

Security defaults:

- provider keys stay server-side;
- browser clients use control-plane APIs, not raw provider credentials;
- live validator failures fail closed;
- SSL verification is enabled by default;
- `KADMOS_INSECURE_SSL=1` is the only explicit local escape hatch;
- HTTP workers use `ExecutionPolicy`;
- localhost, metadata IP, and private networks are blocked by default;
- hostnames are normalized and resolved before the private-network decision;
- the Browser Worker is internal-only and requires both service authentication
  and a separate action proof for consequential operations.

## Browser Dual Authentication

The worker service token authenticates the Laravel process and protects every
internal route. It is not an approval credential. A click or HMI pointer
execution also requires a short-lived ES256 capability signed by Laravel and
bound to the exact owner, worker session, action ID, operation, precondition
state version, request body, and approval attestation.

The capability is single-use. A legitimate retry receives a new JWT but keeps
the same idempotency identity; the live worker returns a retained result or a
controlled recovery fault without repeating the effect. Expired, replayed,
wrong-key, wrong-owner, wrong-session, stale-state, and changed-request grants
fail before browser dispatch.

Key exposure is split by process:

- Laravel and queue receive the private P-256 key, never the public key;
- Browser Worker receives the public key, never the private key;
- validator and Vite receive neither key nor the worker service token.

Compact capabilities, private keys, provider credentials, website credentials,
and execution leases are removed at the shared redaction boundary. The worker
logs only a correlation-safe fingerprint for unexpected errors.

## Restart Semantics

The worker's isolated browser context and action-result cache are process-local.
After a controlled restart, the new worker identity rejects every old session
before capability consumption or action dispatch. TALOS never assumes that a
non-idempotent action is safe to retry. Laravel owns durable action state and
must reconcile it before any future resume.

## Browser Action Authorization

Browser action authority is classified by the framework-free AVM policy and
projected by Laravel from server-owned tool metadata. Provider arguments, MCP
tool annotations and compiled node `risk`, `capability` or approval hints never
grant authority. MCP annotations remain compatibility hints only.

The dispatcher applies a final gate immediately before budget reservation,
execution fencing and the physical backend call. The decision combines the
canonical action kind, minimum effective risk, task autonomy profile, trusted
capability grants, exact target domain and exact persisted approval. A denial
becomes a model-visible result and an audit event without invoking the worker.

- `observe` permits granted reads and denies mutations;
- `assist` confirms reversible mutations unless the exact call and arguments
  have a valid persisted approval;
- `act` and `custom` require explicit mutation capability and domain policy;
- consequential effects require an exact human confirmation;
- credentials, recovery codes, two-factor values and payment data remain
  human-only under every profile and developer override;
- developer override is inert in production and remains explicit in audit.

This follows the MCP requirement to treat untrusted annotations as hints and
the OWASP transaction-authorization rule that authorization is server-side,
bound to significant transaction data and rechecked at execution time.

## Human Browser Takeover

Human takeover uses one active renewable lease per Browser task. Laravel
serializes acquisition on the owned task row and returns a random fencing token
only in the first successful response. The database stores only its SHA-256
hash. Lease commands have a separate append-only idempotency journal, so a
retry cannot extend a lease twice and a reused command ID with changed intent
fails closed.

While the lease is active, the dispatcher persists
`TALOS_BROWSER_HUMAN_TAKEOVER_ACTIVE` before any model effect. Expired and
released tokens cannot renew or return control. Returning control requires a
new same-owner, same-task, same-session committed snapshot captured after the
lease began; TALOS then atomically records a checkpoint, releases the lease and
resumes the canonical task state.

## Example

```php
new ExecutionPolicy(
    blockedHosts: ['169.254.169.254', 'localhost', '127.0.0.1'],
    maxTimeoutMs: 10000,
    allowPrivateNetworks: false,
)
```

## Failure Mode

A request to `http://169.254.169.254/latest/meta-data` returns a failed worker result without network execution.

## Test Evidence

- `core/tests/Security/SslVerificationTest.php`
- `core/tests/Security/ExecutionPolicyTest.php`
- `core/tests/ToolContractTest.php`
- `core/tests/Browser/BrowserOrchestrationTest.php`
- `browser-worker/tests/browserActionCapability.test.ts`
- `browser-worker/tests/browserActionLedger.test.ts`
- `control-plane/tests/Unit/TalosBrowserActionCapabilityIssuerTest.php`
- `control-plane/tests/Unit/TalosBrowserActionPolicyTest.php`
- `control-plane/tests/Feature/TalosToolDispatcherTest.php`
- `control-plane/tests/Feature/TalosBrowserTakeoverApiTest.php`
- `control-plane/tests/Feature/LiveBrowserWorkerRestartReconciliationTest.php`
