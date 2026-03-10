-- Seed: test athlete + sample check-in
-- Note: In local dev, create a user via Supabase Auth first,
-- then insert the profile row here using that user's UUID.

-- Example (replace UUID with an actual auth user's id):
-- insert into public.users (id, email, name, sport, onboarding_complete)
-- values ('00000000-0000-0000-0000-000000000001', 'test@tomo.app', 'Test Athlete', 'soccer', true);

-- Sample exercises for the exercise library
insert into public.exercises (name, sport, muscle_groups, difficulty, coaching_cues) values
  ('Bodyweight Squats', null, '{quadriceps,glutes,hamstrings}', 'beginner', '{Keep chest up,Knees over toes,Full depth}'),
  ('Push-ups', null, '{chest,triceps,shoulders}', 'beginner', '{Hands shoulder width,Straight body line,Full range}'),
  ('Plank', null, '{core,shoulders}', 'beginner', '{Flat back,Engage core,Breathe steadily}'),
  ('Box Jumps', null, '{quadriceps,glutes,calves}', 'intermediate', '{Soft landing,Full hip extension,Step down}'),
  ('Nordic Curls', null, '{hamstrings}', 'advanced', '{Slow descent,Control the negative,Catch yourself}');

-- Sample knowledge base entries
insert into public.knowledge_base (category, title, content) values
  ('recovery', 'Sleep Importance', 'Sleep is the single most important recovery tool. Athletes should aim for 8-10 hours per night. Growth hormone is primarily released during deep sleep.'),
  ('nutrition', 'Post-Workout Nutrition', 'Consume protein and carbohydrates within 30-60 minutes after training. A ratio of 3:1 carbs to protein supports glycogen replenishment and muscle repair.'),
  ('training', 'Progressive Overload', 'Gradually increase training stimulus over time through volume, intensity, or complexity. Avoid increasing total load by more than 10% per week to reduce injury risk.');
