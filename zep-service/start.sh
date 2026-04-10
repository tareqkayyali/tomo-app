#!/bin/sh
set -e

echo "=== Tomo Zep CE Startup ==="

# 1. Force search_path=zep,public in DSN
#    - If DSN already has search_path=zep (without ,public), replace it
#    - If DSN has no search_path, append it
DSN="${ZEP_STORE_POSTGRES_DSN}"

# Strip any existing search_path param (handles both ?search_path= and &search_path=)
CLEAN_DSN=$(echo "$DSN" | sed -E 's/[&?]search_path=[^&]*//')
# Re-add the correct search_path
case "$CLEAN_DSN" in
  *\?*) DSN="${CLEAN_DSN}&search_path=zep,public" ;;
  *)    DSN="${CLEAN_DSN}?search_path=zep,public" ;;
esac
echo "DSN configured: search_path=zep,public (forced)"

# 2. Run pre-flight DB init (create schema, handle conflicts)
echo "Running database init..."
if psql "${ZEP_STORE_POSTGRES_DSN}" -f /app/init.sql 2>&1; then
  echo "Database init complete."
else
  echo "WARNING: Database init had errors (non-fatal, continuing...)"
fi

# 3. Generate config.yaml from env vars
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
