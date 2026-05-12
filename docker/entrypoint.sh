#!/bin/sh
set -e

echo "Syncing database schema..."
npx prisma db push --schema=/app/prisma/schema.prisma --accept-data-loss

echo "Running seed (idempotent)..."
TS_NODE_PROJECT=/app/prisma/tsconfig.json npx ts-node --transpile-only /app/prisma/seed.ts || true

echo "Starting application..."
exec node /app/apps/api/dist/index.js
