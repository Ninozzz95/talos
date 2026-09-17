# PR01 — Windows containment spike (not production)

This laboratory answers a narrow prerequisite from the TALOS Recursive Evolution
Architecture v1.0, sections 5, 13 and 21: can an ordinary native worker be launched
with an AppContainer identity, assigned to a bounded Job, and identified over a
broker-created named pipe without sharing the parent's environment?

**This is not `talos-supervisor.exe`, self-extension, Wasmtime integration, or a
certification of the existing Node backend.** No production import, kernel,
installer, dependency lock of the app, Forge behavior or owner authority changes.
The laboratory starts from `13f65c15cdeaf8986b882993a0773cdeafb867d2` and is
independent of PR #23; the latter fixes the existing Node environment contract.

## Run explicitly on a disposable Windows x64 test environment

PowerShell 7, Git and Rustup are prerequisites. No administrator prompt is made.
The code records whether the launching token is elevated; an elevated CI run
**does not close** the standard-user or Windows 10/11 compatibility gate.

```powershell
cd harness-ui/labs/evolution-containment
rustup toolchain install 1.90.0 --profile minimal --component rustfmt
$env:RUSTFLAGS = '-C target-feature=+crt-static'
./run.ps1
```

The compiler version is an experiment pin, not a claim that it is the latest.
Provisioning the compiler uses the network. The subsequent `cargo test --frozen`
and `cargo build --release --frozen` have **zero external crate dependencies**.
This does not yet implement the architecture's isolated candidate builder.

On unsupported platforms the executable exits 2, never runs the probes with
weaker containment, and never reports Windows PASS. Pure protocol tests can be
run separately with `cargo test --frozen`; they do not measure OS behavior.

## Measurements

| Check | What counts as passing |
| --- | --- |
| Positive control | Same copied probe executable opens the private and immutable synthetic files for read/write and connects to the live loopback listener WITHOUT AppContainer. A missing resource does not count as a denial. |
| AppContainer identity | `TokenIsAppContainer` and `TokenAppContainerSid` are read from the retained process handle and match the new per-run profile. No network capability is requested. |
| Job membership | JOB_LIST assigns the Job during CreateProcess, then membership/token are checked while the main thread is suspended. No breakaway flags. Failure never resumes without containment. |
| Limits | Active-process cap 4, per-process commit limit 64 MiB, Job commit limit 128 MiB and KILL_ON_JOB_CLOSE are set and read back. This is not yet a stress test of every resource limit. |
| Private/immutable files | Sandboxed opens must fail specifically with Win32 ERROR_ACCESS_DENIED (5). Another error, including a missing file, is failure, not evidence. |
| Scratch | The probe writes synthetic bytes to its granted scratch directory; the parent reads them back and independently checks protected fixtures are unchanged. |
| Environment | A synthetic parent-only marker does not reach either child. Child environment is built from SystemRoot, TEMP and TMP only; no PATH, keys or runtime configuration. |
| Loopback | Unrestricted control must connect. Container must return WSAEACCES (10013), not timeout or connection refusal. This does not measure public-internet egress. |
| Named-pipe peer | OS client PID matches the retained live process, that process belongs to this Job, is an AppContainer and has the expected package SID. Payload fields grant nothing. |
| Wrong peers | A real unsandboxed child and a real different AppContainer are able to reach their explicitly admitted test pipe, but are rejected by peer authentication. |
| Malformed frame | Correctly authenticated child sends a wrong protocol version; parser must specifically reject it. Truncation/length/boolean cases are unit-tested separately. |
| Tree termination | A descendant is observed independently in the same Job/container. Closing the sole Job handle must cause BOTH retained process handles to signal exit within the deadline. |
| Cleanup | Temporary profiles and fixture tree are removed before final PASS. A cleanup failure fails the run. |

The helper is fixed test code, not model-generated code or an independent proof
kernel. These measurements establish behavior of these probes, not a universal
proof against arbitrary malicious programs, kernel bugs or same-user malware.

## Implementation boundaries

`src/protocol.rs` contains a fixed 32-byte, versioned measurement frame, preceded
by its checked length. **This is not the future Protobuf Evolution ABI.** There
are no effect operations, secret APIs, permissions or activation commands on the
pipe. The transport/authentication experiment deliberately precedes that ABI.

`src/windows/ffi.rs` is a minimal raw Windows SDK binding surface, with x64 layout
assertions. Its use is local to the lab; selecting a production binding crate,
reviewing unsafe blocks and SDK compatibility remain separate decisions.

`src/windows/mod.rs` creates two unique AppContainer profiles and only synthetic
files in a newly created temporary directory. ACLs grant the exact package SIDs,
not ALL APPLICATION PACKAGES. Binary and immutable-file ACLs are set explicitly
after copying. Pipe ACLs admit the owner and the designated test package; actual
runtime identity is checked separately. Pipes reject remote clients, use a single
first instance, no inherited handles and overlapped I/O with bounded deadlines.
Cancelled I/O is drained before dropping its buffers.

The broker creates an unpackaged pipe `\\.\pipe\TALOS.Spike...`. The `LOCAL`
namespace behavior for packaged peers must not be confused with an unpackaged
broker. A deployment requiring a different namespace is a separate compatibility
experiment, not a reason to grant all packages or disable a firewall.

Two explicitly named test roles run without AppContainer: the positive control
and the unauthorized-peer test. Both still use Jobs and bounded lifetimes.
They are not an execution fallback. The public CLI only accepts the explicit
synthetic-probe command; the binary is not installed or exposed to the model.

The parent remains trusted throughout this experiment. The running TALOS backend
still has its previous authority. Closing a Job is a measured process-stop
primitive, **not** the full capability/credential revocation protocol.

## Evidence and gates

`run.ps1` records source and executable SHA-256, checkout commit, compiler, OS,
unit/build output, numeric probe results and exit status in `evidence/`. The outer
probe deadline is 60 seconds; CI has a 10-minute deadline. Non-zero exit or absent
final PASS is failure. Failures are uploaded too; logs contain synthetic values,
not a dump of the host environment.

The dedicated workflow uses the repository's existing pinned checkout/upload
Action SHAs, `contents: read`, no persisted Git credential, and only triggers for
this laboratory/workflow. It runs on Windows Server 2022; successful CI there
is **not** a substitute for Windows 10/11 standard-user/installer testing.

Before this is used in production, remaining gates include: non-elevated client
Windows, MSIX/NSIS-specific IPC behavior, token/access denial adversaries beyond
these fixtures, public-network/registry/keyring access, Job memory/CPU/process-cap
stress, broker abrupt-crash recovery, incomplete cleanup reconciliation, handle
races, side effects and lease revocation, Wasmtime host-call cancellation, fixed
WIT/Protobuf schemas and a truly isolated builder. Do not merge this as if those
properties had been implemented.

No machine-readable PASS file is checked into the source. A PASS must come from a
particular measured CI/local run, not from this README or a model's assertion.

## Primary references used to design the experiment

- Microsoft: Launch an AppContainer — https://learn.microsoft.com/en-us/windows/win32/secauthz/implementing-an-appcontainer
- Microsoft: Job Objects — https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects
- Microsoft: UpdateProcThreadAttribute (JOB_LIST and SECURITY_CAPABILITIES) — https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute
- Microsoft: GetNamedPipeClientProcessId — https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getnamedpipeclientprocessid
- Chromium primary source, local-vs-broker pipe names — https://chromium.googlesource.com/chromium/src.git/+/ab4249be940bf5b935caff882489057d670c5c83%5E%21/
- Rust 1.90.0 release — https://blog.rust-lang.org/2025/09/18/Rust-1.90.0/
