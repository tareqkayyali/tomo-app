/**
 * Planning Post-Processor — validates AI-generated plans against
 * mandatory protocols and athlete safety gates.
 *
 * Called by planningAgent.ts after plan generation to catch violations
 * before presenting the plan to the athlete.
 */

export interface PlanValidationResult {
  valid: boolean;
  violations: string[];
  warnings: string[];
}

/**
 * Validate a plan (or current week schedule) against mandatory protocols
 * and athlete state constraints.
 *
 * @param plan - The draft plan (events array or grouped-by-date object from DB)
 * @param mandatoryProtocols - Protocol IDs that MUST be respected
 * @param snapshotState - Current athlete state from snapshot enrichment
 */
export function validatePlan(
  plan: any,
  mandatoryProtocols: string[],
  snapshotState: Record<string, unknown>
): PlanValidationResult {
  const violations: string[] = [];
  const warnings: string[] = [];

  // Normalize events — handle both flat array and grouped-by-date shapes
  const events: any[] = Array.isArray(plan?.events)
    ? plan.events
    : plan?.byDate
      ? Object.values(plan.byDate as Record<string, any[]>).flat()
      : Array.isArray(plan)
        ? plan
        : [];

  // ── 1. MANDATORY protocol checks ──────────────────────────────

  // Check if mandatory protocols are violated by any event
  for (const protocolId of mandatoryProtocols) {
    switch (protocolId) {
      case "acwr_spike": {
        // Check for HARD intensity sessions when ACWR is spiked
        const hardSessions = events.filter(
          (e) => e.intensity === "HARD" && ["training", "match"].includes(e.event_type)
        );
        if (hardSessions.length > 0) {
          violations.push(
            `ACWR Spike: ${hardSessions.length} HARD session(s) scheduled while ACWR is above safe threshold. Reduce to MODERATE or LIGHT.`
          );
        }
        break;
      }

      case "red_readiness": {
        // Only checked when readiness is actually RED
        // The caller should only include this protocol when readiness is RED
        const nonLightSessions = events.filter(
          (e) =>
            ["training", "match"].includes(e.event_type) &&
            e.intensity &&
            !["LIGHT", "REST"].includes(e.intensity)
        );
        if (nonLightSessions.length > 0) {
          violations.push(
            `RED Readiness: ${nonLightSessions.length} session(s) above LIGHT intensity while readiness is RED. Only LIGHT/REST allowed.`
          );
        }
        break;
      }

      case "phv_load_cap": {
        // Already checked below in PHV safety gate
        break;
      }

      case "dual_load_critical": {
        // Count total sessions — should be reduced
        const totalTrainingSessions = events.filter((e) =>
          ["training", "match", "recovery"].includes(e.event_type)
        ).length;
        if (totalTrainingSessions > 10) {
          warnings.push(
            `Dual Load Critical: ${totalTrainingSessions} total sessions this week while DLI is critical. Consider reducing to 7-8.`
          );
        }
        break;
      }

      case "school_hours": {
        // This is checked by the schedule validation service at event creation time
        // Included here for completeness
        break;
      }
    }
  }

  // ── 2. PHV safety gate ────────────────────────────────────────

  const phvStage = snapshotState.phv_stage as string | null;
  if (phvStage === "CIRCA" || phvStage === "mid_phv" || phvStage === "MID") {
    const hardSessions = events.filter(
      (e) => e.intensity === "HARD" && ["training", "match"].includes(e.event_type)
    );
    if (hardSessions.length > 0) {
      violations.push(
        `PHV Safety: ${hardSessions.length} HARD intensity session(s) scheduled for an athlete in mid-PHV (peak growth). No HARD sessions allowed — reduce to MODERATE or LIGHT.`
      );
    }
  }

  // ── 3. Injury risk flag gate ──────────────────────────────────

  const injuryRiskFlag = snapshotState.injury_risk_flag as string | null;
  if (injuryRiskFlag === "RED") {
    const aboveLightSessions = events.filter(
      (e) =>
        ["training", "match"].includes(e.event_type) &&
        e.intensity &&
        !["LIGHT", "REST"].includes(e.intensity)
    );
    if (aboveLightSessions.length > 0) {
      violations.push(
        `Injury Risk RED: ${aboveLightSessions.length} session(s) above LIGHT intensity while injury risk is RED. Only LIGHT/REST sessions allowed until cleared.`
      );
    }
  }

  // ── 4. Max sessions per day ───────────────────────────────────

  // Group events by local date and check max per day
  const byDate: Record<string, any[]> = {};
  for (const event of events) {
    // Use local_date if available, otherwise parse from start_at
    const date =
      event.local_date ??
      (event.start_at ? new Date(event.start_at).toISOString().split("T")[0] : "unknown");
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(event);
  }

  // Default max is 2 sessions per day — mode-specific caps are checked by the agent
  const maxPerDay = 3; // Hard ceiling regardless of mode
  for (const [date, dayEvents] of Object.entries(byDate)) {
    const trainingSessions = dayEvents.filter((e) =>
      ["training", "match", "recovery"].includes(e.event_type)
    );
    if (trainingSessions.length > maxPerDay) {
      warnings.push(
        `${date}: ${trainingSessions.length} training/match/recovery sessions scheduled (max ${maxPerDay}). Consider reducing.`
      );
    }
  }

  // ── 5. School hours check ─────────────────────────────────────

  // Basic check: flag training sessions between 07:00-15:00 on weekdays
  // The full check with actual school schedule is done by the schedule validation service
  for (const [date, dayEvents] of Object.entries(byDate)) {
    const d = new Date(`${date}T12:00:00`);
    const dayOfWeek = d.getDay();
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

    if (isWeekday) {
      for (const event of dayEvents) {
        if (!["training", "match"].includes(event.event_type)) continue;
        const startTime = event.local_start ?? (event.start_at ? new Date(event.start_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }) : null);
        if (startTime) {
          const [h] = startTime.split(":").map(Number);
          if (h >= 7 && h < 15) {
            warnings.push(
              `${date}: "${event.title ?? event.event_type}" at ${startTime} falls during typical school hours (07:00-15:00).`
            );
          }
        }
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    warnings,
  };
}
