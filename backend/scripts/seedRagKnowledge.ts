/**
 * Seed script — Parse the RAG knowledge base markdown, embed each domain,
 * and upsert into rag_knowledge_chunks via Supabase.
 *
 * Usage:  npx tsx scripts/seedRagKnowledge.ts
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_KEY = process.env.OPENAI_API_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
if (!OPENAI_KEY) {
  console.error('Missing OPENAI_API_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_KEY });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedDomain {
  title: string;
  domain: string;
  rec_types: string[];
  phv_stages: string[];
  age_groups: string[];
  evidence_grade: string;
  primary_source: string;
  content: string;
  athlete_summary: string;
  coach_summary: string;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

function parseKnowledgeBase(filePath: string): ParsedDomain[] {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const domains: ParsedDomain[] = [];

  // Split on ```yaml ... ``` blocks, keeping the text before each block
  // to extract the ## DOMAIN heading
  const yamlBlockRegex = /## DOMAIN \d+:\s*(.+?)\n[\s\S]*?```yaml\n([\s\S]*?)```/g;

  let match: RegExpExecArray | null;
  while ((match = yamlBlockRegex.exec(raw)) !== null) {
    const title = match[1].trim();
    const yamlBody = match[2];

    try {
      const parsed = parseYamlBlock(yamlBody, title);
      domains.push(parsed);
    } catch (err) {
      console.error(`Failed to parse domain "${title}":`, err);
    }
  }

  return domains;
}

function parseYamlBlock(body: string, title: string): ParsedDomain {
  const getScalar = (key: string): string => {
    const re = new RegExp(`^${key}:\\s*(.+)$`, 'm');
    const m = body.match(re);
    return m ? m[1].trim().replace(/^"|"$/g, '') : '';
  };

  const getArray = (key: string): string[] => {
    const re = new RegExp(`^${key}:\\s*\\[([^\\]]+)\\]`, 'm');
    const m = body.match(re);
    if (!m) return [];
    return m[1].split(',').map((s) => s.trim());
  };

  const getMultiline = (key: string): string => {
    const lines = body.split('\n');
    const startIdx = lines.findIndex((l) => new RegExp(`^${key}:\\s*\\|`).test(l));
    if (startIdx === -1) return '';

    // Collect all subsequent lines that are indented (2+ spaces) or blank
    const collected: string[] = [];
    for (let i = startIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      // Stop at a new top-level YAML key (non-indented, non-blank)
      if (line.length > 0 && !line.startsWith(' ')) break;
      collected.push(line.replace(/^ {2}/, ''));
    }
    return collected.join('\n').trim();
  };

  return {
    title,
    domain: getScalar('domain'),
    rec_types: getArray('rec_types'),
    phv_stages: getArray('phv_stages'),
    age_groups: getArray('age_groups'),
    evidence_grade: getScalar('evidence_grade'),
    primary_source: getScalar('primary_source'),
    content: getMultiline('content'),
    athlete_summary: getMultiline('athlete_summary'),
    coach_summary: getMultiline('coach_summary'),
  };
}

// ---------------------------------------------------------------------------
// Embedder
// ---------------------------------------------------------------------------

async function embed(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return res.data[0].embedding;
}

// ---------------------------------------------------------------------------
// Upsert
// ---------------------------------------------------------------------------

async function upsertChunk(domain: ParsedDomain, embedding: number[]): Promise<void> {
  // Bypass Supabase JS client entirely — use raw fetch to PostgREST
  const embeddingStr = `[${embedding.join(',')}]`;
  const body = {
    domain: domain.domain,
    title: domain.title,
    content: domain.content,
    athlete_summary: domain.athlete_summary,
    coach_summary: domain.coach_summary,
    rec_types: domain.rec_types,
    phv_stages: domain.phv_stages,
    age_groups: domain.age_groups,
    evidence_grade: domain.evidence_grade,
    primary_source: domain.primary_source,
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
  const kbPath = path.resolve(
    '/Users/tareqelkayyali/Desktop/Tomo/Files/tomo_rie_rag_knowledge_base.md'
  );

  if (!fs.existsSync(kbPath)) {
    console.error(`Knowledge base file not found: ${kbPath}`);
    process.exit(1);
  }

  console.log('Parsing knowledge base...');
  const domains = parseKnowledgeBase(kbPath);
  console.log(`Found ${domains.length} domains.\n`);

  const errors: { domain: string; error: string }[] = [];

  for (let i = 0; i < domains.length; i++) {
    const d = domains[i];
    const label = `${i + 1}/${domains.length}: ${d.domain}`;

    try {
      // Build embedding text: title + content + athlete_summary
      const textToEmbed = `${d.title}. ${d.content} ${d.athlete_summary}`;
      console.log(`Embedding domain ${label} (${textToEmbed.length} chars)...`);

      const embedding = await embed(textToEmbed);

      console.log(`Upserting domain ${label}...`);
      await upsertChunk(d, embedding);

      console.log(`  Done: ${d.domain}\n`);
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      console.error(`  ERROR on ${label}: ${msg}\n`);
      errors.push({ domain: d.domain, error: msg });
    }
  }

  // Summary
  console.log('='.repeat(60));
  console.log(`Completed: ${domains.length - errors.length}/${domains.length} domains seeded.`);
  if (errors.length > 0) {
    console.log(`\nFailed (${errors.length}):`);
    for (const e of errors) {
      console.log(`  - ${e.domain}: ${e.error}`);
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
