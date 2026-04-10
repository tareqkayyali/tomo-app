# Zep CE 0.25 — with pre-flight DB init and config generation
#
# REQUIRED env vars (Railway dashboard):
#   ZEP_STORE_POSTGRES_DSN  — Supabase Postgres (port 5432, session mode)
#   ZEP_AUTH_SECRET          — API auth key
#   ZEP_OPENAI_API_KEY       — OpenAI key for extraction + embeddings
#   ZEP_LOG_LEVEL            — info / debug / warn

FROM ghcr.io/getzep/zep:0.25

# Install psql for pre-flight DB schema init
RUN apt-get update && \
    apt-get install -y --no-install-recommends postgresql-client && \
    rm -rf /var/lib/apt/lists/*

COPY init.sql /app/init.sql
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 8000

ENTRYPOINT ["/app/start.sh"]
