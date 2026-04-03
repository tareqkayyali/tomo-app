#!/bin/bash
# deploy-frontend.sh — Build Expo web export and copy into backend/public/webapp/
# This makes the Next.js backend serve the Tomo frontend from the same origin.
#
# Usage:
#   cd backend && ./scripts/deploy-frontend.sh
#
# After running, the frontend is served at / and all SPA routes work.
# API routes (/api/*) and admin (/admin/*) are unaffected.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
MOBILE_DIR="$BACKEND_DIR/../mobile"
WEBAPP_DIR="$BACKEND_DIR/public/webapp"

echo "=== Tomo Frontend Deploy ==="
echo "Mobile dir: $MOBILE_DIR"
echo "Target: $WEBAPP_DIR"

# 1. Build Expo web export
echo ""
echo "[1/3] Building Expo web export..."
cd "$MOBILE_DIR"
npx expo export --platform web

# 2. Clean old webapp dir
echo ""
echo "[2/3] Copying to backend/public/webapp/..."
rm -rf "$WEBAPP_DIR"
mkdir -p "$WEBAPP_DIR"

# 3. Copy dist contents (excluding .vercel and vercel.json)
cp -r "$MOBILE_DIR/dist/index.html" "$WEBAPP_DIR/"
cp -r "$MOBILE_DIR/dist/_expo" "$WEBAPP_DIR/"
cp -r "$MOBILE_DIR/dist/assets" "$WEBAPP_DIR/"
cp -r "$MOBILE_DIR/dist/fonts" "$WEBAPP_DIR/" 2>/dev/null || true
cp -r "$MOBILE_DIR/dist/favicon.ico" "$WEBAPP_DIR/" 2>/dev/null || true
cp -r "$MOBILE_DIR/dist/metadata.json" "$WEBAPP_DIR/" 2>/dev/null || true

echo ""
echo "[3/3] Done! Frontend files:"
ls -la "$WEBAPP_DIR"
echo ""
echo "Frontend will be served from the Next.js backend."
echo "API routes (/api/*) and admin (/admin/*) are unaffected."
