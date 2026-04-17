/**
 * Admin service for Chat Quality Engine telemetry.
 *
 * Exposes three surfaces consumed by the CMS:
 *   - listSafetyAuditFlags()    — open/closed safety flags with log context
 *   - listQualityDisagreements() — turns where judges disagreed by > 0.3
 *   - getQualityAggregates()    — daily rollups for the dashboard
 *
 * All queries run via supabaseAdmin() (service role) so RLS is bypassed —
 * migration 051 only grants service_role access to these tables.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Safety audit flags
// ---------------------------------------------------------------------------

export interface SafetyAuditFlagRow {
  flag_id: string;
  flag_type: "rule_missed" | "false_positive";
  severity: "critical" | "high" | "medium";
  status: "open" | "triaged" | "resolved" | "false_alarm";
  phv_stage: string | null;
  age_band: string | null;
  rule_trigger: string | null;
  auditor_model: string | null;
  audit_log_id: string;
  turn_id: string;
  session_id: string | null;
  user_id: string | null;
  flagged_at: string;
  turn_at: string;
  reviewed_at: string | null;
  resolution: string | null;
}

export interface SafetyFlagFilters {
  status?: "open" | "triaged" | "resolved" | "false_alarm";
  severity?: "critical" | "high" | "medium";
  flagType?: "rule_missed" | "false_positive";
  limit?: number;
  offset?: number;
}

export async function listSafetyAuditFlags(
  filters: SafetyFlagFilters = {}
): Promise<{ rows: SafetyAuditFlagRow[]; total: number }> {
  const db = supabaseAdmin() as any;
  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = filters.offset ?? 0;

  let query = db
    .from("safety_audit_flags")
    .select(
      `
        id,
        flag_type,
        severity,
        status,
        reviewed_at,
        resolution,
        created_at,
        safety_audit_log!inner (
          id,
          turn_id,
          session_id,
          user_id,
          phv_stage,
          age_band,
          rule_trigger,
          auditor_model,
          created_at
        )
      `,
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.severity) query = query.eq("severity", filters.severity);
  if (filters.flagType) query = query.eq("flag_type", filters.flagType);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const rows: SafetyAuditFlagRow[] = (data ?? []).map((r: any) => ({
    flag_id: r.id,
    flag_type: r.flag_type,
    severity: r.severity,
    status: r.status,
    phv_stage: r.safety_audit_log?.phv_stage ?? null,
    age_band: r.safety_audit_log?.age_band ?? null,
    rule_trigger: r.safety_audit_log?.rule_trigger ?? null,
    auditor_model: r.safety_audit_log?.auditor_model ?? null,
    audit_log_id: r.safety_audit_log?.id,
    turn_id: r.safety_audit_log?.turn_id,
    session_id: r.safety_audit_log?.session_id ?? null,
    user_id: r.safety_audit_log?.user_id ?? null,
    flagged_at: r.created_at,
    turn_at: r.safety_audit_log?.created_at ?? r.created_at,
    reviewed_at: r.reviewed_at,
    resolution: r.resolution,
  }));

  return { rows, total: count ?? rows.length };
}

export async function updateSafetyFlagStatus(
  flagId: string,
  status: "triaged" | "resolved" | "false_alarm",
  reviewerId: string,
  resolution: string | null
): Promise<void> {
  const db = supabaseAdmin() as any;
  const { error } = await db
    .from("safety_audit_flags")
    .update({
      status,
      reviewer_id: reviewerId,
      reviewed_at: new Date().toISOString(),
      resolution,
    })
    .eq("id", flagId);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Quality disagreement queue — where |A − B|, |A − C|, or |B − C| > 0.3
// ---------------------------------------------------------------------------

export interface DisagreementRow {
  id: string;
  turn_id: string;
  session_id: string | null;
  user_id: string | null;
  sport: string | null;
  age_band: string | null;
  agent: string | null;
  sampling_stratum: string;
  disagreement_max: number;
  has_rag: boolean;
  a_tone: number | null;
  b_tone: number | null;
  c_tone: number | null;
  a_answer_quality: number | null;
  b_answer_quality: number | null;
  c_answer_quality: number | null;
  a_age_fit: number | null;
  b_age_fit: number | null;
  c_age_fit: number | null;
  a_faithfulness: number | null;
  b_faithfulness: number | null;
  c_faithfulness: number | null;
  total_judge_cost_usd: number | null;
  created_at: string;
}

export interface DisagreementFilters {
  agent?: string;
  ageBand?: string;
  sport?: string;
  minDisagreement?: number;
  limit?: number;
  offset?: number;
}

export async function listQualityDisagreements(
  filters: DisagreementFilters = {}
): Promise<{ rows: DisagreementRow[]; total: number }> {
  const db = supabaseAdmin() as any;
  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = filters.offset ?? 0;
  const minD = filters.minDisagreement ?? 0.3;

  let query = db
    .from("chat_quality_scores")
    .select(
      `
        id, turn_id, session_id, user_id, sport, age_band, agent,
        sampling_stratum, disagreement_max, has_rag,
        a_tone, b_tone, c_tone,
        a_answer_quality, b_answer_quality, c_answer_quality,
        a_age_fit, b_age_fit, c_age_fit,
        a_faithfulness, b_faithfulness, c_faithfulness,
        total_judge_cost_usd, created_at
      `,
      { count: "exact" }
    )
    .gte("disagreement_max", minD)
    .order("disagreement_max", { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.agent) query = query.eq("agent", filters.agent);
  if (filters.ageBand) query = query.eq("age_band", filters.ageBand);
  if (filters.sport) query = query.eq("sport", filters.sport);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  return { rows: (data as DisagreementRow[]) ?? [], total: count ?? 0 };
}

// ---------------------------------------------------------------------------
// Aggregate view — daily means + turn counts for the dashboard card
// ---------------------------------------------------------------------------

export interface QualityAggregateRow {
  day: string;
  sport: string | null;
  age_band: string | null;
  agent: string | null;
  sampling_stratum: string;
  turn_count: number;
  mean_faithfulness: number | null;
  mean_tone: number | null;
  mean_age_fit: number | null;
  total_cost_usd: number | null;
}

export async function getQualityAggregates(
  days: number = 7
): Promise<QualityAggregateRow[]> {
  const db = supabaseAdmin() as any;
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const { data, error } = await db
    .from("v_quality_scores_aggregated")
    .select("*")
    .gte("day", since)
    .order("day", { ascending: false });

  if (error) throw new Error(error.message);
  return (data as QualityAggregateRow[]) ?? [];
}

// ---------------------------------------------------------------------------
// One-row detail: pull the full chat_quality_scores row for inspection
// ---------------------------------------------------------------------------

export async function getQualityScoreById(id: string): Promise<Record<string, any> | null> {
  const db = supabaseAdmin() as any;
  const { data, error } = await db
    .from("chat_quality_scores")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// ---------------------------------------------------------------------------
// Phase 5 additions — drift alerts, shadow runs, golden set
// ---------------------------------------------------------------------------

export interface DriftAlertRow {
  id: string;
  dimension: string;
  segment_key: Record<string, unknown>;
  baseline_mean: number | null;
  current_mean: number | null;
  cusum_value: number | null;
  window_days: number;
  status: string;
  matched_pattern_id: string | null;
  proposed_pr_url: string | null;
  proposed_patch: Record<string, unknown> | null;
  alerted_at: string;
  resolved_at: string | null;
  resolution_notes: string | null;
}

export async function listDriftAlerts(
  filters: { status?: string; dimension?: string; limit?: number; offset?: number } = {}
): Promise<{ rows: DriftAlertRow[]; total: number }> {
  const db = supabaseAdmin() as any;
  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = filters.offset ?? 0;

  let q = db
    .from("quality_drift_alerts")
    .select("*", { count: "exact" })
    .order("alerted_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.status) q = q.eq("status", filters.status);
  if (filters.dimension) q = q.eq("dimension", filters.dimension);

  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return { rows: (data as DriftAlertRow[]) ?? [], total: count ?? 0 };
}

export async function updateDriftAlertStatus(
  id: string,
  status: "patch_proposed" | "patch_merged" | "resolved" | "false_alarm",
  notes: string | null
): Promise<void> {
  const db = supabaseAdmin() as any;
  const patch: Record<string, unknown> = { status, resolution_notes: notes };
  if (status === "resolved" || status === "false_alarm" || status === "patch_merged") {
    patch.resolved_at = new Date().toISOString();
  }
  const { error } = await db.from("quality_drift_alerts").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export interface ShadowRunSummary {
  id: string;
  variant_name: string;
  variant_commit_hash: string | null;
  phase: string;
  canary_traffic_pct: number | null;
  started_at: string;
  ended_at: string | null;
  turns_evaluated: number;
  baseline_scores: Record<string, unknown> | null;
  variant_scores: Record<string, unknown> | null;
  p_values: Record<string, unknown> | null;
  decision: string | null;
  decision_reason: string | null;
}

export async function listShadowRuns(limit = 50): Promise<ShadowRunSummary[]> {
  const db = supabaseAdmin() as any;
  const { data, error } = await db
    .from("prompt_shadow_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data as ShadowRunSummary[]) ?? [];
}

export interface GoldenScenarioRow {
  id: string;
  scenario_key: string;
  suite: string;
  user_message: string;
  expected_agent: string | null;
  expected_signals: Record<string, unknown>;
  source: string;
  is_frozen: boolean;
  last_passing_score: number | null;
  consecutive_passes: number;
  scheduled_removal_at: string | null;
  added_at: string;
}

export async function listGoldenScenarios(
  filters: {
    suite?: string;
    source?: string;
    isFrozen?: boolean;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ rows: GoldenScenarioRow[]; total: number }> {
  const db = supabaseAdmin() as any;
  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = filters.offset ?? 0;

  let q = db
    .from("golden_test_scenarios")
    .select("*", { count: "exact" })
    .order("added_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.suite) q = q.eq("suite", filters.suite);
  if (filters.source) q = q.eq("source", filters.source);
  if (typeof filters.isFrozen === "boolean") q = q.eq("is_frozen", filters.isFrozen);

  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return { rows: (data as GoldenScenarioRow[]) ?? [], total: count ?? 0 };
}

export async function updateGoldenScenarioStatus(
  id: string,
  patch: { is_frozen?: boolean; source?: string; scheduled_removal_at?: string | null }
): Promise<void> {
  const db = supabaseAdmin() as any;
  const { error } = await db.from("golden_test_scenarios").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteGoldenScenario(id: string): Promise<void> {
  const db = supabaseAdmin() as any;
  const { error } = await db.from("golden_test_scenarios").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
