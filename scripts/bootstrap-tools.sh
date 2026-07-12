#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
  cat <<'HELP'
Usage: scripts/bootstrap-tools.sh [--repair] [--verify-only]

Installs or repairs the pinned repository-local Windows toolchain in .tools.
Downloads are verified with the SHA-256 values in scripts/toolchain/manifest.json.
HELP
}

ps_args=()
for arg in "$@"; do
  case "$arg" in
    --repair) ps_args+=("-Repair") ;;
    --verify-only) ps_args+=("-VerifyOnly") ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown bootstrap option: $arg" >&2; usage >&2; exit 2 ;;
  esac
done

if command -v powershell.exe >/dev/null 2>&1; then
  if command -v cygpath >/dev/null 2>&1; then
    ps_script="$(cygpath -w "$SCRIPT_DIR/bootstrap-tools.ps1")"
    ps_root="$(cygpath -w "$WORKSPACE_ROOT")"
  else
    ps_script="$SCRIPT_DIR/bootstrap-tools.ps1"
    ps_root="$WORKSPACE_ROOT"
  fi
  powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "$ps_script" -WorkspaceRoot "$ps_root" "${ps_args[@]}"
  exit $?
fi

if command -v pwsh >/dev/null 2>&1; then
  pwsh -NoLogo -NoProfile -File "$SCRIPT_DIR/bootstrap-tools.ps1" -WorkspaceRoot "$WORKSPACE_ROOT" "${ps_args[@]}"
  exit $?
fi

echo "Native tool bootstrap currently supports Windows PowerShell." >&2
echo "Use ./talos up for the Docker-first cross-platform path." >&2
exit 1
