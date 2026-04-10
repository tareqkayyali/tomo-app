"""
Tomo AI Service — PropertyGraphIndex RAG Module
Phase 5: Knowledge graph + hybrid retrieval + Cohere rerank.

Components:
  - embedder: Voyage AI voyage-3-lite embedding generation
  - graph_store: PostgreSQL graph CRUD + traversal (psycopg3)
  - retriever: Hybrid search (vector + graph + text)
  - reranker: Cohere Rerank v3.0 + state-aware athlete boosts
  - sub_question: Multi-hop query decomposition (Haiku)
  - models: Pydantic types for entities, relationships, results

Graph Schema:
  Entity types: concept, exercise, protocol, condition, sport, age_band, body_region
  Relation types: CONTRAINDICATED_FOR, SAFE_ALTERNATIVE_TO, PREREQUISITE_FOR,
    RECOMMENDED_FOR, BELONGS_TO, APPLICABLE_TO, AFFECTS, EVIDENCE_SUPPORTS,
    PART_OF, TRIGGERS
"""

from app.rag.retriever import retrieve
from app.rag.embedder import embed_query, embed_documents, close_client
from app.rag.graph_store import (
    get_contraindication_chain,
    get_entity_by_name,
    search_entities_by_vector,
    search_entities_by_text,
    search_chunks_by_vector,
    traverse_from_entity,
    traverse_2hop,
)

__all__ = [
    "retrieve",
    "embed_query",
    "embed_documents",
    "close_client",
    "get_contraindication_chain",
    "get_entity_by_name",
    "search_entities_by_vector",
    "search_entities_by_text",
    "search_chunks_by_vector",
    "traverse_from_entity",
    "traverse_2hop",
]
