/**
 * CV Completeness Scoring — single percentage, 100-point scale.
 *
 * Point allocation (100 total):
 *   Identity               10  (name 3 + DOB 2 + nationality 2 + foot 1 + photo 2)
 *   Physical + benchmarks  15  (height 2 + weight 2 + tests: 3/7/11 at 1/2/3+)
 *   Positions               5  (primary 3 + secondary 2)
 *   Player profile         10  (draft 5, approved 10)
 *   Verified performance   15  (sessions >=20: 8, >=10: 5; training age >=8w: 7, >=4w: 4)
 *   Career history         15  (1+ entry 15)
 *   Video & media          15  (highlight reel 15)
 *   References              8  (1+ published 8)
 *   Awards & character      6  (1+ row in any category 6)
 *   Health status           1  (medical consent signed 1)
 *
 * Sums to 100.
 */

import type {
  CVIdentity,
  CVPhysicalProfile,
  CVPositions,
  CVPlayerProfile,
  CVVerifiedPerformance,
  CVCareerEntry,
  CVMediaLink,
  CVReferenceEntry,
  CVAwardsCharacter,
  CVHealthStatus,
} from "./cvAssembler";

export interface CVCompletenessBreakdownRow {
  score: number;
  max: number;
  label: string;
}

export interface CVCompletenessResult {
  pct: number;
  total: number;
  max: number;
  breakdown: Record<string, CVCompletenessBreakdownRow>;
}

interface Input {
  identity: CVIdentity;
  physical: CVPhysicalProfile;
  positions: CVPositions;
  playerProfile: CVPlayerProfile;
  verifiedPerformance: CVVerifiedPerformance;
  career: CVCareerEntry[];
  media: CVMediaLink[];
  references: CVReferenceEntry[];
  awardsCharacter: CVAwardsCharacter;
  healthStatus: CVHealthStatus;
}

export function computeCVCompleteness(data: Input): CVCompletenessResult {
  const breakdown: Record<string, CVCompletenessBreakdownRow> = {};

  // Identity (10)
  let identity = 0;
  if (data.identity.full_name)         identity += 3;
  if (data.identity.date_of_birth)     identity += 2;
  if (data.identity.nationality)       identity += 2;
  if (data.identity.preferred_foot)    identity += 1;
  if (data.identity.photo_url)         identity += 2;
  breakdown.identity = { score: identity, max: 10, label: "Player Identity" };

  // Physical + benchmarks (15)
  let physical = 0;
  if (data.physical.height_cm) physical += 2;
  if (data.physical.weight_kg) physical += 2;
  const benchmarkCount = data.verifiedPerformance.benchmarks.length;
  if (benchmarkCount >= 3)      physical += 11;
  else if (benchmarkCount === 2) physical += 7;
  else if (benchmarkCount === 1) physical += 3;
  breakdown.physical = { score: physical, max: 15, label: "Physical Profile" };

  // Positions (5)
  let positions = 0;
  if (data.positions.primary_position)        positions += 3;
  if (data.positions.secondary_positions.length > 0) positions += 2;
  breakdown.positions = { score: positions, max: 5, label: "Playing Positions" };

  // Player profile (10)
  let profile = 0;
  if (data.playerProfile.ai_summary_status === "approved")      profile = 10;
  else if (data.playerProfile.ai_summary)                       profile = 5;
  breakdown.player_profile = { score: profile, max: 10, label: "Player Profile" };

  // Verified performance (15)
  let perf = 0;
  if (data.verifiedPerformance.sessions_total >= 20)  perf += 8;
  else if (data.verifiedPerformance.sessions_total >= 10) perf += 5;
  const weeks = Math.round(data.verifiedPerformance.training_age_months * 4.33);
  if (weeks >= 8)  perf += 7;
  else if (weeks >= 4) perf += 4;
  breakdown.verified_performance = { score: perf, max: 15, label: "Verified Performance" };

  // Career history (15)
  const career = data.career.length > 0 ? 15 : 0;
  breakdown.career_history = { score: career, max: 15, label: "Career History" };

  // Video & media (15)
  const media = data.media.some(m => m.media_type === "highlight_reel") ? 15 : 0;
  breakdown.video_media = { score: media, max: 15, label: "Video & Media" };

  // References (8) — published = fully countable
  const published = data.references.filter(r => r.status === "published").length;
  const references = published > 0 ? 8 : 0;
  breakdown.references = { score: references, max: 8, label: "References" };

  // Awards & character (6)
  const awards = data.awardsCharacter.total_count > 0 ? 6 : 0;
  breakdown.awards_character = { score: awards, max: 6, label: "Awards & Character" };

  // Health status (1)
  const health = data.healthStatus.medical_consent.signed ? 1 : 0;
  breakdown.health_status = { score: health, max: 1, label: "Health Status" };

  const total = Object.values(breakdown).reduce((s, r) => s + r.score, 0);
  const max = Object.values(breakdown).reduce((s, r) => s + r.max, 0);
  const pct = max > 0 ? Math.round((total / max) * 100) : 0;

  return { pct, total, max, breakdown };
}
