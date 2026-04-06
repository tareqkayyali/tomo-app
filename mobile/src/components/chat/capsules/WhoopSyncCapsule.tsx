/**
 * WhoopSyncCapsule — Sync Whoop vitals inline in chat.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type { WhoopSyncCapsule as WhoopSyncCapsuleType, CapsuleAction } from '../../../types/chat';
import { CapsuleSubmitButton } from './shared/CapsuleSubmitButton';

interface Props {
  card: WhoopSyncCapsuleType;
  onSubmit: (action: CapsuleAction) => void;
}

export function WhoopSyncCapsuleComponent({ card, onSubmit }: Props) {
  if (!card.connected) {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>⌚ Whoop Not Connected</Text>
        <Text style={styles.description}>
          Connect your Whoop band in Settings → Integrations to sync recovery, sleep, and strain data.
        </Text>
      </View>
    );
  }

  // Show sync result if available
  if (card.syncResult) {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>Whoop Synced</Text>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{card.syncResult.recoveries}</Text>
            <Text style={styles.statLabel}>Recoveries</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{card.syncResult.sleeps}</Text>
            <Text style={styles.statLabel}>Sleeps</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{card.syncResult.workouts}</Text>
            <Text style={styles.statLabel}>Workouts</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>⌚ Whoop Sync</Text>
      {card.lastSyncAt && (
        <Text style={styles.lastSync}>Last sync: {card.lastSyncAt}</Text>
      )}
      <CapsuleSubmitButton
        title="Sync Now"
        onPress={() => onSubmit({
          type: 'whoop_sync_capsule',
          toolName: 'sync_whoop',
          toolInput: {},
          agentType: 'output',
        })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.backgroundElevated, borderRadius: borderRadius.lg, padding: spacing.md, gap: spacing.sm },
  heading: { fontFamily: fontFamily.semiBold, fontSize: 16, color: colors.textPrimary },
  description: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.textSecondary },
  lastSync: { fontFamily: fontFamily.regular, fontSize: 12, color: colors.textInactive },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center' },
  statValue: { fontFamily: fontFamily.bold, fontSize: 24, color: colors.accent2 },
  statLabel: { fontFamily: fontFamily.regular, fontSize: 11, color: colors.textSecondary },
});
