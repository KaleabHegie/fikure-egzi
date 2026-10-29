#!/usr/bin/env bash
# Builds upload-ready bundles for cPanel into deploy/build/:
#   api/  → upload to the Node.js app root (e.g. ~/fikure-api)
#   web/  → upload the contents to the web root (e.g. ~/public_html)
#
# Usage: VITE_API_BASE_URL=https://api.example.org/api/v1 scripts/build-release.sh
set -euo pipefail
cd "$(dirname "$0")/.."

: "${VITE_API_BASE_URL:?Set VITE_API_BASE_URL to the public API URL, e.g. https://api.example.org/api/v1}"

OUT=deploy/build
rm -rf "$OUT" && mkdir -p "$OUT/api" "$OUT/web"

echo "› Building API"
(cd backend && npm run -s prisma:generate && npm run -s build)
cp -r backend/dist backend/prisma backend/prisma.config.ts backend/package.json \
  backend/package-lock.json backend/app.cjs backend/.env.example backend/assets "$OUT/api/"
# The seed script (run via tsx on the server) imports modules from src/;
# ship the sources so it never misses one. The Prisma client under
# src/generated is rebuilt by `npm ci` (postinstall) on the server.
rsync -a --exclude generated backend/src "$OUT/api/"

echo "› Building web (API: $VITE_API_BASE_URL)"
(cd frontend && VITE_API_BASE_URL="$VITE_API_BASE_URL" npm run -s build)
cp -r frontend/dist/. "$OUT/web/"

echo "✓ Release ready in $OUT (api/ and web/)"
