# P1 — Font-size conformance pin research

Date: 2026-07-28  
Subsystem: TALOS mobile UI / upstream conformance metadata  
Lane: `lane/kimi-mobile`

## Final-gate failure

The complete unit suite stopped on:

```text
mobile/src/lib/talosChatLayout.ts diverged
expected 37b64b...
received 221891...
```

The behavior change is intentional and already covered: `talosChatTextSize()`
no longer multiplies message prose by the interface `--talos-ui-scale`.
`mobile/upstream/desktop-ported-libs-manifest.json` was omitted from the P1
file ledger, so the conformance guard correctly rejected the unrecorded drift.

## Primary guidance

- Node.js `crypto.createHash()` official documentation:
  https://nodejs.org/api/crypto.html#cryptocreatehashalgorithm-options
- GitHub release integrity documentation:
  https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/verify-release-integrity
- GitHub Actions artifact digest documentation:
  https://docs.github.com/en/actions/tutorials/store-and-share-data#validating-artifacts

The applicable contract is simple: a SHA-256 digest detects byte drift, but a
changed digest must only be accepted after the new bytes and provenance have
been reviewed. Updating a checksum without reconciling the source would defeat
the guard.

## Reconciliation performed

- Runtime pin used by the repository: Node `v24.18.0`.
- Desktop provenance remains the manifest's exact frozen revision `76a0aa9`.
- The frozen desktop `talosChatLayout.ts` was read with
  `git show 76a0aa9:control-plane/resources/js/lib/talosChatLayout.ts`.
- Mobile remains intentionally forked: four size steps, mobile labels and
  schema, and now independent chat prose sizing.
- No desktop or backend file is edited.
- Fresh mobile SHA-256 before manifest edit:
  `221891216546ceb1ddbe0f073b6ecd32daa9a71795ebc41cf24437e8b7044be9`.

## Decision

**Adapt and repin the AVM-owned mobile fork.**

Update only the manifest row for `mobile/src/lib/talosChatLayout.ts`:

1. replace its stale digest with the freshly calculated SHA-256;
2. expand the reconciliation text to name the independent chat/UI scale
   decision;
3. retain `desktop_reconciled_revision: 76a0aa9`, because changing the global
   provenance pin would falsely imply all listed ports were reconciled against
   a newer desktop revision.

No package, protocol, user-visible behavior, or security boundary changes.

