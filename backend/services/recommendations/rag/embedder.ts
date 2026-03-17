/**
 * RAG Embedder — OpenAI text-embedding-3-small wrapper
 * Used for embedding knowledge chunks and query texts for vector search.
 */

import OpenAI from 'openai';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

/**
 * Embed a text string into a 1536-dim vector using text-embedding-3-small.
 */
export async function embedText(text: string): Promise<number[]> {
  const response = await getClient().embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}
