/**
 * RAG Retriever — Vector search over the knowledge base
 *
 * Builds a natural language query from structured athlete data,
 * embeds it, and searches rag_knowledge_chunks via pgvector.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { embedText } from './embedder';
import type { RecType } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RetrievalQuery {
  rec_type: RecType;
  phv_stage: string;        // 'PRE' | 'CIRCA' | 'POST'
  age_group: string;        // 'U13' | 'U15' | 'U17' | 'U19' | 'ADULT'
  acwr?: number | null;
  hrv_delta_pct?: number | null;
  dual_load_index?: number | null;
  sport?: string;
  specific_concern?: string;
  top_k?: number;
}

export interface KnowledgeChunk {
  chunk_id: string;
  domain: string;
  title: string;
  content: string;
  athlete_summary: string;
  coach_summary: string;
  primary_source: string;
  evidence_grade: string;
  similarity: number;
}

// ---------------------------------------------------------------------------
// Query text builder
// ---------------------------------------------------------------------------

const REC_TYPE_CONTEXT: Record<string, string> = {
  READINESS:      'athlete readiness HRV autonomic nervous system recovery',
  LOAD_WARNING:   'training load ACWR injury risk spike overtraining',
  RECOVERY:       'post-training recovery sleep protocols restoration',
  DEVELOPMENT:    'performance development skill acquisition speed power',
  ACADEMIC:       'academic stress cognitive load student-athlete dual-load',
  CV_OPPORTUNITY: 'talent identification recruiting benchmarks testing',
  TRIANGLE_ALERT: 'coach parent athlete communication burnout motivation',
  MOTIVATION:     'motivation achievement milestone progress self-efficacy',
};

function buildQueryText(query: RetrievalQuery): string {
  const parts: string[] = [];

  // Core rec type context
  parts.push(REC_TYPE_CONTEXT[query.rec_type] ?? query.rec_type.toLowerCase());

  // PHV context
  if (query.phv_stage === 'CIRCA') {
    parts.push('peak height velocity growth phase youth development');
  }

  // Numeric signals that enrich the query
  if (query.acwr != null && query.acwr > 1.3) {
    parts.push('load spike acute chronic workload injury prevention');
  }
  if (query.hrv_delta_pct != null && query.hrv_delta_pct < -15) {
    parts.push('HRV suppression fatigue parasympathetic autonomic');
  }
  if (query.dual_load_index != null && query.dual_load_index > 75) {
    parts.push('combined academic athletic stress cortisol burnout');
  }

  // Sport context
  if (query.sport === 'football' || query.sport === 'soccer') {
    parts.push('football soccer intermittent sprint repeated effort');
  } else if (query.sport) {
    parts.push(query.sport);
  }

  // Specific concern override
  if (query.specific_concern) {
    parts.push(query.specific_concern);
  }

  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Main retrieval function
// ---------------------------------------------------------------------------

/**
 * Retrieve the most relevant knowledge chunks for a recommendation context.
 */
export async function retrieveKnowledgeChunks(
  query: RetrievalQuery
): Promise<KnowledgeChunk[]> {
  // 1. Build query text from structured data
  const queryText = buildQueryText(query);

  // 2. Embed the query
  const queryEmbedding = await embedText(queryText);

  // 3. Call the match function with metadata pre-filters
  const db = supabaseAdmin();
  const { data, error } = await (db as any).rpc('match_knowledge_chunks', {
    query_embedding: queryEmbedding,
    filter_rec_types: [query.rec_type],
    filter_phv_stages: [query.phv_stage],
    filter_age_groups: [query.age_group],
    match_count: query.top_k ?? 3,
    match_threshold: 0.70,
  });

  if (error) {
    console.error('[RAG/Retriever] match_knowledge_chunks RPC failed:', error.message);
    return [];
  }

  return (data ?? []) as unknown as KnowledgeChunk[];
}
