/**
 * One-time admin endpoint to seed/re-seed RAG knowledge chunks.
 * Runs server-side where VOYAGE_API_KEY is available via Vercel env.
 *
 * POST /api/v1/admin/seed-rag
 *
 * After seeding, this endpoint can be removed or disabled.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

const VOYAGE_KEY = process.env.VOYAGE_API_KEY;

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

function parseKnowledgeBase(): ParsedChunk[] {
  const filePath = path.join(process.cwd(), "knowledge", "sports-science-base.md");
  const raw = fs.readFileSync(filePath, "utf-8");
  const chunks: ParsedChunk[] = [];
  const sections = raw.split(/^---$/m).filter(s => s.trim());

  for (const section of sections) {
    const headingMatch = section.match(/^## (\w+): (.+)$/m);
    if (!headingMatch) continue;

    const domain = headingMatch[1].trim();
    const title = headingMatch[2].trim();

    const getArray = (key: string): string[] => {
      const re = new RegExp(`^${key}:\\s*\\[([^\\]]+)\\]`, "m");
      const m = section.match(re);
      if (!m) return [];
      return m[1].split(",").map(s => s.trim());
    };

    const getScalar = (key: string): string => {
      const re = new RegExp(`^${key}:\\s*(.+)$`, "m");
      const m = section.match(re);
      return m ? m[1].trim() : "";
    };

    const lines = section.split("\n");
    const contentStartIdx = lines.findIndex((l, i) =>
      i > 0 && l.trim().length > 0 && !l.startsWith("##") && !l.match(/^\w+:/)
    );
    const content = contentStartIdx >= 0 ? lines.slice(contentStartIdx).join("\n").trim() : "";
    if (!content) continue;

    chunks.push({
      title, domain,
      rec_types: getArray("rec_types"),
      phv_stages: getArray("phv_stages"),
      age_groups: getArray("age_groups"),
      sports: getArray("sports"),
      evidence_grade: getScalar("evidence_grade"),
      content,
    });
  }
  return chunks;
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const response = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${VOYAGE_KEY}` },
    body: JSON.stringify({ model: "voyage-3-lite", input: texts, input_type: "document" }),
  });
  if (!response.ok) throw new Error(`Voyage API ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return (data?.data ?? []).map((d: any) => d.embedding ?? []);
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  if (!VOYAGE_KEY) {
    return NextResponse.json({ error: "VOYAGE_API_KEY not configured" }, { status: 500 });
  }

  try {
    const chunks = parseKnowledgeBase();
    console.log(`[SeedRAG] Parsed ${chunks.length} chunks from knowledge base`);

    // Clear existing chunks
    const db = supabaseAdmin();
    await (db as any).from("rag_knowledge_chunks").delete().neq("chunk_id", "00000000-0000-0000-0000-000000000000");
    console.log("[SeedRAG] Cleared existing chunks");

    // Embed in batches of 10
    let seeded = 0;
    const BATCH_SIZE = 10;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const texts = batch.map(c => `${c.domain}: ${c.title}\n${c.content}`);

      const embeddings = await embedBatch(texts);

      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j];
        const embedding = embeddings[j];
        if (!embedding || embedding.length === 0) continue;

        const { error } = await (db as any).from("rag_knowledge_chunks").insert({
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
          primary_source: "Tomo Sports Science Knowledge Base v2",
          embedding: `[${embedding.join(",")}]`,
        });

        if (error) {
          console.error(`[SeedRAG] Insert failed for "${chunk.title}":`, error.message);
        } else {
          seeded++;
        }
      }
      console.log(`[SeedRAG] Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)} done (${seeded} seeded so far)`);
    }

    return NextResponse.json({ success: true, parsed: chunks.length, seeded });
  } catch (err) {
    console.error("[SeedRAG] Failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
