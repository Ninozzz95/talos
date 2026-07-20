#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# shellcheck source=scripts/human-journey/lib.sh
source "$ROOT_DIR/scripts/human-journey/lib.sh"

HJ_LANE="deterministic"
HJ_SCENARIO_ID="BROWSER-NATURAL-001"
HJ_SEED="42"
HJ_TRIALS="1"
HJ_REPLAY_ID=""
HJ_RESUME_ID=""
HJ_DIRECTOR="off"
HJ_SCENARIO_EXPLICIT=0
HJ_SEEN_OPTIONS="|"
HJ_STATE_ROOT=""
HJ_RUN_LOCK_DIR=""
HJ_RUN_LOCK_IDENTITY=""
HJ_STARTED_AT=""
HJ_STARTED_MS=""
HJ_RESULT_WRITTEN=0
HJ_SIGNAL_HANDLED=0
HJ_FIXTURE_HOST_PID=""
HJ_FIXTURE_HOST_NATIVE_PID=""
HJ_BROWSER_SITE_ORIGIN=""
HJ_PROVIDER_BASE_URL=""
HJ_PROVIDER_HEALTH_URL=""
HJ_SIMULATOR_BASE_URL=""
HJ_SIMULATOR_HEALTH_URL=""
HJ_TAU2_SIDECAR_URL=""
HJ_TAU2_SIDECAR_READY_URL=""
HJ_TAU2_SIDECAR_PID=""
HJ_TAU2_SIDECAR_NATIVE_PID=""
HJ_TAU2_SIDECAR_TOKEN_FILE=""
HJ_TAU2_SIMULATOR_API_KEY_FILE=""
HJ_TAU2_SIDECAR_ENV_FILE=""
HJ_VALIDATOR_URL=""
HJ_BROWSER_WORKER_URL=""
HJ_LARAVEL_URL=""
HJ_LARAVEL_ROOT=""
HJ_LARAVEL_DATABASE=""
HJ_LARAVEL_STORAGE=""
HJ_LARAVEL_COMMAND_ENV_FILE=""
HJ_LARAVEL_SERVER_ENV_FILE=""
HJ_PLAYWRIGHT_FAILURE_CODE=""
HJ_PLAYWRIGHT_REPORT_PATH=""
HJ_PLAYWRIGHT_ARGS=()
TALOS_HJ_SIMULATOR_API_KEY=""
TALOS_HJ_MODEL_ENDPOINT_SHA256=""

hj_cli_error() {
  printf 'TALOS Human Journey CLI: %s\n' "$1" >&2
  return 2
}

hj_parse_args() {
  local argument
  local option
  local value
  for argument in "$@"; do
    case "$argument" in
      --*=*)
        option="${argument%%=*}"
        option="${option#--}"
        value="${argument#*=}"
        ;;
      *)
        hj_cli_error "arguments must use the --name=value form"
        return 2
        ;;
    esac

    case "$option" in
      lane|scenario|seed|trials|replay|resume|director) ;;
      *)
        hj_cli_error "unknown option --$option"
        return 2
        ;;
    esac
    if [ -z "$value" ]; then
      hj_cli_error "option --$option must not be empty"
      return 2
    fi
    case "$HJ_SEEN_OPTIONS" in
      *"|$option|"*)
        hj_cli_error "option --$option was provided more than once"
        return 2
        ;;
    esac
    HJ_SEEN_OPTIONS="${HJ_SEEN_OPTIONS}${option}|"

    case "$option" in
      lane) HJ_LANE="$value" ;;
      scenario)
        HJ_SCENARIO_ID="$value"
        HJ_SCENARIO_EXPLICIT=1
        ;;
      seed) HJ_SEED="$value" ;;
      trials) HJ_TRIALS="$value" ;;
      replay) HJ_REPLAY_ID="$value" ;;
      resume) HJ_RESUME_ID="$value" ;;
      director) HJ_DIRECTOR="$value" ;;
    esac
  done
}

hj_validate_args() {
  case "$HJ_LANE" in
    deterministic|adaptive|release) ;;
    *) hj_cli_error "lane must be deterministic, adaptive, or release"; return 2 ;;
  esac
  if [[ ! "$HJ_SCENARIO_ID" =~ ^[A-Z][A-Z0-9_-]{2,63}-[0-9]{3}$ ]]; then
    hj_cli_error "scenario ID is invalid"
    return 2
  fi
  if [[ ! "$HJ_SEED" =~ ^(0|[1-9][0-9]{0,9})$ ]] || [ "${#HJ_SEED}" -gt 10 ] || (( 10#$HJ_SEED > 4294967295 )); then
    hj_cli_error "seed must be an unsigned 32-bit integer"
    return 2
  fi
  if [[ ! "$HJ_TRIALS" =~ ^(0|[1-9][0-9]?)$ ]] || (( 10#$HJ_TRIALS < 1 || 10#$HJ_TRIALS > 25 )); then
    hj_cli_error "trials must be an integer from 1 through 25"
    return 2
  fi
  if [ -n "$HJ_REPLAY_ID" ] && [[ ! "$HJ_REPLAY_ID" =~ ^HJREG-[0-9]{3,6}$ ]]; then
    hj_cli_error "replay ID is invalid"
    return 2
  fi
  if [ -n "$HJ_RESUME_ID" ] && [[ ! "$HJ_RESUME_ID" =~ ^hjtrial_[0-9]{8}T[0-9]{6}Z_[0-9a-f]{8}_[0-9]{2}$ ]]; then
    hj_cli_error "resume ID is invalid"
    return 2
  fi
  case "$HJ_DIRECTOR" in
    off|external) ;;
    *) hj_cli_error "director must be off or external"; return 2 ;;
  esac

  if [ -n "$HJ_REPLAY_ID" ]; then
    if [ "$HJ_SCENARIO_EXPLICIT" -eq 1 ] || [ -n "$HJ_RESUME_ID" ] || [ "$HJ_DIRECTOR" = "external" ] || [ "$HJ_TRIALS" -ne 1 ]; then
      hj_cli_error "replay cannot be combined with scenario, resume, external director, or multiple trials"
      return 2
    fi
  fi
  if [ -n "$HJ_RESUME_ID" ] && { [ "$HJ_DIRECTOR" != "external" ] || [ "$HJ_LANE" = "release" ]; }; then
    hj_cli_error "resume requires an external director and a non-release lane"
    return 2
  fi
}

hj_print_cli_contract() {
  local replay_json="null"
  local resume_json="null"
  if [ -n "$HJ_REPLAY_ID" ]; then replay_json="\"$HJ_REPLAY_ID\""; fi
  if [ -n "$HJ_RESUME_ID" ]; then resume_json="\"$HJ_RESUME_ID\""; fi
  printf '{"protocol":"talos.human_journey.cli.v1","lane":"%s","scenario_id":"%s","seed":%s,"trials":%s,"replay_id":%s,"resume_id":%s,"director":"%s"}\n' \
    "$HJ_LANE" "$HJ_SCENARIO_ID" "$HJ_SEED" "$HJ_TRIALS" "$replay_json" "$resume_json" "$HJ_DIRECTOR"
}

hj_validate_only_enabled() {
  case "${TALOS_HJ_VALIDATE_ONLY:-}" in
    1|true|TRUE|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

hj_prepare_run() {
  local requested_state_root="${1:-$ROOT_DIR/.talos/human-journey}"
  if ! _hj_is_absolute_path "$requested_state_root"; then
    printf 'TALOS Human Journey state root must be absolute.\n' >&2
    return 3
  fi

  umask 077
  mkdir -p "$requested_state_root/runs" || return 3
  HJ_STATE_ROOT="$(cd "$requested_state_root" && pwd -P)" || return 3
  HJ_RUN_ID="$(hj_generate_run_id)" || return 3
  HJ_RUN_ROOT="$HJ_STATE_ROOT/runs/$HJ_RUN_ID"
  export HJ_RUN_ID HJ_RUN_ROOT

  if ! hj_acquire_run_lock "$HJ_STATE_ROOT"; then
    return 3
  fi
  if ! mkdir -p \
    "$HJ_RUN_ROOT/reports" \
    "$HJ_RUN_ROOT/artifacts" \
    "$HJ_RUN_ROOT/logs" \
    "$HJ_RUN_ROOT/runtime/secrets" \
    "$HJ_RUN_ROOT/runtime/laravel"; then
    hj_release_run_lock || true
    return 3
  fi

  local node
  local started
  node="$(hj_resolve_node)" || {
    hj_release_run_lock || true
    return 3
  }
  started="$($node -e 'process.stdout.write(`${new Date().toISOString()}\t${Date.now()}`)')" || {
    hj_release_run_lock || true
    return 3
  }
  IFS=$'\t' read -r HJ_STARTED_AT HJ_STARTED_MS <<< "$started"
  export HJ_STARTED_AT HJ_STARTED_MS
}

hj_acquire_run_lock() {
  local state_root="${1:-$HJ_STATE_ROOT}"
  if [ -z "$state_root" ] || ! _hj_is_absolute_path "$state_root" \
    || [[ ! "$HJ_RUN_ID" =~ ^hj_[0-9]{8}T[0-9]{6}Z_[0-9a-f]{8}$ ]]; then
    printf 'TALOS Human Journey lock context is invalid.\n' >&2
    return 3
  fi

  local lock_dir="$state_root/active.lock"
  if ! mkdir "$lock_dir" 2>/dev/null; then
    printf 'Another TALOS Human Journey run owns %s.\n' "$lock_dir" >&2
    return 3
  fi

  local process_row
  local identity
  local owner_json
  local node
  process_row="$(_hj_process_row "$$" || true)"
  if [ -z "$process_row" ]; then
    rmdir "$lock_dir" 2>/dev/null || true
    printf 'TALOS Human Journey could not attest the runner process.\n' >&2
    return 3
  fi
  identity="$(_hj_hash_text "$process_row")" || {
    rmdir "$lock_dir" 2>/dev/null || true
    return 3
  }
  node="$(hj_resolve_node)" || {
    rmdir "$lock_dir" 2>/dev/null || true
    return 3
  }
  owner_json="$(
    HJ_LOCK_RUN_ID="$HJ_RUN_ID" \
    HJ_LOCK_PID="$$" \
    HJ_LOCK_IDENTITY="$identity" \
      "$node" -e '
        process.stdout.write(JSON.stringify({
          protocol: "talos.human_journey.lock.v1",
          run_id: process.env.HJ_LOCK_RUN_ID,
          pid: Number(process.env.HJ_LOCK_PID),
          process_identity_sha256: process.env.HJ_LOCK_IDENTITY,
          acquired_at: new Date().toISOString(),
        }));
      '
  )" || {
    rmdir "$lock_dir" 2>/dev/null || true
    return 3
  }
  if ! printf '%s' "$owner_json" | "$node" "$HJ_RUNTIME_SCRIPT" write-json "$lock_dir/owner.json"; then
    rmdir "$lock_dir" 2>/dev/null || true
    return 3
  fi

  HJ_RUN_LOCK_DIR="$lock_dir"
  HJ_RUN_LOCK_IDENTITY="$identity"
}

hj_release_run_lock() {
  if [ -z "$HJ_RUN_LOCK_DIR" ] || [ -z "$HJ_STATE_ROOT" ] \
    || [ "$HJ_RUN_LOCK_DIR" != "$HJ_STATE_ROOT/active.lock" ]; then
    printf 'TALOS Human Journey lock is not owned by this runner.\n' >&2
    return 1
  fi

  local owner_file="$HJ_RUN_LOCK_DIR/owner.json"
  local process_row
  local current_identity
  local node
  process_row="$(_hj_process_row "$$" || true)"
  [ -n "$process_row" ] || return 1
  current_identity="$(_hj_hash_text "$process_row")" || return 1
  [ "$current_identity" = "$HJ_RUN_LOCK_IDENTITY" ] || return 1
  node="$(hj_resolve_node)" || return 1

  HJ_LOCK_EXPECTED_RUN_ID="$HJ_RUN_ID" \
  HJ_LOCK_EXPECTED_PID="$$" \
  HJ_LOCK_EXPECTED_IDENTITY="$HJ_RUN_LOCK_IDENTITY" \
    "$node" -e '
      const fs = require("node:fs");
      const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      const keys = Object.keys(value).sort().join(",");
      if (keys !== "acquired_at,pid,process_identity_sha256,protocol,run_id"
        || value.protocol !== "talos.human_journey.lock.v1"
        || value.run_id !== process.env.HJ_LOCK_EXPECTED_RUN_ID
        || value.pid !== Number(process.env.HJ_LOCK_EXPECTED_PID)
        || value.process_identity_sha256 !== process.env.HJ_LOCK_EXPECTED_IDENTITY
        || typeof value.acquired_at !== "string") process.exit(21);
    ' "$owner_file" || return 1

  rm -f -- "$owner_file"
  rmdir "$HJ_RUN_LOCK_DIR" || return 1
  HJ_RUN_LOCK_DIR=""
  HJ_RUN_LOCK_IDENTITY=""
}

hj_prepare_secrets() {
  _hj_require_run_paths || return 3
  local secrets_dir="$HJ_RUN_ROOT/runtime/secrets"
  if [ ! -d "$secrets_dir" ] || [ -L "$secrets_dir" ]; then
    printf 'TALOS Human Journey secrets directory is invalid.\n' >&2
    return 3
  fi

  TALOS_NODE_BIN="$(hj_resolve_node)" || return 3
  APP_KEY="$(hj_generate_app_key)" || return 3
  TALOS_BROWSER_WORKER_TOKEN="$(hj_generate_token 32)" || return 3
  TALOS_HJ_LOGIN_PASSWORD="$(hj_generate_token 32)" || return 3
  TALOS_HJ_SIDECAR_TOKEN="$(hj_generate_token 32)" || return 3
  TALOS_HJ_LOGIN_EMAIL="human-journey@talos.test"
  HJ_SECRETS_ENV_FILE="$secrets_dir/services.env"
  HJ_SECRET_CANARIES_FILE="$secrets_dir/canaries.json"

  if [ "$TALOS_BROWSER_WORKER_TOKEN" = "$TALOS_HJ_LOGIN_PASSWORD" ] \
    || [ "$TALOS_BROWSER_WORKER_TOKEN" = "$TALOS_HJ_SIDECAR_TOKEN" ] \
    || [ "$TALOS_HJ_LOGIN_PASSWORD" = "$TALOS_HJ_SIDECAR_TOKEN" ]; then
    printf 'TALOS Human Journey generated duplicate secret material.\n' >&2
    return 3
  fi

  umask 077
  {
    printf 'APP_KEY=%s\n' "$APP_KEY"
    printf 'TALOS_BROWSER_WORKER_TOKEN=%s\n' "$TALOS_BROWSER_WORKER_TOKEN"
    printf 'TALOS_HJ_LOGIN_EMAIL=%s\n' "$TALOS_HJ_LOGIN_EMAIL"
    printf 'TALOS_HJ_LOGIN_PASSWORD=%s\n' "$TALOS_HJ_LOGIN_PASSWORD"
    printf 'TALOS_HJ_SIDECAR_TOKEN=%s\n' "$TALOS_HJ_SIDECAR_TOKEN"
  } > "$HJ_SECRETS_ENV_FILE" || return 3
  chmod 600 "$HJ_SECRETS_ENV_FILE" 2>/dev/null || true

  "$TALOS_NODE_BIN" \
    "$ROOT_DIR/control-plane/scripts/browser-action-keypair.mjs" \
    --env-file "$HJ_SECRETS_ENV_FILE" >/dev/null || return 3

  local name
  local value
  local line
  while IFS= read -r line; do
    case "$line" in
      *=*) ;;
      *) continue ;;
    esac
    name="${line%%=*}"
    value="${line#*=}"
    case "$name" in
      APP_KEY|TALOS_BROWSER_WORKER_TOKEN|TALOS_HJ_LOGIN_EMAIL|TALOS_HJ_LOGIN_PASSWORD|TALOS_HJ_SIDECAR_TOKEN|TALOS_BROWSER_ACTION_PRIVATE_KEY_B64|TALOS_BROWSER_ACTION_PUBLIC_KEY_B64|TALOS_BROWSER_ACTION_KEY_ID)
        printf -v "$name" '%s' "$value"
        export "$name"
        ;;
    esac
  done < "$HJ_SECRETS_ENV_FILE"

  local canaries
  canaries="$(
    HJ_CANARY_ENV_FILE="$HJ_SECRETS_ENV_FILE" \
      "$TALOS_NODE_BIN" -e '
        const fs = require("node:fs");
        const selected = new Set([
          "APP_KEY",
          "TALOS_BROWSER_WORKER_TOKEN",
          "TALOS_HJ_LOGIN_PASSWORD",
          "TALOS_HJ_SIDECAR_TOKEN",
          "TALOS_BROWSER_ACTION_PRIVATE_KEY_B64",
          "TALOS_BROWSER_ACTION_PUBLIC_KEY_B64",
          "TALOS_BROWSER_ACTION_KEY_ID",
        ]);
        const values = fs.readFileSync(process.env.HJ_CANARY_ENV_FILE, "utf8")
          .split(/\r?\n/u)
          .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)])
          .filter(([name, value]) => selected.has(name) && value.length > 0)
          .map(([, value]) => value);
        if (values.length !== selected.size || new Set(values).size !== values.length) process.exit(22);
        process.stdout.write(JSON.stringify(values));
      '
  )" || return 3
  printf '%s' "$canaries" \
    | "$TALOS_NODE_BIN" "$HJ_RUNTIME_SCRIPT" write-canaries "$HJ_SECRET_CANARIES_FILE" \
    || return 3

  export \
    TALOS_NODE_BIN \
    APP_KEY \
    TALOS_BROWSER_WORKER_TOKEN \
    TALOS_HJ_LOGIN_EMAIL \
    TALOS_HJ_LOGIN_PASSWORD \
    TALOS_HJ_SIDECAR_TOKEN \
    TALOS_BROWSER_ACTION_PRIVATE_KEY_B64 \
    TALOS_BROWSER_ACTION_PUBLIC_KEY_B64 \
    TALOS_BROWSER_ACTION_KEY_ID \
    HJ_SECRETS_ENV_FILE \
    HJ_SECRET_CANARIES_FILE
}

hj_start_fixture_host() {
  _hj_require_run_paths || return 4
  [ -n "${TALOS_NODE_BIN:-}" ] || TALOS_NODE_BIN="$(hj_resolve_node)" || return 4
  local ready_file="$HJ_RUN_ROOT/runtime/fixture-ready.json"
  local secret_file="$HJ_RUN_ROOT/runtime/secrets/fixture-control.json"
  local log_file="$HJ_RUN_ROOT/logs/fixture.log"
  local fixture_lane="deterministic"
  if [ "$HJ_LANE" = "adaptive" ]; then
    fixture_lane="adaptive"
  fi
  if [ -e "$ready_file" ] || [ -e "$secret_file" ]; then
    printf 'TALOS Human Journey fixture descriptor already exists.\n' >&2
    return 4
  fi

  if ! hj_start_owned_process \
    "fixture-host" \
    "$log_file" \
    "$TALOS_NODE_BIN" \
    "$ROOT_DIR/scripts/human-journey/fixture-host.mjs" \
    "--ready-file=$ready_file" \
    "--secret-file=$secret_file" \
    "--lane=$fixture_lane"; then
    return 4
  fi
  HJ_FIXTURE_HOST_PID="$HJ_LAST_PROCESS_PID"
  HJ_FIXTURE_HOST_NATIVE_PID="$HJ_LAST_PROCESS_NATIVE_PID"

  local attempt
  for attempt in $(seq 1 100); do
    if [ -f "$ready_file" ] && [ -f "$secret_file" ]; then
      if hj_import_fixture_descriptor "$ready_file" "$secret_file"; then
        export HJ_FIXTURE_HOST_PID HJ_FIXTURE_HOST_NATIVE_PID
        return 0
      fi
      break
    fi
    kill -0 "$HJ_FIXTURE_HOST_PID" >/dev/null 2>&1 || break
    sleep 0.05
  done

  hj_stop_owned_processes >/dev/null 2>&1 || true
  printf 'TALOS Human Journey fixture host did not publish a valid descriptor.\n' >&2
  return 4
}

hj_import_fixture_descriptor() {
  local ready_file="${1:-}"
  local secret_file="${2:-}"
  _hj_is_absolute_path "$ready_file" || return 1
  _hj_is_absolute_path "$secret_file" || return 1
  local normalized
  normalized="$({
    HJ_FIXTURE_EXPECTED_PID="$HJ_FIXTURE_HOST_NATIVE_PID" \
    HJ_FIXTURE_LANE="$HJ_LANE" \
    HJ_FIXTURE_READY_FILE="$ready_file" \
    HJ_FIXTURE_SECRET_FILE="$secret_file" \
      "$TALOS_NODE_BIN" -e '
        const fs = require("node:fs");
        const ready = JSON.parse(fs.readFileSync(process.env.HJ_FIXTURE_READY_FILE, "utf8"));
        const secret = JSON.parse(fs.readFileSync(process.env.HJ_FIXTURE_SECRET_FILE, "utf8"));
        const exact = (value, keys) => value !== null
          && typeof value === "object"
          && !Array.isArray(value)
          && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
        const loopbackOrigin = (value) => {
          if (typeof value !== "string") return null;
          let url;
          try { url = new URL(value); } catch { return null; }
          if (url.protocol !== "http:" || url.hostname !== "127.0.0.1"
            || url.username !== "" || url.password !== "" || url.pathname !== "/"
            || url.search !== "" || url.hash !== "" || url.origin !== value) return null;
          const port = Number(url.port);
          return Number.isSafeInteger(port) && port >= 1024 && port <= 65535 ? port : null;
        };
        const loopbackV1Endpoint = (value) => {
          if (typeof value !== "string") return null;
          let url;
          try { url = new URL(value); } catch { return null; }
          if (url.protocol !== "http:" || url.hostname !== "127.0.0.1"
            || url.username !== "" || url.password !== "" || url.pathname !== "/v1"
            || url.search !== "" || url.hash !== "" || url.toString() !== value) return null;
          const port = Number(url.port);
          return Number.isSafeInteger(port) && port >= 1024 && port <= 65535
            ? { origin: url.origin, port }
            : null;
        };
        const sitePort = loopbackOrigin(ready.browser_site_origin);
        const providerPort = loopbackOrigin(ready.provider_base_url);
        const commonInvalid = ready.pid !== Number(process.env.HJ_FIXTURE_EXPECTED_PID)
          || sitePort === null || providerPort === null || sitePort === providerPort
          || ready.provider_health_url !== `${ready.provider_base_url}/health`
          || typeof ready.started_at !== "string"
          || new Date(ready.started_at).toISOString() !== ready.started_at
          || !/^[a-f0-9]{64}$/u.test(secret.provider_control_token);
        if (process.env.HJ_FIXTURE_LANE === "adaptive") {
          const simulatorEndpoint = loopbackV1Endpoint(ready.simulator_base_url);
          const simulatorPort = simulatorEndpoint?.port ?? null;
          if (commonInvalid
            || !exact(ready, ["protocol", "pid", "browser_site_origin", "provider_base_url", "provider_health_url", "simulator_base_url", "simulator_health_url", "started_at"])
            || ready.protocol !== "talos.human_journey.fixture_host.adaptive.v1"
            || simulatorPort === null
            || new Set([sitePort, providerPort, simulatorPort]).size !== 3
            || ready.simulator_health_url !== `${simulatorEndpoint?.origin}/health`
            || !exact(secret, ["protocol", "provider_control_token", "simulator_api_key"])
            || secret.protocol !== "talos.human_journey.fixture_secret.adaptive.v1"
            || !/^[a-f0-9]{64}$/u.test(secret.simulator_api_key)) process.exit(24);
          process.stdout.write([
            ready.browser_site_origin,
            ready.provider_base_url,
            ready.provider_health_url,
            secret.provider_control_token,
            ready.simulator_base_url,
            ready.simulator_health_url,
            secret.simulator_api_key,
            sitePort,
            providerPort,
            simulatorPort,
          ].join("\t"));
        } else {
          if (commonInvalid
            || !exact(ready, ["protocol", "pid", "browser_site_origin", "provider_base_url", "provider_health_url", "started_at"])
            || ready.protocol !== "talos.human_journey.fixture_host.v1"
            || !exact(secret, ["protocol", "provider_control_token"])
            || secret.protocol !== "talos.human_journey.fixture_secret.v1") process.exit(24);
          process.stdout.write([
            ready.browser_site_origin,
            ready.provider_base_url,
            ready.provider_health_url,
            secret.provider_control_token,
            sitePort,
            providerPort,
          ].join("\t"));
        }
      '
  })" || return 1

  local site_port
  local provider_port
  local simulator_port
  if [ "$HJ_LANE" = "adaptive" ]; then
    IFS=$'\t' read -r \
      HJ_BROWSER_SITE_ORIGIN \
      HJ_PROVIDER_BASE_URL \
      HJ_PROVIDER_HEALTH_URL \
      TALOS_HJ_PROVIDER_CONTROL_TOKEN \
      HJ_SIMULATOR_BASE_URL \
      HJ_SIMULATOR_HEALTH_URL \
      TALOS_HJ_SIMULATOR_API_KEY \
      site_port \
      provider_port \
      simulator_port <<< "$normalized"
  else
    IFS=$'\t' read -r \
      HJ_BROWSER_SITE_ORIGIN \
      HJ_PROVIDER_BASE_URL \
      HJ_PROVIDER_HEALTH_URL \
      TALOS_HJ_PROVIDER_CONTROL_TOKEN \
      site_port \
      provider_port <<< "$normalized"
    HJ_SIMULATOR_BASE_URL=""
    HJ_SIMULATOR_HEALTH_URL=""
    TALOS_HJ_SIMULATOR_API_KEY=""
  fi
  hj_append_secret_canary "$TALOS_HJ_PROVIDER_CONTROL_TOKEN" || return 1
  if [ "$HJ_LANE" = "adaptive" ]; then
    hj_append_secret_canary "$TALOS_HJ_SIMULATOR_API_KEY" || return 1
  fi
  hj_record_bound_port "browser-site" "$site_port" || return 1
  hj_record_bound_port "provider-fixture" "$provider_port" || return 1
  if [ "$HJ_LANE" = "adaptive" ]; then
    hj_record_bound_port "simulator-fixture" "$simulator_port" || return 1
  fi
  TALOS_HJ_PROVIDER_BASE_URL="$HJ_PROVIDER_BASE_URL/v1"
  TALOS_HJ_PROVIDER_MODEL="talos-hj-deterministic"
  TALOS_HJ_MODEL_ENDPOINT_SHA256="$(
    TALOS_HJ_HASH_INPUT="$TALOS_HJ_PROVIDER_BASE_URL" \
      "$TALOS_NODE_BIN" -e '
        const { createHash } = require("node:crypto");
        process.stdout.write(`sha256:${createHash("sha256").update(process.env.TALOS_HJ_HASH_INPUT, "utf8").digest("hex")}`);
      '
  )" || return 1
  export \
    HJ_BROWSER_SITE_ORIGIN \
    HJ_PROVIDER_BASE_URL \
    HJ_PROVIDER_HEALTH_URL \
    HJ_SIMULATOR_BASE_URL \
    HJ_SIMULATOR_HEALTH_URL \
    TALOS_HJ_PROVIDER_CONTROL_TOKEN \
    TALOS_HJ_SIMULATOR_API_KEY \
    TALOS_HJ_PROVIDER_BASE_URL \
    TALOS_HJ_PROVIDER_MODEL \
    TALOS_HJ_MODEL_ENDPOINT_SHA256
}

_hj_write_environment_file() {
  local target="${1:-}"
  shift || true
  _hj_require_run_paths || return 1
  _hj_is_absolute_path "$target" || return 1
  local secrets_dir="$HJ_RUN_ROOT/runtime/secrets"
  local target_parent
  target_parent="$(cd "$(dirname "$target")" && pwd -P)" || return 1
  if [ "$target_parent" != "$secrets_dir" ] || [ -e "$target" ] \
    || [[ ! "$(basename "$target")" =~ ^[a-z][a-z0-9-]{0,31}\.env$ ]]; then
    printf 'TALOS Human Journey environment file target is invalid.\n' >&2
    return 1
  fi

  local -A values=()
  local assignment
  local name
  local value
  for assignment in "$@"; do
    case "$assignment" in
      *=*) ;;
      *) return 1 ;;
    esac
    name="${assignment%%=*}"
    value="${assignment#*=}"
    if [[ ! "$name" =~ ^[A-Z][A-Z0-9_]{0,127}$ ]] \
      || [[ "$value" == *$'\n'* ]] || [[ "$value" == *$'\r'* ]]; then
      printf 'TALOS Human Journey environment assignment is invalid.\n' >&2
      return 1
    fi
    values[$name]="$value"
  done

  local temporary="$target.tmp.$$"
  local -a names=()
  mapfile -t names < <(printf '%s\n' "${!values[@]}" | LC_ALL=C sort)
  umask 077
  : > "$temporary" || return 1
  for name in "${names[@]}"; do
    printf '%s=%s\n' "$name" "${values[$name]}" >> "$temporary" || {
      rm -f -- "$temporary"
      return 1
    }
  done
  chmod 600 "$temporary" 2>/dev/null || true
  mv -- "$temporary" "$target"
}

hj_start_tau2_sidecar() {
  _hj_require_run_paths || return 4
  if [ "$HJ_LANE" != "adaptive" ]; then
    printf 'TALOS Human Journey tau2 sidecar is restricted to the adaptive lane.\n' >&2
    return 4
  fi
  if [[ ! "$HJ_SIMULATOR_BASE_URL" =~ ^http://127\.0\.0\.1:[0-9]+/v1$ ]] \
    || [[ ! "$TALOS_HJ_SIMULATOR_API_KEY" =~ ^[a-f0-9]{64}$ ]] \
    || [[ ! "$TALOS_HJ_SIDECAR_TOKEN" =~ ^[A-Za-z0-9_-]{32,128}$ ]]; then
    printf 'TALOS Human Journey adaptive simulator configuration is invalid.\n' >&2
    return 4
  fi

  local uv_bin="$ROOT_DIR/.tools/uv-0.11.29/uv.exe"
  local project_dir="$ROOT_DIR/human-journey"
  if [ ! -f "$uv_bin" ] || [ ! -f "$project_dir/uv.lock" ] || [ ! -f "$project_dir/pyproject.toml" ]; then
    printf 'TALOS Human Journey pinned Python sidecar prerequisites are missing.\n' >&2
    return 4
  fi
  if ! _hj_run_clean_env "$uv_bin" lock --check --project "$project_dir" >/dev/null 2>&1; then
    printf 'TALOS Human Journey Python lock is stale or invalid.\n' >&2
    return 4
  fi

  HJ_TAU2_SIDECAR_TOKEN_FILE="$HJ_RUN_ROOT/runtime/secrets/tau2-sidecar.token"
  HJ_TAU2_SIMULATOR_API_KEY_FILE="$HJ_RUN_ROOT/runtime/secrets/tau2-simulator.key"
  HJ_TAU2_SIDECAR_ENV_FILE="$HJ_RUN_ROOT/runtime/secrets/tau2-sidecar.env"
  if [ -e "$HJ_TAU2_SIDECAR_TOKEN_FILE" ] \
    || [ -e "$HJ_TAU2_SIMULATOR_API_KEY_FILE" ] \
    || [ -e "$HJ_TAU2_SIDECAR_ENV_FILE" ]; then
    printf 'TALOS Human Journey refuses to reuse sidecar secret material.\n' >&2
    return 4
  fi

  umask 077
  printf '%s' "$TALOS_HJ_SIDECAR_TOKEN" > "$HJ_TAU2_SIDECAR_TOKEN_FILE" || return 4
  printf '%s' "$TALOS_HJ_SIMULATOR_API_KEY" > "$HJ_TAU2_SIMULATOR_API_KEY_FILE" || return 4
  chmod 600 "$HJ_TAU2_SIDECAR_TOKEN_FILE" "$HJ_TAU2_SIMULATOR_API_KEY_FILE" 2>/dev/null || true

  local native_uv
  local native_project
  local native_sidecar_token
  local native_simulator_key
  native_uv="$(_hj_native_path "$uv_bin")" || return 4
  native_project="$(_hj_native_path "$project_dir")" || return 4
  native_sidecar_token="$(_hj_native_path "$HJ_TAU2_SIDECAR_TOKEN_FILE")" || return 4
  native_simulator_key="$(_hj_native_path "$HJ_TAU2_SIMULATOR_API_KEY_FILE")" || return 4

  _hj_write_environment_file "$HJ_TAU2_SIDECAR_ENV_FILE" \
    "TALOS_HJ_SIDECAR_TOKEN_FILE=$native_sidecar_token" \
    "TALOS_HJ_SIMULATOR_API_KEY_FILE=$native_simulator_key" \
    "TALOS_HJ_SIMULATOR_PROVIDER_ID=talos-hj-fixture-simulator" \
    "TALOS_HJ_SIMULATOR_MODEL=talos-hj-tau2-simulator" \
    "TALOS_HJ_SIMULATOR_BASE_URL=$HJ_SIMULATOR_BASE_URL" \
    "TALOS_HJ_UV_BIN=$native_uv" \
    "TALOS_HJ_PROJECT=$native_project" \
    || return 4

  if ! hj_start_owned_service_with_bearer_retry \
    "tau2-sidecar" \
    "$HJ_RUN_ROOT/logs/tau2-sidecar.log" \
    "/readyz" \
    '"status":"ready"' \
    "60" \
    "$TALOS_HJ_SIDECAR_TOKEN" \
    "TALOS_HJ_ENV_ROOT=$HJ_RUN_ROOT" \
    bash "$ROOT_DIR/scripts/human-journey/exec-env.sh" "$HJ_TAU2_SIDECAR_ENV_FILE" \
    bash -c 'exec "$TALOS_HJ_UV_BIN" run --locked --project "$TALOS_HJ_PROJECT" uvicorn talos_human_journey.api:create_runtime_app --factory --host 127.0.0.1 --port "$PORT" --no-access-log --timeout-keep-alive 2 --timeout-graceful-shutdown 3'; then
    printf 'TALOS Human Journey tau2 sidecar did not become ready.\n' >&2
    return 4
  fi

  HJ_TAU2_SIDECAR_PID="$HJ_LAST_PROCESS_PID"
  HJ_TAU2_SIDECAR_NATIVE_PID="$HJ_LAST_PROCESS_NATIVE_PID"
  HJ_TAU2_SIDECAR_URL="http://127.0.0.1:$HJ_LAST_PORT"
  HJ_TAU2_SIDECAR_READY_URL="$HJ_TAU2_SIDECAR_URL/readyz"
  hj_record_bound_port "tau2-sidecar" "$HJ_LAST_PORT" || return 4
  export \
    HJ_TAU2_SIDECAR_PID \
    HJ_TAU2_SIDECAR_NATIVE_PID \
    HJ_TAU2_SIDECAR_URL \
    HJ_TAU2_SIDECAR_READY_URL \
    HJ_TAU2_SIDECAR_TOKEN_FILE \
    HJ_TAU2_SIMULATOR_API_KEY_FILE \
    HJ_TAU2_SIDECAR_ENV_FILE
}

_hj_dotenv_blank_assignments() {
  local dotenv="$ROOT_DIR/control-plane/.env"
  [ -f "$dotenv" ] || return 0
  local line
  local pattern='^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*='
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    if [[ "$line" =~ $pattern ]]; then
      printf '%s=\n' "${BASH_REMATCH[2]}"
    fi
  done < "$dotenv"
}

_hj_laravel_cache_path() {
  local target="${1:-}"
  _hj_is_absolute_path "$target" || return 1
  HJ_CACHE_ROOT="$ROOT_DIR/control-plane" \
  HJ_CACHE_TARGET="$target" \
    "$TALOS_NODE_BIN" -e '
      const path = require("node:path");
      const root = path.resolve(process.env.HJ_CACHE_ROOT);
      const target = path.resolve(process.env.HJ_CACHE_TARGET);
      const relative = path.relative(root, target);
      const same = process.platform === "win32"
        ? path.resolve(root, relative).toLowerCase() === target.toLowerCase()
        : path.resolve(root, relative) === target;
      if (!same || relative === "" || path.isAbsolute(relative)
        || /^[A-Za-z]:/u.test(relative) || /[\u0000-\u001f\u007f]/u.test(relative)) process.exit(1);
      process.stdout.write(relative.split(path.sep).join("/"));
    '
}

hj_start_validator() {
  _hj_require_run_paths || return 4
  local native_php
  local native_chat_script
  local native_benchmark_script
  local native_kadmos_cli
  native_php="$(_hj_native_path "$TALOS_PHP_BIN")" || return 4
  native_chat_script="$(_hj_native_path "$ROOT_DIR/core/kadmos-chat.php")" || return 4
  native_benchmark_script="$(_hj_native_path "$ROOT_DIR/core/kadmos-bench-live.php")" || return 4
  native_kadmos_cli="$(_hj_native_path "$ROOT_DIR/core/kadmos")" || return 4
  local build_log="$HJ_RUN_ROOT/logs/validator-build.log"
  if ! _hj_run_clean_env \
    "$TALOS_NODE_BIN" \
    "$ROOT_DIR/validator/node_modules/typescript/bin/tsc" \
    --pretty false \
    --project "$ROOT_DIR/validator/tsconfig.json" \
    >"$build_log" 2>&1; then
    printf 'TALOS Human Journey Validator build failed.\n' >&2
    return 4
  fi

  local env_file="$HJ_RUN_ROOT/runtime/secrets/validator.env"
  _hj_write_environment_file "$env_file" \
    "NODE_ENV=test" \
    "PHP_BIN=$native_php" \
    "KADMOS_CHAT_SCRIPT=$native_chat_script" \
    "KADMOS_BENCHMARK_SCRIPT=$native_benchmark_script" \
    "KADMOS_CLI=$native_kadmos_cli" \
    "TALOS_CHAT_URL=http://127.0.0.1" \
    || return 4

  if ! hj_start_owned_service_with_retry \
    "validator" \
    "$HJ_RUN_ROOT/logs/validator.log" \
    "/health" \
    '"service":"avm-validator"' \
    "30" \
    "TALOS_HJ_ENV_ROOT=$HJ_RUN_ROOT" \
    bash "$ROOT_DIR/scripts/human-journey/exec-env.sh" "$env_file" \
    "$TALOS_NODE_BIN" "$ROOT_DIR/validator/dist/server.js"; then
    printf 'TALOS Human Journey Validator did not become ready.\n' >&2
    return 4
  fi

  hj_record_bound_port "validator" "$HJ_LAST_PORT" || return 4
  HJ_VALIDATOR_URL="http://127.0.0.1:$HJ_LAST_PORT"
  TALOS_VALIDATOR_HEALTH_URL="$HJ_VALIDATOR_URL/health"
  export HJ_VALIDATOR_URL TALOS_VALIDATOR_HEALTH_URL
}

hj_start_browser_worker() {
  _hj_require_run_paths || return 4
  local build_log="$HJ_RUN_ROOT/logs/browser-worker-build.log"
  if ! _hj_run_clean_env \
    "$TALOS_NODE_BIN" \
    "$ROOT_DIR/browser-worker/node_modules/typescript/bin/tsc" \
    --noEmit \
    --project "$ROOT_DIR/browser-worker/tsconfig.json" \
    >"$build_log" 2>&1; then
    printf 'TALOS Human Journey Browser Worker build failed.\n' >&2
    return 4
  fi

  local env_file="$HJ_RUN_ROOT/runtime/secrets/browser-worker.env"
  _hj_write_environment_file "$env_file" \
    "NODE_ENV=test" \
    "TALOS_BROWSER_WORKER_TOKEN=$TALOS_BROWSER_WORKER_TOKEN" \
    "TALOS_BROWSER_ACTION_PUBLIC_KEY_B64=$TALOS_BROWSER_ACTION_PUBLIC_KEY_B64" \
    "TALOS_BROWSER_ACTION_KEY_ID=$TALOS_BROWSER_ACTION_KEY_ID" \
    "TALOS_BROWSER_TEST_FIXTURE_ORIGIN=$HJ_BROWSER_SITE_ORIGIN" \
    "TALOS_BROWSER_MCP_ALLOWED_HOSTS=127.0.0.1" \
    || return 4

  if ! hj_start_owned_service_with_retry \
    "browser-worker" \
    "$HJ_RUN_ROOT/logs/browser-worker.log" \
    "/health" \
    '"service":"talos-browser-worker"' \
    "30" \
    "TALOS_HJ_ENV_ROOT=$HJ_RUN_ROOT" \
    bash "$ROOT_DIR/scripts/human-journey/exec-env.sh" "$env_file" \
    "$TALOS_NODE_BIN" \
    "$ROOT_DIR/browser-worker/node_modules/tsx/dist/cli.mjs" \
    "$ROOT_DIR/browser-worker/src/cli.ts"; then
    printf 'TALOS Human Journey Browser Worker did not start.\n' >&2
    return 4
  fi

  HJ_BROWSER_WORKER_URL="http://127.0.0.1:$HJ_LAST_PORT"
  if ! hj_wait_http_with_worker_token \
    "$HJ_BROWSER_WORKER_URL/ready" \
    "60" \
    '"status":"ready"' \
    "$TALOS_BROWSER_WORKER_TOKEN"; then
    printf 'TALOS Human Journey Browser Worker Chromium runtime is not ready.\n' >&2
    return 4
  fi
  hj_record_bound_port "browser-worker" "$HJ_LAST_PORT" || return 4
  TALOS_BROWSER_WORKER_URL="$HJ_BROWSER_WORKER_URL"
  export HJ_BROWSER_WORKER_URL TALOS_BROWSER_WORKER_URL
}

hj_prepare_laravel_runtime() {
  _hj_require_run_paths || return 4
  if [ -z "$HJ_VALIDATOR_URL" ] || [ -z "$HJ_BROWSER_WORKER_URL" ]; then
    printf 'TALOS Human Journey Laravel dependencies are not initialized.\n' >&2
    return 4
  fi

  HJ_LARAVEL_ROOT="$HJ_RUN_ROOT/runtime/laravel"
  HJ_LARAVEL_DATABASE="$HJ_LARAVEL_ROOT/database.sqlite"
  HJ_LARAVEL_STORAGE="$HJ_LARAVEL_ROOT/storage"
  HJ_LARAVEL_COMMAND_ENV_FILE="$HJ_RUN_ROOT/runtime/secrets/laravel-command.env"
  HJ_LARAVEL_SERVER_ENV_FILE="$HJ_RUN_ROOT/runtime/secrets/laravel-server.env"
  if [ -e "$HJ_LARAVEL_DATABASE" ]; then
    printf 'TALOS Human Journey refuses to reuse an existing SQLite file.\n' >&2
    return 4
  fi

  mkdir -p \
    "$HJ_LARAVEL_STORAGE/app/private" \
    "$HJ_LARAVEL_STORAGE/app/public" \
    "$HJ_LARAVEL_STORAGE/framework/cache/data" \
    "$HJ_LARAVEL_STORAGE/framework/sessions" \
    "$HJ_LARAVEL_STORAGE/framework/testing" \
    "$HJ_LARAVEL_STORAGE/framework/views" \
    "$HJ_LARAVEL_STORAGE/logs" \
    "$HJ_LARAVEL_ROOT/bootstrap/cache" \
    || return 4
  umask 077
  : > "$HJ_LARAVEL_DATABASE" || return 4

  local native_run_root
  local native_laravel_root
  local native_database
  local native_storage
  local native_php
  local native_public
  local native_router
  local config_cache
  local events_cache
  local packages_cache
  local routes_cache
  local services_cache
  native_run_root="$(_hj_native_path "$HJ_RUN_ROOT")" || return 4
  native_laravel_root="$(_hj_native_path "$HJ_LARAVEL_ROOT")" || return 4
  native_database="$(_hj_native_path "$HJ_LARAVEL_DATABASE")" || return 4
  native_storage="$(_hj_native_path "$HJ_LARAVEL_STORAGE")" || return 4
  native_php="$(_hj_native_path "$TALOS_PHP_BIN")" || return 4
  native_public="$(_hj_native_path "$ROOT_DIR/control-plane/public")" || return 4
  native_router="$(_hj_native_path "$ROOT_DIR/control-plane/tests/e2e/php-router.php")" || return 4
  config_cache="$(_hj_laravel_cache_path "$HJ_LARAVEL_ROOT/bootstrap/cache/config.php")" || return 4
  events_cache="$(_hj_laravel_cache_path "$HJ_LARAVEL_ROOT/bootstrap/cache/events.php")" || return 4
  packages_cache="$(_hj_laravel_cache_path "$HJ_LARAVEL_ROOT/bootstrap/cache/packages.php")" || return 4
  routes_cache="$(_hj_laravel_cache_path "$HJ_LARAVEL_ROOT/bootstrap/cache/routes.php")" || return 4
  services_cache="$(_hj_laravel_cache_path "$HJ_LARAVEL_ROOT/bootstrap/cache/services.php")" || return 4

  local -a common=()
  mapfile -t common < <(_hj_dotenv_blank_assignments)
  common+=(
    "APP_NAME=TALOS Human Journey"
    "APP_ENV=testing"
    "APP_KEY=$APP_KEY"
    "APP_DEBUG=false"
    "APP_URL=http://127.0.0.1"
    "APP_LOCALE=en"
    "APP_FALLBACK_LOCALE=en"
    "APP_FAKER_LOCALE=en_US"
    "APP_MAINTENANCE_DRIVER=file"
    "APP_CONFIG_CACHE=$config_cache"
    "APP_EVENTS_CACHE=$events_cache"
    "APP_PACKAGES_CACHE=$packages_cache"
    "APP_ROUTES_CACHE=$routes_cache"
    "APP_SERVICES_CACHE=$services_cache"
    "AVM_VALIDATOR_URL=$HJ_VALIDATOR_URL"
    "BCRYPT_ROUNDS=4"
    "BROADCAST_CONNECTION=log"
    "CACHE_STORE=array"
    "DB_CONNECTION=sqlite"
    "DB_DATABASE=$native_database"
    "DB_URL="
    "FILESYSTEM_DISK=local"
    "LARAVEL_STORAGE_PATH=$native_storage"
    "LOG_CHANNEL=single"
    "LOG_DEPRECATIONS_CHANNEL=null"
    "LOG_LEVEL=debug"
    "MAIL_MAILER=array"
    "QUEUE_CONNECTION=sync"
    "SESSION_DRIVER=file"
    "SESSION_ENCRYPT=false"
    "SESSION_LIFETIME=120"
    "SESSION_PATH=/"
    "TALOS_CLAMAV_HOST="
    "TALOS_TIKA_URL="
    "TALOS_OCR_ENABLED=false"
    "TALOS_VALIDATOR_HEALTH_URL=$HJ_VALIDATOR_URL/health"
    "VITE_HOT_FILE=$native_laravel_root/vite.hot"
  )

  _hj_write_environment_file "$HJ_LARAVEL_COMMAND_ENV_FILE" \
    "${common[@]}" \
    "TALOS_HJ_RUN_ID=$HJ_RUN_ID" \
    "TALOS_HJ_RUN_ROOT=$native_run_root" \
    "TALOS_HJ_LOGIN_EMAIL=$TALOS_HJ_LOGIN_EMAIL" \
    "TALOS_HJ_LOGIN_PASSWORD=$TALOS_HJ_LOGIN_PASSWORD" \
    "TALOS_HJ_PROVIDER_BASE_URL=$TALOS_HJ_PROVIDER_BASE_URL" \
    "TALOS_HJ_PROVIDER_MODEL=$TALOS_HJ_PROVIDER_MODEL" \
    || return 4

  _hj_write_environment_file "$HJ_LARAVEL_SERVER_ENV_FILE" \
    "${common[@]}" \
    "TALOS_BROWSER_CLIENT_DRIVER=http" \
    "TALOS_BROWSER_WORKER_URL=$HJ_BROWSER_WORKER_URL" \
    "TALOS_BROWSER_WORKER_TOKEN=$TALOS_BROWSER_WORKER_TOKEN" \
    "TALOS_BROWSER_ACTION_PRIVATE_KEY_B64=$TALOS_BROWSER_ACTION_PRIVATE_KEY_B64" \
    "TALOS_BROWSER_ACTION_KEY_ID=$TALOS_BROWSER_ACTION_KEY_ID" \
    "TALOS_BROWSER_WORKER_ALLOW_INSECURE_INTERNAL_TRANSPORT=true" \
    "TALOS_BROWSER_SEARCH_ENABLED=true" \
    "TALOS_BROWSER_SEARCH_ORIGIN=$HJ_BROWSER_SITE_ORIGIN" \
    "TALOS_BROWSER_TEST_FIXTURE_ORIGIN=$HJ_BROWSER_SITE_ORIGIN" \
    "TALOS_DEV_BROWSER_EVIDENCE=true" \
    "TALOS_HJ_PHP_BIN=$native_php" \
    "TALOS_HJ_PUBLIC_DIR=$native_public" \
    "TALOS_HJ_ROUTER=$native_router" \
    || return 4

  export \
    HJ_LARAVEL_ROOT \
    HJ_LARAVEL_DATABASE \
    HJ_LARAVEL_STORAGE \
    HJ_LARAVEL_COMMAND_ENV_FILE \
    HJ_LARAVEL_SERVER_ENV_FILE
}

hj_run_laravel_command() {
  [ "$#" -ge 1 ] || return 4
  _hj_is_absolute_path "$HJ_LARAVEL_COMMAND_ENV_FILE" || return 4
  _hj_run_clean_env \
    "TALOS_HJ_ENV_ROOT=$HJ_RUN_ROOT" \
    bash "$ROOT_DIR/scripts/human-journey/exec-env.sh" \
    "$HJ_LARAVEL_COMMAND_ENV_FILE" \
    "$TALOS_PHP_BIN" "$ROOT_DIR/control-plane/artisan" "$@"
}

hj_assert_laravel_journey_readiness() {
  local base_url="${1:-}"
  local timeout_seconds="${2:-30}"
  if [[ ! "$base_url" =~ ^http://127\.0\.0\.1:[0-9]+$ ]] \
    || [[ ! "$timeout_seconds" =~ ^[1-9][0-9]*$ ]] \
    || [ "$timeout_seconds" -gt 300 ]; then
    return 1
  fi

  local output="$HJ_LARAVEL_ROOT/readiness.json"
  local probe="$HJ_LARAVEL_ROOT/readiness.probe.json"
  local deadline=$((SECONDS + timeout_seconds))
  local status
  local normalized
  while [ "$SECONDS" -lt "$deadline" ]; do
    status="$(curl --silent --show-error --max-time 10 --output "$probe" --write-out '%{http_code}' "$base_url/readyz" 2>/dev/null || true)"
    if [ "$status" = "200" ] || [ "$status" = "503" ]; then
      normalized="$(
        "$TALOS_NODE_BIN" - "$probe" <<'NODE'
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const required = ["app_key", "database", "migrations", "storage", "queue", "validator", "browser_worker"];
if (report === null || typeof report !== "object" || Array.isArray(report)
  || typeof report.ready !== "boolean"
  || !["healthy", "degraded"].includes(report.status)
  || report.checks === null || typeof report.checks !== "object" || Array.isArray(report.checks)
  || required.some((name) => report.checks[name]?.status !== "healthy")) process.exit(1);
process.stdout.write(JSON.stringify(report));
NODE
      )" || normalized=""
      if [ -n "$normalized" ]; then
        printf '%s' "$normalized" | "$TALOS_NODE_BIN" "$HJ_RUNTIME_SCRIPT" write-json "$output" || return 1
        rm -f -- "$probe"
        return 0
      fi
    fi
    sleep 0.2
  done
  rm -f -- "$probe"
  return 1
}

hj_start_laravel() {
  _hj_require_run_paths || return 4
  if ! hj_run_laravel_command migrate:fresh --force \
    >"$HJ_RUN_ROOT/logs/laravel-migrate.log" 2>&1; then
    printf 'TALOS Human Journey isolated migrations failed.\n' >&2
    return 4
  fi
  if ! hj_run_laravel_command db:seed --class=TalosHumanJourneySeeder --force \
    >"$HJ_RUN_ROOT/logs/laravel-seed.log" 2>&1; then
    printf 'TALOS Human Journey isolated seeding failed.\n' >&2
    return 4
  fi

  if ! hj_start_owned_service_with_retry \
    "laravel" \
    "$HJ_RUN_ROOT/logs/laravel.log" \
    "/login" \
    '<title>TALOS Access</title>' \
    "30" \
    "TALOS_HJ_ENV_ROOT=$HJ_RUN_ROOT" \
    bash "$ROOT_DIR/scripts/human-journey/exec-env.sh" "$HJ_LARAVEL_SERVER_ENV_FILE" \
    bash -c 'export APP_URL="http://${HOST}:${PORT}"; exec "$TALOS_HJ_PHP_BIN" -d opcache.enable=0 -S "${HOST}:${PORT}" -t "$TALOS_HJ_PUBLIC_DIR" "$TALOS_HJ_ROUTER"'; then
    printf 'TALOS Human Journey Laravel server did not become ready.\n' >&2
    return 4
  fi

  hj_record_bound_port "laravel" "$HJ_LAST_PORT" || return 4
  HJ_LARAVEL_URL="http://127.0.0.1:$HJ_LAST_PORT"
  if ! hj_assert_laravel_journey_readiness "$HJ_LARAVEL_URL" "30"; then
    printf 'TALOS Human Journey Laravel dependencies did not become ready.\n' >&2
    return 4
  fi
  export HJ_LARAVEL_URL
}

hj_start_deterministic_stack() {
  if [ "$HJ_LANE" = "adaptive" ]; then
    printf 'TALOS Human Journey adaptive runs require the selected stack entrypoint.\n' >&2
    return 4
  fi
  hj_start_selected_stack
}

hj_start_selected_stack() {
  hj_verify_repo_toolchain || return 3
  hj_start_fixture_host || return 4
  if [ "$HJ_LANE" = "adaptive" ]; then
    hj_start_tau2_sidecar || return 4
  fi
  hj_start_validator || return 4
  hj_start_browser_worker || return 4
  hj_prepare_laravel_runtime || return 4
  hj_start_laravel || return 4
}

hj_prepare_playwright_environment() {
  local env_file="${1:-}"
  local native_artifact_root="${2:-}"
  if [ "$#" -ne 2 ] \
    || [[ ! "$TALOS_HJ_MODEL_ENDPOINT_SHA256" =~ ^sha256:[a-f0-9]{64}$ ]] \
    || [ -z "$TALOS_HJ_PROVIDER_MODEL" ]; then
    printf 'TALOS Human Journey Playwright model handoff is invalid.\n' >&2
    return 1
  fi

  local -a values=(
    "CI=1"
    "TALOS_HJ_BASE_URL=$HJ_LARAVEL_URL"
    "TALOS_HJ_ARTIFACT_ROOT=$native_artifact_root"
    "TALOS_HJ_RUN_ID=$HJ_RUN_ID"
    "TALOS_HJ_LANE=$HJ_LANE"
    "TALOS_HJ_SCENARIO_ID=$HJ_SCENARIO_ID"
    "TALOS_HJ_SEED=$HJ_SEED"
    "TALOS_HJ_TRIALS=$HJ_TRIALS"
    "TALOS_HJ_LOGIN_EMAIL=$TALOS_HJ_LOGIN_EMAIL"
    "TALOS_HJ_LOGIN_PASSWORD=$TALOS_HJ_LOGIN_PASSWORD"
    "TALOS_HJ_PROVIDER_BASE_URL=$HJ_PROVIDER_BASE_URL"
    "TALOS_HJ_PROVIDER_CONTROL_TOKEN=$TALOS_HJ_PROVIDER_CONTROL_TOKEN"
    "TALOS_HJ_BROWSER_SITE_ORIGIN=$HJ_BROWSER_SITE_ORIGIN"
    "TALOS_HJ_MODEL_PROVIDER_ID=ollama"
    "TALOS_HJ_MODEL_NAME=$TALOS_HJ_PROVIDER_MODEL"
    "TALOS_HJ_MODEL_ENDPOINT_SHA256=$TALOS_HJ_MODEL_ENDPOINT_SHA256"
  )
  if [ "$HJ_LANE" = "adaptive" ]; then
    if [[ ! "$HJ_TAU2_SIDECAR_URL" =~ ^http://127\.0\.0\.1:[0-9]+$ ]] \
      || [[ ! "$TALOS_HJ_SIDECAR_TOKEN" =~ ^[A-Za-z0-9_-]{32,128}$ ]]; then
      printf 'TALOS Human Journey adaptive Playwright handoff is invalid.\n' >&2
      return 1
    fi
    values+=(
      "TALOS_HJ_TAU2_SIDECAR_URL=$HJ_TAU2_SIDECAR_URL"
      "TALOS_HJ_TAU2_SIDECAR_TOKEN=$TALOS_HJ_SIDECAR_TOKEN"
    )
  fi

  _hj_write_environment_file "$env_file" "${values[@]}"
}

hj_prepare_playwright_args() {
  HJ_PLAYWRIGHT_ARGS=(
    test
    --config=playwright.human-journey.config.ts
    --project=chromium
    --workers=1
  )
  if [ "$HJ_LANE" = "adaptive" ]; then
    HJ_PLAYWRIGHT_ARGS+=(--max-failures=1)
  fi
}

hj_run_playwright() {
  _hj_require_run_paths || return 5
  HJ_PLAYWRIGHT_FAILURE_CODE="HJ_PLAYWRIGHT_HANDOFF_FAILED"
  HJ_PLAYWRIGHT_REPORT_PATH=""
  export HJ_PLAYWRIGHT_FAILURE_CODE HJ_PLAYWRIGHT_REPORT_PATH
  if [[ ! "${HJ_LARAVEL_URL:-}" =~ ^http://127\.0\.0\.1:[0-9]+$ ]] \
    || [[ ! "${HJ_PROVIDER_BASE_URL:-}" =~ ^http://127\.0\.0\.1:[0-9]+$ ]] \
    || [[ ! "${HJ_BROWSER_SITE_ORIGIN:-}" =~ ^http://127\.0\.0\.1:[0-9]+$ ]] \
    || [[ ! "${TALOS_HJ_PROVIDER_CONTROL_TOKEN:-}" =~ ^[a-f0-9]{64}$ ]] \
    || [ -z "${TALOS_HJ_LOGIN_EMAIL:-}" ] \
    || [ -z "${TALOS_HJ_LOGIN_PASSWORD:-}" ]; then
    return 5
  fi

  local artifact_root="$HJ_RUN_ROOT/reports/playwright"
  local native_artifact_root
  local env_file="$HJ_RUN_ROOT/runtime/secrets/playwright.env"
  local log_file="$HJ_RUN_ROOT/logs/playwright.log"
  local -a product_specs=()
  local has_product_specs=0
  mkdir -p "$artifact_root" || {
    HJ_PLAYWRIGHT_FAILURE_CODE="HJ_PLAYWRIGHT_HANDOFF_FAILED"
    return 5
  }
  native_artifact_root="$(_hj_native_path "$artifact_root")" || {
    HJ_PLAYWRIGHT_FAILURE_CODE="HJ_PLAYWRIGHT_HANDOFF_FAILED"
    return 5
  }

  hj_prepare_playwright_environment "$env_file" "$native_artifact_root" || {
      HJ_PLAYWRIGHT_FAILURE_CODE="HJ_PLAYWRIGHT_HANDOFF_FAILED"
      return 5
    }

  shopt -s nullglob
  product_specs=("$ROOT_DIR/control-plane/tests/human-journey/specs/"*.spec.ts)
  shopt -u nullglob
  [ "${#product_specs[@]}" -eq 0 ] || has_product_specs=1
  hj_prepare_playwright_args

  local playwright_status=0
  (
    cd "$ROOT_DIR/control-plane" || exit 1
    _hj_run_clean_env \
      "TALOS_HJ_ENV_ROOT=$HJ_RUN_ROOT" \
      bash "$ROOT_DIR/scripts/human-journey/exec-env.sh" "$env_file" \
      "$TALOS_NODE_BIN" \
      "$ROOT_DIR/control-plane/node_modules/@playwright/test/cli.js" \
      "${HJ_PLAYWRIGHT_ARGS[@]}"
  ) >"$log_file" 2>&1 || playwright_status=$?

  HJ_PLAYWRIGHT_REPORT_PATH="reports/playwright/results.json"
  export HJ_PLAYWRIGHT_FAILURE_CODE HJ_PLAYWRIGHT_REPORT_PATH
  if [ ! -f "$HJ_RUN_ROOT/$HJ_PLAYWRIGHT_REPORT_PATH" ]; then
    HJ_PLAYWRIGHT_FAILURE_CODE="HJ_PLAYWRIGHT_HANDOFF_FAILED"
    export HJ_PLAYWRIGHT_FAILURE_CODE
    return 5
  fi
  if [ "$has_product_specs" -eq 0 ]; then
    HJ_PLAYWRIGHT_FAILURE_CODE="HJ_PRODUCT_JOURNEY_MISSING"
    export HJ_PLAYWRIGHT_FAILURE_CODE
    return 5
  fi
  if [ "$playwright_status" -ne 0 ]; then
    HJ_PLAYWRIGHT_FAILURE_CODE="HJ_JOURNEY_FAILED"
    export HJ_PLAYWRIGHT_FAILURE_CODE
    return 5
  fi

  HJ_PLAYWRIGHT_FAILURE_CODE=""
  export HJ_PLAYWRIGHT_FAILURE_CODE
}

hj_write_terminal_result() {
  local status="${1:-}"
  local exit_code="${2:-}"
  local failure_code="${3:-}"
  local trials_completed="${4:-}"
  local report_path="${5:-}"
  local evidence_manifest_path="${6:-}"
  if [ "$#" -ne 6 ] || [ "$HJ_RESULT_WRITTEN" -ne 0 ]; then
    return 1
  fi
  _hj_require_run_paths || return 1
  [[ "$HJ_STARTED_AT" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$ ]] || return 1
  [[ "$HJ_STARTED_MS" =~ ^[0-9]+$ ]] || return 1
  [[ "$trials_completed" =~ ^(0|[1-9][0-9]?)$ ]] || return 1
  (( 10#$trials_completed <= 10#$HJ_TRIALS )) || return 1

  case "$status:$exit_code" in
    passed:0)
      [ -z "$failure_code" ] || return 1
      ;;
    cancelled:130)
      [[ "$failure_code" =~ ^HJ_[A-Z0-9_]{3,63}$ ]] || return 1
      ;;
    failed:3|failed:4|failed:5|failed:6)
      [[ "$failure_code" =~ ^HJ_[A-Z0-9_]{3,63}$ ]] || return 1
      ;;
    *) return 1 ;;
  esac
  _hj_validate_result_path "$report_path" || return 1
  _hj_validate_result_path "$evidence_manifest_path" || return 1

  local assisted="false"
  if [ "$HJ_DIRECTOR" = "external" ] || [ -n "$HJ_RESUME_ID" ]; then
    assisted="true"
  fi
  local promotional="false"
  if [ "$status" = "passed" ] && [ "$assisted" = "false" ] \
    && [ -n "$report_path" ] && [ -n "$evidence_manifest_path" ] \
    && [ -f "$HJ_RUN_ROOT/$report_path" ] \
    && [ -f "$HJ_RUN_ROOT/$evidence_manifest_path" ]; then
    promotional="true"
  fi

  local node
  local result_json
  node="$(hj_resolve_node)" || return 1
  result_json="$(
    HJ_RESULT_STATUS="$status" \
    HJ_RESULT_EXIT_CODE="$exit_code" \
    HJ_RESULT_FAILURE_CODE="$failure_code" \
    HJ_RESULT_TRIALS_COMPLETED="$trials_completed" \
    HJ_RESULT_REPORT_PATH="$report_path" \
    HJ_RESULT_EVIDENCE_PATH="$evidence_manifest_path" \
    HJ_RESULT_ASSISTED="$assisted" \
    HJ_RESULT_PROMOTIONAL="$promotional" \
    HJ_RESULT_LANE="$HJ_LANE" \
    HJ_RESULT_SCENARIO_ID="$HJ_SCENARIO_ID" \
    HJ_RESULT_SEED="$HJ_SEED" \
    HJ_RESULT_TRIALS_REQUESTED="$HJ_TRIALS" \
    HJ_RESULT_STARTED_AT="$HJ_STARTED_AT" \
    HJ_RESULT_STARTED_MS="$HJ_STARTED_MS" \
    HJ_RESULT_RUN_ID="$HJ_RUN_ID" \
      "$node" -e '
        const finishedAt = new Date();
        const value = {
          protocol: "talos.human_journey.result.v1",
          run_id: process.env.HJ_RESULT_RUN_ID,
          status: process.env.HJ_RESULT_STATUS,
          lane: process.env.HJ_RESULT_LANE,
          scenario_id: process.env.HJ_RESULT_SCENARIO_ID,
          seed: Number(process.env.HJ_RESULT_SEED),
          trials_requested: Number(process.env.HJ_RESULT_TRIALS_REQUESTED),
          trials_completed: Number(process.env.HJ_RESULT_TRIALS_COMPLETED),
          assisted: process.env.HJ_RESULT_ASSISTED === "true",
          promotional: process.env.HJ_RESULT_PROMOTIONAL === "true",
          started_at: process.env.HJ_RESULT_STARTED_AT,
          finished_at: finishedAt.toISOString(),
          duration_ms: Math.max(0, finishedAt.getTime() - Number(process.env.HJ_RESULT_STARTED_MS)),
          exit_code: Number(process.env.HJ_RESULT_EXIT_CODE),
          failure_code: process.env.HJ_RESULT_FAILURE_CODE || null,
          report_path: process.env.HJ_RESULT_REPORT_PATH || null,
          evidence_manifest_path: process.env.HJ_RESULT_EVIDENCE_PATH || null,
        };
        process.stdout.write(JSON.stringify(value));
      '
  )" || return 1
  hj_write_result "$result_json" || return 1
  HJ_RESULT_WRITTEN=1
}

_hj_validate_result_path() {
  local value="$1"
  [ -z "$value" ] && return 0
  [[ "$value" =~ ^[A-Za-z0-9._/-]{1,240}$ ]] || return 1
  case "/$value/" in
    *"/../"*|*"/./"*|*"//"*) return 1 ;;
  esac
  case "$value" in
    /*) return 1 ;;
  esac
}

hj_finalize_failure() {
  local requested_exit_code="${1:-}"
  local requested_failure_code="${2:-}"
  local trials_completed="${3:-0}"
  local requested_status="${4:-failed}"
  local final_exit_code="$requested_exit_code"
  local final_failure_code="$requested_failure_code"
  local final_status="$requested_status"

  if ! hj_stop_owned_processes; then
    final_exit_code=6
    final_failure_code="HJ_CLEANUP_FAILED"
    final_status="failed"
  fi
  if [ -n "${HJ_SECRET_CANARIES_FILE:-}" ] && [ -f "$HJ_SECRET_CANARIES_FILE" ]; then
    if ! hj_redact_retained_logs "$HJ_SECRET_CANARIES_FILE"; then
      final_exit_code=6
      final_failure_code="HJ_EVIDENCE_REDACTION_FAILED"
      final_status="failed"
    fi
  fi
  if ! _hj_remove_secrets_dir; then
    final_exit_code=6
    final_failure_code="HJ_CLEANUP_FAILED"
    final_status="failed"
  fi
  if [ -n "$HJ_RUN_LOCK_DIR" ] && ! hj_release_run_lock; then
    final_exit_code=6
    final_failure_code="HJ_CLEANUP_FAILED"
    final_status="failed"
  fi
  if ! hj_write_terminal_result \
    "$final_status" \
    "$final_exit_code" \
    "$final_failure_code" \
    "$trials_completed" \
    "" \
    ""; then
    return 6
  fi
  return "$final_exit_code"
}

hj_finalize_success() {
  local trials_completed="${1:-}"
  local report_path="${2:-}"
  local evidence_manifest_path="${3:-}"
  hj_stop_owned_processes || return 6
  if [ -n "${HJ_SECRET_CANARIES_FILE:-}" ] && [ -f "$HJ_SECRET_CANARIES_FILE" ]; then
    hj_redact_retained_logs "$HJ_SECRET_CANARIES_FILE" || return 6
  fi
  _hj_remove_secrets_dir || return 6
  if [ -n "$HJ_RUN_LOCK_DIR" ]; then
    hj_release_run_lock || return 6
  fi
  hj_write_terminal_result \
    "passed" \
    "0" \
    "" \
    "$trials_completed" \
    "$report_path" \
    "$evidence_manifest_path"
}

hj_handle_signal() {
  if [ "$HJ_SIGNAL_HANDLED" -ne 0 ]; then
    return
  fi
  HJ_SIGNAL_HANDLED=1
  trap - INT TERM
  local final_status=130
  hj_finalize_failure "130" "HJ_CANCELLED" "0" "cancelled" || final_status=$?
  exit "$final_status"
}

main() {
  if ! hj_parse_args "$@"; then return 2; fi
  if ! hj_validate_args; then return 2; fi
  if hj_validate_only_enabled; then
    hj_print_cli_contract
    return 3
  fi

  hj_prepare_run "$ROOT_DIR/.talos/human-journey" || return 3
  trap 'hj_handle_signal "INT"' INT TERM

  local requested_exit_code
  local failure_code
  local operation_status
  local final_status
  if ! hj_prepare_secrets; then
    requested_exit_code=3
    failure_code="HJ_SECRET_PREPARATION_FAILED"
  else
    set +e
    hj_start_selected_stack
    operation_status=$?
    set -e
    if [ "$operation_status" -ne 0 ]; then
      if [ "$operation_status" -eq 3 ]; then
        requested_exit_code=3
        failure_code="HJ_PREREQUISITE_FAILED"
      else
        requested_exit_code=4
        failure_code="HJ_STACK_START_FAILED"
      fi
    else
      set +e
      hj_run_playwright
      operation_status=$?
      set -e
      if [ "$operation_status" -ne 0 ]; then
        requested_exit_code=5
        failure_code="${HJ_PLAYWRIGHT_FAILURE_CODE:-HJ_JOURNEY_FAILED}"
      else
        set +e
        hj_finalize_success "$HJ_TRIALS" "$HJ_PLAYWRIGHT_REPORT_PATH" ""
        final_status=$?
        set -e
        trap - INT TERM
        printf 'TALOS Human Journey result: %s\n' "$HJ_RUN_ROOT/result.json" >&2
        return "$final_status"
      fi
    fi
  fi

  set +e
  hj_finalize_failure "$requested_exit_code" "$failure_code" "0" "failed"
  final_status=$?
  set -e
  trap - INT TERM
  printf 'TALOS Human Journey failed with %s. Result: %s\n' "$failure_code" "$HJ_RUN_ROOT/result.json" >&2
  return "$final_status"
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
