#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

action="${1:-ensure}"
preference="${2:-auto}"

case "$action" in
  ensure) powershell_action='Ensure' ;;
  detect) powershell_action='Detect' ;;
  doctor) powershell_action='Doctor' ;;
  *)
    echo "Unknown container runtime bootstrap action: $action" >&2
    exit 2
    ;;
esac

case "$preference" in
  auto|docker|podman) ;;
  *)
    echo "Container runtime preference must be auto, docker, or podman." >&2
    exit 2
    ;;
esac

case "$(uname -s 2>/dev/null || true)" in
  MINGW*|MSYS*|CYGWIN*) ;;
  *)
    echo 'Automatic container runtime installation currently supports Windows.' >&2
    echo 'Install a supported Docker Engine plus Docker Compose, then rerun ./talos up.' >&2
    exit 1
    ;;
esac

if ! command -v powershell.exe >/dev/null 2>&1; then
  echo 'Windows PowerShell is required for the TALOS container runtime bootstrap.' >&2
  exit 1
fi

ps_script="$SCRIPT_DIR/bootstrap-windows.ps1"
if [ ! -f "$ps_script" ]; then
  echo "Windows container runtime bootstrap is missing: $ps_script" >&2
  exit 1
fi

if command -v cygpath >/dev/null 2>&1; then
  ps_script="$(cygpath -w "$ps_script")"
  ps_root="$(cygpath -w "$ROOT_DIR")"
else
  ps_root="$ROOT_DIR"
fi

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass \
  -File "$ps_script" \
  -WorkspaceRoot "$ps_root" \
  -Action "$powershell_action" \
  -RuntimePreference "$preference"
