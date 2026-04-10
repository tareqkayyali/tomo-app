#!/bin/sh
# Generate Zep CE config.yaml from Railway environment variables at runtime.
# Zep 0.25 reads config from YAML, not env vars.

set -e

cat > /app/config.yaml <<EOF
store:
  type: postgres
  postgres:
    dsn: "${ZEP_STORE_POSTGRES_DSN}"
auth:
  secret: "${ZEP_AUTH_SECRET}"
  required: true
llm:
  model: gpt-3.5-turbo
  openai_api_key: "${ZEP_OPENAI_API_KEY}"
memory:
  message_window: 12
server:
  port: 8000
log:
  level: ${ZEP_LOG_LEVEL:-info}
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
EOF

echo "Zep config generated. Starting Zep CE..."
exec /app/zep --config /app/config.yaml
