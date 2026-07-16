#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CURL_BIN="${TALOS_CURL_BIN:-curl}"
WORKER_HOST="127.0.0.1"
WORKER_PORT="${TALOS_LIVE_BROWSER_WORKER_PORT:-3110}"
WORKER_URL="http://${WORKER_HOST}:${WORKER_PORT}"
WORKER_LOG="$(mktemp)"
ACTION_KEY_ENV="$(mktemp)"
RESTART_STATE="$(mktemp)"
WORKER_PID=""
WORKER_PROCESS_GROUP=0

resolve_php_bin() {
  if [ -n "${TALOS_PHP_BIN:-}" ]; then
    printf '%s\n' "$TALOS_PHP_BIN"
    return
  fi
  if [ -x "$ROOT_DIR/.tools/php/php.exe" ]; then
    printf '%s\n' "$ROOT_DIR/.tools/php/php.exe"
    return
  fi
  if [ -x "$ROOT_DIR/.tools/php/bin/php" ]; then
    printf '%s\n' "$ROOT_DIR/.tools/php/bin/php"
    return
  fi
  command -v php
}

PHP_BIN="$(resolve_php_bin)"

generate_strong_token() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
    return
  fi
  if [ -r /dev/urandom ] && command -v od >/dev/null 2>&1; then
    od -An -N32 -tx1 /dev/urandom | tr -d ' \r\n'
    return
  fi
  echo "A cryptographically secure random generator is required." >&2
  return 1
}

generate_app_key() {
  if command -v openssl >/dev/null 2>&1; then
    printf 'base64:'
    openssl rand -base64 32 | tr -d '\r\n'
    return
  fi
  if [ -r /dev/urandom ] && command -v base64 >/dev/null 2>&1; then
    printf 'base64:'
    head -c 32 /dev/urandom | base64 | tr -d '\r\n'
    return
  fi
  echo "A cryptographically secure random generator is required for APP_KEY." >&2
  return 1
}

terminate_worker() {
  [ -n "$WORKER_PID" ] || return 0
  if ! kill -0 "$WORKER_PID" >/dev/null 2>&1; then
    wait "$WORKER_PID" >/dev/null 2>&1 || true
    return 0
  fi

  if [ "$WORKER_PROCESS_GROUP" -eq 1 ]; then
    kill -TERM -- "-$WORKER_PID" >/dev/null 2>&1 || true
  else
    kill -TERM "$WORKER_PID" >/dev/null 2>&1 || true
  fi
  for _ in $(seq 1 20); do
    kill -0 "$WORKER_PID" >/dev/null 2>&1 || break
    sleep 0.25
  done
  if kill -0 "$WORKER_PID" >/dev/null 2>&1; then
    if [ "$WORKER_PROCESS_GROUP" -eq 1 ]; then
      kill -KILL -- "-$WORKER_PID" >/dev/null 2>&1 || true
    else
      kill -KILL "$WORKER_PID" >/dev/null 2>&1 || true
    fi
  fi
  wait "$WORKER_PID" >/dev/null 2>&1 || true
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  if [ "$status" -ne 0 ]; then
    if [ -n "$WORKER_PID" ] && kill -0 "$WORKER_PID" >/dev/null 2>&1; then
      echo "Browser worker health at failure:" >&2
      "$CURL_BIN" --silent --show-error --max-time 3 "$WORKER_URL/health" >&2 || true
      echo >&2
      echo "Browser worker readiness at failure:" >&2
      "$CURL_BIN" --silent --show-error --max-time 3 \
        -H "X-Talos-Worker-Token: $TALOS_LIVE_BROWSER_WORKER_TOKEN" \
        "$WORKER_URL/ready" >&2 || true
      echo >&2
    fi
    echo "Browser worker log follows:" >&2
    cat "$WORKER_LOG" >&2 || true
  fi
  terminate_worker
  rm -f "$WORKER_LOG" "$ACTION_KEY_ENV" "$RESTART_STATE"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if [ ! -x "$ROOT_DIR/browser-worker/node_modules/.bin/tsx" ] \
  && [ ! -f "$ROOT_DIR/browser-worker/node_modules/.bin/tsx.cmd" ]; then
  echo "Browser worker dependencies are missing; run npm ci in browser-worker." >&2
  exit 1
fi
if [ ! -f "$ROOT_DIR/control-plane/vendor/bin/phpunit" ]; then
  echo "Control-plane dependencies are missing; run composer install in control-plane." >&2
  exit 1
fi
if [ ! -x "$ROOT_DIR/control-plane/node_modules/.bin/playwright" ] \
  && [ ! -f "$ROOT_DIR/control-plane/node_modules/.bin/playwright.cmd" ]; then
  echo "Control-plane dependencies are missing; run npm ci in control-plane." >&2
  exit 1
fi
if ! command -v "$CURL_BIN" >/dev/null 2>&1; then
  echo "curl is required for the live browser-worker readiness gate." >&2
  exit 1
fi

export TALOS_LIVE_BROWSER_WORKER_TOKEN="${TALOS_LIVE_BROWSER_WORKER_TOKEN:-$(generate_strong_token)}"
if [[ ! "$TALOS_LIVE_BROWSER_WORKER_TOKEN" =~ ^[a-f0-9]{64}$ ]]; then
  echo "TALOS_LIVE_BROWSER_WORKER_TOKEN must be a 64-character lowercase hexadecimal secret." >&2
  exit 1
fi
export TALOS_LIVE_BROWSER_WORKER_URL="$WORKER_URL"
export TALOS_BROWSER_WORKER_URL="$WORKER_URL"
export TALOS_BROWSER_WORKER_TOKEN="$TALOS_LIVE_BROWSER_WORKER_TOKEN"
export TALOS_BROWSER_WORKER_ALLOW_INSECURE_INTERNAL_TRANSPORT=true
export TALOS_E2E_REAL_BROWSER=1
export TALOS_E2E_PHP_BIN="$PHP_BIN"
export TALOS_E2E_LIVE_BROWSER_TARGET="${TALOS_E2E_LIVE_BROWSER_TARGET:-https://example.com/}"
export TALOS_LIVE_BROWSER_MCP_TARGET="${TALOS_LIVE_BROWSER_MCP_TARGET:-https://example.com/}"
export TALOS_E2E_LIVE_BROWSER_X="${TALOS_E2E_LIVE_BROWSER_X:-0.6173}"
export TALOS_E2E_LIVE_BROWSER_Y="${TALOS_E2E_LIVE_BROWSER_Y:-0.3679}"
export APP_KEY="${APP_KEY:-$(generate_app_key)}"

printf '\n' > "$ACTION_KEY_ENV"
node "$ROOT_DIR/control-plane/scripts/browser-action-keypair.mjs" --env-file "$ACTION_KEY_ENV" >/dev/null
TALOS_LIVE_BROWSER_ACTION_PRIVATE_KEY_B64="$(grep '^TALOS_BROWSER_ACTION_PRIVATE_KEY_B64=' "$ACTION_KEY_ENV" | cut -d= -f2-)"
TALOS_LIVE_BROWSER_ACTION_PUBLIC_KEY_B64="$(grep '^TALOS_BROWSER_ACTION_PUBLIC_KEY_B64=' "$ACTION_KEY_ENV" | cut -d= -f2-)"
TALOS_LIVE_BROWSER_ACTION_KEY_ID="$(grep '^TALOS_BROWSER_ACTION_KEY_ID=' "$ACTION_KEY_ENV" | cut -d= -f2-)"
if [ -z "$TALOS_LIVE_BROWSER_ACTION_PRIVATE_KEY_B64" ] \
  || [ -z "$TALOS_LIVE_BROWSER_ACTION_PUBLIC_KEY_B64" ] \
  || [[ ! "$TALOS_LIVE_BROWSER_ACTION_KEY_ID" =~ ^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$ ]]; then
  echo "Browser action keypair provisioning failed." >&2
  exit 1
fi

start_worker() {
  cd "$ROOT_DIR/browser-worker"
  exec env \
    HOST="$WORKER_HOST" \
    PORT="$WORKER_PORT" \
    NODE_ENV=production \
    TALOS_BROWSER_WORKER_TOKEN="$TALOS_LIVE_BROWSER_WORKER_TOKEN" \
    TALOS_BROWSER_ACTION_PUBLIC_KEY_B64="$TALOS_LIVE_BROWSER_ACTION_PUBLIC_KEY_B64" \
    TALOS_BROWSER_ACTION_KEY_ID="$TALOS_LIVE_BROWSER_ACTION_KEY_ID" \
    ./node_modules/.bin/tsx src/cli.ts
}

launch_worker() {
  WORKER_PROCESS_GROUP=0
  if command -v setsid >/dev/null 2>&1; then
    (
      cd "$ROOT_DIR/browser-worker"
      exec setsid env \
        HOST="$WORKER_HOST" \
        PORT="$WORKER_PORT" \
        NODE_ENV=production \
        TALOS_BROWSER_WORKER_TOKEN="$TALOS_LIVE_BROWSER_WORKER_TOKEN" \
        TALOS_BROWSER_ACTION_PUBLIC_KEY_B64="$TALOS_LIVE_BROWSER_ACTION_PUBLIC_KEY_B64" \
        TALOS_BROWSER_ACTION_KEY_ID="$TALOS_LIVE_BROWSER_ACTION_KEY_ID" \
        ./node_modules/.bin/tsx src/cli.ts
    ) >>"$WORKER_LOG" 2>&1 &
    WORKER_PROCESS_GROUP=1
  else
    start_worker >>"$WORKER_LOG" 2>&1 &
  fi
  WORKER_PID=$!
}

wait_for_worker_ready() {
  local ready=0
  local response=""
  for _ in $(seq 1 60); do
    if ! kill -0 "$WORKER_PID" >/dev/null 2>&1; then
      echo "Browser worker exited before readiness." >&2
      return 1
    fi
    if response="$($CURL_BIN --fail --silent --show-error \
        --max-time 3 \
        -H "X-Talos-Worker-Token: $TALOS_LIVE_BROWSER_WORKER_TOKEN" \
        "$WORKER_URL/ready" 2>/dev/null)" \
      && grep -Fq '"status":"ready"' <<<"$response" \
      && grep -Fq '"worker":"talos.browser.worker.v2"' <<<"$response" \
      && grep -Fq '"hmi":"talos_browser_hmi_runtime_v2.1.0"' <<<"$response"; then
      ready=1
      break
    fi
    sleep 1
  done
  if [ "$ready" -ne 1 ]; then
    echo "Browser worker readiness timed out at $WORKER_URL/ready." >&2
    return 1
  fi
}

run_restart_phase() {
  local phase="$1"
  (
    cd "$ROOT_DIR/control-plane"
    env \
      TALOS_BROWSER_ACTION_PRIVATE_KEY_B64="$TALOS_LIVE_BROWSER_ACTION_PRIVATE_KEY_B64" \
      TALOS_BROWSER_ACTION_KEY_ID="$TALOS_LIVE_BROWSER_ACTION_KEY_ID" \
      TALOS_LIVE_BROWSER_RESTART_PHASE="$phase" \
      TALOS_LIVE_BROWSER_RESTART_STATE="$RESTART_STATE" \
      "$PHP_BIN" vendor/bin/phpunit \
      --configuration phpunit.xml \
      --do-not-cache-result \
      --fail-on-skipped \
      --fail-on-empty-test-suite \
      --filter=test_controlled_restart_fences_the_old_session_before_action_redispatch \
      tests/Feature/LiveBrowserWorkerRestartReconciliationTest.php
  )
}

launch_worker
wait_for_worker_ready

echo "Live browser worker ready at $WORKER_URL"

(
  cd "$ROOT_DIR/browser-worker"
  npm test -- \
    --run tests/browserMcpTransport.test.ts \
    -t "round-trips the allowlisted real Playwright MCP tools through official Streamable HTTP"
)

(
  cd "$ROOT_DIR/control-plane"
  env \
    TALOS_BROWSER_ACTION_PRIVATE_KEY_B64="$TALOS_LIVE_BROWSER_ACTION_PRIVATE_KEY_B64" \
    TALOS_BROWSER_ACTION_KEY_ID="$TALOS_LIVE_BROWSER_ACTION_KEY_ID" \
    "$PHP_BIN" vendor/bin/phpunit \
    --configuration phpunit.xml \
    --do-not-cache-result \
    --fail-on-skipped \
    --fail-on-empty-test-suite \
    tests/Feature/LiveBrowserWorkerHmiIntegrationTest.php
)

run_restart_phase before
terminate_worker
WORKER_PID=""
launch_worker
wait_for_worker_ready
run_restart_phase after

(
  cd "$ROOT_DIR/control-plane"
  npm run build
  env \
    TALOS_BROWSER_ACTION_PRIVATE_KEY_B64="$TALOS_LIVE_BROWSER_ACTION_PRIVATE_KEY_B64" \
    TALOS_BROWSER_ACTION_KEY_ID="$TALOS_LIVE_BROWSER_ACTION_KEY_ID" \
    ./node_modules/.bin/playwright test \
    tests/e2e/talosBrowserHmi.e2e.spec.ts \
    tests/e2e/talosBrowserRecovery.e2e.spec.ts \
    --project=chromium \
    --grep "renders the exact verified frame|BREG-004"
)

echo "Official MCP Streamable HTTP round-trip passed against the live browser worker"
echo "LiveBrowserWorkerHmiIntegrationTest passed HMI replay and cancellation against real Chromium"
echo "Controlled worker restart fenced the prior action session before redispatch"
echo "TALOS browser HMI Playwright gate rendered the exact worker artifact"
echo "BREG-004 recovered one verified screenshot through reload against the live worker"
