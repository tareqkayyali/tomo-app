-- Multi-role support: Coach & Parent portals
-- Adds role system, user relationships, suggestions workflow, notifications, and invite codes.

-- ═══════════════════════════════════════════════════════════════════
--  1. Modify users table — add role column
-- ═══════════════════════════════════════════════════════════════════

alter table public.users
  add column if not exists role text not null default 'player'
    check (role in ('player', 'coach', 'parent'));

alter table public.users
  add column if not exists display_role text;  -- e.g. "Head Coach", "Mom"

create index if not exists idx_users_role on public.users (role);

-- ═══════════════════════════════════════════════════════════════════
--  2. Relationships — links coaches/parents to players
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.relationships (
  id uuid default gen_random_uuid() primary key,
  guardian_id uuid references auth.users(id) on delete cascade not null,
  player_id uuid references auth.users(id) on delete cascade not null,
  relationship_type text not null
    check (relationship_type in ('coach', 'parent')),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'revoked')),
  invite_code text unique,
  created_at timestamptz default now() not null,
  accepted_at timestamptz,
  unique (guardian_id, player_id, relationship_type)
);

alter table public.relationships enable row level security;

-- RLS: users can see relationships they're part of
create policy "Users see own relationships"
  on public.relationships for select
  using (guardian_id = auth.uid() or player_id = auth.uid());

create policy "Guardians insert relationships"
  on public.relationships for insert
  with check (guardian_id = auth.uid());

create policy "Participants update relationships"
  on public.relationships for update
  using (guardian_id = auth.uid() or player_id = auth.uid());

create policy "Participants delete relationships"
  on public.relationships for delete
  using (guardian_id = auth.uid() or player_id = auth.uid());

create index if not exists idx_relationships_guardian
  on public.relationships (guardian_id, status);
create index if not exists idx_relationships_player
  on public.relationships (player_id, status);
create index if not exists idx_relationships_invite_code
  on public.relationships (invite_code) where invite_code is not null;

-- ═══════════════════════════════════════════════════════════════════
--  3. Suggestions — cross-role approval workflow
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.suggestions (
  id uuid default gen_random_uuid() primary key,
  player_id uuid references auth.users(id) on delete cascade not null,
  author_id uuid references auth.users(id) on delete cascade not null,
  author_role text not null
    check (author_role in ('coach', 'parent', 'system')),
  suggestion_type text not null
    check (suggestion_type in ('study_block', 'exam_date', 'test_result', 'calendar_event')),
  title text not null,
  payload jsonb not null default '{}',
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'edited', 'declined', 'expired')),
  player_notes text,
  resolved_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz default now() not null
);

alter table public.suggestions enable row level security;

-- Players see suggestions directed to them; authors see their own suggestions
create policy "Players see own suggestions"
  on public.suggestions for select
  using (player_id = auth.uid() or author_id = auth.uid());

create policy "Authors create suggestions"
  on public.suggestions for insert
  with check (author_id = auth.uid());

create policy "Players resolve suggestions"
  on public.suggestions for update
  using (player_id = auth.uid());

create index if not exists idx_suggestions_player_status
  on public.suggestions (player_id, status, created_at desc);
create index if not exists idx_suggestions_author
  on public.suggestions (author_id, created_at desc);

-- ═══════════════════════════════════════════════════════════════════
--  4. Notifications — in-app notification feed
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null,
  title text not null,
  body text,
  data jsonb default '{}',
  read boolean not null default false,
  created_at timestamptz default now() not null
);

alter table public.notifications enable row level security;

create policy "Users see own notifications"
  on public.notifications for select
  using (user_id = auth.uid());

create policy "Users update own notifications"
  on public.notifications for update
  using (user_id = auth.uid());

-- System inserts via admin client, so no insert policy needed for users

create index if not exists idx_notifications_user_read
  on public.notifications (user_id, read, created_at desc);

-- ═══════════════════════════════════════════════════════════════════
--  5. Invite codes — secure linking between users
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.invite_codes (
  code text primary key,
  creator_id uuid references auth.users(id) on delete cascade not null,
  target_role text not null
    check (target_role in ('coach', 'parent')),
  used_by uuid references auth.users(id),
  expires_at timestamptz not null,
  created_at timestamptz default now() not null
);

alter table public.invite_codes enable row level security;

create policy "Creators see own invite codes"
  on public.invite_codes for select
  using (creator_id = auth.uid());

create policy "Creators insert invite codes"
  on public.invite_codes for insert
  with check (creator_id = auth.uid());

-- Updates (marking as used) done via admin client

create index if not exists idx_invite_codes_creator
  on public.invite_codes (creator_id, created_at desc);

-- ═══════════════════════════════════════════════════════════════════
--  6. Enable Supabase Realtime for key tables
-- ═══════════════════════════════════════════════════════════════════

alter publication supabase_realtime add table public.suggestions;
alter publication supabase_realtime add table public.notifications;
