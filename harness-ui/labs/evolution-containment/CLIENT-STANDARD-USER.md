# Windows client / standard-user experiment v1

This increment starts from a4b90d1e35739821accb7f2d6ef728ae65d187fd.
The Server 2022 v2 result is not transferable to a client. This is a new
measurement, not a v3 containment verdict or an installer integration.

## Native preflight

`run-client.ps1` selects `TALOS_LAB_CLIENT_PROFILE=1` before a new invocation
of the fixed synthetic laboratory. `src/client_profile.rs` reads the OS
product type/build with RtlGetVersion, architecture with IsWow64Process2,
and elevation, elevation type, mandatory integrity level, Administrators
SID presence, AppContainer state and restricted SID count from the current
token. The marker requests a test; it supplies none of these facts.

The preflight requires Windows workstation type 1, version 10.0/build >=
19041, the x64 probe process, non-elevated default token type, Medium
integrity, no Administrators SID (including deny-only), no AppContainer
launcher and no restricted SIDs. A filtered administrator is NOT a standard
user for this experiment. Unsupported/privileged hosts exit 78 before any
synthetic profile, Job, pipe or filesystem fixture is created. Unselected
legacy runs are unchanged; child environment allowlists do not forward the
selector. Malformed selected invocations are rejected, not downgraded.

Reported scopes remain separate:

- windows10-x64-native
- windows11-x64-native
- windows11-arm64-x64-emulated

The build number and machine codes are retained, not replaced by a runner
label or an assertion supplied by a model. Profile acceptance only proves
that the lab's environment precondition was observed, not containment.

## Local entry, no provisioning or elevation

Build the x64 lab with its pinned Rust 1.90.0 compiler, then run the following
from a disposable client machine using an actual standard account:

```powershell
./run-client.ps1
```

PowerShell 7 and a compiled x64 binary are required. A fresh evidence
folder is mandatory. The entry clears the native environment and passes
only SystemRoot, current-user LOCALAPPDATA, TEMP/TMP and the selector.
It creates no account, service, firewall rule or exemption, changes no
system setting and requests no administrator prompt. Exit 78 means the
profile was rejected; other native exit codes are preserved verbatim.
Network WFP queries may not be available without elevation. A timeout or
missing WFP is not silently converted into proof. No Server-v2 evaluator
is called on client evidence.

## Disposable CI fixture, not a product permission requirement

GitHub's standard Windows VMs start elevated with UAC disabled. The new
workflow uses windows-11-arm and an explicitly pinned x64 compiler. This
measures Windows 11 ARM64 **x64 emulation**, not native x64 compatibility.

`ci-client-standard-user.ps1` is CI-only, guarded for a GitHub-hosted VM.
It creates one random, expiring local account in Users, never Administrators.
Its synthetic password stays in memory, not command arguments or artifacts.
It first runs an elevated negative control, requiring rejection before the
probes. It then launches the same copied binary under the new credentials
with that user's loaded profile. The binary checks its own actual token.
Fixture code is read-only for the account; its temporary working directory
is writable. Only these new directories receive account ACLs.

The provisioning administrator is test infrastructure, not the proposed
non-elevated Supervisor. Cleanup attempts the exact account SID/profile
and generated fixture tree, recording failures. This changes no production
account or policy; do not use the CI provisioner on an owner machine.

All native check names/results and exit codes are retained. A successfully
collected experiment may remain a failing CI job. `fullContainmentVerified`
and `releaseReady` remain false, even when the native profile is accepted.
New user provisioning or architecture incompatibility must be reported as
such, not as a sandbox denial. A retry is a new measured execution.

## Tests and evidence

Seven Rust tests cover structure layout, supported/disallowed host scopes,
each token precondition, filtered-admin rejection and actual OS query success.
Windows compilation, PowerShell execution, cleanup and probe behavior must be
reported from real CI; the authoring Linux container has neither Rust nor
PowerShell and cannot claim those results before the CI runs.

Preserved files include build/unit logs, preselected binary/entry digests,
native host profile, stdout JSONL, native stderr/exit, and CI fixture cleanup.
The producer is trusted laboratory code. These records are not signed
attestations and do not resist a malicious report producer by themselves.

Primary API and platform references:
- https://docs.github.com/en/actions/reference/runners/github-hosted-runners
- https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/wdm/nf-wdm-rtlgetversion
- https://learn.microsoft.com/en-us/windows/win32/api/wow64apiset/nf-wow64apiset-iswow64process2
- https://learn.microsoft.com/en-us/windows/win32/api/winnt/ne-winnt-token_information_class
- https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/start-process
