-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 083 — Seed Readiness Engine Config (CCRS + ACWR)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pairs with PR 2 of the config-engine plan. Inserts the two DEFAULT
-- payloads matching current hardcoded constants exactly:
--   - ccrs_formula_v1  (weights, PHV, freshness, cascade, recommendations,
--                       hard caps, alert thresholds)
--   - acwr_config_v1   (mode, thresholds, multipliers, windows, load
--                       channels, injury-risk flag mapping)
--
-- After this migration runs, `getCCRSConfig()` and `getACWRConfig()` start
-- returning the DB payload instead of the hardcoded DEFAULT. Because the
-- DB payload matches the DEFAULT byte-for-byte, CCRS/ACWR output is
-- mathematically unchanged. Ops can now tune values via /admin/config
-- without a code deploy.
--
-- Idempotent: uses ON CONFLICT (config_key) DO NOTHING so re-running is a
-- no-op. To reset a row to the seeded defaults after manual edits, delete
-- it first and re-run this migration — or use the Rollback UI.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO system_config (
  config_key,
  payload,
  schema_version,
  rollout_percentage,
  sport_filter,
  enabled,
  change_reason
) VALUES (
  'ccrs_formula_v1',
  '{
    "biometric_composite": {
      "hrv_weight": 0.45,
      "rhr_weight": 0.30,
      "sleep_weight": 0.25
    },
    "hooper": {
      "youth_motivation_multiplier": 1.2,
      "youth_age_threshold": 18
    },
    "freshness_decay": [
      {"hours_max": 8,    "multiplier": 1.00},
      {"hours_max": 16,   "multiplier": 0.75},
      {"hours_max": 24,   "multiplier": 0.45},
      {"hours_max": 48,   "multiplier": 0.15},
      {"hours_max": 9999, "multiplier": 0.00}
    ],
    "phv_multipliers": {
      "pre_phv":  1.00,
      "mid_phv":  0.85,
      "post_phv": 0.95,
      "adult":    1.00,
      "unknown":  0.90
    },
    "cascade_weights": {
      "biometric_full":           0.55,
      "biometric_freshness_min":  0.75,
      "hooper_with_biometric":    0.30,
      "hooper_without_biometric": 0.65,
      "coach_when_available":     0.08
    },
    "confidence_tiers": {
      "very_high_min": 0.75,
      "high_min":      0.55,
      "medium_min":    0.35
    },
    "recommendation_cutoffs": {
      "full_load_min": 80,
      "moderate_min":  65,
      "reduced_min":   45
    },
    "hard_caps": {
      "acwr_blocked_score_cap": 40
    },
    "historical_default":  62,
    "coach_phase_default": 65,
    "alert_thresholds": {
      "hrv_suppressed_score_max":     50,
      "hrv_suppressed_freshness_min": 0.5,
      "sleep_deficit_hours_max":      6,
      "low_motivation_max":           2
    },
    "confidence_signal_weights": {
      "historical_weight": 0.6,
      "coach_weight":      0.7
    }
  }'::jsonb,
  1,
  100,
  NULL,
  TRUE,
  'seed: migration 083 — CCRS formula defaults'
)
ON CONFLICT (config_key) DO NOTHING;


INSERT INTO system_config (
  config_key,
  payload,
  schema_version,
  rollout_percentage,
  sport_filter,
  enabled,
  change_reason
) VALUES (
  'acwr_config_v1',
  '{
    "mode": "hard_cap_only",
    "thresholds": {
      "safe_low":     0.8,
      "safe_high":    1.3,
      "caution_high": 1.3,
      "danger_high":  1.5,
      "hard_cap":     2.0
    },
    "multipliers": {
      "undertraining": 0.90,
      "sweet_spot":    1.00,
      "caution":       0.85,
      "high_risk":     0.65,
      "blocked":       0.40
    },
    "windows": {
      "acute_days":   7,
      "chronic_days": 28
    },
    "load_channels": {
      "training_weight": 1.0,
      "academic_weight": 0.0
    },
    "injury_risk_flag": {
      "red_above":   1.5,
      "amber_above": 1.3,
      "amber_below": 0.8
    }
  }'::jsonb,
  1,
  100,
  NULL,
  TRUE,
  'seed: migration 083 — ACWR config defaults (hard_cap_only, physical-only)'
)
ON CONFLICT (config_key) DO NOTHING;
