/**
 * Maturity + SD-widener helpers for benchmark percentile calculations.
 *
 * Two orthogonal fairness adjustments live here:
 *
 *   1. SD WIDENER — multiplier applied to stored norm SDs before the
 *      percentile math, per (sport, age_band). Compensates for the fact
 *      that youth performance variance is genuinely wider than senior,
 *      which the current SEN-derived norms under-represent. CMS-editable
 *      via `sport_sd_wideners`. Cached for 5 min in-process.
 *
 *   2. MATURITY-ADJUSTED AGE BAND — if a player is an early/late maturer
 *      relative to chronological age, compare them against a shifted age
 *      band so biology doesn't distort their percentile. Driven by
 *      athlete_snapshots.phv_stage (PRE/CIRCA/POST) and optionally
 *      athlete_snapshots.phv_offset_years.
 *
 * Both are explicit, logged per snapshot, and reversible — never hidden
 * post-hoc math.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

// ── SD widener ──────────────────────────────────────────────────────

export interface SdWidener {
  sportId: string;
  ageBand: string;
  multiplier: number;
  rationale: string | null;
}

type CacheEntry = { value: SdWidener; expiresAt: number };

const WIDENER_TTL_MS = 5 * 60 * 1000; // 5 min — matches CMS edit → athlete UX latency
const widenerCache = new Map<string, CacheEntry>();

function cacheKey(sportId: string, ageBand: string): string {
  return `${sportId}:${ageBand}`;
}

/**
 * Fetch the SD widener for (sport, age_band). Cached for 5 minutes.
 * Returns multiplier=1.0 if no row exists (fail-open — never block a
 * percentile calc on a missing widener row).
 *
 * @param sportId   e.g. "football"
 * @param ageBand   U13/U15/U17/U19/SEN/SEN30/VET
 */
export async function getSdWidener(
  sportId: string,
  ageBand: string
): Promise<SdWidener> {
  const key = cacheKey(sportId, ageBand);
  const cached = widenerCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabaseAdmin() as any)
    .from("sport_sd_wideners")
    .select("sport_id, age_band, multiplier, rationale")
    .eq("sport_id", sportId)
    .eq("age_band", ageBand)
    .maybeSingle();

  const value: SdWidener = data
    ? {
        sportId: data.sport_id,
        ageBand: data.age_band,
        multiplier: Number(data.multiplier),
        rationale: data.rationale ?? null,
      }
    : { sportId, ageBand, multiplier: 1.0, rationale: null };

  widenerCache.set(key, { value, expiresAt: Date.now() + WIDENER_TTL_MS });
  return value;
}

/**
 * Invalidate the in-memory widener cache. Call after a CMS write so the
 * next percentile calc picks up the new multiplier in-process instead of
 * waiting up to 5 min for the TTL. Other Railway instances will converge
 * within the TTL naturally. Also used by unit tests to re-stub the DB.
 */
export function invalidateWidenerCache(): void {
  widenerCache.clear();
}

// ── Maturity-adjusted age band ──────────────────────────────────────

export type ChronoAgeBand = "U13" | "U15" | "U17" | "U19" | "SEN" | "SEN30" | "VET";
export type PhvStage = "PRE" | "CIRCA" | "POST" | null | undefined;

const BAND_ORDER: ChronoAgeBand[] = [
  "U13",
  "U15",
  "U17",
  "U19",
  "SEN",
  "SEN30",
  "VET",
];

/**
 * Shift an age band by an integer offset, clamped to the ends of the
 * spectrum. Used to compute the maturity-adjusted band.
 */
function shiftBand(band: ChronoAgeBand, offset: number): ChronoAgeBand {
  const idx = BAND_ORDER.indexOf(band);
  if (idx < 0) return band;
  const next = Math.max(0, Math.min(BAND_ORDER.length - 1, idx + offset));
  return BAND_ORDER[next];
}

/**
 * Compute the age band to use for norm lookup, given chronological band
 * + PHV signal.
 *
 * Rules (athlete-performance-director perspective):
 *   - POST-PHV  → shift +1 band (early maturer — compare against older peers
 *                 so biology doesn't inflate percentile)
 *   - PRE-PHV   → shift −1 band (late maturer — compare against younger
 *                 peers so biology doesn't depress percentile)
 *   - CIRCA-PHV → no shift (at PHV — chronological band is appropriate)
 *   - null/unknown → no shift (safe default)
 *
 * Senior bands (SEN/SEN30/VET) never shift — PHV is a youth-development
 * construct and does not meaningfully apply once the athlete is post-20.
 *
 * phvOffsetYears, when available, takes precedence: the band is selected
 * by the effective age = chrono_age + offset, so a 15yo with offset=+1.8
 * maps to U17 rather than U15.
 */
export function resolveMaturityAdjustedAgeBand(params: {
  chronoBand: ChronoAgeBand;
  phvStage: PhvStage;
  phvOffsetYears?: number | null;
  chronoAge?: number | null;
}): {
  effectiveBand: ChronoAgeBand;
  shiftApplied: number;
  reason: "phv_offset_years" | "phv_stage" | "none";
} {
  const { chronoBand, phvStage, phvOffsetYears, chronoAge } = params;

  // Senior bands never shift.
  if (chronoBand === "SEN" || chronoBand === "SEN30" || chronoBand === "VET") {
    return { effectiveBand: chronoBand, shiftApplied: 0, reason: "none" };
  }

  // Preferred: use phv_offset_years when populated — continuous, more accurate.
  if (
    typeof phvOffsetYears === "number" &&
    Number.isFinite(phvOffsetYears) &&
    typeof chronoAge === "number" &&
    Number.isFinite(chronoAge)
  ) {
    const effectiveAge = chronoAge + phvOffsetYears;
    const effectiveBand = ageToBand(effectiveAge);
    return {
      effectiveBand,
      shiftApplied: BAND_ORDER.indexOf(effectiveBand) - BAND_ORDER.indexOf(chronoBand),
      reason: "phv_offset_years",
    };
  }

  // Fallback: stage-based ±1 band shift.
  if (phvStage === "POST") {
    return {
      effectiveBand: shiftBand(chronoBand, +1),
      shiftApplied: +1,
      reason: "phv_stage",
    };
  }
  if (phvStage === "PRE") {
    return {
      effectiveBand: shiftBand(chronoBand, -1),
      shiftApplied: -1,
      reason: "phv_stage",
    };
  }

  return { effectiveBand: chronoBand, shiftApplied: 0, reason: "none" };
}

/** Map a chronological age (years) to the youth band system used by norms. */
function ageToBand(age: number): ChronoAgeBand {
  if (age < 14) return "U13";
  if (age < 16) return "U15";
  if (age < 18) return "U17";
  if (age < 20) return "U19";
  if (age < 30) return "SEN";
  if (age < 36) return "SEN30";
  return "VET";
}
