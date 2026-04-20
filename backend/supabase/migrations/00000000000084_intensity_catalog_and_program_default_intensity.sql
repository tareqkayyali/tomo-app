-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 084 — Intensity Catalog + training_programs.default_intensity
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Part of PR 3 of the config-engine plan. Seeds the intensity_catalog_v1
-- row with DEFAULT rates (matching the pre-refactor loadEstimator.ts
-- constants byte-for-byte) and adds the `default_intensity` column to
-- `training_programs` so the CMS can mark the expected physical intensity
-- of each program.
--
-- Why the column: during the April 2026 prod audit we found 1947 of 1947
-- SESSION_LOG events in 28 days had payload.intensity = null because
-- athletes scheduled programs without picking a bucket. Upstream writers
-- default to null, sessionHandler writes 0 AU to athlete_daily_load, and
-- every athlete's ATL/CTL/ACWR was effectively zero. Once this column
-- exists, the calendar-event creation path can auto-pull intensity from
-- the linked program (falling back through drill → MODERATE) so athletes
-- don't have to remember to pick.
--
-- Backfill: existing training_programs.difficulty maps to intensity via
-- the intensity_catalog_v1 `program_difficulty_to_intensity` field.
-- beginner → LIGHT, intermediate → MODERATE, advanced → HARD, elite → HARD.
--
-- Idempotent: column ADD uses IF NOT EXISTS; INSERT uses ON CONFLICT DO NOTHING.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Seed intensity_catalog_v1 ─────────────────────────────────────────────

INSERT INTO system_config (
  config_key,
  payload,
  schema_version,
  rollout_percentage,
  sport_filter,
  enabled,
  change_reason
) VALUES (
  'intensity_catalog_v1',
  '{
    "au_per_hour": {
      "REST":     2,
      "LIGHT":    4,
      "MODERATE": 6,
      "HARD":     8,
      "MATCH":    9,
      "RECOVERY": 1
    },
    "academic_au_per_hour": 10,
    "event_type_overrides": {
      "match":    {"au_per_hour": 9, "always_intensity": "MATCH"},
      "recovery": {"au_per_hour": 1, "always_intensity": "LIGHT"}
    },
    "program_difficulty_to_intensity": {
      "beginner":     "LIGHT",
      "intermediate": "MODERATE",
      "advanced":     "HARD",
      "elite":        "HARD"
    },
    "drill_intensity_map": {
      "light":    "LIGHT",
      "moderate": "MODERATE",
      "hard":     "HARD"
    },
    "wearable_strain_to_intensity": {
      "whoop": [
        {"strain_max": 6,  "intensity": "LIGHT"},
        {"strain_max": 12, "intensity": "MODERATE"},
        {"strain_max": 18, "intensity": "HARD"},
        {"strain_max": 21, "intensity": "HARD"}
      ]
    },
    "rpe_to_intensity": [
      {"rpe_max": 2,  "intensity": "REST"},
      {"rpe_max": 4,  "intensity": "LIGHT"},
      {"rpe_max": 6,  "intensity": "MODERATE"},
      {"rpe_max": 10, "intensity": "HARD"}
    ],
    "default_intensity": "MODERATE"
  }'::jsonb,
  1,
  100,
  NULL,
  TRUE,
  'seed: migration 084 — intensity catalog defaults'
)
ON CONFLICT (config_key) DO NOTHING;


-- ─── Add training_programs.default_intensity ──────────────────────────────

ALTER TABLE training_programs
  ADD COLUMN IF NOT EXISTS default_intensity TEXT
    CHECK (default_intensity IN ('REST', 'LIGHT', 'MODERATE', 'HARD'));

COMMENT ON COLUMN training_programs.default_intensity IS
  'CMS-set physical intensity bucket for this program. When a calendar event is created with a link to this program and no explicit intensity, the creation path uses this value. Cascade: explicit athlete pick → this column → linked drill intensity → difficulty-map fallback → intensity_catalog_v1.default_intensity.';


-- ─── Backfill default_intensity from difficulty ───────────────────────────
-- Only touches rows where default_intensity is still NULL so re-runs are no-ops.

UPDATE training_programs
SET default_intensity = CASE
  WHEN difficulty = 'beginner'     THEN 'LIGHT'
  WHEN difficulty = 'intermediate' THEN 'MODERATE'
  WHEN difficulty = 'advanced'     THEN 'HARD'
  WHEN difficulty = 'elite'        THEN 'HARD'
  ELSE 'MODERATE'
END
WHERE default_intensity IS NULL;
