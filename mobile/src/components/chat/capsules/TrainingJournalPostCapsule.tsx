/**
 * TrainingJournalPostCapsule — Post-session reflection.
 * Shows pre_target reminder, outcome selector (fell_short/hit_it/exceeded),
 * reflection text, optional next focus + body feel.
 * Variant copy changes for recovery and match events.
 */

import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type { TrainingJournalPostCapsule as PostCapsuleType, CapsuleAction } from '../../../types/chat';
import { PillSelector } from './shared/PillSelector';
import { CapsuleSubmitButton } from './shared/CapsuleSubmitButton';

// Variant-specific outcome options
const OUTCOME_OPTIONS = {
  standard: [
    { id: 'fell_short', label: 'Fell short' },
    { id: 'hit_it', label: 'Hit it' },
    { id: 'exceeded', label: 'Exceeded' },
  ],
  recovery: [
    { id: 'fell_short', label: 'Felt rough' },
    { id: 'hit_it', label: 'OK' },
    { id: 'exceeded', label: 'Felt great' },
  ],
  match: [
    { id: 'fell_short', label: 'Tough one' },
    { id: 'hit_it', label: 'Solid' },
    { id: 'exceeded', label: 'Strong performance' },
  ],
};

const VARIANT_COPY = {
  standard: {
    title: 'Log Your Reflection',
    reflectionPrompt: 'What happened?',
    reflectionPlaceholder: 'e.g. Left knee felt better, stuck with pause squats',
  },
  recovery: {
    title: 'Recovery Reflection',
    reflectionPrompt: 'What did you notice?',
    reflectionPlaceholder: 'e.g. Foam rolling helped lower back, slept well',
  },
  match: {
    title: 'Match Review',
    reflectionPrompt: 'What was your standout moment?',
    reflectionPlaceholder: 'e.g. Won most aerial duels, need to work on crossing',
  },
};

interface Props {
  card: PostCapsuleType;
  onSubmit: (action: CapsuleAction) => void;
}

export function TrainingJournalPostCapsuleComponent({ card, onSubmit }: Props) {
  const [outcome, setOutcome] = useState<string>('');
  const [reflection, setReflection] = useState('');
  const [nextFocus, setNextFocus] = useState('');
  const [bodyFeel, setBodyFeel] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const variant = card.journal_variant ?? 'standard';
  const copy = VARIANT_COPY[variant] ?? VARIANT_COPY.standard;
  const outcomes = OUTCOME_OPTIONS[variant] ?? OUTCOME_OPTIONS.standard;
  const canSubmit = outcome !== '' && reflection.trim().length > 0;

  // If multiple pending journals, show selector
  const pendingList = Array.isArray(card.pending_journals) ? card.pending_journals : [];

  const BODY_FEEL_OPTIONS = [
    { id: '2', label: '😣 2' },
    { id: '4', label: '😕 4' },
    { id: '6', label: '😐 6' },
    { id: '8', label: '😊 8' },
    { id: '10', label: '💪 10' },
  ];

  const handleSubmit = () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);

    onSubmit({
      type: 'training_journal_post_capsule',
      toolName: 'save_journal_post',
      toolInput: {
        journal_id: card.journal_id,
        post_outcome: outcome,
        post_reflection: reflection.trim(),
        ...(nextFocus.trim() ? { post_next_focus: nextFocus.trim() } : {}),
        ...(bodyFeel ? { post_body_feel: parseInt(bodyFeel) } : {}),
      },
      agentType: 'output',
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{copy.title}</Text>

      {/* Event name */}
      <Text style={styles.sessionInfo}>{card.event_name}</Text>

      {/* Pre-target reminder */}
      {card.pre_target && (
        <View style={styles.targetReminder}>
          <Text style={styles.targetLabel}>Your target was:</Text>
          <Text style={styles.targetText}>"{card.pre_target}"</Text>
        </View>
      )}

      {/* Outcome selector */}
      <Text style={styles.label}>How did it go?</Text>
      <PillSelector
        options={outcomes}
        selected={outcome}
        onSelect={setOutcome}
      />

      {/* Reflection input */}
      <Text style={styles.label}>{copy.reflectionPrompt}</Text>
      <TextInput
        style={styles.textInput}
        placeholder={copy.reflectionPlaceholder}
        placeholderTextColor={colors.textInactive}
        value={reflection}
        onChangeText={setReflection}
        multiline
        numberOfLines={3}
        maxLength={1000}
      />

      {/* Next focus (optional, match variant gets extra prompt) */}
      {variant === 'match' && (
        <>
          <Text style={styles.label}>What to work on?</Text>
          <TextInput
            style={styles.cueInput}
            placeholder="One area to improve"
            placeholderTextColor={colors.textInactive}
            value={nextFocus}
            onChangeText={setNextFocus}
            maxLength={500}
          />
        </>
      )}

      {/* Body feel (optional) */}
      <Text style={styles.label}>Body feel (optional)</Text>
      <PillSelector
        options={BODY_FEEL_OPTIONS}
        selected={bodyFeel}
        onSelect={setBodyFeel}
      />

      <CapsuleSubmitButton
        title="Log reflection"
        onPress={handleSubmit}
        disabled={!canSubmit}
        loading={submitting}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.cardLight,
    borderRadius: borderRadius.md,
    padding: 14,
    gap: 12,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  sessionInfo: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.accent2,
  },
  targetReminder: {
    backgroundColor: colors.inputBackground,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
  },
  targetLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  targetText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textPrimary,
    fontStyle: 'italic',
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  textInput: {
    backgroundColor: colors.inputBackground,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    color: colors.textPrimary,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  cueInput: {
    backgroundColor: colors.inputBackground,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    color: colors.textPrimary,
    fontFamily: fontFamily.regular,
    fontSize: 14,
  },
});
