#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/talos-hj-adaptive.XXXXXX")"

cleanup() {
  rm -rf -- "$TEMP_DIR"
}
trap cleanup EXIT

fail() {
  printf 'TALOS Human Journey adaptive runner contract failed: %s\n' "$1" >&2
  exit 1
}

set +e
(
  set -euo pipefail
  # shellcheck source=scripts/human-journey/lib.sh
  source "$ROOT_DIR/scripts/human-journey/lib.sh"
  # shellcheck source=scripts/human-journey/run.sh
  source "$ROOT_DIR/scripts/human-journey/run.sh"

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
)
selection_status=$?
set -e
if [ "$selection_status" -ne 0 ]; then
  fail "HJ9-029 lane selection did not isolate the adaptive sidecar"
fi

set +e
(
  set -euo pipefail
  # shellcheck source=scripts/human-journey/lib.sh
  source "$ROOT_DIR/scripts/human-journey/lib.sh"
  # shellcheck source=scripts/human-journey/run.sh
  source "$ROOT_DIR/scripts/human-journey/run.sh"

  HJ_LANE="deterministic"
  hj_prepare_playwright_args
  [[ " ${HJ_PLAYWRIGHT_ARGS[*]} " != *" --max-failures=1 "* ]]

  HJ_LANE="release"
  hj_prepare_playwright_args
  [[ " ${HJ_PLAYWRIGHT_ARGS[*]} " != *" --max-failures=1 "* ]]

  HJ_LANE="adaptive"
  hj_prepare_playwright_args
  fail_fast_count=0
  for argument in "${HJ_PLAYWRIGHT_ARGS[@]}"; do
    if [ "$argument" = "--max-failures=1" ]; then
      fail_fast_count=$((fail_fast_count + 1))
    fi
  done
  [ "$fail_fast_count" -eq 1 ]
)
fail_fast_status=$?
set -e
if [ "$fail_fast_status" -ne 0 ]; then
  fail "HJ9-039 adaptive Playwright fail-fast contract is missing or leaks into another lane"
fi

ADAPTIVE_STATE_ROOT="$TEMP_DIR/adaptive-fixture-state"
set +e
(
  set -euo pipefail
  # shellcheck source=scripts/human-journey/lib.sh
  source "$ROOT_DIR/scripts/human-journey/lib.sh"
  # shellcheck source=scripts/human-journey/run.sh
  source "$ROOT_DIR/scripts/human-journey/run.sh"

  HJ_LANE="adaptive"
  HJ_SCENARIO_ID="BROWSER-NATURAL-001"
  HJ_SEED="42"
  HJ_TRIALS="3"
  HJ_DIRECTOR="off"
  hj_prepare_run "$ADAPTIVE_STATE_ROOT"

  cleanup_adaptive() {
    if [ -n "${HJ_RUN_ROOT:-}" ]; then hj_stop_owned_processes >/dev/null 2>&1 || true; fi
    if [ -n "${HJ_RUN_LOCK_DIR:-}" ]; then hj_release_run_lock >/dev/null 2>&1 || true; fi
  }
  trap cleanup_adaptive EXIT

  hj_prepare_secrets
  hj_start_fixture_host

  [[ "$HJ_BROWSER_SITE_ORIGIN" =~ ^http://127\.0\.0\.1:[0-9]+$ ]]
  [[ "$HJ_PROVIDER_BASE_URL" =~ ^http://127\.0\.0\.1:[0-9]+$ ]]
  [[ "$HJ_SIMULATOR_BASE_URL" =~ ^http://127\.0\.0\.1:[0-9]+/v1$ ]]
  [ "$HJ_PROVIDER_BASE_URL" != "$HJ_SIMULATOR_BASE_URL" ]
  [[ "$HJ_SIMULATOR_HEALTH_URL" =~ ^http://127\.0\.0\.1:[0-9]+/health$ ]]
  [[ "$TALOS_HJ_SIMULATOR_API_KEY" =~ ^[a-f0-9]{64}$ ]]
  hj_wait_http "$HJ_SIMULATOR_HEALTH_URL" "3" '"status":"ok"'

  hj_start_tau2_sidecar
  [[ "$HJ_TAU2_SIDECAR_URL" =~ ^http://127\.0\.0\.1:[0-9]+$ ]]
  [ "$HJ_TAU2_SIDECAR_READY_URL" = "$HJ_TAU2_SIDECAR_URL/readyz" ]
  hj_wait_http "$HJ_TAU2_SIDECAR_URL/healthz" "3" '"status":"alive"'
  unauthenticated_status="$(curl --silent --output /dev/null --write-out '%{http_code}' "$HJ_TAU2_SIDECAR_READY_URL")"
  [ "$unauthenticated_status" = "401" ]
  hj_wait_http_with_bearer_token \
    "$HJ_TAU2_SIDECAR_READY_URL" \
    "5" \
    '"status":"ready"' \
    "$TALOS_HJ_SIDECAR_TOKEN"

  [ -f "$HJ_TAU2_SIDECAR_TOKEN_FILE" ]
  [ -f "$HJ_TAU2_SIMULATOR_API_KEY_FILE" ]
  [ "$(cat "$HJ_TAU2_SIDECAR_TOKEN_FILE")" = "$TALOS_HJ_SIDECAR_TOKEN" ]
  [ "$(cat "$HJ_TAU2_SIMULATOR_API_KEY_FILE")" = "$TALOS_HJ_SIMULATOR_API_KEY" ]
  if grep -Fq "$TALOS_HJ_SIDECAR_TOKEN" "$HJ_TAU2_SIDECAR_ENV_FILE"; then
    printf 'sidecar token leaked into sidecar environment\n' >&2
    exit 81
  fi
  if grep -Fq "$TALOS_HJ_SIMULATOR_API_KEY" "$HJ_TAU2_SIDECAR_ENV_FILE"; then
    printf 'simulator key leaked into sidecar environment\n' >&2
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
    printf 'simulator key leaked into Playwright environment\n' >&2
    exit 83
  fi
  if grep -Fq "$HJ_SIMULATOR_BASE_URL" "$playwright_env"; then
    printf 'simulator endpoint leaked into Playwright environment\n' >&2
    exit 84
  fi

  TALOS_HJ_EXPECTED_CANARY="$TALOS_HJ_SIMULATOR_API_KEY" \
    "$TALOS_NODE_BIN" - "$HJ_SECRET_CANARIES_FILE" <<'NODE'
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
  [ ! -e "$ADAPTIVE_STATE_ROOT/active.lock" ]
  trap - EXIT
)
adaptive_status=$?
set -e
if [ "$adaptive_status" -ne 0 ]; then
  fail "HJ9-029 adaptive fixture, sidecar auth, secret handoff, or cleanup contract failed"
fi

printf 'TALOS Human Journey adaptive runner contracts passed\n'
