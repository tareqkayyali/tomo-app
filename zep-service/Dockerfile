# Zep CE (Community Edition) — Self-hosted memory server for Tomo AI
# v3 — renamed entrypoint to bust Docker cache
#
# REQUIRED environment variables (set in Railway dashboard):
#   ZEP_STORE_POSTGRES_DSN  — Supabase Postgres via PgBouncer (port 6543)
#   ZEP_AUTH_SECRET          — Random 32+ char key for API auth
#   ZEP_OPENAI_API_KEY       — OpenAI API key (required for extraction + embeddings)
#   ZEP_LOG_LEVEL            — info / debug / warn

FROM ghcr.io/getzep/zep:0.25

COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 8000

ENTRYPOINT ["/app/start.sh"]
