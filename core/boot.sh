#!/usr/bin/env bash
set -euo pipefail

CORE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PHP_BIN="$CORE_DIR/../.tools/php/php.exe"
if [ ! -x "$PHP_BIN" ]; then
  PHP_BIN="$(command -v php || true)"
fi
if [ -z "$PHP_BIN" ]; then
  echo "PHP is unavailable. Run ../scripts/bootstrap-tools.sh first." >&2
  exit 1
fi

exec "$PHP_BIN" "$CORE_DIR/talos-boot-anim.php"
