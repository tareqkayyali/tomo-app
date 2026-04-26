-- =========================================================================
-- Migration 093: event_comment_views (per-user last-seen-at for event comments)
-- =========================================================================
-- Tracks when each user (athlete, coach, parent) last opened the comments
-- section of a given calendar event. Drives the "unread comment" red dot on
-- the timeline — unread = any event_comments.created_at > last_viewed_at
-- (or no row at all, meaning never opened).
--
-- Idempotent. Safe to re-run.
-- =========================================================================

CREATE TABLE IF NOT EXISTS event_comment_views (
  event_id UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_comment_views_user_id
  ON event_comment_views(user_id, last_viewed_at DESC);

ALTER TABLE event_comment_views ENABLE ROW LEVEL SECURITY;

-- Each user can read + upsert their own view rows only.
DROP POLICY IF EXISTS event_comment_views_self_read ON event_comment_views;
CREATE POLICY event_comment_views_self_read ON event_comment_views
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS event_comment_views_self_write ON event_comment_views;
CREATE POLICY event_comment_views_self_write ON event_comment_views
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
