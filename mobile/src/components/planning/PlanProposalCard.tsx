/**
 * PlanProposalCard
 * Shows a draft plan proposed by the PlanningAgent.
 * User can confirm or reject/adjust the plan.
 */

import React from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { ProtocolBadgeStrip } from './ProtocolBadgeStrip';
import { Loader } from '../Loader';

interface PlanSession {
  day: string;
  time: string;
  name: string;
  type: string;
  intensity: string;
}

export interface PlanProposalCardProps {
  plan: {
    title: string;
    sessions: PlanSession[];
    protocols_applied: string[];
    mode: string;
  };
  onConfirm: () => void;
  onReject: () => void;
  loading?: boolean;
}

const INTENSITY_COLORS: Record<string, string> = {
  rest: colors.intensityRest,
  light: colors.intensityLight,
  moderate: colors.intensityModerate,
  hard: colors.intensityHard,
};

function getIntensityColor(intensity: string): string {
  return INTENSITY_COLORS[intensity.toLowerCase()] ?? colors.textSecondary;
}

/** Group sessions by day for display */
function groupByDay(sessions: PlanSession[]): Record<string, PlanSession[]> {
  const grouped: Record<string, PlanSession[]> = {};
  for (const s of sessions) {
    if (!grouped[s.day]) grouped[s.day] = [];
    grouped[s.day].push(s);
  }
  return grouped;
}

export function PlanProposalCard({
  plan,
  onConfirm,
  onReject,
  loading = false,
}: PlanProposalCardProps) {
  const dayGroups = groupByDay(plan.sessions);
  const protocolBadges = plan.protocols_applied.map((name, i) => ({
    id: `proto-${i}`,
    name,
    severity: 'INFO' as const,
  }));

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={2}>
          {plan.title}
        </Text>
        <View style={styles.modeBadge}>
          <Text style={styles.modeBadgeText}>{plan.mode}</Text>
        </View>
      </View>

      {/* Sessions grouped by day */}
      <View style={styles.sessionsContainer}>
        {Object.entries(dayGroups).map(([day, sessions]) => (
          <View key={day} style={styles.dayGroup}>
            <Text style={styles.dayLabel}>{day}</Text>
            {sessions.map((session, idx) => (
              <View key={`${day}-${idx}`} style={styles.sessionRow}>
                <Text style={styles.sessionTime}>{session.time}</Text>
                <View style={styles.sessionInfo}>
                  <Text style={styles.sessionName} numberOfLines={1}>
                    {session.name}
                  </Text>
                  <Text style={styles.sessionType}>{session.type}</Text>
                </View>
                <View
                  style={[
                    styles.intensityDot,
                    { backgroundColor: getIntensityColor(session.intensity) },
                  ]}
                />
                <Text
                  style={[
                    styles.intensityLabel,
                    { color: getIntensityColor(session.intensity) },
                  ]}
                >
                  {session.intensity}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>

      {/* Protocol badges */}
      {protocolBadges.length > 0 && (
        <View style={styles.protocolsSection}>
          <ProtocolBadgeStrip protocols={protocolBadges} />
        </View>
      )}

      {/* Action buttons */}
      <View style={styles.actions}>
        <Pressable
          onPress={onConfirm}
          disabled={loading}
          style={({ pressed }) => [
            styles.confirmButton,
            pressed && styles.buttonPressed,
            loading && styles.buttonDisabled,
          ]}
        >
          {loading ? (
            <Loader size="sm" />
          ) : (
            <Text style={styles.confirmButtonText}>Confirm Plan</Text>
          )}
        </Pressable>

        <Pressable
          onPress={onReject}
          disabled={loading}
          style={({ pressed }) => [
            styles.adjustButton,
            pressed && styles.buttonPressed,
            loading && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.adjustButtonText}>Adjust</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: borderRadius.sm,
    padding: spacing.lg,
    gap: spacing.md,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    flex: 1,
  },
  modeBadge: {
    backgroundColor: colors.accentSubtle,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  modeBadgeText: {
    ...typography.label,
    color: colors.accent,
    textTransform: 'uppercase',
  },

  // Sessions
  sessionsContainer: {
    gap: spacing.compact,
  },
  dayGroup: {
    gap: spacing.xs,
  },
  dayLabel: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.compact,
    gap: spacing.sm,
  },
  sessionTime: {
    ...typography.metadataSmall,
    color: colors.textSecondary,
    width: 48,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionName: {
    ...typography.body,
    color: colors.textPrimary,
  },
  sessionType: {
    ...typography.metadataSmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  intensityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  intensityLabel: {
    ...typography.metadataSmall,
    textTransform: 'capitalize',
    width: 64,
    textAlign: 'right',
  },

  // Protocols
  protocolsSection: {
    marginTop: spacing.xs,
  },

  // Actions
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  confirmButton: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.compact,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  confirmButtonText: {
    ...typography.button,
    color: colors.textOnAccent,
  },
  adjustButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.compact,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  adjustButtonText: {
    ...typography.button,
    color: colors.textPrimary,
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
