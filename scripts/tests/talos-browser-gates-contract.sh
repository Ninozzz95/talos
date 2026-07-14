#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

fail() {
  echo "TALOS browser gate contract failed: $*" >&2
  exit 1
}

assert_file() {
  local path="$1"
  [ -f "$path" ] || fail "missing $path"
}

assert_contains() {
  local path="$1"
  local expected="$2"
  grep -Fq -- "$expected" "$path" || fail "$path must contain: $expected"
}

assert_file .github/workflows/ci.yml
assert_file scripts/tests/talos-docker-integration.sh
assert_file scripts/tests/talos-live-browser-worker-ci.sh
assert_file scripts/tests/talos-docker-browser-smoke.php

assert_contains .github/workflows/ci.yml "bash scripts/tests/talos-browser-gates-contract.sh"
assert_contains .github/workflows/ci.yml "bash scripts/tests/talos-live-browser-worker-ci.sh"

for expected in \
  "NODE_ENV=production" \
  '"$ROOT_DIR/.tools/php/php.exe"' \
  "TALOS_BROWSER_WORKER_ALLOW_INSECURE_INTERNAL_TRANSPORT" \
  "TALOS_LIVE_BROWSER_WORKER_URL" \
  "TALOS_LIVE_BROWSER_WORKER_TOKEN" \
  "browserMcpTransport.test.ts" \
  "LiveBrowserWorkerHmiIntegrationTest.php" \
  "--fail-on-skipped" \
  "--fail-on-empty-test-suite" \
  "/ready" \
  "trap cleanup EXIT"
do
  assert_contains scripts/tests/talos-live-browser-worker-ci.sh "$expected"
done

for expected in \
  "ENV NODE_ENV=production" \
  "TALOS_BROWSER_WORKER_TOKEN"
do
  assert_contains Dockerfile.browser-worker "$expected"
done

for expected in \
  "TALOS_BROWSER_WORKER_ALLOW_INSECURE_INTERNAL_TRANSPORT=true"
do
  assert_contains docker-compose.yml "$expected"
done

for expected in \
  "generate_strong_token" \
  "talos-docker-browser-smoke.php" \
  "TALOS_SMOKE_MODE=exercise" \
  "TALOS_SMOKE_MODE=verify-reload" \
  "docker compose --profile \"*\" logs --no-color --tail=200" \
  "trap cleanup EXIT"
do
  assert_contains scripts/tests/talos-docker-integration.sh "$expected"
done

weak_token="$(printf '0%.0s' {1..64})"
if grep -Fq "$weak_token" scripts/tests/talos-docker-integration.sh; then
  fail "the Docker gate must not use the repeated-zero browser-worker token"
fi

for expected in \
  "/login" \
  "/api/talos/sessions" \
  "/api/talos/browser/sessions" \
  "/navigate" \
  "/screenshot" \
  "/interactions/pointer" \
  "/confirm" \
  "/preview" \
  "/events" \
  "image/png" \
  "hash('sha256'" \
  "verify-reload"
do
  assert_contains scripts/tests/talos-docker-browser-smoke.php "$expected"
done

echo "TALOS browser gate contract passed"
