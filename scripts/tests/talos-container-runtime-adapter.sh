#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ADAPTER_SOURCE="$SOURCE_ROOT/scripts/container-runtime/runtime.sh"

if [ ! -f "$ADAPTER_SOURCE" ]; then
  echo "Runtime adapter is missing: $ADAPTER_SOURCE" >&2
  exit 1
fi

FIXTURE_PARENT="$(mktemp -d "${TMPDIR:-/tmp}/talos-runtime-adapter.XXXXXX")"
FIXTURE_ROOT="$FIXTURE_PARENT/TALOS Runtime Clone"
trap 'rm -rf "$FIXTURE_PARENT"' EXIT

mkdir -p "$FIXTURE_ROOT/scripts/container-runtime" "$FIXTURE_ROOT/fakebin"
cp "$ADAPTER_SOURCE" "$FIXTURE_ROOT/scripts/container-runtime/runtime.sh"

cat > "$FIXTURE_ROOT/fakebin/docker" <<'SH'
#!/usr/bin/env bash
echo "docker $*" >> "$TALOS_RUNTIME_LOG"
case "${1:-}" in
  --version) echo "Docker version 29.0.0"; exit 0 ;;
  info) [ "${TALOS_FAKE_DOCKER_HEALTHY:-0}" = "1" ]; exit ;;
  compose)
    if [ "${2:-}" = "version" ]; then
      [ "${TALOS_FAKE_DOCKER_COMPOSE:-0}" = "1" ] || exit 1
      echo "Docker Compose version v5.1.4"
    fi
    exit 0
    ;;
esac
exit 0
SH
chmod +x "$FIXTURE_ROOT/fakebin/docker"

run_adapter() {
  local script="$1"
  PATH="$FIXTURE_ROOT/fakebin:/usr/bin:/bin" \
    ROOT_DIR="$FIXTURE_ROOT" \
    TALOS_RUNTIME_LOG="$FIXTURE_ROOT/runtime.log" \
    bash -c "source \"$FIXTURE_ROOT/scripts/container-runtime/runtime.sh\"; $script"
}

: > "$FIXTURE_ROOT/runtime.log"
TALOS_FAKE_DOCKER_HEALTHY=1 TALOS_FAKE_DOCKER_COMPOSE=1 \
  run_adapter 'talos_runtime_ensure; [ "$(talos_runtime_kind)" = docker ]; talos_runtime_cli run --rm alpine true; talos_runtime_compose --profile search up -d --build'
grep -q '^docker info$' "$FIXTURE_ROOT/runtime.log"
grep -q '^docker compose version$' "$FIXTURE_ROOT/runtime.log"
grep -q '^docker run --rm alpine true$' "$FIXTURE_ROOT/runtime.log"
grep -q '^docker compose --profile search up -d --build$' "$FIXTURE_ROOT/runtime.log"

mkdir -p "$FIXTURE_ROOT/.tools/container-runtime/podman/usr/bin" "$FIXTURE_ROOT/.tools/container-runtime/compose"
cat > "$FIXTURE_ROOT/.tools/container-runtime/podman/usr/bin/podman.exe" <<'SH'
#!/usr/bin/env bash
echo "provider=${PODMAN_COMPOSE_PROVIDER-} warning=${PODMAN_COMPOSE_WARNING_LOGS-} podman $*" >> "$TALOS_RUNTIME_LOG"
if [ "${1:-}" = "machine" ]; then
  case "${2:-}" in
    inspect)
      [ "${3:-}" = "--format" ] || exit 1
      [ "${5:-}" = "${TALOS_PODMAN_MACHINE:-talos-machine}" ] || exit 1
      case "${4:-}" in
        '{{.Name}}') printf '%s\n' "${TALOS_PODMAN_MACHINE:-talos-machine}" ;;
        '{{.State}}') printf '%s\n' "${TALOS_FAKE_PODMAN_MACHINE_STATE:-running}" ;;
        *) exit 1 ;;
      esac
      exit 0
      ;;
    list)
      [ "${3:-}" = "--format" ] || exit 1
      [[ "${4:-}" == *'.Name'* ]] || exit 1
      [[ "${4:-}" == *'.VMType'* ]] || exit 1
      [[ "${4:-}" == *'name='* ]] || exit 1
      [[ "${4:-}" == *'provider='* ]] || exit 1
      printf 'name=%s*|provider=%s\n' \
        "${TALOS_PODMAN_MACHINE:-talos-machine}" \
        "${TALOS_FAKE_PODMAN_PROVIDER:-hyperv}"
      exit 0
      ;;
  esac
  exit 1
fi
if [ "${1:-}" = "--connection" ]; then
  [ "${2:-}" = "${TALOS_PODMAN_MACHINE:-talos-machine}" ] || exit 1
  shift 2
fi
case "${1:-}" in
  --version) echo "podman version 6.0.1"; exit 0 ;;
  info) [ "${TALOS_FAKE_PODMAN_HEALTHY:-0}" = "1" ]; exit ;;
  compose)
    if [ "${2:-}" = "version" ]; then
      [ -f "${PODMAN_COMPOSE_PROVIDER:-}" ] || exit 1
      echo "Docker Compose version v5.1.4"
    fi
    exit 0
    ;;
esac
exit 0
SH
printf 'compose fixture\n' > "$FIXTURE_ROOT/.tools/container-runtime/compose/docker-compose.exe"
chmod +x "$FIXTURE_ROOT/.tools/container-runtime/podman/usr/bin/podman.exe"

: > "$FIXTURE_ROOT/runtime.log"
TALOS_FAKE_DOCKER_HEALTHY=0 TALOS_FAKE_DOCKER_COMPOSE=0 TALOS_FAKE_PODMAN_HEALTHY=1 TALOS_CONTAINER_RUNTIME=podman \
  run_adapter 'talos_runtime_ensure; [ "$(talos_runtime_kind)" = podman ]; talos_runtime_cli run --rm alpine true; talos_runtime_compose --profile search logs -f; talos_runtime_compose_all_profiles down'
expected_provider="$FIXTURE_ROOT/.tools/container-runtime/compose/docker-compose.exe"
if command -v cygpath >/dev/null 2>&1; then
  expected_provider="$(cygpath -w "$expected_provider")"
fi
grep -Fq 'podman --connection talos-machine info' "$FIXTURE_ROOT/runtime.log"
grep -Fq 'podman --connection talos-machine run --rm alpine true' "$FIXTURE_ROOT/runtime.log"
grep -Fq "provider=$expected_provider warning=false podman --connection talos-machine compose --profile search logs -f" "$FIXTURE_ROOT/runtime.log"
grep -Fq "podman --connection talos-machine compose --profile * down" "$FIXTURE_ROOT/runtime.log"

cat > "$FIXTURE_ROOT/fakebin/uname" <<'SH'
#!/usr/bin/env bash
echo 'MINGW64_NT-10.0-17763'
SH
chmod +x "$FIXTURE_ROOT/fakebin/uname"

: > "$FIXTURE_ROOT/runtime.log"
doctor_output=''
if ! doctor_output="$(TALOS_FAKE_DOCKER_HEALTHY=0 TALOS_FAKE_DOCKER_COMPOSE=0 \
  TALOS_FAKE_PODMAN_HEALTHY=1 TALOS_FAKE_PODMAN_PROVIDER=hyperv \
  TALOS_FAKE_PODMAN_MACHINE_STATE=running TALOS_CONTAINER_RUNTIME=podman \
  TALOS_PODMAN_MACHINE=talos-doctor run_adapter 'talos_runtime_doctor')"; then
  echo 'Healthy named Podman Doctor unexpectedly failed.' >&2
  printf '%s\n' "$doctor_output" >&2
  exit 1
fi
if ! grep -Fq 'runtime selection   INFO podman' <<< "$doctor_output"; then
  echo 'Healthy named Podman Doctor omitted the selected runtime.' >&2
  printf '%s\n' "$doctor_output" >&2
  exit 1
fi
grep -Fq 'runtime provider    INFO hyperv' <<< "$doctor_output"
grep -Fq 'runtime machine     OK   talos-doctor' <<< "$doctor_output"
grep -Fq 'machine state       OK   running' <<< "$doctor_output"
grep -Fq 'container runtime   OK   podman version 6.0.1' <<< "$doctor_output"
grep -Fq 'container engine    OK   healthy' <<< "$doctor_output"
grep -Fq 'compose provider    OK   Docker Compose version v5.1.4' <<< "$doctor_output"
grep -Fq 'podman machine inspect --format {{.Name}} talos-doctor' "$FIXTURE_ROOT/runtime.log"
grep -Fq 'podman machine inspect --format {{.State}} talos-doctor' "$FIXTURE_ROOT/runtime.log"
grep -Fq 'podman machine list --format name={{.Name}}|provider={{.VMType}}' "$FIXTURE_ROOT/runtime.log"
grep -Fq 'podman --connection talos-doctor info' "$FIXTURE_ROOT/runtime.log"

: > "$FIXTURE_ROOT/runtime.log"
if TALOS_FAKE_DOCKER_HEALTHY=0 TALOS_FAKE_DOCKER_COMPOSE=0 TALOS_FAKE_PODMAN_HEALTHY=1 TALOS_CONTAINER_RUNTIME=docker \
  run_adapter 'talos_runtime_require_existing' >/dev/null 2>&1; then
  echo 'Forced Docker unexpectedly fell back to Podman.' >&2
  exit 1
fi
if grep -Eq 'podman( --connection [^ ]+)? info' "$FIXTURE_ROOT/runtime.log"; then
  echo 'Forced Docker probed or selected Podman.' >&2
  exit 1
fi

: > "$FIXTURE_ROOT/runtime.log"
if TALOS_CONTAINER_RUNTIME=invalid run_adapter 'talos_runtime_ensure' >/dev/null 2>&1; then
  echo 'Invalid runtime preference unexpectedly succeeded.' >&2
  exit 1
fi
if [ -s "$FIXTURE_ROOT/runtime.log" ]; then
  echo 'Invalid runtime preference executed a provider command.' >&2
  exit 1
fi

rm -f "$FIXTURE_ROOT/.tools/container-runtime/podman/usr/bin/podman.exe"
cat > "$FIXTURE_ROOT/scripts/container-runtime/bootstrap.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
echo "bootstrap $*" >> "$TALOS_RUNTIME_LOG"
if [ "${1:-}" = doctor ]; then
  echo 'runtime selection   INFO podman'
  echo 'runtime provider    INFO hyperv'
  echo 'runtime version     INFO podman version 6.0.1'
  echo 'machine state       WARN not_initialized'
  echo 'container engine    WARN unavailable'
  echo 'compose provider    OK   Docker Compose version v5.1.4'
  echo 'runtime elevation   WARN required'
  echo 'runtime restart     WARN required'
  exit 1
fi
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
mkdir -p "$root/.tools/container-runtime/podman/usr/bin" "$root/.tools/container-runtime/compose"
cat > "$root/.tools/container-runtime/podman/usr/bin/podman.exe" <<'PODMAN'
#!/usr/bin/env bash
echo "provider=${PODMAN_COMPOSE_PROVIDER-} podman $*" >> "$TALOS_RUNTIME_LOG"
if [ "${1:-}" = "--connection" ]; then
  [ "${2:-}" = "${TALOS_PODMAN_MACHINE:-talos-machine}" ] || exit 1
  shift 2
fi
case "${1:-}" in
  --version) echo 'podman version 6.0.1'; exit 0 ;;
  info) exit 0 ;;
  compose) echo 'Docker Compose version v5.1.4'; exit 0 ;;
esac
exit 0
PODMAN
chmod +x "$root/.tools/container-runtime/podman/usr/bin/podman.exe"
printf 'compose fixture\n' > "$root/.tools/container-runtime/compose/docker-compose.exe"
SH
chmod +x "$FIXTURE_ROOT/scripts/container-runtime/bootstrap.sh"

: > "$FIXTURE_ROOT/runtime.log"
TALOS_FAKE_DOCKER_HEALTHY=0 TALOS_FAKE_DOCKER_COMPOSE=0 TALOS_CONTAINER_RUNTIME=podman \
  run_adapter 'talos_runtime_ensure; [ "$(talos_runtime_kind)" = podman ]'
if [ "$(grep -c '^bootstrap ensure podman$' "$FIXTURE_ROOT/runtime.log")" -ne 1 ]; then
  echo 'Missing Windows runtime did not bootstrap exactly once.' >&2
  cat "$FIXTURE_ROOT/runtime.log" >&2
  exit 1
fi
grep -q 'podman --connection talos-machine info' "$FIXTURE_ROOT/runtime.log"

rm -f "$FIXTURE_ROOT/.tools/container-runtime/podman/usr/bin/podman.exe"
: > "$FIXTURE_ROOT/runtime.log"
doctor_output=''
if doctor_output="$(TALOS_FAKE_DOCKER_HEALTHY=0 TALOS_FAKE_DOCKER_COMPOSE=0 TALOS_CONTAINER_RUNTIME=podman \
  run_adapter 'talos_runtime_doctor' 2>&1)"; then
  echo 'Unhealthy Windows Doctor unexpectedly succeeded.' >&2
  exit 1
fi
grep -q '^bootstrap doctor podman$' "$FIXTURE_ROOT/runtime.log"
grep -Fq 'runtime selection   INFO podman' <<< "$doctor_output"
grep -Fq 'runtime provider    INFO hyperv' <<< "$doctor_output"
grep -Fq 'runtime restart     WARN required' <<< "$doctor_output"

echo 'Adaptive container runtime adapter contract passed'
