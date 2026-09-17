# Observed Windows findings, 2026-09-17

This is a laboratory record, not a claim of production containment.
PR #24 remains in draft and no product component imports this code.

## Gates newly reached

On `7dfa49003319462c32db83b03cb1a38b7d067312`, run `35188885423`
(Windows Server 2022 x64, elevated launcher, Rust 1.90.0): 23 unit tests passed,
release compilation succeeded. The synthetic filesystem denials, scratch
writes, environment exclusion, rejection of an uncontained peer, rejection
of a different package SID, malformed frame rejection, actual Job-close
termination of parent plus descendant, and the five-versus-four process cap
all passed. Every fixture/profile cleanup passed. The overall run is FAIL:
the remaining network gate observes timeout, not WSAEACCES. Full Windows
10/11 standard-user, installer and production runtime containment remain open.

## Diagnosis of the extra Job processes

Read-back of the original counts was correct. Run `35188692702` identified
conhost.exe inside the Job/container: the former console-subsystem binary
created helpers even though CREATE_NO_WINDOW was requested. The headless
probe is now built with windows_subsystem="windows" (test binaries retain
console output). Limits and expected counts were NOT increased; helpers were
NOT filtered from counts. The following measured run contains exactly the
expected two/five/four probe.exe processes and observes their termination.

## Network uncertainty, deliberately unresolved

The original one-second connection call returns ErrorKind::TimedOut with no
native OS error. u32::MAX is the lab's sentinel, not a Windows denial code.
NetworkIsolationDiagnoseConnectFailureAndGetInfo loaded successfully from
System32 and returned status 0 / NETISO_ERROR_TYPE_NONE in the contained child.
That does not establish a successful connection, nor identify a dropping filter.
The parent's positive control accepts a real connection; no additional one
is observed. Neither absence nor timeout is treated as proof of isolation.

## Read-only WFP observation added in this revision

The trusted test parent invokes only System32 netsh.exe `wfp show netevents`,
with filters for TCP, both loopback addresses, the exact per-run probe image
and a 60-second window. No capture is enabled, no WFP options are changed,
no audit setting is modified and no firewall/loopback exemption is added.
Failure or absence of an event remains diagnostic-only. The process and
output have deadlines/size bounds. Output is written into a broker-only
fixture directory, never into child-writable scratch. It is logged as XML
inside a JSON-escaped diagnostic record and is NOT used by the verdict.
The existing explicit-denial predicate remains unchanged. Results for this
additional observation must come from a subsequent measured run.

## Primary documentation

- https://doc.rust-lang.org/reference/runtime.html#the-windows_subsystem-attribute
- https://learn.microsoft.com/en-us/windows/console/creation-of-a-console
- https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_basic_accounting_information
- https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/netsh-wfp
- https://learn.microsoft.com/en-us/windows/win32/api/netfw/nf-netfw-networkisolationdiagnoseconnectfailureandgetinfo

A future network verifier must correlate independent OS evidence to the
measured subject/connection. Do not convert this diagnostic into a PASS by
accepting every nonzero error, trusting child-authored capability claims,
or overwriting a red overall result with a model review.
