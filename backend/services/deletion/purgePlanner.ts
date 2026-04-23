/**
 * GDPR Art. 17 purge planner — pure, zero-I/O.
 *
 * Given a target user_id and jurisdiction, returns the ordered list of
 * table × column × action entries the purge executor should perform.
 * The DB-side function `public.tomo_purge_user()` in migration 071 is
 * the production executor; this planner is the spec it mirrors, and
 * the surface unit tests assert against.
 *
 * Kept pure so:
 *   1. Every table → action mapping is reviewable as data, not code.
 *   2. Unit tests can cover the full table graph without needing a DB.
 *   3. Adding a new user-scoped table means appending one entry here
 *      (and mirroring in the SQL function if it's an ANONYMISE entry).
 *
 * The canonical categorisation rules:
 *   • CASCADE_DELETE  — user-owned content. Removed by the
 *                       public.users.id → auth.users(id) CASCADE chain.
 *                       Listed here for documentation + test coverage.
 *   • ANONYMISE       — audit / telemetry / safety tables. Must survive
 *                       the purge with user_id nulled and a tombstone
 *                       back-pointer attached.
 *   • RELATIONSHIP    — parent/guardian/coach links. CASCADE both sides
 *                       (legal acceptance + chain of custody).
 *   • SKIP            — table has a user-ish column but isn't erasable
 *                       (e.g. immutable regulator-mandated record).
 *                       None today — placeholder for future cases.
 */

export type PurgeAction =
  | 'CASCADE_DELETE'
  | 'ANONYMISE'
  | 'RELATIONSHIP'
  | 'SKIP';

export type Jurisdiction = 'GDPR' | 'CCPA' | 'PDPL' | 'CUSTOM';

export type DeletionMethod =
  | 'user_self_service'
  | 'admin_forced'
  | 'parent_revocation'
  | 'regulator_request';

export interface PurgePlanEntry {
  /** Fully-qualified table name (schema.table). */
  table: string;
  /** Column holding the user reference. */
  column: string;
  /** How the executor should handle this table. */
  action: PurgeAction;
  /** Short rationale — appears in the purge log for forensic review. */
  reason: string;
}

export interface PurgePlan {
  userId: string;
  jurisdiction: Jurisdiction;
  method: DeletionMethod;
  /** Days between request and scheduled purge. Jurisdiction-derived. */
  gracePeriodDays: number;
  /**
   * Ordered: ANONYMISE + RELATIONSHIP entries run before CASCADE_DELETE
   * in the SQL executor. The executor still uses its own hardcoded list
   * — this ordering is for documentation and for the unit tests that
   * assert no anonymise entry appears after the cascade cutover.
   */
  entries: PurgePlanEntry[];
  /** Summary counts so the admin UI can preview impact. */
  counts: {
    cascadeDelete: number;
    anonymise: number;
    relationship: number;
    skip: number;
  };
}

// ─── jurisdiction → grace period ────────────────────────────────────
const GRACE_PERIOD_DAYS: Record<Jurisdiction, number> = {
  GDPR: 30,
  CCPA: 45,
  PDPL: 90,
  CUSTOM: 30, // default; overridden by callers supplying explicit grace
};

export function gracePeriodFor(jurisdiction: Jurisdiction, overrideDays?: number): number {
  if (jurisdiction === 'CUSTOM' && typeof overrideDays === 'number') {
    if (overrideDays < 0 || overrideDays > 365) {
      throw new Error(`gracePeriodFor: CUSTOM override ${overrideDays} out of range [0, 365]`);
    }
    return overrideDays;
  }
  return GRACE_PERIOD_DAYS[jurisdiction];
}

// ─── static table graph ─────────────────────────────────────────────
// Every table in the Tomo schema that references a user, with its
// action. When a new user-scoped table is added to the schema, it MUST
// be appended here — the unit tests check this list against the
// generated database.ts types to catch drift.

const CASCADE_DELETE_TABLES: Array<[table: string, column: string, reason: string]> = [
  // ── Core athlete content (user_id) ──────────────────────────────
  ['public.checkins', 'user_id', 'daily wellness self-report'],
  ['public.plans', 'user_id', 'daily training plan'],
  ['public.points_ledger', 'user_id', 'gamification ledger'],
  ['public.milestones', 'user_id', 'achievement milestones'],
  ['public.chat_messages', 'user_id', 'AI chat transcripts'],
  ['public.chat_sessions', 'user_id', 'chat session envelopes'],
  ['public.chat_session_summaries', 'user_id', 'chat session summaries'],
  ['public.chat_message_logs', 'user_id', 'per-message agent logs'],
  ['public.calendar_events', 'user_id', 'timeline events'],
  ['public.sleep_logs', 'user_id', 'sleep data'],
  ['public.health_data', 'user_id', 'wearable health metrics'],
  ['public.blazepod_sessions', 'user_id', 'reaction drill results'],
  ['public.phone_test_sessions', 'user_id', 'phone-based test sessions'],
  ['public.video_test_results', 'user_id', 'video-scored test results'],
  ['public.padel_progress', 'user_id', 'padel skill progression'],
  ['public.compliance_records', 'user_id', 'plan compliance tracking'],
  ['public.training_blocks', 'user_id', 'periodisation blocks'],
  ['public.weekly_plans', 'user_id', 'weekly plan snapshots'],
  ['public.workout_logs', 'user_id', 'workout completion logs'],
  ['public.nutrition_logs', 'user_id', 'nutrition diary entries'],
  ['public.exam_periods', 'user_id', 'exam window config'],
  ['public.return_to_play', 'user_id', 'injury return-to-play state'],
  ['public.wearable_connections', 'user_id', 'OAuth tokens for wearables'],
  ['public.day_locks', 'user_id', 'day-level edit locks'],
  ['public.football_test_results', 'user_id', 'sport-specific test results'],
  ['public.player_benchmark_snapshots', 'user_id', 'benchmark snapshots'],
  ['public.player_phv_assessments', 'user_id', 'PHV maturity assessments'],
  ['public.player_schedule_preferences', 'user_id', 'My Rules schedule config'],
  ['public.training_journals', 'user_id', 'post-session journals'],
  ['public.program_interactions', 'user_id', 'program interaction telemetry'],
  ['public.athlete_week_plans', 'user_id', 'weekly plan snapshots v2'],
  ['public.athlete_goals', 'user_id', 'athlete goals'],
  ['public.athlete_injuries', 'user_id', 'injury history'],
  ['public.athlete_nutrition_log', 'user_id', 'nutrition log v2'],
  ['public.athlete_sleep_manual', 'user_id', 'manual sleep entries'],
  ['public.athlete_memory_preferences', 'user_id', 'memory preferences'],
  ['public.athlete_notification_preferences', 'user_id', 'notification preferences'],
  ['public.athlete_notifications', 'user_id', 'delivered notifications'],
  ['public.athlete_achievements', 'user_id', 'achievements earned'],
  ['public.athlete_longitudinal_memory', 'user_id', 'cross-session memory'],
  ['public.athlete_monthly_summary', 'user_id', 'monthly summaries'],
  ['public.athlete_weekly_digest', 'user_id', 'weekly digests'],
  ['public.athlete_subjects', 'athlete_id', 'academic subjects'],
  ['public.athlete_benchmark_cache', 'athlete_id', 'benchmark cache'],
  ['public.athlete_behavioral_fingerprint', 'athlete_id', 'behavioural fingerprint'],
  ['public.athlete_daily_load', 'athlete_id', 'daily training load'],
  ['public.athlete_daily_vitals', 'athlete_id', 'daily vitals (aggregated)'],
  ['public.athlete_events', 'athlete_id', 'event-sourced triangle events'],
  ['public.athlete_intelligence_briefs', 'athlete_id', 'AI intelligence briefs'],
  ['public.athlete_mode_history', 'athlete_id', 'mode change history'],
  ['public.athlete_recommendations', 'athlete_id', 'personalised recommendations'],
  ['public.athlete_snapshots', 'athlete_id', 'readiness snapshot'],
  ['public.planning_sessions', 'athlete_id', 'planning session state'],

  // ── CV (athlete_id) ─────────────────────────────────────────────
  ['public.cv_profiles', 'athlete_id', 'athlete CV profile'],
  ['public.cv_career_entries', 'athlete_id', 'CV career entries'],
  ['public.cv_character_traits', 'athlete_id', 'CV character traits'],
  ['public.cv_media_links', 'athlete_id', 'CV media links'],
  ['public.cv_references', 'athlete_id', 'CV references'],
  ['public.cv_injury_log', 'athlete_id', 'CV injury log'],
  ['public.cv_ai_summary_versions', 'athlete_id', 'CV AI summary version history'],
  ['public.cv_share_views', 'athlete_id', 'scout share view log'],

  // ── Auth / push ─────────────────────────────────────────────────
  ['public.player_push_tokens', 'user_id', 'push notification tokens'],
  ['public.player_club_history', 'user_id', 'club history timeline'],

  // ── History / drills ────────────────────────────────────────────
  ['public.user_drill_history', 'user_id', 'drill completion history'],
  ['public.drill_ratings', 'user_id', 'drill ratings'],
  ['public.notification_dismissal_log', 'user_id', 'notification dismissals'],
  ['public.rec_delivery_log', 'user_id', 'recommendation deliveries'],
];

const ANONYMISE_TABLES: Array<[table: string, column: string, reason: string]> = [
  // Safety audit — preserved, user_id nulled, tombstone_id attached.
  ['public.safety_audit_log', 'user_id',
    'safety audit trail — regulator-mandated retention beyond user deletion'],
  ['public.safety_audit_flags', 'reviewer_id',
    'reviewer identity anonymised; flag content preserved for trend analysis'],
  ['public.chat_quality_scores', 'user_id',
    'AI quality telemetry — rows kept for drift detection, subject anonymised'],
  ['public.prompt_shadow_runs', 'created_by',
    'shadow run audit — creator anonymised, prompt/response retained'],

  // ai_trace_log.user_id is TEXT (not a uuid FK). The SQL purge
  // function rewrites it to 'DELETED:<tombstone_id>' so trace
  // aggregations remain possible without re-identification.
  ['public.ai_trace_log', 'user_id',
    'Claude API trace — retained for cost analysis, subject anonymised'],

  // Admin audit columns — deleting an admin shouldn't nuke config
  // history. These are `updated_by` / `created_by` style.
  ['public.ui_config', 'updated_by',
    'admin audit — config change history preserved'],
  ['public.athlete_mode_history', 'changed_by',
    'admin audit — who changed the mode is anonymised if that actor is deleted'],
  ['public.athlete_events', 'created_by',
    'coach audit — event provenance preserved when coach is deleted separately'],
];

const RELATIONSHIP_TABLES: Array<[table: string, column: string, reason: string]> = [
  // relationships has both guardian_id and player_id. Cascade on both
  // sides — deleting either party dissolves the link; the counterparty
  // row is unaffected.
  ['public.relationships', 'player_id', 'parent/guardian ↔ athlete link (player side)'],
  ['public.relationships', 'guardian_id', 'parent/guardian ↔ athlete link (guardian side)'],
];

// ─── the planner itself ─────────────────────────────────────────────

export interface BuildPurgePlanOpts {
  jurisdiction?: Jurisdiction;
  method?: DeletionMethod;
  /** Only honoured when jurisdiction='CUSTOM'. */
  customGraceDays?: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SENTINEL_NIL_UUID = '00000000-0000-0000-0000-000000000000';

export function buildPurgePlan(userId: string, opts: BuildPurgePlanOpts = {}): PurgePlan {
  if (!userId || typeof userId !== 'string' || !UUID_RE.test(userId)) {
    throw new Error(`buildPurgePlan: invalid userId "${userId}" (expected lowercase UUID)`);
  }
  if (userId === SENTINEL_NIL_UUID) {
    throw new Error('buildPurgePlan: refusing to plan purge for the NIL sentinel user');
  }

  const jurisdiction = opts.jurisdiction ?? 'GDPR';
  const method = opts.method ?? 'user_self_service';
  const gracePeriodDays = gracePeriodFor(jurisdiction, opts.customGraceDays);

  const entries: PurgePlanEntry[] = [];

  // Order: ANONYMISE → RELATIONSHIP → CASCADE_DELETE. The SQL executor
  // runs anonymise updates first so the cascade delete doesn't race
  // against an FK update.
  for (const [table, column, reason] of ANONYMISE_TABLES) {
    entries.push({ table, column, action: 'ANONYMISE', reason });
  }
  for (const [table, column, reason] of RELATIONSHIP_TABLES) {
    entries.push({ table, column, action: 'RELATIONSHIP', reason });
  }
  for (const [table, column, reason] of CASCADE_DELETE_TABLES) {
    entries.push({ table, column, action: 'CASCADE_DELETE', reason });
  }

  const counts = {
    cascadeDelete: 0,
    anonymise: 0,
    relationship: 0,
    skip: 0,
  };
  for (const e of entries) {
    if (e.action === 'CASCADE_DELETE') counts.cascadeDelete += 1;
    else if (e.action === 'ANONYMISE') counts.anonymise += 1;
    else if (e.action === 'RELATIONSHIP') counts.relationship += 1;
    else if (e.action === 'SKIP') counts.skip += 1;
  }

  return {
    userId,
    jurisdiction,
    method,
    gracePeriodDays,
    entries,
    counts,
  };
}

// ─── introspection helpers (used by tests + admin preview) ─────────

export function listCascadeDeleteTables(): ReadonlyArray<string> {
  return CASCADE_DELETE_TABLES.map((row) => row[0]);
}

export function listAnonymiseTables(): ReadonlyArray<string> {
  return ANONYMISE_TABLES.map((row) => row[0]);
}

export function listRelationshipTables(): ReadonlyArray<string> {
  return RELATIONSHIP_TABLES.map((row) => row[0]);
}

/**
 * True when `table` appears in the plan with any action. Used by the
 * admin preview to flag new schema migrations that added a user_id
 * column without a matching planner entry.
 */
export function isTableCovered(table: string): boolean {
  const qualified = table.startsWith('public.') ? table : `public.${table}`;
  return (
    CASCADE_DELETE_TABLES.some((r) => r[0] === qualified) ||
    ANONYMISE_TABLES.some((r) => r[0] === qualified) ||
    RELATIONSHIP_TABLES.some((r) => r[0] === qualified)
  );
}

/**
 * Canonical constants the executor and the write-gate share. Exported
 * for tests and for the UI to render consistent copy.
 */
export const DELETION_CONSTANTS = {
  SENTINEL_NIL_UUID,
  GRACE_PERIOD_DAYS,
  JURISDICTIONS: ['GDPR', 'CCPA', 'PDPL', 'CUSTOM'] as const,
  METHODS: [
    'user_self_service',
    'admin_forced',
    'parent_revocation',
    'regulator_request',
  ] as const,
} as const;
