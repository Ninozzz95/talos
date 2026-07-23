#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

for script in \
  "$ROOT_DIR/talos" \
  "$ROOT_DIR/scripts/tests/talos-doctor-ownership.sh" \
  "$ROOT_DIR/scripts/tests/talos-docker-integration.sh" \
  "$ROOT_DIR/scripts/tests/talos-live-browser-worker-ci.sh"
do
  bash -n "$script"
done

LIVE_GATE="$ROOT_DIR/scripts/tests/talos-live-browser-worker-ci.sh"

if ! grep -Fq 'TALOS_E2E_STAGE2A_SCROLL_TARGET' "$LIVE_GATE"; then
  echo "Missing dedicated Stage-2a scroll target in live browser gate" >&2
  exit 1
fi

if ! grep -Fq -- '--grep "STAGE2A-010"' "$LIVE_GATE"; then
  echo "Missing STAGE2A-010 in live browser gate" >&2
  exit 1
fi

stage2a_invocation="$(sed -n '/TALOS_E2E_STAGE2A_SCROLL_TARGET/,/--grep "STAGE2A-010"/p' "$LIVE_GATE")"
if grep -Fq -- '--project=' <<<"$stage2a_invocation"; then
  echo "STAGE2A-010 must run every configured Playwright project" >&2
  exit 1
fi

if ! grep -Fq 'TALOS_E2E_STAGE2B_REF_TARGET' "$LIVE_GATE"; then
  echo "Missing dedicated Stage-2b semantic ref target in live browser gate" >&2
  exit 1
fi

if ! grep -Fq -- '--grep "STAGE2B-019"' "$LIVE_GATE"; then
  echo "Missing STAGE2B-019 in live browser gate" >&2
  exit 1
fi

stage2b_invocation="$(sed -n '/TALOS_E2E_STAGE2B_REF_TARGET/,/--grep "STAGE2B-019"/p' "$LIVE_GATE")"
if grep -Fq -- '--project=' <<<"$stage2b_invocation"; then
  echo "STAGE2B-019 must run every configured Playwright project" >&2
  exit 1
fi

bash "$ROOT_DIR/scripts/tests/talos-doctor-ownership.sh"

echo "TALOS executable browser gate contracts passed"
