# Parent-owned TCP / WFP correlation experiment

Base: `1ae34660bea1b70f5b623978591ff6d20eee79d0`, PR #24.
This is laboratory measurement, not the production Supervisor or a new grant.

## Why another observation is needed

Run 35189729768 compiled the lab and exercised the independent OS checks. Its
only failed independent check was `loopback_explicit_denial`: the original
one-second call timed out without a native error. Read-only WFP output contains
AppContainer Loopback classify-drop events at the **listener**, not the child
image. It therefore cannot be correlated by filtering only on probe.exe.
Those events alone did not identify the client PID/source port. The historical
run stays FAIL. Its source and results are not rewritten by this experiment.

## New native measurement

`network/observer.rs` starts a parent-side sampler AFTER independently accepting
the positive control and BEFORE launching the contained case. It obtains the
listener port from TcpListener and confirms its PID/address in GetExtendedTcpTable.
No child JSON selects the image, port, PID or package used by the sampler.

Only TCP SYN_SENT rows for that exact loopback listener are examined further.
For each selected process the parent retains a process handle and checks its
full image path, creation time, owner and unique per-run AppContainer SID. It
records the actual source port, target port and observation times. It does not
log unrelated TCP rows, enumerate unrelated process images, enable event
collection, alter firewall rules, add capabilities or create extra connections.
The existing one-second network call and WSAEACCES predicate are unchanged.

Sampling is bounded: 1 MiB table, three resize attempts, eight matched endpoints,
45 seconds wall-clock, 10 ms between samples; the existing outer 60-second probe
deadline is unchanged. A sample is evidence of what was observed, not a complete
history. A missed or ambiguous flow cannot produce a correlation result.

## Companion correlator, not a replacement verdict

`review_network_correlation.py` uses only the Python standard library. Python
3.11+ is required for this lab runner, never for the installed product. Tests
run before compilation; the actual interpreter version is recorded.

The correlator requires a unique broker-observed TCP subject and matches a WFP
event by both IPv4 addresses, both ports, timestamp, the listener's full NT image
identity and owner. It requires the AppContainer Loopback filter origin, matching
terminating filter ID, explicit FWP_ACTION_BLOCK and the app-isolation sublayer.
The package SID on this server-side WFP event belongs to the uncontained listener;
it is NOT used as the candidate identity. Candidate identity is observed separately
through OS handles. XML DTD/entities, duplicate fields, excess sizes, old events,
foreign flows and incomplete evidence are rejected. Sampling jitter is at most
100 ms and cannot extend outside the trusted parent observation window.

The companion result is `VERIFIED_FILTER_BLOCK`, `NO_CORRELATED_BLOCK` or
`INVALID_EVIDENCE`. All keep `legacy_gate_changed:false`,
`full_containment_verified:false` and `release_ready:false`.
`run.ps1` records both exit codes but ALWAYS preserves the native executable's
exit code and PASS rule. A companion result cannot make a red workflow green.
The raw diagnostics and original overall FAIL remain available.

This checks a particular IPv4 TCP loopback flow on the tested Windows build.
It does not prove arbitrary Internet egress containment, non-elevated operation,
installer compatibility, Windows-wide support or authenticity of externally
supplied reports. The fixed parent/collector are trusted laboratory instruments;
a malicious producer can fabricate internally coherent JSON/XML. Production use
would need an independent authenticated evidence path and a versioned policy.

## Reproduce offline

```text
python -m unittest -v test_network_correlation
python review_network_correlation.py evidence/probes.jsonl --output evidence/network-correlation.json
```

Initial local result: 66 Python tests pass on Linux; the earlier CI artifact
without native TCP binding correctly remains INVALID_EVIDENCE for this new
measurement. Native compilation and actual correlation results must come from a
new Windows run, not this document.

## Primary references

- https://learn.microsoft.com/en-us/windows/win32/api/iphlpapi/nf-iphlpapi-getextendedtcptable
- https://learn.microsoft.com/en-us/windows/win32/api/tcpmib/ns-tcpmib-mib_tcprow_owner_pid
- https://learn.microsoft.com/en-us/windows/win32/api/psapi/nf-psapi-getprocessimagefilenamew
- https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/netsh-wfp

No production import, kernel/Forge change, merge, tag or release is part of this work.
