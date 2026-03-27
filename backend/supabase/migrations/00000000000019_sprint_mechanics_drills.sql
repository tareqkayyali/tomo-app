-- ============================================================
-- Add sprint mechanics & development drills
-- These target the actual sprint technique gaps, not generic
-- football drills. Covers acceleration, max velocity, and
-- reactive sprint mechanics for all positions.
-- ============================================================

-- Wall Drives (acceleration mechanics)
INSERT INTO training_drills (id, sport_id, name, slug, description, instructions, duration_minutes, intensity, attribute_keys, age_bands, position_keys, category, players_min, players_max, sort_order)
VALUES
  ('d0000001-0001-4000-a000-000000000050', 'football', 'Wall Drives', 'wall-drives',
   'Teaches 45° drive angle and triple extension — the foundation of acceleration mechanics.',
   '["Face wall at arm''s length, hands flat on wall at chest height", "Drive one knee up to hip height while maintaining 45° body lean", "Hold top position for 2s — check: ankle-knee-hip-shoulder alignment", "Alternate legs: 8 reps each side", "Progress to rapid alternating drives (marching tempo)", "3 sets with 60s rest between sets"]'::jsonb,
   8, 'moderate', '["pace"]'::jsonb, '["U14","U17","U20+"]'::jsonb, '[]'::jsonb, 'training', 1, 20, 5)
ON CONFLICT (id) DO NOTHING;

-- A-Skip / A-Run Progressions
INSERT INTO training_drills (id, sport_id, name, slug, description, instructions, duration_minutes, intensity, attribute_keys, age_bands, position_keys, category, players_min, players_max, sort_order)
VALUES
  ('d0000001-0001-4000-a000-000000000051', 'football', 'A-Skip & A-Run Progressions', 'a-skip-a-run',
   'Develops knee drive, ground contact mechanics, and hip flexor power for sprint acceleration.',
   '["A-Skip: March with high knees, pulling foot down actively (20m × 4)", "A-Run: Same pattern at running tempo — focus on fast ground contact (20m × 4)", "Cue: ''Strike the ground, don''t push off''", "Cue: ''Knee drives UP, foot pulls DOWN''", "Walk back recovery between reps", "Progress: add mini-band above knees for resistance"]'::jsonb,
   10, 'moderate', '["pace"]'::jsonb, '["U14","U17","U20+"]'::jsonb, '[]'::jsonb, 'training', 1, 20, 6)
ON CONFLICT (id) DO NOTHING;

-- Falling Starts to 10m Sprints
INSERT INTO training_drills (id, sport_id, name, slug, description, instructions, duration_minutes, intensity, attribute_keys, age_bands, position_keys, category, players_min, players_max, sort_order)
VALUES
  ('d0000001-0001-4000-a000-000000000052', 'football', 'Falling Starts → 10m Sprints', 'falling-starts-10m',
   'Teaches forward lean initiation and explosive first 3 steps — directly targets 10m sprint gap.',
   '["Stand tall, feet together at start line", "Lean forward from ankles until you must step to catch yourself", "Explode into 3 powerful drive steps → sprint 10m", "Focus: low body angle for first 3 steps, gradually rise", "6 reps with full recovery (walk back + 60s rest)", "Time each rep if possible — track improvement"]'::jsonb,
   10, 'hard', '["pace"]'::jsonb, '["U14","U17","U20+"]'::jsonb, '[]'::jsonb, 'training', 1, 10, 7)
ON CONFLICT (id) DO NOTHING;

-- Wicket Runs (max velocity mechanics)
INSERT INTO training_drills (id, sport_id, name, slug, description, instructions, duration_minutes, intensity, attribute_keys, age_bands, position_keys, category, players_min, players_max, sort_order)
VALUES
  ('d0000001-0001-4000-a000-000000000053', 'football', 'Wicket Runs', 'wicket-runs',
   'Calibrates stride length and frequency at max velocity. Uses mini-hurdles to enforce correct ground contact pattern.',
   '["Set 6 mini-hurdles at ~1.5m spacing (adjust to athlete stride)", "20m run-up to reach near-max speed before hurdles", "Sprint through hurdles — one step between each", "Cue: ''Quick feet, tall hips, drive knees OVER wickets''", "4 reps with full recovery (walk back + 90s rest)", "Adjust spacing if athlete is over-striding or chopping"]'::jsonb,
   10, 'hard', '["pace"]'::jsonb, '["U14","U17","U20+"]'::jsonb, '[]'::jsonb, 'training', 1, 10, 8)
ON CONFLICT (id) DO NOTHING;

-- Resisted Sled Sprints
INSERT INTO training_drills (id, sport_id, name, slug, description, instructions, duration_minutes, intensity, attribute_keys, age_bands, position_keys, category, players_min, players_max, sort_order)
VALUES
  ('d0000001-0001-4000-a000-000000000054', 'football', 'Resisted Sled Sprints', 'resisted-sled-sprints',
   'Builds horizontal force production for acceleration. Load at 20-30% bodyweight for acceleration focus.',
   '["Load sled at 20-30% bodyweight (acceleration) or 40-50% (power)", "Sprint 15-20m with full effort", "Cue: ''Drive forward, push the ground BACK behind you''", "Cue: ''Maintain 45° forward lean throughout''", "4 reps per set, 2-3 sets", "Full recovery: 2-3 min between reps", "If no sled: partner-resisted sprints with band around waist"]'::jsonb,
   12, 'hard', '["pace","physicality"]'::jsonb, '["U17","U20+"]'::jsonb, '[]'::jsonb, 'training', 1, 6, 9)
ON CONFLICT (id) DO NOTHING;

-- 10m/20m Timed Sprint Testing
INSERT INTO training_drills (id, sport_id, name, slug, description, instructions, duration_minutes, intensity, attribute_keys, age_bands, position_keys, category, players_min, players_max, sort_order)
VALUES
  ('d0000001-0001-4000-a000-000000000055', 'football', 'Timed Sprint Testing (10m/20m)', 'timed-sprint-testing',
   'Apply sprint mechanics under measurement. Test 10m and 20m with video analysis to identify technique breakdowns.',
   '["Full dynamic warmup before testing", "3-point start position (one hand down)", "10m sprint × 3 reps (best of 3)", "20m sprint × 3 reps (best of 3)", "Full recovery between reps (2-3 min)", "Video from side angle if possible — review body angle, arm action, foot strike", "Log best times in Tomo app"]'::jsonb,
   12, 'hard', '["pace"]'::jsonb, '["U14","U17","U20+"]'::jsonb, '[]'::jsonb, 'training', 1, 10, 9)
ON CONFLICT (id) DO NOTHING;

-- Sprint Mechanics Warm-Up (activation specific to sprint sessions)
INSERT INTO training_drills (id, sport_id, name, slug, description, instructions, duration_minutes, intensity, attribute_keys, age_bands, position_keys, category, players_min, players_max, sort_order)
VALUES
  ('d0000001-0001-4000-a000-000000000056', 'football', 'Sprint Mechanics Warm-Up', 'sprint-mechanics-warmup',
   'CNS activation warm-up specifically designed for sprint development sessions. Primes the nervous system for max-effort sprinting.',
   '["Walking high knees (20m)", "Straight-leg bounds (20m)", "Ankling drill (20m)", "Build-up sprints: 50% → 70% → 85% over 30m (×3)", "Standing arm action drill: 10s max effort arm swing", "React and go: partner clap → 5m burst (×4)"]'::jsonb,
   8, 'moderate', '["pace"]'::jsonb, '["U14","U17","U20+"]'::jsonb, '[]'::jsonb, 'activation', 1, 20, 3)
ON CONFLICT (id) DO NOTHING;

-- Plyometric Bounds (power for sprint)
INSERT INTO training_drills (id, sport_id, name, slug, description, instructions, duration_minutes, intensity, attribute_keys, age_bands, position_keys, category, players_min, players_max, sort_order)
VALUES
  ('d0000001-0001-4000-a000-000000000057', 'football', 'Plyometric Bounds for Sprint Power', 'plyo-bounds-sprint',
   'Develops explosive push-off power and horizontal force application. Directly transfers to first 3-5 steps of sprint.',
   '["Alternate leg bounds over 20m — focus on distance per bound", "Single-leg hops: 5 hops per leg × 3 sets", "Depth jumps from 30cm box → 10m sprint", "Cue: ''Explode forward, not upward''", "Full recovery between sets (2 min)", "Total ground contacts: 40-60 per session (beginner)"]'::jsonb,
   12, 'hard', '["pace","physicality"]'::jsonb, '["U17","U20+"]'::jsonb, '[]'::jsonb, 'training', 1, 10, 9)
ON CONFLICT (id) DO NOTHING;

-- Add tags for the new drills
INSERT INTO drill_tags (drill_id, tag) VALUES
  ('d0000001-0001-4000-a000-000000000050', 'sprint-mechanics'),
  ('d0000001-0001-4000-a000-000000000050', 'acceleration'),
  ('d0000001-0001-4000-a000-000000000050', 'technique'),
  ('d0000001-0001-4000-a000-000000000051', 'sprint-mechanics'),
  ('d0000001-0001-4000-a000-000000000051', 'knee-drive'),
  ('d0000001-0001-4000-a000-000000000051', 'ground-contact'),
  ('d0000001-0001-4000-a000-000000000052', 'acceleration'),
  ('d0000001-0001-4000-a000-000000000052', 'first-step'),
  ('d0000001-0001-4000-a000-000000000052', '10m-sprint'),
  ('d0000001-0001-4000-a000-000000000053', 'max-velocity'),
  ('d0000001-0001-4000-a000-000000000053', 'stride-mechanics'),
  ('d0000001-0001-4000-a000-000000000054', 'acceleration'),
  ('d0000001-0001-4000-a000-000000000054', 'resisted-sprint'),
  ('d0000001-0001-4000-a000-000000000054', 'horizontal-force'),
  ('d0000001-0001-4000-a000-000000000055', 'testing'),
  ('d0000001-0001-4000-a000-000000000055', 'sprint-testing'),
  ('d0000001-0001-4000-a000-000000000055', 'video-analysis'),
  ('d0000001-0001-4000-a000-000000000056', 'cns-activation'),
  ('d0000001-0001-4000-a000-000000000056', 'sprint-warmup'),
  ('d0000001-0001-4000-a000-000000000057', 'plyometrics'),
  ('d0000001-0001-4000-a000-000000000057', 'power'),
  ('d0000001-0001-4000-a000-000000000057', 'acceleration')
ON CONFLICT DO NOTHING;

-- Add equipment for drills that need it
INSERT INTO drill_equipment (drill_id, name, quantity, optional) VALUES
  ('d0000001-0001-4000-a000-000000000053', 'Mini-hurdles/wickets', 6, false),
  ('d0000001-0001-4000-a000-000000000054', 'Speed sled', 1, false),
  ('d0000001-0001-4000-a000-000000000054', 'Resistance band (backup)', 1, true),
  ('d0000001-0001-4000-a000-000000000055', 'Stopwatch/timing gates', 1, false),
  ('d0000001-0001-4000-a000-000000000055', 'Phone for video', 1, true),
  ('d0000001-0001-4000-a000-000000000057', 'Plyo box (30cm)', 1, false)
ON CONFLICT DO NOTHING;

-- Add progressions for key drills
INSERT INTO drill_progressions (drill_id, level, label, description, duration_minutes, sort_order) VALUES
  ('d0000001-0001-4000-a000-000000000050', 1, 'Beginner', 'Slow tempo, 2s hold at top, 6 reps per side', 6, 1),
  ('d0000001-0001-4000-a000-000000000050', 2, 'Intermediate', 'Marching tempo, 1s hold, 10 reps per side', 8, 2),
  ('d0000001-0001-4000-a000-000000000050', 3, 'Advanced', 'Rapid alternating drives, 15s continuous, mini-band', 8, 3),
  ('d0000001-0001-4000-a000-000000000052', 1, 'Beginner', 'Lean start to 5m only, focus on body angle', 8, 1),
  ('d0000001-0001-4000-a000-000000000052', 2, 'Intermediate', 'Full 10m with timing, 6 reps', 10, 2),
  ('d0000001-0001-4000-a000-000000000052', 3, 'Advanced', '3-point start, 10m + 20m combined, video review', 12, 3),
  ('d0000001-0001-4000-a000-000000000054', 1, 'Beginner', '15% bodyweight, 10m distance, 3 reps', 10, 1),
  ('d0000001-0001-4000-a000-000000000054', 2, 'Intermediate', '25% bodyweight, 15m distance, 4 reps', 12, 2),
  ('d0000001-0001-4000-a000-000000000054', 3, 'Advanced', '35% bodyweight, 20m distance, 5 reps', 15, 3)
ON CONFLICT DO NOTHING;
