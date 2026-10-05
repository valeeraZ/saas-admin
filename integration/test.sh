#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${AUTH_SOURCE:?Set AUTH_SOURCE to the Auth checkout}"
args=(--auth "$AUTH_SOURCE")
if [[ -n "${CONSOLE_CHROMIUM:-}" ]]; then args+=(--chromium "$CONSOLE_CHROMIUM"); fi
"$AUTH_SOURCE/.venv/bin/python" integration/console.py "${args[@]}"
