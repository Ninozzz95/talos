#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FIXTURE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/talos-clean-clone.XXXXXX")"
trap 'rm -rf "$FIXTURE_ROOT"' EXIT

mkdir -p "$FIXTURE_ROOT/fakebin"
cp "$ROOT_DIR/talos" "$ROOT_DIR/.env.example" "$ROOT_DIR/docker-compose.yml" "$FIXTURE_ROOT/"

cat > "$FIXTURE_ROOT/fakebin/docker" <<'SH'
#!/usr/bin/env bash
echo "docker $*" >> "$TALOS_FAKE_LOG"
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
export TALOS_FAKE_LOG="$FIXTURE_ROOT/calls.log"
export PATH="$FIXTURE_ROOT/fakebin:/usr/bin:/bin"

"$FIXTURE_ROOT/talos" --plain up >/dev/null

grep -Eq '^TALOS_BROWSER_WORKER_TOKEN=[a-f0-9]{64}$' "$FIXTURE_ROOT/.env"
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

echo "Clean-clone Docker launcher contract passed"
