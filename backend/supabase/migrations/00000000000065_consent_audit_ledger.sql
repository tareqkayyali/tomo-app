-- Migration 065: Consent Audit Ledger
--
-- Adds the append-only audit trail that COPPA §312.8 ("reasonable
-- procedures for retention") and Apple App Store Review 5.1.1(i–iv)
-- require when the platform processes minors' data. Before this
-- migration all consent state lived in a handful of mutable columns
-- on public.users — sufficient as a hot-path gate but inadmissible as
-- a regulator-facing audit trail because it's destructive: each grant
-- overwrites the prior state and we cannot prove what a user agreed
-- to at a given moment in time.
--
-- Design principles:
--   1. Append-only. Every grant or revoke is a new row. Revocation
--      does NOT delete the grant row; it inserts a paired `granted=false`
--      row. Full history is reconstructable.
--   2. Per-consent-type. Apple 5.1.1(iii) requires data minimisation —
--      split consents for `ai_coaching`, `coach_visibility`,
--      `parent_visibility`, etc. instead of one blanket "privacy".
--   3. Jurisdiction-tagged. Same user may live under different laws
--      at different times (moves country). Each row records the
--      jurisdiction that applied at capture time, not dynamically.
--   4. Document-bound. `document_hash` pins the exact legal text the
--      user agreed to. Bumping the version invalidates prior rows;
--      users get a re-consent banner with 30-day grace.
--   5. Verification-method captured per row. Apple/COPPA need proof
--      the parental consent was verifiable (Apple Parental Gate,
--      credit-card micro-charge, KYC).
--   6. Hot path unchanged. public.users.consent_status remains the
--      trigger-driven gate (migration 062). This ledger is the
--      companion audit, not a replacement.
--
-- Apple guideline reference:
--   5.1.1(i)  — post privacy policy (versioned; we pin hash here)
--   5.1.1(ii) — obtain consent (captured with verification_method)
--   5.1.1(iii)— minimise collection (per-consent-type split)
--   5.1.1(iv) — notice of third parties (ai_coaching consent covers
--               Claude/OpenAI/Voyage processing)
--   5.1.4     — children special category (coppa_parental /
--               gdpr_k_parental types, granted_by = parent id)
--
-- Idempotent.

-- ═══════════════════════════════════════════════════════════════════
--  consent_documents — metadata for legal docs served at
--  backend/public/legal/*.html
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.consent_documents (
  version text not null,
  consent_type text not null check (consent_type in (
    'tos','privacy','coppa_parental','gdpr_k_parental',
    'ccpa_sale_optout','analytics','marketing','ai_coaching',
    'coach_visibility','parent_visibility','moderated_content_view'
  )),
  jurisdiction text not null default 'GLOBAL',
  body_hash text not null,           -- sha256 of the served document body
  title text,
  effective_at timestamptz not null default now(),
  retired_at timestamptz,
  primary key (version, consent_type, jurisdiction)
);

comment on table public.consent_documents is
  'Metadata for every versioned legal document Tomo serves. Bodies live in backend/public/legal/*.html (versioned meta tag). This table tracks which version was served when so the audit ledger can bind each grant to an exact document via body_hash.';

create index if not exists idx_consent_docs_type_effective
  on public.consent_documents (consent_type, jurisdiction, effective_at desc);

alter table public.consent_documents enable row level security;

drop policy if exists "Anyone read consent documents" on public.consent_documents;
create policy "Anyone read consent documents"
  on public.consent_documents
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins manage consent documents" on public.consent_documents;
create policy "Admins manage consent documents"
  on public.consent_documents
  for all
  using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  )
  with check (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

grant select on public.consent_documents to anon, authenticated;
grant all on public.consent_documents to service_role;

-- Seed the two existing documents (TOS v1.0.0, Privacy v1.0.0) if not
-- already present. body_hash is a placeholder; the consent service
-- updates it on first read of the legal HTML.
insert into public.consent_documents (version, consent_type, jurisdiction, body_hash, title)
values
  ('1.0.0', 'tos',     'GLOBAL', 'placeholder', 'Terms of Service'),
  ('1.0.0', 'privacy', 'GLOBAL', 'placeholder', 'Privacy Policy')
on conflict (version, consent_type, jurisdiction) do nothing;

-- ═══════════════════════════════════════════════════════════════════
--  user_consents — append-only audit ledger
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  consent_type text not null check (consent_type in (
    'tos','privacy','coppa_parental','gdpr_k_parental',
    'ccpa_sale_optout','analytics','marketing','ai_coaching',
    'coach_visibility','parent_visibility','moderated_content_view'
  )),
  version text not null,
  jurisdiction text not null default 'GLOBAL',
  granted boolean not null,
  granted_by uuid references auth.users(id) on delete set null,
    -- parent id for COPPA/GDPR-K rows; equal to user_id for self-consent
  verification_method text check (verification_method in (
    'self','apple_parental_gate','apple_ask_to_buy','credit_card',
    'gov_id','email_plus','knowledge_based'
  )),
  ip_inet inet,
  user_agent text,
  document_hash text,
  revokes_id uuid references public.user_consents(id),
    -- when granted=false, points at the grant row being revoked
  created_at timestamptz not null default now()
);

comment on table public.user_consents is
  'Append-only audit ledger for every consent event (grant or revoke). Never UPDATE; always INSERT. Revocation inserts a granted=false row with revokes_id pointing at the originating grant. Full temporal reconstruction by filtering created_at.';

create index if not exists idx_user_consents_user_created
  on public.user_consents (user_id, created_at desc);
create index if not exists idx_user_consents_type_current
  on public.user_consents (user_id, consent_type, created_at desc);
create index if not exists idx_user_consents_granted_by
  on public.user_consents (granted_by)
  where granted_by is not null;

alter table public.user_consents enable row level security;

-- Users see their own consent history
drop policy if exists "Users read own consents" on public.user_consents;
create policy "Users read own consents"
  on public.user_consents
  for select
  using (user_id = auth.uid() or granted_by = auth.uid());

-- Admins see everything for regulator requests
drop policy if exists "Admins read all consents" on public.user_consents;
create policy "Admins read all consents"
  on public.user_consents
  for select
  using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

-- Service role writes only; authenticated users never INSERT/UPDATE
-- directly — the consent service owns the write path.
grant select on public.user_consents to authenticated;
grant all on public.user_consents to service_role;

-- ═══════════════════════════════════════════════════════════════════
--  user_jurisdiction — resolved at signup or profile change
-- ═══════════════════════════════════════════════════════════════════
-- Separate from users.region_code because jurisdiction is a LEGAL
-- determination (which consent law applies) derived from region_code
-- but also from self-declared address for EU where GDPR-K age varies.
-- Today we lock to 16 EU-wide so jurisdiction is coarse — the table
-- exists so we can migrate to per-member-state without schema change.

create table if not exists public.user_jurisdiction (
  user_id uuid primary key references auth.users(id) on delete cascade,
  jurisdiction text not null,        -- 'US','US-CA','EU','UK','UAE','KSA','GLOBAL'
  determined_by text check (determined_by in ('billing','ip','self_declared')),
  determined_at timestamptz not null default now()
);

comment on table public.user_jurisdiction is
  'Resolved jurisdiction per user. Derived from users.region_code today (coarse: EU locked to 16 for GDPR-K regardless of member state). When per-member-state granularity is needed, migrate callers without schema change.';

create index if not exists idx_user_jurisdiction_jurisdiction
  on public.user_jurisdiction (jurisdiction);

alter table public.user_jurisdiction enable row level security;

drop policy if exists "Users read own jurisdiction" on public.user_jurisdiction;
create policy "Users read own jurisdiction"
  on public.user_jurisdiction
  for select
  using (user_id = auth.uid());

grant select on public.user_jurisdiction to authenticated;
grant all on public.user_jurisdiction to service_role;

-- ═══════════════════════════════════════════════════════════════════
--  admin_override_log — justified admin actions
-- ═══════════════════════════════════════════════════════════════════
-- Referenced by the DOB one-way-gate exception (users request a DOB
-- change to older values, admin reviews + approves with justification).
-- Also used by emergency age-tier override and consent-status override.

create table if not exists public.admin_override_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id),
  action text not null check (action in (
    'dob_older_change','age_tier_override','consent_status_override',
    'relationship_force_accept','relationship_force_revoke',
    'moderation_override'
  )),
  subject_user_id uuid references auth.users(id),
  before_value jsonb,
  after_value jsonb,
  justification text not null,       -- required, non-empty
  created_at timestamptz not null default now(),
  check (length(justification) >= 10)
);

comment on table public.admin_override_log is
  'Every manual admin action that bypasses normal user flows must write a row here with a mandatory justification (>=10 chars). Feeds the admin audit surface and is preserved through user deletion (subject_user_id FK has no cascade — admins keep their own audit trail).';

create index if not exists idx_admin_override_admin_created
  on public.admin_override_log (admin_id, created_at desc);
create index if not exists idx_admin_override_subject_created
  on public.admin_override_log (subject_user_id, created_at desc)
  where subject_user_id is not null;

alter table public.admin_override_log enable row level security;

drop policy if exists "Admins read admin override log" on public.admin_override_log;
create policy "Admins read admin override log"
  on public.admin_override_log
  for select
  using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

grant select on public.admin_override_log to authenticated;
grant all on public.admin_override_log to service_role;

-- ═══════════════════════════════════════════════════════════════════
--  End
-- ═══════════════════════════════════════════════════════════════════
