/**
 * Sport Context Utilities — extracted from orchestrator.ts during Phase 9 cleanup.
 *
 * These functions build sport-specific and age-band-specific prompt segments
 * used by deepRecRefresh and other non-chat TS services.
 *
 * The full AI orchestrator has been migrated to the Python AI service (tomo-ai).
 */

import type { PlayerContext } from "@/services/agents/contextBuilder";

// ── SPORT-SPECIFIC COACHING CONTEXT ────────────────────────────────

export async function buildSportContextSegment(ctx: PlayerContext): Promise<string> {
  const sport = ctx.sport?.toLowerCase() ?? "";
  const position = ctx.position ?? "unknown";
  const phvStage = ctx.snapshotEnrichment?.phvStage ?? null;

  let segment: string;

  try {
    const { getSportCoachingConfig, getPHVSafetyConfig } = await import("@/services/admin/performanceIntelligenceService");
    const config = await getSportCoachingConfig();
    const entry = config[sport];

    if (entry) {
      const posNote = entry.positionNotes[position] || "";
      segment = `Sport: ${ctx.sport ?? sport}. Position: ${position}.\nKey performance metrics: ${entry.keyMetrics}\nLoad framework: ${entry.loadFramework}${posNote ? `\nPosition note: ${posNote}` : ""}`;
    } else {
      segment = `Sport: ${ctx.sport ?? "Unknown"}. Position: ${position}.`;
    }

    // PHV safety overlay from DB config
    if (phvStage === "mid_phv" || phvStage === "MID") {
      const phvConfig = await getPHVSafetyConfig();
      const midStage = phvConfig.stages.find((s) => s.name === "mid_phv");
      const mult = midStage?.loadingMultiplier ?? 0.6;
      const blocked = phvConfig.contraindications
        .filter((c) => c.applicableStages.includes("mid_phv"))
        .map((c) => c.blocked.toLowerCase())
        .join(", ");
      segment += `\n⚠️ MID-PHV ACTIVE: This athlete is in peak growth velocity. Loading multiplier ${mult}×.
BLOCKED movements: ${blocked || "barbell back squat, depth/drop jumps, Olympic lifts, maximal sprint, heavy deadlift"}.
If any blocked movement is discussed: acknowledge, explain growth-phase risk, offer safe alternative.`;
    }
  } catch {
    // Fallback to hardcoded if DB unavailable
    segment = buildSportContextSegmentFallback(ctx.sport ?? "", position, phvStage);
  }

  return segment;
}

function buildSportContextSegmentFallback(sport: string, position: string, phvStage: string | null): string {
  const sportLower = sport.toLowerCase();
  const fallbackMap: Record<string, string> = {
    football: `Sport: Association football (soccer). Position: ${position}.\nKey performance metrics: Yo-Yo IR1, 10m/30m sprint, CMJ, agility T-test. ACWR model: 7:28 rolling.\nLoad framework: Training units/week, match = 1.0 AU reference. Monitor ACWR sweet spot 0.8–1.3.`,
    padel: `Sport: Padel. Playing style: ${position}.\nKey metrics: Reaction time, lateral movement speed, court coverage.`,
    athletics: `Sport: Athletics. Event group: ${position}.\nKey metrics: Event-specific benchmarks, sprint mechanics.`,
    basketball: `Sport: Basketball. Position: ${position}.\nKey metrics: Vertical jump, agility, sprint, court coverage.`,
    tennis: `Sport: Tennis. Playing style: ${position}.\nKey metrics: Lateral movement speed, serve velocity, rally endurance.`,
  };
  let seg = fallbackMap[sportLower] ?? `Sport: ${sport}. Position: ${position}.`;
  if (phvStage === "mid_phv" || phvStage === "MID") {
    seg += `\n⚠️ MID-PHV ACTIVE: Loading multiplier 0.60×. BLOCKED: barbell back squat, depth/drop jumps, Olympic lifts, maximal sprint, heavy deadlift.`;
  }
  return seg;
}

// ── AGE-BAND COMMUNICATION PROFILE ────────────────────────────────

export function buildToneProfile(ageBand: string | null): string {
  const band = ageBand?.toUpperCase() ?? "";
  if (band === "U13")
    return `COMMUNICATION PROFILE (U13):
- Simple, warm, short sentences. No sport-science jargon.
- Celebrate effort over outcomes. Positive framing first.
- Parent may be reviewing — always age-appropriate language.
- Use analogies they understand (games, school, fun challenges).`;

  if (band === "U15")
    return `COMMUNICATION PROFILE (U15):
- Peer-level but supportive. Start introducing data simply.
- Acknowledge effort and emotional state before giving analytics.
- Identity-forming age — protect confidence while being honest about gaps.
- They want to feel like a real athlete — treat them as one.`;

  if (band === "U17")
    return `COMMUNICATION PROFILE (U17):
- Direct. Treat as a dedicated athlete who can handle honest feedback.
- Data-grounded advice is expected and appreciated.
- Balance: acknowledge pressure (exams, recruitment) before performance talk.
- They respect coaches who are straight with them.`;

  if (band === "U19")
    return `COMMUNICATION PROFILE (U19):
- Professional peer. Full technical language acceptable.
- Recruitment context is real — flag opportunities clearly.
- Data-first is fine. Skip motivational framing unless they express doubt.
- They want actionable specifics, not encouragement.`;

  return `COMMUNICATION PROFILE (Senior):
- Professional peer. Data-dense responses welcome.
- Direct feedback. Skip motivational framing.
- They manage their own career — respect their autonomy.`;
}
