-- Padel shot results table
-- Stores individual shot ratings from padel shot rating sessions.
-- Each row = one shot type rated in one session.

create table if not exists padel_shot_results (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null default current_date,
  shot_type text not null,
  sub_metrics jsonb not null default '{}',
  overall numeric(5,2) not null default 0,
  session_type text not null default 'training',
  notes text default '',
  created_at timestamptz default now() not null
);

-- RLS
alter table padel_shot_results enable row level security;
create policy "Users see own padel shots"
  on padel_shot_results for select
  using (user_id = auth.uid());
create policy "Users insert own padel shots"
  on padel_shot_results for insert
  with check (user_id = auth.uid());

-- Index for fast user queries
create index if not exists idx_padel_shot_results_user_date
  on padel_shot_results (user_id, created_at desc);
