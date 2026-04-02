-- ═══════════════════════════════════════════════════════════════════
--  Notification Center — Rich, actionable, context-aware notifications
--  Tables: athlete_notifications, athlete_notification_preferences,
--          player_push_tokens, notification_dismissal_log
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
--  1. athlete_notifications — action queue, not a message log
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.athlete_notifications (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  athlete_id          uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Classification
  type                text NOT NULL,
  category            text NOT NULL CHECK (category IN (
    'critical', 'training', 'coaching', 'academic', 'triangle', 'cv', 'system'
  )),
  priority            smallint DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  group_key           text,

  -- Content (pre-interpolated at creation time)
  title               text NOT NULL,
  body                text NOT NULL,
  chips               jsonb DEFAULT '[]',
  primary_action      jsonb,
  secondary_action    jsonb,

  -- Source reference
  source_ref_type     text,
  source_ref_id       uuid,

  -- Lifecycle
  status              text DEFAULT 'unread' CHECK (status IN (
    'unread', 'read', 'acted', 'dismissed', 'expired'
  )),

  -- Push
  push_sent           boolean DEFAULT false,
  push_sent_at        timestamptz,
  push_queued         boolean DEFAULT false,

  -- Timestamps
  expires_at          timestamptz,
  resolved_at         timestamptz,
  read_at             timestamptz,
  acted_at            timestamptz,
  dismissed_at        timestamptz,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- Primary query: athlete's active notifications
CREATE INDEX idx_athlete_notif_status
  ON public.athlete_notifications (athlete_id, status, created_at DESC);

-- Category filter
CREATE INDEX idx_athlete_notif_category
  ON public.athlete_notifications (athlete_id, category, status);

-- Group key lookup
CREATE INDEX idx_athlete_notif_group_key
  ON public.athlete_notifications (athlete_id, group_key)
  WHERE group_key IS NOT NULL;

-- Expiry sweep (pg_cron)
CREATE INDEX idx_athlete_notif_expiry
  ON public.athlete_notifications (expires_at)
  WHERE status NOT IN ('expired', 'dismissed', 'acted');

-- Dedup: only one active notification per group_key per athlete
CREATE UNIQUE INDEX idx_athlete_notif_group_dedup
  ON public.athlete_notifications (athlete_id, group_key)
  WHERE group_key IS NOT NULL
  AND status IN ('unread', 'read');

-- RLS
ALTER TABLE public.athlete_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Athletes see own notifications"
  ON public.athlete_notifications FOR SELECT
  USING (athlete_id = auth.uid());

CREATE POLICY "Athletes update own notifications"
  ON public.athlete_notifications FOR UPDATE
  USING (athlete_id = auth.uid());

-- System inserts via admin client

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.athlete_notifications;

-- ───────────────────────────────────────────────────────────────────
--  2. athlete_notification_preferences
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.athlete_notification_preferences (
  athlete_id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  quiet_hours_start   time DEFAULT '23:00',
  quiet_hours_end     time DEFAULT '07:00',
  push_critical       boolean DEFAULT true,
  push_training       boolean DEFAULT true,
  push_coaching       boolean DEFAULT true,
  push_academic       boolean DEFAULT true,
  push_triangle       boolean DEFAULT true,
  push_cv             boolean DEFAULT false,
  push_system         boolean DEFAULT false,
  max_push_per_day    smallint DEFAULT 5 CHECK (max_push_per_day BETWEEN 1 AND 10),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE public.athlete_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Athletes see own preferences"
  ON public.athlete_notification_preferences FOR SELECT
  USING (athlete_id = auth.uid());

CREATE POLICY "Athletes update own preferences"
  ON public.athlete_notification_preferences FOR UPDATE
  USING (athlete_id = auth.uid());

CREATE POLICY "Athletes insert own preferences"
  ON public.athlete_notification_preferences FOR INSERT
  WITH CHECK (athlete_id = auth.uid());

-- ───────────────────────────────────────────────────────────────────
--  3. player_push_tokens — referenced in code but never migrated
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.player_push_tokens (
  user_id             uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  expo_push_token     text NOT NULL,
  platform            text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE public.player_push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own push token"
  ON public.player_push_tokens FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users upsert own push token"
  ON public.player_push_tokens FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own push token"
  ON public.player_push_tokens FOR UPDATE
  USING (user_id = auth.uid());

-- ───────────────────────────────────────────────────────────────────
--  4. notification_dismissal_log — fatigue guard tracking
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notification_dismissal_log (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  athlete_id          uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  notification_type   text NOT NULL,
  dismissed_at        timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_dismissal_log_fatigue
  ON public.notification_dismissal_log (athlete_id, notification_type, dismissed_at DESC);

ALTER TABLE public.notification_dismissal_log ENABLE ROW LEVEL SECURITY;

-- System inserts only (via admin client on dismiss action)
CREATE POLICY "Athletes see own dismissal log"
  ON public.notification_dismissal_log FOR SELECT
  USING (athlete_id = auth.uid());

-- ───────────────────────────────────────────────────────────────────
--  5. Data migration from legacy notifications table
-- ───────────────────────────────────────────────────────────────────

-- Migrate existing notifications to athlete_notifications with system category
INSERT INTO public.athlete_notifications (
  athlete_id, type, category, priority, title, body, status, created_at
)
SELECT
  user_id,
  type,
  'system',
  3,
  title,
  COALESCE(body, ''),
  CASE WHEN read THEN 'read' ELSE 'unread' END,
  created_at
FROM public.notifications
WHERE user_id IS NOT NULL
ON CONFLICT DO NOTHING;
