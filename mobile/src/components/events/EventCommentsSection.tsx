/**
 * EventCommentsSection — Coach comments on a calendar event.
 *
 * Used by the player's EventEditScreen (to display comments) and the coach's
 * CoachEventCommentsScreen (to post comments). Role-aware — a coach sees an
 * input; the player sees read-only comments unless `allowPost` is true.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
} from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { Loader } from '../Loader';
import { spacing, borderRadius, fontFamily } from '../../theme';
import {
  listEventComments,
  postEventComment,
  type EventComment,
} from '../../services/api';

interface Props {
  eventId: string;
  allowPost: boolean;
  title?: string;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function EventCommentsSection({ eventId, allowPost, title = 'Coach comments' }: Props) {
  const { colors } = useTheme();
  const [comments, setComments] = useState<EventComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listEventComments(eventId);
      setComments(res.comments || []);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load comments');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  const onPost = useCallback(async () => {
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    try {
      const res = await postEventComment(eventId, body);
      setComments((prev) => [...prev, res.comment]);
      setDraft('');
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to post comment');
    } finally {
      setPosting(false);
    }
  }, [draft, eventId]);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.header, { color: colors.textMuted }]}>{title.toUpperCase()}</Text>

      {loading ? (
        <Loader style={{ marginVertical: spacing.sm }} />
      ) : comments.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textMuted }]}>
          {allowPost ? 'No comments yet — add the first one below.' : 'No coach comments yet.'}
        </Text>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {comments.map((c) => (
            <View
              key={c.id}
              style={[styles.bubble, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
            >
              <View style={styles.bubbleHeader}>
                <Text style={[styles.author, { color: colors.textOnDark }]} numberOfLines={1}>
                  {c.authorName || (c.authorRole === 'coach' ? 'Coach' : c.authorRole === 'parent' ? 'Parent' : 'You')}
                </Text>
                <Text style={[styles.when, { color: colors.textMuted }]}>{formatWhen(c.createdAt)}</Text>
              </View>
              <Text style={[styles.body, { color: colors.textOnDark }]}>{c.body}</Text>
            </View>
          ))}
        </View>
      )}

      {error && (
        <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
      )}

      {allowPost && (
        <View style={[styles.inputWrap, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Leave a note for this session…"
            placeholderTextColor={colors.textMuted}
            multiline
            style={[styles.input, { color: colors.textOnDark }]}
            editable={!posting}
            maxLength={2000}
          />
          <Pressable
            onPress={onPost}
            disabled={posting || !draft.trim()}
            style={[
              styles.postBtn,
              { backgroundColor: colors.accent1, opacity: posting || !draft.trim() ? 0.4 : 1 },
            ]}
          >
            <Text style={[styles.postBtnText, { color: colors.textPrimary }]}>
              {posting ? 'Posting…' : 'Post'}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  header: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  empty: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    fontStyle: 'italic',
  },
  bubble: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.sm,
  },
  bubbleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  author: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    flex: 1,
  },
  when: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  error: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    marginTop: 4,
  },
  inputWrap: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  input: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    minHeight: 60,
    maxHeight: 160,
    textAlignVertical: 'top',
  },
  postBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
  },
  postBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
  },
});
