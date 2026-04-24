/**
 * ProgramInteractCapsule — Mark programs as done/dismissed/active inline in chat.
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type { ProgramInteractCapsule as ProgramInteractCapsuleType, CapsuleAction } from '../../../types/chat';

interface Props {
  card: ProgramInteractCapsuleType;
  onSubmit: (action: CapsuleAction) => void;
}

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  recommended: { label: 'Recommended', color: colors.accent1 },
  active: { label: 'Active', color: colors.success },
  done: { label: 'Done', color: colors.textSecondary },
  dismissed: { label: 'Dismissed', color: colors.textInactive },
};

export function ProgramInteractCapsuleComponent({ card, onSubmit }: Props) {
  const programs = card.programs ?? [];

  const sendAction = (programId: string, action: string) => {
    onSubmit({
      type: 'program_interact_capsule',
      toolName: 'interact_program',
      toolInput: { programId, action },
      agentType: 'output',
    });
  };

  if (programs.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>Your programs</Text>
        <Text style={styles.subtext}>No program rows in this message. Try asking again in a moment.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Your Programs</Text>
      {programs.map((prog) => {
        const badge = STATUS_BADGE[prog.status] ?? STATUS_BADGE.recommended;
        const isActionable = prog.status === 'recommended' || prog.status === 'active';
        return (
          <View key={prog.programId} style={styles.programCard}>
            <View style={styles.programHeader}>
              <Text style={styles.programName} numberOfLines={1}>{prog.name}</Text>
              <Text style={[styles.badge, { color: badge.color }]}>{badge.label}</Text>
            </View>
            {prog.category && <Text style={styles.category}>{prog.category}</Text>}
            {isActionable && (
              <View style={styles.actionRow}>
                {prog.status === 'recommended' && (
                  <>
                    <ActionButton label="Start" color={colors.success} onPress={() => sendAction(prog.programId, 'active')} />
                    <ActionButton label="Dismiss" color={colors.textInactive} onPress={() => sendAction(prog.programId, 'dismissed')} />
                  </>
                )}
                {prog.status === 'active' && (
                  <>
                    <ActionButton label="Done" color={colors.success} onPress={() => sendAction(prog.programId, 'done')} />
                    <ActionButton label="Pause" color={colors.warning} onPress={() => sendAction(prog.programId, 'dismissed')} />
                  </>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function ActionButton({ label, color, onPress }: { label: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.actionBtn, { borderColor: color }, pressed && { opacity: 0.7 }]}>
      <Text style={[styles.actionBtnText, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.backgroundElevated, borderRadius: borderRadius.lg, padding: spacing.md, gap: spacing.sm },
  heading: { fontFamily: fontFamily.semiBold, fontSize: 16, color: colors.textPrimary },
  subtext: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  programCard: { backgroundColor: colors.background, borderRadius: borderRadius.md, padding: spacing.sm, gap: 4 },
  programHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  programName: { fontFamily: fontFamily.semiBold, fontSize: 14, color: colors.textPrimary, flex: 1 },
  badge: { fontFamily: fontFamily.medium, fontSize: 11 },
  category: { fontFamily: fontFamily.regular, fontSize: 12, color: colors.textSecondary },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  actionBtn: { paddingVertical: 5, paddingHorizontal: 14, borderRadius: borderRadius.full, borderWidth: 1 },
  actionBtnText: { fontFamily: fontFamily.medium, fontSize: 12 },
});
