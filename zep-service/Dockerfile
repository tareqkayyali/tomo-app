# Zep CE (Community Edition) — Self-hosted memory server for Tomo AI
# Deployed as a separate Railway service: tomo-zep
#
# Zep provides:
#   - Temporal fact storage + automatic entity extraction
#   - Semantic memory search across sessions
#   - Session summarization
#   - Entity graph traversal
#
# Environment variables (set in Railway dashboard):
#   ZEP_STORE_POSTGRES_DSN  — Supabase Postgres via PgBouncer (port 6543)
#   ZEP_AUTH_SECRET          — Random 32+ char key for API auth
#   ZEP_MEMORY_SEARCH_SCOPE — Number of sessions to search (default: 12)
#   ZEP_LLM_MODEL           — Model for extraction (default: haiku)

FROM ghcr.io/getzep/zep:0.25

# Zep CE listens on port 8000 by default
EXPOSE 8000

# Health check — Zep CE exposes /healthz
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:8000/healthz || exit 1
