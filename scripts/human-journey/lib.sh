#!/usr/bin/env bash

HJ_REPO_ROOT="${HJ_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
HJ_RUNTIME_SCRIPT="$HJ_REPO_ROOT/scripts/human-journey/runtime.mjs"
HJ_LAST_PORT=""
HJ_LAST_PROCESS_PID=""
HJ_LAST_PROCESS_NATIVE_PID=""
HJ_LAST_PROCESS_IDENTITY=""
HJ_LAST_SERVICE_LOG=""

hj_resolve_node() {
  local candidate
  for candidate in \
    "${TALOS_NODE_BIN:-}" \
    "$HJ_REPO_ROOT/.tools/node/node.exe" \
    "$HJ_REPO_ROOT/.tools/bin/node.cmd" \
    "$HJ_REPO_ROOT/.tools/bin/node"
  do
    if [ -n "$candidate" ] && { [ -x "$candidate" ] || [ -f "$candidate" ]; }; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  command -v node 2>/dev/null || {
    printf 'TALOS Human Journey requires the repo-local Node runtime.\n' >&2
    return 1
  }
}

hj_resolve_php() {
  local candidate
  for candidate in \
    "${TALOS_PHP_BIN:-}" \
    "$HJ_REPO_ROOT/.tools/php/php.exe"
  do
    if [ -n "$candidate" ] && { [ -x "$candidate" ] || [ -f "$candidate" ]; }; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  printf 'TALOS Human Journey requires the repo-local PHP runtime.\n' >&2
  return 1
}

hj_resolve_npm() {
  local candidate
  for candidate in \
    "${TALOS_NPM_BIN:-}" \
    "$HJ_REPO_ROOT/.tools/node/npm.cmd"
  do
    if [ -n "$candidate" ] && [ -f "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  printf 'TALOS Human Journey requires the repo-local npm runtime.\n' >&2
  return 1
}

hj_verify_repo_toolchain() {
  TALOS_NODE_BIN="$(hj_resolve_node)" || return 1
  TALOS_PHP_BIN="$(hj_resolve_php)" || return 1
  TALOS_NPM_BIN="$(hj_resolve_npm)" || return 1

  if [ "$TALOS_NODE_BIN" != "$HJ_REPO_ROOT/.tools/node/node.exe" ] \
    || [ "$TALOS_PHP_BIN" != "$HJ_REPO_ROOT/.tools/php/php.exe" ] \
    || [ "$TALOS_NPM_BIN" != "$HJ_REPO_ROOT/.tools/node/npm.cmd" ]; then
    printf 'TALOS Human Journey refuses non-repository runtimes. Run talos doctor or talos up first.\n' >&2
    return 1
  fi

  local required_file
  for required_file in \
    "$HJ_REPO_ROOT/validator/node_modules/typescript/bin/tsc" \
    "$HJ_REPO_ROOT/browser-worker/node_modules/tsx/dist/cli.mjs" \
    "$HJ_REPO_ROOT/browser-worker/node_modules/playwright/package.json" \
    "$HJ_REPO_ROOT/control-plane/node_modules/@playwright/test/package.json" \
    "$HJ_REPO_ROOT/control-plane/vendor/autoload.php" \
    "$HJ_REPO_ROOT/control-plane/public/build/manifest.json"
  do
    if [ ! -f "$required_file" ]; then
      printf 'TALOS Human Journey prerequisite is missing: %s\n' "$required_file" >&2
      return 1
    fi
  done

  _hj_run_clean_env "$TALOS_NODE_BIN" -e '
    const fs = require("node:fs");
    const { createRequire } = require("node:module");
    const requireFromWorker = createRequire(`${process.argv[1]}/browser-worker/package.json`);
    const { chromium } = requireFromWorker("playwright");
    fs.accessSync(chromium.executablePath(), fs.constants.R_OK);
  ' "$HJ_REPO_ROOT" >/dev/null || {
    printf 'TALOS Human Journey requires the pinned Playwright Chromium runtime.\n' >&2
    return 1
  }

  _hj_run_clean_env "$TALOS_PHP_BIN" -r '
    if (PHP_VERSION_ID < 80401) { fwrite(STDERR, "PHP 8.4.1 or newer is required.\n"); exit(1); }
    foreach (["curl", "fileinfo", "mbstring", "openssl", "pdo_sqlite", "sqlite3"] as $extension) {
        if (!extension_loaded($extension)) { fwrite(STDERR, "Missing PHP extension: {$extension}\n"); exit(1); }
    }
  ' >/dev/null || return 1

  _hj_run_clean_env \
    "$TALOS_NODE_BIN" \
    "$HJ_REPO_ROOT/.tools/node/node_modules/npm/bin/npm-cli.js" \
    --version >/dev/null || return 1
  export TALOS_NODE_BIN TALOS_PHP_BIN TALOS_NPM_BIN
}

hj_generate_run_id() {
  local node
  node="$(hj_resolve_node)" || return 1
  "$node" "$HJ_RUNTIME_SCRIPT" generate-run-id
}

hj_generate_token() {
  local byte_length="${1:-32}"
  local node
  node="$(hj_resolve_node)" || return 1
  "$node" "$HJ_RUNTIME_SCRIPT" generate-token "$byte_length"
}

hj_generate_app_key() {
  local node
  node="$(hj_resolve_node)" || return 1
  "$node" -e '
    const { randomBytes } = require("node:crypto");
    process.stdout.write(`base64:${randomBytes(32).toString("base64")}`);
  '
}

hj_allocate_port() {
  local service="${1:-}"
  if [[ ! "$service" =~ ^[a-z][a-z0-9-]{0,31}$ ]]; then
    printf 'TALOS Human Journey port service name is invalid.\n' >&2
    return 1
  fi
  _hj_require_run_paths || return 1

  local node
  local envelope
  local port
  node="$(hj_resolve_node)" || return 1
  envelope="$("$node" "$HJ_RUNTIME_SCRIPT" allocate-port)" || return 1
  case "$envelope" in
    '{"protocol":"talos.human_journey.port.v1","host":"127.0.0.1","port":'*'}') ;;
    *)
      printf 'TALOS Human Journey received an invalid port envelope.\n' >&2
      return 1
      ;;
  esac
  port="${envelope##*\"port\":}"
  port="${port%\}}"
  if [[ ! "$port" =~ ^[0-9]+$ ]] || [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
    printf 'TALOS Human Journey received an invalid allocated port.\n' >&2
    return 1
  fi

  _hj_store_port "$service" "$port" || return 1
  HJ_LAST_PORT="$port"
}

hj_record_bound_port() {
  local service="${1:-}"
  local port="${2:-}"
  if [[ ! "$service" =~ ^[a-z][a-z0-9-]{0,31}$ ]] \
    || [[ ! "$port" =~ ^[0-9]+$ ]] \
    || [ "$port" -lt 1 ] \
    || [ "$port" -gt 65535 ]; then
    printf 'TALOS Human Journey bound-port record is invalid.\n' >&2
    return 1
  fi
  _hj_require_run_paths || return 1
  _hj_store_port "$service" "$port" || return 1
  HJ_LAST_PORT="$port"
}

hj_append_secret_canary() {
  local canary="${1:-}"
  local canary_file="${HJ_SECRET_CANARIES_FILE:-}"
  [ -n "$canary" ] || return 1
  _hj_is_absolute_path "$canary_file" || return 1
  [ -f "$canary_file" ] || return 1
  local node
  local updated
  node="$(hj_resolve_node)" || return 1
  updated="$({
    HJ_CANARY_FILE="$canary_file" \
    HJ_NEW_CANARY="$canary" \
      "$node" -e '
        const fs = require("node:fs");
        const values = JSON.parse(fs.readFileSync(process.env.HJ_CANARY_FILE, "utf8"));
        if (!Array.isArray(values) || values.includes(process.env.HJ_NEW_CANARY)) process.exit(23);
        values.push(process.env.HJ_NEW_CANARY);
        process.stdout.write(JSON.stringify(values));
      '
  })" || return 1
  printf '%s' "$updated" | "$node" "$HJ_RUNTIME_SCRIPT" write-canaries "$canary_file"
}

hj_start_owned_process() {
  local service="${1:-}"
  local log_path="${2:-}"
  if [ "$#" -lt 3 ]; then
    printf 'TALOS Human Journey owned process requires service, log, and command.\n' >&2
    return 1
  fi
  shift 2
  if [[ ! "$service" =~ ^[a-z][a-z0-9-]{0,31}$ ]]; then
    printf 'TALOS Human Journey process service name is invalid.\n' >&2
    return 1
  fi
  _hj_is_absolute_path "$log_path" || {
    printf 'TALOS Human Journey process log path must be absolute.\n' >&2
    return 1
  }
  _hj_require_run_paths || return 1
  mkdir -p "$(dirname "$log_path")"

  local executable
  executable="$(command -v "$1" 2>/dev/null || true)"
  if [ -z "$executable" ]; then
    printf 'TALOS Human Journey process executable was not found.\n' >&2
    return 1
  fi
  local command_sha256
  command_sha256="$(_hj_hash_command "$@")" || return 1

  local process_group_mode="pid"
  if command -v setsid >/dev/null 2>&1; then
    setsid "$@" >>"$log_path" 2>&1 &
    process_group_mode="group"
  else
    "$@" >>"$log_path" 2>&1 &
  fi
  local pid=$!

  local process_row=""
  local candidate_row=""
  local previous_row=""
  local candidate_native_pid=""
  local stable_samples=0
  local attempt
  for attempt in $(seq 1 40); do
    candidate_row="$(_hj_process_row "$pid" || true)"
    candidate_native_pid=""
    if [ -n "$candidate_row" ]; then
      candidate_native_pid="$(_hj_native_pid "$pid" "$candidate_row" || true)"
    fi
    if [ -n "$candidate_native_pid" ]; then
      if [ "$candidate_row" = "$previous_row" ]; then
        stable_samples=$((stable_samples + 1))
      else
        previous_row="$candidate_row"
        stable_samples=1
      fi
      if [ "$stable_samples" -ge 3 ]; then
        process_row="$candidate_row"
        break
      fi
    else
      previous_row=""
      stable_samples=0
    fi
    kill -0 "$pid" >/dev/null 2>&1 || break
    sleep 0.05
  done
  if [ -z "$process_row" ]; then
    _hj_stop_unattested_process "$pid" "$process_group_mode" "$candidate_native_pid"
    printf 'TALOS Human Journey process exited before ownership could be attested.\n' >&2
    return 1
  fi

  local identity_sha256
  local native_pid
  identity_sha256="$(_hj_hash_text "$process_row")" || {
    _hj_stop_unattested_process "$pid" "$process_group_mode"
    return 1
  }
  native_pid="$(_hj_native_pid "$pid" "$process_row")" || {
    _hj_stop_unattested_process "$pid" "$process_group_mode"
    return 1
  }
  _hj_append_process_event \
    "$service" "$pid" "$native_pid" "$process_group_mode" \
    "$executable" "$command_sha256" "$identity_sha256" "$log_path" "running" "" || {
      _hj_signal_owned_process "$pid" "$native_pid" "$process_group_mode" TERM
      wait "$pid" >/dev/null 2>&1 || true
      return 1
    }

  HJ_LAST_PROCESS_PID="$pid"
  HJ_LAST_PROCESS_NATIVE_PID="$native_pid"
  HJ_LAST_PROCESS_IDENTITY="$identity_sha256"
}

_hj_start_owned_process_clean_env() {
  local service="${1:-}"
  local log_path="${2:-}"
  if [ "$#" -lt 3 ]; then
    printf 'TALOS Human Journey clean process requires service, log, and command.\n' >&2
    return 1
  fi
  shift 2

  local -a clean_env=(env -i)
  local name
  for name in \
    PATH SYSTEMROOT WINDIR COMSPEC PATHEXT \
    TEMP TMP HOME USERPROFILE LOCALAPPDATA APPDATA PROGRAMDATA \
    PLAYWRIGHT_BROWSERS_PATH
  do
    if [ -n "${!name:-}" ]; then
      clean_env+=("$name=${!name}")
    fi
  done

  hj_start_owned_process "$service" "$log_path" "${clean_env[@]}" "$@"
}

_hj_run_clean_env() {
  if [ "$#" -lt 1 ]; then
    printf 'TALOS Human Journey clean command requires an executable.\n' >&2
    return 1
  fi

  local -a clean_env=(env -i)
  local name
  for name in \
    PATH SYSTEMROOT WINDIR COMSPEC PATHEXT \
    TEMP TMP HOME USERPROFILE LOCALAPPDATA APPDATA PROGRAMDATA \
    PLAYWRIGHT_BROWSERS_PATH
  do
    if [ -n "${!name:-}" ]; then
      clean_env+=("$name=${!name}")
    fi
  done

  "${clean_env[@]}" "$@"
}

hj_process_is_owned() {
  local pid="${1:-}"
  local expected_identity="${2:-}"
  [[ "$pid" =~ ^[1-9][0-9]*$ ]] || return 1
  kill -0 "$pid" >/dev/null 2>&1 || return 1

  local active_records
  local ledger_identity
  active_records="$(_hj_active_process_records)" || return 1
  ledger_identity="$(awk -F '\t' -v wanted="$pid" '$2 == wanted { print $7; exit }' <<< "$active_records")"
  [[ "$ledger_identity" =~ ^sha256:[0-9a-f]{64}$ ]] || return 1
  if [ -n "$expected_identity" ] && [ "$expected_identity" != "$ledger_identity" ]; then
    return 1
  fi
  expected_identity="$ledger_identity"

  local current_row
  local current_identity
  current_row="$(_hj_process_row "$pid" || true)"
  [ -n "$current_row" ] || return 1
  current_identity="$(_hj_hash_text "$current_row")" || return 1
  [ "$current_identity" = "$expected_identity" ]
}

hj_stop_owned_processes() {
  _hj_require_run_paths || return 1
  local records
  records="$(_hj_active_process_records)" || {
    printf 'TALOS Human Journey process ledger is invalid.\n' >&2
    return 1
  }
  [ -n "$records" ] || return 0

  local failed=0
  local graceful_attempts=30
  case "$(uname -s 2>/dev/null || true)" in
    MINGW*|MSYS*|CYGWIN*) graceful_attempts=10 ;;
  esac
  local service pid native_pid group_mode executable command_sha256 identity_sha256 log_path started_at
  while IFS=$'\t' read -r service pid native_pid group_mode executable command_sha256 identity_sha256 log_path started_at; do
    [ -n "$pid" ] || continue
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      wait "$pid" >/dev/null 2>&1 || true
      _hj_append_process_event "$service" "$pid" "$native_pid" "$group_mode" "$executable" "$command_sha256" "$identity_sha256" "$log_path" "exited" "$started_at" || failed=1
      continue
    fi
    if ! hj_process_is_owned "$pid" "$identity_sha256"; then
      _hj_append_process_event "$service" "$pid" "$native_pid" "$group_mode" "$executable" "$command_sha256" "$identity_sha256" "$log_path" "cleanup_failed" "$started_at" || true
      failed=1
      continue
    fi

    _hj_signal_owned_process "$pid" "$native_pid" "$group_mode" TERM
    local attempt
    for attempt in $(seq 1 "$graceful_attempts"); do
      kill -0 "$pid" >/dev/null 2>&1 || break
      sleep 0.1
    done
    if kill -0 "$pid" >/dev/null 2>&1; then
      if hj_process_is_owned "$pid" "$identity_sha256"; then
        _hj_signal_owned_process "$pid" "$native_pid" "$group_mode" KILL
      else
        failed=1
      fi
    fi
    wait "$pid" >/dev/null 2>&1 || true

    if kill -0 "$pid" >/dev/null 2>&1; then
      _hj_append_process_event "$service" "$pid" "$native_pid" "$group_mode" "$executable" "$command_sha256" "$identity_sha256" "$log_path" "cleanup_failed" "$started_at" || true
      failed=1
    else
      _hj_append_process_event "$service" "$pid" "$native_pid" "$group_mode" "$executable" "$command_sha256" "$identity_sha256" "$log_path" "stopped" "$started_at" || failed=1
    fi
  done <<< "$records"
  [ "$failed" -eq 0 ]
}

hj_wait_http() {
  local url="${1:-}"
  local timeout_seconds="${2:-30}"
  local expected_fragment="${3:-}"
  if [[ ! "$url" =~ ^http://127\.0\.0\.1:[0-9]+/ ]] || [[ ! "$timeout_seconds" =~ ^[1-9][0-9]*$ ]]; then
    printf 'TALOS Human Journey readiness arguments are invalid.\n' >&2
    return 1
  fi
  local deadline=$((SECONDS + timeout_seconds))
  local response
  while [ "$SECONDS" -lt "$deadline" ]; do
    if response="$(curl --fail --silent --show-error --max-time 2 "$url" 2>/dev/null)"; then
      if [ -z "$expected_fragment" ] || [[ "$response" == *"$expected_fragment"* ]]; then
        return 0
      fi
    fi
    sleep 0.2
  done
  return 1
}

hj_wait_http_with_worker_token() {
  local url="${1:-}"
  local timeout_seconds="${2:-30}"
  local expected_fragment="${3:-}"
  local worker_token="${4:-}"
  if [[ ! "$url" =~ ^http://127\.0\.0\.1:[0-9]+/ ]] \
    || [[ ! "$timeout_seconds" =~ ^[1-9][0-9]*$ ]] \
    || [ "$timeout_seconds" -gt 300 ] \
    || [[ ! "$worker_token" =~ ^[A-Za-z0-9_-]{32,128}$ ]]; then
    printf 'TALOS Human Journey authenticated readiness arguments are invalid.\n' >&2
    return 1
  fi

  local deadline=$((SECONDS + timeout_seconds))
  local response
  while [ "$SECONDS" -lt "$deadline" ]; do
    if response="$(
      printf 'header = "X-Talos-Worker-Token: %s"\n' "$worker_token" \
        | curl --config - --fail --silent --show-error --max-time 3 "$url" 2>/dev/null
    )"; then
      if [ -z "$expected_fragment" ] || [[ "$response" == *"$expected_fragment"* ]]; then
        return 0
      fi
    fi
    sleep 0.2
  done
  return 1
}

hj_wait_http_with_bearer_token() {
  local url="${1:-}"
  local timeout_seconds="${2:-30}"
  local expected_fragment="${3:-}"
  local bearer_token="${4:-}"
  if [[ ! "$url" =~ ^http://127\.0\.0\.1:[0-9]+/ ]] \
    || [[ ! "$timeout_seconds" =~ ^[1-9][0-9]*$ ]] \
    || [ "$timeout_seconds" -gt 300 ] \
    || [[ ! "$bearer_token" =~ ^[A-Za-z0-9_-]{32,128}$ ]]; then
    printf 'TALOS Human Journey authenticated readiness arguments are invalid.\n' >&2
    return 1
  fi

  local deadline=$((SECONDS + timeout_seconds))
  local response
  while [ "$SECONDS" -lt "$deadline" ]; do
    if response="$(
      printf 'header = "Authorization: Bearer %s"\n' "$bearer_token" \
        | curl --config - --fail --silent --show-error --max-time 3 "$url" 2>/dev/null
    )"; then
      if [ -z "$expected_fragment" ] || [[ "$response" == *"$expected_fragment"* ]]; then
        return 0
      fi
    fi
    sleep 0.2
  done
  return 1
}

hj_start_owned_service_with_retry() {
  local service="${1:-}"
  local log_path="${2:-}"
  local readiness_path="${3:-}"
  local expected_fragment="${4:-}"
  local timeout_seconds="${5:-}"
  if [ "$#" -lt 6 ]; then
    printf 'TALOS Human Journey service startup arguments are incomplete.\n' >&2
    return 1
  fi
  shift 5

  if [[ ! "$service" =~ ^[a-z][a-z0-9-]{0,19}$ ]]; then
    printf 'TALOS Human Journey retryable service name is invalid.\n' >&2
    return 1
  fi
  _hj_is_absolute_path "$log_path" || {
    printf 'TALOS Human Journey service log path must be absolute.\n' >&2
    return 1
  }
  if [[ ! "$readiness_path" =~ ^/[A-Za-z0-9._~!$\&\'\(\)\*\+,\;=:@%/-]*$ ]] \
    || [[ ! "$timeout_seconds" =~ ^[1-9][0-9]*$ ]] \
    || [ "$timeout_seconds" -gt 300 ]; then
    printf 'TALOS Human Journey service readiness arguments are invalid.\n' >&2
    return 1
  fi

  local attempt
  local attempt_log
  local pid
  local port
  for attempt in 1 2 3; do
    if [ "$attempt" -eq 1 ]; then
      attempt_log="$log_path"
    else
      attempt_log="$log_path.retry-$attempt"
    fi
    mkdir -p "$(dirname "$attempt_log")"
    : > "$attempt_log"

    hj_allocate_port "$service-attempt-$attempt" || return 1
    port="$HJ_LAST_PORT"

    if ! _hj_start_owned_process_clean_env \
      "$service" \
      "$attempt_log" \
      HOST="127.0.0.1" PORT="$port" "$@"; then
      if [ "$attempt" -lt 3 ] && _hj_log_has_address_in_use "$attempt_log"; then
        continue
      fi
      return 1
    fi
    pid="$HJ_LAST_PROCESS_PID"

    if hj_wait_http "http://127.0.0.1:$port$readiness_path" "$timeout_seconds" "$expected_fragment"; then
      HJ_LAST_PORT="$port"
      HJ_LAST_SERVICE_LOG="$attempt_log"
      return 0
    fi

    if ! kill -0 "$pid" >/dev/null 2>&1 \
      && [ "$attempt" -lt 3 ] \
      && _hj_log_has_address_in_use "$attempt_log"; then
      continue
    fi
    return 1
  done
  return 1
}

hj_start_owned_service_with_bearer_retry() {
  local service="${1:-}"
  local log_path="${2:-}"
  local readiness_path="${3:-}"
  local expected_fragment="${4:-}"
  local timeout_seconds="${5:-}"
  local bearer_token="${6:-}"
  if [ "$#" -lt 7 ]; then
    printf 'TALOS Human Journey authenticated service startup arguments are incomplete.\n' >&2
    return 1
  fi
  shift 6

  if [[ ! "$service" =~ ^[a-z][a-z0-9-]{0,19}$ ]]; then
    printf 'TALOS Human Journey retryable service name is invalid.\n' >&2
    return 1
  fi
  _hj_is_absolute_path "$log_path" || {
    printf 'TALOS Human Journey service log path must be absolute.\n' >&2
    return 1
  }
  if [[ ! "$readiness_path" =~ ^/[A-Za-z0-9._~!$\&\'\(\)\*\+,\;=:@%/-]*$ ]] \
    || [[ ! "$timeout_seconds" =~ ^[1-9][0-9]*$ ]] \
    || [ "$timeout_seconds" -gt 300 ] \
    || [[ ! "$bearer_token" =~ ^[A-Za-z0-9_-]{32,128}$ ]]; then
    printf 'TALOS Human Journey authenticated service readiness arguments are invalid.\n' >&2
    return 1
  fi

  local attempt
  local attempt_log
  local pid
  local port
  for attempt in 1 2 3; do
    if [ "$attempt" -eq 1 ]; then
      attempt_log="$log_path"
    else
      attempt_log="$log_path.retry-$attempt"
    fi
    mkdir -p "$(dirname "$attempt_log")"
    : > "$attempt_log"

    hj_allocate_port "$service-attempt-$attempt" || return 1
    port="$HJ_LAST_PORT"

    if ! _hj_start_owned_process_clean_env \
      "$service" \
      "$attempt_log" \
      HOST="127.0.0.1" PORT="$port" "$@"; then
      if [ "$attempt" -lt 3 ] && _hj_log_has_address_in_use "$attempt_log"; then
        continue
      fi
      return 1
    fi
    pid="$HJ_LAST_PROCESS_PID"

    if hj_wait_http_with_bearer_token \
      "http://127.0.0.1:$port$readiness_path" \
      "$timeout_seconds" \
      "$expected_fragment" \
      "$bearer_token"; then
      HJ_LAST_PORT="$port"
      HJ_LAST_SERVICE_LOG="$attempt_log"
      return 0
    fi

    if ! kill -0 "$pid" >/dev/null 2>&1 \
      && [ "$attempt" -lt 3 ] \
      && _hj_log_has_address_in_use "$attempt_log"; then
      continue
    fi
    return 1
  done
  return 1
}

hj_redact_retained_logs() {
  local canary_file="${1:-}"
  _hj_is_absolute_path "$canary_file" || return 1
  _hj_require_run_paths || return 1
  local node
  node="$(hj_resolve_node)" || return 1
  local log
  while IFS= read -r -d '' log; do
    "$node" "$HJ_RUNTIME_SCRIPT" redact "$log" "$canary_file" "$log.redacted" || return 1
    mv -f -- "$log.redacted" "$log"
  done < <(find "$HJ_RUN_ROOT/logs" -type f -print0 2>/dev/null)
}

hj_write_result() {
  local json="${1:-}"
  _hj_require_run_paths || return 1
  local node
  node="$(hj_resolve_node)" || return 1
  printf '%s' "$json" | "$node" "$HJ_RUNTIME_SCRIPT" write-json "$HJ_RUN_ROOT/result.json"
}

hj_cleanup() {
  local failed=0
  hj_stop_owned_processes || failed=1
  _hj_remove_secrets_dir || failed=1
  [ "$failed" -eq 0 ]
}

_hj_require_run_paths() {
  if [[ ! "${HJ_RUN_ID:-}" =~ ^hj_[0-9]{8}T[0-9]{6}Z_[0-9a-f]{8}$ ]]; then
    printf 'TALOS Human Journey run ID is not initialized.\n' >&2
    return 1
  fi
  if [ -z "${HJ_RUN_ROOT:-}" ] || ! _hj_is_absolute_path "$HJ_RUN_ROOT"; then
    printf 'TALOS Human Journey run root is not initialized.\n' >&2
    return 1
  fi
  mkdir -p "$HJ_RUN_ROOT/runtime" "$HJ_RUN_ROOT/logs"
}

_hj_is_absolute_path() {
  case "${1:-}" in
    /*|[A-Za-z]:[\\/]*) return 0 ;;
    *) return 1 ;;
  esac
}

_hj_native_path() {
  local path="${1:-}"
  _hj_is_absolute_path "$path" || return 1
  case "$(uname -s 2>/dev/null || true)" in
    MINGW*|MSYS*|CYGWIN*)
      command -v cygpath >/dev/null 2>&1 || return 1
      cygpath -m -a "$path"
      ;;
    *) printf '%s\n' "$path" ;;
  esac
}

_hj_hash_command() {
  local node
  node="$(hj_resolve_node)" || return 1
  "$node" -e '
    const { createHash } = require("node:crypto");
    const command = JSON.stringify(process.argv.slice(1));
    process.stdout.write(`sha256:${createHash("sha256").update(command).digest("hex")}`);
  ' "$@"
}

_hj_hash_text() {
  local text="$1"
  local node
  node="$(hj_resolve_node)" || return 1
  printf '%s' "$text" | "$node" -e '
    const { createHash } = require("node:crypto");
    const chunks = [];
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => process.stdout.write(`sha256:${createHash("sha256").update(Buffer.concat(chunks)).digest("hex")}`));
  '
}

_hj_process_row() {
  local pid="$1"
  local row
  row="$(ps -p "$pid" 2>/dev/null | tail -n 1)" || return 1
  set -- $row
  [ "${1:-}" = "$pid" ] || return 1
  printf '%s\n' "$row"
}

_hj_native_pid() {
  local pid="$1"
  local row="$2"
  case "$(uname -s 2>/dev/null || true)" in
    MINGW*|MSYS*|CYGWIN*)
      set -- $row
      [[ "${4:-}" =~ ^[1-9][0-9]*$ ]] || return 1
      printf '%s\n' "$4"
      ;;
    *) printf '%s\n' "$pid" ;;
  esac
}

_hj_append_process_event() {
  local service="$1" pid="$2" native_pid="$3" group_mode="$4" executable="$5"
  local command_sha256="$6" identity_sha256="$7" log_path="$8" status="$9" started_at="${10:-}"
  local node
  node="$(hj_resolve_node)" || return 1
  local ledger="$HJ_RUN_ROOT/runtime/processes.jsonl"
  HJ_EVENT_RUN_ID="$HJ_RUN_ID" \
  HJ_EVENT_SERVICE="$service" \
  HJ_EVENT_PID="$pid" \
  HJ_EVENT_NATIVE_PID="$native_pid" \
  HJ_EVENT_GROUP_MODE="$group_mode" \
  HJ_EVENT_EXECUTABLE="$executable" \
  HJ_EVENT_COMMAND_SHA256="$command_sha256" \
  HJ_EVENT_IDENTITY_SHA256="$identity_sha256" \
  HJ_EVENT_LOG_PATH="$log_path" \
  HJ_EVENT_STATUS="$status" \
  HJ_EVENT_STARTED_AT="$started_at" \
    "$node" -e '
      const fs = require("node:fs");
      const path = process.argv[1];
      const now = new Date().toISOString();
      const event = {
        protocol: "talos.human_journey.process.v1",
        run_id: process.env.HJ_EVENT_RUN_ID,
        service: process.env.HJ_EVENT_SERVICE,
        pid: Number(process.env.HJ_EVENT_PID),
        native_pid: Number(process.env.HJ_EVENT_NATIVE_PID),
        platform: process.platform,
        executable: process.env.HJ_EVENT_EXECUTABLE,
        command_sha256: process.env.HJ_EVENT_COMMAND_SHA256,
        process_identity_sha256: process.env.HJ_EVENT_IDENTITY_SHA256,
        process_group_mode: process.env.HJ_EVENT_GROUP_MODE,
        log_path: process.env.HJ_EVENT_LOG_PATH,
        started_at: process.env.HJ_EVENT_STARTED_AT || now,
        terminal_status: process.env.HJ_EVENT_STATUS,
        ...(process.env.HJ_EVENT_STATUS === "running" ? {} : { finished_at: now }),
      };
      const forbiddenControl = (value) => typeof value !== "string" || /[\r\n\t]/u.test(value);
      if (!/^hj_[0-9]{8}T[0-9]{6}Z_[0-9a-f]{8}$/u.test(event.run_id)
        || !/^[a-z][a-z0-9-]{0,31}$/u.test(event.service)
        || !Number.isSafeInteger(event.pid) || event.pid < 1
        || !Number.isSafeInteger(event.native_pid) || event.native_pid < 1
        || !["group", "pid"].includes(event.process_group_mode)
        || !["running", "stopped", "exited", "cleanup_failed"].includes(event.terminal_status)
        || !/^sha256:[0-9a-f]{64}$/u.test(event.command_sha256)
        || !/^sha256:[0-9a-f]{64}$/u.test(event.process_identity_sha256)
        || forbiddenControl(event.executable) || forbiddenControl(event.log_path)) process.exit(12);
      const fd = fs.openSync(path, "a", 0o600);
      try { fs.writeSync(fd, `${JSON.stringify(event)}\n`); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    ' "$ledger"
}

_hj_active_process_records() {
  local ledger="$HJ_RUN_ROOT/runtime/processes.jsonl"
  [ -f "$ledger" ] || return 0
  local node
  node="$(hj_resolve_node)" || return 1
  HJ_LEDGER_RUN_ID="$HJ_RUN_ID" "$node" -e '
    const fs = require("node:fs");
    const lines = fs.readFileSync(process.argv[1], "utf8").split(/\r?\n/u).filter(Boolean);
    const latest = new Map();
    for (const line of lines) {
      const event = JSON.parse(line);
      if (event?.protocol !== "talos.human_journey.process.v1" || event?.run_id !== process.env.HJ_LEDGER_RUN_ID || !Number.isSafeInteger(event.pid)) process.exit(13);
      latest.set(event.pid, event);
    }
    for (const event of [...latest.values()].reverse()) {
      if (event.terminal_status !== "running") continue;
      const fields = [event.service, event.pid, event.native_pid, event.process_group_mode, event.executable, event.command_sha256, event.process_identity_sha256, event.log_path, event.started_at];
      if (fields.some((field) => /[\r\n\t]/u.test(String(field)))) process.exit(14);
      process.stdout.write(`${fields.join("\t")}\n`);
    }
  ' "$ledger"
}

_hj_signal_owned_process() {
  local pid="$1" native_pid="$2" group_mode="$3" signal="$4"
  case "$(uname -s 2>/dev/null || true)" in
    MINGW*|MSYS*|CYGWIN*)
      if command -v taskkill.exe >/dev/null 2>&1; then
        if [ "$signal" = "KILL" ]; then
          MSYS2_ARG_CONV_EXCL='*' taskkill.exe /pid "$native_pid" /t /f >/dev/null 2>&1 || true
        else
          MSYS2_ARG_CONV_EXCL='*' taskkill.exe /pid "$native_pid" /t >/dev/null 2>&1 || true
        fi
        return 0
      fi
      ;;
  esac
  if [ "$group_mode" = "group" ]; then
    kill -"$signal" -- "-$pid" >/dev/null 2>&1 || true
  else
    kill -"$signal" "$pid" >/dev/null 2>&1 || true
  fi
}

_hj_stop_unattested_process() {
  local pid="$1" group_mode="$2" native_pid="${3:-}"
  local windows_tree=0
  case "$(uname -s 2>/dev/null || true)" in
    MINGW*|MSYS*|CYGWIN*)
      if [[ "$native_pid" =~ ^[1-9][0-9]*$ ]] && command -v taskkill.exe >/dev/null 2>&1; then
        MSYS2_ARG_CONV_EXCL='*' taskkill.exe /pid "$native_pid" /t >/dev/null 2>&1 || true
        windows_tree=1
      fi
      ;;
  esac
  if [ "$windows_tree" -eq 0 ]; then
    if [ "$group_mode" = "group" ]; then
      kill -TERM -- "-$pid" >/dev/null 2>&1 || true
    else
      kill -TERM "$pid" >/dev/null 2>&1 || true
    fi
  fi

  local attempt
  for attempt in $(seq 1 20); do
    kill -0 "$pid" >/dev/null 2>&1 || break
    sleep 0.05
  done
  if kill -0 "$pid" >/dev/null 2>&1; then
    if [ "$windows_tree" -eq 1 ]; then
      MSYS2_ARG_CONV_EXCL='*' taskkill.exe /pid "$native_pid" /t /f >/dev/null 2>&1 || true
    else
      if [ "$group_mode" = "group" ]; then
        kill -KILL -- "-$pid" >/dev/null 2>&1 || true
      else
        kill -KILL "$pid" >/dev/null 2>&1 || true
      fi
    fi
  fi
  wait "$pid" >/dev/null 2>&1 || true
}

_hj_log_has_address_in_use() {
  local log_path="$1"
  [ -f "$log_path" ] || return 1
  grep -Eq '(^|[^A-Z0-9_])EADDRINUSE([^A-Z0-9_]|$)' "$log_path"
}

_hj_store_port() {
  local service="$1"
  local port="$2"
  local ports_file="$HJ_RUN_ROOT/runtime/ports.json"
  local node
  local merged
  node="$(hj_resolve_node)" || return 1
  merged="$({
    HJ_PORTS_FILE="$ports_file" \
    HJ_PORT_SERVICE="$service" \
    HJ_PORT_VALUE="$port" \
    HJ_PORT_RUN_ID="$HJ_RUN_ID" \
      "$node" -e '
        const fs = require("node:fs");
        const file = process.env.HJ_PORTS_FILE;
        let current = { protocol: "talos.human_journey.ports.v1", run_id: process.env.HJ_PORT_RUN_ID, ports: {} };
        if (fs.existsSync(file)) {
          current = JSON.parse(fs.readFileSync(file, "utf8"));
          if (current?.protocol !== "talos.human_journey.ports.v1" || current?.run_id !== process.env.HJ_PORT_RUN_ID || !current.ports || Array.isArray(current.ports)) process.exit(9);
        }
        if (Object.hasOwn(current.ports, process.env.HJ_PORT_SERVICE)) process.exit(10);
        current.ports[process.env.HJ_PORT_SERVICE] = Number(process.env.HJ_PORT_VALUE);
        process.stdout.write(JSON.stringify(current));
      '
  })" || {
    printf 'TALOS Human Journey could not update the port ledger.\n' >&2
    return 1
  }
  printf '%s' "$merged" | "$node" "$HJ_RUNTIME_SCRIPT" write-json "$ports_file"
}

_hj_remove_secrets_dir() {
  [ -n "${HJ_RUN_ROOT:-}" ] || return 0
  local secrets_dir="$HJ_RUN_ROOT/runtime/secrets"
  [ -e "$secrets_dir" ] || return 0
  if [ -L "$secrets_dir" ] || [ ! -d "$secrets_dir" ]; then
    printf 'TALOS Human Journey refuses an unexpected secrets path.\n' >&2
    return 1
  fi

  local entry
  local failed=0
  while IFS= read -r -d '' entry; do
    if [ -L "$entry" ] || [ ! -f "$entry" ]; then
      printf 'TALOS Human Journey refuses nested or non-file secret entries.\n' >&2
      failed=1
    fi
  done < <(find "$secrets_dir" -mindepth 1 -maxdepth 1 -print0)
  find "$secrets_dir" -mindepth 1 -maxdepth 1 -type f -delete || return 1
  if ! rmdir "$secrets_dir" 2>/dev/null; then
    failed=1
  fi
  [ "$failed" -eq 0 ]
}
