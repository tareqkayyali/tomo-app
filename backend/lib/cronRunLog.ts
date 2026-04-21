/**
 * cron_run_log helper — wraps any cron job execution with observability.
 *
 * Every scheduled trigger should use `withCronLog()` so that:
 *   - Start / finish / duration are recorded
 *   - Processed / sent / queued / failed counts are captured
 *   - Failures surface in cron_run_log with error_message + status='failed'
 *
 * Partial failures (some items processed, some failed) are recorded as
 * status='partial' so dashboards can alert without a full-stop error.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export interface CronRunCounts {
  processed?: number;
  sent?: number;
  queued?: number;
  failed?: number;
  details?: Record<string, unknown>;
}

export interface CronRunResult extends CronRunCounts {
  job_name: string;
  run_id: string | null;
  duration_ms: number;
  status: "success" | "partial" | "failed";
  error?: string;
}

// Cast to any — cron_run_log (migration 087) not yet in generated types.
const db = () => supabaseAdmin() as any;

async function startRun(jobName: string): Promise<string | null> {
  try {
    const { data, error } = await db()
      .from("cron_run_log")
      .insert({ job_name: jobName, status: "running" })
      .select("id")
      .single();
    if (error) {
      logger.warn(`[cronRunLog] failed to start run for ${jobName}`, { error: error.message });
      return null;
    }
    return data?.id ?? null;
  } catch (err) {
    logger.warn(`[cronRunLog] startRun threw for ${jobName}`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function finishRun(
  runId: string,
  durationMs: number,
  status: "success" | "partial" | "failed",
  counts: CronRunCounts,
  errorMessage?: string,
): Promise<void> {
  try {
    await db()
      .from("cron_run_log")
      .update({
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
        status,
        processed_count: counts.processed ?? 0,
        sent_count: counts.sent ?? 0,
        queued_count: counts.queued ?? 0,
        failed_count: counts.failed ?? 0,
        error_message: errorMessage ?? null,
        details: counts.details ?? {},
      })
      .eq("id", runId);
  } catch (err) {
    logger.warn(`[cronRunLog] finishRun threw`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Wrap a cron job body with observability. The body returns count metrics;
 * this helper handles start/finish logging + final result payload.
 *
 * Usage:
 *   return withCronLog("notifications.tick_15min", async () => {
 *     const { sent } = await triggerSessionNotifications();
 *     return { processed: sent, sent, details: { ... } };
 *   });
 */
export async function withCronLog(
  jobName: string,
  body: () => Promise<CronRunCounts>,
): Promise<CronRunResult> {
  const startedAt = Date.now();
  const runId = await startRun(jobName);

  try {
    const counts = await body();
    const duration = Date.now() - startedAt;
    const status: "success" | "partial" =
      (counts.failed ?? 0) > 0 && (counts.sent ?? 0 + (counts.processed ?? 0)) > 0
        ? "partial"
        : "success";

    if (runId) await finishRun(runId, duration, status, counts);
    logger.info(`[cron] ${jobName} ${status}`, { duration_ms: duration, ...counts });

    return {
      job_name: jobName,
      run_id: runId,
      duration_ms: duration,
      status,
      ...counts,
    };
  } catch (err) {
    const duration = Date.now() - startedAt;
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (runId) await finishRun(runId, duration, "failed", {}, errorMessage);
    logger.error(`[cron] ${jobName} failed`, { duration_ms: duration, error: errorMessage });

    return {
      job_name: jobName,
      run_id: runId,
      duration_ms: duration,
      status: "failed",
      error: errorMessage,
    };
  }
}
