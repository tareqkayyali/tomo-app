/**
 * RAG Embedder — Voyage AI voyage-3-lite via raw HTTP
 * Used for embedding knowledge chunks and query texts for vector search.
 * 512-dim vectors, $0.02/1M tokens. Anthropic's recommended embeddings partner.
 *
 * Uses raw fetch instead of voyageai SDK to avoid Turbopack module resolution issues.
 */

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-3-lite';

/**
 * Embed a text string into a 512-dim vector using voyage-3-lite.
 */
export async function embedText(text: string): Promise<number[]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    console.warn('[RAG/Embedder] VOYAGE_API_KEY not set, returning empty embedding');
    return [];
  }

  const response = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input: [text],
      input_type: 'query',
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Voyage API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data?.data?.[0]?.embedding ?? [];
}

/**
 * Embed multiple texts in a single batch (for seeding).
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    console.warn('[RAG/Embedder] VOYAGE_API_KEY not set, returning empty embeddings');
    return texts.map(() => []);
  }

  const response = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input: texts,
      input_type: 'document',
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Voyage API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return (data?.data ?? []).map((d: any) => d.embedding ?? []);
}
