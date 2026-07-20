#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/talos-hj-cli.XXXXXX")"
STDERR_FILE="$TEMP_DIR/stderr.log"

cleanup() {
  if [ -n "${CANCEL_WATCHDOG_PID:-}" ]; then
    kill "$CANCEL_WATCHDOG_PID" >/dev/null 2>&1 || true
    wait "$CANCEL_WATCHDOG_PID" >/dev/null 2>&1 || true
  fi
  if [ -n "${CANCEL_DRIVER_PID:-}" ]; then
    kill -KILL "$CANCEL_DRIVER_PID" >/dev/null 2>&1 || true
    wait "$CANCEL_DRIVER_PID" >/dev/null 2>&1 || true
  fi
  if declare -F cleanup_cancel_fixture >/dev/null 2>&1; then
    cleanup_cancel_fixture >/dev/null 2>&1 || true
  fi
  if declare -F hj_stop_owned_processes >/dev/null 2>&1; then
    hj_stop_owned_processes >/dev/null 2>&1 || true
  fi
  if [ -n "${SENTINEL_PID:-}" ]; then
    kill "$SENTINEL_PID" >/dev/null 2>&1 || true
    wait "$SENTINEL_PID" >/dev/null 2>&1 || true
  fi
  if [ -n "${FAILED_START_PID:-}" ]; then
    kill "$FAILED_START_PID" >/dev/null 2>&1 || true
    wait "$FAILED_START_PID" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$TEMP_DIR"
}
trap cleanup EXIT

fail() {
  printf 'TALOS Human Journey CLI contract failed: %s\n' "$1" >&2
  exit 1
}

invoke() {
  local expected_status="$1"
  shift
  local output
  local status
  : > "$STDERR_FILE"
  set +e
  output="$(
    CI=1 \
    TALOS_NO_BOOT=1 \
    TALOS_HJ_VALIDATE_ONLY=1 \
    "$ROOT_DIR/talos" "$@" 2>"$STDERR_FILE"
  )"
  status=$?
  set -e

  if [ "$status" -ne "$expected_status" ]; then
    printf 'Command: talos %s\nstdout: %s\nstderr:\n' "$*" "$output" >&2
    cat "$STDERR_FILE" >&2
    fail "expected exit $expected_status, received $status"
  fi
  INVOKE_OUTPUT="$output"
}

assert_contains() {
  case "$INVOKE_OUTPUT" in
    *"$1"*) ;;
    *) fail "stdout does not contain $1" ;;
  esac
}

assert_invalid() {
  invoke 2 verify human-browser "$@"
  [ -z "$INVOKE_OUTPUT" ] || fail "invalid CLI input wrote to stdout"
  [ -s "$STDERR_FILE" ] || fail "invalid CLI input did not explain the failure"
}

invoke 3 verify human-browser
assert_contains '"protocol":"talos.human_journey.cli.v1"'
assert_contains '"lane":"deterministic"'
assert_contains '"scenario_id":"BROWSER-NATURAL-001"'
assert_contains '"seed":42'
assert_contains '"trials":1'
assert_contains '"director":"off"'
assert_contains '"replay_id":null'
assert_contains '"resume_id":null'

invoke 3 verify human-browser --lane=adaptive --scenario=BROWSER-NATURAL-001 --seed=4294967295 --trials=25
assert_contains '"lane":"adaptive"'
assert_contains '"seed":4294967295'
assert_contains '"trials":25'

invoke 3 verify human-browser --replay=HJREG-001
assert_contains '"replay_id":"HJREG-001"'

invoke 3 verify human-browser --lane=adaptive --resume=hjtrial_20260718T220000Z_8f31c0aa_01 --director=external
assert_contains '"resume_id":"hjtrial_20260718T220000Z_8f31c0aa_01"'
assert_contains '"director":"external"'

invoke 2 verify
invoke 2 verify other

assert_invalid --unknown=value
assert_invalid --lane=
assert_invalid --lane=unknown
assert_invalid --lane deterministic
assert_invalid --lane=deterministic --lane=adaptive
assert_invalid --seed=-1
assert_invalid --seed=4294967296
assert_invalid --seed=not-a-number
assert_invalid --trials=0
assert_invalid --trials=26
assert_invalid --scenario=bad
assert_invalid --replay=INVALID-001
assert_invalid --resume=invalid-trial --director=external
assert_invalid --director=automatic
assert_invalid --replay=HJREG-001 --scenario=BROWSER-NATURAL-001
assert_invalid --replay=HJREG-001 --trials=2
assert_invalid --replay=HJREG-001 --director=external
assert_invalid --resume=hjtrial_20260718T220000Z_8f31c0aa_01
assert_invalid --lane=release --resume=hjtrial_20260718T220000Z_8f31c0aa_01 --director=external

if ! bash -c 'source "$1"; declare -F hj_prepare_run >/dev/null' _ "$ROOT_DIR/scripts/human-journey/run.sh"; then
  fail "run lifecycle cannot be sourced without executing main"
fi

FRONTEND_BUILD_ROOT="$TEMP_DIR/frontend-build-root"
mkdir -p \
  "$FRONTEND_BUILD_ROOT/.tools/node/node_modules/npm/bin" \
  "$FRONTEND_BUILD_ROOT/control-plane/scripts"
cat > "$FRONTEND_BUILD_ROOT/control-plane/scripts/vite-build.mjs" <<'NODE'
import { access } from 'node:fs/promises'
import path from 'node:path'

if (!process.argv.includes('--verify')) process.exit(42)
await access(path.join(process.cwd(), 'public', 'build', 'talos-build-provenance.json'))
NODE
cat > "$FRONTEND_BUILD_ROOT/.tools/node/node_modules/npm/bin/npm-cli.js" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')
const marker = path.join(process.cwd(), 'public', 'build', 'talos-build-provenance.json')
fs.mkdirSync(path.dirname(marker), { recursive: true })
fs.writeFileSync(marker, '{}\n')
fs.appendFileSync(path.join(process.cwd(), 'build-invocations.log'), 'build\n')
NODE

if ! HJ_REPO_ROOT="$FRONTEND_BUILD_ROOT" TALOS_NODE_BIN="$ROOT_DIR/.tools/node/node.exe" bash -c '
  set -euo pipefail
  source "$2/scripts/human-journey/lib.sh"
  declare -F hj_ensure_frontend_build >/dev/null
  declare -f hj_verify_repo_toolchain | grep -Fq "hj_ensure_frontend_build"
  hj_ensure_frontend_build
  hj_ensure_frontend_build
  [ "$(wc -l < "$1/control-plane/build-invocations.log")" -eq 1 ]
' _ "$FRONTEND_BUILD_ROOT" "$ROOT_DIR"; then
  fail "HJ9-045 frontend build provenance was not reconciled exactly once"
fi

if ! bash -c '
  set -euo pipefail
  source "$1/scripts/human-journey/lib.sh"
  hj_verify_repo_toolchain
  [ "$TALOS_NODE_BIN" = "$1/.tools/node/node.exe" ]
  [ "$TALOS_PHP_BIN" = "$1/.tools/php/php.exe" ]
  [ "$TALOS_NPM_BIN" = "$1/.tools/node/npm.cmd" ]
' _ "$ROOT_DIR"; then
  fail "HJTOOLCHAIN-001 repository-local runtime attestation failed"
fi

VALIDATOR_ENV_STATE_ROOT="$TEMP_DIR/validator-env-state"
if ! bash -c '
  set -euo pipefail
  source "$1/scripts/human-journey/lib.sh"
  source "$1/scripts/human-journey/run.sh"
  hj_verify_repo_toolchain
  HJ_RUN_ID="hj_20260720T090000Z_7c4b2a19"
  HJ_RUN_ROOT="$2/run"
  HJ_VALIDATOR_URL="http://127.0.0.1:45123"
  HJ_BROWSER_WORKER_URL="http://127.0.0.1:45124"
  HJ_BROWSER_SITE_ORIGIN="http://127.0.0.1:45125"
  HJ_PROVIDER_BASE_URL="http://127.0.0.1:45126"
  TALOS_HJ_PROVIDER_BASE_URL="$HJ_PROVIDER_BASE_URL"
  TALOS_HJ_PROVIDER_MODEL="talos-hj-deterministic"
  TALOS_HJ_LOGIN_EMAIL="human-journey@example.test"
  TALOS_HJ_LOGIN_PASSWORD="test-only-password"
  TALOS_BROWSER_WORKER_TOKEN="test-only-worker-token"
  TALOS_BROWSER_ACTION_PRIVATE_KEY_B64="test-only-private-key"
  TALOS_BROWSER_ACTION_KEY_ID="test-only-key-id"
  APP_KEY="base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
  mkdir -p "$HJ_RUN_ROOT/runtime/secrets"
  hj_prepare_laravel_runtime
  for environment_file in "$HJ_LARAVEL_COMMAND_ENV_FILE" "$HJ_LARAVEL_SERVER_ENV_FILE"; do
    grep -Fxq "AVM_VALIDATOR_URL=$HJ_VALIDATOR_URL" "$environment_file"
    grep -Fxq "TALOS_VALIDATOR_HEALTH_URL=$HJ_VALIDATOR_URL/health" "$environment_file"
  done
  grep -Fxq "TALOS_BROWSER_TEST_FIXTURE_ORIGIN=$HJ_BROWSER_SITE_ORIGIN" "$HJ_LARAVEL_SERVER_ENV_FILE"
  if grep -Fq "TALOS_BROWSER_TEST_FIXTURE_ORIGIN=" "$HJ_LARAVEL_COMMAND_ENV_FILE"; then
    echo "fixture origin leaked into Laravel command environment" >&2
    exit 1
  fi
' _ "$ROOT_DIR" "$VALIDATOR_ENV_STATE_ROOT"; then
  fail "HJREADY-003 Laravel chat and health endpoints do not share the attested Validator origin"
fi

PREP_STATE_ROOT="$TEMP_DIR/prepared-state"
if ! bash -c '
  set -euo pipefail
  source "$1/scripts/human-journey/lib.sh"
  source "$1/scripts/human-journey/run.sh"
  HJ_LANE="deterministic"
  HJ_SCENARIO_ID="BROWSER-NATURAL-001"
  HJ_SEED="42"
  HJ_TRIALS="1"
  HJ_DIRECTOR="off"
  hj_prepare_run "$2"
  [[ "$HJ_RUN_ID" =~ ^hj_[0-9]{8}T[0-9]{6}Z_[0-9a-f]{8}$ ]]
  [ "$HJ_RUN_ROOT" = "$2/runs/$HJ_RUN_ID" ]
  for path in reports artifacts logs runtime runtime/secrets runtime/laravel; do
    [ -d "$HJ_RUN_ROOT/$path" ]
  done
  [ -f "$2/active.lock/owner.json" ]
  hj_prepare_secrets
  [ "$HJ_SECRETS_ENV_FILE" = "$HJ_RUN_ROOT/runtime/secrets/services.env" ] || { echo "secret env path mismatch" >&2; exit 41; }
  [ "$HJ_SECRET_CANARIES_FILE" = "$HJ_RUN_ROOT/runtime/secrets/canaries.json" ] || { echo "canary path mismatch" >&2; exit 42; }
  [ -f "$HJ_SECRETS_ENV_FILE" ] || { echo "secret env missing" >&2; exit 43; }
  [ -f "$HJ_SECRET_CANARIES_FILE" ] || { echo "canary file missing" >&2; exit 44; }
  [[ "$APP_KEY" =~ ^base64:[A-Za-z0-9+/]{43}=$ ]] || { echo "app key shape mismatch length=${#APP_KEY}" >&2; exit 45; }
  [[ "$TALOS_BROWSER_WORKER_TOKEN" =~ ^[A-Za-z0-9_-]{43}$ ]] || { echo "worker token shape mismatch" >&2; exit 46; }
  [[ "$TALOS_HJ_LOGIN_PASSWORD" =~ ^[A-Za-z0-9_-]{43}$ ]] || { echo "login token shape mismatch" >&2; exit 47; }
  [[ "$TALOS_HJ_SIDECAR_TOKEN" =~ ^[A-Za-z0-9_-]{43}$ ]] || { echo "sidecar token shape mismatch" >&2; exit 48; }
  [ "$TALOS_BROWSER_WORKER_TOKEN" != "$TALOS_HJ_LOGIN_PASSWORD" ] || { echo "worker/login token collision" >&2; exit 49; }
  [ "$TALOS_BROWSER_WORKER_TOKEN" != "$TALOS_HJ_SIDECAR_TOKEN" ] || { echo "worker/sidecar token collision" >&2; exit 50; }
  [[ "$TALOS_BROWSER_ACTION_KEY_ID" =~ ^talos-browser-action- ]] || { echo "action key id mismatch" >&2; exit 51; }
  [ -n "$TALOS_BROWSER_ACTION_PRIVATE_KEY_B64" ] || { echo "action private key missing" >&2; exit 52; }
  [ -n "$TALOS_BROWSER_ACTION_PUBLIC_KEY_B64" ] || { echo "action public key missing" >&2; exit 53; }
  "$TALOS_NODE_BIN" - "$HJ_SECRET_CANARIES_FILE" <<NODE
const fs = require("node:fs");
const values = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (!Array.isArray(values) || values.length < 6 || values.some((value) => typeof value !== "string" || value.length === 0)) process.exit(1);
if (new Set(values).size !== values.length) process.exit(2);
NODE
  if hj_acquire_run_lock "$2" 2>/dev/null; then
    exit 31
  fi
  hj_write_terminal_result "failed" "3" "HJ_PREREQUISITE_FAILED" "0" "" ""
  [ -f "$HJ_RUN_ROOT/result.json" ] || { echo "terminal result missing" >&2; exit 54; }
  "$TALOS_NODE_BIN" - "$HJ_RUN_ROOT/result.json" "$HJ_SECRET_CANARIES_FILE" <<NODE
const fs = require("node:fs");
const resultText = fs.readFileSync(process.argv[2], "utf8");
const result = JSON.parse(resultText);
const canaries = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const expectedKeys = [
  "assisted", "duration_ms", "evidence_manifest_path", "exit_code", "failure_code",
  "finished_at", "lane", "promotional", "protocol", "report_path", "run_id",
  "scenario_id", "seed", "started_at", "status", "trials_completed", "trials_requested",
].sort();
if (Object.keys(result).sort().join(",") !== expectedKeys.join(",")) process.exit(1);
if (result.protocol !== "talos.human_journey.result.v1"
  || result.status !== "failed"
  || result.exit_code !== 3
  || result.failure_code !== "HJ_PREREQUISITE_FAILED"
  || result.promotional !== false
  || result.assisted !== false
  || result.trials_completed !== 0
  || result.report_path !== null
  || result.evidence_manifest_path !== null) process.exit(2);
if (canaries.some((canary) => resultText.includes(canary))) process.exit(3);
NODE
  hj_cleanup
  [ ! -e "$HJ_RUN_ROOT/runtime/secrets" ]
  [ -f "$HJ_RUN_ROOT/result.json" ]
  [ -f "$2/active.lock/owner.json" ]
  hj_release_run_lock
  [ ! -e "$2/active.lock" ]
  [ -d "$HJ_RUN_ROOT" ]
' _ "$ROOT_DIR" "$PREP_STATE_ROOT"; then
  fail "isolated run preparation and exclusive lock contract failed"
fi

ASSISTED_STATE_ROOT="$TEMP_DIR/assisted-state"
if ! bash -c '
  set -euo pipefail
  source "$1/scripts/human-journey/lib.sh"
  source "$1/scripts/human-journey/run.sh"
  HJ_LANE="adaptive"
  HJ_SCENARIO_ID="BROWSER-NATURAL-001"
  HJ_SEED="42"
  HJ_TRIALS="1"
  HJ_RESUME_ID="hjtrial_20260718T220000Z_8f31c0aa_01"
  HJ_DIRECTOR="external"
  hj_verify_repo_toolchain
  hj_prepare_run "$2"
  printf "{}\n" > "$HJ_RUN_ROOT/reports/assisted.json"
  printf "{}\n" > "$HJ_RUN_ROOT/artifacts/evidence.json"
  hj_write_terminal_result \
    "passed" \
    "0" \
    "" \
    "1" \
    "reports/assisted.json" \
    "artifacts/evidence.json"
  "$TALOS_NODE_BIN" - "$HJ_RUN_ROOT/result.json" <<NODE
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (result.status !== "passed"
  || result.exit_code !== 0
  || result.assisted !== true
  || result.promotional !== false
  || result.report_path !== "reports/assisted.json"
  || result.evidence_manifest_path !== "artifacts/evidence.json") process.exit(1);
NODE
  hj_release_run_lock
  [ ! -e "$2/active.lock" ]
' _ "$ROOT_DIR" "$ASSISTED_STATE_ROOT"; then
  fail "HJRESULT-002 assisted run crossed the promotion fence"
fi

PASS_STATE_ROOT="$TEMP_DIR/pass-state"
PASS_CHILD_COMMAND='trap "exit 0" TERM INT; while :; do sleep 0.1; done'
if ! bash -c '
  set -euo pipefail
  source "$1/scripts/human-journey/lib.sh"
  source "$1/scripts/human-journey/run.sh"
  HJ_LANE="deterministic"
  HJ_SCENARIO_ID="BROWSER-NATURAL-001"
  HJ_SEED="42"
  HJ_TRIALS="1"
  HJ_DIRECTOR="off"
  hj_verify_repo_toolchain
  hj_prepare_run "$2"
  hj_prepare_secrets
  hj_start_owned_process \
    "pass-child" \
    "$HJ_RUN_ROOT/logs/pass-child.log" \
    bash -c "$3"
  pass_child_pid="$HJ_LAST_PROCESS_PID"
  printf "{}\n" > "$HJ_RUN_ROOT/reports/pass.json"
  printf "{}\n" > "$HJ_RUN_ROOT/artifacts/evidence.json"
  hj_finalize_success "1" "reports/pass.json" "artifacts/evidence.json"
  if kill -0 "$pass_child_pid" >/dev/null 2>&1; then exit 71; fi
  [ ! -e "$HJ_RUN_ROOT/runtime/secrets" ]
  [ ! -e "$2/active.lock" ]
  [ -f "$HJ_RUN_ROOT/reports/pass.json" ]
  [ -f "$HJ_RUN_ROOT/artifacts/evidence.json" ]
  "$TALOS_NODE_BIN" - "$HJ_RUN_ROOT/result.json" <<NODE
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (result.status !== "passed"
  || result.exit_code !== 0
  || result.assisted !== false
  || result.promotional !== true
  || result.trials_completed !== 1
  || result.report_path !== "reports/pass.json"
  || result.evidence_manifest_path !== "artifacts/evidence.json") process.exit(1);
NODE
' _ "$ROOT_DIR" "$PASS_STATE_ROOT" "$PASS_CHILD_COMMAND"; then
  fail "HJCLEAN-002 success finalization did not clean owned runtime state"
fi

CANCEL_STATE_ROOT="$TEMP_DIR/cancel-state"
CANCEL_READY_FILE="$TEMP_DIR/cancel-ready"
CANCEL_CANARY_FILE="$TEMP_DIR/cancel-canary"
CANCEL_CHILD_SCRIPT="$TEMP_DIR/cancel-child.sh"
CANCEL_DRIVER_PID=""
CANCEL_WATCHDOG_PID=""
cat > "$CANCEL_CHILD_SCRIPT" <<'SH'
#!/usr/bin/env bash
while :; do
  printf '%s\n' "$TALOS_HJ_LOGIN_PASSWORD"
  sleep 0.05
done
SH
chmod +x "$CANCEL_CHILD_SCRIPT"

cleanup_cancel_fixture() {
  [ -s "$CANCEL_READY_FILE" ] || return 0
  local run_root
  run_root="$(cat "$CANCEL_READY_FILE")"
  case "$run_root" in
    "$CANCEL_STATE_ROOT"/runs/hj_*) ;;
    *) return 1 ;;
  esac
  bash -c '
    set -u
    source "$1/scripts/human-journey/lib.sh"
    HJ_RUN_ROOT="$2"
    HJ_RUN_ID="${2##*/}"
    hj_stop_owned_processes || true
    _hj_remove_secrets_dir || true
  ' _ "$ROOT_DIR" "$run_root"
}

env --default-signal=INT bash -c '
  set -euo pipefail
  source "$1/scripts/human-journey/lib.sh"
  source "$1/scripts/human-journey/run.sh"
  runner_attested=0
  for _ in $(seq 1 40); do
    if _hj_process_row "$$" >/dev/null 2>&1; then
      runner_attested=1
      break
    fi
    sleep 0.05
  done
  [ "$runner_attested" -eq 1 ]
  HJ_LANE="deterministic"
  HJ_SCENARIO_ID="BROWSER-NATURAL-001"
  HJ_SEED="42"
  HJ_TRIALS="1"
  HJ_DIRECTOR="off"
  hj_prepare_run "$2"
  hj_prepare_secrets
  printf "%s" "$TALOS_HJ_LOGIN_PASSWORD" > "$4"
  trap '\''hj_handle_signal "INT"'\'' INT TERM
  hj_start_owned_process \
    "cancel-child" \
    "$HJ_RUN_ROOT/logs/cancel-child.log" \
    bash "$5"
  printf "%s\n" "$HJ_RUN_ROOT" > "$3"
  while :; do sleep 0.1; done
' _ "$ROOT_DIR" "$CANCEL_STATE_ROOT" "$CANCEL_READY_FILE" "$CANCEL_CANARY_FILE" "$CANCEL_CHILD_SCRIPT" &
CANCEL_DRIVER_PID=$!

for _ in $(seq 1 200); do
  [ -s "$CANCEL_READY_FILE" ] && break
  kill -0 "$CANCEL_DRIVER_PID" >/dev/null 2>&1 || break
  sleep 0.05
done
[ -s "$CANCEL_READY_FILE" ] || fail "cancellation fixture did not reach its owned-process checkpoint"
kill -INT "$CANCEL_DRIVER_PID" || fail "cancellation driver did not accept SIGINT"

(
  sleep 30
  if kill -0 "$CANCEL_DRIVER_PID" >/dev/null 2>&1; then
    kill -KILL "$CANCEL_DRIVER_PID" >/dev/null 2>&1 || true
  fi
) &
CANCEL_WATCHDOG_PID=$!

set +e
wait "$CANCEL_DRIVER_PID"
CANCEL_STATUS=$?
set -e
CANCEL_DRIVER_PID=""
kill "$CANCEL_WATCHDOG_PID" >/dev/null 2>&1 || true
wait "$CANCEL_WATCHDOG_PID" >/dev/null 2>&1 || true
CANCEL_WATCHDOG_PID=""
[ "$CANCEL_STATUS" -eq 130 ] || fail "SIGINT lifecycle returned $CANCEL_STATUS instead of 130"
CANCEL_RUN_ROOT="$(cat "$CANCEL_READY_FILE")"
[ -f "$CANCEL_RUN_ROOT/result.json" ] || fail "cancelled run did not retain result.json"
[ ! -e "$CANCEL_RUN_ROOT/runtime/secrets" ] || fail "cancelled run retained raw secrets"
[ ! -e "$CANCEL_STATE_ROOT/active.lock" ] || fail "cancelled run retained its active lock"
CANCEL_CANARY="$(cat "$CANCEL_CANARY_FILE")"
if grep -Fq -- "$CANCEL_CANARY" "$CANCEL_RUN_ROOT/logs/cancel-child.log"; then
  fail "cancelled child wrote a raw secret after log redaction"
fi
grep -Fq '[REDACTED]' "$CANCEL_RUN_ROOT/logs/cancel-child.log" || fail "live-writer canary was not redacted"
"$ROOT_DIR/.tools/node/node.exe" - "$CANCEL_RUN_ROOT/result.json" "$CANCEL_RUN_ROOT/runtime/processes.jsonl" <<'NODE'
const fs = require('node:fs');
const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (result.status !== 'cancelled' || result.exit_code !== 130 || result.promotional !== false) process.exit(1);
const events = fs.readFileSync(process.argv[3], 'utf8').trim().split(/\r?\n/u).filter(Boolean).map(JSON.parse);
const latest = new Map(events.map((event) => [event.pid, event]));
if ([...latest.values()].some((event) => event.terminal_status === 'running')) process.exit(2);
NODE

CLEANUP_STATE_ROOT="$TEMP_DIR/cleanup-failure-state"
CLEANUP_DIAGNOSTIC="$TEMP_DIR/cleanup-finalize.stderr"
if ! bash -c '
  set -euo pipefail
  source "$1/scripts/human-journey/lib.sh"
  source "$1/scripts/human-journey/run.sh"
  HJ_LANE="deterministic"
  HJ_SCENARIO_ID="BROWSER-NATURAL-001"
  HJ_SEED="42"
  HJ_TRIALS="1"
  HJ_DIRECTOR="off"
  hj_prepare_run "$2"
  hj_prepare_secrets
  mkdir "$HJ_RUN_ROOT/runtime/secrets/unexpected-directory"
  set +e
  hj_finalize_failure "4" "HJ_START_FAILED" "0" "failed" 2>"$3"
  final_status=$?
  set -e
  [ "$final_status" -eq 6 ] || { echo "cleanup final status mismatch: $final_status" >&2; exit 61; }
  grep -Fq "refuses nested or non-file secret entries" "$3" || { echo "cleanup diagnostic missing" >&2; exit 62; }
  [ ! -f "$HJ_RUN_ROOT/runtime/secrets/services.env" ] || { echo "known service secrets survived" >&2; exit 63; }
  [ ! -f "$HJ_RUN_ROOT/runtime/secrets/canaries.json" ] || { echo "known canaries survived" >&2; exit 64; }
  [ -d "$HJ_RUN_ROOT/runtime/secrets/unexpected-directory" ] || { echo "unexpected directory was traversed" >&2; exit 65; }
  [ ! -e "$2/active.lock" ] || { echo "cleanup failure retained lock" >&2; exit 66; }
  "$TALOS_NODE_BIN" - "$HJ_RUN_ROOT/result.json" <<NODE
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (result.status !== "failed" || result.exit_code !== 6 || result.failure_code !== "HJ_CLEANUP_FAILED" || result.promotional !== false) process.exit(1);
NODE
' _ "$ROOT_DIR" "$CLEANUP_STATE_ROOT" "$CLEANUP_DIAGNOSTIC"; then
  fail "cleanup failure did not fail closed while deleting known secret files"
fi

PLAYWRIGHT_STATE_ROOT="$TEMP_DIR/playwright-state"
if ! bash -c '
  set -euo pipefail
  source "$1/scripts/human-journey/lib.sh"
  source "$1/scripts/human-journey/run.sh"
  HJ_LANE="deterministic"
  HJ_SCENARIO_ID="BROWSER-NATURAL-001"
  HJ_SEED="42"
  HJ_TRIALS="1"
  HJ_DIRECTOR="off"
  hj_prepare_run "$2"
  trap '\''
    if [ -n "${HJ_RUN_ROOT:-}" ]; then hj_stop_owned_processes >/dev/null 2>&1 || true; fi
    if [ -n "${HJ_RUN_LOCK_DIR:-}" ]; then hj_release_run_lock >/dev/null 2>&1 || true; fi
  '\'' EXIT
  hj_prepare_secrets
  HJ_LARAVEL_URL="http://127.0.0.1:9"
  export HJ_LARAVEL_URL
  set +e
  hj_run_playwright
  missing_stack_status=$?
  set -e
  [ "$missing_stack_status" -eq 5 ]
  [ "$HJ_PLAYWRIGHT_FAILURE_CODE" = "HJ_PLAYWRIGHT_HANDOFF_FAILED" ]
  HJ_PROVIDER_BASE_URL="http://127.0.0.1:10"
  HJ_BROWSER_SITE_ORIGIN="http://127.0.0.1:11"
  TALOS_HJ_PROVIDER_CONTROL_TOKEN="$(printf '\''a%.0s'\'' $(seq 1 64))"
  TALOS_HJ_PROVIDER_MODEL="talos-hj-deterministic"
  TALOS_HJ_MODEL_ENDPOINT_SHA256="sha256:$(printf '\''b%.0s'\'' $(seq 1 64))"
  export \
    HJ_PROVIDER_BASE_URL \
    HJ_BROWSER_SITE_ORIGIN \
    TALOS_HJ_PROVIDER_CONTROL_TOKEN \
    TALOS_HJ_PROVIDER_MODEL \
    TALOS_HJ_MODEL_ENDPOINT_SHA256
  set +e
  hj_run_playwright
  playwright_status=$?
  set -e
  [ "$playwright_status" -eq 5 ]
  [ "$HJ_PLAYWRIGHT_FAILURE_CODE" = "HJ_JOURNEY_FAILED" ]
  [ "$HJ_PLAYWRIGHT_REPORT_PATH" = "reports/playwright/results.json" ]
  [ -s "$HJ_RUN_ROOT/logs/playwright.log" ]
  [ -f "$HJ_RUN_ROOT/reports/playwright/results.json" ]
  set +e
  hj_finalize_failure "5" "$HJ_PLAYWRIGHT_FAILURE_CODE" "0" "failed"
  final_status=$?
  set -e
  [ "$final_status" -eq 5 ]
  [ ! -e "$HJ_RUN_ROOT/runtime/secrets" ]
  [ ! -e "$2/active.lock" ]
  "$TALOS_NODE_BIN" - "$HJ_RUN_ROOT/result.json" <<NODE
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (result.status !== "failed" || result.exit_code !== 5 || result.failure_code !== "HJ_JOURNEY_FAILED" || result.promotional !== false) process.exit(1);
NODE
  trap - EXIT
' _ "$ROOT_DIR" "$PLAYWRIGHT_STATE_ROOT"; then
  fail "HJPLAY-001 dead-stack product journey was not a controlled Playwright failure"
fi

grep -Fq 'baseURL:' "$ROOT_DIR/control-plane/playwright.human-journey.config.ts" \
  || fail "Human Journey Playwright config does not consume the ready base URL"
if grep -Eq '(^|[^A-Za-z])webServer[[:space:]]*:' "$ROOT_DIR/control-plane/playwright.human-journey.config.ts"; then
  fail "Human Journey Playwright config must not own a web server"
fi

FIXTURE_STATE_ROOT="$TEMP_DIR/fixture-state"
if ! bash -c '
  set -euo pipefail
  source "$1/scripts/human-journey/lib.sh"
  source "$1/scripts/human-journey/run.sh"
  HJ_LANE="deterministic"
  HJ_SCENARIO_ID="BROWSER-NATURAL-001"
  HJ_SEED="42"
  HJ_TRIALS="1"
  HJ_DIRECTOR="off"
  hj_prepare_run "$2"
  hj_prepare_secrets
  hj_start_fixture_host
  [[ "$HJ_BROWSER_SITE_ORIGIN" =~ ^http://127\.0\.0\.1:[0-9]+$ ]]
  [[ "$HJ_PROVIDER_BASE_URL" =~ ^http://127\.0\.0\.1:[0-9]+$ ]]
  [ "$HJ_PROVIDER_HEALTH_URL" = "$HJ_PROVIDER_BASE_URL/health" ]
  [[ "$TALOS_HJ_PROVIDER_CONTROL_TOKEN" =~ ^[a-f0-9]{64}$ ]]
  kill -0 "$HJ_FIXTURE_HOST_PID"
  hj_wait_http "$HJ_PROVIDER_HEALTH_URL" "3" "\"status\":\"ok\""
  hj_wait_http "$HJ_BROWSER_SITE_ORIGIN/" "3" "Deterministic catalog"
  grep -Fq '"browser-site"' "$HJ_RUN_ROOT/runtime/ports.json"
  grep -Fq '"provider-fixture"' "$HJ_RUN_ROOT/runtime/ports.json"
  TALOS_HJ_EXPECTED_CANARY="$TALOS_HJ_PROVIDER_CONTROL_TOKEN" "$TALOS_NODE_BIN" - "$HJ_SECRET_CANARIES_FILE" <<NODE
const fs = require("node:fs");
const canaries = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (!canaries.includes(process.env.TALOS_HJ_EXPECTED_CANARY)) process.exit(1);
NODE
  set +e
  hj_finalize_failure "4" "HJ_FIXTURE_PROBE_COMPLETE" "0" "failed"
  final_status=$?
  set -e
  [ "$final_status" -eq 4 ]
  if kill -0 "$HJ_FIXTURE_HOST_PID" >/dev/null 2>&1; then exit 71; fi
  [ ! -e "$HJ_RUN_ROOT/runtime/secrets" ]
  [ ! -e "$2/active.lock" ]
' _ "$ROOT_DIR" "$FIXTURE_STATE_ROOT"; then
  fail "fixture host was not integrated into owned run lifecycle"
fi

if ! bash -c '
  set -euo pipefail
  source "$1/scripts/human-journey/lib.sh"
  source "$1/scripts/human-journey/run.sh"
  trace=""
  append_step() { trace="${trace}${trace:+,}$1"; }
  hj_verify_repo_toolchain() { append_step toolchain; }
  hj_start_fixture_host() { append_step fixture; }
  hj_start_tau2_sidecar() { append_step sidecar; }
  hj_start_validator() { append_step validator; }
  hj_start_browser_worker() { append_step browser; }
  hj_prepare_laravel_runtime() { append_step prepare-laravel; }
  hj_start_laravel() { append_step laravel; }

  HJ_LANE="deterministic"
  hj_start_selected_stack
  [ "$trace" = "toolchain,fixture,validator,browser,prepare-laravel,laravel" ]

  trace=""
  HJ_LANE="release"
  hj_start_selected_stack
  [ "$trace" = "toolchain,fixture,validator,browser,prepare-laravel,laravel" ]

  trace=""
  HJ_LANE="adaptive"
  hj_start_selected_stack
  [ "$trace" = "toolchain,fixture,sidecar,validator,browser,prepare-laravel,laravel" ]
' _ "$ROOT_DIR"; then
  fail "HJ9-029 lane selection did not isolate the adaptive sidecar"
fi

ADAPTIVE_STATE_ROOT="$TEMP_DIR/adaptive-fixture-state"
if ! bash -c '
  set -euo pipefail
  source "$1/scripts/human-journey/lib.sh"
  source "$1/scripts/human-journey/run.sh"
  HJ_LANE="adaptive"
  HJ_SCENARIO_ID="BROWSER-NATURAL-001"
  HJ_SEED="42"
  HJ_TRIALS="3"
  HJ_DIRECTOR="off"
  hj_prepare_run "$2"
  trap '\''
    if [ -n "${HJ_RUN_ROOT:-}" ]; then hj_stop_owned_processes >/dev/null 2>&1 || true; fi
    if [ -n "${HJ_RUN_LOCK_DIR:-}" ]; then hj_release_run_lock >/dev/null 2>&1 || true; fi
  '\'' EXIT
  hj_prepare_secrets
  hj_start_fixture_host

  [[ "$HJ_BROWSER_SITE_ORIGIN" =~ ^http://127\.0\.0\.1:[0-9]+$ ]]
  [[ "$HJ_PROVIDER_BASE_URL" =~ ^http://127\.0\.0\.1:[0-9]+$ ]]
  [[ "$HJ_SIMULATOR_BASE_URL" =~ ^http://127\.0\.0\.1:[0-9]+/v1$ ]]
  [ "$HJ_PROVIDER_BASE_URL" != "$HJ_SIMULATOR_BASE_URL" ]
  [[ "$HJ_SIMULATOR_HEALTH_URL" =~ ^http://127\.0\.0\.1:[0-9]+/health$ ]]
  [[ "$TALOS_HJ_SIMULATOR_API_KEY" =~ ^[a-f0-9]{64}$ ]]
  hj_wait_http "$HJ_SIMULATOR_HEALTH_URL" "3" "\"status\":\"ok\""

  hj_start_tau2_sidecar
  [[ "$HJ_TAU2_SIDECAR_URL" =~ ^http://127\.0\.0\.1:[0-9]+$ ]]
  [ "$HJ_TAU2_SIDECAR_READY_URL" = "$HJ_TAU2_SIDECAR_URL/readyz" ]
  hj_wait_http "$HJ_TAU2_SIDECAR_URL/healthz" "3" "\"status\":\"alive\""
  unauthenticated_status="$(curl --silent --output /dev/null --write-out "%{http_code}" "$HJ_TAU2_SIDECAR_READY_URL")"
  [ "$unauthenticated_status" = "401" ]
  hj_wait_http_with_bearer_token "$HJ_TAU2_SIDECAR_READY_URL" "5" "\"status\":\"ready\"" "$TALOS_HJ_SIDECAR_TOKEN"

  [ -f "$HJ_TAU2_SIDECAR_TOKEN_FILE" ]
  [ -f "$HJ_TAU2_SIMULATOR_API_KEY_FILE" ]
  [ "$(cat "$HJ_TAU2_SIDECAR_TOKEN_FILE")" = "$TALOS_HJ_SIDECAR_TOKEN" ]
  [ "$(cat "$HJ_TAU2_SIMULATOR_API_KEY_FILE")" = "$TALOS_HJ_SIMULATOR_API_KEY" ]
  if grep -Fq "$TALOS_HJ_SIDECAR_TOKEN" "$HJ_TAU2_SIDECAR_ENV_FILE"; then
    echo "sidecar token leaked into sidecar environment" >&2
    exit 81
  fi
  if grep -Fq "$TALOS_HJ_SIMULATOR_API_KEY" "$HJ_TAU2_SIDECAR_ENV_FILE"; then
    echo "simulator key leaked into sidecar environment" >&2
    exit 82
  fi

  HJ_LARAVEL_URL="http://127.0.0.1:9"
  artifact_root="$HJ_RUN_ROOT/reports/playwright"
  mkdir -p "$artifact_root"
  native_artifact_root="$(_hj_native_path "$artifact_root")"
  playwright_env="$HJ_RUN_ROOT/runtime/secrets/playwright-adaptive.env"
  hj_prepare_playwright_environment "$playwright_env" "$native_artifact_root"
  grep -Fxq "TALOS_HJ_TAU2_SIDECAR_URL=$HJ_TAU2_SIDECAR_URL" "$playwright_env"
  grep -Fxq "TALOS_HJ_TAU2_SIDECAR_TOKEN=$TALOS_HJ_SIDECAR_TOKEN" "$playwright_env"
  grep -Fxq "TALOS_HJ_MODEL_PROVIDER_ID=ollama" "$playwright_env"
  grep -Fxq "TALOS_HJ_MODEL_NAME=$TALOS_HJ_PROVIDER_MODEL" "$playwright_env"
  grep -Fxq "TALOS_HJ_MODEL_ENDPOINT_SHA256=$TALOS_HJ_MODEL_ENDPOINT_SHA256" "$playwright_env"
  if grep -Fq "$TALOS_HJ_SIMULATOR_API_KEY" "$playwright_env"; then
    echo "simulator key leaked into Playwright environment" >&2
    exit 83
  fi
  if grep -Fq "$HJ_SIMULATOR_BASE_URL" "$playwright_env"; then
    echo "simulator endpoint leaked into Playwright environment" >&2
    exit 84
  fi

  TALOS_HJ_EXPECTED_CANARY="$TALOS_HJ_SIMULATOR_API_KEY" "$TALOS_NODE_BIN" - "$HJ_SECRET_CANARIES_FILE" <<NODE
const fs = require("node:fs");
const canaries = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (!canaries.includes(process.env.TALOS_HJ_EXPECTED_CANARY)) process.exit(1);
NODE

  sidecar_pid="$HJ_TAU2_SIDECAR_PID"
  fixture_pid="$HJ_FIXTURE_HOST_PID"
  set +e
  hj_finalize_failure "4" "HJ_ADAPTIVE_FIXTURE_PROBE_COMPLETE" "0" "failed"
  final_status=$?
  set -e
  [ "$final_status" -eq 4 ]
  if kill -0 "$sidecar_pid" >/dev/null 2>&1; then exit 85; fi
  if kill -0 "$fixture_pid" >/dev/null 2>&1; then exit 86; fi
  [ ! -e "$HJ_RUN_ROOT/runtime/secrets" ]
  [ ! -e "$2/active.lock" ]
  trap - EXIT
' _ "$ROOT_DIR" "$ADAPTIVE_STATE_ROOT"; then
  fail "HJ9-029 adaptive fixture, sidecar auth, secret handoff, or cleanup contract failed"
fi

if [ "${TALOS_HJ_SKIP_STACK_CONTRACT:-0}" != "1" ]; then
  STACK_STATE_ROOT="$TEMP_DIR/stack-state"
  if ! bash -c '
  set -euo pipefail
  source "$1/scripts/human-journey/lib.sh"
  source "$1/scripts/human-journey/run.sh"
  HJ_LANE="deterministic"
  HJ_SCENARIO_ID="BROWSER-NATURAL-001"
  HJ_SEED="42"
  HJ_TRIALS="1"
  HJ_DIRECTOR="off"
  hj_prepare_run "$2"
  trap '\''
    if [ -n "${HJ_RUN_ROOT:-}" ]; then hj_stop_owned_processes >/dev/null 2>&1 || true; fi
    if [ -n "${HJ_RUN_LOCK_DIR:-}" ]; then hj_release_run_lock >/dev/null 2>&1 || true; fi
  '\'' EXIT
  hj_prepare_secrets
  hj_start_deterministic_stack

  [[ "$HJ_VALIDATOR_URL" =~ ^http://127\.0\.0\.1:[0-9]+$ ]]
  [[ "$HJ_BROWSER_WORKER_URL" =~ ^http://127\.0\.0\.1:[0-9]+$ ]]
  [[ "$HJ_LARAVEL_URL" =~ ^http://127\.0\.0\.1:[0-9]+$ ]]
  hj_wait_http "$HJ_VALIDATOR_URL/health" "3" "avm-validator"
  hj_wait_http_with_worker_token "$HJ_BROWSER_WORKER_URL/ready" "5" "\"status\":\"ready\"" "$TALOS_BROWSER_WORKER_TOKEN"
  hj_wait_http "$HJ_LARAVEL_URL/login" "5" "<title>TALOS Access</title>"
  [ -f "$HJ_RUN_ROOT/runtime/laravel/readiness.json" ]
  [ -f "$HJ_RUN_ROOT/runtime/laravel/database.sqlite" ]
  grep -Fq '\''"validator"'\'' "$HJ_RUN_ROOT/runtime/ports.json"
  grep -Fq '\''"browser-worker"'\'' "$HJ_RUN_ROOT/runtime/ports.json"
  grep -Fq '\''"laravel"'\'' "$HJ_RUN_ROOT/runtime/ports.json"

  TALOS_HJ_DB="$HJ_RUN_ROOT/runtime/laravel/database.sqlite" \
  TALOS_HJ_EMAIL="$TALOS_HJ_LOGIN_EMAIL" \
  TALOS_HJ_PROVIDER="$TALOS_HJ_PROVIDER_BASE_URL" \
    "$TALOS_PHP_BIN" -r '\''
      $pdo = new PDO("sqlite:".getenv("TALOS_HJ_DB"));
      $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
      $user = $pdo->prepare("select count(*) from users where email = ?");
      $user->execute([getenv("TALOS_HJ_EMAIL")]);
      if ((int) $user->fetchColumn() !== 1) exit(81);
      $profile = $pdo->prepare("select count(*) from talos_model_profiles where provider = ? and base_url = ? and encrypted_secret is null");
      $profile->execute(["ollama", getenv("TALOS_HJ_PROVIDER")]);
      if ((int) $profile->fetchColumn() !== 1) exit(82);
    '\''

  set +e
  hj_run_playwright
  playwright_status=$?
  set -e
  [ "$playwright_status" -eq 0 ]
  [ -z "$HJ_PLAYWRIGHT_FAILURE_CODE" ]
  [ -s "$HJ_RUN_ROOT/logs/playwright.log" ]
  [ -f "$HJ_RUN_ROOT/reports/playwright/results.json" ]
  set +e
  hj_finalize_success "1" "$HJ_PLAYWRIGHT_REPORT_PATH" ""
  final_status=$?
  set -e
  [ "$final_status" -eq 0 ]
  [ ! -e "$HJ_RUN_ROOT/runtime/secrets" ]
  [ ! -e "$2/active.lock" ]
  "$TALOS_NODE_BIN" - "$HJ_RUN_ROOT/result.json" "$HJ_RUN_ROOT/runtime/processes.jsonl" <<NODE
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (result.status !== "passed" || result.exit_code !== 0 || result.failure_code !== null || result.promotional !== false) process.exit(1);
const events = fs.readFileSync(process.argv[3], "utf8").trim().split(/\r?\n/u).filter(Boolean).map(JSON.parse);
const latest = new Map(events.map((event) => [event.pid, event]));
if ([...latest.values()].some((event) => event.terminal_status === "running")) process.exit(2);
NODE
  trap - EXIT
' _ "$ROOT_DIR" "$STACK_STATE_ROOT"; then
    fail "HJSTART-001 real isolated deterministic stack contract failed"
  fi
fi

INJECTION_MARKER="$TEMP_DIR/injection-ran"
assert_invalid "--scenario=\$(touch $INJECTION_MARKER)"
[ ! -e "$INJECTION_MARKER" ] || fail "CLI arguments were evaluated as shell code"

export HJ_RUN_ID="hj_20260718T220000Z_8f31c0aa"
export HJ_RUN_ROOT="$TEMP_DIR/run"
mkdir -p "$HJ_RUN_ROOT/runtime" "$HJ_RUN_ROOT/logs"

# shellcheck source=scripts/human-journey/lib.sh
source "$ROOT_DIR/scripts/human-journey/lib.sh"

NODE_PATH="$(hj_resolve_node)"
[ -f "$NODE_PATH" ] || fail "repo-local Node wrapper was not resolved"

GENERATED_RUN_ID="$(hj_generate_run_id)"
[[ "$GENERATED_RUN_ID" =~ ^hj_[0-9]{8}T[0-9]{6}Z_[0-9a-f]{8}$ ]] || fail "run ID shape is invalid"

GENERATED_TOKEN="$(hj_generate_token 32)"
[[ "$GENERATED_TOKEN" =~ ^[A-Za-z0-9_-]{43}$ ]] || fail "token shape is invalid"

GENERATED_APP_KEY="$(hj_generate_app_key)"
[[ "$GENERATED_APP_KEY" =~ ^base64:[A-Za-z0-9+/]{43}=$ ]] || fail "Laravel app-key shape is invalid"

hj_allocate_port "fixture"
[[ "$HJ_LAST_PORT" =~ ^[0-9]+$ ]] || fail "allocated port is invalid"
grep -Fq '"fixture"' "$HJ_RUN_ROOT/runtime/ports.json" || fail "allocated port was not recorded"

sleep 60 &
SENTINEL_PID=$!

SENTINEL_ROW="$(_hj_process_row "$SENTINEL_PID")"
SENTINEL_IDENTITY="$(_hj_hash_text "$SENTINEL_ROW")"
if hj_process_is_owned "$SENTINEL_PID" "$SENTINEL_IDENTITY"; then
  fail "an unledgered process was accepted as run-owned"
fi

hj_start_owned_process \
  "owned-test" \
  "$HJ_RUN_ROOT/logs/owned-test.log" \
  bash -c 'trap "exit 0" TERM INT; while :; do sleep 0.1; done'
OWNED_PID="$HJ_LAST_PROCESS_PID"

kill -0 "$OWNED_PID" >/dev/null 2>&1 || fail "owned process did not start"
hj_process_is_owned "$OWNED_PID" || fail "owned process identity was not recognized"
grep -Fq '"protocol":"talos.human_journey.process.v1"' "$HJ_RUN_ROOT/runtime/processes.jsonl" || fail "process protocol was not recorded"
grep -Fq '"service":"owned-test"' "$HJ_RUN_ROOT/runtime/processes.jsonl" || fail "process service was not recorded"

hj_stop_owned_processes
if kill -0 "$OWNED_PID" >/dev/null 2>&1; then
  fail "owned process survived cleanup"
fi
kill -0 "$SENTINEL_PID" >/dev/null 2>&1 || fail "unowned sentinel was terminated"

hj_stop_owned_processes
kill "$SENTINEL_PID" >/dev/null 2>&1 || true
wait "$SENTINEL_PID" >/dev/null 2>&1 || true
SENTINEL_PID=""

REAL_PS="$(command -v ps)"
ps() {
  if [ "${HJ_INCOMPLETE_PS_ROW:-0}" = "1" ]; then
    printf 'PID\n%s\n' "${2:-}"
    return 0
  fi
  if [ -n "${HJ_TRANSIENT_PS_COUNTER_FILE:-}" ] && [ "${1:-}" = "-p" ]; then
    local count=0
    [ ! -f "$HJ_TRANSIENT_PS_COUNTER_FILE" ] || count="$(cat "$HJ_TRANSIENT_PS_COUNTER_FILE")"
    count=$((count + 1))
    printf '%s' "$count" > "$HJ_TRANSIENT_PS_COUNTER_FILE"
    if [ "$count" -le 2 ]; then
      command "$REAL_PS" "$@" | awk 'NR == 1 { print; next } { $4 = 999999; print }'
      return 0
    fi
  fi
  command "$REAL_PS" "$@"
}

FAILED_START_PID_FILE="$TEMP_DIR/failed-start.pid"
HJ_INCOMPLETE_PS_ROW=1
if hj_start_owned_process \
  "unattested-test" \
  "$HJ_RUN_ROOT/logs/unattested-test.log" \
  bash -c 'printf "%s" "$BASHPID" > "$1"; trap "exit 0" TERM INT; while :; do sleep 0.1; done' \
  _ "$FAILED_START_PID_FILE"; then
  fail "startup unexpectedly accepted an incomplete process identity"
fi
HJ_INCOMPLETE_PS_ROW=0

for _ in $(seq 1 20); do
  [ -s "$FAILED_START_PID_FILE" ] && break
  sleep 0.05
done
[ -s "$FAILED_START_PID_FILE" ] || fail "failed-start child did not publish its PID"
FAILED_START_PID="$(cat "$FAILED_START_PID_FILE")"
if kill -0 "$FAILED_START_PID" >/dev/null 2>&1; then
  fail "an unattested startup process survived failure"
fi
FAILED_START_PID=""
if grep -Fq '"service":"unattested-test"' "$HJ_RUN_ROOT/runtime/processes.jsonl"; then
  fail "an unattested process was written to the ownership ledger"
fi

hj_start_owned_process \
  "identity-mismatch" \
  "$HJ_RUN_ROOT/logs/identity-mismatch.log" \
  bash -c 'trap "exit 0" TERM INT; while :; do sleep 0.1; done'
MISMATCH_PID="$HJ_LAST_PROCESS_PID"
MISMATCH_RECORD="$(_hj_active_process_records)"
IFS=$'\t' read -r \
  MISMATCH_SERVICE \
  MISMATCH_RECORD_PID \
  MISMATCH_NATIVE_PID \
  MISMATCH_GROUP_MODE \
  MISMATCH_EXECUTABLE \
  MISMATCH_COMMAND_SHA256 \
  MISMATCH_IDENTITY_SHA256 \
  MISMATCH_LOG_PATH \
  MISMATCH_STARTED_AT <<< "$MISMATCH_RECORD"

[ "$MISMATCH_RECORD_PID" = "$MISMATCH_PID" ] || fail "mismatch fixture ledger PID is wrong"
MISMATCH_FORGED_IDENTITY="sha256:$(printf '0%.0s' $(seq 1 64))"
_hj_append_process_event \
  "$MISMATCH_SERVICE" \
  "$MISMATCH_PID" \
  "$MISMATCH_NATIVE_PID" \
  "$MISMATCH_GROUP_MODE" \
  "$MISMATCH_EXECUTABLE" \
  "$MISMATCH_COMMAND_SHA256" \
  "$MISMATCH_FORGED_IDENTITY" \
  "$MISMATCH_LOG_PATH" \
  "running" \
  "$MISMATCH_STARTED_AT"

if hj_stop_owned_processes; then
  fail "cleanup accepted a mismatched process identity"
fi
kill -0 "$MISMATCH_PID" >/dev/null 2>&1 || fail "identity-mismatched process was terminated"
grep -Fq '"service":"identity-mismatch"' "$HJ_RUN_ROOT/runtime/processes.jsonl" || fail "mismatch service was not retained"
grep -Fq '"terminal_status":"cleanup_failed"' "$HJ_RUN_ROOT/runtime/processes.jsonl" || fail "cleanup failure was not retained"

_hj_signal_owned_process "$MISMATCH_PID" "$MISMATCH_NATIVE_PID" "$MISMATCH_GROUP_MODE" TERM
for _ in $(seq 1 20); do
  kill -0 "$MISMATCH_PID" >/dev/null 2>&1 || break
  sleep 0.05
done
if kill -0 "$MISMATCH_PID" >/dev/null 2>&1; then
  _hj_signal_owned_process "$MISMATCH_PID" "$MISMATCH_NATIVE_PID" "$MISMATCH_GROUP_MODE" KILL
fi
wait "$MISMATCH_PID" >/dev/null 2>&1 || true

case "$(uname -s 2>/dev/null || true)" in
  MINGW*|MSYS*|CYGWIN*)
    STABLE_ENV_FILE="$HJ_RUN_ROOT/runtime/secrets/stable-owned.env"
    STABLE_PID_FILE="$TEMP_DIR/stable-owned.native-pid"
    STABLE_PS_COUNTER="$TEMP_DIR/stable-owned.ps-count"
    mkdir -p "$HJ_RUN_ROOT/runtime/secrets"
    : > "$STABLE_ENV_FILE"
    chmod 600 "$STABLE_ENV_FILE"
    HJ_TRANSIENT_PS_COUNTER_FILE="$STABLE_PS_COUNTER"
    export HJ_TRANSIENT_PS_COUNTER_FILE
    _hj_start_owned_process_clean_env \
      "stable-owned" \
      "$HJ_RUN_ROOT/logs/stable-owned.log" \
      "TALOS_HJ_ENV_ROOT=$HJ_RUN_ROOT" \
      bash "$ROOT_DIR/scripts/human-journey/exec-env.sh" "$STABLE_ENV_FILE" \
      "$NODE_PATH" -e \
      'const fs = require("node:fs"); fs.writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000);' \
      "$STABLE_PID_FILE"
    STABLE_WRAPPER_PID="$HJ_LAST_PROCESS_PID"
    STABLE_ATTESTED_NATIVE_PID="$HJ_LAST_PROCESS_NATIVE_PID"
    unset HJ_TRANSIENT_PS_COUNTER_FILE

    for _ in $(seq 1 40); do
      [ -s "$STABLE_PID_FILE" ] && break
      sleep 0.05
    done
    [ -s "$STABLE_PID_FILE" ] || fail "HJPROC-006 final native process did not publish its PID"
    STABLE_FINAL_NATIVE_PID="$(cat "$STABLE_PID_FILE")"
    if [ "$STABLE_ATTESTED_NATIVE_PID" != "$STABLE_FINAL_NATIVE_PID" ]; then
      MSYS2_ARG_CONV_EXCL='*' taskkill.exe /pid "$STABLE_FINAL_NATIVE_PID" /t /f >/dev/null 2>&1 || true
      _hj_stop_unattested_process "$STABLE_WRAPPER_PID" "pid"
      fail "HJPROC-006 attested a transient Windows PID"
    fi
    sleep 0.2
    if ! hj_process_is_owned "$STABLE_WRAPPER_PID"; then
      MSYS2_ARG_CONV_EXCL='*' taskkill.exe /pid "$STABLE_FINAL_NATIVE_PID" /t /f >/dev/null 2>&1 || true
      _hj_stop_unattested_process "$STABLE_WRAPPER_PID" "pid"
      fail "HJPROC-006 final process identity did not remain stable"
    fi
    hj_stop_owned_processes
    if "$NODE_PATH" -e '
      try { process.kill(Number(process.argv[1]), 0); process.exit(0); }
      catch { process.exit(1); }
    ' "$STABLE_FINAL_NATIVE_PID"; then
      fail "HJPROC-006 final native process survived cleanup"
    fi
    ;;
esac

NATIVE_TREE_PID_FILE="$TEMP_DIR/native-tree.pid"
NATIVE_TREE_SCRIPT='
  const fs = require("node:fs");
  fs.writeFileSync(process.argv[1], String(process.pid));
  setInterval(() => {}, 1_000);
'
hj_start_owned_process \
  "native-tree" \
  "$HJ_RUN_ROOT/logs/native-tree.log" \
  bash -c '"$1" -e "$2" "$3" & wait' _ "$NODE_PATH" "$NATIVE_TREE_SCRIPT" "$NATIVE_TREE_PID_FILE"
NATIVE_TREE_WRAPPER_PID="$HJ_LAST_PROCESS_PID"
for _ in $(seq 1 40); do
  [ -s "$NATIVE_TREE_PID_FILE" ] && break
  sleep 0.05
done
[ -s "$NATIVE_TREE_PID_FILE" ] || fail "HJPROC-005 native child did not publish its PID"
NATIVE_TREE_CHILD_PID="$(cat "$NATIVE_TREE_PID_FILE")"
[[ "$NATIVE_TREE_CHILD_PID" =~ ^[1-9][0-9]*$ ]] || fail "HJPROC-005 native child PID is invalid"
hj_stop_owned_processes
if "$NODE_PATH" -e '
  try { process.kill(Number(process.argv[1]), 0); process.exit(0); }
  catch { process.exit(1); }
' "$NATIVE_TREE_CHILD_PID"; then
  fail "HJPROC-005 native child survived owned wrapper cleanup"
fi
if kill -0 "$NATIVE_TREE_WRAPPER_PID" >/dev/null 2>&1; then
  fail "HJPROC-005 owned wrapper survived cleanup"
fi

SERVICE_RETRY_MARKER="$TEMP_DIR/service-retry.marker"
HJ_SECRET_LEAK_SENTINEL="hjsecret-004-must-not-reach-service"
export HJ_SECRET_LEAK_SENTINEL
SERVICE_SCRIPT='
  const fs = require("node:fs");
  const http = require("node:http");
  const marker = process.argv[1];
  if (process.env.HJ_SECRET_LEAK_SENTINEL !== undefined) {
    process.stderr.write("HJSECRET-004 inherited parent canary\n");
    process.exit(96);
  }
  if (!fs.existsSync(marker)) {
    fs.writeFileSync(marker, "first-attempt\n", { flag: "wx" });
    process.stderr.write("listen failed: EADDRINUSE\n");
    process.exit(98);
  }
  const server = http.createServer((_request, response) => {
    const body = JSON.stringify({ status: "ok" });
    response.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
    response.end(body);
  });
  const stop = () => server.close(() => process.exit(0));
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  server.listen(Number(process.env.PORT), process.env.HOST);
'

hj_start_owned_service_with_retry \
  "retry-service" \
  "$HJ_RUN_ROOT/logs/retry-service.log" \
  "/health" \
  '"status":"ok"' \
  "5" \
  "$NODE_PATH" -e "$SERVICE_SCRIPT" "$SERVICE_RETRY_MARKER" \
  || fail "EADDRINUSE service did not recover on a bounded fresh-port retry"
unset HJ_SECRET_LEAK_SENTINEL

[ -s "$SERVICE_RETRY_MARKER" ] || fail "retry fixture did not execute its collision attempt"
[[ "$HJ_LAST_PORT" =~ ^[0-9]+$ ]] || fail "ready service did not expose its selected port"
RETRY_SERVICE_PID="$HJ_LAST_PROCESS_PID"
kill -0 "$RETRY_SERVICE_PID" >/dev/null 2>&1 || fail "ready retry service is not running"
grep -Fq '"retry-service-attempt-1"' "$HJ_RUN_ROOT/runtime/ports.json" || fail "first retry port was not recorded"
grep -Fq '"retry-service-attempt-2"' "$HJ_RUN_ROOT/runtime/ports.json" || fail "second retry port was not recorded"

hj_stop_owned_processes
if kill -0 "$RETRY_SERVICE_PID" >/dev/null 2>&1; then
  fail "ready retry service survived cleanup"
fi

FATAL_START_MARKER="$TEMP_DIR/fatal-start.marker"
FATAL_SERVICE_SCRIPT='
  const fs = require("node:fs");
  fs.appendFileSync(process.argv[1], "attempt\n");
  process.stderr.write("fixture failed: TALOS_HJ_UNRELATED_STARTUP_ERROR\n");
  process.exit(97);
'
if hj_start_owned_service_with_retry \
  "fatal-service" \
  "$HJ_RUN_ROOT/logs/fatal-service.log" \
  "/health" \
  '"status":"ok"' \
  "2" \
  "$NODE_PATH" -e "$FATAL_SERVICE_SCRIPT" "$FATAL_START_MARKER"; then
  fail "an unrelated startup failure was treated as ready"
fi
[ "$(wc -l < "$FATAL_START_MARKER" | tr -d ' ')" = "1" ] || fail "an unrelated startup failure was retried"
if grep -Fq '"fatal-service-attempt-2"' "$HJ_RUN_ROOT/runtime/ports.json"; then
  fail "an unrelated startup failure allocated a retry port"
fi

TIMEOUT_SERVICE_SCRIPT='
  const http = require("node:http");
  const server = http.createServer((_request, response) => {
    const body = JSON.stringify({ status: "booting" });
    response.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
    response.end(body);
  });
  const stop = () => server.close(() => process.exit(0));
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  server.listen(Number(process.env.PORT), process.env.HOST);
'
if hj_start_owned_service_with_retry \
  "timeout-service" \
  "$HJ_RUN_ROOT/logs/timeout-service.log" \
  "/health" \
  '"status":"ok"' \
  "1" \
  "$NODE_PATH" -e "$TIMEOUT_SERVICE_SCRIPT"; then
  fail "a non-ready live service was treated as ready"
fi
TIMEOUT_SERVICE_PID="$HJ_LAST_PROCESS_PID"
kill -0 "$TIMEOUT_SERVICE_PID" >/dev/null 2>&1 || fail "timeout fixture exited instead of exercising bounded readiness"
if grep -Fq '"timeout-service-attempt-2"' "$HJ_RUN_ROOT/runtime/ports.json"; then
  fail "a live readiness timeout was retried"
fi
hj_stop_owned_processes
if kill -0 "$TIMEOUT_SERVICE_PID" >/dev/null 2>&1; then
  fail "timed-out service survived ledger cleanup"
fi

echo "TALOS Human Journey strict CLI contracts passed"
