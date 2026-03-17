-- ============================================================
-- Migration 009: Training Drills Catalog + Benchmark Snapshots
-- Creates tables for drill content used by the AI Command Center.
-- ============================================================

-- ── training_drills ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_drills (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_id      text NOT NULL,            -- 'football', 'padel', etc.
  name          text NOT NULL,
  slug          text NOT NULL,
  description   text NOT NULL DEFAULT '',
  instructions  jsonb NOT NULL DEFAULT '[]'::jsonb,   -- string[]
  duration_minutes int NOT NULL DEFAULT 15,
  intensity     text NOT NULL CHECK (intensity IN ('light', 'moderate', 'hard')),
  attribute_keys jsonb NOT NULL DEFAULT '[]'::jsonb,   -- e.g. ["pace","dribbling"]
  age_bands     jsonb NOT NULL DEFAULT '[]'::jsonb,    -- e.g. ["U14","U17","U20+"]
  position_keys jsonb NOT NULL DEFAULT '[]'::jsonb,    -- e.g. ["ST","CAM"]
  category      text NOT NULL CHECK (category IN ('warmup', 'training', 'cooldown', 'recovery', 'activation')),
  players_min   int NOT NULL DEFAULT 1,
  players_max   int NOT NULL DEFAULT 1,
  video_url     text,
  image_url     text,
  sort_order    int NOT NULL DEFAULT 100,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drills_sport ON training_drills(sport_id);
CREATE INDEX IF NOT EXISTS idx_drills_category ON training_drills(category);
CREATE INDEX IF NOT EXISTS idx_drills_intensity ON training_drills(intensity);
CREATE UNIQUE INDEX IF NOT EXISTS idx_drills_slug ON training_drills(sport_id, slug);

-- ── drill_equipment ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drill_equipment (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drill_id  uuid NOT NULL REFERENCES training_drills(id) ON DELETE CASCADE,
  name      text NOT NULL,
  quantity  int NOT NULL DEFAULT 1,
  optional  boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_drill_equip ON drill_equipment(drill_id);

-- ── drill_progressions ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS drill_progressions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drill_id        uuid NOT NULL REFERENCES training_drills(id) ON DELETE CASCADE,
  level           int NOT NULL DEFAULT 1,
  label           text NOT NULL,
  description     text NOT NULL DEFAULT '',
  duration_minutes int,
  sort_order      int NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_drill_prog ON drill_progressions(drill_id);

-- ── drill_tags ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drill_tags (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drill_id  uuid NOT NULL REFERENCES training_drills(id) ON DELETE CASCADE,
  tag       text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_drill_tags ON drill_tags(drill_id);
CREATE INDEX IF NOT EXISTS idx_drill_tags_tag ON drill_tags(tag);

-- ── user_drill_history ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_drill_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  drill_id     uuid NOT NULL REFERENCES training_drills(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  rating       int CHECK (rating BETWEEN 1 AND 5),
  notes        text
);

CREATE INDEX IF NOT EXISTS idx_drill_history_user ON user_drill_history(user_id, completed_at DESC);

-- ── RLS (public read, no write from client) ─────────────────
ALTER TABLE training_drills ENABLE ROW LEVEL SECURITY;
ALTER TABLE drill_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE drill_progressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE drill_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_drill_history ENABLE ROW LEVEL SECURITY;

-- Public read for drill catalog (use IF NOT EXISTS pattern via DO block)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'training_drills' AND policyname = 'Public read drills') THEN
    CREATE POLICY "Public read drills" ON training_drills FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'drill_equipment' AND policyname = 'Public read equipment') THEN
    CREATE POLICY "Public read equipment" ON drill_equipment FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'drill_progressions' AND policyname = 'Public read progressions') THEN
    CREATE POLICY "Public read progressions" ON drill_progressions FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'drill_tags' AND policyname = 'Public read tags') THEN
    CREATE POLICY "Public read tags" ON drill_tags FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_drill_history' AND policyname = 'Users read own drill history') THEN
    CREATE POLICY "Users read own drill history" ON user_drill_history FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_drill_history' AND policyname = 'Users insert own drill history') THEN
    CREATE POLICY "Users insert own drill history" ON user_drill_history FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ── player_benchmark_snapshots ──────────────────────────────
CREATE TABLE IF NOT EXISTS player_benchmark_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metric_key      text NOT NULL,
  metric_label    text NOT NULL,
  value           numeric NOT NULL,
  percentile      numeric NOT NULL,
  zone            text NOT NULL CHECK (zone IN ('elite', 'good', 'average', 'developing', 'below')),
  age_band_used   text,
  position_used   text,
  competition_lvl text,
  tested_at       date NOT NULL DEFAULT CURRENT_DATE,
  source          text NOT NULL DEFAULT 'manual',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_benchmark_user ON player_benchmark_snapshots(user_id, tested_at DESC);
CREATE INDEX IF NOT EXISTS idx_benchmark_metric ON player_benchmark_snapshots(user_id, metric_key);

ALTER TABLE player_benchmark_snapshots ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'player_benchmark_snapshots' AND policyname = 'Users read own benchmarks') THEN
    CREATE POLICY "Users read own benchmarks" ON player_benchmark_snapshots FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'player_benchmark_snapshots' AND policyname = 'Users insert own benchmarks') THEN
    CREATE POLICY "Users insert own benchmarks" ON player_benchmark_snapshots FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
