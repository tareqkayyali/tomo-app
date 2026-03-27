/**
 * RAG Embedder — Voyage AI voyage-3-lite wrapper
 * Used for embedding knowledge chunks and query texts for vector search.
 * 1024-dim vectors, $0.02/1M tokens. Anthropic's recommended embeddings partner.
 */

import { VoyageAIClient } from 'voyageai';

let client: VoyageAIClient | null = null;

function getClient(): VoyageAIClient {
  if (!client) {
    client = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY });
  }
  return client;
}

/**
 * Embed a text string into a 1024-dim vector using voyage-3-lite.
 */
export async function embedText(text: string): Promise<number[]> {
  const response = await getClient().embed({
    model: 'voyage-3-lite',
    input: [text],
    inputType: 'query',
  });
  return response.data?.[0]?.embedding ?? [];
}

/**
 * Embed multiple texts in a single batch (for seeding).
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const response = await getClient().embed({
    model: 'voyage-3-lite',
    input: texts,
    inputType: 'document',
  });
  return (response.data ?? []).map((d) => d.embedding ?? []);
}
