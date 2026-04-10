# Zep CE (Community Edition) — Self-hosted memory server for Tomo AI
# Deployed as a separate Railway service: tomo-zep
#
# Zep provides:
#   - Temporal fact storage + automatic entity extraction (via OpenAI)
#   - Semantic memory search across sessions (via OpenAI embeddings)
#   - Session summarization
#   - Entity graph traversal
#
# REQUIRED environment variables (set in Railway dashboard):
#   ZEP_STORE_POSTGRES_DSN  — Supabase Postgres via PgBouncer (port 6543)
#   ZEP_AUTH_SECRET          — Random 32+ char key for API auth
#   ZEP_OPENAI_API_KEY       — OpenAI API key (required for extraction + embeddings)
#   ZEP_LOG_LEVEL            — info / debug / warn

FROM ghcr.io/getzep/zep:0.25

# Zep CE listens on port 8000 by default
EXPOSE 8000

# Health check — Zep CE exposes /healthz
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:8000/healthz || exit 1
