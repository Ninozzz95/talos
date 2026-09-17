# Prototype worker lifecycle: cancellation and fault injection

This increment belongs only to PR #24. Never merge, publish, or enable it in
TALOS. It implements a prerequisite of Design Proposal v1.0 sections 21, 42 and
55, not the persistent Recovery Plane, product ABI or self-extension milestone.

## Prior behavior and change

The previous invoke path accepted a Complete frame, then closed the Job to kill
any remaining worker. A normal process exit was not independently required.
The updated path treats Complete as an untrusted computation result and requires
an observed exit code zero within the same invocation deadline before success.
Complete followed by a hang or an abnormal exit is failure, with cleanup evidence.

A trusted caller can create InvocationControl and pass it to invoke_cancellable.
It is cloneable for a cancelling thread, but can be claimed only once. It cannot
be created or modified through Protobuf/WIT. cancel closes all broker admission
under the same mutex as grant/read/debit before signalling the transport. It
cannot reset the budget, un-revoke authority or interrupt another invocation.

There is one monotonic deadline (at most 30 seconds) for the invocation's
checkpoints, including connection, frames and normal worker exit. Partial data
and new messages never renew it. Pending pipe waits poll cancellation in slices
of at most 10 milliseconds. On a stop, submitted I/O is cancelled and drained
before releasing its OVERLAPPED, event or data buffers. The Job is closed and
the retained worker handle is observed; all possible cleanup failures are
reported without replacing the primary failure. A late successful computation
cannot erase a cancelled/deadline result.

Previously admitted reads remain charged; cancellation cannot recall bytes
already admitted or delivered. The existing bytes_released metric counts broker
admission, not independently acknowledged delivery. InvocationFailure exposes
that counter separately from the reason and the cleanup observations.

## Real fault tests (explicit feature only)

The `fault-injection` feature and `talos-lifecycle-fixture` executable are absent
from default builds. Neither normal binary accepts fault commands. The feature
adds no guest wire operation and changes no AppContainer/Job grants.

The integration suite exercises silent connected workers; partial frame stalls;
truncated frames with exit zero; oversized frames; abrupt worker exit; Complete
followed by nonzero exit; Complete followed by hang; cancellation of actual
pending overlapped reads; cancellation while a real Wasm read waits for a broker
response; pre-cancellation and fresh invocation; and abrupt Supervisor death.

The held-read test pauses the broker before admission without holding its
authority mutex: it measures a waiting host call, not recovery from an arbitrary
mutex deadlock. Cancellation must release zero snapshot bytes in that test.

The Supervisor-death fixture is terminated by an external controller without
running Rust destructors. The controller retains only the exact worker PROCESS
handle (validated using the unique AppContainer identity), NOT a Job handle.
The test checks that last-Job-handle closure stops the worker. The outer test
then removes only that exact orphan fixture/profile. This reconciliation is test
infrastructure, not a production boot-time recovery implementation. The Job's
active-process limit remains one; this is not a new descendants stress test.

## Run

After explicit dependency provisioning with `cargo fetch --locked`:

```
cargo test --frozen -- --test-threads=1
cargo test --frozen --features fault-injection --test lifecycle -- --test-threads=1 --nocapture
```

Windows x64 is required for the OS tests. The CI preserves default tests,
self-test, fault-test logs and source hashes (including test inputs) separately.
A log/result for a previous source commit is not new execution evidence.
Compilation and OS outcomes must be measured; no success is asserted here.

## Remaining limitations

This remains a trusted prototype, not a verified production Supervisor. Native
Windows calls used in bootstrap/ACL work are synchronous. The deadline is not a
proof that a malfunctioning kernel/driver can be interrupted: cancellation must
be acknowledged before in-flight buffers are freed. Broker mutex deadlock,
power loss, every cleanup failure, new-worker standard-user/client-x64 behavior,
real filesystem authority and installer behavior remain distinct gates. A
surviving process prevents normal cleanup and leaves a failure for recovery.

The cancellation signal currently belongs to the trusted caller. There is no
untrusted TALOS route, persistent ledger, credential revocation, promotion,
activation or rollback in this increment. The default development adapter stays
unimplemented and must not treat a test or a Complete frame as authority.

Primary API references:
- https://learn.microsoft.com/en-us/windows/win32/api/ioapiset/nf-ioapiset-cancelioex
- https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects
