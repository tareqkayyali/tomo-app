/**
 * CheckinCapsule — Quick daily check-in with emoji scales.
 * Energy, Sleep, Soreness, Pain toggle.
 */

import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type { CheckinCapsule as CheckinCapsuleType, CapsuleAction } from '../../../types/chat';
import { EmojiScale } from './shared/EmojiScale';
import { PillSelector } from './shared/PillSelector';
import { CapsuleSubmitButton } from './shared/CapsuleSubmitButton';

const MOOD_OPTIONS = [
  { value: 2, emoji: '' },
  { value: 4, emoji: '' },
  { value: 6, emoji: '' },
  { value: 8, emoji: '' },
  { value: 10, emoji: '' },
];

const SLEEP_OPTIONS = [
  { id: '4',   label: '<5h' },
  { id: '5.5', label: '5-6h' },
  { id: '7',   label: '7h' },
  { id: '8',   label: '8h' },
  { id: '9.5', label: '9h+' },
];

const ENERGY_OPTIONS = [
  { value: 2, emoji: '' },
  { value: 4, emoji: '' },
  { value: 6, emoji: '' },
  { value: 8, emoji: '' },
  { value: 10, emoji: '' },
];

const SORENESS_OPTIONS = [
  { value: 2, emoji: '' },
  { value: 4, emoji: '' },
  { value: 6, emoji: '' },
  { value: 8, emoji: '' },
  { value: 10, emoji: '' },
];

const ACADEMIC_OPTIONS = [
  { value: 2, emoji: '' },
  { value: 4, emoji: '' },
  { value: 6, emoji: '' },
  { value: 8, emoji: '' },
  { value: 10, emoji: '' },
];

const EFFORT_OPTIONS = [
  { value: 2, emoji: '' },
  { value: 4, emoji: '' },
  { value: 6, emoji: '' },
  { value: 8, emoji: '' },
  { value: 10, emoji: '' },
];

interface CheckinCapsuleProps {
  card: CheckinCapsuleType;
  onSubmit: (action: CapsuleAction) => void;
}

export function CheckinCapsuleComponent({ card, onSubmit }: CheckinCapsuleProps) {
  const [mood, setMood] = useState<number | undefined>();
  const [sleepHours, setSleepHours] = useState<string>('');
  const [energy, setEnergy] = useState<number | undefined>();
  const [soreness, setSoreness] = useState<number | undefined>();
  const [academicStress, setAcademicStress] = useState<number | undefined>();
  const [effortYesterday, setEffortYesterday] = useState<number | undefined>();
  const [painFlag, setPainFlag] = useState(false);
  const [painLocation, setPainLocation] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = mood !== undefined && sleepHours !== '' && energy !== undefined && soreness !== undefined && effortYesterday !== undefined;

  const handleSubmit = () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);

    onSubmit({
      type: 'checkin_capsule',
      toolName: 'log_check_in',
      toolInput: {
        mood,
        sleepHours: parseFloat(sleepHours),
        energy,
        soreness,
        effortYesterday,
        ...(academicStress !== undefined ? { academicStress } : {}),
        painFlag,
        ...(painFlag && painLocation ? { painLocation } : {}),
      },
      agentType: 'output',
    });
  };

  // Show stale check-in warning
  const staleMsg = card.lastCheckinDate
    ? (() => {
        const diff = Math.floor(
          (Date.now() - new Date(card.lastCheckinDate + 'T00:00:00').getTime()) / 86400000
        );
        if (diff >= 2) return `Last check-in: ${diff} days ago`;
        return null;
      })()
    : null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Morning Check-in</Text>
      {staleMsg && <Text style={styles.staleWarning}>{staleMsg}</Text>}

      <EmojiScale
        label="Mood"
        options={MOOD_OPTIONS}
        selected={mood}
        onSelect={setMood}
      />

      <PillSelector
        label="Sleep"
        options={SLEEP_OPTIONS}
        selected={sleepHours}
        onSelect={setSleepHours}
      />

      <EmojiScale
        label="Energy"
        options={ENERGY_OPTIONS}
        selected={energy}
        onSelect={setEnergy}
      />

      <EmojiScale
        label="Soreness"
        options={SORENESS_OPTIONS}
        selected={soreness}
        onSelect={setSoreness}
      />

      <EmojiScale
        label="Academic load"
        options={ACADEMIC_OPTIONS}
        selected={academicStress}
        onSelect={setAcademicStress}
      />

      <EmojiScale
        label="Yesterday's training"
        options={EFFORT_OPTIONS}
        selected={effortYesterday}
        onSelect={setEffortYesterday}
      />

      <View style={styles.painRow}>
        <Text style={styles.painLabel}>Any pain?</Text>
        <View style={styles.painButtons}>
          <Pressable
            onPress={() => setPainFlag(false)}
            style={[styles.painButton, !painFlag && styles.painButtonSelected]}
          >
            <Text style={[styles.painButtonText, !painFlag && styles.painButtonTextSelected]}>No</Text>
          </Pressable>
          <Pressable
            onPress={() => setPainFlag(true)}
            style={[styles.painButton, painFlag && styles.painButtonSelected]}
          >
            <Text style={[styles.painButtonText, painFlag && styles.painButtonTextSelected]}>Yes</Text>
          </Pressable>
        </View>
      </View>

      {painFlag && (
        <View style={styles.painInput}>
          <TextInput
            style={styles.painTextInput}
            value={painLocation}
            onChangeText={setPainLocation}
            placeholder="Where does it hurt?"
            placeholderTextColor="rgba(245,243,237,0.3)"
          />
        </View>
      )}

      <CapsuleSubmitButton
        title="Check In"
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
  staleWarning: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.warning,
  },
  painRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  painLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textInactive,
  },
  painButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  painButton: {
    backgroundColor: colors.chipBackground,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  painButtonSelected: {
    borderColor: colors.accent1,
    backgroundColor: colors.accentMuted,
  },
  painButtonText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textInactive,
  },
  painButtonTextSelected: {
    color: colors.accent1,
  },
  painInput: {
    backgroundColor: colors.inputBackground,
    borderRadius: borderRadius.xl,
    borderWidth: 1.5,
    borderColor: colors.creamSoft,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  painTextInput: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textPrimary,
    paddingVertical: spacing.compact,
  },
});
