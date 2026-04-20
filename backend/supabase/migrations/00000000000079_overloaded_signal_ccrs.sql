-- ════════════════════════════════════════════════════════════════════════════
-- Migration 079 — Rewrite the OVERLOADED pd_signals row to be CCRS-driven
-- ════════════════════════════════════════════════════════════════════════════
--
-- Pairs with commit `fd877be` (ACWR decommissioning from AI surfaces).
--
-- Before: the Dashboard "TODAY" hero card surfaced raw ACWR to athletes
-- ("Your body is signalling fatigue. ACWR at 1.55 — training load has spiked
-- beyond your chronic baseline..."), triggered by a hardcoded threshold
-- (ACWR > 1.5) on the pd_signals seed. Academic load (×0.4 weight) was
-- inflating ACWR into that 1.3–1.8 band without heavy training, so the
-- card fired (and forced a "Recovery Walk / Rest Day" plan) for athletes
-- who weren't actually overloaded.
--
-- After: the signal fires on CCRS recommendation ('blocked' | 'recovery')
-- OR the existing consecutive_red_days ≥ 2 backstop. The coaching text
-- and pills reference CCRS, not ACWR. Catastrophic ACWR overload still
-- propagates — it reaches CCRS via the >2.0 hard cap in ccrsFormula
-- (mode=hard_cap_only), which sets ccrs_recommendation='blocked'.
--
-- Idempotent: uses UPDATE (row already exists from migration 034). Safe to
-- re-run. If the OVERLOADED row somehow doesn't exist, this no-ops.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE pd_signals
SET
  subtitle = 'Body needs recovery',
  conditions = '{"match": "any", "conditions": [
    {"field": "ccrs_recommendation", "operator": "in", "value": ["blocked", "recovery"]},
    {"field": "consecutive_red_days", "operator": "gte", "value": 2}
  ]}'::jsonb,
  coaching_text = 'Your body is signalling fatigue. Readiness is {ccrs}/100 — recommendation is {ccrs_recommendation_label}. Prioritise recovery today. Light movement only.',
  pill_config = '[
    {"metric": "ccrs", "label_template": "Readiness {ccrs}/100", "sub_label": "needs recovery"},
    {"metric": "soreness", "label_template": "Soreness {soreness}/5", "sub_label": "elevated"}
  ]'::jsonb,
  trigger_config = '[
    {"metric": "ccrs", "label": "Readiness", "value_template": "{ccrs}/100", "baseline_template": "target 80+", "delta_template": "{ccrs_recommendation_label}", "positive_when": "above"},
    {"metric": "hrv_morning_ms", "label": "HRV", "value_template": "{value}ms", "baseline_template": "baseline {hrv_baseline_ms}ms", "delta_template": "{hrv_delta}%", "positive_when": "above"},
    {"metric": "soreness", "label": "Soreness", "value_template": "{soreness}/5", "baseline_template": "self-reported", "delta_template": "{soreness_delta}", "positive_when": "below"}
  ]'::jsonb,
  updated_at = NOW()
WHERE key = 'OVERLOADED';

-- ── Verification (informational only; comment out for non-interactive runs) ──
-- SELECT key, subtitle, coaching_text, conditions
-- FROM pd_signals
-- WHERE key = 'OVERLOADED';
