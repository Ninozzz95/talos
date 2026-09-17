# Independent client network witness (CI laboratory only)

The preceding Windows 11 standard-user experiment completed the non-network
checks, but its read-only WFP utility queries failed. A timeout did not prove
which filter acted. This increment measures the missing OS evidence through
a separate, already elevated CI provisioner. It does not elevate the measured
launcher, grant its account WFP access, install a service, or change any firewall,
loopback-exemption, audit or event-collection setting.

## Two channels, not an elevated client

Before the standard-user process is launched, the provisioner records its
fixture account SID, the exact immutable executable hash and NT image path,
checkout and observer source hashes. The NT path is obtained from the file
handle, not from an arbitrary child string. Selection and WFP output use a new
System/Administrators-only directory outside the standard-user scratch tree.

After the original client run, the provisioner checks the broker TCP observation
against that known image and owner. The only query is System32 netsh.exe with
`wfp show netevents`, TCP, both IPv4 loopback addresses, the exact listener and
source ports, the immutable listener appid, the fixture user SID and a 60-second
window. Arguments are individual ProcessStartInfo.ArgumentList values. No shell
expression or child-selected executable is evaluated. Deadline is five seconds;
XML and utility diagnostics are bounded and failures are retained.

The standard-user broker's OS TCP table/retained-handle measurements still bind
the client process to its image, AppContainer SID, owner, creation time and
SYN_SENT flow. The external OS event is correlated to that flow's tuple and time
window, listener image and owner, AppContainer Loopback origin, matching filter
ID, BLOCK action and the app-isolation sublayer. The query can occur AFTER the
native report: it reads retained OS events. No native chronology is fabricated,
no synthetic WFP record is inserted into the original log, and no report byte
is overwritten.

## Result and limits

`review_client_network.py` writes only a supplementary
`client-network-result.json`. It requires the genuine standard-user profile,
non-network checks, exact Job membership, observed tree/process-limit checks,
cleanup, source/binary bindings and matching OS event. Missing evidence, wrong
identity, unscoped query, changed hashes or any other native failure is rejected.

`CLIENT_NETWORK_BLOCK_OBSERVED` means this measured synthetic flow was blocked.
It is not Server-v2 certification, native-x64 Windows compatibility, arbitrary
Internet/UDP/IPv6 coverage, an authenticated producer, a production verifier or a
release gate. The receipt explicitly retains privileged_ci_observer_required.
The fixed laboratory parent is trusted, as in the preceding experiments.
Hashes detect mismatches; they do not authenticate a malicious report producer.

The original native exit code and CI job remain unchanged. In particular the
old numeric WSAEACCES predicate can remain FAIL while the separate OS witness
establishes the block. run-client.ps1 and all native Rust files are unchanged.
No part of this collector is distributed to TALOS or invoked by a candidate.

## Reproduction

In the repository laboratory directory:

```
python -m unittest -v test_client_network.py test_network_correlation.py test_containment_v2.py
python review_client_network.py <copied-evidence-client-ci-directory>
```

The first command is synthetic/offline. The second recalculates the correlation
from saved inputs; it does not execute Windows or elevate any process. A saved
success is never used as the input oracle. CI runs the tests and a PowerShell
parser check before the account experiment; failures are uploaded.

Primary command documentation:
https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/netsh-wfp

The production objective remains Design Proposal v1.0 section 57. This file
records a prerequisite laboratory measurement, not completion of self-extension.

## Windows 11 receiving-side event

The first new run (35222775471, source 4f332eed) collected a matching WFP event
but rejected it because the Server-derived predicate required OUT. The actual
Windows 11 event is IN and includes internalFields/processId for the listener.
The client-only predicate now requires IN AND that exact listener PID, in
addition to the unchanged tuple, time, full-image, owner and blocking-filter
checks. OUT, absent PID, the candidate PID and another listener PID are rejected.
The Server verifier is unchanged. Source hashes are checked against the code
actually performing replay, so an old selection is not silently reclassified.
A new Windows execution must measure the revised client-only predicate.

Direction reference:
https://learn.microsoft.com/en-us/windows/win32/api/fwpmtypes/ns-fwpmtypes-fwpm_net_event_classify_drop1
