#!/bin/sh
# Generate Zep CE config.yaml from Railway environment variables at runtime.
# v3 — renamed to bust Docker cache

set -e

echo "=== Tomo Zep CE Startup ==="
echo "Generating config.yaml..."

# Debug: show which env vars are set (masked)
echo "ZEP_STORE_POSTGRES_DSN: ${ZEP_STORE_POSTGRES_DSN:+SET}"
echo "ZEP_AUTH_SECRET: ${ZEP_AUTH_SECRET:+SET}"
echo "ZEP_OPENAI_API_KEY: ${ZEP_OPENAI_API_KEY:+SET}"

# Write config to Zep's working directory
cat > /app/config.yaml <<EOF
store:
  type: postgres
  postgres:
    dsn: "${ZEP_STORE_POSTGRES_DSN}"
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

echo "config.yaml written to /app/config.yaml"
echo "Listing /app/ contents:"
ls -la /app/

echo "Starting Zep CE..."
cd /app
exec ./zep
