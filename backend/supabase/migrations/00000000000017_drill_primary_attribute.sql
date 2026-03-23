-- Add primary_attribute column to training_drills
-- This identifies the MAIN focus of each drill for gap-targeting priority
ALTER TABLE public.training_drills
  ADD COLUMN IF NOT EXISTS primary_attribute text;

-- Set primary_attribute for all existing drills
-- PACE drills (sprint mechanics)
UPDATE training_drills SET primary_attribute = 'pace' WHERE slug IN (
  'activation-sprints', '30m-sprint-intervals', 'acceleration-ladder',
  'repeated-sprint-ability', 'speed-dribble-relay',
  'wall-drives', 'a-skip-a-run', 'falling-starts-10m', 'wicket-runs',
  'resisted-sled-sprints', 'timed-sprint-testing', 'sprint-mechanics-warmup',
  'plyo-bounds-sprint'
);

-- SHOOTING drills
UPDATE training_drills SET primary_attribute = 'shooting' WHERE slug IN (
  'finishing-under-pressure', 'power-shot-technique', '1v1-finishing'
);

-- PASSING drills
UPDATE training_drills SET primary_attribute = 'passing' WHERE slug IN (
  'triangle-passing-patterns', 'long-ball-accuracy', 'passing-under-pressure',
  'rondo-warmup-4v1'
);

-- DRIBBLING drills
UPDATE training_drills SET primary_attribute = 'dribbling' WHERE slug IN (
  'cone-slalom', '1v1-dribbling-moves', 'ball-mastery-warmup'
);

-- DEFENDING drills
UPDATE training_drills SET primary_attribute = 'defending' WHERE slug IN (
  'defensive-shuffle', '1v1-defending', 'heading-aerial-duels'
);

-- PHYSICALITY drills
UPDATE training_drills SET primary_attribute = 'physicality' WHERE slug IN (
  'dynamic-stretching-circuit', 'bodyweight-strength-circuit',
  'yo-yo-ir1-test', 'core-stability-for-football'
);

-- Recovery/cooldown
UPDATE training_drills SET primary_attribute = 'recovery' WHERE slug IN (
  'static-stretching-cooldown', 'light-jog-cooldown',
  'foam-rolling-recovery', 'active-recovery-walk'
);

COMMENT ON COLUMN training_drills.primary_attribute IS 'Main attribute focus for gap-targeting priority. Drills matching a player gap via primary_attribute score highest in recommendations.';
