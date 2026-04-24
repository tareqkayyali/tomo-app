/**
 * GhostSuggestionCapsule — Confirm or dismiss ghost event suggestions.
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type { GhostSuggestionCapsule as GhostSuggestionCapsuleType, CapsuleAction } from '../../../types/chat';

interface Props {
  card: GhostSuggestionCapsuleType;
  onSubmit: (action: CapsuleAction) => void;
}

export function GhostSuggestionCapsuleComponent({ card, onSubmit }: Props) {
  const suggestions = card.suggestions ?? [];
  if (suggestions.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>No Suggestions</Text>
        <Text style={styles.subtext}>No recurring patterns detected yet. Keep training consistently and suggestions will appear.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Smart Suggestions</Text>
      <Text style={styles.subtext}>Based on your training patterns</Text>

      {suggestions.map((s, i) => (
        <View key={i} style={styles.suggestionCard}>
          <View style={styles.suggestionHeader}>
            <Text style={styles.suggestionName}>{s.name}</Text>
            <Text style={styles.confidence}>{Math.round(s.confidence * 100)}% match</Text>
          </View>
          <Text style={styles.pattern}>{s.patternDescription}</Text>
          <Text style={styles.dateTime}>
            {s.date}{s.startTime ? ` at ${s.startTime}` : ''}{s.endTime ? `–${s.endTime}` : ''}
          </Text>
          <View style={styles.actionRow}>
            <Pressable
              onPress={() => onSubmit({
                type: 'ghost_suggestion_capsule',
                toolName: 'confirm_ghost_suggestion',
                toolInput: { name: s.name, date: s.date, eventType: s.eventType, startTime: s.startTime, endTime: s.endTime },
                agentType: 'timeline',
              })}
              style={[styles.btn, styles.confirmBtn]}
            >
              <Text style={[styles.btnText, { color: colors.success }]}>Confirm</Text>
            </Pressable>
            <Pressable
              onPress={() => onSubmit({
                type: 'ghost_suggestion_capsule',
                toolName: 'dismiss_ghost_suggestion',
                toolInput: { patternKey: s.patternKey },
                agentType: 'timeline',
              })}
              style={[styles.btn, styles.dismissBtn]}
            >
              <Text style={[styles.btnText, { color: colors.textInactive }]}>Skip</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.backgroundElevated, borderRadius: borderRadius.lg, padding: spacing.md, gap: spacing.sm },
  heading: { fontFamily: fontFamily.semiBold, fontSize: 16, color: colors.textPrimary },
  subtext: { fontFamily: fontFamily.regular, fontSize: 12, color: colors.textSecondary },
  suggestionCard: { backgroundColor: colors.background, borderRadius: borderRadius.md, padding: spacing.sm, gap: 4, borderLeftWidth: 3, borderLeftColor: colors.accent2 },
  suggestionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  suggestionName: { fontFamily: fontFamily.semiBold, fontSize: 14, color: colors.textPrimary },
  confidence: { fontFamily: fontFamily.medium, fontSize: 11, color: colors.accent2 },
  pattern: { fontFamily: fontFamily.regular, fontSize: 12, color: colors.textSecondary },
  dateTime: { fontFamily: fontFamily.medium, fontSize: 13, color: colors.accent1 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  btn: { paddingVertical: 5, paddingHorizontal: 14, borderRadius: borderRadius.full, borderWidth: 1 },
  confirmBtn: { borderColor: colors.success },
  dismissBtn: { borderColor: colors.textInactive },
  btnText: { fontFamily: fontFamily.medium, fontSize: 12 },
});
