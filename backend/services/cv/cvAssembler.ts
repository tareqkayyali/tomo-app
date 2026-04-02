/**
 * CV Assembler — Reads from ALL Tomo data sources to build a complete CV object.
 *
 * ~80% auto-populated from athlete data fabric.
 * ~20% from manual CV-specific tables (career, academic, media, references, traits).
 *
 * This is the single entry point for CV data. Every UI and export reads from here.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getPlayerBenchmarkProfile, getMetricTrajectory } from "../benchmarkService";
import type { BenchmarkResult, BenchmarkProfile, MetricTrajectoryPoint } from "../benchmarkService";
import { computeCoachabilityIndex, type CoachabilityResult } from "./coachabilityIndex";
import { computeCVCompleteness, type CVCompletenessResult } from "./cvCompleteness";

const db = () => supabaseAdmin();

// ── Types ──────────────────────────────────────────────────────────────────

export interface CVIdentity {
  full_name: string;
  date_of_birth: string | null;
  age: number | null;
  nationality: string | null;
  passport_country: string | null;
  city_country: string | null;   // region field
  photo_url: string | null;
  email: string;
  phone: string | null;
  sport: string;
  position: string | null;
  preferred_foot: string | null;
  playing_style: string | null;
  secondary_positions: string[] | null;
  guardian_name: string | null;
  guardian_email: string | null;
  guardian_phone: string | null;
}

export interface CVPhysicalProfile {
  height_cm: number | null;
  weight_kg: number | null;
  phv_stage: string | null;       // PRE | CIRCA | POST
  phv_offset_years: number | null;
  academic_year: number | null;
}

export interface CVPositions {
  primary_position: string | null;
  secondary_positions: string[];
  formation_preference: string | null;
  dominant_zone: string | null;
}

export interface CVBenchmarkResult {
  metric_key: string;
  metric_label: string;
  value: number;
  unit: string;
  percentile: number;
  zone: string;
  direction: string;
  age_band: string;
  position: string;
  tested_at: string | null;
}

export interface CVPerformanceData {
  // Training consistency
  sessions_total: number;
  training_age_weeks: number;
  training_age_months: number;
  streak_days: number;
  last_session_at: string | null;
  last_checkin_at: string | null;

  // Load management
  acwr: number | null;
  atl_7day: number | null;
  ctl_28day: number | null;
  injury_risk_flag: string | null;

  // Wellness
  readiness_score: number | null;
  readiness_rag: string | null;
  wellness_7day_avg: number | null;
  wellness_trend: string | null;

  // Benchmarks
  benchmark_profile: BenchmarkProfile | null;
  benchmarks: CVBenchmarkResult[];
  overall_percentile: number | null;
  strengths: string[];
  gaps: string[];

  // Coachability
  coachability: CoachabilityResult | null;

  // Data period
  data_start_date: string | null;
  verified_by: "tomo_platform";
}

export interface CVTrajectory {
  metric_trends: {
    metric_key: string;
    metric_label: string;
    data_points: MetricTrajectoryPoint[];
    total_improvement_pct: number | null;
  }[];
  narrative: string | null;
  narrative_last_generated: string | null;
}

export interface CVCompetitionEntry {
  id: string;
  competition_name: string | null;
  opponent: string | null;
  result: string | null;
  minutes_played: number | null;
  performance_notes: string | null;
  stats: Record<string, number> | null;
  date: string;
}

export interface CVCareerEntry {
  id: string;
  entry_type: string;
  club_name: string;
  league_level: string | null;
  country: string | null;
  position: string | null;
  started_month: string | null;
  ended_month: string | null;
  is_current: boolean;
  appearances: number | null;
  goals: number | null;
  assists: number | null;
  clean_sheets: number | null;
  achievements: string[];
  injury_note: string | null;
}

export interface CVAcademicEntry {
  id: string;
  institution: string;
  country: string | null;
  qualification: string | null;
  year_start: number | null;
  year_end: number | null;
  gpa: string | null;
  gpa_scale: string | null;
  predicted_grade: string | null;
  honours: string[];
  ncaa_eligibility_id: string | null;
  is_current: boolean;
}

export interface CVDualRoleCompetency {
  dual_load_index: number | null;
  academic_load_7day: number | null;
  exam_period_training_rate: number | null;
  narrative: string | null;
  narrative_last_generated: string | null;
}

export interface CVMediaLink {
  id: string;
  media_type: string;
  platform: string | null;
  url: string;
  title: string | null;
  is_primary: boolean;
}

export interface CVReference {
  id: string;
  referee_name: string;
  referee_role: string;
  club_institution: string;
  email: string | null;
  phone: string | null;
  relationship: string | null;
  consent_given: boolean;
}

export interface CVCharacterTrait {
  id: string;
  trait_category: string;
  title: string;
  description: string | null;
  level: string | null;
  date: string | null;
}

export interface CVInjuryStatus {
  has_active_injury: boolean;
  pain_location: string | null;
  current_stage: number | null;
  cleared_at: string | null;
  status_label: string;  // "Fully fit" | "Returning — Stage 3/5" | "Injured"
}

export interface CVStatements {
  personal_statement_club: string | null;
  personal_statement_uni: string | null;
  statement_status: string;
  statement_last_generated: string | null;
}

export interface CVShareInfo {
  share_token_club: string | null;
  share_token_uni: string | null;
  share_club_views: number;
  share_uni_views: number;
  cv_club_discoverable: boolean;
  cv_uni_discoverable: boolean;
}

/** Section state for UI indicators */
export type CVSectionState =
  | "auto_complete"
  | "needs_input"
  | "ai_draft_pending"
  | "approved"
  | "insufficient_data";

export interface CVSectionStatus {
  identity: CVSectionState;
  physical: CVSectionState;
  positions: CVSectionState;
  personal_statement: CVSectionState;
  career_history: CVSectionState;
  performance_data: CVSectionState;
  trajectory: CVSectionState;
  coachability: CVSectionState;
  competitions: CVSectionState;
  academic: CVSectionState;
  dual_role: CVSectionState;
  video_media: CVSectionState;
  references: CVSectionState;
  character_traits: CVSectionState;
}

export interface FullCVBundle {
  // Identity & profile
  identity: CVIdentity;
  physical: CVPhysicalProfile;
  positions: CVPositions;

  // AI-generated
  statements: CVStatements;
  trajectory: CVTrajectory;
  dual_role: CVDualRoleCompetency;

  // Auto-populated from data fabric
  performance: CVPerformanceData;
  competitions: CVCompetitionEntry[];
  injury_status: CVInjuryStatus;

  // Manual entry sections
  career: CVCareerEntry[];
  academic: CVAcademicEntry[];
  media: CVMediaLink[];
  references: CVReference[];
  character_traits: CVCharacterTrait[];

  // Meta
  completeness: CVCompletenessResult;
  section_states: CVSectionStatus;
  share: CVShareInfo;
  last_updated: string;
}

// ── Assembler ──────────────────────────────────────────────────────────────

export async function assembleCVBundle(athleteId: string): Promise<FullCVBundle> {
  // Parallel fetch from all data sources
  const [
    userRes,
    snapshotRes,
    cvProfileRes,
    careerRes,
    academicRes,
    mediaRes,
    refsRes,
    traitsRes,
    competitionsRes,
    rtpRes,
    journalsRes,
  ] = await Promise.all([
    // User profile
    (db() as any).from("users").select("*").eq("id", athleteId).single(),
    // Athlete snapshot
    (db() as any).from("athlete_snapshots").select("*").eq("athlete_id", athleteId).single(),
    // CV profile (AI statements, visibility, share tokens)
    (db() as any).from("cv_profiles").select("*").eq("athlete_id", athleteId).single(),
    // Career entries
    (db() as any).from("cv_career_entries").select("*").eq("athlete_id", athleteId).order("display_order"),
    // Academic entries
    (db() as any).from("cv_academic_entries").select("*").eq("athlete_id", athleteId).order("year_start", { ascending: false }),
    // Media links
    (db() as any).from("cv_media_links").select("*").eq("athlete_id", athleteId).order("display_order"),
    // References
    (db() as any).from("cv_references").select("*").eq("athlete_id", athleteId).order("display_order"),
    // Character traits
    (db() as any).from("cv_character_traits").select("*").eq("athlete_id", athleteId).order("display_order"),
    // Competition results from events
    (db() as any)
      .from("athlete_events")
      .select("id, event_type, payload, created_at")
      .eq("athlete_id", athleteId)
      .eq("event_type", "COMPETITION_RESULT")
      .order("created_at", { ascending: false })
      .limit(30),
    // Return-to-play (injury status)
    (db() as any)
      .from("return_to_play")
      .select("*")
      .eq("user_id", athleteId)
      .is("cleared_at", null)
      .order("injury_date", { ascending: false })
      .limit(1),
    // Training journals (for coachability)
    (db() as any)
      .from("training_journals")
      .select("post_outcome, journal_state")
      .eq("athlete_id", athleteId)
      .eq("journal_state", "complete")
      .limit(100),
  ]);

  const user = userRes.data ?? {};
  const snapshot = snapshotRes.data ?? {};
  const cvProfile = cvProfileRes.data ?? {};
  const career: CVCareerEntry[] = (careerRes.data ?? []).map(mapCareerEntry);
  const academic: CVAcademicEntry[] = (academicRes.data ?? []).map(mapAcademicEntry);
  const media: CVMediaLink[] = (mediaRes.data ?? []).map(mapMediaLink);
  const references: CVReference[] = (refsRes.data ?? []).map(mapReference);
  const characterTraits: CVCharacterTrait[] = (traitsRes.data ?? []).map(mapCharacterTrait);
  const competitions: CVCompetitionEntry[] = (competitionsRes.data ?? []).map(mapCompetition);
  const activeRtp = rtpRes.data?.[0] ?? null;
  const completedJournals = journalsRes.data ?? [];

  // Fetch benchmark profile (separate call — has its own DB logic)
  let benchmarkProfile: BenchmarkProfile | null = null;
  try {
    benchmarkProfile = await getPlayerBenchmarkProfile(athleteId);
  } catch {
    // Graceful degradation — CV works without benchmarks
  }

  // Fetch trajectory for top 3 improving metrics
  const trajectoryMetrics = await buildTrajectory(athleteId, benchmarkProfile);

  // Compute coachability from journals + snapshot
  const coachability = computeCoachabilityIndex(snapshot, completedJournals);

  // Build identity section
  const identity: CVIdentity = {
    full_name: user.name ?? "",
    date_of_birth: user.date_of_birth ?? snapshot.dob ?? null,
    age: user.age ?? null,
    nationality: user.nationality ?? null,
    passport_country: user.passport_country ?? null,
    city_country: user.region ?? null,
    photo_url: user.avatar_url ?? user.photo_url ?? null,
    email: user.email ?? "",
    phone: null, // not stored on users table
    sport: user.sport ?? snapshot.sport ?? "football",
    position: snapshot.position ?? user.position ?? null,
    preferred_foot: user.preferred_foot ?? null,
    playing_style: user.playing_style ?? null,
    secondary_positions: user.secondary_positions ?? null,
    guardian_name: user.parent_guardian_name ?? null,
    guardian_email: user.parent_guardian_email ?? null,
    guardian_phone: user.parent_guardian_phone ?? null,
  };

  // Build physical profile
  const physical: CVPhysicalProfile = {
    height_cm: snapshot.height_cm ?? user.height_cm ?? null,
    weight_kg: snapshot.weight_kg ?? user.weight_kg ?? null,
    phv_stage: snapshot.phv_stage ?? null,
    phv_offset_years: snapshot.phv_offset_years ?? null,
    academic_year: snapshot.academic_year ?? null,
  };

  // Build positions
  const positions: CVPositions = {
    primary_position: snapshot.position ?? user.position ?? null,
    secondary_positions: user.secondary_positions ?? [],
    formation_preference: cvProfile.formation_preference ?? null,
    dominant_zone: cvProfile.dominant_zone ?? null,
  };

  // Build benchmarks for CV display
  const cvBenchmarks: CVBenchmarkResult[] = (benchmarkProfile?.results ?? []).map((r: BenchmarkResult) => ({
    metric_key: r.metricKey,
    metric_label: r.metricLabel,
    value: r.value,
    unit: r.unit,
    percentile: r.percentile,
    zone: r.zone,
    direction: r.direction,
    age_band: r.ageBand,
    position: r.position,
    tested_at: null, // populated from benchmark profile
  }));

  // Build performance data
  const accountCreated = user.created_at ?? null;
  const performance: CVPerformanceData = {
    sessions_total: snapshot.sessions_total ?? 0,
    training_age_weeks: snapshot.training_age_weeks ?? 0,
    training_age_months: snapshot.training_age_months ?? Math.round((snapshot.training_age_weeks ?? 0) / 4.33),
    streak_days: snapshot.streak_days ?? 0,
    last_session_at: snapshot.last_session_at ?? null,
    last_checkin_at: snapshot.last_checkin_at ?? null,
    acwr: snapshot.acwr ?? null,
    atl_7day: snapshot.atl_7day ?? null,
    ctl_28day: snapshot.ctl_28day ?? null,
    injury_risk_flag: snapshot.injury_risk_flag ?? null,
    readiness_score: snapshot.readiness_score ?? null,
    readiness_rag: snapshot.readiness_rag ?? null,
    wellness_7day_avg: snapshot.wellness_7day_avg ?? null,
    wellness_trend: snapshot.wellness_trend ?? null,
    benchmark_profile: benchmarkProfile,
    benchmarks: cvBenchmarks,
    overall_percentile: benchmarkProfile?.overallPercentile ?? null,
    strengths: benchmarkProfile?.strengths ?? [],
    gaps: benchmarkProfile?.gaps ?? [],
    coachability,
    data_start_date: accountCreated,
    verified_by: "tomo_platform",
  };

  // Build trajectory
  const trajectory: CVTrajectory = {
    metric_trends: trajectoryMetrics,
    narrative: cvProfile.trajectory_narrative ?? null,
    narrative_last_generated: cvProfile.trajectory_last_generated ?? null,
  };

  // Build dual-role competency
  const dualRole: CVDualRoleCompetency = {
    dual_load_index: snapshot.dual_load_index ?? null,
    academic_load_7day: snapshot.academic_load_7day ?? null,
    exam_period_training_rate: snapshot.exam_period_training_rate ?? null,
    narrative: cvProfile.dual_role_narrative ?? null,
    narrative_last_generated: cvProfile.dual_role_last_generated ?? null,
  };

  // Build injury status
  const injuryStatus: CVInjuryStatus = buildInjuryStatus(activeRtp);

  // Build statements
  const statements: CVStatements = {
    personal_statement_club: cvProfile.personal_statement_club ?? null,
    personal_statement_uni: cvProfile.personal_statement_uni ?? null,
    statement_status: cvProfile.statement_status ?? "draft",
    statement_last_generated: cvProfile.statement_last_generated ?? null,
  };

  // Build share info
  const share: CVShareInfo = {
    share_token_club: cvProfile.share_token_club ?? null,
    share_token_uni: cvProfile.share_token_uni ?? null,
    share_club_views: cvProfile.share_club_views ?? 0,
    share_uni_views: cvProfile.share_uni_views ?? 0,
    cv_club_discoverable: cvProfile.cv_club_discoverable ?? false,
    cv_uni_discoverable: cvProfile.cv_uni_discoverable ?? false,
  };

  // Compute completeness
  const completeness = computeCVCompleteness({
    identity,
    physical,
    positions,
    statements,
    performance,
    career,
    academic,
    media,
    references,
    characterTraits,
    competitions,
  });

  // Compute section states
  const sectionStates = computeSectionStates({
    identity,
    physical,
    positions,
    statements,
    performance,
    career,
    academic,
    media,
    references,
    characterTraits,
    competitions,
    trajectory,
    dualRole,
    coachability,
  });

  return {
    identity,
    physical,
    positions,
    statements,
    trajectory,
    dual_role: dualRole,
    performance,
    competitions,
    injury_status: injuryStatus,
    career,
    academic,
    media,
    references,
    character_traits: characterTraits,
    completeness,
    section_states: sectionStates,
    share,
    last_updated: snapshot.snapshot_at ?? new Date().toISOString(),
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function buildTrajectory(
  athleteId: string,
  benchmarkProfile: BenchmarkProfile | null
): Promise<CVTrajectory["metric_trends"]> {
  if (!benchmarkProfile?.results?.length) return [];

  // Pick top 3 metrics by percentile for trajectory display
  const topMetrics = [...benchmarkProfile.results]
    .sort((a, b) => b.percentile - a.percentile)
    .slice(0, 3);

  const trends: CVTrajectory["metric_trends"] = [];

  for (const metric of topMetrics) {
    try {
      const trajectory = await getMetricTrajectory(
        athleteId,
        metric.metricKey,
        12 // last 12 months
      );
      if (trajectory.length >= 2) {
        const first = trajectory[0];
        const last = trajectory[trajectory.length - 1];
        const improvementPct =
          first.value !== 0
            ? Math.round(((last.value - first.value) / Math.abs(first.value)) * 100)
            : null;

        trends.push({
          metric_key: metric.metricKey,
          metric_label: metric.metricLabel,
          data_points: trajectory,
          total_improvement_pct: improvementPct,
        });
      }
    } catch {
      // Skip metric if trajectory fails
    }
  }

  return trends;
}

function buildInjuryStatus(activeRtp: any): CVInjuryStatus {
  if (!activeRtp) {
    return {
      has_active_injury: false,
      pain_location: null,
      current_stage: null,
      cleared_at: null,
      status_label: "Fully fit — no current injuries",
    };
  }

  if (activeRtp.cleared_at) {
    return {
      has_active_injury: false,
      pain_location: activeRtp.pain_location,
      current_stage: null,
      cleared_at: activeRtp.cleared_at,
      status_label: `Cleared — ${activeRtp.cleared_at}`,
    };
  }

  return {
    has_active_injury: true,
    pain_location: activeRtp.pain_location ?? null,
    current_stage: activeRtp.current_stage ?? null,
    cleared_at: null,
    status_label: `Returning — Stage ${activeRtp.current_stage ?? "?"}/5 (${activeRtp.pain_location ?? "unspecified"})`,
  };
}

function computeSectionStates(data: {
  identity: CVIdentity;
  physical: CVPhysicalProfile;
  positions: CVPositions;
  statements: CVStatements;
  performance: CVPerformanceData;
  career: CVCareerEntry[];
  academic: CVAcademicEntry[];
  media: CVMediaLink[];
  references: CVReference[];
  characterTraits: CVCharacterTrait[];
  competitions: CVCompetitionEntry[];
  trajectory: CVTrajectory;
  dualRole: CVDualRoleCompetency;
  coachability: CoachabilityResult | null;
}): CVSectionStatus {
  return {
    identity: data.identity.full_name && data.identity.date_of_birth && data.identity.nationality
      ? "auto_complete"
      : data.identity.full_name
        ? "needs_input"
        : "insufficient_data",

    physical: data.physical.height_cm && data.physical.weight_kg
      ? "auto_complete"
      : "insufficient_data",

    positions: data.positions.primary_position ? "auto_complete" : "needs_input",

    personal_statement: data.statements.statement_status === "approved"
      ? "approved"
      : data.statements.personal_statement_club
        ? "ai_draft_pending"
        : "needs_input",

    career_history: data.career.length > 0 ? "auto_complete" : "needs_input",

    performance_data: data.performance.benchmarks.length >= 2 && data.performance.sessions_total >= 10
      ? "auto_complete"
      : data.performance.sessions_total >= 1
        ? "insufficient_data"
        : "insufficient_data",

    trajectory: data.trajectory.metric_trends.length >= 1
      ? "auto_complete"
      : "insufficient_data",

    coachability: data.coachability && data.coachability.score >= 0
      ? "auto_complete"
      : "insufficient_data",

    competitions: data.competitions.length > 0 ? "auto_complete" : "needs_input",

    academic: data.academic.length > 0 ? "auto_complete" : "needs_input",

    dual_role: data.dualRole.dual_load_index != null
      ? "auto_complete"
      : "insufficient_data",

    video_media: data.media.length > 0 ? "auto_complete" : "needs_input",

    references: data.references.filter(r => r.consent_given).length > 0
      ? "auto_complete"
      : data.references.length > 0
        ? "needs_input"
        : "needs_input",

    character_traits: data.characterTraits.length > 0 ? "auto_complete" : "needs_input",
  };
}

// ── Row mappers ────────────────────────────────────────────────────────────

function mapCareerEntry(row: any): CVCareerEntry {
  return {
    id: row.id,
    entry_type: row.entry_type,
    club_name: row.club_name,
    league_level: row.league_level ?? null,
    country: row.country ?? null,
    position: row.position ?? null,
    started_month: row.started_month ?? null,
    ended_month: row.ended_month ?? null,
    is_current: row.is_current ?? false,
    appearances: row.appearances ?? null,
    goals: row.goals ?? null,
    assists: row.assists ?? null,
    clean_sheets: row.clean_sheets ?? null,
    achievements: row.achievements ?? [],
    injury_note: row.injury_note ?? null,
  };
}

function mapAcademicEntry(row: any): CVAcademicEntry {
  return {
    id: row.id,
    institution: row.institution,
    country: row.country ?? null,
    qualification: row.qualification ?? null,
    year_start: row.year_start ?? null,
    year_end: row.year_end ?? null,
    gpa: row.gpa ?? null,
    gpa_scale: row.gpa_scale ?? null,
    predicted_grade: row.predicted_grade ?? null,
    honours: row.honours ?? [],
    ncaa_eligibility_id: row.ncaa_eligibility_id ?? null,
    is_current: row.is_current ?? false,
  };
}

function mapMediaLink(row: any): CVMediaLink {
  return {
    id: row.id,
    media_type: row.media_type,
    platform: row.platform ?? null,
    url: row.url,
    title: row.title ?? null,
    is_primary: row.is_primary ?? false,
  };
}

function mapReference(row: any): CVReference {
  return {
    id: row.id,
    referee_name: row.referee_name,
    referee_role: row.referee_role,
    club_institution: row.club_institution,
    email: row.email ?? null,
    phone: row.phone ?? null,
    relationship: row.relationship ?? null,
    consent_given: row.consent_given ?? false,
  };
}

function mapCharacterTrait(row: any): CVCharacterTrait {
  return {
    id: row.id,
    trait_category: row.trait_category,
    title: row.title,
    description: row.description ?? null,
    level: row.level ?? null,
    date: row.date ?? null,
  };
}

function mapCompetition(row: any): CVCompetitionEntry {
  const payload = row.payload ?? {};
  return {
    id: row.id,
    competition_name: payload.competition_name ?? null,
    opponent: payload.opponent ?? null,
    result: payload.result ?? null,
    minutes_played: payload.minutes_played ?? null,
    performance_notes: payload.performance_notes ?? null,
    stats: payload.stats ?? null,
    date: row.created_at,
  };
}
