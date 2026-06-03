#!/bin/sh
set -e

echo "[start] Running database migrations..."
node_modules/.bin/prisma migrate deploy

echo "[start] Starting NestJS application..."
exec node dist/src/main.js
