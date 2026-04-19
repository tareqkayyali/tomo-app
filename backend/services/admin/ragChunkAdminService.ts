/**
 * RAG Knowledge Chunk Admin Service
 *
 * Business logic for CMS CRUD over `rag_knowledge_chunks` (migration 016,
 * embedding resized to 512-dim in 021, institution scope added in
 * ai-service 041, tsvector added in 043).
 *
 * Every create/update path embeds the chunk text via Voyage AI
 * (voyage-3-lite, 512-dim) so the HNSW index stays in sync.
 *
 * Consumers:
 *   - /api/v1/admin/enterprise/knowledge/chunks (list + create + update)
 *   - /api/v1/admin/enterprise/knowledge/chunks/[id] (single get + delete)
 *   - /api/v1/admin/enterprise/knowledge/chunks/similar (vector NN preview)
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

export interface KnowledgeChunkRow {
  chunk_id: string;
  domain: string;
  title: string;
  content: string;
  athlete_summary: string;
  coach_summary: string;
  rec_types: string[] | null;
  phv_stages: string[] | null;
  age_groups: string[] | null;
  sports: string[] | null;
  contexts: string[] | null;
  primary_source: string | null;
  evidence_grade: string | null;
  last_reviewed: string | null;
  institution_id: string | null;
  created_at: string;
}

export interface ChunkWriteInput {
  chunk_id?: string; // for updates
  domain: string;
  title: string;
  content: string;
  athlete_summary?: string | null;
  coach_summary?: string | null;
  rec_types?: string[] | null;
  phv_stages?: string[] | null;
  age_groups?: string[] | null;
  sports?: string[] | null;
  contexts?: string[] | null;
  primary_source?: string | null;
  evidence_grade?: string | null;
  last_reviewed?: string | null;
  institution_id?: string | null;
}

export interface SimilarChunk {
  chunk_id: string;
  domain: string;
  title: string;
  similarity: number;
}

// ─── Voyage AI embedding ─────────────────────────────────────────────

const VOYAGE_MODEL = "voyage-3-lite";
const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const EMBED_DIM = 512;

async function embedTexts(
  texts: string[],
  inputType: "document" | "query"
): Promise<number[][]> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) {
    throw new Error(
      "VOYAGE_API_KEY not configured — cannot embed knowledge chunks"
    );
  }

  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input: texts,
      input_type: inputType,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Voyage API ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };
  const vectors = (data.data ?? []).map((d) => d.embedding ?? []);
  for (const v of vectors) {
    if (v.length !== EMBED_DIM) {
      throw new Error(
        `Voyage returned ${v.length}-dim embedding; expected ${EMBED_DIM}`
      );
    }
  }
  return vectors;
}

/** Build the text we embed — title + content + athlete_summary. Matches migration 043's tsvector. */
function buildEmbeddingText(input: {
  title: string;
  content: string;
  athlete_summary?: string | null;
}): string {
  return [input.title, input.content, input.athlete_summary ?? ""]
    .filter(Boolean)
    .join("\n\n");
}

function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

// ─── CRUD ────────────────────────────────────────────────────────────

/**
 * List chunks scoped to tenant hierarchy.
 * Super admins see everything; others see global (institution_id NULL) +
 * their own tenants.
 */
export async function listChunks(opts: {
  tenantIds: string[];
  isSuperAdmin: boolean;
}): Promise<KnowledgeChunkRow[]> {
  const db = supabaseAdmin();

  let query = db
    .from("rag_knowledge_chunks")
    .select(
      "chunk_id, domain, title, content, athlete_summary, coach_summary, rec_types, phv_stages, age_groups, sports, contexts, primary_source, evidence_grade, last_reviewed, institution_id, created_at"
    )
    .order("domain")
    .order("title");

  if (!opts.isSuperAdmin) {
    const ids = opts.tenantIds.join(",");
    query = query.or(`institution_id.is.null,institution_id.in.(${ids})`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as KnowledgeChunkRow[];
}

export async function getChunk(
  chunkId: string
): Promise<KnowledgeChunkRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("rag_knowledge_chunks")
    .select(
      "chunk_id, domain, title, content, athlete_summary, coach_summary, rec_types, phv_stages, age_groups, sports, contexts, primary_source, evidence_grade, last_reviewed, institution_id, created_at"
    )
    .eq("chunk_id", chunkId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as KnowledgeChunkRow) ?? null;
}

/**
 * Upsert (create or update) a chunk. Always re-embeds — this service is
 * invoked from the admin editor on explicit save, so the cost is acceptable
 * and it guarantees the embedding never drifts from the content.
 */
export async function upsertChunk(
  input: ChunkWriteInput
): Promise<KnowledgeChunkRow> {
  if (!input.title.trim()) throw new Error("title is required");
  if (!input.content.trim()) throw new Error("content is required");
  if (!input.domain.trim()) throw new Error("domain is required");

  // athlete_summary and coach_summary are NOT NULL in the base schema.
  // If the editor only supplied athlete_summary, mirror it to coach_summary
  // (and vice-versa); if neither was supplied, fall back to a trimmed
  // excerpt so the insert doesn't fail.
  const athleteSummary =
    input.athlete_summary?.trim() ||
    input.coach_summary?.trim() ||
    input.content.slice(0, 300);
  const coachSummary =
    input.coach_summary?.trim() ||
    input.athlete_summary?.trim() ||
    input.content.slice(0, 300);

  const embedding = (
    await embedTexts(
      [buildEmbeddingText({ ...input, athlete_summary: athleteSummary })],
      "document"
    )
  )[0];

  const row = {
    domain: input.domain.trim(),
    title: input.title.trim(),
    content: input.content,
    athlete_summary: athleteSummary,
    coach_summary: coachSummary,
    rec_types: input.rec_types ?? null,
    phv_stages: input.phv_stages ?? null,
    age_groups: input.age_groups ?? null,
    sports: input.sports ?? null,
    contexts: input.contexts ?? null,
    primary_source: input.primary_source ?? null,
    evidence_grade: input.evidence_grade ?? null,
    last_reviewed: input.last_reviewed ?? null,
    institution_id: input.institution_id ?? null,
    embedding: toVectorLiteral(embedding),
  };

  const db = supabaseAdmin();

  if (input.chunk_id) {
    const { data, error } = await db
      .from("rag_knowledge_chunks")
      // embedding column isn't in the generated Database type union yet;
      // cast to any so Voyage-embedding writes don't depend on regen.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(row as any)
      .eq("chunk_id", input.chunk_id)
      .select(
        "chunk_id, domain, title, content, athlete_summary, coach_summary, rec_types, phv_stages, age_groups, sports, contexts, primary_source, evidence_grade, last_reviewed, institution_id, created_at"
      )
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(`chunk_id ${input.chunk_id} not found`);
    return data as unknown as KnowledgeChunkRow;
  }

  const { data, error } = await db
    .from("rag_knowledge_chunks")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(row as any)
    .select(
      "chunk_id, domain, title, content, athlete_summary, coach_summary, rec_types, phv_stages, age_groups, sports, contexts, primary_source, evidence_grade, last_reviewed, institution_id, created_at"
    )
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("insert returned no row");
  return data as unknown as KnowledgeChunkRow;
}

export async function deleteChunk(chunkId: string): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db
    .from("rag_knowledge_chunks")
    .delete()
    .eq("chunk_id", chunkId);
  if (error) throw new Error(error.message);
}

// ─── Nearest-neighbor preview ─────────────────────────────────────────

/**
 * Embed a query string and return the top-N most similar chunks.
 * Used by the editor on save-preview to surface duplicates before commit.
 */
export async function findSimilar(
  queryText: string,
  limit = 5
): Promise<SimilarChunk[]> {
  if (!queryText.trim()) return [];

  const embedding = (await embedTexts([queryText], "query"))[0];
  const vectorLit = toVectorLiteral(embedding);

  const db = supabaseAdmin();
  // Raw SQL: PostgREST doesn't expose the <=> operator via its
  // query builder, so we use an .rpc() on a helper function OR a
  // direct SELECT via the REST API's raw endpoint. The helper
  // already exists (match_knowledge_chunks) but it requires filter
  // arrays — we want unfiltered nearest-neighbors here, so call
  // the raw operator via rpc.
  const { data, error } = await db.rpc(
    // Not in the generated types; harmless at runtime.
    "match_knowledge_chunks" as never,
    {
      query_embedding: vectorLit,
      filter_rec_types: ["GENERAL"],
      filter_phv_stages: ["ALL"],
      filter_age_groups: ["ALL"],
      match_count: limit,
      match_threshold: 0, // don't filter — admin wants to see ALL near neighbours
    } as never
  );

  if (error) {
    // Fallback: inline SELECT via raw query. Supabase-js doesn't
    // expose raw SQL, so on error we return empty; the caller
    // shows a "similarity preview unavailable" state.
    console.warn("findSimilar rpc failed:", error.message);
    return [];
  }

  const rows = (data ?? []) as Array<{
    chunk_id: string;
    domain: string;
    title: string;
    similarity: number;
  }>;

  return rows.map((r) => ({
    chunk_id: r.chunk_id,
    domain: r.domain,
    title: r.title,
    similarity: r.similarity,
  }));
}
