#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [ ! -f .env.local ]; then
  echo "Create .env.local from .env.local.example and fill in its values first." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env.local
set +a

: "${BROWSER_OWNER_EMAIL:?Set BROWSER_OWNER_EMAIL in .env.local}"
: "${BROWSER_OWNER_PASSWORD:?Set BROWSER_OWNER_PASSWORD in .env.local}"
: "${SESSION_SECRET:?Set SESSION_SECRET in .env.local}"
: "${BROWSER_FRONTEND_ORIGIN:?Set BROWSER_FRONTEND_ORIGIN in .env.local}"

if [ "${#BROWSER_OWNER_PASSWORD}" -lt 12 ]; then
  echo "BROWSER_OWNER_PASSWORD must be at least 12 characters." >&2
  exit 1
fi
if [ "${#SESSION_SECRET}" -lt 32 ]; then
  echo "SESSION_SECRET must be at least 32 characters." >&2
  exit 1
fi

export NODE_ENV=production
export BROWSER_LOCAL_MODE=true
export HOST=127.0.0.1
export PORT=8080
export VNC_HOST=127.0.0.1
export VNC_PORT=5900
export BASE_PATH=/

PORT=10000 BASE_PATH=/ NODE_ENV=production \
  pnpm --filter @workspace/remote-browser run build
pnpm --filter @workspace/api-server run build
exec node --enable-source-maps artifacts/api-server/dist/index.mjs
