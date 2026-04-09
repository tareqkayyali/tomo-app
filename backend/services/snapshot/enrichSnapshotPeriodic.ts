/**
 * Periodic Snapshot Enrichment — Runs every 15 minutes.
 *
 * Computes expensive/slow fields that don't need real-time updates:
 * - Chat engagement (chat_sessions_7d, chat_messages_7d, last_chat_at)
 * - Compliance metrics (rec_action_rate_30d, plan_compliance_7d, notification_action_rate_7d)
 * - CV stats (cv_views_total, cv_views_7d, cv_statement_status, cv_sections_complete)
 * - Benchmark data (overall_percentile, top_strengths, key_gaps)
 * - Triangle engagement (days_since_coach_interaction, days_since_parent_interaction, triangle_engagement_score)
 * - Longitudinal AI context (active_goals_count, unresolved_concerns_count, coaching_preference)
 * - Academic detail (study_hours_7d, exam_count_active)
 * - Drill/program stats (drills_completed_7d, active_program_count, program_compliance_rate)
 *
 * Only enriches athletes with activity since last enrichment (guarded by snapshot_at).
 *
 * Called by: pg_cron or API endpoint for manual trigger.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Only enrich athletes whose snapshot was updated in the last 24 hours (active athletes) */
const ACTIVE_WINDOW_HOURS = 24;

// ---------------------------------------------------------------------------
// Main Function
// ---------------------------------------------------------------------------

/**
 * Run periodic enrichment for all active athletes.
 * Returns the count of enriched athletes.
 */
export async function enrichSnapshotPeriodic(): Promise<{ enriched: number; errors: number }> {
  const db = supabaseAdmin();
  const now = new Date();
  const activeWindow = new Date(now.getTime() - ACTIVE_WINDOW_HOURS * 60 * 60 * 1000);

  // Get all athletes with recent activity
  const { data: activeAthletes, error } = await db
    .from('athlete_snapshots')
    .select('athlete_id')
    .gte('snapshot_at', activeWindow.toISOString());

  if (error || !activeAthletes) {
    console.error('[EnrichPeriodic] Failed to fetch active athletes:', error?.message);
    return { enriched: 0, errors: 1 };
  }

  let enriched = 0;
  let errors = 0;

  // Process in batches of 10 for controlled concurrency
  const batchSize = 10;
  for (let i = 0; i < activeAthletes.length; i += batchSize) {
    const batch = activeAthletes.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(a => enrichSingleAthlete(db, a.athlete_id, now))
    );
    for (const r of results) {
      if (r.status === 'fulfilled') enriched++;
      else errors++;
    }
  }

  console.log(`[EnrichPeriodic] Completed: ${enriched} enriched, ${errors} errors, ${activeAthletes.length} total`);
  return { enriched, errors };
}

// ---------------------------------------------------------------------------
// Per-Athlete Enrichment
// ---------------------------------------------------------------------------

async function enrichSingleAthlete(db: any, athleteId: string, now: Date): Promise<void> {
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();

  // Run all 8 enrichment queries in parallel
  const [
    chatRes,
    complianceRes,
    cvRes,
    benchmarkRes,
    triangleRes,
    longitudinalRes,
    academicRes,
    programRes,
  ] = await Promise.all([
    enrichChat(db, athleteId, sevenDaysAgo),
    enrichCompliance(db, athleteId, sevenDaysAgo, thirtyDaysAgo),
    enrichCV(db, athleteId, sevenDaysAgo),
    enrichBenchmarks(db, athleteId),
    enrichTriangle(db, athleteId, now),
    enrichLongitudinal(db, athleteId),
    enrichAcademic(db, athleteId, sevenDaysAgo),
    enrichPrograms(db, athleteId, sevenDaysAgo, thirtyDaysAgo),
  ]);

  // Merge all enrichment fields
  const update: Record<string, unknown> = {
    athlete_id: athleteId,
    snapshot_at: now.toISOString(),
    ...chatRes,
    ...complianceRes,
    ...cvRes,
    ...benchmarkRes,
    ...triangleRes,
    ...longitudinalRes,
    ...academicRes,
    ...programRes,
  };

  await db
    .from('athlete_snapshots')
    .upsert(update, { onConflict: 'athlete_id' });
}

// ---------------------------------------------------------------------------
// Individual Enrichment Queries
// ---------------------------------------------------------------------------

async function enrichChat(
  db: any, athleteId: string, sevenDaysAgo: string
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};

  try {
    const [messagesRes, lastChatRes] = await Promise.all([
      db
        .from('chat_messages')
        .select('session_id', { count: 'exact' })
        .eq('user_id', athleteId)
        .gte('created_at', sevenDaysAgo),
      db
        .from('chat_messages')
        .select('created_at')
        .eq('user_id', athleteId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (messagesRes.data) {
      result.chat_messages_7d = messagesRes.count ?? 0;
      // Distinct session count
      const sessionIds = new Set(messagesRes.data.map((m: any) => m.session_id));
      result.chat_sessions_7d = sessionIds.size;
    }
    if (lastChatRes.data?.created_at) {
      result.last_chat_at = lastChatRes.data.created_at;
    }
  } catch {
    // chat_messages table may not exist in all environments
  }

  return result;
}

async function enrichCompliance(
  db: any, athleteId: string, sevenDaysAgo: string, thirtyDaysAgo: string
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};

  try {
    // Recommendation action rate (30d)
    const [deliveredRes, actedRes] = await Promise.all([
      db
        .from('athlete_recommendations')
        .select('id', { count: 'exact', head: true })
        .eq('athlete_id', athleteId)
        .gte('created_at', thirtyDaysAgo),
      db
        .from('athlete_recommendations')
        .select('id', { count: 'exact', head: true })
        .eq('athlete_id', athleteId)
        .gte('created_at', thirtyDaysAgo)
        .not('acted_at', 'is', null),
    ]);

    const delivered = deliveredRes.count ?? 0;
    const acted = actedRes.count ?? 0;
    if (delivered > 0) {
      result.rec_action_rate_30d = Math.round((acted / delivered) * 100) / 100;
    }

    // Notification action rate (7d)
    const [notifDelivered, notifActed] = await Promise.all([
      db
        .from('athlete_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('athlete_id', athleteId)
        .gte('created_at', sevenDaysAgo),
      db
        .from('athlete_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('athlete_id', athleteId)
        .gte('created_at', sevenDaysAgo)
        .not('read_at', 'is', null),
    ]);

    const nDelivered = notifDelivered.count ?? 0;
    const nActed = notifActed.count ?? 0;
    if (nDelivered > 0) {
      result.notification_action_rate_7d = Math.round((nActed / nDelivered) * 100) / 100;
    }

    // Plan compliance (7d) — sessions completed vs scheduled
    const [scheduledRes, completedRes] = await Promise.all([
      db
        .from('calendar_events')
        .select('id', { count: 'exact', head: true })
        .eq('athlete_id', athleteId)
        .gte('start_time', sevenDaysAgo)
        .lte('start_time', new Date().toISOString())
        .in('event_type', ['club', 'gym', 'match']),
      db
        .from('athlete_events')
        .select('event_id', { count: 'exact', head: true })
        .eq('athlete_id', athleteId)
        .eq('event_type', 'SESSION_LOG')
        .gte('occurred_at', sevenDaysAgo),
    ]);

    const scheduled = scheduledRes.count ?? 0;
    const completed = completedRes.count ?? 0;
    if (scheduled > 0) {
      result.plan_compliance_7d = Math.round((Math.min(completed, scheduled) / scheduled) * 100) / 100;
    }
  } catch {
    // Tables may not exist in all environments
  }

  return result;
}

async function enrichCV(
  db: any, athleteId: string, sevenDaysAgo: string
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};

  try {
    const { data: cvData } = await db
      .from('athlete_cv')
      .select('views_total, statement_status, sections_complete')
      .eq('athlete_id', athleteId)
      .maybeSingle();

    if (cvData) {
      result.cv_views_total = cvData.views_total ?? 0;
      result.cv_statement_status = cvData.statement_status ?? null;
      result.cv_sections_complete = cvData.sections_complete ?? null;
    }

    // CV views in last 7 days (from a views log if it exists)
    const { count } = await db
      .from('cv_view_logs')
      .select('id', { count: 'exact', head: true })
      .eq('athlete_id', athleteId)
      .gte('viewed_at', sevenDaysAgo);

    if (count != null) {
      result.cv_views_7d = count;
    }
  } catch {
    // CV tables may not exist yet
  }

  return result;
}

async function enrichBenchmarks(
  db: any, athleteId: string
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};

  try {
    const { data } = await db
      .from('athlete_benchmark_cache')
      .select('overall_percentile, top_strengths, key_gaps')
      .eq('athlete_id', athleteId)
      .maybeSingle();

    if (data) {
      result.overall_percentile = data.overall_percentile ?? null;
      result.top_strengths = data.top_strengths ?? null;
      result.key_gaps = data.key_gaps ?? null;
    }
  } catch {
    // Benchmark cache may not exist
  }

  return result;
}

async function enrichTriangle(
  db: any, athleteId: string, now: Date
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};

  try {
    // Coach interaction: last chat message from a coach role user in the athlete's context
    const { data: coachMsg } = await db
      .from('chat_messages')
      .select('created_at')
      .eq('athlete_id', athleteId)
      .eq('sender_role', 'coach')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (coachMsg?.created_at) {
      result.days_since_coach_interaction = Math.floor(
        (now.getTime() - new Date(coachMsg.created_at).getTime()) / 86400000
      );
    }

    // Parent interaction
    const { data: parentMsg } = await db
      .from('chat_messages')
      .select('created_at')
      .eq('athlete_id', athleteId)
      .eq('sender_role', 'parent')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (parentMsg?.created_at) {
      result.days_since_parent_interaction = Math.floor(
        (now.getTime() - new Date(parentMsg.created_at).getTime()) / 86400000
      );
    }

    // Triangle engagement score: weighted composite (0-100)
    // Coach 40%, Parent 30%, Athlete self 30%
    const coachDays = (result.days_since_coach_interaction as number) ?? 30;
    const parentDays = (result.days_since_parent_interaction as number) ?? 30;
    const coachScore = Math.max(0, 100 - coachDays * 10); // Decays 10pts/day
    const parentScore = Math.max(0, 100 - parentDays * 10);
    const selfScore = 80; // Athlete is active (we're enriching them)

    result.triangle_engagement_score = Math.round(
      coachScore * 0.4 + parentScore * 0.3 + selfScore * 0.3
    );
  } catch {
    // Triangle queries may fail if schema differs
  }

  return result;
}

async function enrichLongitudinal(
  db: any, athleteId: string
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};

  try {
    const [goalsRes, concernsRes, prefRes] = await Promise.all([
      db
        .from('athlete_longitudinal_memory')
        .select('id', { count: 'exact', head: true })
        .eq('athlete_id', athleteId)
        .eq('memory_type', 'goal')
        .eq('is_resolved', false),
      db
        .from('athlete_longitudinal_memory')
        .select('id', { count: 'exact', head: true })
        .eq('athlete_id', athleteId)
        .eq('memory_type', 'concern')
        .eq('is_resolved', false),
      db
        .from('athlete_longitudinal_memory')
        .select('content')
        .eq('athlete_id', athleteId)
        .eq('memory_type', 'preference')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    result.active_goals_count = goalsRes.count ?? 0;
    result.unresolved_concerns_count = concernsRes.count ?? 0;
    if (prefRes.data?.content) {
      result.coaching_preference = prefRes.data.content;
    }
  } catch {
    // Longitudinal memory table may not exist
  }

  return result;
}

async function enrichAcademic(
  db: any, athleteId: string, sevenDaysAgo: string
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};

  try {
    // Study hours from calendar events of type 'study' in last 7 days
    const { data: studyEvents } = await db
      .from('calendar_events')
      .select('start_time, end_time')
      .eq('athlete_id', athleteId)
      .eq('event_type', 'study')
      .gte('start_time', sevenDaysAgo)
      .lte('start_time', new Date().toISOString());

    if (studyEvents && studyEvents.length > 0) {
      let totalMinutes = 0;
      for (const e of studyEvents) {
        const start = new Date(e.start_time).getTime();
        const end = new Date(e.end_time).getTime();
        totalMinutes += (end - start) / 60000;
      }
      result.study_hours_7d = Math.round((totalMinutes / 60) * 10) / 10;
    }

    // Active exam count from athlete_subjects
    const { count } = await db
      .from('athlete_subjects')
      .select('id', { count: 'exact', head: true })
      .eq('athlete_id', athleteId)
      .gte('exam_date', new Date().toISOString().slice(0, 10));

    if (count != null) {
      result.exam_count_active = count;
    }
  } catch {
    // Tables may not exist
  }

  return result;
}

async function enrichPrograms(
  db: any, athleteId: string, sevenDaysAgo: string, thirtyDaysAgo: string
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};

  try {
    // Drills completed (from blazepod_sessions as interim source)
    const { count: drillCount } = await db
      .from('blazepod_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('athlete_id', athleteId)
      .gte('created_at', sevenDaysAgo);

    if (drillCount != null) {
      result.drills_completed_7d = drillCount;
    }

    // Active program count (from calendar_events with program links)
    const { data: programEvents } = await db
      .from('calendar_events')
      .select('program_id')
      .eq('athlete_id', athleteId)
      .not('program_id', 'is', null)
      .gte('start_time', new Date().toISOString());

    if (programEvents) {
      const uniquePrograms = new Set(programEvents.map((e: any) => e.program_id));
      result.active_program_count = uniquePrograms.size;
    }

    // Points in last 7 days
    const { data: pointsData } = await db
      .from('points_ledger')
      .select('points')
      .eq('user_id', athleteId)
      .gte('created_at', sevenDaysAgo);

    if (pointsData && pointsData.length > 0) {
      result.total_points_7d = pointsData.reduce(
        (sum: number, p: any) => sum + (p.points ?? 0), 0
      );
    }

    // Longest streak from users table
    const { data: userData } = await db
      .from('users')
      .select('longest_streak')
      .eq('id', athleteId)
      .maybeSingle();

    if (userData?.longest_streak != null) {
      result.longest_streak = userData.longest_streak;
    }
  } catch {
    // Tables may not exist
  }

  return result;
}
