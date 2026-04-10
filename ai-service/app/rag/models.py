"""
Tomo AI Service — RAG Pydantic Models
Entity, relationship, and retrieval result types for the PropertyGraphIndex.

7 entity types:
  concept, exercise, protocol, condition, sport, age_band, body_region

10 relation types:
  CONTRAINDICATED_FOR, SAFE_ALTERNATIVE_TO, PREREQUISITE_FOR,
  RECOMMENDED_FOR, BELONGS_TO, APPLICABLE_TO, AFFECTS,
  EVIDENCE_SUPPORTS, PART_OF, TRIGGERS
"""

from __future__ import annotations

from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


# ── Enums ─────────────────────────────────────────────────────────────────────

class EntityType(str, Enum):
    CONCEPT = "concept"
    EXERCISE = "exercise"
    PROTOCOL = "protocol"
    CONDITION = "condition"
    SPORT = "sport"
    AGE_BAND = "age_band"
    BODY_REGION = "body_region"


class RelationType(str, Enum):
    CONTRAINDICATED_FOR = "CONTRAINDICATED_FOR"
    SAFE_ALTERNATIVE_TO = "SAFE_ALTERNATIVE_TO"
    PREREQUISITE_FOR = "PREREQUISITE_FOR"
    RECOMMENDED_FOR = "RECOMMENDED_FOR"
    BELONGS_TO = "BELONGS_TO"
    APPLICABLE_TO = "APPLICABLE_TO"
    AFFECTS = "AFFECTS"
    EVIDENCE_SUPPORTS = "EVIDENCE_SUPPORTS"
    PART_OF = "PART_OF"
    TRIGGERS = "TRIGGERS"


# ── Entity Models ─────────────────────────────────────────────────────────────

class KnowledgeEntity(BaseModel):
    """A node in the knowledge graph."""
    id: Optional[str] = None
    entity_type: EntityType
    name: str                    # Machine slug: "mid_phv"
    display_name: str            # Human: "Mid-PHV (Peak Height Velocity)"
    description: str = ""
    properties: dict = Field(default_factory=dict)
    source_chunk_ids: list[str] = Field(default_factory=list)
    similarity: Optional[float] = None  # Set by vector search


class KnowledgeRelationship(BaseModel):
    """An edge in the knowledge graph."""
    id: Optional[str] = None
    source_entity_id: str
    target_entity_id: str
    relation_type: RelationType
    properties: dict = Field(default_factory=dict)
    source_chunk_ids: list[str] = Field(default_factory=list)
    weight: float = 1.0


# ── Retrieval Result Models ───────────────────────────────────────────────────

class GraphTraversalResult(BaseModel):
    """Result from a single graph traversal hop."""
    relationship_id: str
    relation_type: str
    related_entity: KnowledgeEntity
    weight: float = 1.0


class ChunkResult(BaseModel):
    """Result from vector/text search on knowledge chunks."""
    chunk_id: str
    domain: str
    title: str
    content: str
    athlete_summary: str
    evidence_grade: Optional[str] = None
    similarity: float = 0.0


class RetrievalResult(BaseModel):
    """
    Unified retrieval result combining entities, graph paths, and chunks.
    Used by the reranker to produce the final scored list.
    """
    source: str  # "vector_entity" | "graph_traversal" | "chunk_vector" | "text_search"
    entity: Optional[KnowledgeEntity] = None
    chunk: Optional[ChunkResult] = None
    graph_path: list[GraphTraversalResult] = Field(default_factory=list)
    score: float = 0.0  # Composite score after reranking
    text_for_rerank: str = ""  # Flattened text for Cohere reranker


class RankedResult(BaseModel):
    """Final ranked result after Cohere + state-aware reranking."""
    result: RetrievalResult
    cohere_score: float = 0.0
    state_boost: float = 1.0
    final_score: float = 0.0


class GraphRAGContext(BaseModel):
    """
    Formatted RAG context for injection into agent system prompt.
    This is what flows through TomoChatState.rag_context.
    """
    formatted_text: str  # Ready for prompt injection
    entity_count: int = 0
    chunk_count: int = 0
    graph_hops: int = 0
    sub_questions: list[str] = Field(default_factory=list)
    retrieval_cost_usd: float = 0.0  # Embedding + rerank cost


# ── Seed Data Models ──────────────────────────────────────────────────────────

class EntitySeed(BaseModel):
    """Entity definition for the seed script."""
    entity_type: EntityType
    name: str
    display_name: str
    description: str
    properties: dict = Field(default_factory=dict)
    source_chunk_ids: list[str] = Field(default_factory=list)


class RelationshipSeed(BaseModel):
    """Relationship definition for the seed script."""
    source_name: str       # Entity name (resolved to ID at insert time)
    target_name: str       # Entity name (resolved to ID at insert time)
    relation_type: RelationType
    properties: dict = Field(default_factory=dict)
    weight: float = 1.0
