/**
 * TrainingJournalPreCapsule — Pre-session target setting.
 * "What do you want to achieve?" + optional mental cue + focus tag.
 * Variant copy changes for recovery and match events.
 */

import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type { TrainingJournalPreCapsule as PreCapsuleType, CapsuleAction } from '../../../types/chat';
import { PillSelector } from './shared/PillSelector';
import { CapsuleSubmitButton } from './shared/CapsuleSubmitButton';

// Variant-specific copy
const VARIANT_COPY = {
  standard: {
    title: 'Set Your Target',
    placeholder: "e.g. Hit 90% of last week's squat PB",
    prompt: "What's your target today?",
  },
  recovery: {
    title: 'Recovery Check-In',
    placeholder: 'e.g. Focus on mobility and hydration',
    prompt: 'How are you going into this recovery session?',
  },
  match: {
    title: 'Match Focus',
    placeholder: 'e.g. Stay composed under pressure, win aerial duels',
    prompt: "What's your focus for this match?",
  },
};

const FOCUS_TAGS = [
  { id: 'strength', label: 'Strength' },
  { id: 'speed', label: 'Speed' },
  { id: 'technique', label: 'Technique' },
  { id: 'tactical', label: 'Tactical' },
  { id: 'fitness', label: 'Fitness' },
];

interface Props {
  card: PreCapsuleType;
  onSubmit: (action: CapsuleAction) => void;
}

export function TrainingJournalPreCapsuleComponent({ card, onSubmit }: Props) {
  const [target, setTarget] = useState(card.existing_target ?? '');
  const [mentalCue, setMentalCue] = useState(card.existing_cue ?? '');
  const [focusTag, setFocusTag] = useState<string>('');
  const [selectedEventId, setSelectedEventId] = useState(card.calendar_event_id);
  const [submitting, setSubmitting] = useState(false);

  const variant = card.journal_variant ?? 'standard';
  const copy = VARIANT_COPY[variant] ?? VARIANT_COPY.standard;
  const canSubmit = target.trim().length > 0;

  // Find selected event info
  const trainings = Array.isArray(card.todays_trainings) ? card.todays_trainings : [];
  const selectedEvent = trainings.find(t => t.eventId === selectedEventId);

  const handleSubmit = () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);

    onSubmit({
      type: 'training_journal_pre_capsule',
      toolName: 'save_journal_pre',
      toolInput: {
        calendar_event_id: selectedEventId,
        pre_target: target.trim(),
        ...(mentalCue.trim() ? { pre_mental_cue: mentalCue.trim() } : {}),
        ...(focusTag ? { pre_focus_tag: focusTag } : {}),
      },
      agentType: 'output',
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{copy.title}</Text>

      {/* Event header */}
      <Text style={styles.sessionInfo}>
        {selectedEvent?.name ?? card.event_name} — {card.event_time}
      </Text>

      {/* Event selector if multiple */}
      {trainings.length > 1 && (
        <PillSelector
          options={trainings.map(t => ({
            id: t.eventId,
            label: `${t.name}${t.hasPreJournal ? ' ✓' : ''}`,
          }))}
          selected={selectedEventId}
          onSelect={setSelectedEventId}
        />
      )}

      {/* Target input */}
      <Text style={styles.label}>{copy.prompt}</Text>
      <TextInput
        style={styles.textInput}
        placeholder={copy.placeholder}
        placeholderTextColor={colors.textInactive}
        value={target}
        onChangeText={setTarget}
        multiline
        numberOfLines={3}
        maxLength={500}
      />

      {/* Mental cue (optional, standard + match only) */}
      {variant !== 'recovery' && (
        <>
          <Text style={styles.label}>Mental cue (optional)</Text>
          <TextInput
            style={styles.cueInput}
            placeholder="One word or phrase — e.g. Slow and controlled"
            placeholderTextColor={colors.textInactive}
            value={mentalCue}
            onChangeText={setMentalCue}
            maxLength={100}
          />
        </>
      )}

      {/* Focus tag (optional, standard only) */}
      {variant === 'standard' && (
        <>
          <Text style={styles.label}>Focus area (optional)</Text>
          <PillSelector
            options={FOCUS_TAGS}
            selected={focusTag}
            onSelect={setFocusTag}
          />
        </>
      )}

      <CapsuleSubmitButton
        title="Set target"
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
