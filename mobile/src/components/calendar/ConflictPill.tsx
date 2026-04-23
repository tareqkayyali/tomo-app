/**
 * ConflictPill — "Ask Tomo" mediation entry point.
 *
 * Renders on a calendar event block when detectConflict() has flagged
 * coach/parent disagreement. Tapping the pill:
 *   1. Calls POST /api/v1/chat/sessions/seed to create a pinned
 *      mediation session.
 *   2. Navigates to the chat screen with the returned session_id.
 *
 * Per P3 plan: "Confused? I've pulled the facts for this session — ask
 * me anything." The pill is the only surface — no separate modal.
 *
 * Fail-closed UX: API errors surface a tappable retry. A 409 NO_CONFLICT
 * response hides the pill silently (the annotation set changed between
 * render and tap, so there's nothing to mediate anymore).
 */

import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, Alert } from 'react-native';
import { spacing, borderRadius, fontFamily } from '../../theme';
import { SmartIcon } from '../SmartIcon';
import { Loader } from '../Loader';
import { apiRequest } from '../../services/api';

interface Props {
  eventId: string;
  axis?: 'intent' | 'timing' | 'load' | 'explicit' | 'unknown';
  onSessionCreated: (sessionId: string) => void;
  onHide?: () => void;
}

export function ConflictPill({ eventId, axis, onSessionCreated, onHide }: Props) {
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const handlePress = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setLastError(null);
    try {
      const res = await apiRequest<{
        session_id: string;
        seed_kind: string;
        initial_assistant_message: string;
        ok: boolean;
      }>('/api/v1/chat/sessions/seed', {
        method: 'POST',
        body: JSON.stringify({ kind: 'conflict_mediation', event_id: eventId }),
      });

      if (res?.session_id) {
        onSessionCreated(res.session_id);
        setLastError(null);
      } else {
        setLastError('Could not open mediation');
      }
    } catch (err) {
      // Typed error propagation: apiFetch throws on non-2xx. NO_CONFLICT
      // means the backend re-ran detection and found nothing — hide the
      // pill silently.
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('NO_CONFLICT') || message.includes('409')) {
        onHide?.();
        return;
      }
      setLastError('Could not open mediation');
      // On mobile surface a toast; on web a simple alert. Stays quiet
      // if the screen already has its own error surface.
      if (Platform.OS !== 'web') {
        Alert.alert('Ask Tomo', 'Could not open mediation. Try again in a moment.');
      }
    } finally {
      setLoading(false);
    }
  }, [eventId, loading, onSessionCreated, onHide]);

  const axisLabel = axis && axis !== 'unknown' ? axis.toUpperCase() : 'CONFLICT';

  return (
    <Pressable
      onPress={handlePress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel={`Ask Tomo to help with this ${axisLabel.toLowerCase()}`}
      style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
    >
      <View style={styles.dot} />
      {loading ? (
        <Loader size="sm" />
      ) : (
        <>
          <SmartIcon name="message-circle" size={14} color="#fff" />
          <Text style={styles.label} numberOfLines={1}>
            {lastError ? 'Retry — Ask Tomo' : 'Confused? Ask Tomo'}
          </Text>
          <View style={styles.axisBadge}>
            <Text style={styles.axisText}>{axisLabel}</Text>
          </View>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#7B5AE0',
    paddingHorizontal: spacing.sm ?? 8,
    paddingVertical: 6,
    borderRadius: borderRadius.full ?? 999,
    gap: 6,
    marginTop: spacing.xs ?? 4,
  },
  pillPressed: {
    opacity: 0.85,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  label: {
    color: '#fff',
    fontFamily: fontFamily?.medium,
    fontSize: 13,
    fontWeight: '600',
  },
  axisBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  axisText: {
    color: '#fff',
    fontFamily: fontFamily?.medium,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
