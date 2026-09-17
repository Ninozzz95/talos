# Fixed-fixture TALOS development adapter

This increment implements the next development connection, not the installed-app
self-extension milestone. All work remains in PR #24: never merge, create a
release, modify main, or infer production authority from a passing test.

## Entry and boundaries

`harness-ui/src/evolution-dev-adapter.mjs` exports `createEvolutionDevAdapter`.
It is disabled unless the trusted developer bootstrap passes `enabled: true`, an
absolute fixed-name Supervisor executable and reviewed SHA-256 values for that
binary and its sibling worker. No environment variable enables this adapter.
Configuration is copied. There is at most one in-flight invocation per adapter;
`dispose` cancels it and forbids subsequent calls. No npm dependency is added.

The adapter is not registered in server.mjs, a model tool, HTTP/WebSocket route,
Electron IPC, normal startup or the installer. A separate explicit developer
command exercises it. There is no authority-granting chat payload, workspace
path, arbitrary command, component, snapshot or timeout in `invoke`.

The only executable operation is the existing handwritten synthetic component:
49 fixed bytes, integer result 4275, through the existing snapshot lease broker.
This is infrastructure, not a generated TODO/FIXME feature or an owner channel.

The native entry `--dev-stdio <reviewed-worker-sha256>` is compiled only with the
`dev-adapter` Cargo feature. Default binaries reject it. The regular worker,
Evolution guest WIT/Protobuf protocol, lease authority and OS grants are unchanged.
The feature is separate from `fault-injection`; the adapter does not ship hooks
that select fault workers or arbitrary native images.

## Two distinct transports

Node starts the fixed Supervisor with `spawn`, no shell, an explicit working
directory, and only SystemRoot, LOCALAPPDATA, TEMP and TMP. Hash checking uses
bounded reads; the Supervisor checks the sibling worker hash again. Diagnostic
text is drained with a byte budget and never returned to a model/caller.

The development-controller pipe is the subprocess's inherited stdin/stdout. It
uses `contracts/dev_bridge.proto`, a separate closed v1 schema and a 1..256-byte
length-prefixed frame. Rust uses generated Prost; the dependency-free JS codec
shares exact-byte tests and a real cross-language test. Nonminimal encodings,
unknown fields, duplicate fields, wrong direction, nonce or phase are rejected.
Canonical encoding is defined for this narrow protocol, not for arbitrary
Protobuf. It is NOT a replacement for the preferred production Named Pipe ABI.

Supervisor -> worker remains the previously implemented authenticated Named
Pipe/Protobuf path. The development nonce is correlation, not owner authentication.
The official developer bootstrap, Supervisor and worker remain trusted. Expected
hashes detect mismatches, not publisher identity. Check-to-exec races, same-user
binary replacement, signature policy and sealed bootstrap remain open; the
adapter is not safe against a compromised privileged Node caller.

## Invocation and cancellation

1. Node sends RUN with a fresh nonzero 16-byte invocation ID.
2. Supervisor creates the contained worker and verifies the actual process/peer.
3. READY includes the expected worker digest. The worker is connected but has
   received neither Start, a lease reference, nor snapshot bytes.
4. Node sends CONTINUE, or CANCEL when AbortSignal/dispose/onReady cancels.
5. CONTINUE uses the unchanged typed read capability and existing broker.
6. CANCEL invokes `InvocationControl.cancel`, releases the pre-Start checkpoint,
   waits for native cleanup, and reports a typed cancellation outcome.
7. FINISHED is accepted only together with the Supervisor's observed close and
   expected exit, invocation ID, bounds and native cleanup observations.

`onReady` is a synchronous developer callback, not a model-controlled hook.
Async/throwing callbacks cancel and fail; no unhandled rejection is created.
EOF, malformed or excessive controller input closes admission and cancels the
invocation. This is not a request to grant authority to another caller.

Cancellation is a request: native completion may already have won its existing
atomic decision. A valid committed result may therefore win a concurrent abort.
A cancelled result is never converted into success. Already admitted bytes stay
charged; cancelling cannot recall them. In the READY cancellation test no data
has been admitted, so it must report zero bytes and complete cleanup.

The Supervisor has an initial five-second command bound, a ten-second invocation
bound and bounded command queues. One stdin reader thread belongs to this
one-shot process and owns no Job or broker. It may still block on stdin when
main exits; it is not a leaking per-invocation thread in a persistent service.
Synchronous bootstrap, stdout writes and a stuck kernel/driver are not claimed
preemptible. The Node adapter has a 30-second outer timeout, 12-second graceful
cancel window and a three-second wait after a force-stop request. Missing close
or cleanup observations yield an explicit failure, not a fabricated clean exit.
Force-stopping a stuck Supervisor may leave fixture directories/profiles;
production durable orphan recovery is still absent.

## Execution

Provision the already pinned dependencies separately, then build explicitly:

```powershell
cd harness-ui/native/evolution-prototype
cargo build --frozen --features dev-adapter --target-dir target/dev-adapter --bins
```

From harness-ui, using independently reviewed binary hashes (do not derive trust
from an untrusted executable by hashing it immediately before approval):

```text
node scripts/evolution-dev.mjs --enable-synthetic-evolution-dev <absolute-supervisor.exe> <supervisor-sha256> <worker-sha256>
```

Append `--cancel-on-ready` to exercise actual connected-worker cancellation.
That command reports CANCELLED and exits 130; cancellation is not a success of
the computation. Ctrl+C/SIGTERM use the same out-of-band controller request.

Pure adapter tests run without Rust or Windows:

```text
node --test harness-ui/tests/evolution-dev-adapter.test.mjs
```

The prototype workflow separately runs unchanged/default Rust tests and lifecycle
fault tests, opt-in Rust bridge unit tests, and seven Windows Node/native tests.
The native integration entry fails rather than skips on missing binaries or an
unsupported host. It records the two binary hashes and real observations. Test
fixture authority is fixed in the Supervisor; the caller cannot supply data.

## Still absent

No installed-app feature, authoritative owner ingress, arbitrary component
loading, workspace filesystem broker, candidate builder, promotion verdict,
ledger, persistent generation, activation or rollback is added. The development
connection advances the first milestone from the Design Proposal section 57
without claiming that milestone complete. The production boundaries in sections
3, 13, 21 and 55 still apply. New-worker standard-user/client-native-x64 coverage,
TCB dependency split, broader fault testing and sealed bootstrap remain gates.

Primary implementation references:
- https://nodejs.org/api/child_process.html (spawn, explicit env, close versus exit)
- https://doc.rust-lang.org/std/thread/ (main/thread termination semantics)
- https://protobuf.dev/programming-guides/serialization-not-canonical/
