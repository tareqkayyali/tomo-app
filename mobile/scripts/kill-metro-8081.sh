#!/usr/bin/env bash
# Free the default Metro port (8081) so only one dev server per machine.
# Usage: bash scripts/kill-metro-8081.sh
set -euo pipefail
PIDS=$(lsof -ti :8081 2>/dev/null || true)
if [ -n "${PIDS}" ]; then
  echo "Killing process(es) on port 8081: ${PIDS}"
  kill -9 ${PIDS} 2>/dev/null || true
else
  echo "No process listening on 8081."
fi
