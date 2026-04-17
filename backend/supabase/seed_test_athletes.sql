-- ============================================================
-- TOMO TEST ATHLETE SEED — 5 Athletes x 90 Days
-- ============================================================
-- Auth users already created. Run this in Supabase SQL Editor.
-- ============================================================
-- UUID Mapping:
--   test1@tomo.com = 5ca793a3-9c0b-49cc-8353-d637878b52cb = Marcus Thompson
--   test2@tomo.com = ec4c81c1-5a28-429d-bb00-2eb01e6069a2 = Sofia Al-Rashid (football, winger)
--   test3@tomo.com = 695a2ba5-0ef6-4e4f-9048-4f09a5c44c65 = Jamal Williams (football, striker)
--   test4@tomo.com = 2fb6d4bf-e45a-404a-98b1-5f8fb2db6ae3 = Lena Kovacs (football, defender)
--   test5@tomo.com = 193f245e-0308-463f-bf11-3c6809c14690 = Omar Hadid (football, goalkeeper)
-- ============================================================

-- ============================================================
-- 1. USERS TABLE (profiles)
-- ============================================================

INSERT INTO users (id, email, name, sport, age, archetype, total_points, current_streak, longest_streak,
  freeze_tokens, onboarding_complete, season_phase, weekly_training_days, date_of_birth,
  height_cm, weight_kg, gender, nationality, preferred_foot, created_at)
VALUES
  -- Marcus Thompson — 14yo footballer, mid-PHV, ACWR danger
  ('5ca793a3-9c0b-49cc-8353-d637878b52cb', 'test1@tomo.com', 'Marcus Thompson', 'football', 14, 'surge',
   4250, 12, 18, 1, true, 'in_season', 5,
   '2012-03-15', 172.5, 58.0, 'male', 'UK', 'right', now() - interval '90 days'),

  -- Sofia Al-Rashid — 16yo footballer (winger), post-PHV, exam period
  ('ec4c81c1-5a28-429d-bb00-2eb01e6069a2', 'test2@tomo.com', 'Sofia Al-Rashid', 'football', 16, 'blade',
   8900, 22, 35, 2, true, 'in_season', 4,
   '2010-07-22', 165.0, 55.0, 'female', 'UAE', 'right', now() - interval '180 days'),

  -- Jamal Williams — 12yo footballer (striker), pre-PHV
  ('695a2ba5-0ef6-4e4f-9048-4f09a5c44c65', 'test3@tomo.com', 'Jamal Williams', 'football', 12, 'phoenix',
   850, 3, 7, 0, true, 'pre_season', 3,
   '2014-01-08', 148.0, 40.0, 'male', 'US', 'right', now() - interval '45 days'),

  -- Lena Kovacs — 17yo footballer (defender), post-PHV, injured
  ('2fb6d4bf-e45a-404a-98b1-5f8fb2db6ae3', 'test4@tomo.com', 'Lena Kovacs', 'football', 17, 'titan',
   12400, 0, 42, 3, true, 'in_season', 5,
   '2009-05-30', 170.0, 62.0, 'female', 'HU', 'right', now() - interval '365 days'),

  -- Omar Hadid — 15yo footballer, circa-PHV, study mode
  ('193f245e-0308-463f-bf11-3c6809c14690', 'test5@tomo.com', 'Omar Hadid', 'football', 15, 'blade',
   6200, 15, 28, 1, true, 'in_season', 4,
   '2011-09-10', 175.0, 63.0, 'male', 'JO', 'both', now() - interval '120 days')
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email, name = EXCLUDED.name, sport = EXCLUDED.sport,
  age = EXCLUDED.age, archetype = EXCLUDED.archetype, total_points = EXCLUDED.total_points,
  current_streak = EXCLUDED.current_streak, longest_streak = EXCLUDED.longest_streak,
  season_phase = EXCLUDED.season_phase, weekly_training_days = EXCLUDED.weekly_training_days,
  date_of_birth = EXCLUDED.date_of_birth, height_cm = EXCLUDED.height_cm,
  weight_kg = EXCLUDED.weight_kg, gender = EXCLUDED.gender, nationality = EXCLUDED.nationality,
  preferred_foot = EXCLUDED.preferred_foot, onboarding_complete = EXCLUDED.onboarding_complete;

-- ============================================================
-- 2. PLAYER_SCHEDULE_PREFERENCES
-- ============================================================

INSERT INTO player_schedule_preferences (user_id, school_days, school_start, school_end,
  sleep_start, sleep_end, study_days, study_duration_min, gym_days, club_days,
  league_is_active, exam_period_active, training_categories, updated_at)
VALUES
  ('5ca793a3-9c0b-49cc-8353-d637878b52cb', '{0,1,2,3,4}', '08:00', '15:00', '22:30', '07:00',
   '{0,1,2,3}', 45, '{1,3,5}', '{0,2,4}',
   true, false,
   '[{"id":"club","label":"Club Training","days":3},{"id":"gym","label":"Gym","days":2}]'::jsonb,
   now()),

  ('ec4c81c1-5a28-429d-bb00-2eb01e6069a2', '{0,1,2,3,4}', '07:30', '14:30', '23:00', '06:30',
   '{0,1,2,3,4}', 90, '{1,4}', '{0,2,4}',
   false, true,
   '[{"id":"club","label":"Club Training","days":3},{"id":"gym","label":"Fitness","days":1},{"id":"study","label":"Study","days":5}]'::jsonb,
   now()),

  ('695a2ba5-0ef6-4e4f-9048-4f09a5c44c65', '{0,1,2,3,4}', '08:00', '15:00', '21:30', '06:30',
   '{1,3}', 30, '{2}', '{1,3,5}',
   false, false,
   '[{"id":"club","label":"Club Training","days":3},{"id":"gym","label":"Movement","days":1}]'::jsonb,
   now()),

  ('2fb6d4bf-e45a-404a-98b1-5f8fb2db6ae3', '{0,1,2,3,4}', '08:00', '14:00', '22:00', '06:30',
   '{0,2}', 45, '{1,3}', '{0,2,4}',
   true, false,
   '[{"id":"club","label":"Club Training","days":4},{"id":"gym","label":"S&C","days":2},{"id":"recovery","label":"Recovery","days":1}]'::jsonb,
   now()),

  ('193f245e-0308-463f-bf11-3c6809c14690', '{0,1,2,3,4}', '07:30', '14:30', '22:30', '06:30',
   '{0,1,2,3,4}', 75, '{1,4}', '{0,2,4}',
   false, true,
   '[{"id":"club","label":"GK Training","days":3},{"id":"gym","label":"Gym","days":2},{"id":"study","label":"Study","days":5}]'::jsonb,
   now())
ON CONFLICT (user_id) DO UPDATE SET
  league_is_active = EXCLUDED.league_is_active,
  exam_period_active = EXCLUDED.exam_period_active,
  training_categories = EXCLUDED.training_categories;

-- ============================================================
-- 3. ATHLETE_DAILY_LOAD — 90 days per athlete
-- ============================================================

INSERT INTO athlete_daily_load (athlete_id, load_date, training_load_au, academic_load_au, session_count)
SELECT athlete_id, load_date, training_load_au, academic_load_au, session_count
FROM (
  -- MARCUS (ACWR danger ~1.6): high spike last 7 days
  SELECT '5ca793a3-9c0b-49cc-8353-d637878b52cb'::uuid as athlete_id,
    d::date as load_date,
    CASE
      WHEN d >= current_date - 6 THEN (85 + (random() * 30))::numeric(8,1)
      WHEN d >= current_date - 13 THEN (45 + (random() * 20))::numeric(8,1)
      WHEN extract(dow from d) IN (5, 6) AND random() < 0.4 THEN 0
      ELSE (40 + (random() * 25))::numeric(8,1)
    END as training_load_au,
    CASE
      WHEN extract(dow from d) BETWEEN 0 AND 4 THEN (15 + (random() * 15))::numeric(8,1)
      ELSE (5 + (random() * 10))::numeric(8,1)
    END as academic_load_au,
    CASE
      WHEN d >= current_date - 6 THEN 2
      WHEN extract(dow from d) IN (5, 6) AND random() < 0.4 THEN 0
      ELSE 1
    END as session_count
  FROM generate_series(current_date - 89, current_date, '1 day'::interval) d

  UNION ALL

  -- SOFIA (ACWR safe ~1.0): consistent, reduced in exam period
  SELECT 'ec4c81c1-5a28-429d-bb00-2eb01e6069a2'::uuid,
    d::date,
    CASE
      WHEN extract(dow from d) = 5 THEN 0
      WHEN d >= current_date - 20 THEN (30 + (random() * 15))::numeric(8,1)
      ELSE (40 + (random() * 20))::numeric(8,1)
    END,
    CASE
      WHEN d >= current_date - 20 AND extract(dow from d) BETWEEN 0 AND 4
        THEN (35 + (random() * 25))::numeric(8,1)
      WHEN extract(dow from d) BETWEEN 0 AND 4
        THEN (20 + (random() * 15))::numeric(8,1)
      ELSE (10 + (random() * 10))::numeric(8,1)
    END,
    CASE
      WHEN extract(dow from d) = 5 THEN 0
      WHEN d >= current_date - 20 THEN 1
      ELSE CASE WHEN random() < 0.3 THEN 2 ELSE 1 END
    END
  FROM generate_series(current_date - 89, current_date, '1 day'::interval) d

  UNION ALL

  -- JAMAL (ACWR low ~0.6): sparse, only 45 days
  SELECT '695a2ba5-0ef6-4e4f-9048-4f09a5c44c65'::uuid,
    d::date,
    CASE
      WHEN extract(dow from d) IN (1, 3, 5) AND random() < 0.7
        THEN (20 + (random() * 15))::numeric(8,1)
      WHEN extract(dow from d) = 6 AND random() < 0.3
        THEN (15 + (random() * 10))::numeric(8,1)
      ELSE 0
    END,
    CASE
      WHEN extract(dow from d) BETWEEN 0 AND 4
        THEN (10 + (random() * 10))::numeric(8,1)
      ELSE 0
    END,
    CASE
      WHEN extract(dow from d) IN (1, 3, 5) AND random() < 0.7 THEN 1
      ELSE 0
    END
  FROM generate_series(current_date - 44, current_date, '1 day'::interval) d

  UNION ALL

  -- LENA (ACWR amber ~1.35): tournament spike, then injury rest
  SELECT '2fb6d4bf-e45a-404a-98b1-5f8fb2db6ae3'::uuid,
    d::date,
    CASE
      WHEN d >= current_date - 2 THEN (10 + (random() * 5))::numeric(8,1)
      WHEN d >= current_date - 13 THEN (65 + (random() * 30))::numeric(8,1)
      WHEN extract(dow from d) = 5 THEN 0
      ELSE (50 + (random() * 20))::numeric(8,1)
    END,
    CASE
      WHEN extract(dow from d) BETWEEN 0 AND 4
        THEN (15 + (random() * 12))::numeric(8,1)
      ELSE (5 + (random() * 8))::numeric(8,1)
    END,
    CASE
      WHEN d >= current_date - 2 THEN 0
      WHEN d >= current_date - 13 THEN CASE WHEN random() < 0.5 THEN 2 ELSE 1 END
      WHEN extract(dow from d) = 5 THEN 0
      ELSE 1
    END
  FROM generate_series(current_date - 89, current_date, '1 day'::interval) d

  UNION ALL

  -- OMAR (ACWR moderate ~1.1): consistent GK training + heavy study
  SELECT '193f245e-0308-463f-bf11-3c6809c14690'::uuid,
    d::date,
    CASE
      WHEN extract(dow from d) IN (0, 2, 4) THEN (45 + (random() * 15))::numeric(8,1)
      WHEN extract(dow from d) = 1 THEN (35 + (random() * 15))::numeric(8,1)
      WHEN extract(dow from d) = 6 THEN (15 + (random() * 10))::numeric(8,1)
      ELSE 0
    END,
    CASE
      WHEN extract(dow from d) BETWEEN 0 AND 4
        THEN (25 + (random() * 20))::numeric(8,1)
      ELSE (15 + (random() * 10))::numeric(8,1)
    END,
    CASE
      WHEN extract(dow from d) IN (0, 1, 2, 4) THEN 1
      WHEN extract(dow from d) = 6 THEN 1
      ELSE 0
    END
  FROM generate_series(current_date - 89, current_date, '1 day'::interval) d
) seed_data
ON CONFLICT (athlete_id, load_date) DO UPDATE SET
  training_load_au = EXCLUDED.training_load_au,
  academic_load_au = EXCLUDED.academic_load_au,
  session_count = EXCLUDED.session_count;

-- ============================================================
-- 4. HEALTH_DATA — HRV, resting HR, sleep (90 days)
-- ============================================================

INSERT INTO health_data (user_id, date, metric_type, value, unit, source)
SELECT athlete_id, d::date, metric_type, value, unit, 'healthkit'
FROM (
  -- MARCUS: good vitals despite overtraining
  SELECT '5ca793a3-9c0b-49cc-8353-d637878b52cb'::uuid as athlete_id, d,
    'HRV' as metric_type, (55 + (random() * 25))::numeric as value, 'ms' as unit
  FROM generate_series(current_date - 89, current_date, '1 day'::interval) d
  UNION ALL
  SELECT '5ca793a3-9c0b-49cc-8353-d637878b52cb'::uuid, d, 'resting_hr',
    (62 + (random() * 10))::numeric, 'bpm'
  FROM generate_series(current_date - 89, current_date, '1 day'::interval) d
  UNION ALL
  SELECT '5ca793a3-9c0b-49cc-8353-d637878b52cb'::uuid, d, 'sleep',
    CASE WHEN extract(dow from d) IN (5,6) THEN (8 + (random() * 1.5))::numeric
         ELSE (7 + (random() * 1.5))::numeric END, 'hours'
  FROM generate_series(current_date - 89, current_date, '1 day'::interval) d

  UNION ALL

  -- SOFIA: consistent, sleep drops during exams
  SELECT 'ec4c81c1-5a28-429d-bb00-2eb01e6069a2'::uuid, d, 'HRV',
    (60 + (random() * 20))::numeric, 'ms'
  FROM generate_series(current_date - 89, current_date, '1 day'::interval) d
  UNION ALL
  SELECT 'ec4c81c1-5a28-429d-bb00-2eb01e6069a2'::uuid, d, 'resting_hr',
    (58 + (random() * 8))::numeric, 'bpm'
  FROM generate_series(current_date - 89, current_date, '1 day'::interval) d
  UNION ALL
  SELECT 'ec4c81c1-5a28-429d-bb00-2eb01e6069a2'::uuid, d, 'sleep',
    CASE WHEN d >= current_date - 20 THEN (5.5 + (random() * 2))::numeric
         ELSE (7.5 + (random() * 1))::numeric END, 'hours'
  FROM generate_series(current_date - 89, current_date, '1 day'::interval) d

  UNION ALL

  -- JAMAL: sparse data (~50% sync rate), young norms
  SELECT '695a2ba5-0ef6-4e4f-9048-4f09a5c44c65'::uuid, d, 'HRV',
    (70 + (random() * 30))::numeric, 'ms'
  FROM generate_series(current_date - 44, current_date, '1 day'::interval) d
  WHERE random() < 0.5
  UNION ALL
  SELECT '695a2ba5-0ef6-4e4f-9048-4f09a5c44c65'::uuid, d, 'resting_hr',
    (72 + (random() * 12))::numeric, 'bpm'
  FROM generate_series(current_date - 44, current_date, '1 day'::interval) d
  WHERE random() < 0.5
  UNION ALL
  SELECT '695a2ba5-0ef6-4e4f-9048-4f09a5c44c65'::uuid, d, 'sleep',
    (8.5 + (random() * 1.5))::numeric, 'hours'
  FROM generate_series(current_date - 44, current_date, '1 day'::interval) d
  WHERE random() < 0.5

  UNION ALL

  -- LENA: declining HRV, poor sleep (tournament fatigue + injury)
  SELECT '2fb6d4bf-e45a-404a-98b1-5f8fb2db6ae3'::uuid, d, 'HRV',
    CASE
      WHEN d >= current_date - 6 THEN (35 + (random() * 15))::numeric
      WHEN d >= current_date - 13 THEN (40 + (random() * 20))::numeric
      ELSE (55 + (random() * 25))::numeric
    END, 'ms'
  FROM generate_series(current_date - 89, current_date, '1 day'::interval) d
  UNION ALL
  SELECT '2fb6d4bf-e45a-404a-98b1-5f8fb2db6ae3'::uuid, d, 'resting_hr',
    CASE WHEN d >= current_date - 6 THEN (70 + (random() * 10))::numeric
         ELSE (60 + (random() * 8))::numeric END, 'bpm'
  FROM generate_series(current_date - 89, current_date, '1 day'::interval) d
  UNION ALL
  SELECT '2fb6d4bf-e45a-404a-98b1-5f8fb2db6ae3'::uuid, d, 'sleep',
    CASE
      WHEN d >= current_date - 6 THEN (5 + (random() * 2))::numeric
      WHEN d >= current_date - 13 THEN (6 + (random() * 1.5))::numeric
      ELSE (7 + (random() * 1.5))::numeric
    END, 'hours'
  FROM generate_series(current_date - 89, current_date, '1 day'::interval) d

  UNION ALL

  -- OMAR: solid, consistent vitals
  SELECT '193f245e-0308-463f-bf11-3c6809c14690'::uuid, d, 'HRV',
    (60 + (random() * 20))::numeric, 'ms'
  FROM generate_series(current_date - 89, current_date, '1 day'::interval) d
  UNION ALL
  SELECT '193f245e-0308-463f-bf11-3c6809c14690'::uuid, d, 'resting_hr',
    (60 + (random() * 8))::numeric, 'bpm'
  FROM generate_series(current_date - 89, current_date, '1 day'::interval) d
  UNION ALL
  SELECT '193f245e-0308-463f-bf11-3c6809c14690'::uuid, d, 'sleep',
    (7.5 + (random() * 1))::numeric, 'hours'
  FROM generate_series(current_date - 89, current_date, '1 day'::interval) d
) vitals
ON CONFLICT (user_id, date, metric_type) DO UPDATE SET value = EXCLUDED.value;

-- ============================================================
-- 5. ATHLETE_DAILY_VITALS — Unified resolved vitals
-- ============================================================

INSERT INTO athlete_daily_vitals (athlete_id, vitals_date, hrv_morning_ms, resting_hr_bpm,
  sleep_hours, sleep_quality, energy, soreness, mood, academic_stress, pain_flag,
  readiness_score, readiness_rag, intensity_cap, updated_at)
SELECT athlete_id, d::date, hrv, rhr, sleep_h, sleep_q, energy, soreness, mood,
  acad_stress, pain, readiness, rag, cap, now()
FROM (
  -- MARCUS: good readiness but overtraining
  SELECT '5ca793a3-9c0b-49cc-8353-d637878b52cb'::uuid as athlete_id, d,
    (55 + (random() * 25))::decimal(6,1) as hrv,
    (62 + (random() * 10))::int as rhr,
    CASE WHEN extract(dow from d) IN (5,6) THEN (8 + random() * 1.5)::decimal(4,1)
         ELSE (7 + random() * 1.5)::decimal(4,1) END as sleep_h,
    (6 + random() * 3)::decimal(3,1) as sleep_q,
    (3 + floor(random() * 2))::int as energy,
    CASE WHEN d >= current_date - 6 THEN (6 + floor(random() * 3))::int
         ELSE (3 + floor(random() * 3))::int END as soreness,
    (3 + floor(random() * 2))::int as mood,
    (2 + floor(random() * 2))::int as acad_stress,
    false as pain,
    CASE WHEN d >= current_date - 3 THEN (55 + floor(random() * 15))::int
         ELSE (65 + floor(random() * 20))::int END as readiness,
    CASE WHEN d >= current_date - 3 THEN 'AMBER' ELSE 'GREEN' END as rag,
    CASE WHEN d >= current_date - 3 THEN 'moderate' ELSE 'full' END as cap
  FROM generate_series(current_date - 89, current_date, '1 day'::interval) d

  UNION ALL

  -- SOFIA: good readiness, drops during exams
  SELECT 'ec4c81c1-5a28-429d-bb00-2eb01e6069a2'::uuid, d,
    (60 + random() * 20)::decimal(6,1),
    (58 + random() * 8)::int,
    CASE WHEN d >= current_date - 20 THEN (5.5 + random() * 2)::decimal(4,1)
         ELSE (7.5 + random() * 1)::decimal(4,1) END,
    CASE WHEN d >= current_date - 20 THEN (5 + random() * 2)::decimal(3,1)
         ELSE (7 + random() * 2)::decimal(3,1) END,
    CASE WHEN d >= current_date - 10 THEN (2 + floor(random() * 2))::int
         ELSE (3 + floor(random() * 2))::int END,
    (2 + floor(random() * 3))::int,
    CASE WHEN d >= current_date - 10 THEN (2 + floor(random() * 2))::int
         ELSE (3 + floor(random() * 2))::int END,
    CASE WHEN d >= current_date - 20 THEN (4 + floor(random() * 1))::int
         ELSE (2 + floor(random() * 2))::int END,
    false,
    CASE WHEN d >= current_date - 10 THEN (50 + floor(random() * 20))::int
         ELSE (70 + floor(random() * 20))::int END,
    CASE WHEN d >= current_date - 10 THEN 'AMBER' ELSE 'GREEN' END,
    CASE WHEN d >= current_date - 10 THEN 'moderate' ELSE 'full' END
  FROM generate_series(current_date - 89, current_date, '1 day'::interval) d

  UNION ALL

  -- JAMAL: sparse check-ins (~60%), generally fine
  SELECT '695a2ba5-0ef6-4e4f-9048-4f09a5c44c65'::uuid, d,
    (70 + random() * 30)::decimal(6,1),
    (72 + random() * 12)::int,
    (8.5 + random() * 1.5)::decimal(4,1),
    (7 + random() * 2)::decimal(3,1),
    (3 + floor(random() * 2))::int,
    (2 + floor(random() * 2))::int,
    (4 + floor(random() * 1))::int,
    (1 + floor(random() * 2))::int,
    false,
    (70 + floor(random() * 20))::int,
    'GREEN',
    'full'
  FROM generate_series(current_date - 44, current_date, '1 day'::interval) d
  WHERE random() < 0.6

  UNION ALL

  -- LENA: declining, 2 consecutive RED days
  SELECT '2fb6d4bf-e45a-404a-98b1-5f8fb2db6ae3'::uuid, d,
    CASE WHEN d >= current_date - 6 THEN (35 + random() * 15)::decimal(6,1)
         WHEN d >= current_date - 13 THEN (40 + random() * 20)::decimal(6,1)
         ELSE (55 + random() * 25)::decimal(6,1) END,
    CASE WHEN d >= current_date - 6 THEN (70 + random() * 10)::int
         ELSE (60 + random() * 8)::int END,
    CASE WHEN d >= current_date - 6 THEN (5 + random() * 2)::decimal(4,1)
         WHEN d >= current_date - 13 THEN (6 + random() * 1.5)::decimal(4,1)
         ELSE (7 + random() * 1.5)::decimal(4,1) END,
    CASE WHEN d >= current_date - 6 THEN (3 + random() * 2)::decimal(3,1)
         ELSE (6 + random() * 3)::decimal(3,1) END,
    CASE WHEN d >= current_date - 2 THEN 1
         WHEN d >= current_date - 6 THEN (2 + floor(random() * 1))::int
         ELSE (3 + floor(random() * 2))::int END,
    CASE WHEN d >= current_date - 2 THEN (8 + floor(random() * 2))::int
         WHEN d >= current_date - 6 THEN (6 + floor(random() * 2))::int
         ELSE (3 + floor(random() * 3))::int END,
    CASE WHEN d >= current_date - 2 THEN 2
         WHEN d >= current_date - 6 THEN (2 + floor(random() * 2))::int
         ELSE (3 + floor(random() * 2))::int END,
    (2 + floor(random() * 2))::int,
    CASE WHEN d >= current_date - 2 THEN true ELSE false END,
    CASE WHEN d = current_date THEN 28
         WHEN d = current_date - 1 THEN 32
         WHEN d >= current_date - 6 THEN (40 + floor(random() * 15))::int
         ELSE (60 + floor(random() * 25))::int END,
    CASE WHEN d >= current_date - 1 THEN 'RED'
         WHEN d >= current_date - 6 THEN 'AMBER'
         ELSE 'GREEN' END,
    CASE WHEN d >= current_date - 1 THEN 'rest'
         WHEN d >= current_date - 6 THEN 'light'
         ELSE 'full' END
  FROM generate_series(current_date - 89, current_date, '1 day'::interval) d

  UNION ALL

  -- OMAR: steady and consistent
  SELECT '193f245e-0308-463f-bf11-3c6809c14690'::uuid, d,
    (60 + random() * 20)::decimal(6,1),
    (60 + random() * 8)::int,
    (7.5 + random() * 1)::decimal(4,1),
    (7 + random() * 2)::decimal(3,1),
    (3 + floor(random() * 2))::int,
    (2 + floor(random() * 3))::int,
    (3 + floor(random() * 2))::int,
    CASE WHEN d >= current_date - 14 THEN (3 + floor(random() * 2))::int
         ELSE (2 + floor(random() * 1))::int END,
    false,
    (65 + floor(random() * 20))::int,
    CASE WHEN random() < 0.15 THEN 'AMBER' ELSE 'GREEN' END,
    CASE WHEN random() < 0.15 THEN 'moderate' ELSE 'full' END
  FROM generate_series(current_date - 89, current_date, '1 day'::interval) d
) vitals_data
ON CONFLICT (athlete_id, vitals_date) DO UPDATE SET
  hrv_morning_ms = EXCLUDED.hrv_morning_ms,
  resting_hr_bpm = EXCLUDED.resting_hr_bpm,
  sleep_hours = EXCLUDED.sleep_hours,
  readiness_score = EXCLUDED.readiness_score,
  readiness_rag = EXCLUDED.readiness_rag,
  intensity_cap = EXCLUDED.intensity_cap;

-- ============================================================
-- 6. CALENDAR_EVENTS — Training, matches, exams, study
-- ============================================================

INSERT INTO calendar_events (user_id, title, event_type, start_at, end_at, intensity, sport)
SELECT athlete_id, title, event_type,
  (d + start_time::time)::timestamptz,
  (d + end_time::time)::timestamptz,
  intensity, sport
FROM (
  -- MARCUS: Club MWF
  SELECT '5ca793a3-9c0b-49cc-8353-d637878b52cb'::uuid as athlete_id, d,
    'Club Training' as title, 'training' as event_type,
    '17:00' as start_time, '18:30' as end_time, 'HARD' as intensity, 'football' as sport
  FROM generate_series(current_date - 89, current_date, '1 day'::interval) d
  WHERE extract(dow from d) IN (0, 2, 4)
  UNION ALL
  -- Marcus: Gym TuTh
  SELECT '5ca793a3-9c0b-49cc-8353-d637878b52cb'::uuid, d, 'Gym Session', 'training',
    '16:00', '17:00',
    CASE WHEN d >= current_date - 6 THEN 'HARD' ELSE 'MODERATE' END, 'football'
  FROM generate_series(current_date - 89, current_date, '1 day'::interval) d
  WHERE extract(dow from d) IN (1, 3)
  UNION ALL
  -- Marcus: Saturday matches (biweekly)
  SELECT '5ca793a3-9c0b-49cc-8353-d637878b52cb'::uuid, d, 'League Match', 'match',
    '10:00', '11:30', 'HARD', 'football'
  FROM generate_series(current_date - 89, current_date, '14 day'::interval) d

  UNION ALL

  -- SOFIA: Padel MWF
  SELECT 'ec4c81c1-5a28-429d-bb00-2eb01e6069a2'::uuid, d, 'Club Training', 'training',
    '16:00', '17:30',
    CASE WHEN d >= current_date - 20 THEN 'MODERATE' ELSE 'HARD' END, 'football'
  FROM generate_series(current_date - 89, current_date, '1 day'::interval) d
  WHERE extract(dow from d) IN (0, 2, 4)
  UNION ALL
  -- Sofia: Fitness Tu/Th
  SELECT 'ec4c81c1-5a28-429d-bb00-2eb01e6069a2'::uuid, d, 'Gym Session', 'training',
    '15:00', '16:00', 'MODERATE', 'football'
  FROM generate_series(current_date - 89, current_date, '1 day'::interval) d
  WHERE extract(dow from d) IN (1, 4)
  UNION ALL
  -- Sofia: Exams (last 3 weeks, every 3 days)
  SELECT 'ec4c81c1-5a28-429d-bb00-2eb01e6069a2'::uuid, d,
    'Exam: ' || (ARRAY['Mathematics', 'Physics', 'Arabic', 'Biology'])[1 + floor(random()*4)::int],
    'exam', '09:00', '11:00', 'REST', 'football'
  FROM generate_series(current_date - 20, current_date + 7, '3 day'::interval) d
  WHERE extract(dow from d) BETWEEN 0 AND 4
  UNION ALL
  -- Sofia: Daily study
  SELECT 'ec4c81c1-5a28-429d-bb00-2eb01e6069a2'::uuid, d, 'Study Session', 'study',
    '18:00', '19:30', 'REST', 'football'
  FROM generate_series(current_date - 89, current_date, '1 day'::interval) d
  WHERE extract(dow from d) BETWEEN 0 AND 4

  UNION ALL

  -- JAMAL: Basketball 3x/week
  SELECT '695a2ba5-0ef6-4e4f-9048-4f09a5c44c65'::uuid, d, 'Club Training', 'training',
    '16:00', '17:00', 'MODERATE', 'football'
  FROM generate_series(current_date - 44, current_date, '1 day'::interval) d
  WHERE extract(dow from d) IN (1, 3, 5)
  UNION ALL
  -- Jamal: Movement class
  SELECT '695a2ba5-0ef6-4e4f-9048-4f09a5c44c65'::uuid, d, 'Skills Session', 'training',
    '15:00', '15:45', 'LIGHT', 'football'
  FROM generate_series(current_date - 44, current_date, '1 day'::interval) d
  WHERE extract(dow from d) = 2

  UNION ALL

  -- LENA: Tennis academy + tournament matches
  SELECT '2fb6d4bf-e45a-404a-98b1-5f8fb2db6ae3'::uuid, d, 'Club Training', 'training',
    '15:00', '17:00', 'HARD', 'football'
  FROM generate_series(current_date - 89, current_date - 3, '1 day'::interval) d
  WHERE extract(dow from d) IN (0, 1, 2, 4)
  UNION ALL
  -- Lena: S&C
  SELECT '2fb6d4bf-e45a-404a-98b1-5f8fb2db6ae3'::uuid, d, 'S&C Session', 'training',
    '14:00', '15:00', 'MODERATE', 'football'
  FROM generate_series(current_date - 89, current_date - 3, '1 day'::interval) d
  WHERE extract(dow from d) IN (1, 3)
  UNION ALL
  -- Lena: Tournament matches (last 2 weeks)
  SELECT '2fb6d4bf-e45a-404a-98b1-5f8fb2db6ae3'::uuid, d, 'League Match', 'match',
    '10:00', '12:00', 'HARD', 'football'
  FROM generate_series(current_date - 13, current_date - 3, '2 day'::interval) d
  UNION ALL
  -- Lena: Recovery (post injury)
  SELECT '2fb6d4bf-e45a-404a-98b1-5f8fb2db6ae3'::uuid, d, 'Recovery Session', 'recovery',
    '10:00', '11:00', 'LIGHT', 'football'
  FROM generate_series(current_date - 2, current_date, '1 day'::interval) d
  UNION ALL
  -- Lena: Upcoming match
  SELECT '2fb6d4bf-e45a-404a-98b1-5f8fb2db6ae3'::uuid, current_date + 3,
    'League Match', 'match', '14:00', '16:00', 'HARD', 'football'

  UNION ALL

  -- OMAR: GK training + study
  SELECT '193f245e-0308-463f-bf11-3c6809c14690'::uuid, d, 'GK Training', 'training',
    '17:00', '18:30', 'MODERATE', 'football'
  FROM generate_series(current_date - 89, current_date, '1 day'::interval) d
  WHERE extract(dow from d) IN (0, 2, 4)
  UNION ALL
  SELECT '193f245e-0308-463f-bf11-3c6809c14690'::uuid, d, 'Gym Session', 'training',
    '16:00', '17:00', 'MODERATE', 'football'
  FROM generate_series(current_date - 89, current_date, '1 day'::interval) d
  WHERE extract(dow from d) = 1
  UNION ALL
  -- Omar: Study sessions
  SELECT '193f245e-0308-463f-bf11-3c6809c14690'::uuid, d,
    'Study: ' || (ARRAY['Mathematics', 'Chemistry', 'English'])[1 + floor(random()*3)::int],
    'study', '18:30', '20:00', 'REST', 'football'
  FROM generate_series(current_date - 89, current_date, '1 day'::interval) d
  WHERE extract(dow from d) BETWEEN 0 AND 4
  UNION ALL
  -- Omar: Upcoming exams
  SELECT '193f245e-0308-463f-bf11-3c6809c14690'::uuid, current_date + 5,
    'Exam: Mathematics', 'exam', '09:00', '11:00', 'REST', 'football'
  UNION ALL
  SELECT '193f245e-0308-463f-bf11-3c6809c14690'::uuid, current_date + 8,
    'Exam: Chemistry', 'exam', '09:00', '11:00', 'REST', 'football'
) events_data;

-- ============================================================
-- 7. ATHLETE_SNAPSHOTS — Current state
-- ============================================================

INSERT INTO athlete_snapshots (
  athlete_id, snapshot_at, dob, sport, position, academic_year,
  phv_stage, phv_offset_years, height_cm, weight_kg,
  readiness_score, hrv_baseline_ms, hrv_today_ms, resting_hr_bpm,
  sleep_quality, injury_risk_flag, readiness_rag,
  acwr, atl_7day, ctl_28day, dual_load_index, academic_load_7day, athletic_load_7day,
  sessions_total, training_age_weeks, streak_days, cv_completeness,
  wellness_7day_avg, wellness_trend, triangle_rag,
  athlete_mode, mode_changed_at, study_training_balance_ratio,
  dual_load_zone, exam_proximity_score,
  training_monotony, training_strain, data_confidence_score,
  data_confidence_breakdown, season_phase, season_phase_week,
  readiness_delta, resting_hr_trend_7d,
  spo2_pct, recovery_score, sleep_hours, sleep_consistency_score, sleep_debt_3d,
  hrv_trend_7d_pct, load_trend_7d_pct, acwr_trend, sleep_trend_7d, body_feel_trend_7d,
  readiness_distribution_7d,
  matches_next_7d, exams_next_14d, in_exam_period, sessions_scheduled_next_7d, days_since_last_session,
  active_injury_count, injury_locations, days_since_injury,
  chat_sessions_7d, chat_messages_7d, checkin_consistency_7d,
  total_points_7d, longest_streak,
  days_since_coach_interaction, days_since_parent_interaction, triangle_engagement_score,
  study_hours_7d, academic_stress_latest, exam_count_active,
  wearable_connected, wearable_last_sync_at,
  pre_journal_completion_rate, post_journal_completion_rate, avg_post_body_feel_7d
)
VALUES
  -- MARCUS — mid-PHV, ACWR 1.58 (danger), trending AMBER
  ('5ca793a3-9c0b-49cc-8353-d637878b52cb', now(),
   '2012-03-15', 'football', 'midfielder', 9,
   'CIRCA', -0.5, 172.5, 58.0,
   58, 65.0, 60.0, 65, 7.2, 'RED', 'AMBER',
   1.58, 95.0, 60.0, 52, 180, 620,
   145, 52, 12, 35,
   6.8, 'DECLINING', 'AMBER',
   'balanced', now() - interval '30 days', 0.5, 'amber', 25,
   1.4, 3200, 72,
   '{"wearable": 0.9, "checkin": 0.7, "session": 0.8, "subjects": 0.3}'::jsonb,
   'in_season', 8, 5, 'STABLE',
   98, 75, 7.5, 78, 1.5,
   -8.0, 45.0, 'DECLINING', 'STABLE', 6.5,
   '{"green": 3, "amber": 3, "red": 1}'::jsonb,
   1, 0, false, 5, 0,
   0, '[]'::jsonb, null,
   3, 15, 0.86, 280, 18,
   2, 7, 55,
   8.0, 2, 0,
   true, now() - interval '2 hours',
   0.65, 0.45, 6.5),

  -- SOFIA — post-PHV, ACWR 1.02, exam period, high dual load
  ('ec4c81c1-5a28-429d-bb00-2eb01e6069a2', now(),
   '2010-07-22', 'football', 'winger', 11,
   'POST', 2.5, 165.0, 55.0,
   62, 70.0, 68.0, 60, 5.8, 'AMBER', 'AMBER',
   1.02, 42.0, 41.0, 72, 380, 290,
   310, 78, 22, 55,
   5.5, 'DECLINING', 'AMBER',
   'balanced', now() - interval '21 days', 0.5, 'amber', 82,
   1.1, 1800, 80,
   '{"wearable": 0.85, "checkin": 0.9, "session": 0.75, "subjects": 0.7}'::jsonb,
   'in_season', 12, -8, 'STABLE',

   97, 68, 6.2, 55, 5.5,
   -3.0, -15.0, 'STABLE', 'DECLINING', 5.8,
   '{"green": 2, "amber": 4, "red": 1}'::jsonb,
   0, 3, true, 4, 1,
   0, '[]'::jsonb, null,
   5, 22, 0.93, 450, 35,
   3, 5, 62,
   12.5, 4, 3,
   true, now() - interval '4 hours',
   0.80, 0.70, 5.8),

  -- JAMAL — pre-PHV, ACWR 0.62, sparse data, building base
  ('695a2ba5-0ef6-4e4f-9048-4f09a5c44c65', now(),
   '2014-01-08', 'football', 'striker', 7,
   'PRE', -2.5, 148.0, 40.0,
   78, 85.0, 82.0, 74, 8.0, 'GREEN', 'GREEN',
   0.62, 18.0, 29.0, 28, 85, 120,
   22, 6, 3, 15,
   7.8, 'STABLE', 'GREEN',
   'balanced', null, 0.5, 'green', 0,
   0.8, 450, 38,
   '{"wearable": 0.3, "checkin": 0.4, "session": 0.5, "subjects": 0.2}'::jsonb,
   'pre_season', 3, 3, 'STABLE',
   98, 82, 9.0, 85, 0.5,
   5.0, 8.0, 'STABLE', 'STABLE', 7.2,
   '{"green": 5, "amber": 1, "red": 0}'::jsonb,
   0, 0, false, 3, 2,
   0, '[]'::jsonb, null,
   1, 4, 0.43, 80, 7,
   5, 12, 35,
   4.0, 1, 0,
   false, null,
   0.30, 0.20, 7.2),

  -- LENA — post-PHV, ACWR 1.36, injury, 2 consecutive RED days
  ('2fb6d4bf-e45a-404a-98b1-5f8fb2db6ae3', now(),
   '2009-05-30', 'football', 'centre_back', 12,
   'POST', 3.0, 170.0, 62.0,
   28, 60.0, 38.0, 72, 3.5, 'RED', 'RED',
   1.36, 72.0, 53.0, 48, 155, 490,
   520, 104, 0, 62,
   3.8, 'DECLINING', 'RED',
   'league', now() - interval '14 days', 0.2, 'red', 10,
   1.8, 4500, 85,
   '{"wearable": 0.95, "checkin": 0.85, "session": 0.9, "subjects": 0.6}'::jsonb,
   'in_season', 6, -15, 'DECLINING',
   96, 55, 5.5, 42, 7.5,
   -22.0, 30.0, 'DECLINING', 'DECLINING', 4.2,
   '{"green": 0, "amber": 3, "red": 4}'::jsonb,
   1, 0, false, 2, 0,
   1, '["right_ankle"]'::jsonb, 3,
   4, 18, 0.71, 180, 42,
   1, 8, 48,
   5.0, 3, 0,
   true, now() - interval '1 hour',
   0.75, 0.60, 4.2),

  -- OMAR — circa-PHV, ACWR 1.12, study mode, exams approaching
  ('193f245e-0308-463f-bf11-3c6809c14690', now(),
   '2011-09-10', 'football', 'goalkeeper', 10,
   'CIRCA', 0.2, 175.0, 63.0,
   72, 68.0, 70.0, 62, 7.8, 'GREEN', 'GREEN',
   1.12, 48.0, 43.0, 65, 310, 330,
   220, 52, 15, 42,
   7.2, 'STABLE', 'GREEN',
   'study', now() - interval '7 days', 0.8, 'amber', 68,
   1.2, 2100, 78,
   '{"wearable": 0.8, "checkin": 0.85, "session": 0.75, "subjects": 0.7}'::jsonb,
   'in_season', 10, 2, 'STABLE',
   98, 72, 7.8, 82, 1.0,
   3.0, -5.0, 'STABLE', 'STABLE', 6.8,
   '{"green": 5, "amber": 2, "red": 0}'::jsonb,
   0, 2, true, 4, 0,
   0, '[]'::jsonb, null,
   5, 25, 0.86, 350, 28,
   2, 4, 70,
   10.5, 3, 2,
   true, now() - interval '3 hours',
   0.70, 0.55, 6.8)
ON CONFLICT (athlete_id) DO UPDATE SET
  snapshot_at = EXCLUDED.snapshot_at,
  phv_stage = EXCLUDED.phv_stage, phv_offset_years = EXCLUDED.phv_offset_years,
  readiness_score = EXCLUDED.readiness_score, readiness_rag = EXCLUDED.readiness_rag,
  acwr = EXCLUDED.acwr, atl_7day = EXCLUDED.atl_7day, ctl_28day = EXCLUDED.ctl_28day,
  dual_load_index = EXCLUDED.dual_load_index, athlete_mode = EXCLUDED.athlete_mode,
  injury_risk_flag = EXCLUDED.injury_risk_flag,
  active_injury_count = EXCLUDED.active_injury_count, injury_locations = EXCLUDED.injury_locations,
  training_monotony = EXCLUDED.training_monotony, training_strain = EXCLUDED.training_strain,
  data_confidence_score = EXCLUDED.data_confidence_score,
  sleep_hours = EXCLUDED.sleep_hours, sleep_debt_3d = EXCLUDED.sleep_debt_3d,
  exam_proximity_score = EXCLUDED.exam_proximity_score, in_exam_period = EXCLUDED.in_exam_period;

-- ============================================================
-- 8. ATHLETE_EVENTS — Mode changes, injury, check-ins
-- ============================================================

-- Mode changes
INSERT INTO athlete_events (athlete_id, event_type, occurred_at, source, payload, created_by)
VALUES
  ('193f245e-0308-463f-bf11-3c6809c14690', 'MODE_CHANGE', now() - interval '7 days', 'MANUAL',
   '{"previous_mode": "balanced", "new_mode": "study", "trigger": "manual"}'::jsonb,
   '193f245e-0308-463f-bf11-3c6809c14690'),
  ('2fb6d4bf-e45a-404a-98b1-5f8fb2db6ae3', 'MODE_CHANGE', now() - interval '14 days', 'MANUAL',
   '{"previous_mode": "balanced", "new_mode": "league", "trigger": "manual"}'::jsonb,
   '2fb6d4bf-e45a-404a-98b1-5f8fb2db6ae3');

-- Injury event for Lena
INSERT INTO athlete_events (athlete_id, event_type, occurred_at, source, payload, created_by)
VALUES
  ('2fb6d4bf-e45a-404a-98b1-5f8fb2db6ae3', 'INJURY_FLAGGED', now() - interval '3 days', 'MANUAL',
   '{"location": "right_ankle", "severity": "moderate", "mechanism": "lateral movement during match", "pain_level": 7}'::jsonb,
   '2fb6d4bf-e45a-404a-98b1-5f8fb2db6ae3');

-- Wellness check-ins (last 7 days)
INSERT INTO athlete_events (athlete_id, event_type, occurred_at, source, payload, created_by)
SELECT athlete_id, 'WELLNESS_CHECKIN', occurred_at, 'MANUAL', payload, athlete_id
FROM (
  -- Marcus
  SELECT '5ca793a3-9c0b-49cc-8353-d637878b52cb'::uuid as athlete_id,
    (current_date - i || ' 07:30:00')::timestamptz as occurred_at,
    jsonb_build_object(
      'energy', 3 + floor(random()*2), 'soreness', CASE WHEN i < 3 THEN 7 ELSE 4 END,
      'mood', 3 + floor(random()*2), 'sleep_quality', 7, 'academic_stress', 2
    ) as payload
  FROM generate_series(0, 6) i
  UNION ALL
  -- Sofia (high academic stress)
  SELECT 'ec4c81c1-5a28-429d-bb00-2eb01e6069a2'::uuid,
    (current_date - i || ' 06:45:00')::timestamptz,
    jsonb_build_object(
      'energy', CASE WHEN i < 4 THEN 2 ELSE 4 END, 'soreness', 3,
      'mood', CASE WHEN i < 4 THEN 2 ELSE 4 END,
      'sleep_quality', CASE WHEN i < 4 THEN 5 ELSE 8 END,
      'academic_stress', CASE WHEN i < 4 THEN 4 ELSE 2 END
    )
  FROM generate_series(0, 6) i
  UNION ALL
  -- Lena (declining, RED last 2)
  SELECT '2fb6d4bf-e45a-404a-98b1-5f8fb2db6ae3'::uuid,
    (current_date - i || ' 07:00:00')::timestamptz,
    jsonb_build_object(
      'energy', CASE WHEN i < 2 THEN 1 WHEN i < 5 THEN 2 ELSE 4 END,
      'soreness', CASE WHEN i < 2 THEN 9 WHEN i < 5 THEN 7 ELSE 4 END,
      'mood', CASE WHEN i < 2 THEN 2 ELSE 4 END,
      'sleep_quality', CASE WHEN i < 2 THEN 3 ELSE 7 END,
      'academic_stress', 2
    )
  FROM generate_series(0, 6) i
  UNION ALL
  -- Omar (consistent, slight exam stress)
  SELECT '193f245e-0308-463f-bf11-3c6809c14690'::uuid,
    (current_date - i || ' 06:30:00')::timestamptz,
    jsonb_build_object(
      'energy', 4, 'soreness', 3, 'mood', 4, 'sleep_quality', 8, 'academic_stress', 3
    )
  FROM generate_series(0, 6) i
) checkins;

-- ============================================================
-- 9. ATHLETE_NOTIFICATIONS
-- ============================================================

INSERT INTO athlete_notifications (athlete_id, type, category, priority, title, body, status, created_at)
VALUES
  ('5ca793a3-9c0b-49cc-8353-d637878b52cb', 'LOAD_WARNING', 'critical', 1,
   'ACWR Danger Zone',
   'Your training load has spiked significantly. ACWR is 1.58 — well above the 1.5 danger threshold. Reduce intensity immediately to avoid injury.',
   'unread', now() - interval '2 hours'),
  ('5ca793a3-9c0b-49cc-8353-d637878b52cb', 'RECOVERY_REC', 'training', 2,
   'Recovery Day Recommended',
   'Your body needs time to adapt to recent training increases. Consider a light recovery session today.',
   'unread', now() - interval '1 day'),

  ('ec4c81c1-5a28-429d-bb00-2eb01e6069a2', 'ACADEMIC_ALERT', 'academic', 2,
   'Exam Period Load Management',
   'Your dual load index is elevated at 72. Training has been adjusted to support your exam performance.',
   'read', now() - interval '3 days'),
  ('ec4c81c1-5a28-429d-bb00-2eb01e6069a2', 'SLEEP_ALERT', 'training', 2,
   'Sleep Debt Accumulating',
   'You have averaged only 6.2 hours of sleep over the last 3 nights. Aim for 8+ hours to support both training and study.',
   'unread', now() - interval '12 hours'),

  ('695a2ba5-0ef6-4e4f-9048-4f09a5c44c65', 'CHECKIN_REMINDER', 'coaching', 3,
   'Check-in Reminder',
   'You have missed 3 check-ins this week. Checking in helps us personalize your training.',
   'unread', now() - interval '6 hours'),

  ('2fb6d4bf-e45a-404a-98b1-5f8fb2db6ae3', 'INJURY_ALERT', 'critical', 1,
   'Active Injury — Modified Training',
   'Right ankle injury detected. High-intensity sessions are blocked until cleared. Focus on recovery and upper body work.',
   'unread', now() - interval '3 days'),
  ('2fb6d4bf-e45a-404a-98b1-5f8fb2db6ae3', 'READINESS_ALERT', 'critical', 1,
   'Consecutive RED Readiness',
   'This is your second consecutive RED readiness day. Complete rest is strongly recommended. Talk to your coach or physio.',
   'unread', now() - interval '8 hours'),
  ('2fb6d4bf-e45a-404a-98b1-5f8fb2db6ae3', 'RECOVERY_REC', 'training', 2,
   'Recovery Protocol Active',
   'Based on your current state, only recovery sessions should be scheduled. Your body needs time to heal.',
   'read', now() - interval '1 day'),

  ('193f245e-0308-463f-bf11-3c6809c14690', 'ACADEMIC_ALERT', 'academic', 3,
   'Exam in 5 Days',
   'Your Mathematics exam is coming up. Training intensity has been adjusted to support your preparation.',
   'unread', now() - interval '1 day'),
  ('193f245e-0308-463f-bf11-3c6809c14690', 'COGNITIVE_WINDOW', 'coaching', 3,
   'Optimal Study Timing',
   'After today GK training, wait at least 2 hours before studying complex subjects. Your brain needs recovery time.',
   'unread', now() - interval '4 hours');

-- ============================================================
-- 10. POINTS_LEDGER — Gamification
-- ============================================================
-- Schema: id (text, deterministic uid_YYYY-MM-DD), user_id, date, points, reasons (jsonb[]), readiness, intensity, compliant

INSERT INTO points_ledger (id, user_id, date, points, reasons, readiness, intensity, compliant)
SELECT
  uid || '_' || to_char(d, 'YYYY-MM-DD'),
  uid::uuid,
  d,
  pts,
  reasons,
  readiness,
  intensity,
  true
FROM (
  -- Marcus: daily points for 60 days
  SELECT '5ca793a3-9c0b-49cc-8353-d637878b52cb' as uid, d::date as d,
    CASE WHEN extract(dow from d) IN (5,6) THEN 5 ELSE 15 END as pts,
    CASE WHEN extract(dow from d) IN (5,6)
      THEN '["checkin_complete"]'::jsonb
      ELSE '["session_complete","checkin_complete"]'::jsonb END as reasons,
    CASE WHEN d >= current_date - 3 THEN 'AMBER' ELSE 'GREEN' END as readiness,
    CASE WHEN d >= current_date - 6 THEN 'HARD' ELSE 'MODERATE' END as intensity
  FROM generate_series(current_date - 59, current_date, '1 day'::interval) d

  UNION ALL

  -- Sofia: daily points for 80 days (high engagement)
  SELECT 'ec4c81c1-5a28-429d-bb00-2eb01e6069a2', d::date,
    CASE WHEN extract(dow from d) = 5 THEN 5
         WHEN random() < 0.4 THEN 25  -- journal days
         ELSE 15 END,
    CASE WHEN extract(dow from d) = 5 THEN '["checkin_complete"]'::jsonb
         WHEN random() < 0.4 THEN '["session_complete","checkin_complete","journal_complete"]'::jsonb
         ELSE '["session_complete","checkin_complete"]'::jsonb END,
    CASE WHEN d >= current_date - 10 THEN 'AMBER' ELSE 'GREEN' END,
    CASE WHEN d >= current_date - 20 THEN 'MODERATE' ELSE 'HARD' END
  FROM generate_series(current_date - 79, current_date, '1 day'::interval) d

  UNION ALL

  -- Jamal: sparse, 30 days
  SELECT '695a2ba5-0ef6-4e4f-9048-4f09a5c44c65', d::date,
    CASE WHEN extract(dow from d) IN (1,3,5) THEN 15 ELSE 5 END,
    CASE WHEN extract(dow from d) IN (1,3,5) THEN '["session_complete","checkin_complete"]'::jsonb
         ELSE '["checkin_complete"]'::jsonb END,
    'GREEN', 'MODERATE'
  FROM generate_series(current_date - 29, current_date, '1 day'::interval) d
  WHERE random() < 0.6  -- misses some days

  UNION ALL

  -- Lena: 80 days, streak broken recently
  SELECT '2fb6d4bf-e45a-404a-98b1-5f8fb2db6ae3', d::date,
    CASE WHEN d >= current_date - 2 THEN 5  -- injury rest
         WHEN extract(dow from d) = 5 THEN 5
         ELSE 15 END,
    CASE WHEN d >= current_date - 2 THEN '["checkin_complete"]'::jsonb
         WHEN extract(dow from d) = 5 THEN '["checkin_complete"]'::jsonb
         ELSE '["session_complete","checkin_complete"]'::jsonb END,
    CASE WHEN d >= current_date - 1 THEN 'RED'
         WHEN d >= current_date - 6 THEN 'AMBER'
         ELSE 'GREEN' END,
    CASE WHEN d >= current_date - 2 THEN 'LIGHT'
         WHEN d >= current_date - 13 THEN 'HARD'
         ELSE 'MODERATE' END
  FROM generate_series(current_date - 79, current_date, '1 day'::interval) d

  UNION ALL

  -- Omar: consistent, 70 days
  SELECT '193f245e-0308-463f-bf11-3c6809c14690', d::date,
    CASE WHEN extract(dow from d) IN (3,5) THEN 5  -- rest days
         ELSE 15 END,
    CASE WHEN extract(dow from d) IN (3,5) THEN '["checkin_complete"]'::jsonb
         ELSE '["session_complete","checkin_complete"]'::jsonb END,
    CASE WHEN random() < 0.15 THEN 'AMBER' ELSE 'GREEN' END,
    'MODERATE'
  FROM generate_series(current_date - 69, current_date, '1 day'::interval) d
) points_data
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- VERIFICATION — Run after seeding
-- ============================================================

SELECT
  u.name,
  u.sport,
  u.age,
  s.phv_stage,
  s.acwr,
  s.readiness_rag,
  s.athlete_mode,
  s.injury_risk_flag,
  s.active_injury_count,
  s.dual_load_index,
  s.exam_proximity_score,
  s.data_confidence_score,
  (SELECT count(*) FROM athlete_daily_load adl WHERE adl.athlete_id = u.id) as load_days,
  (SELECT count(*) FROM calendar_events ce WHERE ce.user_id = u.id) as events,
  (SELECT count(*) FROM health_data hd WHERE hd.user_id = u.id) as vitals
FROM users u
JOIN athlete_snapshots s ON s.athlete_id = u.id
WHERE u.email LIKE 'test%@tomo.com'
ORDER BY u.name;

-- ============================================================
-- CLEANUP (uncomment and run to remove all test data)
-- ============================================================
-- DELETE FROM training_journals WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'test%@tomo.com');
-- DELETE FROM points_ledger WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'test%@tomo.com');
-- DELETE FROM athlete_notifications WHERE athlete_id IN (SELECT id FROM users WHERE email LIKE 'test%@tomo.com');
-- DELETE FROM athlete_events WHERE athlete_id IN (SELECT id FROM users WHERE email LIKE 'test%@tomo.com');
-- DELETE FROM calendar_events WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'test%@tomo.com');
-- DELETE FROM athlete_daily_vitals WHERE athlete_id IN (SELECT id FROM users WHERE email LIKE 'test%@tomo.com');
-- DELETE FROM health_data WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'test%@tomo.com');
-- DELETE FROM athlete_daily_load WHERE athlete_id IN (SELECT id FROM users WHERE email LIKE 'test%@tomo.com');
-- DELETE FROM athlete_snapshots WHERE athlete_id IN (SELECT id FROM users WHERE email LIKE 'test%@tomo.com');
-- DELETE FROM player_schedule_preferences WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'test%@tomo.com');
-- DELETE FROM users WHERE email LIKE 'test%@tomo.com';
