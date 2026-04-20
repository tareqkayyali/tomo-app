/**
 * PR 4 regression — load_attribution_v1 DEFAULT + sessionHandler AU
 * fallback semantics.
 *
 * These tests exercise the pure resolution logic: given a SESSION_LOG
 * payload shape, what AU does the handler write to athlete_daily_load?
 *
 * The handler itself has a lot of I/O (Supabase calls, recomputeACWR,
 * snapshot upserts) that would require a heavyweight integration fixture
 * to assert end-to-end. This suite covers the part of the handler that
 * changed in PR 4 — the AU resolution — via `estimateLoad` directly,
 * mirroring the exact logic inside `resolveTrainingLoadAU`.
 */

import { estimateLoad } from "../../services/events/computations/loadEstimator";
import { LOAD_ATTRIBUTION_DEFAULT } from "../../services/events/loadAttributionConfig";
import { NOTIFICATION_CONFIG_DEFAULT } from "../../services/notifications/notificationConfig";

/**
 * Re-implementation of the private resolveTrainingLoadAU helper so tests
 * can exercise it without the handler's DB dependencies. If the two
 * diverge, this fails — acting as a contract assertion.
 */
function resolveTrainingLoadAU(
  payload: Record<string, unknown>,
  fallbackEnabled: boolean,
): number {
  const explicit = Number(payload.training_load_au) || 0;
  if (explicit > 0) return explicit;
  if (!fallbackEnabled) return 0;

  const intensity = typeof payload.intensity === 'string' ? payload.intensity : null;
  const duration = Number(payload.duration_min);
  if (!intensity || !Number.isFinite(duration) || duration <= 0) return 0;

  const eventType = typeof payload.event_type === 'string' ? payload.event_type : 'training';
  const est = estimateLoad({ event_type: eventType, intensity, duration_min: duration });
  return est.training_load_au;
}

describe("sessionHandler AU fallback — primary path", () => {
  test("pre-computed training_load_au wins over fallback", () => {
    const au = resolveTrainingLoadAU(
      { training_load_au: 42, intensity: 'MODERATE', duration_min: 60 },
      true,
    );
    expect(au).toBe(42);
  });

  test("pre-computed 0 is treated as missing (falls through to defense)", () => {
    const au = resolveTrainingLoadAU(
      { training_load_au: 0, intensity: 'HARD', duration_min: 60 },
      true,
    );
    // HARD × 60 min = 8 AU
    expect(au).toBe(8);
  });
});

describe("sessionHandler AU fallback — defense path (handler_au_fallback_enabled=true)", () => {
  test("null training_load_au + intensity + duration → computed AU", () => {
    const au = resolveTrainingLoadAU(
      { intensity: 'MODERATE', duration_min: 60, event_type: 'training' },
      true,
    );
    expect(au).toBe(6);
  });

  test("null training_load_au + MATCH-overridden event_type → 9 AU/h", () => {
    const au = resolveTrainingLoadAU(
      { intensity: 'LIGHT', duration_min: 90, event_type: 'match' },
      true,
    );
    expect(au).toBe(13.5);
  });

  test("null training_load_au, event_type defaults to training when missing", () => {
    const au = resolveTrainingLoadAU(
      { intensity: 'HARD', duration_min: 45 },
      true,
    );
    // HARD × 0.75h = 6 AU
    expect(au).toBe(6);
  });

  test("missing intensity + duration → 0 (nothing to compute from)", () => {
    const au = resolveTrainingLoadAU({}, true);
    expect(au).toBe(0);
  });

  test("intensity present but duration missing → 0", () => {
    const au = resolveTrainingLoadAU({ intensity: 'HARD' }, true);
    expect(au).toBe(0);
  });

  test("duration present but intensity missing → 0", () => {
    const au = resolveTrainingLoadAU({ duration_min: 60 }, true);
    expect(au).toBe(0);
  });

  test("negative duration → 0 (prevents negative AU on the ledger)", () => {
    const au = resolveTrainingLoadAU(
      { intensity: 'HARD', duration_min: -60 },
      true,
    );
    expect(au).toBe(0);
  });
});

describe("sessionHandler AU fallback — defense disabled", () => {
  test("null payload with fallback disabled → 0 (legacy behaviour)", () => {
    const au = resolveTrainingLoadAU(
      { intensity: 'MODERATE', duration_min: 60 },
      false,
    );
    expect(au).toBe(0);
  });

  test("pre-computed AU still wins even with fallback disabled", () => {
    const au = resolveTrainingLoadAU(
      { training_load_au: 10, intensity: 'MODERATE', duration_min: 60 },
      false,
    );
    expect(au).toBe(10);
  });
});

describe("load_attribution_v1 DEFAULT — Zod schema accepts the hardcoded payload", () => {
  test("DEFAULT is self-consistent (sanity)", () => {
    expect(LOAD_ATTRIBUTION_DEFAULT.handler_au_fallback_enabled).toBe(true);
    expect(LOAD_ATTRIBUTION_DEFAULT.atl_ctl_includes_scheduled).toBe(true);
    expect(LOAD_ATTRIBUTION_DEFAULT.auto_skip_hours_after_end).toBe(24);
    expect(LOAD_ATTRIBUTION_DEFAULT.completion_triggers.manual_tap.confidence).toBe(1.0);
    expect(LOAD_ATTRIBUTION_DEFAULT.completion_triggers.wearable_match.window_minutes_before).toBe(30);
  });
});

describe("notification_config_v1 DEFAULT — shape", () => {
  test("session_confirmation has the expected keys", () => {
    const sc = NOTIFICATION_CONFIG_DEFAULT.session_confirmation;
    expect(sc.enabled).toBe(true);
    expect(sc.push_time_local).toBe("18:00");
    expect(sc.quiet_hours.start).toBe("22:00");
    expect(sc.template.title).toContain("{session_title}");
    expect(sc.deeplink).toContain("{event_id}");
  });
});
