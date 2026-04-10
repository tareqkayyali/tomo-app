#!/bin/sh
set -e

echo "=== Tomo Zep CE Startup ==="

# ---------------------------------------------------------------
# 0. Port — Railway injects PORT env var, Zep MUST listen on it
# ---------------------------------------------------------------
ZEP_PORT="${PORT:-8000}"
echo "Port: ${ZEP_PORT}"

# ---------------------------------------------------------------
# 1. Build clean DSN — strip search_path
#    init.sql moves pgvector to public schema, so no search_path
#    manipulation needed. Just clean the DSN.
# ---------------------------------------------------------------
RAW_DSN="${ZEP_STORE_POSTGRES_DSN}"
BASE=$(echo "$RAW_DSN" | cut -d'?' -f1)
QUERY=$(echo "$RAW_DSN" | cut -s -d'?' -f2-)

CLEAN_PARAMS=""
if [ -n "$QUERY" ]; then
  CLEAN_PARAMS=$(echo "$QUERY" | tr '&' '\n' | grep -v '^search_path=' | tr '\n' '&' | sed 's/&$//')
fi
if [ -n "$CLEAN_PARAMS" ]; then
  DSN="${BASE}?${CLEAN_PARAMS}"
else
  DSN="${BASE}"
fi
echo "DSN ready (clean, no search_path)"

# ---------------------------------------------------------------
# 2. Pre-flight DB init — MUST succeed for Zep to work
#    - Moves pgvector from extensions→public schema
#    - Renames conflicting public.users view
#    15s timeout prevents hanging if Supabase is unreachable.
# ---------------------------------------------------------------
echo "Running database init..."
if timeout 15 psql "$DSN" -f /app/init.sql 2>&1; then
  echo "Database init complete."
else
  echo "WARNING: Database init had errors (non-fatal, continuing...)"
fi

# ---------------------------------------------------------------
# 3. Generate config.yaml from env vars
#    Zep 0.25 reads config.yaml from /app/ (NOT env vars).
# ---------------------------------------------------------------
cat > /app/config.yaml <<EOF
store:
  type: postgres
  postgres:
    dsn: "${DSN}"
server:
  port: ${ZEP_PORT}
auth:
  secret: "${ZEP_AUTH_SECRET}"
  required: true
llm:
  model: gpt-3.5-turbo
  openai_api_key: "${ZEP_OPENAI_API_KEY}"
nlp:
  server_url: ""
memory:
  message_window: 12
extractors:
  documents:
    enabled: true
  messages:
    summarizer:
      enabled: true
    entities:
      enabled: true
    intent:
      enabled: false
log:
  level: ${ZEP_LOG_LEVEL:-info}
EOF

echo "config.yaml generated. Starting Zep on port ${ZEP_PORT}..."
cd /app
exec ./zep
