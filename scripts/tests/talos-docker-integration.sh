#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose is required for the TALOS deployment integration test." >&2
  exit 1
fi

cleanup() {
  docker compose down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

rm -f .env
export TALOS_NO_BOOT=1

bash ./talos --plain up
curl --fail --silent --show-error --retry 12 --retry-all-errors --retry-delay 2 \
  http://127.0.0.1:8088/readyz | grep -q '"ready":true'

docker compose exec -T talos sh -lc \
  'printf "%s\n" "talos-docker-integration" > storage/app/talos/integration-marker'
docker compose exec -T talos php artisan migrate:status --no-ansi >/dev/null

docker compose down
bash ./talos --plain up
docker compose exec -T talos test -f storage/app/talos/integration-marker
curl --fail --silent --show-error --retry 12 --retry-all-errors --retry-delay 2 \
  http://127.0.0.1:8088/readyz | grep -q '"ready":true'

echo "TALOS Docker deployment integration passed"
