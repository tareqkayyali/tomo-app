/**
 * CV Assembler — Single source of truth for the Player CV bundle.
 *
 * Reads from:
 *   users, athlete_snapshots, cv_profiles, cv_career_entries, cv_media_links,
 *   cv_references, cv_character_traits, cv_injury_log, cv_ai_summary_versions,
 *   calendar_events (session log), benchmarkService.
 *
 * Matches the 12-screen single-flow CV design (migration 094).
 * Every UI (mobile, public share page, PDF export) reads from here.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getPlayerBenchmarkProfile } from "../benchmarkService";
import type { BenchmarkResult, BenchmarkProfile } from "../benchmarkService";
import { computeCVCompleteness, type CVCompletenessResult } from "./cvCompleteness";
import { buildNextSteps, type CVNextStep } from "./cvNextSteps";

const db = () => supabaseAdmin();

// ── Position metadata (football — other sports extend this later) ──

const POSITION_META: Record<string, { label: string; description: string }> = {
  GK:  { label: "Goalkeeper",                description: "Last line · commands the box" },
  CB:  { label: "Centre Back",               description: "Back four · reads the game" },
  FB:  { label: "Full Back",                 description: "Wide defender · overlaps" },
  LB:  { label: "Left Back",                 description: "Left flank · overlaps" },
  RB:  { label: "Right Back",                description: "Right flank · overlaps" },
  CDM: { label: "Defensive Midfielder",      description: "Screen · sets the tempo" },
  CM:  { label: "Central Midfielder",        description: "Box to box · link player" },
  CAM: { label: "Central Attacking Midfielder", description: "Playmaker · behind the striker" },
  WM:  { label: "Wide Midfielder",           description: "Flank · stretch the pitch" },
  LW:  { label: "Left Winger",               description: "Left flank · 1v1 threat" },
  RW:  { label: "Right Winger",              description: "Right flank · 1v1 threat" },
  ST:  { label: "Striker",                   description: "Centre forward · finishes" },
  CF:  { label: "Centre Forward",            description: "Link-up · finishes" },
};

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CVIdentity {
  full_name: string;
  date_of_birth: string | null;
  age: number | null;
  nationality: string | null;
  passport_country: string | null;
  city_country: string | null;
  photo_url: string | null;
  email: string;
  sport: string;
  primary_position: string | null;
  preferred_foot: string | null;
  age_group: string | null;
  phv_stage: string | null;
  phv_offset_years: number | null;
  guardian_name: string | null;
  guardian_email: string | null;
  guardian_phone: string | null;
}

export interface CVPhysicalProfile {
  height_cm: number | null;
  weight_kg: number | null;
  phv_stage: string | null;
  phv_offset_years: number | null;
}

export interface CVPositions {
  primary_position: string | null;
  primary_label: string | null;
  primary_description: string | null;
  secondary_positions: string[];
  formation_preference: string | null;
  dominant_zone: string | null;
  is_set: boolean;
  has_secondary: boolean;
}

export interface CVBenchmarkRow {
  metric_key: string;
  metric_label: string;
  value: number;
  unit: string;
  percentile: number;
  zone: "elite" | "on_par" | "dev_priority";
  direction: "higher_is_better" | "lower_is_better";
  age_band: string;
  position: string;
  tested_at: string | null;
}

export interface CVKeySignal {
  metric_key: string;
  label: string;
  detail: string;
  percentile_label: string;
  kind: "strength" | "focus";
}

export interface CVSummaryVersion {
  version_number: number;
  generated_at: string;
  approved: boolean;
  approved_at: string | null;
}

export interface CVPlayerProfile {
  ai_summary: string | null;
  ai_summary_status: "draft" | "approved" | "needs_update";
  ai_summary_last_generated: string | null;
  ai_summary_approved_at: string | null;
  key_signals: {
    strengths: CVKeySignal[];
    focus_areas: CVKeySignal[];
    physical_maturity: { label: string; detail: string } | null;
  };
  versions: CVSummaryVersion[];
}

export interface CVSessionLogEntry {
  date: string;
  title: string;
  category: string;
  duration_min: number | null;
  load_au: number | null;
}

export interface CVVerifiedPerformance {
  sessions_total: number;
  training_age_months: number;
  training_age_label: string;
  streak_days: number;
  acwr: number | null;
  training_balance: "under" | "balanced" | "over" | null;
  benchmarks: CVBenchmarkRow[];
  strength_zones: CVBenchmarkRow[];
  development_focus: CVBenchmarkRow[];
  overall_percentile: number | null;
  session_log: CVSessionLogEntry[];
  data_start_date: string | null;
  verified_by: "tomo_platform";
}

export interface CVCareerEntry {
  id: string;
  entry_type: "club" | "academy" | "national_team" | "trial" | "camp" | "showcase";
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

export interface CVMediaLink {
  id: string;
  media_type: "highlight_reel" | "full_match" | "training" | "social";
  platform: string | null;
  url: string;
  title: string | null;
  is_primary: boolean;
}

export interface CVReferenceEntry {
  id: string;
  referee_name: string;
  referee_role: string;
  club_institution: string;
  email: string | null;
  phone: string | null;
  relationship: string | null;
  status: "requested" | "submitted" | "identity_verified" | "published" | "rejected";
  request_sent_at: string | null;
  submitted_at: string | null;
  submitted_rating: number | null;
  submitted_note: string | null;
  published_at: string | null;
}

export interface CVCharacterTrait {
  id: string;
  trait_category: "award" | "leadership" | "language" | "character";
  title: string;
  description: string | null;
  level: string | null;
  date: string | null;
}

export interface CVAwardsCharacter {
  awards: CVCharacterTrait[];
  leadership: CVCharacterTrait[];
  languages: CVCharacterTrait[];
  character: CVCharacterTrait[];
  total_count: number;
}

export interface CVInjuryEntry {
  id: string;
  body_part: string;
  side: string | null;
  severity: "minor" | "moderate" | "major";
  status: "active" | "recovering" | "cleared";
  date_occurred: string;
  cleared_at: string | null;
  notes: string | null;
}

export interface CVHealthStatus {
  overall: "fully_fit" | "returning" | "injured";
  status_label: string;
  status_detail: string;
  updated_at: string;
  availability: {
    match_ready: boolean;
    training_load: "full" | "partial" | "rest";
    restrictions: string[];
    last_screening_date: string | null;
  };
  injury_log: CVInjuryEntry[];
  medical_consent: {
    share_with_coach: boolean;
    share_with_scouts_summary: boolean;
    share_raw_data: boolean;
    signed: boolean;
  };
}

export interface CVShareInfo {
  share_slug: string | null;
  share_views_count: number;
  is_published: boolean;
  public_url: string | null;
  last_pdf_export_at: string | null;
}

export interface CVAcademicSubject {
  name: string;
  level: string | null;
  grade: number | null;
  grade_max: number;
  trend: "up" | "stable" | "down" | null;
}

export interface CVAcademicProfile {
  school_name: string | null;
  diploma_program: string | null;
  grade_year: string | null;
  program_label: string | null;
  gpa_current: number | null;
  gpa_max: number;
  class_rank_pct: number | null;
  attendance_pct: number | null;
  exam_session_label: string | null;
  dual_load_note: string | null;
  subjects: CVAcademicSubject[];
}

export type CVSectionState =
  | "auto_complete"
  | "needs_input"
  | "ai_draft_pending"
  | "approved"
  | "insufficient_data"
  | "empty";

export interface CVSectionStatus {
  identity: CVSectionState;
  player_profile: CVSectionState;
  physical_profile: CVSectionState;
  playing_positions: CVSectionState;
  verified_performance: CVSectionState;
  career_history: CVSectionState;
  video_media: CVSectionState;
  references: CVSectionState;
  awards_character: CVSectionState;
  health_status: CVSectionState;
}

export interface FullCVBundle {
  identity: CVIdentity;
  physical: CVPhysicalProfile;
  positions: CVPositions;
  player_profile: CVPlayerProfile;
  verified_performance: CVVerifiedPerformance;
  career: CVCareerEntry[];
  media: CVMediaLink[];
  references: CVReferenceEntry[];
  awards_character: CVAwardsCharacter;
  health_status: CVHealthStatus;
  academic: CVAcademicProfile | null;
  completeness_pct: number;
  completeness_breakdown: CVCompletenessResult["breakdown"];
  next_steps: CVNextStep[];
  section_states: CVSectionStatus;
  share: CVShareInfo;
  last_updated: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// ASSEMBLER
// ═══════════════════════════════════════════════════════════════════════════

export async function assembleCVBundle(athleteId: string): Promise<FullCVBundle> {
  const sevenDaysAgoIso = new Date(Date.now() - 7 * 86400000).toISOString();

  const [
    userRes,
    snapshotRes,
    cvProfileRes,
    careerRes,
    mediaRes,
    refsRes,
    traitsRes,
    injuryRes,
    versionsRes,
    sessionLogRes,
    academicRes,
  ] = await Promise.all([
    (db() as any).from("users").select("*").eq("id", athleteId).single(),
    (db() as any).from("athlete_snapshots").select("*").eq("athlete_id", athleteId).single(),
    (db() as any).from("cv_profiles").select("*").eq("athlete_id", athleteId).single(),
    (db() as any).from("cv_career_entries").select("*").eq("athlete_id", athleteId).order("display_order"),
    (db() as any).from("cv_media_links").select("*").eq("athlete_id", athleteId).order("display_order"),
    (db() as any).from("cv_references").select("*").eq("athlete_id", athleteId).order("display_order"),
    (db() as any).from("cv_character_traits").select("*").eq("athlete_id", athleteId).order("display_order"),
    (db() as any).from("cv_injury_log").select("*").eq("athlete_id", athleteId).order("date_occurred", { ascending: false }),
    (db() as any).from("cv_ai_summary_versions").select("version_number, generated_at, approved, approved_at").eq("athlete_id", athleteId).order("version_number", { ascending: false }),
    (db() as any)
      .from("calendar_events")
      .select("title, event_type, start_at, end_at, estimated_load_au")
      .eq("user_id", athleteId)
      .eq("status", "completed")
      .gte("start_at", sevenDaysAgoIso)
      .order("start_at", { ascending: false })
      .limit(10),
    (db() as any).from("cv_academic_profile").select("*").eq("athlete_id", athleteId).maybeSingle(),
  ]);

  const user = userRes.data ?? {};
  const snapshot = snapshotRes.data ?? {};
  const cvProfile = cvProfileRes.data ?? {};
  const academic: CVAcademicProfile | null = buildAcademicProfile(academicRes.data);
  const career: CVCareerEntry[] = (careerRes.data ?? []).map(mapCareerEntry);
  const media: CVMediaLink[] = (mediaRes.data ?? []).map(mapMediaLink);
  const references: CVReferenceEntry[] = (refsRes.data ?? [])
    .filter((r: any) => r.status !== "rejected")
    .map(mapReferenceEntry);
  const traits: CVCharacterTrait[] = (traitsRes.data ?? []).map(mapCharacterTrait);
  const injuries: CVInjuryEntry[] = (injuryRes.data ?? []).map(mapInjuryEntry);
  const versions: CVSummaryVersion[] = (versionsRes.data ?? []).map((v: any) => ({
    version_number: v.version_number,
    generated_at: v.generated_at,
    approved: v.approved,
    approved_at: v.approved_at,
  }));
  const sessionLog: CVSessionLogEntry[] = (sessionLogRes.data ?? []).map(mapSessionLog);

  // Benchmarks (graceful degradation)
  let benchmarkProfile: BenchmarkProfile | null = null;
  try {
    benchmarkProfile = await getPlayerBenchmarkProfile(athleteId);
  } catch {
    // CV renders without benchmarks
  }

  const identity = buildIdentity(user, snapshot);
  const physical = buildPhysicalProfile(user, snapshot);
  const positions = buildPositions(user, snapshot, cvProfile);
  const verifiedPerformance = buildVerifiedPerformance(snapshot, user, benchmarkProfile, sessionLog);
  const playerProfile = buildPlayerProfile(cvProfile, verifiedPerformance, physical, versions);
  const awardsCharacter = groupAwardsCharacter(traits);
  const healthStatus = buildHealthStatus(cvProfile, injuries);

  const shareSlug = cvProfile.share_slug ?? null;
  const publicUrl = shareSlug ? buildPublicShareUrl(shareSlug) : null;
  const share: CVShareInfo = {
    share_slug: shareSlug,
    share_views_count: cvProfile.share_views_count ?? 0,
    is_published: cvProfile.is_published ?? false,
    public_url: publicUrl,
    last_pdf_export_at: cvProfile.last_pdf_export_at ?? null,
  };

  const sectionStates = computeSectionStates({
    identity,
    physical,
    positions,
    playerProfile,
    verifiedPerformance,
    career,
    media,
    references,
    awardsCharacter,
    healthStatus,
  });

  const completeness = computeCVCompleteness({
    identity,
    physical,
    positions,
    playerProfile,
    verifiedPerformance,
    career,
    media,
    references,
    awardsCharacter,
    healthStatus,
  });

  const nextSteps = buildNextSteps({
    completenessPct: completeness.pct,
    positions,
    career,
    media,
    references,
    awardsCharacter,
    playerProfile,
    healthStatus,
  });

  return {
    identity,
    physical,
    positions,
    player_profile: playerProfile,
    verified_performance: verifiedPerformance,
    career,
    media,
    references,
    awards_character: awardsCharacter,
    health_status: healthStatus,
    academic,
    completeness_pct: completeness.pct,
    completeness_breakdown: completeness.breakdown,
    next_steps: nextSteps,
    section_states: sectionStates,
    share,
    last_updated: snapshot.snapshot_at ?? new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

function buildIdentity(user: any, snapshot: any): CVIdentity {
  const primaryPosition = snapshot.position ?? user.position ?? null;
  return {
    full_name: user.name ?? "",
    date_of_birth: user.date_of_birth ?? snapshot.dob ?? null,
    age: user.age ?? null,
    nationality: user.nationality ?? null,
    passport_country: user.passport_country ?? null,
    city_country: user.region ?? null,
    photo_url: user.avatar_url ?? user.photo_url ?? null,
    email: user.email ?? "",
    sport: user.sport ?? snapshot.sport ?? "football",
    primary_position: primaryPosition,
    preferred_foot: user.preferred_foot ?? null,
    age_group: deriveAgeGroup(user.age, user.date_of_birth),
    phv_stage: snapshot.phv_stage ?? null,
    phv_offset_years: snapshot.phv_offset_years ?? null,
    guardian_name: user.parent_guardian_name ?? null,
    guardian_email: user.parent_guardian_email ?? null,
    guardian_phone: user.parent_guardian_phone ?? null,
  };
}

function buildPhysicalProfile(user: any, snapshot: any): CVPhysicalProfile {
  return {
    height_cm: snapshot.height_cm ?? user.height_cm ?? null,
    weight_kg: snapshot.weight_kg ?? user.weight_kg ?? null,
    phv_stage: snapshot.phv_stage ?? null,
    phv_offset_years: snapshot.phv_offset_years ?? null,
  };
}

function buildPositions(user: any, snapshot: any, cvProfile: any): CVPositions {
  const primary = snapshot.position ?? user.position ?? null;
  const secondary: string[] = user.secondary_positions ?? [];
  const meta = primary ? POSITION_META[primary] ?? null : null;

  return {
    primary_position: primary,
    primary_label: meta?.label ?? null,
    primary_description: meta?.description ?? null,
    secondary_positions: secondary,
    formation_preference: cvProfile.formation_preference ?? null,
    dominant_zone: cvProfile.dominant_zone ?? null,
    is_set: !!primary && secondary.length > 0,
    has_secondary: secondary.length > 0,
  };
}

function buildVerifiedPerformance(
  snapshot: any,
  user: any,
  benchmarkProfile: BenchmarkProfile | null,
  sessionLog: CVSessionLogEntry[]
): CVVerifiedPerformance {
  const benchmarks: CVBenchmarkRow[] = (benchmarkProfile?.results ?? []).map((r: BenchmarkResult) => ({
    metric_key: r.metricKey,
    metric_label: r.metricLabel,
    value: r.value,
    unit: r.unit,
    percentile: r.percentile,
    zone: zoneFromPercentile(r.percentile),
    direction: r.direction as "higher_is_better" | "lower_is_better",
    age_band: r.ageBand,
    position: r.position,
    tested_at: null,
  }));

  const strengthZones = benchmarks.filter(b => b.percentile >= 75);
  const developmentFocus = benchmarks.filter(b => b.percentile <= 25);

  const trainingAgeMonths = snapshot.training_age_months ?? Math.round((snapshot.training_age_weeks ?? 0) / 4.33);

  return {
    sessions_total: snapshot.sessions_total ?? 0,
    training_age_months: trainingAgeMonths,
    training_age_label: formatTrainingAge(trainingAgeMonths),
    streak_days: snapshot.streak_days ?? 0,
    acwr: snapshot.acwr ?? null,
    training_balance: trainingBalanceFromAcwr(snapshot.acwr),
    benchmarks,
    strength_zones: strengthZones,
    development_focus: developmentFocus,
    overall_percentile: benchmarkProfile?.overallPercentile ?? null,
    session_log: sessionLog,
    data_start_date: user.created_at ?? null,
    verified_by: "tomo_platform",
  };
}

function buildPlayerProfile(
  cvProfile: any,
  perf: CVVerifiedPerformance,
  physical: CVPhysicalProfile,
  versions: CVSummaryVersion[]
): CVPlayerProfile {
  const strengths: CVKeySignal[] = perf.strength_zones.slice(0, 3).map(b => ({
    metric_key: b.metric_key,
    label: keySignalLabel(b.metric_key),
    detail: `${b.value}${b.unit} ${b.metric_label}`,
    percentile_label: `${Math.round(b.percentile)}th percentile`,
    kind: "strength",
  }));

  const focus: CVKeySignal[] = perf.development_focus.slice(0, 3).map(b => ({
    metric_key: b.metric_key,
    label: keySignalLabel(b.metric_key),
    detail: `${b.value}${b.unit} ${b.metric_label}`,
    percentile_label: `${Math.round(b.percentile)}th percentile`,
    kind: "focus",
  }));

  const physicalMaturity = physical.phv_stage
    ? {
        label: physical.phv_stage,
        detail:
          physical.phv_stage === "POST"
            ? "ready for senior load"
            : physical.phv_stage === "CIRCA"
              ? "monitor load during growth"
              : "focus on skill over strength",
      }
    : null;

  return {
    ai_summary: cvProfile.ai_summary ?? null,
    ai_summary_status: (cvProfile.ai_summary_status ?? "draft") as "draft" | "approved" | "needs_update",
    ai_summary_last_generated: cvProfile.ai_summary_last_generated ?? null,
    ai_summary_approved_at: cvProfile.ai_summary_approved_at ?? null,
    key_signals: {
      strengths,
      focus_areas: focus,
      physical_maturity: physicalMaturity,
    },
    versions,
  };
}

function groupAwardsCharacter(traits: CVCharacterTrait[]): CVAwardsCharacter {
  return {
    awards: traits.filter(t => t.trait_category === "award"),
    leadership: traits.filter(t => t.trait_category === "leadership"),
    languages: traits.filter(t => t.trait_category === "language"),
    character: traits.filter(t => t.trait_category === "character"),
    total_count: traits.length,
  };
}

function buildHealthStatus(cvProfile: any, injuries: CVInjuryEntry[]): CVHealthStatus {
  const activeInjuries = injuries.filter(i => i.status === "active");
  const recoveringInjuries = injuries.filter(i => i.status === "recovering");

  let overall: "fully_fit" | "returning" | "injured";
  let statusLabel: string;
  let statusDetail: string;

  if (activeInjuries.length > 0) {
    const worst = activeInjuries[0];
    overall = "injured";
    statusLabel = "Injured";
    statusDetail = `${worst.body_part}${worst.side ? ` (${worst.side})` : ""} · ${worst.severity}`;
  } else if (recoveringInjuries.length > 0) {
    const current = recoveringInjuries[0];
    overall = "returning";
    statusLabel = "Returning";
    statusDetail = `${current.body_part}${current.side ? ` (${current.side})` : ""} · recovering`;
  } else {
    overall = "fully_fit";
    statusLabel = "Fully fit";
    statusDetail = `No current injuries · Updated ${formatDate(cvProfile.updated_at ?? new Date().toISOString())}`;
  }

  const hasMajorActive = activeInjuries.some(i => i.severity === "major");
  const hasAnyActive = activeInjuries.length > 0;
  const restrictions = Array.from(
    new Set([
      ...activeInjuries.map(i => i.body_part),
      ...recoveringInjuries.map(i => i.body_part),
    ])
  );

  const medicalConsent = {
    share_with_coach: cvProfile.medical_consent_coach ?? true,
    share_with_scouts_summary: cvProfile.medical_consent_scouts_summary ?? true,
    share_raw_data: cvProfile.medical_consent_raw ?? false,
    signed:
      (cvProfile.medical_consent_coach ?? true) ||
      (cvProfile.medical_consent_scouts_summary ?? true),
  };

  return {
    overall,
    status_label: statusLabel,
    status_detail: statusDetail,
    updated_at: cvProfile.updated_at ?? new Date().toISOString(),
    availability: {
      match_ready: !hasMajorActive,
      training_load: hasMajorActive ? "rest" : hasAnyActive ? "partial" : "full",
      restrictions,
      last_screening_date: cvProfile.last_screening_date ?? null,
    },
    injury_log: injuries,
    medical_consent: medicalConsent,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION STATE
// ═══════════════════════════════════════════════════════════════════════════

function computeSectionStates(data: {
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
}): CVSectionStatus {
  const identityComplete =
    !!data.identity.full_name &&
    !!data.identity.date_of_birth &&
    !!data.identity.nationality &&
    !!data.identity.preferred_foot;

  const profileState: CVSectionState =
    data.playerProfile.ai_summary_status === "approved"
      ? "approved"
      : data.playerProfile.ai_summary
        ? "ai_draft_pending"
        : data.playerProfile.ai_summary_status === "needs_update"
          ? "ai_draft_pending"
          : "needs_input";

  const physicalState: CVSectionState =
    data.physical.height_cm && data.physical.weight_kg && data.verifiedPerformance.benchmarks.length >= 3
      ? "auto_complete"
      : data.physical.height_cm && data.physical.weight_kg
        ? "insufficient_data"
        : "insufficient_data";

  const positionsState: CVSectionState = data.positions.is_set
    ? "auto_complete"
    : data.positions.primary_position
      ? "needs_input"
      : "insufficient_data";

  const perfState: CVSectionState =
    data.verifiedPerformance.benchmarks.length >= 2 && data.verifiedPerformance.sessions_total >= 10
      ? "auto_complete"
      : "insufficient_data";

  const careerState: CVSectionState = data.career.length > 0 ? "auto_complete" : "empty";

  const mediaState: CVSectionState =
    data.media.some(m => m.media_type === "highlight_reel") ? "auto_complete" : "empty";

  const referencesState: CVSectionState =
    data.references.some(r => r.status === "published")
      ? "approved"
      : data.references.length > 0
        ? "ai_draft_pending"
        : "empty";

  const awardsState: CVSectionState =
    data.awardsCharacter.total_count > 0 ? "auto_complete" : "empty";

  const healthState: CVSectionState =
    data.healthStatus.overall === "fully_fit" ? "auto_complete" : "needs_input";

  return {
    identity: identityComplete ? "auto_complete" : "needs_input",
    player_profile: profileState,
    physical_profile: physicalState,
    playing_positions: positionsState,
    verified_performance: perfState,
    career_history: careerState,
    video_media: mediaState,
    references: referencesState,
    awards_character: awardsState,
    health_status: healthState,
  };
}

function buildAcademicProfile(row: any): CVAcademicProfile | null {
  if (!row) return null;
  const subjects: CVAcademicSubject[] = Array.isArray(row.subjects)
    ? row.subjects.map((s: any) => ({
        name: s.name ?? "",
        level: s.level ?? null,
        grade: s.grade != null ? Number(s.grade) : null,
        grade_max: s.grade_max != null ? Number(s.grade_max) : 7,
        trend: s.trend ?? null,
      }))
    : [];
  return {
    school_name: row.school_name ?? null,
    diploma_program: row.diploma_program ?? null,
    grade_year: row.grade_year ?? null,
    program_label: row.program_label ?? null,
    gpa_current: row.gpa_current != null ? Number(row.gpa_current) : null,
    gpa_max: row.gpa_max != null ? Number(row.gpa_max) : 7.0,
    class_rank_pct: row.class_rank_pct ?? null,
    attendance_pct: row.attendance_pct ?? null,
    exam_session_label: row.exam_session_label ?? null,
    dual_load_note: row.dual_load_note ?? null,
    subjects,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ROW MAPPERS
// ═══════════════════════════════════════════════════════════════════════════

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

function mapReferenceEntry(row: any): CVReferenceEntry {
  return {
    id: row.id,
    referee_name: row.referee_name,
    referee_role: row.referee_role,
    club_institution: row.club_institution,
    email: row.email ?? null,
    phone: row.phone ?? null,
    relationship: row.relationship ?? null,
    status: row.status ?? "published",
    request_sent_at: row.request_sent_at ?? null,
    submitted_at: row.submitted_at ?? null,
    submitted_rating: row.submitted_rating ?? null,
    submitted_note: row.submitted_note ?? null,
    published_at: row.published_at ?? null,
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

function mapInjuryEntry(row: any): CVInjuryEntry {
  return {
    id: row.id,
    body_part: row.body_part,
    side: row.side ?? null,
    severity: row.severity,
    status: row.status,
    date_occurred: row.date_occurred,
    cleared_at: row.cleared_at ?? null,
    notes: row.notes ?? null,
  };
}

function mapSessionLog(row: any): CVSessionLogEntry {
  const start = row.start_at ? new Date(row.start_at) : null;
  const end = row.end_at ? new Date(row.end_at) : null;
  const durationMin =
    start && end ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000)) : null;

  return {
    date: row.start_at,
    title: row.title ?? row.event_type ?? "Session",
    category: humanizeEventType(row.event_type),
    duration_min: durationMin,
    load_au: row.estimated_load_au != null ? Math.round(Number(row.estimated_load_au)) : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function zoneFromPercentile(pct: number): "elite" | "on_par" | "dev_priority" {
  if (pct >= 75) return "elite";
  if (pct >= 25) return "on_par";
  return "dev_priority";
}

function trainingBalanceFromAcwr(acwr: number | null | undefined): "under" | "balanced" | "over" | null {
  if (acwr == null) return null;
  if (acwr < 0.8) return "under";
  if (acwr > 1.3) return "over";
  return "balanced";
}

function formatTrainingAge(months: number): string {
  if (months < 1) return "<1 mo";
  if (months < 12) return `${months} mo`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem === 0 ? `${years} y` : `${years} y ${rem} mo`;
}

function deriveAgeGroup(age: number | null | undefined, dob: string | null | undefined): string | null {
  const a = age ?? (dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86400000)) : null);
  if (a == null) return null;
  if (a < 13) return "U13";
  if (a < 15) return "U15";
  if (a < 17) return "U17";
  if (a < 19) return "U19";
  if (a < 21) return "U21";
  if (a < 23) return "U23";
  return "Senior";
}

function humanizeEventType(type: string | null | undefined): string {
  switch (type) {
    case "training": return "Training";
    case "match":    return "Match";
    case "recovery": return "Recovery";
    case "study":    return "Study";
    case "exam":     return "Exam";
    default:         return "Session";
  }
}

function keySignalLabel(metricKey: string): string {
  const map: Record<string, string> = {
    squat_1rm:       "Lower-body power",
    vertical_jump:   "Lower-body power",
    broad_jump:      "Lower-body power",
    cmj:             "Lower-body power",
    seated_mb_throw: "Upper-body power",
    mas:             "Aerobic capacity",
    yo_yo:           "Aerobic capacity",
    sprint_10m:      "Acceleration",
    sprint_20m:      "Acceleration",
    max_sprint:      "Top speed",
    t_test:          "Agility",
    "5_10_5":        "Change of direction",
  };
  return map[metricKey] ?? metricKey.replace(/_/g, " ");
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

function buildPublicShareUrl(slug: string): string {
  const base = process.env.NEXT_PUBLIC_APP_ORIGIN ?? "https://app.my-tomo.com";
  return `${base}/t/${slug}`;
}
