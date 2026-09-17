# Containment laboratory contract v2

Contract: `talos.containment-lab.server2022-ipv4-loopback.v2`.
Machine-readable definition: `CONTAINMENT-CONTRACT-V2.json`.
Base: PR #24, `b211b7296e142b7c772bb6e8eb6940aa8efef28e`.

## Why a new version, not a rewritten PASS

The original native contract requires precisely WSAEACCES (10013). Windows
Server 2022 runs 35212005980 attempts 1 and 2 instead returned a TCP timeout,
while independently observed socket ownership and matching Windows Filtering
Platform events established an AppContainer Loopback FWP_ACTION_BLOCK. Their
native FAIL, native exit 1 and historical artifacts remain unchanged.

This is a maintainer-selected measurement contract for fixed synthetic probes,
not a Constitution amendment, new owner authority or self-ratification by TALOS.
No model, candidate, production runtime or installer loads this laboratory.
The design's rule that an LLM cannot turn a failed deterministic gate into PASS
still applies. V2 produces a separate versioned result with its own stricter
combination of evidence, not an override of a v1 verdict.

## Exact scope and required evidence

The profile is Windows Server 2022 x64, native toolchain 1.90.0, synthetic IPv4
TCP loopback. The launcher elevation is recorded, not hidden. Windows client,
standard-user client execution, arbitrary Internet egress, other protocols,
installer compatibility and full production containment are not certified.

SCOPED_PASS requires all of the following together:

1. The exact v2 contract and source hashes selected before a fresh native run;
   unchanged checkout, source inventory and built binary at fresh evaluation.
2. Every expected native positive/negative gate present, in order, without
   duplicates, unknown additions or failures except the explicitly retained
   v1 numeric network criterion. The native manifest, exit, summary and final
   records must agree. A build/test/setup/cleanup failure cannot qualify.
3. Protected-file denials, observed scratch effect, environment exclusion,
   both unauthorized-peer cases and malformed-frame rejection.
4. Complete Job evidence for exactly 2, 5 and 4 live contained probe processes,
   without subtracting helpers; actual tree-stop and five-versus-four quota
   checks. The network subject must also belong to the observed two-process tree.
5. Recomputed correlation of the broker's live TCP owner observation with WFP:
   matching complete server image, owner, unique AppContainer subject, endpoint
   tuple, bounded timestamps, filter ID, AppContainer Loopback origin and block
   action on the isolation sublayer. A stored correlation PASS is not trusted.
6. Successful native cleanup of fixtures and both temporary profiles.

A timeout alone, code 10013 alone, an empty WFP result, missing privileges to
observe, an unrelated filter or a contradictory identity all fail v2. There is
no fallback to relaxed ACLs, changed firewall policy or loopback exemptions.

## Separate execution and immutable artifacts

In a fresh disposable Windows x64 checkout with PowerShell 7, Python 3.11+,
Git and the pinned Rust toolchain:

```powershell
cd harness-ui/labs/evolution-containment
$env:RUSTFLAGS = '-C target-feature=+crt-static'
./run-v2.ps1
```

The wrapper runs v2 unit tests, creates a new `evidence/` exclusively, records
`v2-selection.json`, then runs the unchanged `run.ps1`. That runner still writes
its v1 `run.json` and preserves its native FAIL. The new reviewer recomputes all
v2 conditions and writes `v2-result.json`; no old report is edited or deleted.
An existing evidence directory causes refusal, not silent reuse or cleanup.

The new workflow `evolution-containment-v2` uses a separate fresh Windows job.
The original `evolution-containment-spike` workflow remains unchanged and may
remain red on the numeric network criterion. Neither result is a release gate
for production self-extension. No merge or release is performed by this code.

## Offline replay and trust limits

```text
python review_containment_v2.py replay <downloaded-evidence-directory>
```

Replay does not create a fresh execution claim or overwrite the result. An old
v1 archive without preselection is rejected; do not manufacture a selection to
relabel its history. Fresh mode also remeasures sources/binary and refuses old
selection times. Replay verifies recorded consistency, not current local bytes.

Hashes provide tamper evidence relative to the selected input, not authentication
of a malicious producer. A fabricated but coherent JSON/XML set can fool a
standalone reviewer. The fixed broker, OS and CI environment remain trusted for
this experiment. This is NOT the production Proof Gate, TCB or signature system.
The receipt always carries `producer_authenticated:false`,
`full_containment_verified:false`, `windows_client_verified:false` and
`release_ready:false`. SCOPED_PASS must never become an activation capability.

## Validation

`python -m unittest -v test_containment_v2 test_network_correlation` runs synthetic
adversarial tests without OS access or real network operations. Tests include
missing/reordered gates, forged counts, wrong source hashes, late selection,
legacy failure laundering, process helpers, unrelated WFP, duplicate JSON keys
and non-finite numbers. The native/Windows result must come from measured CI.

Primary API references for the existing observer, not a universal isolation proof:
- https://learn.microsoft.com/en-us/windows/win32/api/iphlpapi/nf-iphlpapi-getextendedtcptable
- https://learn.microsoft.com/en-us/windows/win32/api/fwpmtypes/ns-fwpmtypes-fwpm_net_event_classify_drop1
