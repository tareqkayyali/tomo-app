-- ============================================================================
-- Migration 051: Chat Quality Engine — Safety Audit + Quality Track Phase 1
-- ============================================================================
-- Two-track observability for AI Chat:
--   SAFETY TRACK  → safety_audit_log, safety_audit_flags
--   QUALITY TRACK → chat_quality_scores, quality_drift_alerts,
--                   auto_repair_patterns, prompt_shadow_runs,
--                   golden_test_scenarios
--
-- All tables RLS-enabled. These are pure internal telemetry — no athlete
-- access. The admin CMS reads via supabaseAdmin() (service role, bypasses
-- RLS). This matches the pattern in migrations 016, 029, 030, 047 which
-- gate on service_role only. Production has no uniform `public.users`
-- schema to key admin authz against.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SAFETY TRACK
-- ----------------------------------------------------------------------------

create table if not exists safety_audit_log (
  id                uuid primary key default gen_random_uuid(),
  trace_id          text not null,
  turn_id           uuid not null,
  session_id        uuid,
  user_id           uuid references auth.users(id) on delete set null,
  phv_stage         text check (phv_stage in ('pre_phv','mid_phv','post_phv','unknown')),
  age_band          text check (age_band in ('u13','u15','u17','u19_plus','unknown')),
  rule_fired        boolean not null,
  rule_trigger      text,
  response_hash     text,
  auditor_verdict   text check (auditor_verdict in ('agrees','rule_missed','false_positive','pending')),
  auditor_model     text,
  auditor_cost_usd  numeric(10,6),
  auditor_latency_ms int,
  created_at        timestamptz not null default now()
);

create index idx_safety_audit_log_trace on safety_audit_log(trace_id);
create index idx_safety_audit_log_turn on safety_audit_log(turn_id);
create index idx_safety_audit_log_verdict on safety_audit_log(auditor_verdict)
  where auditor_verdict in ('rule_missed','false_positive');
create index idx_safety_audit_log_created on safety_audit_log(created_at desc);

alter table safety_audit_log enable row level security;

drop policy if exists safety_audit_log_service_all on safety_audit_log;
create policy safety_audit_log_service_all on safety_audit_log
  for all to service_role using (true) with check (true);

drop policy if exists safety_audit_log_admin_read on safety_audit_log;


create table if not exists safety_audit_flags (
  id              uuid primary key default gen_random_uuid(),
  audit_log_id    uuid not null references safety_audit_log(id) on delete cascade,
  flag_type       text not null check (flag_type in ('rule_missed','false_positive')),
  severity        text not null check (severity in ('critical','high','medium')),
  status          text not null default 'open' check (status in ('open','triaged','resolved','false_alarm')),
  reviewer_id     uuid references auth.users(id),
  reviewed_at     timestamptz,
  resolution      text,
  created_at      timestamptz not null default now()
);

create index idx_safety_audit_flags_status on safety_audit_flags(status) where status = 'open';
create index idx_safety_audit_flags_severity on safety_audit_flags(severity);
create index idx_safety_audit_flags_created on safety_audit_flags(created_at desc);

alter table safety_audit_flags enable row level security;

drop policy if exists safety_audit_flags_service_all on safety_audit_flags;
create policy safety_audit_flags_service_all on safety_audit_flags
  for all to service_role using (true) with check (true);

drop policy if exists safety_audit_flags_admin_all on safety_audit_flags;


-- ----------------------------------------------------------------------------
-- QUALITY TRACK — Scores
-- ----------------------------------------------------------------------------
-- 8 dimensions × 3 judges = 24 score columns.
-- Nulls allowed: conditional dimensions (empathy, actionability) grade null
-- when their trigger didn't fire. Non-conditional dimensions null only if the
-- judge failed.
-- ----------------------------------------------------------------------------

create table if not exists chat_quality_scores (
  id                    uuid primary key default gen_random_uuid(),
  trace_id              text not null,
  turn_id               uuid not null unique,
  session_id            uuid,
  user_id               uuid references auth.users(id) on delete set null,

  sport                 text,
  age_band              text check (age_band in ('u13','u15','u17','u19_plus','unknown')),
  agent                 text check (agent in ('timeline','output','mastery','orchestrator','capsule','fast_path')),
  has_rag               boolean default false,

  sampling_stratum      text not null check (sampling_stratum in (
    'phv_flagged','safety_triggered','low_confidence_intent','fallthrough','routine_sample'
  )),

  -- Conditional dimension triggers
  empathy_triggered     boolean not null default false,
  action_triggered      boolean not null default false,

  -- Judge A: Claude Haiku
  a_faithfulness        numeric(3,2) check (a_faithfulness between 0 and 1),
  a_answer_quality      numeric(3,2) check (a_answer_quality between 0 and 1),
  a_tone                numeric(3,2) check (a_tone between 0 and 1),
  a_age_fit             numeric(3,2) check (a_age_fit between 0 and 1),
  a_conversational      numeric(3,2) check (a_conversational between 0 and 1),
  a_empathy             numeric(3,2) check (a_empathy between 0 and 1),
  a_personalization     numeric(3,2) check (a_personalization between 0 and 1),
  a_actionability       numeric(3,2) check (a_actionability between 0 and 1),
  a_model               text,
  a_cost_usd            numeric(10,6),
  a_latency_ms          int,

  -- Judge B: cross-family LLM (default GPT-4o-mini — see vendor doc)
  b_faithfulness        numeric(3,2) check (b_faithfulness between 0 and 1),
  b_answer_quality      numeric(3,2) check (b_answer_quality between 0 and 1),
  b_tone                numeric(3,2) check (b_tone between 0 and 1),
  b_age_fit             numeric(3,2) check (b_age_fit between 0 and 1),
  b_conversational      numeric(3,2) check (b_conversational between 0 and 1),
  b_empathy             numeric(3,2) check (b_empathy between 0 and 1),
  b_personalization     numeric(3,2) check (b_personalization between 0 and 1),
  b_actionability       numeric(3,2) check (b_actionability between 0 and 1),
  b_model               text,
  b_cost_usd            numeric(10,6),
  b_latency_ms          int,

  -- Judge C: rule-based heuristics
  c_faithfulness        numeric(3,2) check (c_faithfulness between 0 and 1),
  c_answer_quality      numeric(3,2) check (c_answer_quality between 0 and 1),
  c_tone                numeric(3,2) check (c_tone between 0 and 1),
  c_age_fit             numeric(3,2) check (c_age_fit between 0 and 1),
  c_conversational      numeric(3,2) check (c_conversational between 0 and 1),
  c_empathy             numeric(3,2) check (c_empathy between 0 and 1),
  c_personalization     numeric(3,2) check (c_personalization between 0 and 1),
  c_actionability       numeric(3,2) check (c_actionability between 0 and 1),

  -- Disagreement + review
  disagreement_max      numeric(3,2),
  needs_human_review    boolean not null default false,

  -- Implicit feedback (populated async, 2 min after turn)
  fb_followup_clarify   boolean,
  fb_session_abandoned  boolean,
  fb_repeat_intent      boolean,
  fb_regen_requested    boolean,
  fb_computed_at        timestamptz,

  total_judge_cost_usd  numeric(10,6) generated always as
    (coalesce(a_cost_usd,0) + coalesce(b_cost_usd,0)) stored,

  created_at            timestamptz not null default now()
);

create index idx_cqs_trace on chat_quality_scores(trace_id);
create index idx_cqs_session on chat_quality_scores(session_id);
create index idx_cqs_user on chat_quality_scores(user_id);
create index idx_cqs_stratum on chat_quality_scores(sampling_stratum);
create index idx_cqs_agent on chat_quality_scores(agent);
create index idx_cqs_sport_age on chat_quality_scores(sport, age_band);
create index idx_cqs_review on chat_quality_scores(needs_human_review) where needs_human_review = true;
create index idx_cqs_created on chat_quality_scores(created_at desc);

alter table chat_quality_scores enable row level security;

drop policy if exists cqs_service_all on chat_quality_scores;
create policy cqs_service_all on chat_quality_scores
  for all to service_role using (true) with check (true);

drop policy if exists cqs_admin_read on chat_quality_scores;


-- ----------------------------------------------------------------------------
-- QUALITY TRACK — Auto-Repair Library
-- ----------------------------------------------------------------------------

create table if not exists auto_repair_patterns (
  id                 uuid primary key default gen_random_uuid(),
  pattern_name       text unique not null,
  description        text,
  detection_spec     jsonb not null,
  affected_files     text[],
  patch_spec         jsonb not null,
  last_triggered_at  timestamptz,
  times_triggered    int not null default 0,
  times_merged       int not null default 0,
  success_rate       numeric(3,2),
  status             text not null default 'active' check (status in ('active','disabled','archived')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index idx_arp_status on auto_repair_patterns(status) where status = 'active';

alter table auto_repair_patterns enable row level security;

drop policy if exists arp_service_all on auto_repair_patterns;
create policy arp_service_all on auto_repair_patterns
  for all to service_role using (true) with check (true);

drop policy if exists arp_admin_all on auto_repair_patterns;


-- ----------------------------------------------------------------------------
-- QUALITY TRACK — Drift Alerts (references auto_repair_patterns, so comes after)
-- ----------------------------------------------------------------------------

create table if not exists quality_drift_alerts (
  id                    uuid primary key default gen_random_uuid(),
  dimension             text not null check (dimension in (
    'faithfulness','answer_quality','tone','age_fit','conversational',
    'empathy','personalization','actionability'
  )),
  segment_key           jsonb not null,
  baseline_mean         numeric(4,3),
  current_mean          numeric(4,3),
  cusum_value           numeric(5,3),
  window_days           int not null default 7,
  matched_pattern_id    uuid references auto_repair_patterns(id) on delete set null,
  proposed_pr_url       text,
  status                text not null default 'open' check (status in (
    'open','patch_proposed','patch_merged','resolved','false_alarm'
  )),
  alerted_at            timestamptz not null default now(),
  resolved_at           timestamptz,
  resolution_notes      text
);

create index idx_qda_status on quality_drift_alerts(status) where status in ('open','patch_proposed');
create index idx_qda_dimension on quality_drift_alerts(dimension);
create index idx_qda_alerted on quality_drift_alerts(alerted_at desc);

alter table quality_drift_alerts enable row level security;

drop policy if exists qda_service_all on quality_drift_alerts;
create policy qda_service_all on quality_drift_alerts
  for all to service_role using (true) with check (true);

drop policy if exists qda_admin_all on quality_drift_alerts;


-- ----------------------------------------------------------------------------
-- QUALITY TRACK — Shadow + Canary Runs
-- ----------------------------------------------------------------------------

create table if not exists prompt_shadow_runs (
  id                       uuid primary key default gen_random_uuid(),
  variant_name             text not null,
  variant_commit_hash      text,
  phase                    text not null check (phase in (
    'shadow','canary_5','canary_10','canary_25','promoted','rolled_back'
  )),
  canary_traffic_pct       int check (canary_traffic_pct between 0 and 100),
  excludes_risk_segments   boolean not null default true,
  started_at               timestamptz not null default now(),
  ended_at                 timestamptz,
  turns_evaluated          int not null default 0,
  baseline_scores          jsonb,
  variant_scores           jsonb,
  implicit_delta           jsonb,
  p_values                 jsonb,
  decision                 text check (decision in ('promoted','rolled_back','extended','pending')),
  decision_reason          text,
  created_by               uuid references auth.users(id)
);

create index idx_psr_phase on prompt_shadow_runs(phase);
create index idx_psr_variant on prompt_shadow_runs(variant_name);
create index idx_psr_started on prompt_shadow_runs(started_at desc);

alter table prompt_shadow_runs enable row level security;

drop policy if exists psr_service_all on prompt_shadow_runs;
create policy psr_service_all on prompt_shadow_runs
  for all to service_role using (true) with check (true);

drop policy if exists psr_admin_all on prompt_shadow_runs;


-- ----------------------------------------------------------------------------
-- QUALITY TRACK — Golden Test Set
-- ----------------------------------------------------------------------------

create table if not exists golden_test_scenarios (
  id                      uuid primary key default gen_random_uuid(),
  scenario_key            text unique not null,
  suite                   text not null check (suite in ('s1','s2','s3','s4','s5','s6','s7','s8')),
  user_message            text not null,
  expected_agent          text,
  expected_signals        jsonb not null default '{}'::jsonb,
  source                  text not null check (source in (
    'curated','live_low_score','regression_canary'
  )),
  is_frozen               boolean not null default false,
  last_passing_score      numeric(3,2),
  consecutive_passes      int not null default 0,
  scheduled_removal_at    timestamptz,
  added_at                timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index idx_gts_suite on golden_test_scenarios(suite);
create index idx_gts_source on golden_test_scenarios(source);
create index idx_gts_frozen on golden_test_scenarios(is_frozen) where is_frozen = true;

alter table golden_test_scenarios enable row level security;

drop policy if exists gts_service_all on golden_test_scenarios;
create policy gts_service_all on golden_test_scenarios
  for all to service_role using (true) with check (true);

drop policy if exists gts_admin_all on golden_test_scenarios;


-- ----------------------------------------------------------------------------
-- updated_at triggers
-- ----------------------------------------------------------------------------

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger trg_arp_updated before update on auto_repair_patterns
  for each row execute function set_updated_at();

create trigger trg_gts_updated before update on golden_test_scenarios
  for each row execute function set_updated_at();


-- ----------------------------------------------------------------------------
-- Admin CMS convenience views
-- ----------------------------------------------------------------------------

create or replace view v_quality_scores_aggregated as
select
  date_trunc('day', created_at) as day,
  sport,
  age_band,
  agent,
  sampling_stratum,
  count(*) as turn_count,
  avg((coalesce(a_faithfulness,0) + coalesce(b_faithfulness,0) + coalesce(c_faithfulness,0)) /
      nullif((case when a_faithfulness is not null then 1 else 0 end +
              case when b_faithfulness is not null then 1 else 0 end +
              case when c_faithfulness is not null then 1 else 0 end), 0)) as mean_faithfulness,
  avg((coalesce(a_tone,0) + coalesce(b_tone,0) + coalesce(c_tone,0)) /
      nullif((case when a_tone is not null then 1 else 0 end +
              case when b_tone is not null then 1 else 0 end +
              case when c_tone is not null then 1 else 0 end), 0)) as mean_tone,
  avg((coalesce(a_age_fit,0) + coalesce(b_age_fit,0) + coalesce(c_age_fit,0)) /
      nullif((case when a_age_fit is not null then 1 else 0 end +
              case when b_age_fit is not null then 1 else 0 end +
              case when c_age_fit is not null then 1 else 0 end), 0)) as mean_age_fit,
  sum(total_judge_cost_usd) as total_cost_usd
from chat_quality_scores
group by 1,2,3,4,5;

grant select on v_quality_scores_aggregated to service_role;


create or replace view v_safety_audit_open_flags as
select
  f.id as flag_id,
  f.flag_type,
  f.severity,
  l.phv_stage,
  l.age_band,
  l.rule_trigger,
  l.auditor_model,
  l.created_at as turn_at,
  f.created_at as flagged_at
from safety_audit_flags f
join safety_audit_log l on l.id = f.audit_log_id
where f.status = 'open'
order by
  case f.severity when 'critical' then 0 when 'high' then 1 else 2 end,
  f.created_at desc;

grant select on v_safety_audit_open_flags to service_role;


-- ----------------------------------------------------------------------------
-- Seed: initial auto-repair patterns (inactive until wired in Phase 5)
-- ----------------------------------------------------------------------------

insert into auto_repair_patterns (pattern_name, description, detection_spec, affected_files, patch_spec, status)
values
  ('u13_tone_drift',
   'U13 age_fit mean drops > 4σ in 7d window; typical cause: over-technical vocabulary leaking into U13 responses',
   '{"type":"cusum_drift","dimension":"age_fit","segment":{"age_band":"u13"},"threshold_sigma":4.0,"window_days":7}'::jsonb,
   array['backend/services/agents/orchestrator.ts','docs/tomo-age-tone-profiles.md'],
   '{"type":"prompt_block_reinforce","target_block":"U13_TONE","reinforcement":"Sentences must be 8-12 words. No acronyms. No physiology terms. One concept per answer."}'::jsonb,
   'disabled'),

  ('football_position_context_miss',
   'Personalization dimension drops for football segment; responses not referencing position-specific coaching',
   '{"type":"cusum_drift","dimension":"personalization","segment":{"sport":"football"},"threshold_sigma":4.0,"window_days":7}'::jsonb,
   array['backend/services/agents/orchestrator.ts','backend/services/agents/contextBuilder.ts'],
   '{"type":"prompt_block_reinforce","target_block":"SPORT_POSITION_FOOTBALL","reinforcement":"Always reference the athletes playing position in tactical and conditioning guidance."}'::jsonb,
   'disabled'),

  ('rag_faithfulness_post_ingest',
   'Faithfulness dimension drops after a new RAG chunk ingest batch; typical cause: retrieval k too low or new chunks poorly embedded',
   '{"type":"cusum_drift","dimension":"faithfulness","segment":{"has_rag":true},"threshold_sigma":3.5,"window_days":3}'::jsonb,
   array['backend/services/agents/ragChatRetriever.ts'],
   '{"type":"constant_update","symbol":"RAG_TOP_K","proposed_new_value":"current+2","max_value":10}'::jsonb,
   'disabled'),

  ('empathy_therapy_speak_regression',
   'Empathy dimension drops because responses started using forbidden therapy-speak phrases ("I hear you", "that sounds tough")',
   '{"type":"cusum_drift","dimension":"empathy","segment":{},"threshold_sigma":4.0,"window_days":7}'::jsonb,
   array['backend/services/agents/orchestrator.ts','docs/tomo-empathy-pattern.md'],
   '{"type":"prompt_block_reinforce","target_block":"EMPATHY_PATTERN","reinforcement":"Name feeling, validate in one sentence, pivot to action. Forbidden: I hear you, that sounds tough, I am here for you."}'::jsonb,
   'disabled');


-- ============================================================================
-- Rollback reference (do not execute unless rolling back):
--
-- drop view if exists v_safety_audit_open_flags;
-- drop view if exists v_quality_scores_aggregated;
-- drop table if exists golden_test_scenarios cascade;
-- drop table if exists prompt_shadow_runs cascade;
-- drop table if exists quality_drift_alerts cascade;
-- drop table if exists auto_repair_patterns cascade;
-- drop table if exists chat_quality_scores cascade;
-- drop table if exists safety_audit_flags cascade;
-- drop table if exists safety_audit_log cascade;
-- drop function if exists set_updated_at();
-- ============================================================================
