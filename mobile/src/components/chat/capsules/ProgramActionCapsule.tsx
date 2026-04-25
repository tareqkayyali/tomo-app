/**
 * ProgramActionCapsule — Shows a recommended program with action buttons.
 * Player can start, view details, or dismiss a program.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type { ProgramActionCapsule as ProgramActionCapsuleType, CapsuleAction } from '../../../types/chat';

interface ProgramActionCapsuleProps {
  card: ProgramActionCapsuleType;
  onSubmit: (action: CapsuleAction) => void;
}

const PRIORITY_BADGE: Record<string, { label: string; color: string }> = {
  high: { label: 'Top Pick', color: colors.accent1 },
  medium: { label: 'Recommended', color: colors.accent2 },
  low: { label: 'Available', color: colors.textSecondary },
};

const ACTION_CONFIG: Record<string, { label: string; style: 'primary' | 'secondary' | 'destructive' }> = {
  details: { label: 'Program Details', style: 'primary' },
  add_to_training: { label: 'Add to Training', style: 'secondary' },
  done: { label: 'Mark Done', style: 'secondary' },
  dismissed: { label: 'Dismiss', style: 'destructive' },
};

const DEFAULT_ACTIONS: ('details' | 'add_to_training')[] = ['details', 'add_to_training'];

export function ProgramActionCapsuleComponent({ card, onSubmit }: ProgramActionCapsuleProps) {
  const badge = PRIORITY_BADGE[card.priority] ?? PRIORITY_BADGE.low;
  const statusLabel = card.currentStatus === 'active' ? 'Active' : card.currentStatus === 'done' ? '✓ Completed' : null;
  const availableActions =
    Array.isArray(card.availableActions) && card.availableActions.length > 0
      ? card.availableActions
      : DEFAULT_ACTIONS;

  const handleAction = (action: string) => {
    if (action === 'details') {
      // "Program Details" → ask AI to explain drills for this program
      onSubmit({
        type: 'program_action_capsule',
        toolName: 'get_program_details',
        toolInput: {
          programId: card.programId,
          programName: card.programName,
        },
        agentType: 'output',
      });
      return;
    }

    if (action === 'add_to_training') {
      // "Add to Training" → activate program (player_selected) to link it to training
      onSubmit({
        type: 'program_action_capsule',
        toolName: 'interact_program',
        toolInput: {
          programId: card.programId,
          action: 'player_selected',
          programName: card.programName,
        },
        agentType: 'output',
      });
      return;
    }

    // done / dismissed → interact_program
    onSubmit({
      type: 'program_action_capsule',
      toolName: 'interact_program',
      toolInput: {
        programId: card.programId,
        action,
        programName: card.programName,
      },
      agentType: 'output',
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={[styles.badge, { backgroundColor: badge.color + '20' }]}>
          <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
        </View>
        {statusLabel && <Text style={styles.status}>{statusLabel}</Text>}
      </View>

      <Text style={styles.programName}>{card.programName}</Text>

      <View style={styles.metaRow}>
        <Text style={styles.metaText}>{card.frequency}</Text>
        <Text style={styles.metaDot}>•</Text>
        <Text style={styles.metaText}>{card.duration}</Text>
      </View>

      {!!card.summary && (
        <Text style={styles.summary} numberOfLines={4}>
          {card.summary}
        </Text>
      )}

      <View style={styles.actionsRow}>
        {availableActions.map((action) => {
          const config = ACTION_CONFIG[action];
          if (!config) return null;
          return (
            <Pressable
              key={action}
              style={({ pressed }) => [
                styles.actionButton,
                config.style === 'primary' && styles.actionPrimary,
                config.style === 'secondary' && styles.actionSecondary,
                config.style === 'destructive' && styles.actionDestructive,
                pressed && styles.actionPressed,
              ]}
              onPress={() => handleAction(action)}
            >
              {config.style === 'primary' ? (
                <View style={styles.primaryWrap}>
                  <LinearGradient
                    colors={['#C8DCC3', '#9AB896', '#7A9B76', '#4F6B4C']}
                    locations={[0, 0.35, 0.7, 1]}
                    start={{ x: 0.3, y: 0.2 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                  <LinearGradient
                    colors={['rgba(245,243,237,0.18)', 'rgba(245,243,237,0.05)', 'transparent']}
                    locations={[0, 0.32, 0.65]}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                  <View style={styles.primaryBorder} />
                  <Text style={[styles.actionText, styles.actionTextPrimary]}>
                    {config.label}
                  </Text>
                </View>
              ) : (
                <Text style={[
                  styles.actionText,
                  config.style === 'destructive' && styles.actionTextDestructive,
                ]}>
                  {config.label}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
  },
  status: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  programName: {
    fontFamily: fontFamily.semiBold,
    fontSize: 17,
    color: colors.textPrimary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  metaDot: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  summary: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  actionButton: {
    borderRadius: 22,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  actionPrimary: {
    borderWidth: 1,
    borderColor: 'rgba(245,243,237,0.16)',
    shadowColor: '#7A9B76',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 7,
  },
  actionSecondary: {
    backgroundColor: 'rgba(154,184,150,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(245,243,237,0.12)',
  },
  actionDestructive: {
    backgroundColor: 'transparent',
  },
  actionPressed: {
    opacity: 0.7,
  },
  actionText: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: '#F5F3ED',
  },
  actionTextPrimary: {
    color: '#F5F3ED',
  },
  actionTextDestructive: {
    color: colors.error,
  },
  primaryWrap: {
    width: '100%',
    minHeight: 42,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 21,
    overflow: 'hidden',
  },
  primaryBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: 'rgba(245,243,237,0.22)',
  },
});
