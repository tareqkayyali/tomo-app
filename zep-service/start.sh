#!/bin/sh
set -e

echo "=== Tomo Zep CE Startup ==="

# ---------------------------------------------------------------
# 1. Build CLEAN DSN — strip search_path completely
#    Zep CE 0.25 must use public schema (where pgvector lives).
#    We handle the public.users conflict in init.sql instead.
# ---------------------------------------------------------------
RAW_DSN="${ZEP_STORE_POSTGRES_DSN}"
BASE=$(echo "$RAW_DSN" | cut -d'?' -f1)
QUERY=$(echo "$RAW_DSN" | cut -s -d'?' -f2-)

# Remove search_path from query params (handles any position)
CLEAN_PARAMS=""
if [ -n "$QUERY" ]; then
  CLEAN_PARAMS=$(echo "$QUERY" | tr '&' '\n' | grep -v '^search_path=' | tr '\n' '&' | sed 's/&$//')
fi
if [ -n "$CLEAN_PARAMS" ]; then
  DSN="${BASE}?${CLEAN_PARAMS}"
else
  DSN="${BASE}"
fi
echo "DSN ready (public schema, search_path stripped)"

# ---------------------------------------------------------------
# 2. Pre-flight DB init — rename conflicting objects before Zep
#    psql runs with the clean DSN (no search_path param).
# ---------------------------------------------------------------
echo "Running database init..."
if psql "$DSN" -f /app/init.sql 2>&1; then
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
  port: 8000
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

echo "config.yaml generated. Starting Zep CE..."
cd /app
exec ./zep
