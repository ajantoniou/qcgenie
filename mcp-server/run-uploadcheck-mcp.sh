#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env"
  set +a
fi

export UPLOADCHECK_API_BASE_URL="${UPLOADCHECK_API_BASE_URL:-https://qcgenie-api.onrender.com}"
exec node "$ROOT/mcp-server/index.mjs"
