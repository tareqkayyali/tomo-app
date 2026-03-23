/**
 * Mastery Snapshot API
 *
 * GET /api/v1/mastery/snapshot?targetPlayerId=xxx
 *
 * Returns sport-agnostic mastery data for the Mastery/Progress screen:
 * - Player profile + overall rating + card tier
 * - 6-axis radar profile
 * - 7 mastery pillar cards (always returned, even with no test data)
 * - Dual-layer: player value vs age-band P50 norm with delta
 * - Strengths & growth areas
 *
 * Supports coach/parent read-only via targetPlayerId query param.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRelationship } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getRecommendations } from "@/services/recommendations/getRecommendations";
import {
  getPlayerBenchmarkProfile,
  getPositionNorms,
  type BenchmarkResult,
  type NormRow,
} from "@/services/benchmarkService";
import {
  getAgeBand,
  interpolatePercentile,
  getPercentileZone,
} from "@/scripts/seeds/football_benchmark_seed";
import {
  TEST_GROUPS,
  TEST_GROUP_MAP,
  RAW_TEST_GROUP_MAP,
  RADAR_AXIS_MAP,
  buildCategorySummary,
} from "@/services/testGroupConstants";

// ── Response Types ───────────────────────────────────────────────────────

interface MasteryMetric {
  metricKey: string;
  metricLabel: string;
  unit: string;
  direction: "lower_better" | "higher_better";
  playerValue: number | null;
  normP50: number;
  delta: number | null;
  percentile: number | null;
  zone: string | null;
  norm: { p10: number; p25: number; p50: number; p75: number; p90: number };
}

interface MasteryPillar {
  groupId: string;
  displayName: string;
  emoji: string;
  colorTheme: string;
  priority: number;
  athleteDescription: string;
  radarLabel: string | null; // e.g., "PAC", "POW" — maps to radar axis
  metrics: MasteryMetric[];
  avgPercentile: number | null;
}

interface RadarAxis {
  key: string;
  label: string;
  value: number;
  maxValue: number;
  color: string;
}

type CardTier = "bronze" | "silver" | "gold" | "diamond";

interface MasterySnapshot {
  player: {
    name: string;
    age: number;
    position: string;
    ageBand: string;
    sport: string;
  };
  overallRating: number;
  cardTier: CardTier;
  radarProfile: RadarAxis[];
  /** P50 benchmark norms as radar values (always 50th percentile = the "target" shape) */
  benchmarkRadarProfile: RadarAxis[];
  pillars: MasteryPillar[];
  strengths: string[];
  gaps: string[];
  hasTestData: boolean;
  /** Layer 4 RIE — DEVELOPMENT, MOTIVATION, CV_OPPORTUNITY recs for mastery context */
  recommendations: Array<{
    recType: string;
    priority: number;
    title: string;
    bodyShort: string;
    bodyLong: string | null;
    confidence: number;
  }>;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function getCardTier(rating: number): CardTier {
  if (rating >= 85) return "diamond";
  if (rating >= 70) return "gold";
  if (rating >= 50) return "silver";
  return "bronze";
}

/**
 * Build the 7 mastery pillars by merging benchmark results with norm data.
 *
 * Each pillar always appears (even with zero player data). When the player
 * has tested metrics those values fill the dual-layer view; when not, the
 * norm P50 still shows as a target.
 */
interface CMSPillarMetric {
  key: string;
  label: string;
  weight: number;
}
interface CMSPillar {
  id: string;
  name: string;
  emoji: string;
  colorTheme: string;
  enabled: boolean;
  priority: number;
  athleteDescription: string;
  metrics: CMSPillarMetric[];
}

function buildMasteryPillars(
  benchmarkResults: BenchmarkResult[],
  norms: NormRow[],
  rawTests: Array<{ testType: string; score: number; unit: string; date: string }> = [],
  cmsPillars?: CMSPillar[] | null,
): MasteryPillar[] {
  // Index benchmark results by metricKey for quick lookup
  const benchmarkByKey = new Map<string, BenchmarkResult>();
  for (const r of benchmarkResults) {
    benchmarkByKey.set(r.metricKey, r);
  }

  // Index norms by metricKey
  const normByKey = new Map<string, NormRow>();
  for (const n of norms) {
    normByKey.set(n.metricKey, n);
  }

  // Index raw tests by testType for quick lookup
  const rawByType = new Map<string, { testType: string; score: number; unit: string; date: string }>();
  for (const t of rawTests) {
    rawByType.set(t.testType, t);
  }

  // Build pillars — use CMS config if available, else hardcoded TEST_GROUPS
  const pillars: MasteryPillar[] = [];

  // Build CMS weight map: metricKey → weight
  const cmsWeights = new Map<string, number>();
  // Build CMS metric → group mapping if CMS config exists
  const cmsGroupMap = new Map<string, string>();
  if (cmsPillars) {
    for (const p of cmsPillars) {
      for (const m of p.metrics) {
        cmsWeights.set(m.key, m.weight);
        cmsGroupMap.set(m.key, p.id);
      }
    }
  }

  const pillarSources = cmsPillars
    ? cmsPillars.filter(p => p.enabled).map(p => ({
        groupId: p.id,
        displayName: p.name,
        emoji: p.emoji,
        colorTheme: p.colorTheme,
        priority: p.priority,
        athleteDescription: p.athleteDescription,
        metricKeys: p.metrics.map(m => m.key),
      }))
    : TEST_GROUPS.map(g => ({
        groupId: g.groupId,
        displayName: g.displayName,
        emoji: g.emoji,
        colorTheme: g.colorTheme,
        priority: g.priority,
        athleteDescription: g.athleteDescription,
        metricKeys: Object.entries(TEST_GROUP_MAP)
          .filter(([_, gid]) => gid === g.groupId)
          .map(([key]) => key),
      }));

  for (const group of pillarSources) {
    // Collect metrics that belong to this group
    const metricsInGroup: MasteryMetric[] = [];

    // First: metrics from benchmark results that map to this group
    const seenKeys = new Set<string>();
    for (const metricKey of group.metricKeys) {

      const bench = benchmarkByKey.get(metricKey);
      const norm = normByKey.get(metricKey);

      // Skip if we have neither bench nor norm data for this metric
      if (!bench && !norm) continue;

      seenKeys.add(metricKey);

      const normObj = norm
        ? { p10: norm.p10, p25: norm.p25, p50: norm.p50, p75: norm.p75, p90: norm.p90 }
        : bench
          ? bench.norm
          : { p10: 0, p25: 0, p50: 0, p75: 0, p90: 0 };

      const normP50 = normObj.p50;
      const playerValue = bench?.value ?? null;
      const direction = bench?.direction ?? norm?.direction ?? "higher_better";

      let delta: number | null = null;
      if (playerValue !== null) {
        delta = Math.round((playerValue - normP50) * 100) / 100;
      }

      metricsInGroup.push({
        metricKey,
        metricLabel: bench?.metricLabel ?? norm?.metricLabel ?? metricKey.replace(/_/g, " "),
        unit: bench?.unit ?? norm?.unit ?? "",
        direction,
        playerValue,
        normP50,
        delta,
        percentile: bench?.percentile ?? null,
        zone: bench?.zone ?? null,
        norm: normObj,
      });
    }

    // Also include norm-only metrics not yet seen (covers norms with no matching benchmark)
    for (const norm of norms) {
      if (!group.metricKeys.includes(norm.metricKey)) continue;
      if (seenKeys.has(norm.metricKey)) continue;

      metricsInGroup.push({
        metricKey: norm.metricKey,
        metricLabel: norm.metricLabel,
        unit: norm.unit,
        direction: norm.direction,
        playerValue: null,
        normP50: norm.p50,
        delta: null,
        percentile: null,
        zone: null,
        norm: { p10: norm.p10, p25: norm.p25, p50: norm.p50, p75: norm.p75, p90: norm.p90 },
      });
    }

    // Third pass: include raw test results that map to this group but weren't
    // already covered by benchmark or norm keys. This is the primary data source
    // for players who have phone_test_sessions but no benchmark snapshots.
    const seenRawTypes = new Set<string>();
    for (const [rawType, groupId] of Object.entries(RAW_TEST_GROUP_MAP)) {
      if (groupId !== group.groupId) continue;

      const rawTest = rawByType.get(rawType);
      if (!rawTest) continue;

      // Check if we already have this metric via benchmark key equivalence
      // (e.g. "10m-sprint" raw maps to "sprint_10m" benchmark key)
      const benchmarkEquivalent = rawTypeToBenchmarkKey(rawType);
      if (benchmarkEquivalent && seenKeys.has(benchmarkEquivalent)) {
        // If there IS a benchmark metric but it has no playerValue, fill from raw
        const existing = metricsInGroup.find((m) => m.metricKey === benchmarkEquivalent);
        if (existing && existing.playerValue === null) {
          existing.playerValue = rawTest.score;
          if (existing.normP50 > 0) {
            existing.delta = Math.round((rawTest.score - existing.normP50) * 100) / 100;
          }
          // Compute percentile using z-score approach if norm available
          if (existing.percentile === null) {
            const normRow = normByKey.get(benchmarkEquivalent);
            const pResult = computeRawPercentile(rawTest.score, normRow ?? null, existing.direction);
            if (pResult) {
              existing.percentile = pResult.percentile;
              existing.zone = pResult.zone;
            }
          }
        }
        continue;
      }

      if (seenRawTypes.has(rawType)) continue;
      seenRawTypes.add(rawType);

      // Find closest norm if available (try benchmark key equivalent)
      const normForRaw = benchmarkEquivalent ? normByKey.get(benchmarkEquivalent) : null;
      const normP50 = normForRaw?.p50 ?? 0;
      const normObj = normForRaw
        ? { p10: normForRaw.p10, p25: normForRaw.p25, p50: normForRaw.p50, p75: normForRaw.p75, p90: normForRaw.p90 }
        : { p10: 0, p25: 0, p50: 0, p75: 0, p90: 0 };

      const direction = normForRaw?.direction ?? inferDirection(rawType);
      const delta = normP50 > 0 ? Math.round((rawTest.score - normP50) * 100) / 100 : null;

      // Compute percentile using z-score approach
      const pResult = computeRawPercentile(rawTest.score, normForRaw ?? null, direction);
      const percentile = pResult?.percentile ?? null;
      const zone = pResult?.zone ?? null;

      metricsInGroup.push({
        metricKey: rawType,
        metricLabel: rawType.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        unit: rawTest.unit || "",
        direction,
        playerValue: rawTest.score,
        normP50,
        delta,
        percentile,
        zone,
        norm: normObj,
      });
    }

    // Compute weighted average percentile for the pillar
    const withPercentile = metricsInGroup.filter((m) => m.percentile !== null);
    let avgPercentile: number | null = null;
    if (withPercentile.length > 0) {
      let weightedSum = 0;
      let totalWeight = 0;
      for (const m of withPercentile) {
        const w = cmsWeights.get(m.metricKey) ?? 1.0;
        weightedSum += (m.percentile as number) * w;
        totalWeight += w;
      }
      avgPercentile = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null;
    }

    // Find the radar axis label for this pillar (e.g., "PAC" for speed_acceleration)
    let radarLabel: string | null = null;
    for (const [, axDef] of Object.entries(RADAR_AXIS_MAP)) {
      if (axDef.groupIds.includes(group.groupId)) {
        radarLabel = axDef.label;
        break;
      }
    }

    pillars.push({
      groupId: group.groupId,
      displayName: group.displayName,
      emoji: group.emoji,
      colorTheme: group.colorTheme,
      priority: group.priority,
      athleteDescription: group.athleteDescription,
      radarLabel,
      metrics: metricsInGroup,
      avgPercentile,
    });
  }

  // Sort by priority
  pillars.sort((a, b) => a.priority - b.priority);
  return pillars;
}

/**
 * Compute percentile for a raw test value using the z-score approach.
 * Uses the same `interpolatePercentile` function as the benchmark service
 * for consistent results. Falls back to SD estimation from p10/p90 when
 * stdDev is not available.
 */
function computeRawPercentile(
  value: number,
  normRow: NormRow | null,
  direction: "lower_better" | "higher_better",
): { percentile: number; zone: string } | null {
  if (!normRow || normRow.p50 === 0) return null;

  // Use stdDev from norm if available, otherwise estimate from p10→p90 spread
  const sd = normRow.stdDev > 0
    ? normRow.stdDev
    : Math.abs(normRow.p90 - normRow.p10) / 2.56; // ≈ 2 × 1.28 z-scores

  if (sd === 0) return null;

  const percentile = interpolatePercentile(value, normRow.p50, sd, direction);
  const zone = getPercentileZone(percentile);
  return { percentile, zone };
}

/** Map raw test type IDs to their benchmark metric key equivalents */
function rawTypeToBenchmarkKey(rawType: string): string | null {
  const map: Record<string, string> = {
    "10m-sprint": "sprint_10m",
    "20m-sprint": "sprint_20m",
    "flying-20m": "flying_20m",
    "30m-sprint": "sprint_30m",
    "cmj": "cmj",
    "broad-jump": "broad_jump",
    "5-0-5": "agility_505",
    "vo2max": "vo2max",
    "yoyo-ir1": "vo2max",
    "grip-strength": "grip_strength",
    "squat-relative": "squat_rel",
    "1rm-squat": "squat_rel",
    "squat-1rm": "squat_rel",
    "body-fat": "body_fat_pct",
    "max-speed": "est_max_speed",
    "reaction-time": "reaction_time",
    "reaction-tap": "reaction_time",
  };
  return map[rawType] ?? null;
}

/** Infer direction for raw test types without a norm lookup */
function inferDirection(rawType: string): "lower_better" | "higher_better" {
  const lowerBetter = [
    "10m-sprint", "20m-sprint", "30m-sprint", "flying-10m",
    "5-0-5", "5-10-5-agility", "t-test", "illinois-agility",
    "pro-agility", "arrowhead-agility", "reaction-time",
    "choice-reaction", "reaction-tap", "body-fat",
  ];
  return lowerBetter.includes(rawType) ? "lower_better" : "higher_better";
}

/**
 * Build the 6-axis radar from pillar percentiles (player's actual values).
 */
function buildRadarFromPillars(pillars: MasteryPillar[], cmsColors?: Map<string, string>, enabledPillarIds?: Set<string>): RadarAxis[] {
  const groupPercentiles = new Map<string, number>();
  for (const p of pillars) {
    if (p.avgPercentile !== null) {
      groupPercentiles.set(p.groupId, p.avgPercentile);
    }
  }

  const axes: RadarAxis[] = [];
  for (const [key, def] of Object.entries(RADAR_AXIS_MAP)) {
    // Skip radar axis if ALL its pillar groups are disabled
    if (enabledPillarIds && def.groupIds.every((gid) => !enabledPillarIds.has(gid))) {
      continue;
    }

    const matchingPercentiles = def.groupIds
      .map((gid) => groupPercentiles.get(gid))
      .filter((v): v is number => v !== undefined);

    const avgP =
      matchingPercentiles.length > 0
        ? Math.round(
            matchingPercentiles.reduce((s, v) => s + v, 0) / matchingPercentiles.length,
          )
        : 0;

    // Use CMS attribute color if available, fall back to hardcoded
    const color = cmsColors?.get(key) || def.color;
    axes.push({ key, label: def.label, value: avgP, maxValue: 99, color });
  }
  return axes;
}

/**
 * Build the 6-axis benchmark radar — P50 norm = 50th percentile for each axis.
 * This creates the "target" hexagon players compare themselves against.
 * Axes with at least one norm metric get value 50 (the median target),
 * axes with no norm data get 0.
 */
function buildBenchmarkRadar(pillars: MasteryPillar[], norms: NormRow[], cmsColors?: Map<string, string>, enabledPillarIds?: Set<string>): RadarAxis[] {
  // Determine which groups have norm data
  const groupHasNorms = new Set<string>();
  for (const norm of norms) {
    const groupId = TEST_GROUP_MAP[norm.metricKey];
    if (groupId) groupHasNorms.add(groupId);
  }

  const axes: RadarAxis[] = [];
  for (const [key, def] of Object.entries(RADAR_AXIS_MAP)) {
    // Skip radar axis if ALL its pillar groups are disabled
    if (enabledPillarIds && def.groupIds.every((gid) => !enabledPillarIds.has(gid))) {
      continue;
    }
    const hasData = def.groupIds.some((gid) => groupHasNorms.has(gid));
    const color = cmsColors?.get(key) || def.color;
    axes.push({
      key,
      label: def.label,
      value: hasData ? 50 : 0,
      maxValue: 99,
      color,
    });
  }
  return axes;
}

// ── GET Handler ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
  const requestingUserId = auth.user.id;
  const db = supabaseAdmin();

  // Support coach/parent viewing another player
  const targetPlayerId = req.nextUrl.searchParams.get("targetPlayerId");
  let athleteId = requestingUserId;

  if (targetPlayerId && targetPlayerId !== requestingUserId) {
    // Verify the requesting user has an active relationship with the target player
    const rel = await requireRelationship(requestingUserId, targetPlayerId);
    if ("error" in rel) return rel.error;

    athleteId = targetPlayerId;
  }

  // 1. Get athlete profile
  const { data: profile } = await (db as any)
    .from("users")
    .select(
      "name, sport, position, gender, age, date_of_birth, height_cm, weight_kg, role",
    )
    .eq("id", athleteId)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const ageBand = getAgeBand(profile.date_of_birth);
  const sport = profile.sport || "football";
  const position = profile.position || "ALL";
  const gender = profile.gender || "male";

  // 2. Parallel fetches — benchmark snapshots, norms, raw test sessions, sport attributes, AND Layer 4 recs
  const [benchmarkResult, normsResult, rawTestsResult, sportAttrsResult, masteryRecsResult, cmsConfigResult] = await Promise.allSettled([
    getPlayerBenchmarkProfile(athleteId),
    getPositionNorms(sport, position, ageBand, gender, "elite"),
    db
      .from("phone_test_sessions")
      .select("test_type, score, date, raw_data")
      .eq("user_id", athleteId)
      .order("date", { ascending: false })
      .limit(100),
    // Fetch CMS sport attribute colors for radar
    db
      .from("sport_attributes")
      .select("key, color, label, full_name")
      .eq("sport_id", sport)
      .order("sort_order", { ascending: true }),
    // Layer 4 — DEVELOPMENT, MOTIVATION, CV_OPPORTUNITY recs for mastery page
    getRecommendations(athleteId, {
      role: "ATHLETE",
      recTypes: ["DEVELOPMENT", "MOTIVATION", "CV_OPPORTUNITY"],
      limit: 5,
    }),
    // CMS mastery pillar config
    (db as any)
      .from("ui_config")
      .select("config_value")
      .eq("config_key", "mastery_pillars")
      .maybeSingle(),
  ]);

  const benchmarkProfile =
    benchmarkResult.status === "fulfilled" ? benchmarkResult.value : null;

  const norms: NormRow[] =
    normsResult.status === "fulfilled" ? normsResult.value : [];

  const masteryRecs: any[] =
    masteryRecsResult.status === "fulfilled" ? (masteryRecsResult.value as any[]) : [];

  // Build CMS attribute color override map
  // Maps radar axis keys (pace, power, agility, endurance, strength, mobility)
  // to CMS sport_attributes colors (pace, shooting, passing, dribbling, defending, physicality)
  const RADAR_TO_ATTRIBUTE: Record<string, string> = {
    pace: "pace",
    power: "physicality",
    agility: "dribbling",
    endurance: "defending",
    strength: "shooting",
    mobility: "passing",
  };

  const cmsAttrColors = new Map<string, string>();
  if (sportAttrsResult.status === "fulfilled") {
    const attrs = (sportAttrsResult.value as any)?.data ?? [];
    const attrColorByKey = new Map<string, string>();
    for (const attr of attrs) {
      if (attr.key && attr.color) {
        attrColorByKey.set(attr.key, attr.color);
      }
    }
    // Map radar axis keys → CMS attribute colors
    for (const [radarKey, attrKey] of Object.entries(RADAR_TO_ATTRIBUTE)) {
      const color = attrColorByKey.get(attrKey);
      if (color) cmsAttrColors.set(radarKey, color);
    }
  }

  // Deduplicate raw tests: latest per test_type
  const rawTests = rawTestsResult.status === "fulfilled"
    ? ((rawTestsResult.value as any)?.data ?? []) as Array<{
        test_type: string; score: number; date: string; raw_data: any;
      }>
    : [];
  const latestRawByType = new Map<string, { testType: string; score: number; unit: string; date: string }>();
  for (const t of rawTests) {
    if (!latestRawByType.has(t.test_type)) {
      latestRawByType.set(t.test_type, {
        testType: t.test_type,
        score: Number(t.score),
        unit: t.raw_data?.unit || "",
        date: t.date,
      });
    }
  }
  const recentRawTests = Array.from(latestRawByType.values());

  // Load CMS mastery pillar config (if saved)
  const cmsConfig = cmsConfigResult.status === "fulfilled" && cmsConfigResult.value?.data
    ? (cmsConfigResult.value.data as any).config_value
    : null;
  const cmsPillars: CMSPillar[] | null = cmsConfig?.pillars ?? null;

  // 3. Build mastery pillars — merges benchmark + norms + raw tests + CMS config
  const benchmarkResults = benchmarkProfile?.results ?? [];
  const pillars = buildMasteryPillars(benchmarkResults, norms, recentRawTests, cmsPillars);

  // 4. Radar profiles — player actual + benchmark (P50 target)
  // Build set of enabled pillar IDs to filter radar axes
  const enabledPillarIds = new Set(pillars.map(p => p.groupId));
  const radarProfile = buildRadarFromPillars(pillars, cmsAttrColors, enabledPillarIds);
  const benchmarkRadarProfile = buildBenchmarkRadar(pillars, norms, cmsAttrColors, enabledPillarIds);

  // 5. Overall rating + tier
  const pillarsWithData = pillars.filter((p) => p.avgPercentile !== null);
  const overallRating =
    pillarsWithData.length > 0
      ? Math.round(
          pillarsWithData.reduce((s, p) => s + (p.avgPercentile as number), 0) /
            pillarsWithData.length,
        )
      : 0;
  const cardTier = getCardTier(overallRating);

  // 6. Strengths & gaps
  const strengths = benchmarkProfile?.strengths ?? [];
  const gaps = benchmarkProfile?.gaps ?? [];

  const hasTestData = benchmarkResults.length > 0 || recentRawTests.length > 0;

  const snapshot: MasterySnapshot = {
    player: {
      name: profile.name || "Athlete",
      age: profile.age || 0,
      position,
      ageBand,
      sport,
    },
    overallRating,
    cardTier,
    radarProfile,
    benchmarkRadarProfile,
    pillars,
    strengths,
    gaps,
    hasTestData,
    recommendations: masteryRecs.map((r: any) => ({
      recType: r.rec_type,
      priority: r.priority,
      title: r.title,
      bodyShort: r.body_short,
      bodyLong: r.body_long ?? null,
      confidence: r.confidence_score,
    })),
  };

  return NextResponse.json(snapshot, {
    headers: { "api-version": "v1", "Cache-Control": "private, no-cache" },
  });
  } catch (err) {
    console.error('[GET /api/v1/mastery/snapshot] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
