#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FIXTURE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/talos-doctor-ownership.XXXXXX")"
trap 'rm -rf "$FIXTURE_ROOT"' EXIT

mkdir -p "$FIXTURE_ROOT/.tools/bin" "$FIXTURE_ROOT/fakebin"
cp "$ROOT_DIR/talos" "$FIXTURE_ROOT/talos"

cat > "$FIXTURE_ROOT/fakebin/docker" <<'SH'
#!/usr/bin/env bash
if [ "${1:-}" = "--version" ]; then
  echo "Docker version test"
fi
exit 0
SH

cat > "$FIXTURE_ROOT/fakebin/curl" <<'SH'
#!/usr/bin/env bash
exit 1
SH

cat > "$FIXTURE_ROOT/.tools/bin/node" <<'SH'
#!/usr/bin/env bash
echo "browser worker slot FAIL protocol mismatch at http://127.0.0.1:3100"
exit "${TALOS_FAKE_OWNERSHIP_STATUS:-0}"
SH

chmod +x \
  "$FIXTURE_ROOT/talos" \
  "$FIXTURE_ROOT/fakebin/docker" \
  "$FIXTURE_ROOT/fakebin/curl" \
  "$FIXTURE_ROOT/.tools/bin/node"

export PATH="$FIXTURE_ROOT/fakebin:/usr/bin:/bin"

healthy_output="$FIXTURE_ROOT/healthy.log"
TALOS_FAKE_OWNERSHIP_STATUS=0 "$FIXTURE_ROOT/talos" --plain doctor >"$healthy_output" 2>&1
grep -q "browser worker slot FAIL protocol mismatch" "$healthy_output"

blocked_output="$FIXTURE_ROOT/blocked.log"
if TALOS_FAKE_OWNERSHIP_STATUS=42 "$FIXTURE_ROOT/talos" --plain doctor >"$blocked_output" 2>&1; then
  echo "talos doctor succeeded despite a blocking browser-worker ownership fault" >&2
  cat "$blocked_output" >&2
  exit 1
fi
grep -q "browser worker slot FAIL protocol mismatch" "$blocked_output"

echo "TALOS doctor ownership exit contract passed"
