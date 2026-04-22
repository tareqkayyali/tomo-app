/**
 * CoachEventCommentsScreen — Coach view of a single event with comments.
 *
 * Opens when a coach taps an event on the player's timeline. Shows the event
 * as a read-only card and hosts the EventCommentsSection so the coach can
 * leave notes the player will see on their own EventEdit screen.
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PlayerScreen } from '../../components/tomo-ui/playerDesign';
import { EventCommentsSection } from '../../components/events/EventCommentsSection';
import { useTheme } from '../../hooks/useTheme';
import { spacing, borderRadius, layout, fontFamily } from '../../theme';
import type { CoachStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<CoachStackParamList, 'CoachEventComments'>;

function formatTime(time: string): string {
  if (!time) return '--:--';
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

export function CoachEventCommentsScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const { eventId, name, type, date, startTime, endTime, notes, playerName } = route.params;

  const typeLabel = (type || 'other').replace(/_/g, ' ').toUpperCase();
  const dateLabel = date ? new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';

  return (
    <PlayerScreen label={playerName ? `${playerName.toUpperCase()} · EVENT` : 'EVENT'} title={name || 'Event'} onBack={() => navigation.goBack()} scroll={false}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <Text style={[styles.typeBadge, { color: colors.accent1 }]}>{typeLabel}</Text>
          <Text style={[styles.title, { color: colors.textOnDark }]}>{name || 'Event'}</Text>
          <Text style={[styles.meta, { color: colors.textMuted }]}>
            {dateLabel}{startTime ? ` · ${formatTime(startTime)} — ${formatTime(endTime || startTime)}` : ''}
          </Text>
          {notes ? (
            <Text style={[styles.notes, { color: colors.textBody }]}>{notes}</Text>
          ) : null}
        </View>

        <EventCommentsSection eventId={eventId} allowPost title="Coach comments" />
      </ScrollView>
    </PlayerScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  card: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: 4,
  },
  typeBadge: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
  },
  meta: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
  },
  notes: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.sm,
  },
});
