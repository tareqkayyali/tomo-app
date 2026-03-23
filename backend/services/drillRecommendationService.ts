/**
 * Drill Recommendation Service — AI-powered training drill recommendations.
 *
 * Uses readiness state, LTAD age bands, position, and performance gaps
 * to rank and filter drills from the training_drills catalog.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { PlayerContext } from "./agents/contextBuilder";

// NOTE: Training drill tables are not yet in generated Supabase types.
// After running migration 00000000000009 and regenerating types, remove these casts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const drillDb = () => supabaseAdmin() as any;

// ── Types ────────────────────────────────────────────────────────

export interface TrainingDrill {
  id: string;
  sport_id: string;
  name: string;
  slug: string;
  description: string;
  instructions: string[];
  duration_minutes: number;
  intensity: "light" | "moderate" | "hard";
  attribute_keys: string[];
  age_bands: string[];
  position_keys: string[];
  category: "warmup" | "training" | "cooldown" | "recovery" | "activation";
  players_min: number;
  players_max: number;
  video_url: string | null;
  image_url: string | null;
  sort_order: number;
  active: boolean;
}

export interface DrillEquipment {
  id: string;
  drill_id: string;
  name: string;
  quantity: number;
  optional: boolean;
}

export interface DrillProgression {
  id: string;
  drill_id: string;
  level: number;
  label: string;
  description: string;
  duration_minutes: number | null;
  sort_order: number;
}

export interface RecommendedDrill {
  drill: TrainingDrill;
  equipment: DrillEquipment[];
  progressions: DrillProgression[];
  tags: string[];
  score: number;
  reason: string;
}

// ── Allowed intensities by readiness ─────────────────────────────

function getAllowedIntensities(readiness: string | null): string[] {
  switch (readiness?.toUpperCase()) {
    case "GREEN":
      return ["light", "moderate", "hard"];
    case "YELLOW":
      return ["light", "moderate"];
    case "RED":
      return ["light"];
    default:
      // No check-in: cautious default
      return ["light", "moderate"];
  }
}

// ── Main recommendation function ─────────────────────────────────

export async function getRecommendedDrills(
  context: PlayerContext,
  options?: {
    limit?: number;
    category?: string;
    focus?: string; // attribute key to focus on
  }
): Promise<RecommendedDrill[]> {
  const db = drillDb();
  const limit = options?.limit ?? 6;
  const allowedIntensities = getAllowedIntensities(context.readinessScore);

  // 1. Query drills filtered by sport and intensity
  let query = db
    .from("training_drills")
    .select("*")
    .eq("sport_id", context.sport)
    .eq("active", true)
    .in("intensity", allowedIntensities);

  if (options?.category) {
    query = query.eq("category", options.category);
  }

  const { data: drills, error } = await query.order("sort_order");
  if (error || !drills || drills.length === 0) {
    return [];
  }

  // 2. Filter by age band (LTAD)
  const ageBand = context.ageBand;
  const filteredDrills = ageBand
    ? drills.filter(
        (d: any) =>
          !d.age_bands ||
          d.age_bands.length === 0 ||
          d.age_bands.includes(ageBand)
      )
    : drills;

  if (filteredDrills.length === 0) return [];

  // 3. Get recent drill history for recency penalty
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000)
    .toISOString()
    .split("T")[0];
  const { data: recentHistory } = await db
    .from("user_drill_history")
    .select("drill_id")
    .eq("user_id", context.userId)
    .gte("completed_at", sevenDaysAgo);

  const recentDrillIds = new Set(
    (recentHistory ?? []).map((h: any) => h.drill_id)
  );

  // 4. Get equipment and tags for all candidate drills
  const drillIds = filteredDrills.map((d: any) => d.id);

  const [equipRes, tagRes, progRes] = await Promise.all([
    db
      .from("drill_equipment")
      .select("*")
      .in("drill_id", drillIds),
    db
      .from("drill_tags")
      .select("drill_id, tag")
      .in("drill_id", drillIds),
    db
      .from("drill_progressions")
      .select("*")
      .in("drill_id", drillIds)
      .order("sort_order"),
  ]);

  const equipMap = new Map<string, DrillEquipment[]>();
  for (const e of equipRes.data ?? []) {
    if (!equipMap.has(e.drill_id)) equipMap.set(e.drill_id, []);
    equipMap.get(e.drill_id)!.push(e);
  }

  const tagMap = new Map<string, string[]>();
  for (const t of tagRes.data ?? []) {
    if (!tagMap.has(t.drill_id)) tagMap.set(t.drill_id, []);
    tagMap.get(t.drill_id)!.push(t.tag);
  }

  const progMap = new Map<string, DrillProgression[]>();
  for (const p of progRes.data ?? []) {
    if (!progMap.has(p.drill_id)) progMap.set(p.drill_id, []);
    progMap.get(p.drill_id)!.push(p);
  }

  // 5. Score and rank drills
  // Use gapAttributes (attribute keys like "pace") for drill matching,
  // NOT gaps (metric labels like "10m Sprint") which never match drill attribute_keys
  const gapAttrs = context.benchmarkProfile?.gapAttributes ?? [];
  const position = context.position;
  const focusAttr = options?.focus;

  const scored: RecommendedDrill[] = filteredDrills.map((drill: any) => {
    let score = 0;
    const reasons: string[] = [];

    // Gap targeting: +2 for each matching gap attribute
    const drillAttrs: string[] = drill.attribute_keys ?? [];
    for (const attr of drillAttrs) {
      if (gapAttrs.includes(attr)) {
        score += 2;
        reasons.push(`Targets your ${attr} gap`);
      }
    }

    // Focus attribute: +3 if matches requested focus
    if (focusAttr && drillAttrs.includes(focusAttr)) {
      score += 3;
      reasons.push(`Matches your ${focusAttr} focus`);
    }

    // Position preference: +1 if drill targets player's position
    if (
      position &&
      drill.position_keys?.length > 0 &&
      drill.position_keys.includes(position)
    ) {
      score += 1;
      reasons.push("Matches your position");
    }

    // Recency penalty: -1 if done in last 7 days
    if (recentDrillIds.has(drill.id)) {
      score -= 1;
      reasons.push("Done recently");
    }

    // Base sort order weight (lower sort_order = higher priority)
    score -= drill.sort_order * 0.01;

    if (reasons.length === 0) {
      reasons.push("Recommended for your level");
    }

    return {
      drill: drill as TrainingDrill,
      equipment: equipMap.get(drill.id) ?? [],
      progressions: progMap.get(drill.id) ?? [],
      tags: tagMap.get(drill.id) ?? [],
      score,
      reason: reasons[0],
    };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // 6. Category distribution for full sessions
  if (!options?.category) {
    const warmups = scored.filter((d) => d.drill.category === "warmup");
    const training = scored.filter((d) => d.drill.category === "training");
    const cooldowns = scored.filter((d) => d.drill.category === "cooldown");
    const recovery = scored.filter((d) => d.drill.category === "recovery");

    const session: RecommendedDrill[] = [];
    // 1 warmup
    if (warmups.length > 0) session.push(warmups[0]);
    // Main training block
    const mainCount = Math.max(1, limit - 2);
    session.push(...training.slice(0, mainCount));
    // 1 cooldown or recovery
    if (cooldowns.length > 0) session.push(cooldowns[0]);
    else if (recovery.length > 0) session.push(recovery[0]);

    return session.slice(0, limit);
  }

  return scored.slice(0, limit);
}

// ── Get single drill by ID ───────────────────────────────────────

export async function getDrillById(
  drillId: string
): Promise<RecommendedDrill | null> {
  const db = drillDb();

  const { data: drill } = await db
    .from("training_drills")
    .select("*")
    .eq("id", drillId)
    .maybeSingle();

  if (!drill) return null;

  const [equipRes, tagRes, progRes] = await Promise.all([
    db.from("drill_equipment").select("*").eq("drill_id", drillId),
    db.from("drill_tags").select("drill_id, tag").eq("drill_id", drillId),
    db
      .from("drill_progressions")
      .select("*")
      .eq("drill_id", drillId)
      .order("sort_order"),
  ]);

  return {
    drill: drill as TrainingDrill,
    equipment: equipRes.data ?? [],
    progressions: progRes.data ?? [],
    tags: (tagRes.data ?? []).map((t: any) => t.tag),
    score: 0,
    reason: "",
  };
}

// ── Search drills ────────────────────────────────────────────────

export async function searchDrills(
  queryStr: string,
  sportId: string,
  filters?: {
    category?: string;
    intensity?: string;
    attributeKey?: string;
  }
): Promise<TrainingDrill[]> {
  const db = drillDb();

  let query = db
    .from("training_drills")
    .select("*")
    .eq("sport_id", sportId)
    .eq("active", true)
    .ilike("name", `%${queryStr}%`);

  if (filters?.category) query = query.eq("category", filters.category);
  if (filters?.intensity) query = query.eq("intensity", filters.intensity);

  const { data } = await query.order("sort_order").limit(20);

  let results = (data ?? []) as TrainingDrill[];

  // Also search by tags if text search returns few results
  if (results.length < 5) {
    const { data: tagMatches } = await db
      .from("drill_tags")
      .select("drill_id")
      .ilike("tag", `%${queryStr}%`);

    if (tagMatches && tagMatches.length > 0) {
      const tagDrillIds = tagMatches.map((t: any) => t.drill_id);
      const existingIds = new Set(results.map((r) => r.id));
      const newIds = tagDrillIds.filter((id: string) => !existingIds.has(id));

      if (newIds.length > 0) {
        const { data: tagDrills } = await db
          .from("training_drills")
          .select("*")
          .in("id", newIds)
          .eq("active", true);
        results = [...results, ...((tagDrills ?? []) as TrainingDrill[])];
      }
    }
  }

  // Filter by attribute key if provided
  if (filters?.attributeKey) {
    results = results.filter((d) =>
      d.attribute_keys?.includes(filters.attributeKey!)
    );
  }

  return results;
}

// ── List drills (simple filter) ──────────────────────────────────

export async function listDrills(
  sportId: string,
  filters?: {
    category?: string;
    intensity?: string;
    ageBand?: string;
    limit?: number;
  }
): Promise<TrainingDrill[]> {
  const db = drillDb();

  let query = db
    .from("training_drills")
    .select("*")
    .eq("sport_id", sportId)
    .eq("active", true);

  if (filters?.category) query = query.eq("category", filters.category);
  if (filters?.intensity) query = query.eq("intensity", filters.intensity);

  const { data } = await query
    .order("category")
    .order("sort_order")
    .limit(filters?.limit ?? 50);

  let results = (data ?? []) as TrainingDrill[];

  // Filter by age band in application layer (jsonb contains)
  if (filters?.ageBand) {
    results = results.filter(
      (d) =>
        !d.age_bands ||
        d.age_bands.length === 0 ||
        d.age_bands.includes(filters.ageBand!)
    );
  }

  return results;
}
