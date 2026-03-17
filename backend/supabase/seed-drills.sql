-- ============================================================
-- Seed: Football Training Drills (30 drills)
-- Covers warmup, training, cooldown, recovery, activation
-- across all 6 football attributes (PAC, SHO, PAS, DRI, DEF, PHY)
-- ============================================================

-- ── WARMUP DRILLS (4) ───────────────────────────────────────

INSERT INTO training_drills (id, sport_id, name, slug, description, instructions, duration_minutes, intensity, attribute_keys, age_bands, position_keys, category, players_min, players_max, sort_order)
VALUES
  ('d0000001-0001-4000-a000-000000000001', 'football', 'Dynamic Stretching Circuit', 'dynamic-stretching-circuit',
   'Full-body dynamic stretch routine to prepare muscles and joints for training.',
   '["Arm circles (10 each direction)", "Leg swings forward/back (10 each)", "Hip circles (10 each)", "Walking lunges with twist (10m)", "High knees (20m)", "Butt kicks (20m)", "Lateral shuffles (20m each direction)"]'::jsonb,
   10, 'light', '["physicality"]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'warmup', 1, 30, 1),

  ('d0000001-0001-4000-a000-000000000002', 'football', 'Rondo Warmup 4v1', 'rondo-warmup-4v1',
   'Classic rondo possession warmup. 4 players keep the ball from 1 defender in a 5m×5m grid.',
   '["Set up 5m×5m grid with cones", "4 outside players, 1 defender in middle", "2-touch maximum for outside players", "Defender presses for 60 seconds then rotates", "Repeat 4 rounds"]'::jsonb,
   8, 'light', '["passing","dribbling"]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'warmup', 5, 5, 2),

  ('d0000001-0001-4000-a000-000000000003', 'football', 'Activation Sprints', 'activation-sprints',
   'Short burst activation sprints to fire up the nervous system before training.',
   '["Mark 20m with cones", "Jog to midpoint, sprint to end (×4)", "Walk back recovery between reps", "Rest 30s between sets", "2 sets total"]'::jsonb,
   6, 'light', '["pace"]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'activation', 1, 20, 3),

  ('d0000001-0001-4000-a000-000000000004', 'football', 'Ball Mastery Warmup', 'ball-mastery-warmup',
   'Technical ball mastery exercises to activate touch and close control.',
   '["Toe taps on ball (30s)", "Inside-outside rolls (30s each foot)", "Sole rolls forward/back (30s)", "V-pulls (30s each foot)", "Cruyff turns (10 each foot)", "La Croqueta (20 total)"]'::jsonb,
   8, 'light', '["dribbling"]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'warmup', 1, 30, 4),

-- ── TRAINING DRILLS — PACE (3) ──────────────────────────────

  ('d0000002-0001-4000-a000-000000000001', 'football', '30m Sprint Intervals', '30m-sprint-intervals',
   'Maximal effort sprint intervals to build acceleration and top speed.',
   '["Mark 30m with cones", "Sprint at 100% effort from standing start", "Walk back recovery (60-90s)", "6 reps per set, 2 sets", "Full rest between sets (3 min)"]'::jsonb,
   15, 'hard', '["pace"]'::jsonb, '["U14","U17","U20+"]'::jsonb, '[]'::jsonb, 'training', 1, 10, 10),

  ('d0000002-0001-4000-a000-000000000002', 'football', 'Acceleration Ladder', 'acceleration-ladder',
   'Progressive acceleration drill using 5m/10m/20m/30m distances to build explosive starts.',
   '["Set cones at 5m, 10m, 20m, 30m", "Sprint to 5m, walk back", "Sprint to 10m, walk back", "Sprint to 20m, walk back", "Sprint to 30m, walk back", "4 full sets, 2 min rest between sets"]'::jsonb,
   12, 'hard', '["pace"]'::jsonb, '["U14","U17","U20+"]'::jsonb, '["ST","WM"]'::jsonb, 'training', 1, 10, 11),

  ('d0000002-0001-4000-a000-000000000003', 'football', 'Repeated Sprint Ability', 'repeated-sprint-ability',
   'Game-realistic repeated sprints with short recovery to build sprint endurance.',
   '["Mark 20m course", "Sprint 20m, jog back (30s total cycle)", "Repeat 6 times = 1 set", "Rest 3 minutes between sets", "3 sets total", "Record each sprint time if possible"]'::jsonb,
   15, 'hard', '["pace","physicality"]'::jsonb, '["U17","U20+"]'::jsonb, '[]'::jsonb, 'training', 1, 10, 12),

-- ── TRAINING DRILLS — SHOOTING (3) ──────────────────────────

  ('d0000003-0001-4000-a000-000000000001', 'football', 'Finishing Under Pressure', 'finishing-under-pressure',
   'Quick feet in the box with first-time finishes. Develop composure and shot accuracy.',
   '["Set up at edge of box", "Coach plays ball in — 1 touch to control, 1 to shoot", "Vary angles: left, right, central", "10 shots per round, 3 rounds", "Focus on placement over power"]'::jsonb,
   15, 'moderate', '["shooting"]'::jsonb, '["U14","U17","U20+"]'::jsonb, '["ST","CAM","WM"]'::jsonb, 'training', 1, 4, 20),

  ('d0000003-0001-4000-a000-000000000002', 'football', 'Power Shot Technique', 'power-shot-technique',
   'Drive through the ball for maximum power. Focus on technique, body position, and follow-through.',
   '["Place ball on edge of box", "3-step run-up approach", "Plant foot beside ball, strike through centre", "Follow through towards target", "10 reps, rotate positions", "Track max power with radar if available"]'::jsonb,
   12, 'moderate', '["shooting"]'::jsonb, '["U14","U17","U20+"]'::jsonb, '["ST","CAM"]'::jsonb, 'training', 1, 4, 21),

  ('d0000003-0001-4000-a000-000000000003', 'football', '1v1 Finishing Drill', '1v1-finishing',
   'Attacker vs goalkeeper 1v1 to develop decision-making, composure, and finishing variety.',
   '["Attacker starts 25m from goal with ball", "Coach shouts GO — attacker drives at goal", "GK comes out to narrow angle", "Attacker must score — chip, round GK, or power shot", "5 attempts each, rotate roles"]'::jsonb,
   12, 'moderate', '["shooting","dribbling"]'::jsonb, '["U14","U17","U20+"]'::jsonb, '["ST","CAM","WM"]'::jsonb, 'training', 2, 4, 22),

-- ── TRAINING DRILLS — PASSING (3) ───────────────────────────

  ('d0000004-0001-4000-a000-000000000001', 'football', 'Triangle Passing Patterns', 'triangle-passing-patterns',
   'Quick feet passing patterns in triangles to build combination play and movement.',
   '["3 players form triangle (8m sides)", "Pass and follow — move to next cone", "1-2 touch maximum", "Vary: wall pass, overlap, third-man run", "5 min per pattern, 3 patterns"]'::jsonb,
   12, 'moderate', '["passing"]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'training', 3, 6, 30),

  ('d0000004-0001-4000-a000-000000000002', 'football', 'Long Ball Accuracy', 'long-ball-accuracy',
   'Practice driven and lofted passes over 25-40m distances to improve range and accuracy.',
   '["Two players 30m apart", "Alternate: driven pass along ground, lofted pass", "Target: partner receives without moving more than 2m", "20 passes each, track successful receptions", "Progress to moving targets"]'::jsonb,
   15, 'moderate', '["passing"]'::jsonb, '["U17","U20+"]'::jsonb, '["CM","FB","CB"]'::jsonb, 'training', 2, 4, 31),

  ('d0000004-0001-4000-a000-000000000003', 'football', 'Passing Under Pressure', 'passing-under-pressure',
   'Small-sided game focused on quick decision-making and pass selection under press.',
   '["4v4 in 20m×15m grid", "3-touch max first round, 2-touch second", "Ball out = possession turnover", "Play 4 min rounds, 1 min rest", "4 rounds total"]'::jsonb,
   20, 'moderate', '["passing","dribbling"]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'training', 8, 10, 32),

-- ── TRAINING DRILLS — DRIBBLING (3) ─────────────────────────

  ('d0000005-0001-4000-a000-000000000001', 'football', 'Cone Slalom Dribbling', 'cone-slalom-dribbling',
   'Weave through cones at speed to develop close control and change of direction with ball.',
   '["Set 8 cones in line 1.5m apart", "Dribble through using inside/outside of both feet", "Time each run", "6 runs per set, 2 sets", "Focus on keeping ball close to feet"]'::jsonb,
   10, 'moderate', '["dribbling","pace"]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'training', 1, 6, 40),

  ('d0000005-0001-4000-a000-000000000002', 'football', '1v1 Dribbling Moves', '1v1-dribbling-moves',
   'Practice specific dribbling moves to beat a defender in 1v1 situations.',
   '["Attacker faces passive defender 10m apart", "Attacker dribbles at defender, executes move", "Moves: stepover, scissors, Cruyff turn, elastico", "5 reps per move, each foot", "Progress to active defender"]'::jsonb,
   15, 'moderate', '["dribbling"]'::jsonb, '[]'::jsonb, '["ST","CAM","WM"]'::jsonb, 'training', 2, 4, 41),

  ('d0000005-0001-4000-a000-000000000003', 'football', 'Speed Dribble Relay', 'speed-dribble-relay',
   'Dribble at pace over 30m against the clock. Develops ball control at high speed.',
   '["Mark 30m course with start/end cones", "Dribble full speed, turn at cone, dribble back", "Must touch ball minimum 6 times per 30m", "Relay format: 4 runs each, team total time wins", "Rest 90s between runs"]'::jsonb,
   12, 'hard', '["dribbling","pace"]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'training', 2, 10, 42),

-- ── TRAINING DRILLS — DEFENDING (3) ─────────────────────────

  ('d0000006-0001-4000-a000-000000000001', 'football', 'Defensive Shuffle & Close', 'defensive-shuffle-close',
   'Lateral shuffle technique drill to close down attackers and maintain body position.',
   '["Set up 10m channel with cones", "Defender shuffles laterally across channel", "On whistle, sprint to close down the cone/partner", "Focus: low centre of gravity, side-on body shape", "10 reps, 2 sets"]'::jsonb,
   10, 'moderate', '["defending","pace"]'::jsonb, '[]'::jsonb, '["CB","FB","CM"]'::jsonb, 'training', 1, 6, 50),

  ('d0000006-0001-4000-a000-000000000002', 'football', '1v1 Defending Channel', '1v1-defending-channel',
   'Defender vs attacker in narrow channel. Train jockeying, timing of tackle, and recovery.',
   '["Set 5m wide, 20m long channel", "Attacker tries to dribble past defender to end line", "Defender jockeys, tries to win ball or force out", "5 attempts each role, then switch", "Score: defender wins = 1pt, attacker scores = 1pt"]'::jsonb,
   12, 'moderate', '["defending"]'::jsonb, '[]'::jsonb, '["CB","FB"]'::jsonb, 'training', 2, 4, 51),

  ('d0000006-0001-4000-a000-000000000003', 'football', 'Heading & Aerial Duels', 'heading-aerial-duels',
   'Practice defensive and attacking headers from crosses and goal kicks.',
   '["Partner throws/crosses ball from 15m", "Header for distance (defensive) — 10 reps", "Header for accuracy at target (attacking) — 10 reps", "Progress to contested aerial duels", "Focus on timing, body position, neck muscles"]'::jsonb,
   12, 'moderate', '["defending","physicality"]'::jsonb, '["U17","U20+"]'::jsonb, '["CB","ST"]'::jsonb, 'training', 2, 6, 52),

-- ── TRAINING DRILLS — PHYSICALITY (3) ───────────────────────

  ('d0000007-0001-4000-a000-000000000001', 'football', 'Bodyweight Strength Circuit', 'bodyweight-strength-circuit',
   'Football-specific bodyweight circuit for core, legs, and upper body.',
   '["Squats × 15", "Push-ups × 12", "Plank hold 45s", "Lunges × 10 each leg", "Burpees × 8", "Mountain climbers 30s", "Rest 60s, repeat 3 rounds"]'::jsonb,
   18, 'moderate', '["physicality"]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'training', 1, 20, 60),

  ('d0000007-0001-4000-a000-000000000002', 'football', 'Yo-Yo Intermittent Recovery', 'yo-yo-intermittent-recovery',
   'The Yo-Yo IR1 test protocol adapted as a fitness drill. Build match endurance.',
   '["Mark 20m shuttle course", "Follow audio beeps (progressive speed)", "10s active recovery between shuttles", "Continue until failure or target level", "Record level reached for tracking"]'::jsonb,
   20, 'hard', '["physicality"]'::jsonb, '["U17","U20+"]'::jsonb, '[]'::jsonb, 'training', 1, 30, 61),

  ('d0000007-0001-4000-a000-000000000003', 'football', 'Core Stability for Football', 'core-stability-football',
   'Football-specific core exercises to improve balance, power transfer, and injury prevention.',
   '["Dead bug × 10 each side", "Side plank 30s each side", "Russian twists × 20", "Single-leg glute bridge × 12 each", "Pallof press hold 20s each side", "2 sets, 45s rest between exercises"]'::jsonb,
   12, 'light', '["physicality"]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'training', 1, 20, 62),

-- ── COOLDOWN DRILLS (3) ─────────────────────────────────────

  ('d0000008-0001-4000-a000-000000000001', 'football', 'Static Stretching Routine', 'static-stretching-routine',
   'Post-training static stretches targeting all major muscle groups used in football.',
   '["Quad stretch 30s each leg", "Hamstring stretch 30s each", "Hip flexor stretch 30s each", "Calf stretch 30s each", "Groin stretch 30s", "Shoulder/chest stretch 30s", "Lower back stretch 30s"]'::jsonb,
   8, 'light', '["physicality"]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'cooldown', 1, 30, 90),

  ('d0000008-0001-4000-a000-000000000002', 'football', 'Light Jog & Breathwork', 'light-jog-breathwork',
   'Easy jog with controlled breathing to bring heart rate down gradually.',
   '["Light jog around pitch perimeter (2 laps)", "Walking with deep breathing (1 lap)", "Box breathing: 4s in, 4s hold, 4s out, 4s hold", "Repeat breathing pattern 5 times", "Finish with 30s eyes-closed visualization"]'::jsonb,
   6, 'light', '["physicality"]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'cooldown', 1, 30, 91),

-- ── RECOVERY DRILLS (2) ─────────────────────────────────────

  ('d0000009-0001-4000-a000-000000000001', 'football', 'Foam Rolling Recovery', 'foam-rolling-recovery',
   'Self-myofascial release with foam roller targeting football-specific muscle groups.',
   '["Quads: 60s each leg (roll slowly)", "IT band: 60s each side", "Hamstrings: 60s each leg", "Calves: 60s each leg", "Glutes: 60s each side", "Upper back: 60s", "Pause on tender spots for 10-15s"]'::jsonb,
   10, 'light', '["physicality"]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'recovery', 1, 20, 95),

  ('d0000009-0001-4000-a000-000000000002', 'football', 'Active Recovery Walk', 'active-recovery-walk',
   'Light movement session to promote blood flow and recovery without training load.',
   '["Easy walk (10 min)", "Gentle dynamic stretches (5 min)", "Light ball touches — sole rolls, toe taps (5 min)", "Walking lunges (2 × 10m)", "Deep breathing cool-down (2 min)"]'::jsonb,
   15, 'light', '["physicality"]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'recovery', 1, 20, 96);

-- ── EQUIPMENT ───────────────────────────────────────────────

INSERT INTO drill_equipment (drill_id, name, quantity, optional)
VALUES
  -- Rondo
  ('d0000001-0001-4000-a000-000000000002', 'Cones', 4, false),
  ('d0000001-0001-4000-a000-000000000002', 'Football', 1, false),
  -- Activation Sprints
  ('d0000001-0001-4000-a000-000000000003', 'Cones', 2, false),
  -- Ball Mastery
  ('d0000001-0001-4000-a000-000000000004', 'Football', 1, false),
  -- Sprint Intervals
  ('d0000002-0001-4000-a000-000000000001', 'Cones', 2, false),
  ('d0000002-0001-4000-a000-000000000001', 'Stopwatch', 1, true),
  -- Acceleration Ladder
  ('d0000002-0001-4000-a000-000000000002', 'Cones', 4, false),
  -- Repeated Sprints
  ('d0000002-0001-4000-a000-000000000003', 'Cones', 2, false),
  -- Finishing
  ('d0000003-0001-4000-a000-000000000001', 'Footballs', 6, false),
  ('d0000003-0001-4000-a000-000000000001', 'Goal', 1, false),
  -- Power Shot
  ('d0000003-0001-4000-a000-000000000002', 'Footballs', 6, false),
  ('d0000003-0001-4000-a000-000000000002', 'Goal', 1, false),
  ('d0000003-0001-4000-a000-000000000002', 'Speed Radar', 1, true),
  -- 1v1 Finishing
  ('d0000003-0001-4000-a000-000000000003', 'Football', 1, false),
  ('d0000003-0001-4000-a000-000000000003', 'Goal', 1, false),
  -- Triangle Passing
  ('d0000004-0001-4000-a000-000000000001', 'Cones', 3, false),
  ('d0000004-0001-4000-a000-000000000001', 'Football', 1, false),
  -- Long Ball
  ('d0000004-0001-4000-a000-000000000002', 'Footballs', 4, false),
  ('d0000004-0001-4000-a000-000000000002', 'Cones', 2, false),
  -- Cone Slalom
  ('d0000005-0001-4000-a000-000000000001', 'Cones', 8, false),
  ('d0000005-0001-4000-a000-000000000001', 'Football', 1, false),
  -- 1v1 Dribbling
  ('d0000005-0001-4000-a000-000000000002', 'Football', 1, false),
  ('d0000005-0001-4000-a000-000000000002', 'Cones', 2, false),
  -- Defensive Shuffle
  ('d0000006-0001-4000-a000-000000000001', 'Cones', 6, false),
  -- 1v1 Defending
  ('d0000006-0001-4000-a000-000000000002', 'Cones', 4, false),
  ('d0000006-0001-4000-a000-000000000002', 'Football', 1, false),
  -- Heading
  ('d0000006-0001-4000-a000-000000000003', 'Footballs', 4, false),
  -- Yo-Yo IR1
  ('d0000007-0001-4000-a000-000000000002', 'Cones', 3, false),
  ('d0000007-0001-4000-a000-000000000002', 'Audio Speaker', 1, false),
  -- Foam Rolling
  ('d0000009-0001-4000-a000-000000000001', 'Foam Roller', 1, false);

-- ── PROGRESSIONS ────────────────────────────────────────────

INSERT INTO drill_progressions (drill_id, level, label, description, duration_minutes, sort_order)
VALUES
  -- Cone Slalom
  ('d0000005-0001-4000-a000-000000000001', 1, 'Beginner', 'Walk pace, inside foot only, focus on control', 8, 1),
  ('d0000005-0001-4000-a000-000000000001', 2, 'Intermediate', 'Jog pace, alternate inside/outside', 10, 2),
  ('d0000005-0001-4000-a000-000000000001', 3, 'Advanced', 'Sprint pace, tighten cone spacing to 1m', 10, 3),
  -- 1v1 Dribbling
  ('d0000005-0001-4000-a000-000000000002', 1, 'Beginner', 'Passive defender, practice moves slowly', 12, 1),
  ('d0000005-0001-4000-a000-000000000002', 2, 'Intermediate', 'Semi-active defender, 50% pressure', 15, 2),
  ('d0000005-0001-4000-a000-000000000002', 3, 'Advanced', 'Fully active defender, game-speed', 15, 3),
  -- Sprint Intervals
  ('d0000002-0001-4000-a000-000000000001', 1, 'Beginner', '4 reps, 1 set, 90s recovery', 10, 1),
  ('d0000002-0001-4000-a000-000000000001', 2, 'Intermediate', '6 reps, 2 sets, 60s recovery', 15, 2),
  ('d0000002-0001-4000-a000-000000000001', 3, 'Advanced', '8 reps, 3 sets, 45s recovery', 20, 3),
  -- Bodyweight Circuit
  ('d0000007-0001-4000-a000-000000000001', 1, 'Beginner', '2 rounds, 45s rest, reduced reps', 12, 1),
  ('d0000007-0001-4000-a000-000000000001', 2, 'Intermediate', '3 rounds, 60s rest, full reps', 18, 2),
  ('d0000007-0001-4000-a000-000000000001', 3, 'Advanced', '4 rounds, 45s rest, add plyometric variations', 24, 3);

-- ── TAGS ─────────────────────────────────────────────────────

INSERT INTO drill_tags (drill_id, tag)
VALUES
  ('d0000001-0001-4000-a000-000000000001', 'warmup'), ('d0000001-0001-4000-a000-000000000001', 'flexibility'),
  ('d0000001-0001-4000-a000-000000000002', 'rondo'), ('d0000001-0001-4000-a000-000000000002', 'possession'),
  ('d0000001-0001-4000-a000-000000000003', 'sprints'), ('d0000001-0001-4000-a000-000000000003', 'activation'),
  ('d0000001-0001-4000-a000-000000000004', 'ball mastery'), ('d0000001-0001-4000-a000-000000000004', 'technique'),
  ('d0000002-0001-4000-a000-000000000001', 'speed'), ('d0000002-0001-4000-a000-000000000001', 'sprints'),
  ('d0000002-0001-4000-a000-000000000002', 'acceleration'), ('d0000002-0001-4000-a000-000000000002', 'explosive'),
  ('d0000002-0001-4000-a000-000000000003', 'endurance'), ('d0000002-0001-4000-a000-000000000003', 'repeated sprints'),
  ('d0000003-0001-4000-a000-000000000001', 'finishing'), ('d0000003-0001-4000-a000-000000000001', 'shooting'),
  ('d0000003-0001-4000-a000-000000000002', 'power'), ('d0000003-0001-4000-a000-000000000002', 'shooting'),
  ('d0000003-0001-4000-a000-000000000003', '1v1'), ('d0000003-0001-4000-a000-000000000003', 'finishing'),
  ('d0000004-0001-4000-a000-000000000001', 'combination play'), ('d0000004-0001-4000-a000-000000000001', 'passing'),
  ('d0000004-0001-4000-a000-000000000002', 'long range'), ('d0000004-0001-4000-a000-000000000002', 'accuracy'),
  ('d0000004-0001-4000-a000-000000000003', 'pressure'), ('d0000004-0001-4000-a000-000000000003', 'decision making'),
  ('d0000005-0001-4000-a000-000000000001', 'dribbling'), ('d0000005-0001-4000-a000-000000000001', 'close control'),
  ('d0000005-0001-4000-a000-000000000002', '1v1'), ('d0000005-0001-4000-a000-000000000002', 'skills'),
  ('d0000005-0001-4000-a000-000000000003', 'speed dribble'), ('d0000005-0001-4000-a000-000000000003', 'relay'),
  ('d0000006-0001-4000-a000-000000000001', 'defending'), ('d0000006-0001-4000-a000-000000000001', 'footwork'),
  ('d0000006-0001-4000-a000-000000000002', '1v1'), ('d0000006-0001-4000-a000-000000000002', 'tackling'),
  ('d0000006-0001-4000-a000-000000000003', 'heading'), ('d0000006-0001-4000-a000-000000000003', 'aerial'),
  ('d0000007-0001-4000-a000-000000000001', 'strength'), ('d0000007-0001-4000-a000-000000000001', 'circuit'),
  ('d0000007-0001-4000-a000-000000000002', 'endurance'), ('d0000007-0001-4000-a000-000000000002', 'test'),
  ('d0000007-0001-4000-a000-000000000003', 'core'), ('d0000007-0001-4000-a000-000000000003', 'stability'),
  ('d0000008-0001-4000-a000-000000000001', 'stretching'), ('d0000008-0001-4000-a000-000000000001', 'flexibility'),
  ('d0000008-0001-4000-a000-000000000002', 'breathing'), ('d0000008-0001-4000-a000-000000000002', 'recovery'),
  ('d0000009-0001-4000-a000-000000000001', 'foam rolling'), ('d0000009-0001-4000-a000-000000000001', 'recovery'),
  ('d0000009-0001-4000-a000-000000000002', 'active recovery'), ('d0000009-0001-4000-a000-000000000002', 'light');
