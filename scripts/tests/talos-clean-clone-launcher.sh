#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FIXTURE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/talos-clean-clone.XXXXXX")"
trap 'rm -rf "$FIXTURE_ROOT"' EXIT

mkdir -p "$FIXTURE_ROOT/fakebin"
cp "$ROOT_DIR/talos" "$ROOT_DIR/.env.example" "$ROOT_DIR/docker-compose.yml" "$FIXTURE_ROOT/"

cat > "$FIXTURE_ROOT/fakebin/docker" <<'SH'
#!/usr/bin/env bash
echo "profiles=${COMPOSE_PROFILES-} docker $*" >> "$TALOS_FAKE_LOG"
if [ "${TALOS_FAKE_SEARCH_UNHEALTHY:-0}" = "1" ] \
  && [[ " $* " == *" exec -T searxng wget "* || " $* " == *" exec -T searxng python3 "* ]]; then
  exit 1
fi
if [[ " $* " == *" logs --tail=120 searxng "* ]]; then
  echo "SearXNG container logs: health endpoint unavailable"
fi
exit 0
SH

cat > "$FIXTURE_ROOT/fakebin/curl" <<'SH'
#!/usr/bin/env bash
exit 0
SH

cat > "$FIXTURE_ROOT/fakebin/php" <<'SH'
#!/usr/bin/env bash
echo "php-called" >> "$TALOS_FAKE_LOG"
exit 99
SH

chmod +x "$FIXTURE_ROOT/talos" "$FIXTURE_ROOT/fakebin/docker" "$FIXTURE_ROOT/fakebin/curl" "$FIXTURE_ROOT/fakebin/php"
cat > "$FIXTURE_ROOT/fakebin/seq" <<'SH'
#!/usr/bin/env bash
printf '1\n'
SH
chmod +x "$FIXTURE_ROOT/fakebin/seq"
export TALOS_FAKE_LOG="$FIXTURE_ROOT/calls.log"
export PATH="$FIXTURE_ROOT/fakebin:/usr/bin:/bin"

"$FIXTURE_ROOT/talos" --plain up >/dev/null

grep -Eq '^TALOS_BROWSER_WORKER_TOKEN=[a-f0-9]{64}$' "$FIXTURE_ROOT/.env"
grep -Eq '^TALOS_SEARXNG_SECRET=[a-f0-9]{64}$' "$FIXTURE_ROOT/.env"
grep -Eq '^APP_KEY=base64:[A-Za-z0-9+/]{43}=$' "$FIXTURE_ROOT/.env"
case "$(uname -s 2>/dev/null || true)" in
  MINGW*|MSYS*|CYGWIN*) enforce_unix_mode=0 ;;
  *) enforce_unix_mode=1 ;;
esac
if [ "$enforce_unix_mode" -eq 1 ] && command -v stat >/dev/null 2>&1; then
  env_mode="$(stat -c '%a' "$FIXTURE_ROOT/.env" 2>/dev/null || true)"
  if [ -n "$env_mode" ] && [ "$env_mode" != "600" ]; then
    echo "Expected .env permissions 600, got $env_mode" >&2
    exit 1
  fi
fi
if grep -q 'php-called' "$TALOS_FAKE_LOG"; then
  echo "talos up invoked host PHP during a Docker-first clean start" >&2
  exit 1
fi

if ! grep -q -- 'docker compose --profile search rm -sf searxng' "$TALOS_FAKE_LOG"; then
  echo "The unavailable search provider did not reconcile a stale SearXNG service" >&2
  exit 1
fi
if grep -q -- 'docker compose --profile search up -d --build' "$TALOS_FAKE_LOG"; then
  echo "The unavailable search provider enabled the Compose search profile for startup" >&2
  exit 1
fi

: > "$TALOS_FAKE_LOG"
printf 'RESET\n' | "$FIXTURE_ROOT/talos" --plain fresh >/dev/null
grep -q -- 'docker compose --profile \* down -v' "$TALOS_FAKE_LOG"

: > "$TALOS_FAKE_LOG"
sed -i.bak 's/^TALOS_WEB_SEARCH_PROVIDER=.*/TALOS_WEB_SEARCH_PROVIDER=searxng/' "$FIXTURE_ROOT/.env"
rm -f "$FIXTURE_ROOT/.env.bak"
"$FIXTURE_ROOT/talos" --plain up >/dev/null
grep -q -- 'docker compose --profile search up -d --build' "$TALOS_FAKE_LOG"
grep -q -- 'docker compose --profile search exec -T searxng wget --spider --quiet --timeout=5 --tries=1 http://127.0.0.1:8080/healthz' "$TALOS_FAKE_LOG"
grep -q -- 'docker compose --profile search exec -T searxng python3 -c' "$TALOS_FAKE_LOG"

: > "$TALOS_FAKE_LOG"
sed -i.bak 's/^TALOS_WEB_SEARCH_PROVIDER=.*/TALOS_WEB_SEARCH_PROVIDER=unavailable/' "$FIXTURE_ROOT/.env"
rm -f "$FIXTURE_ROOT/.env.bak"
"$FIXTURE_ROOT/talos" --plain up >/dev/null
if ! grep -q -- 'docker compose --profile search rm -sf searxng' "$TALOS_FAKE_LOG"; then
  echo "Provider switch to unavailable did not reconcile stale SearXNG before up" >&2
  exit 1
fi
if ! grep -q -- 'docker compose up -d --build' "$TALOS_FAKE_LOG"; then
  echo "Provider switch to unavailable did not start the default stack" >&2
  exit 1
fi
reconcile_line="$(grep -n -- 'docker compose --profile search rm -sf searxng' "$TALOS_FAKE_LOG" | head -n 1 | cut -d: -f1)"
start_line="$(grep -n -- 'docker compose up -d --build' "$TALOS_FAKE_LOG" | head -n 1 | cut -d: -f1)"
if [ -z "$reconcile_line" ] || [ -z "$start_line" ] || [ "$reconcile_line" -ge "$start_line" ]; then
  echo "Provider switch reconciliation did not happen before the default stack started" >&2
  exit 1
fi

: > "$TALOS_FAKE_LOG"
COMPOSE_PROFILES=search,observability "$FIXTURE_ROOT/talos" --plain up >/dev/null
if grep -q -- 'docker compose --profile search rm -sf searxng' "$TALOS_FAKE_LOG"; then
  echo "Explicit COMPOSE_PROFILES=search intent was not preserved" >&2
  exit 1
fi
grep -q -- 'profiles=search,observability docker compose up -d --build' "$TALOS_FAKE_LOG"

: > "$TALOS_FAKE_LOG"
sed -i.bak 's/^TALOS_WEB_SEARCH_PROVIDER=.*/TALOS_WEB_SEARCH_PROVIDER=searxng/' "$FIXTURE_ROOT/.env"
rm -f "$FIXTURE_ROOT/.env.bak"
"$FIXTURE_ROOT/talos" --plain up >/dev/null
"$FIXTURE_ROOT/talos" --plain down >/dev/null
"$FIXTURE_ROOT/talos" --plain logs >/dev/null

if ! grep -q -- 'docker compose --profile search exec -T searxng wget --spider --quiet --timeout=5 --tries=1 http://127.0.0.1:8080/healthz' "$TALOS_FAKE_LOG"; then
  echo "SearXNG launcher did not wait for the internal /healthz endpoint" >&2
  exit 1
fi

for command in 'up -d --build' 'logs -f'; do
  if ! grep -q -- "docker compose --profile search $command" "$TALOS_FAKE_LOG"; then
    echo "SearXNG launcher command did not activate the search profile: $command" >&2
    exit 1
  fi
done
if ! grep -q -- 'docker compose --profile \* down' "$TALOS_FAKE_LOG"; then
  echo "SearXNG launcher did not remove all Compose profiles during down" >&2
  exit 1
fi

: > "$TALOS_FAKE_LOG"
sed -i.bak 's/^TALOS_WEB_SEARCH_PROVIDER=.*/TALOS_WEB_SEARCH_PROVIDER=unavailable/' "$FIXTURE_ROOT/.env"
rm -f "$FIXTURE_ROOT/.env.bak"
COMPOSE_PROFILES=observability "$FIXTURE_ROOT/talos" --plain up >/dev/null
grep -q -- 'profiles=observability docker compose --profile search rm -sf searxng' "$TALOS_FAKE_LOG"
grep -q -- 'profiles=observability docker compose up -d --build' "$TALOS_FAKE_LOG"

: > "$TALOS_FAKE_LOG"
sed -i.bak 's/^TALOS_WEB_SEARCH_PROVIDER=.*/TALOS_WEB_SEARCH_PROVIDER=searxng/' "$FIXTURE_ROOT/.env"
rm -f "$FIXTURE_ROOT/.env.bak"
COMPOSE_PROFILES=search,observability "$FIXTURE_ROOT/talos" --plain up >/dev/null
if grep -q -- 'docker compose --profile search' "$TALOS_FAKE_LOG"; then
  echo "The launcher changed explicit COMPOSE_PROFILES=search intent" >&2
  exit 1
fi
grep -q -- 'profiles=search,observability docker compose up -d --build' "$TALOS_FAKE_LOG"

: > "$TALOS_FAKE_LOG"
failure_output="$FIXTURE_ROOT/failure.log"
if TALOS_FAKE_SEARCH_UNHEALTHY=1 "$FIXTURE_ROOT/talos" --plain up >"$failure_output" 2>&1; then
  echo "SearXNG launcher succeeded despite an unhealthy search endpoint" >&2
  exit 1
fi
grep -q -- 'SearXNG readiness failed: http://127.0.0.1:8080/healthz' "$failure_output"
grep -q -- 'SearXNG container logs: health endpoint unavailable' "$failure_output"

echo "Clean-clone Docker launcher contract passed"
