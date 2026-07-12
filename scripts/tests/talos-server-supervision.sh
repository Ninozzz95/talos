#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FIXTURE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/talos-server-supervision.XXXXXX")"
trap 'rm -rf "$FIXTURE_ROOT"' EXIT

mkdir -p "$FIXTURE_ROOT/bin"

cat > "$FIXTURE_ROOT/bin/php-fpm" <<'SH'
#!/usr/bin/env bash
sleep 0.2
exit 17
SH

cat > "$FIXTURE_ROOT/bin/nginx" <<'SH'
#!/usr/bin/env bash
trap 'printf "%s\n" stopped > "$TALOS_NGINX_STOP_FILE"; exit 0' TERM INT
while :; do sleep 0.1; done
SH

chmod +x "$FIXTURE_ROOT/bin/php-fpm" "$FIXTURE_ROOT/bin/nginx"
export TALOS_NGINX_STOP_FILE="$FIXTURE_ROOT/nginx-stopped"

set +e
PATH="$FIXTURE_ROOT/bin:$PATH" sh "$ROOT_DIR/docker/talos-server.sh"
status=$?
set -e

if [ "$status" -ne 17 ]; then
  echo "Expected PHP-FPM exit code 17, got $status" >&2
  exit 1
fi

for _ in $(seq 1 20); do
  [ -f "$TALOS_NGINX_STOP_FILE" ] && break
  sleep 0.1
done

if [ ! -f "$TALOS_NGINX_STOP_FILE" ]; then
  echo "The TALOS web supervisor did not terminate nginx." >&2
  exit 1
fi

echo "TALOS web process supervision contract passed"
