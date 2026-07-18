#!/usr/bin/env bash

if [ "${TALOS_RUNTIME_ADAPTER_LOADED:-0}" = "1" ]; then
  return 0 2>/dev/null || exit 0
fi
TALOS_RUNTIME_ADAPTER_LOADED=1

if [ -z "${ROOT_DIR:-}" ]; then
  ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fi

TALOS_RUNTIME_SELECTED_KIND=""
TALOS_RUNTIME_SELECTED_BIN=""
TALOS_RUNTIME_COMPOSE_PROVIDER=""
TALOS_RUNTIME_PODMAN_MACHINE=""

talos_runtime_preference() {
  local preference="${TALOS_CONTAINER_RUNTIME:-}"
  if [ -z "$preference" ] && declare -F effective_env_value >/dev/null 2>&1; then
    preference="$(effective_env_value TALOS_CONTAINER_RUNTIME)"
  fi
  preference="${preference:-auto}"
  preference="$(printf '%s' "$preference" | tr '[:upper:]' '[:lower:]')"
  case "$preference" in
    auto|docker|podman) printf '%s\n' "$preference" ;;
    *)
      echo "TALOS_CONTAINER_RUNTIME must be one of: auto, docker, podman. Received '$preference'." >&2
      return 2
      ;;
  esac
}

talos_runtime_is_windows() {
  case "$(uname -s 2>/dev/null || true)" in
    MINGW*|MSYS*|CYGWIN*) return 0 ;;
    *) return 1 ;;
  esac
}

talos_runtime_native_path() {
  local path="$1"
  if talos_runtime_is_windows && command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$path"
    return
  fi
  printf '%s\n' "$path"
}

talos_runtime_find_docker() {
  if [ -n "${TALOS_DOCKER_BIN:-}" ] && [ -x "${TALOS_DOCKER_BIN}" ]; then
    printf '%s\n' "$TALOS_DOCKER_BIN"
    return 0
  fi
  command -v docker 2>/dev/null || return 1
}

talos_runtime_find_podman() {
  local local_podman="$ROOT_DIR/.tools/container-runtime/podman/usr/bin/podman.exe"
  if [ -n "${TALOS_PODMAN_BIN:-}" ] && [ -x "${TALOS_PODMAN_BIN}" ]; then
    printf '%s\n' "$TALOS_PODMAN_BIN"
    return 0
  fi
  if [ -x "$local_podman" ]; then
    printf '%s\n' "$local_podman"
    return 0
  fi
  command -v podman 2>/dev/null || return 1
}

talos_runtime_find_compose_provider() {
  local provider="$ROOT_DIR/.tools/container-runtime/compose/docker-compose.exe"
  if [ -n "${TALOS_PODMAN_COMPOSE_PROVIDER:-}" ] && [ -f "${TALOS_PODMAN_COMPOSE_PROVIDER}" ]; then
    printf '%s\n' "$TALOS_PODMAN_COMPOSE_PROVIDER"
    return 0
  fi
  if [ -f "$provider" ]; then
    printf '%s\n' "$provider"
    return 0
  fi
  return 1
}

talos_runtime_podman_machine() {
  local machine="${TALOS_PODMAN_MACHINE:-talos-machine}"
  if [[ ! "$machine" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$ ]]; then
    echo 'TALOS_PODMAN_MACHINE must use 1-64 letters, digits, dots, underscores, or hyphens.' >&2
    return 2
  fi
  printf '%s\n' "$machine"
}

talos_runtime_probe_docker() {
  local docker_bin
  docker_bin="$(talos_runtime_find_docker)" || return 1
  "$docker_bin" info >/dev/null 2>&1 || return 1
  "$docker_bin" compose version >/dev/null 2>&1 || return 1
  TALOS_RUNTIME_SELECTED_KIND="docker"
  TALOS_RUNTIME_SELECTED_BIN="$docker_bin"
  TALOS_RUNTIME_COMPOSE_PROVIDER=""
}

talos_runtime_probe_podman() {
  local podman_bin provider provider_native machine
  podman_bin="$(talos_runtime_find_podman)" || return 1
  provider="$(talos_runtime_find_compose_provider)" || return 1
  provider_native="$(talos_runtime_native_path "$provider")"
  machine="$(talos_runtime_podman_machine)" || return $?
  "$podman_bin" --connection "$machine" info >/dev/null 2>&1 || return 1
  PODMAN_COMPOSE_PROVIDER="$provider_native" PODMAN_COMPOSE_WARNING_LOGS=false \
    "$podman_bin" --connection "$machine" compose version >/dev/null 2>&1 || return 1
  TALOS_RUNTIME_SELECTED_KIND="podman"
  TALOS_RUNTIME_SELECTED_BIN="$podman_bin"
  TALOS_RUNTIME_COMPOSE_PROVIDER="$provider"
  TALOS_RUNTIME_PODMAN_MACHINE="$machine"
}

talos_runtime_detect() {
  local preference
  preference="$(talos_runtime_preference)" || return $?
  TALOS_RUNTIME_SELECTED_KIND=""
  TALOS_RUNTIME_SELECTED_BIN=""
  TALOS_RUNTIME_COMPOSE_PROVIDER=""
  TALOS_RUNTIME_PODMAN_MACHINE=""

  case "$preference" in
    docker) talos_runtime_probe_docker ;;
    podman) talos_runtime_probe_podman ;;
    auto)
      if talos_runtime_probe_docker; then
        return 0
      fi
      talos_runtime_probe_podman
      ;;
  esac
}

talos_runtime_ensure() {
  local preference bootstrap
  preference="$(talos_runtime_preference)" || return $?
  if talos_runtime_detect; then
    return 0
  fi
  bootstrap="$ROOT_DIR/scripts/container-runtime/bootstrap.sh"
  if [ ! -f "$bootstrap" ]; then
    echo "TALOS container runtime bootstrap is missing: $bootstrap" >&2
    return 1
  fi
  bash "$bootstrap" ensure "$preference" || return $?
  if ! talos_runtime_detect; then
    echo "The $preference container runtime bootstrap finished, but engine or Compose health is still unavailable." >&2
    echo "Run ./talos doctor for the controlled failure reason." >&2
    return 1
  fi
}

talos_runtime_require_existing() {
  local preference
  preference="$(talos_runtime_preference)" || return $?
  if talos_runtime_detect; then
    return 0
  fi
  echo "No healthy '$preference' container runtime is available for this command." >&2
  echo "Run ./talos up to bootstrap and start the supported runtime first." >&2
  return 1
}

talos_runtime_kind() {
  if [ -z "$TALOS_RUNTIME_SELECTED_KIND" ]; then
    talos_runtime_detect || return $?
  fi
  printf '%s\n' "$TALOS_RUNTIME_SELECTED_KIND"
}

talos_runtime_version() {
  if [ -z "$TALOS_RUNTIME_SELECTED_KIND" ]; then
    talos_runtime_detect || return $?
  fi
  "$TALOS_RUNTIME_SELECTED_BIN" --version
}

talos_runtime_cli() {
  if [ -z "$TALOS_RUNTIME_SELECTED_KIND" ]; then
    talos_runtime_require_existing || return $?
  fi
  if [ "$TALOS_RUNTIME_SELECTED_KIND" = "podman" ]; then
    "$TALOS_RUNTIME_SELECTED_BIN" --connection "$TALOS_RUNTIME_PODMAN_MACHINE" "$@"
    return
  fi
  "$TALOS_RUNTIME_SELECTED_BIN" "$@"
}

talos_runtime_compose() {
  if [ -z "$TALOS_RUNTIME_SELECTED_KIND" ]; then
    talos_runtime_require_existing || return $?
  fi
  case "$TALOS_RUNTIME_SELECTED_KIND" in
    docker)
      "$TALOS_RUNTIME_SELECTED_BIN" compose "$@"
      ;;
    podman)
      local provider_native
      provider_native="$(talos_runtime_native_path "$TALOS_RUNTIME_COMPOSE_PROVIDER")"
      PODMAN_COMPOSE_PROVIDER="$provider_native" PODMAN_COMPOSE_WARNING_LOGS=false \
        "$TALOS_RUNTIME_SELECTED_BIN" --connection "$TALOS_RUNTIME_PODMAN_MACHINE" compose "$@"
      ;;
    *)
      echo 'TALOS container runtime selection is internally inconsistent.' >&2
      return 1
      ;;
  esac
}

talos_runtime_compose_all_profiles() {
  talos_runtime_compose --profile "*" "$@"
}

talos_runtime_doctor() {
  if talos_runtime_detect; then
    local runtime_version compose_version
    runtime_version="$(talos_runtime_version 2>/dev/null | tr -d '\r' | head -n 1)" || runtime_version=""
    compose_version="$(talos_runtime_compose version 2>/dev/null | tr -d '\r' | head -n 1)" || compose_version=""

    printf 'runtime selection   INFO %s\n' "$TALOS_RUNTIME_SELECTED_KIND"

    if [ "$TALOS_RUNTIME_SELECTED_KIND" = "podman" ]; then
      local machine machine_name machine_state machine_provider machine_matches
      local machine_record record_name record_provider
      machine="$TALOS_RUNTIME_PODMAN_MACHINE"
      machine_name="$("$TALOS_RUNTIME_SELECTED_BIN" machine inspect --format '{{.Name}}' "$machine" 2>/dev/null | tr -d '\r' | head -n 1)" || machine_name=""
      machine_state="$("$TALOS_RUNTIME_SELECTED_BIN" machine inspect --format '{{.State}}' "$machine" 2>/dev/null | tr -d '\r' | head -n 1)" || machine_state=""
      machine_provider=""
      machine_matches=0
      while IFS= read -r machine_record; do
        case "$machine_record" in
          name=*'|provider='*)
            record_name="${machine_record%%|provider=*}"
            record_name="${record_name#name=}"
            record_name="${record_name%\*}"
            if [ "$record_name" = "$machine" ]; then
              record_provider="${machine_record#*|provider=}"
              if [[ "$record_provider" =~ ^[A-Za-z0-9_.-]{1,64}$ ]]; then
                machine_provider="$record_provider"
                machine_matches=$((machine_matches + 1))
              fi
            fi
            ;;
        esac
      done < <("$TALOS_RUNTIME_SELECTED_BIN" machine list \
        --format 'name={{.Name}}|provider={{.VMType}}' 2>/dev/null | tr -d '\r')

      if [ "$machine_name" != "$machine" ] || [ "$machine_matches" -ne 1 ]; then
        printf 'runtime provider    WARN unavailable for %s\n' "$machine"
        printf 'runtime machine     WARN expected %s\n' "$machine"
        printf 'machine state       WARN unavailable\n'
        printf 'container runtime   OK   %s\n' "${runtime_version:-version unavailable}"
        printf 'container engine    OK   healthy\n'
        printf 'compose provider    OK   %s\n' "${compose_version:-version unavailable}"
        return 1
      fi

      printf 'runtime provider    INFO %s\n' "$machine_provider"
      printf 'runtime machine     OK   %s\n' "$machine_name"
      if [ "$machine_state" = "running" ]; then
        printf 'machine state       OK   %s\n' "$machine_state"
      else
        printf 'machine state       WARN %s\n' "${machine_state:-unavailable}"
        printf 'container runtime   OK   %s\n' "${runtime_version:-version unavailable}"
        printf 'container engine    OK   healthy\n'
        printf 'compose provider    OK   %s\n' "${compose_version:-version unavailable}"
        return 1
      fi
    else
      printf 'runtime provider    INFO docker\n'
    fi

    printf 'container runtime   OK   %s\n' "${runtime_version:-version unavailable}"
    printf 'container engine    OK   healthy\n'
    printf 'compose provider    OK   %s\n' "${compose_version:-version unavailable}"
    return 0
  fi
  local preference bootstrap
  preference="$(talos_runtime_preference)" || return $?
  bootstrap="$ROOT_DIR/scripts/container-runtime/bootstrap.sh"
  if talos_runtime_is_windows && [ -f "$bootstrap" ]; then
    bash "$bootstrap" doctor "$preference"
    return $?
  fi
  echo 'container runtime   WARN no healthy Docker or Podman runtime detected'
  return 1
}
