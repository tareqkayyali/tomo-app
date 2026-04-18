-- Migration 068: Suggestions — dual-mode (suggestion + approval_request)
--
-- P2.2 of the Triangle coordination layer. Extends the existing
-- public.suggestions table (migration 007) to support approval-request
-- flows alongside the original suggestion flow. Enables the parent-
-- supersedes-coach rule for T1/T2 minors.
--
-- Two modes in one table, one audit trail:
--   mode='suggestion'       → coach/parent proposes → athlete decides.
--                             Original flow. Behaviour unchanged.
--   mode='approval_request' → coach/athlete proposes training change;
--                             parent (or coach, per required_approver_role)
--                             must approve before the underlying target
--                             executes. Parent-supersedes-coach rule
--                             applies for T1/T2.
--
-- Design principles:
--   1. Single table. Do not duplicate suggestions/* for approvals —
--      one state machine (pending/accepted/edited/declined/expired),
--      one audit trail, one query surface.
--   2. approval_chain is an append-only JSONB log of decisions (not
--      the authoritative status). It captures who decided what when
--      + notes. Status stays authoritative.
--   3. target_ref_type / target_ref_id point at the thing being gated
--      (e.g. a training_programs row pending publish). The publish
--      path consults this before acting.
--   4. supersede_rule is explicit. Callers declare the resolution
--      policy at creation. 'parent_supersedes_coach' fires the T1/T2
--      rule even if coach decides first.
--   5. Safety gates remain absolute. Parent approval is necessary but
--      not sufficient — the program publish path re-runs the ACWR /
--      PHV gate after approval resolution. This migration only tracks
--      the human-authority decision; the safety deterministic filter
--      is applied at the call site.
--
-- Idempotent.

-- ═══════════════════════════════════════════════════════════════════
--  Column additions
-- ═══════════════════════════════════════════════════════════════════

alter table public.suggestions
  add column if not exists mode text not null default 'suggestion'
    check (mode in ('suggestion','approval_request'));

alter table public.suggestions
  add column if not exists blocking boolean not null default false;

alter table public.suggestions
  add column if not exists required_approver_role text
    check (required_approver_role is null or required_approver_role in ('parent','coach','athlete'));

alter table public.suggestions
  add column if not exists approval_chain jsonb not null default '[]'::jsonb;

alter table public.suggestions
  add column if not exists supersede_rule text not null default 'first_decision'
    check (supersede_rule in ('first_decision','parent_supersedes_coach','unanimous'));

alter table public.suggestions
  add column if not exists target_ref_type text;

alter table public.suggestions
  add column if not exists target_ref_id uuid;

alter table public.suggestions
  add column if not exists resolved_by uuid references auth.users(id) on delete set null;

alter table public.suggestions
  add column if not exists resolved_by_role text
    check (resolved_by_role is null or resolved_by_role in ('parent','coach','athlete','system'));

alter table public.suggestions
  add column if not exists resolution_rationale text;

-- Extend suggestion_type check constraint to include training-plan +
-- programme-publish targets (approval-mode use cases).
-- Drop-and-recreate is idempotent via the IF EXISTS / DO block guard.
do $$
begin
  alter table public.suggestions drop constraint if exists suggestions_suggestion_type_check;
  alter table public.suggestions
    add constraint suggestions_suggestion_type_check
    check (suggestion_type in (
      'study_block','exam_date','test_result','calendar_event',
      'programme_publish','training_plan_change','session_intensity_change'
    ));
end $$;

comment on column public.suggestions.mode is
  'Flow direction. suggestion=coach/parent→athlete proposes, athlete decides. approval_request=athlete/coach proposes, parent or coach gates per required_approver_role. P2.2 2026-04-18.';

comment on column public.suggestions.blocking is
  'When true, the target referenced by target_ref_type/target_ref_id is NOT executed until this suggestion resolves to accepted. The publish path must consult suggestions.status before acting.';

comment on column public.suggestions.approval_chain is
  'Append-only JSONB array: [{role, user_id, decision, notes, at}, ...]. The authoritative status lives in suggestions.status — this column is the audit trail so we can reconstruct WHO decided WHAT WHEN.';

comment on column public.suggestions.supersede_rule is
  'Resolution policy. first_decision=first ACCEPT or DECLINE wins. parent_supersedes_coach=parent decision overrides coach even if coach approved first (T1/T2 rule). unanimous=all required approvers must accept, any decline resolves to declined.';

-- ═══════════════════════════════════════════════════════════════════
--  Indexes for the new query shapes
-- ═══════════════════════════════════════════════════════════════════

-- "what's pending approval for me as a parent/coach" query
create index if not exists idx_suggestions_approval_pending
  on public.suggestions (required_approver_role, status, created_at desc)
  where mode = 'approval_request' and status = 'pending';

-- "what approval requests exist for this athlete" query
create index if not exists idx_suggestions_athlete_mode
  on public.suggestions (player_id, mode, status, created_at desc);

-- Link to the target being gated (e.g. fast lookup of approval by
-- programme id during the publish check).
create index if not exists idx_suggestions_target_ref
  on public.suggestions (target_ref_type, target_ref_id)
  where target_ref_id is not null;

-- ═══════════════════════════════════════════════════════════════════
--  RLS update — approvers read approval_request rows that target them
-- ═══════════════════════════════════════════════════════════════════

-- Existing policies: "Players see own suggestions" (covers player_id
-- and author_id). Approval-mode needs a third leg: guardians of the
-- player can read + update approval_request rows where their role
-- matches required_approver_role.

drop policy if exists "Approvers read approval requests" on public.suggestions;
create policy "Approvers read approval requests"
  on public.suggestions
  for select
  using (
    mode = 'approval_request'
    and required_approver_role is not null
    and exists (
      select 1
      from public.relationships r
      where r.player_id = public.suggestions.player_id
        and r.guardian_id = auth.uid()
        and r.status = 'accepted'
        and r.relationship_type = required_approver_role
    )
  );

drop policy if exists "Approvers decide approval requests" on public.suggestions;
create policy "Approvers decide approval requests"
  on public.suggestions
  for update
  using (
    mode = 'approval_request'
    and status = 'pending'
    and required_approver_role is not null
    and exists (
      select 1
      from public.relationships r
      where r.player_id = public.suggestions.player_id
        and r.guardian_id = auth.uid()
        and r.status = 'accepted'
        and r.relationship_type = required_approver_role
    )
  )
  with check (
    mode = 'approval_request'
    and required_approver_role is not null
  );

-- ═══════════════════════════════════════════════════════════════════
--  End
-- ═══════════════════════════════════════════════════════════════════
