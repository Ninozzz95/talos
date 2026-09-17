# Independent measurements after the network timeout

Base for this change: `d5e4b451cc16a292ce1fbd3dd29ed094867d2760`.
This remains a non-production laboratory, not the Evolution Supervisor.

## Evidence already observed on that base

Windows Server 2022 run `35155913426`, job `104995163124`, compiled the
laboratory, passed 14 unit tests and completed the unrestricted positive
control. Its contained child reported access denied (5) for the protected
file operations, but `network_error=4294967295`. The latter is this lab's
sentinel for an `io::Error` without a raw OS error, not a Windows denial code.
The run stopped before the subsequent process-tree and adversarial cases.
The runner was elevated; no standard-user Windows-client result is claimed.

## This change

The network attempt remains the same one-second TCP connection to the
parent's live loopback listener. `network.rs` now preserves the error kind,
optional native error, elapsed time and the diagnostic result of Windows
`NetworkIsolationDiagnoseConnectFailureAndGetInfo`. It uses only the fixed
loopback address. This API reports missing capabilities; it does not prove
which filter acted on a particular packet. Its result is diagnostic-only and
cannot satisfy or override the original `WSAEACCES` acceptance condition.

The child writes a bounded synthetic diagnostic sidecar. The parent logs it
as escaped text with `trusted_for_verdict:false`; it is not an authority
message, permission, signature or trusted effect receipt. Missing, oversized
or malformed UTF-8 diagnostic data fails the case, never creates a PASS.

After a valid positive control, independent cases run even if network
acceptance fails. The collector preserves every failure and returns an error
if any occurred. Zero executed checks cannot produce success. Cleanup is
attempted and checked for each fixture/profile even after a case fails.
The positive control is additionally observed through the parent's accept
operation. Absence of additional accepted connections is supplementary
evidence only; it cannot transform a timeout into a denial.

New unit tests cover aggregation, JSON escaping and strict network-error
classification. Compilation and actual Windows outcomes for this change
must come from CI; no local Rust compiler or Windows host was available.
No firewall rules, exemptions, ACL grants, launch capabilities, kernel,
installer, app dependencies or production imports are changed here.

## References

- Rust 1.90.0 socket implementation, including `connect_timeout`:
  https://github.com/rust-lang/rust/blob/1.90.0/library/std/src/sys/net/connection/socket/windows.rs
- Microsoft diagnostic API:
  https://learn.microsoft.com/en-us/windows/win32/api/networkisolation/nf-networkisolation-networkisolationdiagnoseconnectfailureandgetinfo
- Microsoft diagnostic enumeration:
  https://learn.microsoft.com/en-us/windows/win32/api/networkisolation/ne-networkisolation-netiso_error_type

A red network gate remains red. Replacing its current measurement contract
would require explicit justification and independent evidence, not accepting
all nonzero transport results or fabricating `WSAEACCES` from another API.
