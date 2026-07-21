# TALOS Mobile - Release Recovery Policy

Canonical machine-readable policy: `mobile/release/release-recovery-policy.v1.json`.
This document explains it; the test `mobile/tests/unit/release/releaseRecoveryPolicy.test.ts`
validates the exact keys and semantics. There are three distinct procedures;
none of them is a server-side kill switch (M1 implies no remote interrupt).

## 1. First release (`first_release`)

The first M1 release has **no previous release** (`no_previous_release: true`).
It is distributed on the internal/closed testing `track` with signed-artifact
validation only. There is no staged-production-rollout claim and no
prior-version rollback claim, because no eligible previous release exists.

If the first public release is defective, the recovery is a **forward fix**:
stop further distribution where the track permits and ship a new build with a
higher `versionCode` (`emergency_path: forward_fix_higher_version_code`).
A downgrade is impossible with no previous release.

## 2. Subsequent staged update (`staged_update`)

Later updates use a **staged rollout**. On a failed health gate the rollout is
**halted** (`halt_on_failed_health_gate: true`). Users who already updated
**remain on the affected version** and require a forward fix
(`updated_users: require_forward_fix`) — the policy never claims those users
can be downgraded.

## 3. Later full-release halt (`full_release_halt`)

Play's halt capability for a fully rolled-out release is usable **only where an
eligible previous release exists** (`requires_eligible_previous_release: true`).
It is not available for the first release.

## versionCode ordering

Every recovery moves **forward**: a fix always carries a strictly higher
`versionCode` than the release it supersedes. The frozen
`emergency_path: forward_fix_higher_version_code` encodes this rule. There is
no path that lowers a shipped `versionCode`.

## Local debug/device restore (`local_debug_restore`)

`adb install -r` of a previous debug artifact is an **optional developer
procedure**, explicitly non-production (`production: false`). It is not the
release-rollback gate and never appears as production recovery evidence.

## Not part of M1

No server-side capability / kill switch is part of the M1 claim. Any such
capability is Codex backend ownership and would require a separately listed
API/config/file handoff before it could be referenced here.
