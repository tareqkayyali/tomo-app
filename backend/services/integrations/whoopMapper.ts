/**
 * WHOOP Data Mapper — transforms WHOOP API responses into Tomo event payloads.
 *
 * Maps WHOOP data to existing event types:
 * - Recovery → VITAL_READING (HRV, resting HR, SpO₂)
 * - Sleep → SLEEP_RECORD
 * - Workout → SESSION_LOG (strain-based)
 * - Cycle → WEARABLE_SYNC (daily summary)
 */

import type {
  WhoopRecovery,
  WhoopSleep,
  WhoopWorkout,
  WhoopCycle,
} from "./whoopService";

// ── Recovery → VITAL_READING events ──
export function mapRecoveryToVitalReadings(
  recoveries: WhoopRecovery[]
): Array<{
  event_type: string;
  occurred_at: string;
  source: string;
  payload: Record<string, unknown>;
}> {
  return recoveries
    .filter((r) => r.score_state === "SCORED" && r.score)
    .map((r) => ({
      event_type: "VITAL_READING",
      occurred_at: r.created_at,
      source: "WEARABLE",
      payload: {
        hrv_ms: r.score!.hrv_rmssd_milli,
        resting_hr_bpm: r.score!.resting_heart_rate,
        spo2_percent: r.score!.spo2_percentage || undefined,
        skin_temp_celsius: r.score!.skin_temp_celsius || undefined,
        recovery_score: r.score!.recovery_score,
        wearable_device: "whoop",
        measurement_window: "MORNING",
      },
    }));
}

// ── Sleep → SLEEP_RECORD events ──
export function mapSleepToRecords(
  sleeps: WhoopSleep[]
): Array<{
  event_type: string;
  occurred_at: string;
  source: string;
  payload: Record<string, unknown>;
}> {
  return sleeps
    .filter((s) => s.score_state === "SCORED" && s.score && !s.nap)
    .map((s) => {
      const stages = s.score!.stage_summary;
      const totalSleepMs =
        stages.total_in_bed_time_milli - stages.total_awake_time_milli;
      const totalSleepHours = totalSleepMs / (1000 * 60 * 60);

      return {
        event_type: "SLEEP_RECORD",
        occurred_at: s.end, // Use wake time as event time
        source: "WEARABLE",
        payload: {
          sleep_duration_hours: Math.round(totalSleepHours * 10) / 10,
          sleep_quality_score: s.score!.sleep_performance_percentage
            ? Math.round(s.score!.sleep_performance_percentage / 10)
            : undefined,
          bed_time: s.start,
          wake_time: s.end,
          deep_sleep_min: Math.round(
            stages.total_slow_wave_sleep_time_milli / 60000
          ),
          rem_sleep_min: Math.round(
            stages.total_rem_sleep_time_milli / 60000
          ),
          light_sleep_min: Math.round(
            stages.total_light_sleep_time_milli / 60000
          ),
          awake_min: Math.round(stages.total_awake_time_milli / 60000),
          respiratory_rate: s.score!.respiratory_rate || undefined,
          sleep_efficiency: s.score!.sleep_efficiency_percentage || undefined,
          sleep_performance_pct: s.score!.sleep_performance_percentage || undefined,
          sleep_consistency_pct: s.score!.sleep_consistency_percentage || undefined,
          sleep_needed_baseline_hrs: s.score!.sleep_needed?.baseline_milli
            ? Math.round((s.score!.sleep_needed.baseline_milli / 3600000) * 10) / 10
            : undefined,
          sleep_debt_hrs: s.score!.sleep_needed?.need_from_sleep_debt_milli
            ? Math.round((s.score!.sleep_needed.need_from_sleep_debt_milli / 3600000) * 10) / 10
            : undefined,
          source: "whoop",
        },
      };
    });
}

// ── Workout → SESSION_LOG events ──
export function mapWorkoutsToSessionLogs(
  workouts: WhoopWorkout[]
): Array<{
  event_type: string;
  occurred_at: string;
  source: string;
  payload: Record<string, unknown>;
}> {
  return workouts
    .filter((w) => w.score_state === "SCORED" && w.score)
    .map((w) => {
      const durationMs =
        new Date(w.end).getTime() - new Date(w.start).getTime();
      const durationMin = Math.round(durationMs / 60000);

      return {
        event_type: "SESSION_LOG",
        occurred_at: w.end,
        source: "WEARABLE",
        payload: {
          session_type: "WORKOUT",
          duration_min: durationMin,
          strain: w.score!.strain,
          avg_hr_bpm: w.score!.average_heart_rate,
          max_hr_bpm: w.score!.max_heart_rate,
          calories_kcal: Math.round(w.score!.kilojoule / 4.184),
          distance_m: w.score!.distance_meter || undefined,
          hr_zones: w.score!.zone_duration
            ? {
                zone_0_min: Math.round(
                  w.score!.zone_duration.zone_zero_milli / 60000
                ),
                zone_1_min: Math.round(
                  w.score!.zone_duration.zone_one_milli / 60000
                ),
                zone_2_min: Math.round(
                  w.score!.zone_duration.zone_two_milli / 60000
                ),
                zone_3_min: Math.round(
                  w.score!.zone_duration.zone_three_milli / 60000
                ),
                zone_4_min: Math.round(
                  w.score!.zone_duration.zone_four_milli / 60000
                ),
                zone_5_min: Math.round(
                  w.score!.zone_duration.zone_five_milli / 60000
                ),
              }
            : undefined,
          wearable_device: "whoop",
          whoop_sport_id: w.sport_id,
        },
      };
    });
}

// ── Cycle → WEARABLE_SYNC event (daily summary) ──
export function mapCyclesToSync(
  cycles: WhoopCycle[]
): Array<{
  event_type: string;
  occurred_at: string;
  source: string;
  payload: Record<string, unknown>;
}> {
  return cycles
    .filter((c) => c.score_state === "SCORED" && c.score)
    .map((c) => ({
      event_type: "WEARABLE_SYNC",
      occurred_at: c.end || c.updated_at,
      source: "WEARABLE",
      payload: {
        device: "whoop",
        sync_timestamp: new Date().toISOString(),
        daily_strain: c.score!.strain,
        daily_calories_kcal: Math.round(c.score!.kilojoule / 4.184),
        avg_hr_bpm: c.score!.average_heart_rate,
        max_hr_bpm: c.score!.max_heart_rate,
        readings: [], // Individual readings come from recovery endpoint
      },
    }));
}
