#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)"

case "$1" in
  local)
    cp "$DIR/.env.local.local" "$DIR/.env.local"
    echo "Switched to LOCAL Supabase"
    ;;
  prod|production)
    cp "$DIR/.env.local.production" "$DIR/.env.local"
    echo "Switched to PRODUCTION Supabase"
    ;;
  *)
    echo "Usage: $0 {local|prod}"
    exit 1
    ;;
esac

echo "Restart your dev server for changes to take effect."
