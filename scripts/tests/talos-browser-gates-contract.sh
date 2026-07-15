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

bash "$ROOT_DIR/scripts/tests/talos-doctor-ownership.sh"

echo "TALOS executable browser gate contracts passed"
