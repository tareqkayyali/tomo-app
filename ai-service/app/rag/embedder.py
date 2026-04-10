"""
Tomo AI Service — Voyage AI Embedder
Direct httpx calls to Voyage AI REST API for embedding generation.

Model: voyage-3-lite (512 dimensions)
Cost: ~$0.0001 per embedding call (free tier: 50M tokens)

Uses httpx instead of a separate SDK to keep dependency footprint small.
"""

from __future__ import annotations

import logging
from typing import Optional

import httpx

from app.config import get_settings

logger = logging.getLogger("tomo-ai.rag.embedder")

VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings"
VOYAGE_MODEL = "voyage-3-lite"
VOYAGE_DIMENSIONS = 512

# Pricing: $0.10 per 1M tokens
VOYAGE_COST_PER_TOKEN = 0.0000001

# Module-level async client (connection pooling)
_client: Optional[httpx.AsyncClient] = None


def _get_client() -> httpx.AsyncClient:
    """Get or create the singleton httpx async client."""
    global _client
    if _client is None or _client.is_closed:
        settings = get_settings()
        _client = httpx.AsyncClient(
            timeout=30.0,
            headers={
                "Authorization": f"Bearer {settings.voyage_api_key}",
                "Content-Type": "application/json",
            },
        )
    return _client


async def embed_query(text: str) -> list[float]:
    """
    Embed a single query text for similarity search.

    Uses input_type='query' which optimizes the embedding for retrieval.

    Returns:
        512-dimensional float vector.

    Raises:
        RuntimeError if embedding fails.
    """
    return (await embed_batch([text], input_type="query"))[0]


async def embed_documents(texts: list[str]) -> list[list[float]]:
    """
    Embed multiple document texts for indexing.

    Uses input_type='document' which optimizes for storage.

    Returns:
        List of 512-dimensional float vectors.
    """
    return await embed_batch(texts, input_type="document")


async def embed_batch(
    texts: list[str],
    input_type: str = "document",
    batch_size: int = 32,
) -> list[list[float]]:
    """
    Embed a batch of texts via Voyage AI.

    Automatically chunks into sub-batches of batch_size to respect API limits.
    Voyage AI allows up to 128 texts per request for voyage-3-lite.

    Args:
        texts: List of texts to embed.
        input_type: "query" for search queries, "document" for stored content.
        batch_size: Max texts per API call (default 32 for safety).

    Returns:
        List of embeddings, one per input text.
    """
    if not texts:
        return []

    client = _get_client()
    all_embeddings: list[list[float]] = []
    total_tokens = 0

    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]

        try:
            response = await client.post(
                VOYAGE_API_URL,
                json={
                    "model": VOYAGE_MODEL,
                    "input": batch,
                    "input_type": input_type,
                },
            )
            response.raise_for_status()
            data = response.json()

            # Extract embeddings (sorted by index)
            embeddings = [item["embedding"] for item in sorted(data["data"], key=lambda x: x["index"])]
            all_embeddings.extend(embeddings)

            # Track usage
            usage = data.get("usage", {})
            total_tokens += usage.get("total_tokens", 0)

        except httpx.HTTPStatusError as e:
            logger.error(f"Voyage AI API error: {e.response.status_code} — {e.response.text}")
            raise RuntimeError(f"Voyage AI embedding failed: {e.response.status_code}") from e
        except Exception as e:
            logger.error(f"Voyage AI embedding error: {e}")
            raise RuntimeError(f"Voyage AI embedding failed: {e}") from e

    cost = total_tokens * VOYAGE_COST_PER_TOKEN
    logger.info(
        f"Voyage AI: embedded {len(texts)} texts, "
        f"{total_tokens} tokens, ${cost:.6f}"
    )

    return all_embeddings


async def close_client() -> None:
    """Gracefully close the httpx client."""
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
        _client = None
