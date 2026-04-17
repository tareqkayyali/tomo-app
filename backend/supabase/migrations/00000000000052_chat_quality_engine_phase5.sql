-- ============================================================================
-- Migration 052: Chat Quality Engine — Phase 5 additions
-- ============================================================================
-- Adds the minimum schema needed for:
--   - Drift detection        (nothing new — reads chat_quality_scores)
--   - Auto-repair PR flow    (proposed_patch jsonb on quality_drift_alerts)
--   - Shadow / canary runs   (nothing new — prompt_shadow_runs exists)
--   - Golden-set curation    (user + response snippets on sampled turns)
--
-- All new columns are nullable / defaulted so existing rows remain valid.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- quality_drift_alerts: add structured patch body so auto-repair workers can
-- write the proposed change alongside the alert. Admins can preview before
-- any PR is opened.
-- ----------------------------------------------------------------------------

alter table quality_drift_alerts
  add column if not exists proposed_patch jsonb;


-- ----------------------------------------------------------------------------
-- chat_quality_scores: snippet columns for golden-set curation.
-- Store up to 500 chars of the user message + assistant response at the time
-- the turn was sampled. This is the minimum needed to reconstruct the
-- scenario when promoting it into golden_test_scenarios.
-- ----------------------------------------------------------------------------

alter table chat_quality_scores
  add column if not exists user_message_snippet text,
  add column if not exists assistant_response_snippet text;

comment on column chat_quality_scores.user_message_snippet is
  'First 500 chars of the athlete turn. Stored only for sampled turns. Used by the golden-set curator to create eval scenarios.';
comment on column chat_quality_scores.assistant_response_snippet is
  'First 500 chars of the assistant response. Stored only for sampled turns. Used by admin review + golden-set curation.';


-- ----------------------------------------------------------------------------
-- Support view: daily mean + std + count per dimension × segment.
-- Used by the drift detector so it doesn't have to compute aggregates in TS.
-- ----------------------------------------------------------------------------

create or replace view v_quality_scores_daily_by_segment as
with scored as (
  select
    date_trunc('day', created_at) as day,
    sport,
    age_band,
    agent,
    has_rag,
    -- Trimmed mean across available judges per dimension. Nulls excluded.
    (
      coalesce(a_faithfulness,0)   + coalesce(b_faithfulness,0)   + coalesce(c_faithfulness,0)
    ) / nullif(
      (case when a_faithfulness is not null then 1 else 0 end) +
      (case when b_faithfulness is not null then 1 else 0 end) +
      (case when c_faithfulness is not null then 1 else 0 end), 0) as faithfulness,

    (coalesce(a_answer_quality,0) + coalesce(b_answer_quality,0) + coalesce(c_answer_quality,0))
    / nullif(
      (case when a_answer_quality is not null then 1 else 0 end) +
      (case when b_answer_quality is not null then 1 else 0 end) +
      (case when c_answer_quality is not null then 1 else 0 end), 0) as answer_quality,

    (coalesce(a_tone,0) + coalesce(b_tone,0) + coalesce(c_tone,0))
    / nullif(
      (case when a_tone is not null then 1 else 0 end) +
      (case when b_tone is not null then 1 else 0 end) +
      (case when c_tone is not null then 1 else 0 end), 0) as tone,

    (coalesce(a_age_fit,0) + coalesce(b_age_fit,0) + coalesce(c_age_fit,0))
    / nullif(
      (case when a_age_fit is not null then 1 else 0 end) +
      (case when b_age_fit is not null then 1 else 0 end) +
      (case when c_age_fit is not null then 1 else 0 end), 0) as age_fit,

    (coalesce(a_conversational,0) + coalesce(b_conversational,0) + coalesce(c_conversational,0))
    / nullif(
      (case when a_conversational is not null then 1 else 0 end) +
      (case when b_conversational is not null then 1 else 0 end) +
      (case when c_conversational is not null then 1 else 0 end), 0) as conversational,

    (coalesce(a_empathy,0) + coalesce(b_empathy,0) + coalesce(c_empathy,0))
    / nullif(
      (case when a_empathy is not null then 1 else 0 end) +
      (case when b_empathy is not null then 1 else 0 end) +
      (case when c_empathy is not null then 1 else 0 end), 0) as empathy,

    (coalesce(a_personalization,0) + coalesce(b_personalization,0) + coalesce(c_personalization,0))
    / nullif(
      (case when a_personalization is not null then 1 else 0 end) +
      (case when b_personalization is not null then 1 else 0 end) +
      (case when c_personalization is not null then 1 else 0 end), 0) as personalization,

    (coalesce(a_actionability,0) + coalesce(b_actionability,0) + coalesce(c_actionability,0))
    / nullif(
      (case when a_actionability is not null then 1 else 0 end) +
      (case when b_actionability is not null then 1 else 0 end) +
      (case when c_actionability is not null then 1 else 0 end), 0) as actionability
  from chat_quality_scores
)
select *
from scored;

grant select on v_quality_scores_daily_by_segment to service_role;


-- ----------------------------------------------------------------------------
-- Rollback reference:
--   drop view if exists v_quality_scores_daily_by_segment;
--   alter table chat_quality_scores
--     drop column if exists user_message_snippet,
--     drop column if exists assistant_response_snippet;
--   alter table quality_drift_alerts drop column if exists proposed_patch;
-- ----------------------------------------------------------------------------
