#!/bin/sh
set -eu

if [ -n "${POSTGRES_URL:-}" ]; then
  node node_modules/drizzle-kit/bin.cjs migrate --config=drizzle.config.ts
fi

exec node_modules/.bin/next start -p "${PORT:-3000}" -H "${HOSTNAME:-0.0.0.0}"
