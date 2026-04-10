#!/bin/sh
# Generate Zep CE config.yaml from Railway environment variables at runtime.
# Zep 0.25 reads config.yaml from its working directory /app/

set -e

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

echo "=== Zep config.yaml generated ==="
echo "Store: postgres"
echo "Port: 8000"
echo "Auth: required"
echo "Starting Zep CE 0.25..."

cd /app
exec ./zep
