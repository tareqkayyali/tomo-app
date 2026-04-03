/**
 * RegularStudyCapsule — Weekly recurring study schedule planner inline in chat.
 * Parallel to StudyScheduleCapsule (exam-driven). This handles routine study scheduling.
 * Player picks subjects, days, duration, and weeks — AI finds best time slots.
 */

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SmartIcon } from '../../SmartIcon';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type { RegularStudyCapsule as RegularStudyCapsuleType, CapsuleAction } from '../../../types/chat';
import { CapsuleStepper } from './shared/CapsuleStepper';
import { CapsuleSubmitButton } from './shared/CapsuleSubmitButton';
import { CapsuleDayPicker } from './shared/CapsuleDayPicker';
import { PillSelector } from './shared/PillSelector';

interface Props {
  card: RegularStudyCapsuleType;
  onSubmit: (action: CapsuleAction) => void;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const DURATION_OPTIONS = [
  { id: '30', label: '30 min' },
  { id: '45', label: '45 min' },
  { id: '60', label: '60 min' },
  { id: '90', label: '90 min' },
  { id: '120', label: '2 hrs' },
];

export function RegularStudyCapsuleComponent({ card, onSubmit }: Props) {
  const [mode, setMode] = useState<'overview' | 'configure'>(
    card.hasExistingPlan ? 'overview' : 'configure'
  );

  // Initialize from existing config or defaults
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(
    card.currentConfig?.subjects ?? []
  );
  const [selectedDays, setSelectedDays] = useState<number[]>(
    card.currentConfig?.days ?? [1, 2, 3, 4] // Mon-Thu default
  );
  const [duration, setDuration] = useState<string>(
    String(card.currentConfig?.sessionDurationMin ?? 60)
  );
  const [planWeeks, setPlanWeeks] = useState(
    card.currentConfig?.planWeeks ?? 4
  );

  const subjects = card.studySubjects.length > 0
    ? card.studySubjects
    : ['Math', 'Physics', 'English', 'Biology', 'Chemistry'];

  const toggleSubject = (subject: string) => {
    setSelectedSubjects(prev =>
      prev.includes(subject)
        ? prev.filter(s => s !== subject)
        : [...prev, subject]
    );
  };

  const canSubmit = selectedSubjects.length > 0 && selectedDays.length > 0;

  const handleGenerate = () => {
    onSubmit({
      type: 'regular_study_capsule',
      toolName: 'generate_regular_study_plan',
      toolInput: {
        subjects: selectedSubjects,
        days: selectedDays,
        sessionDurationMin: parseInt(duration, 10),
        planWeeks,
      },
      agentType: 'timeline',
    });
  };

  // OVERVIEW MODE — show existing config summary
  if (mode === 'overview' && card.hasExistingPlan && card.currentConfig) {
    const cfg = card.currentConfig;
    const dayList = cfg.days.map(d => DAY_NAMES[d]).join(', ');

    return (
      <View style={styles.container}>
        <Text style={styles.heading}>Regular Study Schedule</Text>

        <View style={styles.planBanner}>
          <SmartIcon name="book-outline" size={16} color="#30D158" />
          <View style={{ flex: 1 }}>
            <Text style={styles.planBannerTitle}>
              Active · {card.existingSessionCount} sessions scheduled
            </Text>
            <Text style={styles.planBannerSub}>
              {cfg.subjects.join(', ')} · {dayList} · {cfg.sessionDurationMin}min
            </Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          <CapsuleSubmitButton
            title="Edit & Regenerate"
            onPress={() => setMode('configure')}
          />
        </View>
      </View>
    );
  }

  // CONFIGURE MODE — subject, day, duration, weeks pickers
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Regular Study Schedule</Text>
      <Text style={styles.subtext}>
        Pick your subjects, study days, and session length. Tomo will find the best available times around your training and school.
      </Text>

      {/* Subject multi-select pills */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Subjects</Text>
        <View style={styles.pillRow}>
          {subjects.map(subject => {
            const isSelected = selectedSubjects.includes(subject);
            return (
              <Pressable
                key={subject}
                onPress={() => toggleSubject(subject)}
                style={[styles.pill, isSelected && styles.pillSelected]}
              >
                <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>
                  {subject}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Day picker */}
      <CapsuleDayPicker
        label="Study Days"
        selected={selectedDays}
        onChange={setSelectedDays}
      />

      {/* Duration picker */}
      <PillSelector
        label="Session Duration"
        options={DURATION_OPTIONS}
        selected={duration}
        onSelect={setDuration}
      />

      {/* Weeks stepper */}
      <CapsuleStepper
        label="Plan ahead"
        value={planWeeks}
        onChange={setPlanWeeks}
        min={1}
        max={4}
        unit="weeks"
      />

      <CapsuleSubmitButton
        title="Generate Study Plan"
        onPress={handleGenerate}
        disabled={!canSubmit}
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
  subtext: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  section: {
    gap: 4,
  },
  sectionLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.textInactive,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pill: {
    backgroundColor: colors.chipBackground,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  pillSelected: {
    borderColor: colors.accent1,
    backgroundColor: 'rgba(255, 107, 53, 0.12)',
  },
  pillText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textInactive,
  },
  pillTextSelected: {
    color: colors.accent1,
  },
  planBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: '#30D15830',
  },
  planBannerTitle: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: '#30D158',
  },
  planBannerSub: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
  },
  actionRow: {
    gap: spacing.xs,
  },
});
