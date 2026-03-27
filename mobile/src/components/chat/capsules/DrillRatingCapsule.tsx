/**
 * DrillRatingCapsule — Rate a drill after completing it.
 * Star rating + difficulty + completion status + optional notes.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput } from 'react-native';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type { DrillRatingCapsule as DrillRatingCapsuleType, CapsuleAction } from '../../../types/chat';
import { PillSelector } from './shared/PillSelector';
import { CapsuleSubmitButton } from './shared/CapsuleSubmitButton';

interface DrillRatingCapsuleProps {
  card: DrillRatingCapsuleType;
  onSubmit: (action: CapsuleAction) => void;
}

const STARS = [1, 2, 3, 4, 5];
const DIFFICULTY_OPTIONS = [
  { id: '1', label: '😌 Easy' },
  { id: '2', label: '🙂 Moderate' },
  { id: '3', label: '💪 Challenging' },
  { id: '4', label: '🔥 Hard' },
  { id: '5', label: '🤯 Brutal' },
];
const COMPLETION_OPTIONS = [
  { id: 'completed', label: '✅ Completed' },
  { id: 'partial', label: '⚡ Partial' },
  { id: 'skipped', label: '⏭️ Skipped' },
];

export function DrillRatingCapsuleComponent({ card, onSubmit }: DrillRatingCapsuleProps) {
  const [rating, setRating] = useState(0);
  const [difficulty, setDifficulty] = useState('');
  const [completion, setCompletion] = useState('completed');
  const [notes, setNotes] = useState('');

  const handleSubmit = () => {
    onSubmit({
      type: 'drill_rating_capsule',
      toolName: 'rate_drill',
      toolInput: {
        drillId: card.drillId,
        rating,
        difficulty: difficulty ? parseInt(difficulty, 10) : undefined,
        completionStatus: completion,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      },
      agentType: 'output',
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>⭐ Rate: {card.drillName}</Text>
      {card.category && <Text style={styles.category}>{card.category}</Text>}

      {/* Star rating */}
      <View style={styles.starsRow}>
        {STARS.map((s) => (
          <Pressable key={s} onPress={() => setRating(s)} style={styles.starButton}>
            <Text style={[styles.star, s <= rating && styles.starActive]}>
              {s <= rating ? '★' : '☆'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Completion status */}
      <PillSelector
        options={COMPLETION_OPTIONS}
        selected={completion}
        onSelect={setCompletion}
        label="Status"
      />

      {/* Difficulty */}
      <PillSelector
        options={DIFFICULTY_OPTIONS}
        selected={difficulty}
        onSelect={setDifficulty}
        label="Difficulty"
      />

      {/* Notes */}
      <TextInput
        style={styles.notesInput}
        placeholder="Any feedback? (optional)"
        placeholderTextColor={colors.textSecondary}
        value={notes}
        onChangeText={setNotes}
        multiline
      />

      <CapsuleSubmitButton
        title="Submit Rating"
        disabled={rating === 0}
        onPress={handleSubmit}
      />
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
  heading: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  category: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  starsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  starButton: {
    padding: spacing.xs,
  },
  star: {
    fontSize: 32,
    color: colors.textSecondary,
  },
  starActive: {
    color: colors.warning,
  },
  notesInput: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.inputBackground,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 60,
    textAlignVertical: 'top',
  },
});
