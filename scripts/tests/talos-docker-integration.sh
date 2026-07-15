#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose is required for the TALOS deployment integration test." >&2
  exit 1
fi

ENV_BACKUP=""
ENV_EXISTED=0
SMOKE_STATE=""

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

preserve_env() {
  if [ -f .env ]; then
    ENV_EXISTED=1
    ENV_BACKUP="$(mktemp)"
    if ! cp -p .env "$ENV_BACKUP"; then
      rm -f "$ENV_BACKUP"
      ENV_BACKUP=""
      return 1
    fi
    rm -f .env
  fi
}

prepare_env() {
  (umask 077 && cp .env.example .env)
  sed -i "s/^TALOS_BROWSER_WORKER_TOKEN=.*/TALOS_BROWSER_WORKER_TOKEN=${TALOS_BROWSER_WORKER_TOKEN}/" .env
  sed -i "s/^TALOS_BROWSER_HMI_MIN_MODE=.*/TALOS_BROWSER_HMI_MIN_MODE=confirm_every_interaction/" .env
  sed -i "s/^TALOS_WEB_SEARCH_PROVIDER=.*/TALOS_WEB_SEARCH_PROVIDER=searxng/" .env
  sed -i "s/^TALOS_ADMIN_NAME=.*/TALOS_ADMIN_NAME=TALOS Docker Smoke/" .env
  sed -i "s/^TALOS_ADMIN_EMAIL=.*/TALOS_ADMIN_EMAIL=talos-docker-smoke@example.test/" .env
  sed -i "s/^TALOS_ADMIN_PASSWORD=.*/TALOS_ADMIN_PASSWORD=${TALOS_ADMIN_PASSWORD}/" .env
  chmod 600 .env
}

dump_compose_diagnostics() {
  echo "TALOS Compose status:" >&2
  docker compose --profile "*" ps >&2 || true
  echo "TALOS Compose logs:" >&2
  docker compose --profile "*" logs --no-color --tail=200 >&2 || true
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  if [ "$status" -ne 0 ]; then
    dump_compose_diagnostics
  fi
  if ! docker compose --profile "*" down -v --remove-orphans >/dev/null 2>&1; then
    echo "TALOS Compose teardown failed." >&2
    [ "$status" -ne 0 ] || status=1
  fi
  if [ -n "$(docker compose --profile "*" ps -aq 2>/dev/null || true)" ]; then
    echo "TALOS Compose teardown left project containers behind." >&2
    [ "$status" -ne 0 ] || status=1
  fi
  if [ "$ENV_EXISTED" -eq 1 ]; then
    if [ -n "$ENV_BACKUP" ]; then
      if ! cp -p "$ENV_BACKUP" .env; then
        echo "Could not restore the pre-existing root .env." >&2
        [ "$status" -ne 0 ] || status=1
      fi
    fi
  else
    rm -f .env
  fi
  if [ -n "$ENV_BACKUP" ]; then
    rm -f "$ENV_BACKUP"
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

preserve_env
export COMPOSE_PROJECT_NAME="talos-integration-$$"
export COMPOSE_PROFILES=search
export TALOS_NO_BOOT=1
export TALOS_BROWSER_WORKER_TOKEN="$(generate_strong_token)"
export TALOS_ADMIN_PASSWORD="TalosSmoke-${TALOS_BROWSER_WORKER_TOKEN:0:32}"
prepare_env

docker compose --profile search config >/dev/null
bash ./talos --plain up
curl --fail --silent --show-error --retry 12 --retry-all-errors --retry-delay 2 \
  http://127.0.0.1:8088/readyz | grep -q '"ready":true'
docker compose --profile search exec -T searxng wget --spider --quiet --timeout=5 --tries=1 \
  http://127.0.0.1:8080/healthz
docker compose --profile search exec -T searxng python3 -c \
  'import json,urllib.request; payload=json.load(urllib.request.urlopen("http://127.0.0.1:8080/search?q=talos&format=json", timeout=5)); assert isinstance(payload, dict) and isinstance(payload.get("results"), list)'
docker compose exec -T browser-worker node -e \
  'fetch("http://127.0.0.1:3100/ready",{headers:{"x-talos-worker-token":process.env.TALOS_BROWSER_WORKER_TOKEN}}).then(async response=>{const payload=await response.json();if(!response.ok||payload?.data?.status!=="ready"||payload?.data?.runtime!=="chromium"||payload?.data?.protocols?.hmi!=="talos_browser_hmi_runtime_v2.1.0")process.exit(1)}).catch(error=>{console.error(error);process.exit(1)})'

SMOKE_STATE="$(docker compose exec -T \
  -e TALOS_SMOKE_MODE=exercise \
  -e TALOS_SMOKE_BASE_URL=http://127.0.0.1:8088 \
  talos php < scripts/tests/talos-docker-browser-smoke.php)"
printf '%s' "$SMOKE_STATE" | docker compose exec -T talos php -r \
  '$state=json_decode(stream_get_contents(STDIN), true, 32, JSON_THROW_ON_ERROR); exit(is_array($state) && ($state["schema_version"] ?? null) === "talos_docker_browser_smoke_v1" ? 0 : 1);'

docker compose exec -T talos sh -lc \
  'printf "%s\n" "talos-docker-integration" > storage/app/talos/integration-marker'
docker compose exec -T talos php artisan migrate:status --no-ansi >/dev/null

docker compose --profile "*" down
if [ -n "$(docker compose --profile "*" ps -q searxng)" ]; then
  echo "SearXNG is still running after all-profile teardown." >&2
  exit 1
fi
bash ./talos --plain up
docker compose exec -T talos test -f storage/app/talos/integration-marker
curl --fail --silent --show-error --retry 12 --retry-all-errors --retry-delay 2 \
  http://127.0.0.1:8088/readyz | grep -q '"ready":true'
docker compose exec -T \
  -e TALOS_SMOKE_MODE=verify-reload \
  -e TALOS_SMOKE_BASE_URL=http://127.0.0.1:8088 \
  -e "TALOS_SMOKE_STATE=$SMOKE_STATE" \
  talos php < scripts/tests/talos-docker-browser-smoke.php

echo "TALOS Docker deployment integration passed"
