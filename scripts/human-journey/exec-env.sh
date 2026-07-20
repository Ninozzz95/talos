#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  printf 'TALOS Human Journey env loader requires an env file and command.\n' >&2
  exit 64
fi

env_file="$1"
shift

if [ -z "${TALOS_HJ_ENV_ROOT:-}" ] || [[ "$TALOS_HJ_ENV_ROOT" != /* ]] \
  || [[ "$env_file" != /* ]] || [ -L "$env_file" ] || [ ! -f "$env_file" ]; then
  printf 'TALOS Human Journey env loader received an invalid path.\n' >&2
  exit 64
fi

run_root="$(cd "$TALOS_HJ_ENV_ROOT" && pwd -P)"
env_parent="$(cd "$(dirname "$env_file")" && pwd -P)"
env_name="$(basename "$env_file")"
canonical_env="$env_parent/$env_name"
expected_parent="$run_root/runtime/secrets"
if [ "$env_parent" != "$expected_parent" ] || [[ ! "$env_name" =~ ^[a-z][a-z0-9-]{0,31}\.env$ ]]; then
  printf 'TALOS Human Journey env loader refused a file outside run-owned secrets.\n' >&2
  exit 64
fi

declare -A seen=()
while IFS= read -r line || [ -n "$line" ]; do
  line="${line%$'\r'}"
  case "$line" in
    *=*) ;;
    *)
      printf 'TALOS Human Journey env loader rejected a malformed line.\n' >&2
      exit 64
      ;;
  esac
  name="${line%%=*}"
  value="${line#*=}"
  if [[ ! "$name" =~ ^[A-Z][A-Z0-9_]{0,127}$ ]] || [[ -n "${seen[$name]:-}" ]]; then
    printf 'TALOS Human Journey env loader rejected an invalid or duplicate name.\n' >&2
    exit 64
  fi
  seen[$name]=1
  export "$name=$value"
done < "$canonical_env"

unset TALOS_HJ_ENV_ROOT
exec "$@"
