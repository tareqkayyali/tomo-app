-- ═══════════════════════════════════════════════════════════════════════
-- Content Seed — All hardcoded app content migrated to Supabase
-- Run after migrations: npx supabase db reset
-- ═══════════════════════════════════════════════════════════════════════

-- ═══ SPORTS ═══

INSERT INTO public.sports (id, label, icon, color, sort_order, available, config) VALUES
  ('football', 'Football', 'football-outline', '#FF6B35', 1, true, '{"dnaOverallWeights": null}'::jsonb),
  ('padel', 'Padel', 'tennisball-outline', '#00D9FF', 2, true, '{"dnaOverallWeights": {"power": 0.15, "reflexes": 0.18, "control": 0.25, "stamina": 0.12, "agility": 0.15, "tactics": 0.15}}'::jsonb),
  ('basketball', 'Basketball', 'basketball-outline', '#FF9500', 3, false, '{}'::jsonb),
  ('tennis', 'Tennis', 'tennisball-outline', '#30D158', 4, false, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ═══ FOOTBALL ATTRIBUTES (6 attributes × 7 sub-attributes each) ═══

INSERT INTO public.sport_attributes (sport_id, key, label, full_name, abbreviation, description, color, max_value, sort_order, sub_attributes) VALUES
  ('football', 'pace', 'PAC', 'Pace', 'PAC', 'Speed, acceleration, and sprint ability', '#3498DB', 99, 1,
   '[{"name":"5m Sprint","weight":0.15,"description":"Explosive start over 5 meters","unit":"s"},{"name":"10m Sprint","weight":0.15,"description":"Short acceleration phase","unit":"s"},{"name":"30m Sprint","weight":0.20,"description":"Mid-range sprint speed","unit":"s"},{"name":"Max Sprint Speed","weight":0.20,"description":"Peak velocity during sprint","unit":"km/h"},{"name":"Flying 20m Sprint","weight":0.10,"description":"Top speed over 20m with running start","unit":"s"},{"name":"40m Sprint","weight":0.10,"description":"Full sprint over 40 meters","unit":"s"},{"name":"Repeated Sprint Avg 6x30m","weight":0.10,"description":"Average time across 6 repeated 30m sprints","unit":"s"}]'::jsonb),

  ('football', 'shooting', 'SHO', 'Shooting', 'SHO', 'Shot power, accuracy, and finishing ability', '#FF6B35', 99, 2,
   '[{"name":"Shot Power","weight":0.25,"description":"Maximum ball speed on strike","unit":"km/h"},{"name":"Max Kick Distance","weight":0.20,"description":"Longest shot distance","unit":"m"},{"name":"Non-Dominant Foot Speed","weight":0.15,"description":"Ball speed on non-dominant foot","unit":"km/h"},{"name":"Volley Kick Speed","weight":0.10,"description":"Speed on volley strikes","unit":"km/h"},{"name":"Shooting Drill Score","weight":0.15,"description":"Accuracy in structured shooting drill","unit":"pts/10"},{"name":"Free Kick Distance","weight":0.05,"description":"Distance achieved on free kicks","unit":"m"},{"name":"Shot Release Time","weight":0.10,"description":"Time from ball receipt to shot","unit":"s"}]'::jsonb),

  ('football', 'passing', 'PAS', 'Passing', 'PAS', 'Passing range, accuracy, and distribution', '#30D158', 99, 3,
   '[{"name":"Long Pass Distance","weight":0.15,"description":"Maximum accurate long pass range","unit":"m"},{"name":"Pass Speed","weight":0.15,"description":"Velocity of ground passes","unit":"km/h"},{"name":"Short Pass Drill Time","weight":0.20,"description":"Time to complete 20-pass circuit","unit":"s"},{"name":"Passing Accuracy Drill","weight":0.20,"description":"Score in structured passing accuracy test","unit":"pts/20"},{"name":"Cross Delivery Distance","weight":0.10,"description":"Range of crosses from wide positions","unit":"m"},{"name":"Throw-In Distance","weight":0.10,"description":"Maximum throw-in range","unit":"m"},{"name":"Lofted Pass Hang Time","weight":0.10,"description":"Air time on lofted through balls","unit":"s"}]'::jsonb),

  ('football', 'dribbling', 'DRI', 'Dribbling', 'DRI', 'Agility, ball control, and change of direction', '#00D9FF', 99, 4,
   '[{"name":"T-Test Agility","weight":0.20,"description":"Time on standard T-test agility course","unit":"s"},{"name":"5-0-5 COD","weight":0.15,"description":"Change of direction speed test","unit":"s"},{"name":"Illinois Agility Run","weight":0.15,"description":"Illinois agility test completion time","unit":"s"},{"name":"Slalom Dribble 10 Cones","weight":0.15,"description":"Dribble time through 10-cone slalom","unit":"s"},{"name":"Ball Juggling Count","weight":0.10,"description":"Maximum consecutive juggles","unit":"reps"},{"name":"Reaction Time","weight":0.15,"description":"Visual reaction speed","unit":"ms"},{"name":"Arrowhead Agility","weight":0.10,"description":"Arrowhead agility test time","unit":"s"}]'::jsonb),

  ('football', 'defending', 'DEF', 'Defending', 'DEF', 'Defensive ability, aerial strength, and recovery', '#7B61FF', 99, 5,
   '[{"name":"Standing Vertical Jump","weight":0.20,"description":"Jump height from standing position","unit":"cm"},{"name":"Header Distance","weight":0.15,"description":"Distance achieved on headed clearance","unit":"m"},{"name":"Lateral Shuffle 5mx4","weight":0.15,"description":"Lateral defensive shuffle speed","unit":"s"},{"name":"Backward Sprint 10m","weight":0.15,"description":"Backward sprint over 10 meters","unit":"s"},{"name":"Isometric Push Strength","weight":0.15,"description":"Upper body push strength","unit":"kg"},{"name":"Grip Strength","weight":0.10,"description":"Hand grip force measurement","unit":"kg"},{"name":"Recovery Run 40m","weight":0.10,"description":"Recovery sprint back to defensive position","unit":"s"}]'::jsonb),

  ('football', 'physicality', 'PHY', 'Physicality', 'PHY', 'Endurance, power, and physical resilience', '#E74C3C', 99, 6,
   '[{"name":"CMJ Jump Height","weight":0.20,"description":"Countermovement jump height","unit":"cm"},{"name":"Yo-Yo IR1 Distance","weight":0.20,"description":"Distance in Yo-Yo Intermittent Recovery Level 1","unit":"m"},{"name":"VO2max","weight":0.15,"description":"Maximum oxygen consumption","unit":"mL/kg/min"},{"name":"Total Match Distance","weight":0.15,"description":"Total distance covered in a match","unit":"m"},{"name":"HRV RMSSD","weight":0.10,"description":"Heart rate variability recovery indicator","unit":"ms"},{"name":"Sleep Duration","weight":0.10,"description":"Average nightly sleep duration","unit":"hours"},{"name":"Relative Squat Strength","weight":0.10,"description":"Back squat 1RM relative to body weight","unit":"xBW"}]'::jsonb)
ON CONFLICT (sport_id, key) DO NOTHING;

-- ═══ PADEL DNA ATTRIBUTES (6) ═══

INSERT INTO public.sport_attributes (sport_id, key, label, full_name, abbreviation, description, color, max_value, sort_order, sub_attributes) VALUES
  ('padel', 'power', 'POW', 'Power', 'POW', 'Raw hitting power and explosive strength', '#FF6B35', 99, 1, '[]'::jsonb),
  ('padel', 'reflexes', 'REF', 'Reflexes', 'REF', 'Reaction speed and hand-eye coordination', '#FFD60A', 99, 2, '[]'::jsonb),
  ('padel', 'control', 'CON', 'Control', 'CON', 'Shot placement and precision', '#30D158', 99, 3, '[]'::jsonb),
  ('padel', 'stamina', 'STA', 'Stamina', 'STA', 'Endurance and sustained effort', '#00D9FF', 99, 4, '[]'::jsonb),
  ('padel', 'agility', 'AGI', 'Agility', 'AGI', 'Court movement and footwork', '#FF9500', 99, 5, '[]'::jsonb),
  ('padel', 'tactics', 'TAC', 'Tactics', 'TAC', 'Game intelligence and strategy', '#5856D6', 99, 6, '[]'::jsonb)
ON CONFLICT (sport_id, key) DO NOTHING;

-- ═══ FOOTBALL SKILLS (8 skills × 3 sub-metrics each) ═══

INSERT INTO public.sport_skills (sport_id, key, name, category, description, icon, sort_order, sub_metrics) VALUES
  ('football', 'free_kicks', 'Free Kicks', 'Set Piece', 'Dead ball delivery from free kick situations', 'football-outline', 1,
   '[{"key":"power","label":"Power","unit":"km/h","description":"Ball speed on free kick strike"},{"key":"distance","label":"Distance","unit":"m","description":"Maximum effective free kick range"},{"key":"accuracyDrill","label":"Accuracy Drill","unit":"pts/10","description":"Score in free kick target drill"}]'::jsonb),

  ('football', 'penalties', 'Penalties', 'Set Piece', 'Penalty kick execution under pressure', 'flag-outline', 2,
   '[{"key":"power","label":"Power","unit":"km/h","description":"Ball speed on penalty strike"},{"key":"placementDrill","label":"Placement Drill","unit":"pts/5","description":"Accuracy hitting corner targets"},{"key":"releaseTime","label":"Release Time","unit":"s","description":"Time from whistle to ball strike"}]'::jsonb),

  ('football', 'crossing', 'Crossing', 'Wide Play', 'Delivery of crosses from wide positions', 'swap-horizontal-outline', 3,
   '[{"key":"distance","label":"Distance","unit":"m","description":"Maximum cross delivery range"},{"key":"accuracyDrill","label":"Accuracy Drill","unit":"pts/10","description":"Score in crossing accuracy drill"},{"key":"deliverySpeed","label":"Delivery Speed","unit":"km/h","description":"Ball speed on crosses"}]'::jsonb),

  ('football', 'headers', 'Headers', 'Aerial', 'Heading ability in attack and defense', 'arrow-up-outline', 4,
   '[{"key":"jumpHeight","label":"Jump Height","unit":"cm","description":"Vertical leap height for headers"},{"key":"distance","label":"Distance","unit":"m","description":"Distance on headed clearances"},{"key":"accuracyDrill","label":"Accuracy Drill","unit":"pts/10","description":"Score in heading accuracy drill"}]'::jsonb),

  ('football', 'tackling', 'Tackling', 'Defensive', 'Winning the ball through tackles and interceptions', 'shield-outline', 5,
   '[{"key":"recoverySprint","label":"Recovery Sprint","unit":"s","description":"Time to recover defensive position"},{"key":"lateralSpeed","label":"Lateral Speed","unit":"s","description":"Lateral movement speed in 1v1"},{"key":"drillScore","label":"1v1 Drill Score","unit":"pts/10","description":"Score in 1v1 defensive drill"}]'::jsonb),

  ('football', 'long_balls', 'Long Balls', 'Distribution', 'Long-range passing and switching play', 'navigate-outline', 6,
   '[{"key":"distance","label":"Distance","unit":"m","description":"Maximum accurate long ball range"},{"key":"hangTime","label":"Hang Time","unit":"s","description":"Air time on lofted passes"},{"key":"accuracyDrill","label":"Accuracy Drill","unit":"pts/10","description":"Score in long ball accuracy drill"}]'::jsonb),

  ('football', 'dribble_moves', 'Dribble Moves', 'Ball Control', 'Skill moves and close ball control in tight spaces', 'git-branch-outline', 7,
   '[{"key":"slalomTime","label":"Slalom Time","unit":"s","description":"Dribble time through cone slalom"},{"key":"coneDrillTime","label":"Cone Drill Time","unit":"s","description":"Time on close-control cone drill"},{"key":"juggling","label":"Juggling","unit":"reps","description":"Maximum consecutive ball juggles"}]'::jsonb),

  ('football', 'first_touch', 'First Touch', 'Ball Control', 'Receiving and controlling the ball cleanly', 'hand-left-outline', 8,
   '[{"key":"controlDrill","label":"Control Drill","unit":"pts/10","description":"Score in first touch control drill"},{"key":"reactionTime","label":"Reaction Time","unit":"ms","description":"Response time to incoming ball"},{"key":"passSpeedAfterTouch","label":"Pass Speed After Touch","unit":"km/h","description":"Velocity of pass immediately after receiving"}]'::jsonb)
ON CONFLICT (sport_id, key) DO NOTHING;

-- ═══ PADEL SKILLS / SHOTS (8 shots × 3 sub-metrics each) ═══

INSERT INTO public.sport_skills (sport_id, key, name, category, description, icon, sort_order, sub_metrics) VALUES
  ('padel', 'bandeja', 'Bandeja', 'Overhead', 'Defensive overhead slice to neutralize lobs', 'arrow-down-outline', 1,
   '[{"key":"consistency","label":"Consistency","description":"How reliably you execute the shot"},{"key":"placement","label":"Placement","description":"Accuracy of shot placement"},{"key":"depth","label":"Depth","description":"Ability to control depth of the shot"}]'::jsonb),

  ('padel', 'vibora', 'Vibora', 'Overhead', 'Aggressive overhead with side-spin', 'flash-outline', 2,
   '[{"key":"power","label":"Power","description":"Force and speed of the shot"},{"key":"spin","label":"Spin","description":"Amount of side-spin generated"},{"key":"accuracy","label":"Accuracy","description":"Precision of placement"}]'::jsonb),

  ('padel', 'smash', 'Smash', 'Overhead', 'Full power overhead finish', 'trending-up-outline', 3,
   '[{"key":"power","label":"Power","description":"Maximum power on the smash"},{"key":"timing","label":"Timing","description":"Quality of contact timing"},{"key":"placement","label":"Placement","description":"Ability to direct the smash"}]'::jsonb),

  ('padel', 'chiquita', 'Chiquita', 'Net Play', 'Soft low shot at opponents feet from the back', 'remove-outline', 4,
   '[{"key":"softness","label":"Softness","description":"Touch and feel on the ball"},{"key":"consistency","label":"Consistency","description":"Reliability under pressure"},{"key":"placement","label":"Placement","description":"Precision of placement near the net"}]'::jsonb),

  ('padel', 'lob', 'Lob', 'Defensive', 'High defensive lob to move opponents back', 'arrow-up-outline', 5,
   '[{"key":"height","label":"Height","description":"Ability to achieve good lob height"},{"key":"depth","label":"Depth","description":"Distance and depth of the lob"},{"key":"consistency","label":"Consistency","description":"Reliability of execution"}]'::jsonb),

  ('padel', 'bajada', 'Bajada', 'Overhead', 'Attacking shot off the back glass', 'arrow-forward-outline', 6,
   '[{"key":"power","label":"Power","description":"Force generated from the glass"},{"key":"timing","label":"Timing","description":"Reading the ball off the glass"},{"key":"accuracy","label":"Accuracy","description":"Shot placement accuracy"}]'::jsonb),

  ('padel', 'volley', 'Volley', 'Net Play', 'Direct volleys at the net position', 'hand-right-outline', 7,
   '[{"key":"reflexes","label":"Reflexes","description":"Speed of reaction at the net"},{"key":"control","label":"Control","description":"Soft hands and precision"},{"key":"consistency","label":"Consistency","description":"Reliability of net volleys"}]'::jsonb),

  ('padel', 'serve', 'Serve', 'Set Piece', 'Service to start each point', 'tennisball-outline', 8,
   '[{"key":"power","label":"Power","description":"Service speed and force"},{"key":"placement","label":"Placement","description":"Accuracy of serve direction"},{"key":"variation","label":"Variation","description":"Ability to mix up serves"}]'::jsonb)
ON CONFLICT (sport_id, key) DO NOTHING;

-- ═══ FOOTBALL POSITIONS (7) ═══

INSERT INTO public.sport_positions (sport_id, key, label, sort_order, attribute_weights) VALUES
  ('football', 'ST', 'Striker', 1,
   '{"pace":0.15,"shooting":0.25,"passing":0.10,"dribbling":0.20,"defending":0.05,"physicality":0.25}'::jsonb),
  ('football', 'CAM', 'Attacking Midfielder', 2,
   '{"pace":0.10,"shooting":0.15,"passing":0.25,"dribbling":0.20,"defending":0.05,"physicality":0.25}'::jsonb),
  ('football', 'WM', 'Wide Midfielder', 3,
   '{"pace":0.20,"shooting":0.15,"passing":0.15,"dribbling":0.25,"defending":0.05,"physicality":0.20}'::jsonb),
  ('football', 'CM', 'Central Midfielder', 4,
   '{"pace":0.10,"shooting":0.10,"passing":0.25,"dribbling":0.15,"defending":0.15,"physicality":0.25}'::jsonb),
  ('football', 'FB', 'Full Back', 5,
   '{"pace":0.15,"shooting":0.05,"passing":0.15,"dribbling":0.10,"defending":0.25,"physicality":0.30}'::jsonb),
  ('football', 'CB', 'Centre Back', 6,
   '{"pace":0.10,"shooting":0.05,"passing":0.10,"dribbling":0.05,"defending":0.35,"physicality":0.35}'::jsonb),
  ('football', 'GK', 'Goalkeeper', 7,
   '{"pace":0.10,"shooting":0.05,"passing":0.15,"dribbling":0.05,"defending":0.30,"physicality":0.35}'::jsonb)
ON CONFLICT (sport_id, key) DO NOTHING;

-- ═══ FOOTBALL RATING LEVELS (10) ═══

INSERT INTO public.sport_rating_levels (sport_id, name, min_rating, max_rating, description, color, sort_order) VALUES
  ('football', 'Newcomer',      0,   199, 'Just starting your football journey',   '#8E8E93', 1),
  ('football', 'Beginner',      200, 349, 'Learning the fundamentals',             '#A2845E', 2),
  ('football', 'Park Player',   350, 449, 'Confident in casual play',              '#C0C0C0', 3),
  ('football', 'Sunday League', 450, 549, 'Competitive recreational player',       '#30D158', 4),
  ('football', 'Club Player',   550, 649, 'Regular club-level competitor',         '#3498DB', 5),
  ('football', 'Academy Elite', 650, 749, 'Academy standard, scouted talent',      '#7B61FF', 6),
  ('football', 'Semi-Pro',      750, 849, 'Semi-professional standard',            '#FF9500', 7),
  ('football', 'Professional',  850, 929, 'Full professional footballer',          '#FF6B35', 8),
  ('football', 'World Class',   930, 979, 'Among the best in the world',           '#FFD700', 9),
  ('football', 'Legend',         980, 1000,'All-time great, generational talent',   '#E74C3C', 10)
ON CONFLICT (sport_id, name) DO NOTHING;

-- ═══ PADEL RATING LEVELS (10) ═══

INSERT INTO public.sport_rating_levels (sport_id, name, min_rating, max_rating, description, color, sort_order) VALUES
  ('padel', 'Newcomer',       0,    99,  'First steps in padel',       '#8E8E93', 1),
  ('padel', 'Beginner',       100,  199, 'Learning the game',          '#A2845E', 2),
  ('padel', 'Developing',     200,  299, 'Building consistency',       '#C0C0C0', 3),
  ('padel', 'Intermediate',   300,  399, 'Solid fundamentals',         '#30D158', 4),
  ('padel', 'Advanced',       400,  499, 'Strong club player',         '#3498DB', 5),
  ('padel', 'Elite Amateur',  500,  599, 'Regional champion',          '#7B61FF', 6),
  ('padel', 'Semi-Pro',       600,  699, 'National competitor',        '#FF9500', 7),
  ('padel', 'Professional',   700,  799, 'Touring professional',       '#FF6B35', 8),
  ('padel', 'World Class',    800,  899, 'Top 50 worldwide',           '#FFD700', 9),
  ('padel', 'Legend',          900,  1000,'Top 10-20 in the world',     '#E74C3C', 10)
ON CONFLICT (sport_id, name) DO NOTHING;

-- ═══ FOOTBALL TEST DEFINITIONS (8 tests) ═══
-- NOTE: derived_metrics store key references — actual calculate() functions
-- remain in TypeScript (derivedMetricCalculators.ts registry).

INSERT INTO public.sport_test_definitions (sport_id, test_id, name, icon, color, description, research_note, attribute_keys, inputs, derived_metrics, primary_metric_name, primary_input_key, sort_order) VALUES

  ('football', 'sprint', 'Sprint Test', 'flash-outline', '#3498DB',
   'Measure your speed over 30 meters with optional splits.',
   'Sprint performance improves ~15% from U14 to senior (Radziminski et al., 2025). The 30m sprint is the standard benchmark for football acceleration.',
   '["pace"]'::jsonb,
   '[{"key":"time30m","label":"30m Time","unit":"s","type":"number","required":true,"placeholder":"4.20","min":3.0,"max":8.0,"step":0.01},{"key":"time5m","label":"5m Split","unit":"s","type":"number","required":false,"placeholder":"1.05","min":0.7,"max":2.0,"step":0.01},{"key":"time10m","label":"10m Split","unit":"s","type":"number","required":false,"placeholder":"1.80","min":1.2,"max":3.0,"step":0.01},{"key":"time40m","label":"40m Split","unit":"s","type":"number","required":false,"placeholder":"5.20","min":4.0,"max":9.0,"step":0.01}]'::jsonb,
   '[{"key":"estMaxSpeed","label":"Est. Max Speed","unit":"km/h","normMetricName":"Max Sprint Speed"}]'::jsonb,
   '30m Sprint', 'time30m', 1),

  ('football', 'jump', 'Jump Test', 'arrow-up-outline', '#E74C3C',
   'Countermovement jump height from flight time or direct measurement.',
   'CMJ increases ~50% from U14 to senior (Research Section 6.2). Jump height reflects lower-body power critical for aerial duels and acceleration.',
   '["physicality","defending"]'::jsonb,
   '[{"key":"cmjHeight","label":"CMJ Height","unit":"cm","type":"number","required":false,"placeholder":"38.0","min":10,"max":80,"step":0.1},{"key":"flightTime","label":"Flight Time","unit":"ms","type":"number","required":false,"placeholder":"520","min":200,"max":900,"step":1}]'::jsonb,
   '[{"key":"heightFromFlight","label":"Height from Flight","unit":"cm"},{"key":"estPower","label":"Est. Power","unit":"W/kg"}]'::jsonb,
   'CMJ Jump Height', 'cmjHeight', 2),

  ('football', 'endurance', 'Endurance Test', 'fitness-outline', '#E74C3C',
   'Yo-Yo Intermittent Recovery Level 1 test distance.',
   'Yo-Yo IR1 doubles from U14 to senior (Research Section 6.4). VO2max is derived via Bangsbo formula: VO2max = d x 0.0084 + 36.4.',
   '["physicality"]'::jsonb,
   '[{"key":"yoyoDistance","label":"Yo-Yo Distance","unit":"m","type":"number","required":true,"placeholder":"1800","min":100,"max":3500,"step":10}]'::jsonb,
   '[{"key":"vo2max","label":"VO2max","unit":"mL/kg/min","normMetricName":"VO2max"}]'::jsonb,
   'Yo-Yo IR1 Distance', 'yoyoDistance', 3),

  ('football', 'agility', 'Agility Test', 'git-branch-outline', '#00D9FF',
   'Change of direction speed — choose Illinois, 5-0-5, or T-Test.',
   'Agility is neural and peaks earlier than power-based traits (Research Section 6.3). COD ability separates elite from sub-elite youth players.',
   '["dribbling"]'::jsonb,
   '[{"key":"agilityType","label":"Test Type","unit":"","type":"select","required":true,"placeholder":"","options":[{"label":"Illinois","value":"illinois"},{"label":"5-0-5","value":"5-0-5"},{"label":"T-Test","value":"ttest"}]},{"key":"agilityTime","label":"Time","unit":"s","type":"number","required":true,"placeholder":"15.0","min":1.5,"max":25.0,"step":0.01}]'::jsonb,
   '[]'::jsonb,
   'Illinois Agility Run', 'agilityTime', 4),

  ('football', 'shooting', 'Shooting Test', 'football-outline', '#FF6B35',
   'Measure shot power with optional kick distance and non-dominant foot.',
   'Kick velocity increases with leg strength maturation. Shot power at professional level averages 100-115 km/h dominant foot.',
   '["shooting"]'::jsonb,
   '[{"key":"shotPower","label":"Shot Power","unit":"km/h","type":"number","required":true,"placeholder":"92","min":20,"max":160,"step":1},{"key":"kickDistance","label":"Kick Distance","unit":"m","type":"number","required":false,"placeholder":"55","min":10,"max":80,"step":1},{"key":"weakFootSpeed","label":"Non-Dominant Foot Speed","unit":"km/h","type":"number","required":false,"placeholder":"68","min":15,"max":140,"step":1}]'::jsonb,
   '[]'::jsonb,
   'Shot Power', 'shotPower', 5),

  ('football', 'passing', 'Passing Test', 'navigate-outline', '#30D158',
   'Long pass distance and accuracy drill score.',
   'Pass distance follows the power maturation curve. Accuracy in structured drills distinguishes academy players from recreational.',
   '["passing"]'::jsonb,
   '[{"key":"longPassDist","label":"Long Pass Distance","unit":"m","type":"number","required":true,"placeholder":"45","min":10,"max":80,"step":1},{"key":"accuracy","label":"Accuracy","unit":"/20","type":"number","required":true,"placeholder":"14","min":0,"max":20,"step":1},{"key":"passSpeed","label":"Pass Speed","unit":"km/h","type":"number","required":false,"placeholder":"76","min":20,"max":120,"step":1}]'::jsonb,
   '[]'::jsonb,
   'Long Pass Distance', 'longPassDist', 6),

  ('football', 'strength', 'Strength Test', 'barbell-outline', '#7B61FF',
   'Grip strength and relative squat strength for overall power.',
   'Strength peaks at 16-18 years (Sherwood, 2021). Grip strength correlates with upper body power needed for shielding and aerial duels.',
   '["defending","physicality"]'::jsonb,
   '[{"key":"gripStrength","label":"Grip Strength","unit":"kg","type":"number","required":true,"placeholder":"42","min":10,"max":80,"step":0.5},{"key":"squatBW","label":"Squat (x Body Weight)","unit":"xBW","type":"number","required":true,"placeholder":"1.40","min":0.3,"max":3.0,"step":0.05},{"key":"pushStrength","label":"Push Strength","unit":"kg","type":"number","required":false,"placeholder":"65","min":15,"max":120,"step":1}]'::jsonb,
   '[]'::jsonb,
   'Grip Strength', 'gripStrength', 7),

  ('football', 'selfAssessment', 'Skill Assessment', 'star-outline', '#F39C12',
   'Rate your 8 football skills across 24 sub-metrics (1-5 scale).',
   'Self-assessment builds self-awareness and metacognitive skills. Combined with physical tests, it gives a full player profile.',
   '["pace","shooting","passing","dribbling","defending","physicality"]'::jsonb,
   '[]'::jsonb,
   '[]'::jsonb,
   '', '', 8)

ON CONFLICT (sport_id, test_id) DO NOTHING;

-- ═══ FOOTBALL NORMATIVE DATA (42 metrics × ages 13-23) ═══

INSERT INTO public.sport_normative_data (sport_id, metric_name, unit, attribute_key, direction, age_min, age_max, means, sds) VALUES
  -- PAC (Pace) — 7 metrics
  ('football', '5m Sprint', 's', 'pace', 'lower', 13, 23,
   '[1.15,1.12,1.08,1.05,1.02,1.00,0.98,0.97,0.96,0.96,0.96]'::jsonb,
   '[0.08,0.07,0.07,0.06,0.06,0.05,0.05,0.05,0.05,0.05,0.05]'::jsonb),
  ('football', '10m Sprint', 's', 'pace', 'lower', 13, 23,
   '[1.95,1.90,1.85,1.80,1.75,1.72,1.70,1.70,1.70,1.70,1.70]'::jsonb,
   '[0.12,0.11,0.10,0.09,0.08,0.07,0.07,0.07,0.07,0.07,0.07]'::jsonb),
  ('football', '30m Sprint', 's', 'pace', 'lower', 13, 23,
   '[5.00,4.80,4.55,4.35,4.20,4.10,4.05,4.00,3.98,3.97,3.96]'::jsonb,
   '[0.30,0.28,0.25,0.22,0.20,0.18,0.15,0.15,0.15,0.15,0.15]'::jsonb),
  ('football', 'Max Sprint Speed', 'km/h', 'pace', 'higher', 13, 23,
   '[25.0,27.0,28.0,29.0,30.0,31.0,32.0,32.5,33.0,33.0,33.0]'::jsonb,
   '[2.5,2.5,2.0,2.0,2.0,1.8,1.5,1.5,1.5,1.5,1.5]'::jsonb),
  ('football', 'Flying 20m Sprint', 's', 'pace', 'lower', 13, 23,
   '[3.10,2.95,2.80,2.65,2.55,2.45,2.40,2.35,2.32,2.30,2.30]'::jsonb,
   '[0.20,0.18,0.16,0.15,0.12,0.12,0.10,0.10,0.10,0.10,0.10]'::jsonb),
  ('football', '40m Sprint', 's', 'pace', 'lower', 13, 23,
   '[6.50,6.20,5.90,5.60,5.35,5.20,5.10,5.05,5.02,5.00,5.00]'::jsonb,
   '[0.40,0.35,0.30,0.28,0.25,0.22,0.20,0.18,0.18,0.18,0.18]'::jsonb),
  ('football', 'Repeated Sprint Avg 6x30m', 's', 'pace', 'lower', 13, 23,
   '[5.30,5.10,4.90,4.70,4.55,4.45,4.40,4.35,4.32,4.30,4.30]'::jsonb,
   '[0.30,0.28,0.25,0.22,0.20,0.18,0.15,0.15,0.15,0.15,0.15]'::jsonb),

  -- SHO (Shooting) — 7 metrics
  ('football', 'Shot Power', 'km/h', 'shooting', 'higher', 13, 23,
   '[60,70,78,85,92,100,105,110,112,114,115]'::jsonb,
   '[8,8,8,8,7,7,6,6,6,6,6]'::jsonb),
  ('football', 'Max Kick Distance', 'm', 'shooting', 'higher', 13, 23,
   '[30,35,40,45,50,55,58,60,61,62,62]'::jsonb,
   '[5,5,5,5,5,4,4,4,4,4,4]'::jsonb),
  ('football', 'Non-Dominant Foot Speed', 'km/h', 'shooting', 'higher', 13, 23,
   '[42,50,56,62,68,75,80,85,87,88,88]'::jsonb,
   '[7,7,7,7,6,6,5,5,5,5,5]'::jsonb),
  ('football', 'Volley Kick Speed', 'km/h', 'shooting', 'higher', 13, 23,
   '[48,56,64,72,78,85,90,95,97,99,100]'::jsonb,
   '[7,7,7,7,6,6,5,5,5,5,5]'::jsonb),
  ('football', 'Shooting Drill Score', 'pts/10', 'shooting', 'higher', 13, 23,
   '[4.0,4.5,5.0,5.5,6.0,6.5,7.0,7.2,7.3,7.4,7.5]'::jsonb,
   '[1.2,1.2,1.1,1.1,1.0,1.0,0.9,0.9,0.9,0.9,0.9]'::jsonb),
  ('football', 'Free Kick Distance', 'm', 'shooting', 'higher', 13, 23,
   '[18,22,25,28,30,32,34,35,35.5,36,36]'::jsonb,
   '[4,4,4,3,3,3,3,3,3,3,3]'::jsonb),
  ('football', 'Shot Release Time', 's', 'shooting', 'lower', 13, 23,
   '[1.20,1.10,1.00,0.90,0.80,0.70,0.65,0.60,0.58,0.56,0.55]'::jsonb,
   '[0.15,0.14,0.12,0.11,0.10,0.08,0.07,0.07,0.07,0.07,0.07]'::jsonb),

  -- PAS (Passing) — 7 metrics
  ('football', 'Long Pass Distance', 'm', 'passing', 'higher', 13, 23,
   '[28,32,36,40,45,48,52,55,56,57,57]'::jsonb,
   '[5,5,5,5,4,4,4,4,4,4,4]'::jsonb),
  ('football', 'Pass Speed', 'km/h', 'passing', 'higher', 13, 23,
   '[50,58,64,70,76,82,88,92,93,94,95]'::jsonb,
   '[7,7,6,6,6,5,5,5,5,5,5]'::jsonb),
  ('football', 'Short Pass Drill Time', 's', 'passing', 'lower', 13, 23,
   '[38,35,32,30,28,26,25,24,23.5,23,23]'::jsonb,
   '[4.0,3.5,3.0,3.0,2.5,2.0,2.0,2.0,2.0,2.0,2.0]'::jsonb),
  ('football', 'Passing Accuracy Drill', 'pts/20', 'passing', 'higher', 13, 23,
   '[10,11,12,13,14,15,15.5,16,16.2,16.4,16.5]'::jsonb,
   '[2.0,2.0,2.0,2.0,1.5,1.5,1.5,1.5,1.5,1.5,1.5]'::jsonb),
  ('football', 'Cross Delivery Distance', 'm', 'passing', 'higher', 13, 23,
   '[22,26,30,34,38,42,45,48,49,50,50]'::jsonb,
   '[4,4,4,4,4,3,3,3,3,3,3]'::jsonb),
  ('football', 'Throw-In Distance', 'm', 'passing', 'higher', 13, 23,
   '[12,15,18,20,23,25,27,29,29.5,30,30]'::jsonb,
   '[3.0,3.0,3.0,3.0,2.5,2.5,2.5,2.0,2.0,2.0,2.0]'::jsonb),
  ('football', 'Lofted Pass Hang Time', 's', 'passing', 'higher', 13, 23,
   '[1.4,1.6,1.8,2.0,2.1,2.3,2.4,2.5,2.55,2.58,2.60]'::jsonb,
   '[0.30,0.30,0.25,0.25,0.20,0.20,0.20,0.20,0.20,0.20,0.20]'::jsonb),

  -- DRI (Dribbling / Agility) — 7 metrics
  ('football', 'T-Test Agility', 's', 'dribbling', 'lower', 13, 23,
   '[11.5,11.0,10.5,10.2,10.0,9.7,9.5,9.4,9.35,9.30,9.30]'::jsonb,
   '[0.8,0.7,0.6,0.5,0.5,0.4,0.4,0.3,0.3,0.3,0.3]'::jsonb),
  ('football', '5-0-5 COD', 's', 'dribbling', 'lower', 13, 23,
   '[2.80,2.65,2.50,2.40,2.30,2.25,2.22,2.20,2.19,2.18,2.18]'::jsonb,
   '[0.20,0.18,0.15,0.14,0.12,0.10,0.10,0.10,0.10,0.10,0.10]'::jsonb),
  ('football', 'Illinois Agility Run', 's', 'dribbling', 'lower', 13, 23,
   '[18.5,17.5,16.8,16.2,15.8,15.3,15.0,14.8,14.7,14.6,14.6]'::jsonb,
   '[1.2,1.0,0.9,0.8,0.7,0.6,0.5,0.5,0.5,0.5,0.5]'::jsonb),
  ('football', 'Slalom Dribble 10 Cones', 's', 'dribbling', 'lower', 13, 23,
   '[17.0,16.0,15.0,14.2,13.5,12.8,12.3,12.0,11.9,11.8,11.8]'::jsonb,
   '[1.5,1.3,1.2,1.0,0.9,0.8,0.7,0.7,0.7,0.7,0.7]'::jsonb),
  ('football', 'Ball Juggling Count', 'reps', 'dribbling', 'higher', 13, 23,
   '[20,35,50,70,85,100,110,120,125,128,130]'::jsonb,
   '[10,12,15,18,18,20,20,20,20,20,20]'::jsonb),
  ('football', 'Reaction Time', 'ms', 'dribbling', 'lower', 13, 23,
   '[280,260,245,230,220,210,205,200,198,196,195]'::jsonb,
   '[25,22,20,18,15,13,12,12,12,12,12]'::jsonb),
  ('football', 'Arrowhead Agility', 's', 'dribbling', 'lower', 13, 23,
   '[10.5,10.0,9.5,9.2,9.0,8.7,8.5,8.4,8.35,8.30,8.30]'::jsonb,
   '[0.7,0.6,0.5,0.5,0.4,0.4,0.3,0.3,0.3,0.3,0.3]'::jsonb),

  -- DEF (Defending) — 7 metrics
  ('football', 'Standing Vertical Jump', 'cm', 'defending', 'higher', 13, 23,
   '[25,28,32,35,38,40,41,42,42.5,43,43]'::jsonb,
   '[4,4,4,4,3.5,3,3,3,3,3,3]'::jsonb),
  ('football', 'Header Distance', 'm', 'defending', 'higher', 13, 23,
   '[5.0,6.0,7.0,8.0,9.0,10.0,11.0,12.0,12.5,13.0,13.0]'::jsonb,
   '[1.5,1.5,1.5,1.5,1.5,1.5,1.5,1.5,1.5,1.5,1.5]'::jsonb),
  ('football', 'Lateral Shuffle 5mx4', 's', 'defending', 'lower', 13, 23,
   '[7.2,6.8,6.4,6.1,5.8,5.6,5.4,5.3,5.25,5.20,5.20]'::jsonb,
   '[0.5,0.5,0.4,0.4,0.3,0.3,0.3,0.3,0.3,0.3,0.3]'::jsonb),
  ('football', 'Backward Sprint 10m', 's', 'defending', 'lower', 13, 23,
   '[4.00,3.80,3.50,3.30,3.20,3.10,3.00,2.90,2.88,2.86,2.85]'::jsonb,
   '[0.30,0.30,0.25,0.22,0.20,0.18,0.15,0.15,0.15,0.15,0.15]'::jsonb),
  ('football', 'Isometric Push Strength', 'kg', 'defending', 'higher', 13, 23,
   '[30,35,42,50,58,65,72,78,80,82,82]'::jsonb,
   '[5,5,6,7,7,7,7,7,7,7,7]'::jsonb),
  ('football', 'Grip Strength', 'kg', 'defending', 'higher', 13, 23,
   '[25,30,35,38,42,45,47,48,49,50,50]'::jsonb,
   '[4,4,4,4,4,4,3,3,3,3,3]'::jsonb),
  ('football', 'Recovery Run 40m', 's', 'defending', 'lower', 13, 23,
   '[8.0,7.6,7.2,6.9,6.7,6.5,6.4,6.3,6.25,6.20,6.20]'::jsonb,
   '[0.5,0.5,0.4,0.4,0.3,0.3,0.3,0.2,0.2,0.2,0.2]'::jsonb),

  -- PHY (Physicality) — 7 metrics
  ('football', 'CMJ Jump Height', 'cm', 'physicality', 'higher', 13, 23,
   '[22,26,30,34,37,40,42,43,43.5,44,44]'::jsonb,
   '[4,4,4,4,3.5,3,3,3,3,3,3]'::jsonb),
  ('football', 'Yo-Yo IR1 Distance', 'm', 'physicality', 'higher', 13, 23,
   '[800,1000,1200,1500,1800,2000,2200,2350,2400,2440,2450]'::jsonb,
   '[200,200,250,250,250,200,200,150,150,150,150]'::jsonb),
  ('football', 'VO2max', 'mL/kg/min', 'physicality', 'higher', 13, 23,
   '[46,48,50,52,54,56,58,59,59.5,60,60]'::jsonb,
   '[4,4,4,3.5,3,3,3,3,3,3,3]'::jsonb),
  ('football', 'Total Match Distance', 'm', 'physicality', 'higher', 13, 23,
   '[6500,7500,8200,9000,9500,10000,10500,11000,11200,11400,11500]'::jsonb,
   '[800,800,700,700,600,600,500,500,500,500,500]'::jsonb),
  ('football', 'HRV RMSSD', 'ms', 'physicality', 'higher', 13, 23,
   '[65,70,72,75,78,80,82,83,84,85,85]'::jsonb,
   '[15,15,15,15,15,15,15,15,15,15,15]'::jsonb),
  ('football', 'Sleep Duration', 'hours', 'physicality', 'higher', 13, 23,
   '[9.0,9.0,8.8,8.5,8.3,8.0,7.8,7.5,7.5,7.5,7.5]'::jsonb,
   '[1.0,1.0,1.0,0.8,0.8,0.7,0.7,0.7,0.7,0.7,0.7]'::jsonb),
  ('football', 'Relative Squat Strength', 'xBW', 'physicality', 'higher', 13, 23,
   '[0.80,0.90,1.00,1.10,1.20,1.40,1.50,1.60,1.65,1.68,1.70]'::jsonb,
   '[0.15,0.15,0.15,0.15,0.15,0.15,0.15,0.15,0.15,0.15,0.15]'::jsonb)
ON CONFLICT (sport_id, metric_name) DO NOTHING;

-- ═══ CONTENT ITEMS: PHONE TESTS ═══

INSERT INTO public.content_items (category, subcategory, sport_id, key, sort_order, content) VALUES
  ('phone_tests', 'reaction', NULL, 'reaction-tap', 1,
   '{"id":"reaction-tap","name":"Reaction Speed","shortName":"Reaction","icon":"hand-left-outline","color":"#FF6B35","category":"reaction","description":"Tap colored targets as fast as you can. Measures pure reaction time.","durationSeconds":30,"instructions":["Hold your phone in portrait mode","Colored circles will appear at random positions","Tap each circle as fast as possible","Complete 15 targets to finish the test"],"unit":"ms"}'::jsonb),
  ('phone_tests', 'explosive', NULL, 'jump-height', 2,
   '{"id":"jump-height","name":"Vertical Jump","shortName":"Jump","icon":"arrow-up-outline","color":"#7B61FF","category":"explosive","description":"Hold phone and jump. Accelerometer measures hang time to estimate jump height.","durationSeconds":20,"instructions":["Hold your phone firmly against your chest with both hands","Stand still for calibration (3 seconds)","Jump as high as you can when prompted","Land softly and hold still"],"unit":"cm"}'::jsonb),
  ('phone_tests', 'speed', NULL, 'sprint-speed', 3,
   '{"id":"sprint-speed","name":"Sprint Speed","shortName":"Sprint","icon":"speedometer-outline","color":"#00D9FF","category":"speed","description":"Hold phone and sprint. Detects start and stop from accelerometer data.","durationSeconds":15,"instructions":["Hold your phone in your non-dominant hand","Stand still at your starting line","Sprint forward on the GO signal","Press STOP when you finish your sprint"],"unit":"s"}'::jsonb),
  ('phone_tests', 'agility', NULL, 'agility-shuffle', 4,
   '{"id":"agility-shuffle","name":"Agility Shuffle","shortName":"Agility","icon":"swap-horizontal-outline","color":"#30D158","category":"agility","description":"Shuffle left and right following cues. Measures reaction and lateral speed.","durationSeconds":30,"instructions":["Hold phone in front of you at chest height","Stand in athletic stance, feet shoulder-width apart","Shuffle in the direction shown on screen","Return to center before the next cue"],"unit":"ms"}'::jsonb),
  ('phone_tests', 'balance', NULL, 'balance-stability', 5,
   '{"id":"balance-stability","name":"Balance Test","shortName":"Balance","icon":"body-outline","color":"#FFD60A","category":"balance","description":"Stand on one leg holding phone. Gyroscope measures how stable you remain.","durationSeconds":30,"instructions":["Hold phone at chest level with both hands","Stand on your dominant leg","Hold as still as possible for 30 seconds","The less you wobble, the higher your score"],"unit":"score"}'::jsonb);

-- ═══ CONTENT ITEMS: BLAZEPOD DRILLS ═══

INSERT INTO public.content_items (category, subcategory, sport_id, key, sort_order, content) VALUES
  ('blazepod_drills', '', NULL, 'reaction-box', 1,
   '{"id":"reaction-box","name":"30-Second Reaction Box","shortName":"Reaction Box","icon":"grid-outline","color":"#FF6B35","sets":3,"setDurationSec":30,"restBetweenSetsSec":30,"description":"Place 4 pods in a square. React and tap each pod as it lights up. Measures pure reaction speed.","setup":["Place 4 BlazePod pods in a 2x2 square, about 1.5m apart","Stand in the center of the square","Set pods to random light mode","Tap each pod as fast as possible when it lights up"],"metrics":["Total Touches","Best Reaction Time","Avg Reaction Time"]}'::jsonb),
  ('blazepod_drills', '', NULL, 'side-shuffle', 2,
   '{"id":"side-shuffle","name":"Side-to-Side Quick Shuffle","shortName":"Quick Shuffle","icon":"swap-horizontal-outline","color":"#7B61FF","sets":4,"setDurationSec":20,"restBetweenSetsSec":40,"description":"Two pods placed wide apart. Shuffle laterally and tap the lit pod. Tests lateral agility and footwork.","setup":["Place 2 pods about 3m apart at hip height","Stand centered between them in athletic stance","Shuffle (not crossover) to each pod when it lights","Return to center after each tap"],"metrics":["Total Touches","Best Reaction Time","Avg Reaction Time"]}'::jsonb),
  ('blazepod_drills', '', NULL, 'explosive-step', 3,
   '{"id":"explosive-step","name":"Explosive First Step","shortName":"First Step","icon":"flash-outline","color":"#00D9FF","sets":5,"setDurationSec":10,"restBetweenSetsSec":30,"description":"Single pod placed 3m away. Explode from a standing start and tap the pod. Measures first-step quickness.","setup":["Place 1 pod on the ground 3m in front of you","Start in a ready athletic stance","Sprint and tap the pod the moment it lights up","Walk back and reset for next rep"],"metrics":["Total Touches","Best Reaction Time","Avg Reaction Time"]}'::jsonb),
  ('blazepod_drills', '', NULL, 'reaction-ball', 4,
   '{"id":"reaction-ball","name":"Reaction + Ball Control","shortName":"Ball Control","icon":"football-outline","color":"#30D158","sets":3,"setDurationSec":30,"restBetweenSetsSec":45,"description":"Dribble a ball while reacting to pod lights around you. Combines ball control with cognitive load.","setup":["Place 3 pods in a triangle, about 2m apart","Stand in the center with a ball at your feet","Dribble to each pod when it lights and tap it","Keep the ball under control at all times"],"metrics":["Total Touches","Best Reaction Time","Avg Reaction Time"]}'::jsonb);

-- ═══ CONTENT ITEMS: QUOTES (5 categories) ═══

INSERT INTO public.content_items (category, subcategory, key, sort_order, content) VALUES
  -- High Energy
  ('quotes', 'high_energy', 'quote-he-1', 1, '{"text":"I''ve failed over and over and over again in my life. And that is why I succeed.","author":"Michael Jordan"}'::jsonb),
  ('quotes', 'high_energy', 'quote-he-2', 2, '{"text":"I hated every minute of training, but I said, don''t quit. Suffer now and live the rest of your life as a champion.","author":"Muhammad Ali"}'::jsonb),
  ('quotes', 'high_energy', 'quote-he-3', 3, '{"text":"The more difficult the victory, the greater the happiness in winning.","author":"Pele"}'::jsonb),
  ('quotes', 'high_energy', 'quote-he-4', 4, '{"text":"Everything negative — pressure, challenges — is all an opportunity for me to rise.","author":"Kobe Bryant"}'::jsonb),
  ('quotes', 'high_energy', 'quote-he-5', 5, '{"text":"There are better starters than me but I''m a strong finisher.","author":"Usain Bolt"}'::jsonb),
  ('quotes', 'high_energy', 'quote-he-6', 6, '{"text":"Talent without working hard is nothing.","author":"Cristiano Ronaldo"}'::jsonb),
  ('quotes', 'high_energy', 'quote-he-7', 7, '{"text":"I am building a fire, and every day I train, I add more fuel. At just the right moment, I light the match.","author":"Mia Hamm, 2x Olympic Gold Medalist"}'::jsonb),
  ('quotes', 'high_energy', 'quote-he-8', 8, '{"text":"You can''t put a limit on anything. The more you dream, the farther you get.","author":"Michael Phelps, 23x Olympic Gold Medalist"}'::jsonb),

  -- Recovery
  ('quotes', 'recovery', 'quote-rec-1', 1, '{"text":"I really think a champion is defined not by their wins but by how they can recover when they fall.","author":"Serena Williams"}'::jsonb),
  ('quotes', 'recovery', 'quote-rec-2', 2, '{"text":"The glory is not winning here or winning there. The glory is enjoying practicing, enjoy every day, enjoy to work hard.","author":"Rafael Nadal"}'::jsonb),
  ('quotes', 'recovery', 'quote-rec-3', 3, '{"text":"I can accept failure. Everyone fails at something. But I can''t accept not trying.","author":"Michael Jordan"}'::jsonb),
  ('quotes', 'recovery', 'quote-rec-4', 4, '{"text":"I''d rather regret the risks that didn''t work out than the chances I didn''t take at all.","author":"Simone Biles"}'::jsonb),
  ('quotes', 'recovery', 'quote-rec-5', 5, '{"text":"You can''t be afraid to fail. It''s the only way you succeed.","author":"LeBron James"}'::jsonb),
  ('quotes', 'recovery', 'quote-rec-6', 6, '{"text":"There is no way around the hard work. Embrace it.","author":"Roger Federer"}'::jsonb),

  -- Low Sleep
  ('quotes', 'low_sleep', 'quote-ls-1', 1, '{"text":"Sleep is the most important thing when it comes to recovery.","author":"LeBron James"}'::jsonb),
  ('quotes', 'low_sleep', 'quote-ls-2', 2, '{"text":"Sleep is extremely important to me. I need to rest and recover in order for the training I do to be absorbed by my body.","author":"Usain Bolt"}'::jsonb),
  ('quotes', 'low_sleep', 'quote-ls-3', 3, '{"text":"Fatigue makes cowards of us all.","author":"Vince Lombardi, NFL Legend"}'::jsonb),
  ('quotes', 'low_sleep', 'quote-ls-4', 4, '{"text":"Without enough rest, you can''t perform at your highest level. Take care of your body first.","author":"Roger Federer"}'::jsonb),
  ('quotes', 'low_sleep', 'quote-ls-5', 5, '{"text":"The fight is won or lost far away from witnesses — behind the lines, in the gym, and out there on the road.","author":"Muhammad Ali"}'::jsonb),

  -- Streak
  ('quotes', 'streak', 'quote-str-1', 1, '{"text":"Rest at the end, not in the middle.","author":"Kobe Bryant"}'::jsonb),
  ('quotes', 'streak', 'quote-str-2', 2, '{"text":"Success is no accident. It is hard work, perseverance, learning, studying, and sacrifice.","author":"Pele"}'::jsonb),
  ('quotes', 'streak', 'quote-str-3', 3, '{"text":"There will be obstacles. There will be doubters. There will be mistakes. But with hard work, there are no limits.","author":"Michael Phelps, 23x Olympic Gold Medalist"}'::jsonb),
  ('quotes', 'streak', 'quote-str-4', 4, '{"text":"You have to believe in the long-term plan.","author":"Novak Djokovic"}'::jsonb),
  ('quotes', 'streak', 'quote-str-5', 5, '{"text":"Talent wins games, but teamwork and intelligence win championships.","author":"Michael Jordan"}'::jsonb),

  -- General
  ('quotes', 'general', 'quote-gen-1', 1, '{"text":"You miss 100% of the shots you don''t take.","author":"Wayne Gretzky"}'::jsonb),
  ('quotes', 'general', 'quote-gen-2', 2, '{"text":"He who is not courageous enough to take risks will accomplish nothing in life.","author":"Muhammad Ali"}'::jsonb),
  ('quotes', 'general', 'quote-gen-3', 3, '{"text":"I don''t like to lose — at anything — yet I''ve grown most not from victories, but setbacks.","author":"Serena Williams"}'::jsonb),
  ('quotes', 'general', 'quote-gen-4', 4, '{"text":"Everything is practice.","author":"Pele"}'::jsonb),
  ('quotes', 'general', 'quote-gen-5', 5, '{"text":"You have to expect things of yourself before you can do them.","author":"Michael Jordan"}'::jsonb),
  ('quotes', 'general', 'quote-gen-6', 6, '{"text":"Hard days are the best because that''s when champions are made.","author":"Gabby Douglas, Olympic Gold Medalist"}'::jsonb),
  ('quotes', 'general', 'quote-gen-7', 7, '{"text":"I like criticism. It makes you strong.","author":"LeBron James"}'::jsonb);

-- ═══ CONTENT ITEMS: PADEL PRO MILESTONES ═══

INSERT INTO public.content_items (category, subcategory, sport_id, key, sort_order, content) VALUES
  ('pro_milestones', 'men', 'padel', 'milestone-m-1', 1,  '{"rating":950,"name":"Arturo Coello","reason":"WPT #1, youngest ever #1","gender":"men"}'::jsonb),
  ('pro_milestones', 'men', 'padel', 'milestone-m-2', 2,  '{"rating":940,"name":"Agustin Tapia","reason":"WPT #2, explosive power player","gender":"men"}'::jsonb),
  ('pro_milestones', 'men', 'padel', 'milestone-m-3', 3,  '{"rating":930,"name":"Ale Galan","reason":"Former #1, all-round excellence","gender":"men"}'::jsonb),
  ('pro_milestones', 'men', 'padel', 'milestone-m-4', 4,  '{"rating":920,"name":"Juan Lebron","reason":"Explosive left-sider, multiple #1","gender":"men"}'::jsonb),
  ('pro_milestones', 'men', 'padel', 'milestone-m-5', 5,  '{"rating":910,"name":"Franco Stupaczuk","reason":"Legendary smash power","gender":"men"}'::jsonb),
  ('pro_milestones', 'men', 'padel', 'milestone-m-6', 6,  '{"rating":900,"name":"Paquito Navarro","reason":"Creative genius, vibora master","gender":"men"}'::jsonb),
  ('pro_milestones', 'men', 'padel', 'milestone-m-7', 7,  '{"rating":850,"name":"Coki Nieto","reason":"Top 10 consistency","gender":"men"}'::jsonb),
  ('pro_milestones', 'men', 'padel', 'milestone-m-8', 8,  '{"rating":800,"name":"Mike Yanguas","reason":"Top 20 touring pro","gender":"men"}'::jsonb),
  ('pro_milestones', 'men', 'padel', 'milestone-m-9', 9,  '{"rating":750,"name":"Federico Chingotto","reason":"Defensive wall, Top 15","gender":"men"}'::jsonb),
  ('pro_milestones', 'men', 'padel', 'milestone-m-10', 10, '{"rating":700,"name":"National Circuit Pro","reason":"Competing on national tour","gender":"men"}'::jsonb),
  ('pro_milestones', 'men', 'padel', 'milestone-m-11', 11, '{"rating":600,"name":"Regional Champion","reason":"Dominating regional competitions","gender":"men"}'::jsonb),

  ('pro_milestones', 'women', 'padel', 'milestone-w-1', 1,  '{"rating":950,"name":"Ari Sanchez","reason":"WPT #1, dominant force","gender":"women"}'::jsonb),
  ('pro_milestones', 'women', 'padel', 'milestone-w-2', 2,  '{"rating":940,"name":"Paula Josemaria","reason":"WPT #2, power and precision","gender":"women"}'::jsonb),
  ('pro_milestones', 'women', 'padel', 'milestone-w-3', 3,  '{"rating":930,"name":"Gemma Triay","reason":"Former #1, tactical genius","gender":"women"}'::jsonb),
  ('pro_milestones', 'women', 'padel', 'milestone-w-4', 4,  '{"rating":920,"name":"Alejandra Salazar","reason":"Legend, multiple #1","gender":"women"}'::jsonb),
  ('pro_milestones', 'women', 'padel', 'milestone-w-5', 5,  '{"rating":910,"name":"Marta Marrero","reason":"16 WPT titles","gender":"women"}'::jsonb),
  ('pro_milestones', 'women', 'padel', 'milestone-w-6', 6,  '{"rating":900,"name":"Delfi Brea","reason":"Rising star, explosive style","gender":"women"}'::jsonb),
  ('pro_milestones', 'women', 'padel', 'milestone-w-7', 7,  '{"rating":850,"name":"Bea Gonzalez","reason":"Top 10 consistency","gender":"women"}'::jsonb),
  ('pro_milestones', 'women', 'padel', 'milestone-w-8', 8,  '{"rating":800,"name":"Marta Ortega","reason":"Top 15 touring pro","gender":"women"}'::jsonb),
  ('pro_milestones', 'women', 'padel', 'milestone-w-9', 9,  '{"rating":750,"name":"Lucia Sainz","reason":"Defensive specialist","gender":"women"}'::jsonb),
  ('pro_milestones', 'women', 'padel', 'milestone-w-10', 10, '{"rating":700,"name":"National Circuit Pro","reason":"Competing on national tour","gender":"women"}'::jsonb),
  ('pro_milestones', 'women', 'padel', 'milestone-w-11', 11, '{"rating":600,"name":"Regional Champion","reason":"Dominating regional competitions","gender":"women"}'::jsonb);

-- ═══ CONTENT ITEMS: ONBOARDING OPTIONS ═══

INSERT INTO public.content_items (category, subcategory, key, sort_order, content) VALUES
  -- Sport options
  ('onboarding', 'sport_options', 'sport-football', 1, '{"key":"football","label":"Football","icon":"football-outline","color":"#FF6B35"}'::jsonb),
  ('onboarding', 'sport_options', 'sport-padel', 2, '{"key":"padel","label":"Padel","icon":"tennisball-outline","color":"#00D9FF"}'::jsonb),

  -- Football positions
  ('onboarding', 'football_positions', 'pos-gk', 1, '{"value":"GK","label":"Goalkeeper"}'::jsonb),
  ('onboarding', 'football_positions', 'pos-cb', 2, '{"value":"CB","label":"Centre Back"}'::jsonb),
  ('onboarding', 'football_positions', 'pos-fb', 3, '{"value":"FB","label":"Full Back"}'::jsonb),
  ('onboarding', 'football_positions', 'pos-cm', 4, '{"value":"CM","label":"Centre Mid"}'::jsonb),
  ('onboarding', 'football_positions', 'pos-wm', 5, '{"value":"WM","label":"Wide Mid / Winger"}'::jsonb),
  ('onboarding', 'football_positions', 'pos-st', 6, '{"value":"ST","label":"Striker"}'::jsonb),

  -- Experience levels
  ('onboarding', 'experience_levels', 'exp-beginner', 1, '{"value":"beginner","label":"Just starting","desc":"Less than 1 year"}'::jsonb),
  ('onboarding', 'experience_levels', 'exp-intermediate', 2, '{"value":"intermediate","label":"1–2 years","desc":"Learning the game"}'::jsonb),
  ('onboarding', 'experience_levels', 'exp-advanced', 3, '{"value":"advanced","label":"3–5 years","desc":"Solid foundation"}'::jsonb),
  ('onboarding', 'experience_levels', 'exp-elite', 4, '{"value":"elite","label":"5+ years","desc":"Experienced player"}'::jsonb),

  -- Competition levels
  ('onboarding', 'competition_levels', 'comp-recreational', 1, '{"value":"recreational","label":"Recreational","icon":"people-outline"}'::jsonb),
  ('onboarding', 'competition_levels', 'comp-club', 2, '{"value":"club","label":"Club","icon":"shield-outline"}'::jsonb),
  ('onboarding', 'competition_levels', 'comp-academy', 3, '{"value":"academy","label":"Academy","icon":"school-outline"}'::jsonb),
  ('onboarding', 'competition_levels', 'comp-professional', 4, '{"value":"professional","label":"Professional","icon":"trophy-outline"}'::jsonb),

  -- Self-assessment attributes
  ('onboarding', 'self_assessment_attrs', 'sa-pace', 1, '{"key":"pace","label":"Pace","icon":"flash-outline"}'::jsonb),
  ('onboarding', 'self_assessment_attrs', 'sa-shooting', 2, '{"key":"shooting","label":"Shooting","icon":"football-outline"}'::jsonb),
  ('onboarding', 'self_assessment_attrs', 'sa-passing', 3, '{"key":"passing","label":"Passing","icon":"swap-horizontal-outline"}'::jsonb),
  ('onboarding', 'self_assessment_attrs', 'sa-dribbling', 4, '{"key":"dribbling","label":"Dribbling","icon":"walk-outline"}'::jsonb),
  ('onboarding', 'self_assessment_attrs', 'sa-defending', 5, '{"key":"defending","label":"Defending","icon":"shield-outline"}'::jsonb),
  ('onboarding', 'self_assessment_attrs', 'sa-physicality', 6, '{"key":"physicality","label":"Physicality","icon":"barbell-outline"}'::jsonb),

  -- Genders
  ('onboarding', 'genders', 'gender-male', 1, '{"value":"male","label":"Male"}'::jsonb),
  ('onboarding', 'genders', 'gender-female', 2, '{"value":"female","label":"Female"}'::jsonb),
  ('onboarding', 'genders', 'gender-other', 3, '{"value":"other","label":"Other"}'::jsonb),
  ('onboarding', 'genders', 'gender-prefer-not', 4, '{"value":"prefer_not_to_say","label":"Prefer not to say"}'::jsonb),

  -- Season phases
  ('onboarding', 'season_phases', 'season-pre', 1, '{"value":"pre_season","label":"Pre-Season","icon":"fitness-outline"}'::jsonb),
  ('onboarding', 'season_phases', 'season-in', 2, '{"value":"in_season","label":"In-Season","icon":"trophy-outline"}'::jsonb),
  ('onboarding', 'season_phases', 'season-off', 3, '{"value":"off_season","label":"Off-Season","icon":"bed-outline"}'::jsonb),

  -- Goals
  ('onboarding', 'goals', 'goal-fitness', 1, '{"value":"improve_fitness","label":"Improve fitness","icon":"trending-up-outline"}'::jsonb),
  ('onboarding', 'goals', 'goal-recruited', 2, '{"value":"get_recruited","label":"Get recruited","icon":"star-outline"}'::jsonb),
  ('onboarding', 'goals', 'goal-injury', 3, '{"value":"recover_from_injury","label":"Recover from injury","icon":"medkit-outline"}'::jsonb),
  ('onboarding', 'goals', 'goal-consistent', 4, '{"value":"stay_consistent","label":"Stay consistent","icon":"checkmark-circle-outline"}'::jsonb),
  ('onboarding', 'goals', 'goal-fun', 5, '{"value":"have_fun","label":"Have fun","icon":"happy-outline"}'::jsonb),

  -- Archetypes
  ('onboarding', 'archetypes', 'arch-phoenix', 1, '{"value":"phoenix","emoji":"🔥","name":"Phoenix","color":"#FF6B6B","desc":"Fast recovery, fast fatigue. Thrives on high intensity blocks."}'::jsonb),
  ('onboarding', 'archetypes', 'arch-titan', 2, '{"value":"titan","emoji":"⚡","name":"Titan","color":"#4C6EF5","desc":"Slow recovery, high volume tolerance. Steady accumulation."}'::jsonb),
  ('onboarding', 'archetypes', 'arch-blade', 3, '{"value":"blade","emoji":"🗡️","name":"Blade","color":"#12B886","desc":"Very slow recovery, extremely high quality when fresh."}'::jsonb),
  ('onboarding', 'archetypes', 'arch-surge', 4, '{"value":"surge","emoji":"🌊","name":"Surge","color":"#FFD43B","desc":"Variable recovery, thrives on variety and pressure."}'::jsonb),

  -- Pain areas (for injury history)
  ('onboarding', 'pain_areas', 'pain-head', 1, '{"area":"Head / Neck"}'::jsonb),
  ('onboarding', 'pain_areas', 'pain-shoulder', 2, '{"area":"Shoulder"}'::jsonb),
  ('onboarding', 'pain_areas', 'pain-upper-back', 3, '{"area":"Upper Back"}'::jsonb),
  ('onboarding', 'pain_areas', 'pain-lower-back', 4, '{"area":"Lower Back"}'::jsonb),
  ('onboarding', 'pain_areas', 'pain-elbow', 5, '{"area":"Elbow / Forearm"}'::jsonb),
  ('onboarding', 'pain_areas', 'pain-wrist', 6, '{"area":"Wrist / Hand"}'::jsonb),
  ('onboarding', 'pain_areas', 'pain-hip', 7, '{"area":"Hip / Groin"}'::jsonb),
  ('onboarding', 'pain_areas', 'pain-thigh', 8, '{"area":"Thigh / Hamstring"}'::jsonb),
  ('onboarding', 'pain_areas', 'pain-knee', 9, '{"area":"Knee"}'::jsonb),
  ('onboarding', 'pain_areas', 'pain-shin', 10, '{"area":"Shin / Calf"}'::jsonb),
  ('onboarding', 'pain_areas', 'pain-ankle', 11, '{"area":"Ankle"}'::jsonb),
  ('onboarding', 'pain_areas', 'pain-foot', 12, '{"area":"Foot"}'::jsonb);

-- ═══ CONTENT ITEMS: PADEL TIER COLORS ═══

INSERT INTO public.content_items (category, subcategory, sport_id, key, sort_order, content) VALUES
  ('tier_colors', '', 'padel', 'tier-bronze', 1, '{"tier":"bronze","gradient":["#CD7F32","#8B5E3C"],"border":"#CD7F32","text":"#FFF8F0"}'::jsonb),
  ('tier_colors', '', 'padel', 'tier-silver', 2, '{"tier":"silver","gradient":["#C0C0C0","#808080"],"border":"#C0C0C0","text":"#FFFFFF"}'::jsonb),
  ('tier_colors', '', 'padel', 'tier-gold', 3, '{"tier":"gold","gradient":["#FF6B35","#00B4D8"],"border":"#FF6B35","text":"#FFFFFF"}'::jsonb),
  ('tier_colors', '', 'padel', 'tier-diamond', 4, '{"tier":"diamond","gradient":["#6366F1","#8B5CF6"],"border":"#A78BFA","text":"#FFFFFF"}'::jsonb);

-- ═══ CONTENT ITEMS: DNA ATTRIBUTE COLORS ═══

INSERT INTO public.content_items (category, subcategory, sport_id, key, sort_order, content) VALUES
  ('dna_attribute_colors', '', 'padel', 'dna-power', 1, '{"attribute":"power","color":"#FF6B35"}'::jsonb),
  ('dna_attribute_colors', '', 'padel', 'dna-reflexes', 2, '{"attribute":"reflexes","color":"#FFD60A"}'::jsonb),
  ('dna_attribute_colors', '', 'padel', 'dna-control', 3, '{"attribute":"control","color":"#30D158"}'::jsonb),
  ('dna_attribute_colors', '', 'padel', 'dna-stamina', 4, '{"attribute":"stamina","color":"#00D9FF"}'::jsonb),
  ('dna_attribute_colors', '', 'padel', 'dna-agility', 5, '{"attribute":"agility","color":"#FF9500"}'::jsonb),
  ('dna_attribute_colors', '', 'padel', 'dna-tactics', 6, '{"attribute":"tactics","color":"#5856D6"}'::jsonb);
