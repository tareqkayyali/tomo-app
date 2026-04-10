# Zep CE (Community Edition) — Self-hosted memory server for Tomo AI
# Deployed as a separate Railway service: tomo-zep
#
# Zep 0.25 reads config from a YAML file, NOT env vars.
# Our entrypoint.sh generates config.yaml from Railway env vars at runtime.
#
# REQUIRED environment variables (set in Railway dashboard):
#   ZEP_STORE_POSTGRES_DSN  — Supabase Postgres via PgBouncer (port 6543)
#   ZEP_AUTH_SECRET          — Random 32+ char key for API auth
#   ZEP_OPENAI_API_KEY       — OpenAI API key (required for extraction + embeddings)
#   ZEP_LOG_LEVEL            — info / debug / warn

FROM ghcr.io/getzep/zep:0.25

# Copy our entrypoint that generates config.yaml from env vars
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:8000/healthz || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
