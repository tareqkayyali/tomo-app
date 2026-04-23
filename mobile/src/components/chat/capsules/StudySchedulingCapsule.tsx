/**
 * StudySchedulingCapsule — Interactive study session booking.
 *
 * Mirrors scheduling_capsule UX but uses subjects + study slots and submits
 * create_event with event_type study. Backend: study_scheduling_capsule.py
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
} from 'react-native';
import { colors } from '../../../theme/colors';
import { borderRadius, fontFamily } from '../../../theme';
import type { CapsuleAction, StudySchedulingCapsule as StudySchedulingCapsuleCard } from '../../../types/chat';
import { PillSelector } from './shared/PillSelector';
import { CapsuleSubmitButton } from './shared/CapsuleSubmitButton';

interface ExistingEvent {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  type: string;
}

interface AvailableSlot {
  start24: string;
  end24: string;
  label: string;
  score: number;
}

interface StudyDayData {
  date: string;
  label: string;
  dayOfWeek: string;
  existingEvents: ExistingEvent[];
  availableSlots: AvailableSlot[];
  isSchoolDay?: boolean;
  schoolStart?: string | null;
  schoolEnd?: string | null;
}

interface StudySchedulingCapsuleProps {
  card: StudySchedulingCapsuleCard;
  onSubmit: (action: CapsuleAction) => void;
}

function addMinutes(timeStr: string, minutes: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  const total = Math.min(h * 60 + (m || 0) + minutes, 23 * 60 + 59);
  const newH = Math.floor(total / 60);
  const newM = total % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

const FALLBACK_DURATION_OPTIONS = [
  { id: '30', label: '30 min' },
  { id: '45', label: '45 min' },
  { id: '60', label: '60 min' },
  { id: '90', label: '90 min' },
  { id: '120', label: '2 hours' },
];

function typeColor(type: string) {
  switch (type) {
    case 'training':
    case 'match':
      return { backgroundColor: `${colors.accent1}15` };
    case 'study':
    case 'study_block':
    case 'exam':
      return { backgroundColor: `${colors.accent2}15` };
    case 'recovery':
      return { backgroundColor: `${colors.accentSoft}15` };
    default:
      return { backgroundColor: `${colors.textInactive}15` };
  }
}

export function StudySchedulingCapsuleComponent({ card, onSubmit }: StudySchedulingCapsuleProps) {
  const ctx = card.context;
  const days = (ctx?.days ?? []) as StudyDayData[];

  const subjectOptions = useMemo(
    () =>
      (ctx?.subjectOptions ?? []).map((o) => ({
        id: String(o.id),
        label: o.label ?? String(o.id),
      })),
    [ctx?.subjectOptions],
  );

  const durationPillOptions = useMemo(() => {
    const raw = ctx?.durationOptions;
    if (raw && raw.length > 0) {
      return raw.map((o) => ({ id: String(o.id), label: o.label }));
    }
    return FALLBACK_DURATION_OPTIONS;
  }, [ctx?.durationOptions]);

  const defaultSubjectId = useMemo(() => {
    const pref = ctx?.prefilledSubject;
    if (pref && subjectOptions.some((o) => o.id === pref)) return pref;
    return subjectOptions[0]?.id ?? '';
  }, [ctx?.prefilledSubject, subjectOptions]);

  const defaultDurationId = useMemo(() => {
    const min = ctx?.durationMin ?? 45;
    const match = durationPillOptions.find((o) => parseInt(o.id, 10) === min);
    return match?.id ?? durationPillOptions[0]?.id ?? '45';
  }, [ctx?.durationMin, durationPillOptions]);

  const initialDayIdx = useMemo(() => {
    if (ctx?.prefilledDate) {
      const idx = days.findIndex((d) => d.date === ctx.prefilledDate);
      if (idx >= 0) return idx;
    }
    return 0;
  }, [days, ctx?.prefilledDate]);

  const [selectedDayIdx, setSelectedDayIdx] = useState(initialDayIdx);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [subject, setSubject] = useState(defaultSubjectId);
  const [title, setTitle] = useState(() => {
    const s = defaultSubjectId;
    return s ? `${s} study` : 'Study session';
  });
  const [duration, setDuration] = useState(defaultDurationId);

  const selectedDay = days[selectedDayIdx] ?? null;

  const handleDayChange = (idx: number) => {
    setSelectedDayIdx(idx);
    setSelectedSlot(null);
  };

  const handleSlotSelect = (slot: AvailableSlot) => {
    setSelectedSlot(slot);
  };

  const canSubmit =
    selectedSlot !== null && !!subject && title.trim().length > 0;

  const handleSubmit = () => {
    if (!selectedDay || !canSubmit || !selectedSlot) return;
    const mins = parseInt(duration, 10) || 45;
    onSubmit({
      type: 'study_scheduling_capsule',
      toolName: 'create_event',
      toolInput: {
        title: title.trim(),
        event_type: 'study',
        date: selectedDay.date,
        start_time: selectedSlot.start24,
        end_time: addMinutes(selectedSlot.start24, mins),
        intensity: 'LIGHT',
        notes: subject ? `Subject: ${subject}` : '',
      },
      agentType: 'timeline',
    });
  };

  if (!subjectOptions.length) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>Add study subjects in schedule settings to plan sessions.</Text>
      </View>
    );
  }

  if (!selectedDay) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>No schedule data available.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.titleInput}
        value={title}
        onChangeText={setTitle}
        placeholder="Session title"
        placeholderTextColor={colors.textSecondary}
      />

      <PillSelector
        options={subjectOptions}
        selected={subject}
        onSelect={(id) => {
          setSubject(id);
          setTitle(`${id} study`);
        }}
        label="Subject"
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.dayScroller}
        contentContainerStyle={styles.dayScrollContent}
      >
        {days.map((day, idx) => {
          const isSelected = idx === selectedDayIdx;
          const slotCount = day.availableSlots.length;
          return (
            <Pressable
              key={day.date}
              onPress={() => handleDayChange(idx)}
              style={[styles.dayChip, isSelected && styles.dayChipSelected]}
            >
              <Text style={[styles.dayLabel, isSelected && styles.dayLabelSelected]}>{day.label}</Text>
              <Text style={[styles.daySlotCount, isSelected && styles.daySlotCountSelected]}>
                {slotCount > 0 ? `${slotCount} slot${slotCount > 1 ? 's' : ''}` : 'Full'}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {selectedDay.isSchoolDay && selectedDay.schoolStart && selectedDay.schoolEnd ? (
        <View style={styles.hintBanner}>
          <Text style={styles.hintText}>
            School day ({selectedDay.schoolStart}–{selectedDay.schoolEnd}) — slots avoid class time when possible
          </Text>
        </View>
      ) : null}

      <View style={styles.scheduleSection}>
        <Text style={styles.sectionLabel}>
          {selectedDay.dayOfWeek} {selectedDay.date}
        </Text>

        {selectedDay.existingEvents.length > 0 ? (
          <View style={styles.eventGroup}>
            <Text style={styles.groupLabel}>YOUR DAY</Text>
            {selectedDay.existingEvents.map((ev, i) => (
              <View key={ev.id || `${ev.name}-${i}`} style={[styles.eventRow, styles.eventRowDimmed]}>
                <View style={styles.eventInfo}>
                  <Text style={[styles.eventName, styles.eventNameDimmed]}>{ev.name}</Text>
                  <Text style={styles.eventTime}>
                    {ev.startTime} - {ev.endTime}
                  </Text>
                </View>
                <View style={[styles.typeBadge, typeColor(ev.type)]}>
                  <Text style={styles.typeBadgeText}>{ev.type.toUpperCase()}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {selectedDay.availableSlots.length > 0 ? (
          <View style={styles.eventGroup}>
            <Text style={styles.groupLabel}>OPEN SLOTS</Text>
            {selectedDay.availableSlots.map((slot) => {
              const isSelected = selectedSlot?.start24 === slot.start24;
              return (
                <Pressable
                  key={slot.start24}
                  onPress={() => handleSlotSelect(slot)}
                  style={[
                    styles.eventRow,
                    styles.eventRowTappable,
                    styles.slotRow,
                    isSelected && styles.slotRowSelected,
                  ]}
                >
                  <View style={[styles.radio, isSelected && styles.radioSelected]} />
                  <Text style={[styles.slotLabel, isSelected && styles.slotLabelSelected]}>{slot.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptySlots}>
            <Text style={styles.emptyText}>No open slots this day — try another day</Text>
          </View>
        )}
      </View>

      {selectedSlot ? (
        <PillSelector
          options={durationPillOptions}
          selected={duration}
          onSelect={setDuration}
          label="Duration"
        />
      ) : null}

      <CapsuleSubmitButton title="Add study block" onPress={handleSubmit} disabled={!canSubmit} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    paddingVertical: 8,
  },
  titleInput: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: colors.glassBorder,
    paddingVertical: 6,
    paddingHorizontal: 0,
  },
  dayScroller: {
    marginHorizontal: -4,
  },
  dayScrollContent: {
    gap: 6,
    paddingHorizontal: 4,
  },
  dayChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.chipBackground,
    alignItems: 'center',
    minWidth: 70,
  },
  dayChipSelected: {
    borderColor: colors.accent2,
    backgroundColor: `rgba(100, 160, 200, 0.12)`,
  },
  dayLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  dayLabelSelected: {
    color: colors.accent2,
  },
  daySlotCount: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    color: colors.textInactive,
    marginTop: 1,
  },
  daySlotCountSelected: {
    color: colors.accent2,
  },
  hintBanner: {
    backgroundColor: `${colors.accent2}12`,
    borderRadius: borderRadius.sm,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  hintText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  scheduleSection: {
    gap: 8,
  },
  sectionLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.textInactive,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  eventGroup: {
    gap: 4,
  },
  groupLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    color: colors.textInactive,
    letterSpacing: 0.8,
    marginTop: 4,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: borderRadius.sm,
    gap: 8,
  },
  eventRowTappable: {
    backgroundColor: colors.chipBackground,
  },
  eventRowDimmed: {
    opacity: 0.85,
  },
  eventInfo: {
    flex: 1,
  },
  eventName: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  eventNameDimmed: {
    color: colors.textInactive,
  },
  eventTime: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
  typeBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: borderRadius.full,
  },
  typeBadgeText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 9,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.glassBorder,
  },
  radioSelected: {
    borderColor: colors.accent2,
    backgroundColor: colors.accent2,
  },
  slotRow: {
    backgroundColor: `${colors.accent2}08`,
  },
  slotRowSelected: {
    borderWidth: 1,
    borderColor: colors.accent2,
    backgroundColor: `${colors.accent2}18`,
  },
  slotLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
    flex: 1,
  },
  slotLabelSelected: {
    color: colors.accent2,
  },
  emptySlots: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textInactive,
    textAlign: 'center',
  },
});
