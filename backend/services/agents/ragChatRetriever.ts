/**
 * RAG Chat Retriever — Maps user chat messages to knowledge base retrieval.
 *
 * ADDITIVE ONLY — does not modify any existing orchestrator logic.
 * Called only for fallthrough/advisory queries (not quick actions).
 * Returns formatted context block for system prompt injection.
 *
 * Graceful fallback: returns empty string on any failure.
 */

import { retrieveKnowledgeChunks, type KnowledgeChunk } from '../recommendations/rag/ragRetriever';
import type { PlayerContext } from './contextBuilder';
import type { RecType } from '../recommendations/types';

// ── Topic-to-RecType Mapping ────────────────────────────────────────

function detectRecTypes(message: string): RecType[] {
  const lower = message.toLowerCase();
  const types: RecType[] = [];

  if (/sleep|recover|rest|fatigue|tired|hrv|readiness|red flag|red status|amber/i.test(lower)) {
    types.push('READINESS' as RecType, 'RECOVERY' as RecType);
  }
  if (/load|acwr|overtraining|injury|pain|sore|hurt|strain|sprain/i.test(lower)) {
    types.push('LOAD_WARNING' as RecType);
  }
  if (/speed|power|strength|agility|develop|improve|train|hiit|sprint|jump|endurance|fitness/i.test(lower)) {
    types.push('DEVELOPMENT' as RecType);
  }
  if (/study|exam|school|academic|homework|test.*week/i.test(lower)) {
    types.push('ACADEMIC' as RecType);
  }
  if (/recruit|scout|cv|profile|benchmark|talent|showcase/i.test(lower)) {
    types.push('CV_OPPORTUNITY' as RecType);
  }
  if (/motivat|confidence|mindset|mental|burnout|quit|streak|consistency/i.test(lower)) {
    types.push('MOTIVATION' as RecType);
  }
  if (/growth|phv|height|maturity|growing|tall/i.test(lower)) {
    types.push('DEVELOPMENT' as RecType);
  }
  if (/nutrition|fuel|hydrat|eat|diet|meal|carb|protein/i.test(lower)) {
    types.push('DEVELOPMENT' as RecType);
  }
  if (/return.*play|come back|rehab/i.test(lower)) {
    types.push('READINESS' as RecType, 'RECOVERY' as RecType);
  }

  // Default: broad search if no specific topic detected
  if (types.length === 0) {
    types.push('READINESS' as RecType, 'DEVELOPMENT' as RecType);
  }

  return [...new Set(types)];
}

// ── PHV Stage Mapping ───────────────────────────────────────────────

function mapPhvStage(context: PlayerContext): string {
  const phv = context.snapshotEnrichment?.phvStage ?? context.snapshotEnrichment?.readinessRag;
  if (!phv) return 'POST'; // default to POST if unknown
  const upper = phv.toUpperCase();
  if (upper.includes('PRE')) return 'PRE';
  if (upper.includes('CIRCA') || upper.includes('MID')) return 'CIRCA';
  return 'POST';
}

// ── Age Group Mapping ───────────────────────────────────────────────

function mapAgeGroup(ageBand: string | null): string {
  if (!ageBand) return 'U17';
  const upper = ageBand.toUpperCase();
  if (upper.includes('U13') || upper.includes('U12')) return 'U13';
  if (upper.includes('U15') || upper.includes('U14')) return 'U15';
  if (upper.includes('U17') || upper.includes('U16')) return 'U17';
  if (upper.includes('U19') || upper.includes('U18')) return 'U19';
  return 'ADULT';
}

// ── Format Knowledge Chunks for Prompt ──────────────────────────────

const MAX_RAG_TOKENS = 400; // ~400 tokens ≈ ~1600 chars

function formatChunksForPrompt(chunks: KnowledgeChunk[]): string {
  if (chunks.length === 0) return '';

  const lines: string[] = [];
  let totalChars = 0;

  for (const chunk of chunks.slice(0, 3)) { // max 3 chunks
    const line = `- [${chunk.domain}] ${chunk.title} (Grade: ${chunk.evidence_grade})\n  ${chunk.athlete_summary || chunk.content.substring(0, 250)}`;
    if (totalChars + line.length > MAX_RAG_TOKENS * 4) break; // ~4 chars per token
    lines.push(line);
    totalChars += line.length;
  }

  if (lines.length === 0) return '';

  return `\n\nKNOWLEDGE BASE (evidence-grounded — cite naturally when relevant, don't force):
${lines.join('\n')}
Use this evidence to support your coaching advice. Reference the science but keep it conversational.`;
}

// ── Main Export ──────────────────────────────────────────────────────

/**
 * Retrieve relevant sports science knowledge for a chat message.
 * Returns a formatted prompt block string, or empty string on failure.
 *
 * Only called for fallthrough/advisory queries — quick actions skip RAG.
 */
export async function retrieveChatKnowledge(
  message: string,
  context: PlayerContext,
  _agentType: string
): Promise<string> {
  try {
    const recTypes = detectRecTypes(message);
    const phvStage = mapPhvStage(context);
    const ageGroup = mapAgeGroup(context.ageBand);

    // Query for each detected rec type and merge results
    const allChunks: KnowledgeChunk[] = [];

    for (const recType of recTypes.slice(0, 2)) { // max 2 rec types to limit API calls
      const chunks = await retrieveKnowledgeChunks({
        rec_type: recType,
        phv_stage: phvStage,
        age_group: ageGroup,
        sport: context.sport ?? undefined,
        specific_concern: message.substring(0, 200), // truncate long messages
        top_k: 2,
      });
      allChunks.push(...chunks);
    }

    // Deduplicate by chunk_id and sort by similarity
    const seen = new Set<string>();
    const unique = allChunks.filter(c => {
      if (seen.has(c.chunk_id)) return false;
      seen.add(c.chunk_id);
      return true;
    }).sort((a, b) => b.similarity - a.similarity);

    return formatChunksForPrompt(unique);
  } catch (err) {
    console.warn('[RAG/Chat] Retrieval failed, continuing without knowledge context:',
      err instanceof Error ? err.message : err);
    return ''; // graceful fallback — chat works fine without RAG
  }
}
