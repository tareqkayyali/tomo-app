/**
 * DayLockCapsule — Lock or unlock a calendar day.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type { DayLockCapsule as DayLockCapsuleType, CapsuleAction } from '../../../types/chat';
import { CapsuleSubmitButton } from './shared/CapsuleSubmitButton';

interface Props {
  card: DayLockCapsuleType;
  onSubmit: (action: CapsuleAction) => void;
}

export function DayLockCapsuleComponent({ card, onSubmit }: Props) {
  const handleToggle = () => {
    onSubmit({
      type: 'day_lock_capsule',
      toolName: card.locked ? 'unlock_day' : 'lock_day',
      toolInput: { date: card.date },
      agentType: 'timeline',
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>
        {card.locked ? 'Day Locked' : 'Day Unlocked'}
      </Text>
      <Text style={styles.date}>{formatDate(card.date)}</Text>
      <Text style={styles.description}>
        {card.locked
          ? 'This day is locked — no new events can be added. Unlock to allow changes.'
          : 'This day is open for scheduling. Lock it to prevent changes.'}
      </Text>
      <CapsuleSubmitButton
        title={card.locked ? 'Unlock Day' : 'Lock Day'}
        onPress={handleToggle}
      />
    </View>
  );
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  } catch { return dateStr; }
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.backgroundElevated, borderRadius: borderRadius.lg, padding: spacing.md, gap: spacing.sm },
  heading: { fontFamily: fontFamily.semiBold, fontSize: 16, color: colors.textPrimary },
  date: { fontFamily: fontFamily.bold, fontSize: 18, color: colors.accent1 },
  description: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.textSecondary },
});
