/**
 * Seed script — Parse the RAG knowledge base markdown, embed each chunk
 * using Voyage AI, and upsert into rag_knowledge_chunks via Supabase.
 *
 * Usage:  npx tsx scripts/seedRagKnowledge.ts
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { VoyageAIClient } from 'voyageai';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const VOYAGE_KEY = process.env.VOYAGE_API_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
if (!VOYAGE_KEY) {
  console.error('Missing VOYAGE_API_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const voyage = new VoyageAIClient({ apiKey: VOYAGE_KEY });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedChunk {
  title: string;
  domain: string;
  rec_types: string[];
  phv_stages: string[];
  age_groups: string[];
  sports: string[];
  evidence_grade: string;
  content: string;
}

// ---------------------------------------------------------------------------
// Parser — new format: ## DOMAIN: Title + YAML-like metadata lines + body text
// ---------------------------------------------------------------------------

function parseKnowledgeBase(filePath: string): ParsedChunk[] {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const chunks: ParsedChunk[] = [];

  // Split on "---" separators and "## " headings
  const sections = raw.split(/^---$/m).filter(s => s.trim());

  for (const section of sections) {
    const headingMatch = section.match(/^## (\w+): (.+)$/m);
    if (!headingMatch) continue;

    const domain = headingMatch[1].trim();
    const title = headingMatch[2].trim();

    // Parse metadata lines (key: value format)
    const getArray = (key: string): string[] => {
      const re = new RegExp(`^${key}:\\s*\\[([^\\]]+)\\]`, 'm');
      const m = section.match(re);
      if (!m) return [];
      return m[1].split(',').map(s => s.trim());
    };

    const getScalar = (key: string): string => {
      const re = new RegExp(`^${key}:\\s*(.+)$`, 'm');
      const m = section.match(re);
      return m ? m[1].trim() : '';
    };

    // Content is everything after the metadata lines
    const lines = section.split('\n');
    const contentStartIdx = lines.findIndex((l, i) =>
      i > 0 && l.trim().length > 0 && !l.startsWith('##') && !l.match(/^\w+:/)
    );
    const content = contentStartIdx >= 0
      ? lines.slice(contentStartIdx).join('\n').trim()
      : '';

    if (!content) continue;

    chunks.push({
      title,
      domain,
      rec_types: getArray('rec_types'),
      phv_stages: getArray('phv_stages'),
      age_groups: getArray('age_groups'),
      sports: getArray('sports'),
      evidence_grade: getScalar('evidence_grade'),
      content,
    });
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Embedder (Voyage AI)
// ---------------------------------------------------------------------------

async function embedBatch(texts: string[]): Promise<number[][]> {
  const response = await voyage.embed({
    model: 'voyage-3-lite',
    input: texts,
    inputType: 'document',
  });
  return (response.data ?? []).map(d => d.embedding ?? []);
}

// ---------------------------------------------------------------------------
// Upsert
// ---------------------------------------------------------------------------

async function upsertChunk(chunk: ParsedChunk, embedding: number[]): Promise<void> {
  const embeddingStr = `[${embedding.join(',')}]`;

  const body = {
    chunk_id: randomUUID(),
    domain: `${chunk.domain}: ${chunk.title}`,
    title: chunk.title,
    content: chunk.content,
    athlete_summary: chunk.content.substring(0, 300),
    coach_summary: chunk.content.substring(0, 300),
    rec_types: chunk.rec_types,
    phv_stages: chunk.phv_stages,
    age_groups: chunk.age_groups,
    sports: chunk.sports,
    evidence_grade: chunk.evidence_grade,
    primary_source: 'Tomo Sports Science Knowledge Base v1',
    embedding: embeddingStr,
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rag_knowledge_chunks`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errText}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const kbPath = path.resolve(__dirname, '..', 'knowledge', 'sports-science-base.md');

  if (!fs.existsSync(kbPath)) {
    console.error(`Knowledge base file not found: ${kbPath}`);
    process.exit(1);
  }

  console.log('Parsing knowledge base...');
  const chunks = parseKnowledgeBase(kbPath);
  console.log(`Found ${chunks.length} chunks.\n`);

  if (chunks.length === 0) {
    console.error('No chunks parsed. Check the markdown format.');
    process.exit(1);
  }

  // Embed in batches of 10
  const BATCH_SIZE = 10;
  const errors: { title: string; error: string }[] = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map(c => `${c.title}. ${c.content}`);

    console.log(`Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)} (${batch.length} chunks)...`);

    try {
      const embeddings = await embedBatch(texts);

      for (let j = 0; j < batch.length; j++) {
        const label = `${i + j + 1}/${chunks.length}: ${batch[j].title}`;
        try {
          console.log(`  Upserting ${label}...`);
          await upsertChunk(batch[j], embeddings[j]);
        } catch (err: any) {
          const msg = err?.message ?? String(err);
          console.error(`  ERROR on ${label}: ${msg}`);
          errors.push({ title: batch[j].title, error: msg });
        }
      }
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      console.error(`  BATCH ERROR: ${msg}`);
      for (const c of batch) {
        errors.push({ title: c.title, error: msg });
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`Completed: ${chunks.length - errors.length}/${chunks.length} chunks seeded.`);
  if (errors.length > 0) {
    console.log(`\nFailed (${errors.length}):`);
    for (const e of errors) {
      console.log(`  - ${e.title}: ${e.error}`);
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
