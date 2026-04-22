-- =========================================================================
-- Migration 091: event_comments (coach comments on calendar events)
-- =========================================================================
-- Lets a coach leave a comment on a player's calendar_event. Comments are
-- visible to the event owner (athlete) and to any guardian (coach / parent)
-- currently linked to that athlete. Author can edit their own comment.
--
-- Idempotent. Safe to re-run.
-- =========================================================================

CREATE TABLE IF NOT EXISTS event_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_role TEXT NOT NULL CHECK (author_role IN ('coach', 'parent', 'player')),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_comments_event_id
  ON event_comments(event_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_comments_author_id
  ON event_comments(author_id);

ALTER TABLE event_comments ENABLE ROW LEVEL SECURITY;

-- Owner (athlete) can read all comments on their events.
DROP POLICY IF EXISTS event_comments_owner_read ON event_comments;
CREATE POLICY event_comments_owner_read ON event_comments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM calendar_events ce
      WHERE ce.id = event_comments.event_id
        AND ce.user_id = auth.uid()
    )
  );

-- Author can read their own comments.
DROP POLICY IF EXISTS event_comments_author_read ON event_comments;
CREATE POLICY event_comments_author_read ON event_comments
  FOR SELECT
  USING (author_id = auth.uid());

-- Linked guardian (coach/parent with accepted relationship) can read.
DROP POLICY IF EXISTS event_comments_guardian_read ON event_comments;
CREATE POLICY event_comments_guardian_read ON event_comments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM calendar_events ce
      JOIN relationships r ON r.player_id = ce.user_id
      WHERE ce.id = event_comments.event_id
        AND r.guardian_id = auth.uid()
        AND r.status = 'accepted'
    )
  );

-- Author can write (insert/update/delete) their own comments.
DROP POLICY IF EXISTS event_comments_author_write ON event_comments;
CREATE POLICY event_comments_author_write ON event_comments
  FOR ALL
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());
