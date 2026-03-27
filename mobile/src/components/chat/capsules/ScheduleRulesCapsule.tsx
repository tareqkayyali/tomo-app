/**
 * ScheduleRulesCapsule — Edit schedule rules inline in chat.
 * Shows current scenario, core rules (school, sleep, toggles), and allows editing.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type { ScheduleRulesCapsule as ScheduleRulesCapsuleType, CapsuleAction } from '../../../types/chat';
import { PillSelector } from './shared/PillSelector';
import { CapsuleDayPicker } from './shared/CapsuleDayPicker';
import { CapsuleToggle } from './shared/CapsuleToggle';
import { CapsuleStepper } from './shared/CapsuleStepper';
import { CapsuleSubmitButton } from './shared/CapsuleSubmitButton';

interface Props {
  card: ScheduleRulesCapsuleType;
  onSubmit: (action: CapsuleAction) => void;
}

const SCENARIO_LABELS: Record<string, string> = {
  normal: '🟢 Normal Season',
  league_active: '⚽ League Active',
  exam_period: '📝 Exam Period',
  league_and_exam: '🔥 League + Exam',
};

const TIME_OPTIONS = [
  { id: '06:00', label: '6am' }, { id: '07:00', label: '7am' },
  { id: '08:00', label: '8am' }, { id: '09:00', label: '9am' },
  { id: '10:00', label: '10am' }, { id: '14:00', label: '2pm' },
  { id: '15:00', label: '3pm' }, { id: '16:00', label: '4pm' },
  { id: '17:00', label: '5pm' }, { id: '18:00', label: '6pm' },
  { id: '19:00', label: '7pm' }, { id: '20:00', label: '8pm' },
  { id: '21:00', label: '9pm' }, { id: '22:00', label: '10pm' },
];

export function ScheduleRulesCapsuleComponent({ card, onSubmit }: Props) {
  const c = card.current;
  const [schoolDays, setSchoolDays] = useState(c.schoolDays);
  const [schoolStart, setSchoolStart] = useState(c.schoolStart);
  const [schoolEnd, setSchoolEnd] = useState(c.schoolEnd);
  const [sleepStart, setSleepStart] = useState(c.sleepStart);
  const [sleepEnd, setSleepEnd] = useState(c.sleepEnd);
  const [league, setLeague] = useState(c.leagueIsActive);
  const [examPeriod, setExamPeriod] = useState(c.examPeriodActive);
  const [bufferDefault, setBufferDefault] = useState(c.bufferDefaultMin);
  const [bufferPostMatch, setBufferPostMatch] = useState(c.bufferPostMatchMin);

  const handleSubmit = () => {
    const updates: Record<string, any> = {};
    if (JSON.stringify(schoolDays) !== JSON.stringify(c.schoolDays)) updates.school_days = schoolDays;
    if (schoolStart !== c.schoolStart) updates.school_start = schoolStart;
    if (schoolEnd !== c.schoolEnd) updates.school_end = schoolEnd;
    if (sleepStart !== c.sleepStart) updates.sleep_start = sleepStart;
    if (sleepEnd !== c.sleepEnd) updates.sleep_end = sleepEnd;
    if (league !== c.leagueIsActive) updates.league_is_active = league;
    if (examPeriod !== c.examPeriodActive) updates.exam_period_active = examPeriod;
    if (bufferDefault !== c.bufferDefaultMin) updates.buffer_default_min = bufferDefault;
    if (bufferPostMatch !== c.bufferPostMatchMin) updates.buffer_post_match_min = bufferPostMatch;

    if (Object.keys(updates).length === 0) return;

    onSubmit({
      type: 'schedule_rules_capsule',
      toolName: 'update_schedule_rules',
      toolInput: updates,
      agentType: 'timeline',
    });
  };

  const hasChanges = JSON.stringify(schoolDays) !== JSON.stringify(c.schoolDays)
    || schoolStart !== c.schoolStart || schoolEnd !== c.schoolEnd
    || sleepStart !== c.sleepStart || sleepEnd !== c.sleepEnd
    || league !== c.leagueIsActive || examPeriod !== c.examPeriodActive
    || bufferDefault !== c.bufferDefaultMin || bufferPostMatch !== c.bufferPostMatchMin;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>⚙️ My Schedule Rules</Text>

      {/* Scenario badge */}
      <View style={styles.scenarioBadge}>
        <Text style={styles.scenarioText}>{SCENARIO_LABELS[card.scenario] ?? card.scenario}</Text>
      </View>

      {/* Toggles */}
      <CapsuleToggle label="⚽ League Active" value={league} onChange={setLeague} />
      <CapsuleToggle label="📝 Exam Period" value={examPeriod} onChange={setExamPeriod} />

      {/* School days */}
      <CapsuleDayPicker label="School Days" selected={schoolDays} onChange={setSchoolDays} />

      {/* School hours */}
      <PillSelector options={TIME_OPTIONS} selected={schoolStart} onSelect={setSchoolStart} label="School Start" />
      <PillSelector options={TIME_OPTIONS} selected={schoolEnd} onSelect={setSchoolEnd} label="School End" />

      {/* Sleep */}
      <PillSelector options={TIME_OPTIONS} selected={sleepStart} onSelect={setSleepStart} label="Bedtime" />
      <PillSelector options={TIME_OPTIONS} selected={sleepEnd} onSelect={setSleepEnd} label="Wake Up" />

      {/* Buffers */}
      <CapsuleStepper label="Default Buffer" value={bufferDefault} onChange={setBufferDefault} min={15} max={90} step={15} unit="min" />
      <CapsuleStepper label="Post-Match Buffer" value={bufferPostMatch} onChange={setBufferPostMatch} min={30} max={120} step={15} unit="min" />

      <CapsuleSubmitButton
        title="Save Rules"
        disabled={!hasChanges}
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
  scenarioBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.chipBackground,
    borderRadius: borderRadius.full,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  scenarioText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textPrimary,
  },
});
