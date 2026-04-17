/**
 * SchedulingCapsule — Interactive schedule-aware session booking card.
 *
 * Replaces the 8-step multi_step flow with a single card. Backend
 * pre-fetches 5 days of calendar data (existing events + available
 * slots from the scheduling engine). The athlete picks a day, then
 * either taps an existing training session to update or an available
 * slot to create new. Focus + intensity selectors complete the form.
 * One tap on Confirm, one server call, done.
 *
 * Data shape: see ai-service/app/flow/patterns/scheduling_capsule.py
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
} from 'react-native';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type { CapsuleAction, VisualCard } from '../../../types/chat';
import { PillSelector } from './shared/PillSelector';
import { CapsuleSubmitButton } from './shared/CapsuleSubmitButton';

// ── Types ────────────────────────────────────────────────────────────

interface ExistingEvent {
  id: string;        // UUID from calendar_events table
  name: string;
  startTime: string; // "6:00 AM"
  endTime: string;   // "7:10 AM"
  type: string;
}

interface AvailableSlot {
  start24: string;   // "20:30"
  end24: string;     // "21:30"
  label: string;     // "8:30 PM - 9:30 PM"
  score: number;
}

interface DayData {
  date: string;           // "2026-04-16"
  label: string;          // "Today" / "Tomorrow" / "Friday"
  dayOfWeek: string;      // "Wednesday"
  existingEvents: ExistingEvent[];
  availableSlots: AvailableSlot[];
}

interface SchedulingContext {
  prefilledTitle?: string;
  prefilledDate?: string;
  prefilledFocus?: string;
  prefilledTime?: string;
  prefilledIntensity?: string;
  days: DayData[];
  focusOptions: Array<{ id: string; label: string }>;
  intensityOptions: Array<{ id: string; label: string }>;
  trainingCategories?: Array<{ id: string; label: string }>;
  readinessLevel?: string;
  sport?: string;
  durationMin?: number;
}

interface SchedulingCapsuleProps {
  card: VisualCard & { context?: SchedulingContext };
  onSubmit: (action: CapsuleAction) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────

function addMinutes(timeStr: string, minutes: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  const total = Math.min(h * 60 + (m || 0) + minutes, 23 * 60 + 59);
  const newH = Math.floor(total / 60);
  const newM = total % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

const DURATIONS = [
  { id: '30', label: '30 min' },
  { id: '45', label: '45 min' },
  { id: '60', label: '1 hr' },
  { id: '90', label: '1.5 hr' },
];

// ── Component ────────────────────────────────────────────────────────

export function SchedulingCapsuleComponent({ card, onSubmit }: SchedulingCapsuleProps) {
  const ctx = card.context as SchedulingContext | undefined;
  const days = ctx?.days ?? [];

  // Find the initial day index: prefilled date match or first day
  const initialDayIdx = useMemo(() => {
    if (ctx?.prefilledDate) {
      const idx = days.findIndex((d) => d.date === ctx.prefilledDate);
      if (idx >= 0) return idx;
    }
    return 0;
  }, [days, ctx?.prefilledDate]);

  const [selectedDayIdx, setSelectedDayIdx] = useState(initialDayIdx);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [selectedExisting, setSelectedExisting] = useState<ExistingEvent | null>(null);
  const [title, setTitle] = useState(ctx?.prefilledTitle ?? 'Training Session');
  const [focus, setFocus] = useState(ctx?.prefilledFocus ?? '');
  const [intensity, setIntensity] = useState(ctx?.prefilledIntensity ?? 'MODERATE');
  const [duration, setDuration] = useState(String(ctx?.durationMin ?? '60'));

  const selectedDay = days[selectedDayIdx] ?? null;
  const isRedReadiness = ctx?.readinessLevel === 'RED';

  // Filter existing events to only show tappable training sessions
  const trainingEvents = useMemo(() => {
    if (!selectedDay) return [];
    return selectedDay.existingEvents.filter(
      (e) => e.type === 'training' || e.type === 'match'
    );
  }, [selectedDay]);

  // Non-training events (shown as non-tappable context)
  const otherEvents = useMemo(() => {
    if (!selectedDay) return [];
    return selectedDay.existingEvents.filter(
      (e) => e.type !== 'training' && e.type !== 'match'
    );
  }, [selectedDay]);

  // When day changes, reset slot/existing selection
  const handleDayChange = (idx: number) => {
    setSelectedDayIdx(idx);
    setSelectedSlot(null);
    setSelectedExisting(null);
  };

  // Select an available slot (deselects existing)
  const handleSlotSelect = (slot: AvailableSlot) => {
    setSelectedSlot(slot);
    setSelectedExisting(null);
  };

  // Select an existing training event (deselects slot)
  const handleExistingSelect = (event: ExistingEvent) => {
    setSelectedExisting(event);
    setSelectedSlot(null);
  };

  // Validation
  const hasSelection = selectedSlot !== null || selectedExisting !== null;
  const canSubmit = hasSelection && focus && title.trim();

  // Intensity guard: if RED readiness, disable HARD
  const filteredIntensities = useMemo(() => {
    const options = ctx?.intensityOptions ?? [
      { id: 'LIGHT', label: 'Light' },
      { id: 'MODERATE', label: 'Moderate' },
      { id: 'HARD', label: 'Hard' },
    ];
    if (isRedReadiness) {
      return options.filter((o) => o.id !== 'HARD');
    }
    return options;
  }, [ctx?.intensityOptions, isRedReadiness]);

  // Ensure intensity isn't HARD when RED
  const safeIntensity = isRedReadiness && intensity === 'HARD' ? 'MODERATE' : intensity;

  const handleSubmit = () => {
    if (!selectedDay || !canSubmit) return;

    const computedEndTime = selectedSlot
      ? selectedSlot.end24
      : addMinutes('17:00', parseInt(duration) || 60);

    if (selectedSlot) {
      // Create new event at selected slot
      onSubmit({
        type: 'scheduling_capsule',
        toolName: 'create_event',
        toolInput: {
          title: title.trim(),
          event_type: 'training',
          date: selectedDay.date,
          start_time: selectedSlot.start24,
          end_time: selectedSlot.end24,
          intensity: safeIntensity,
          notes: focus ? `Focus: ${focus}` : '',
        },
        agentType: 'timeline',
      });
    } else if (selectedExisting) {
      // Update existing event with its UUID
      onSubmit({
        type: 'scheduling_capsule',
        toolName: 'update_event',
        toolInput: {
          event_id: selectedExisting.id,
          title: title.trim(),
          intensity: safeIntensity,
          notes: focus ? `Focus: ${focus}` : '',
        },
        agentType: 'timeline',
      });
    }
  };

  if (!selectedDay) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>No schedule data available.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── Title input ── */}
      <TextInput
        style={styles.titleInput}
        value={title}
        onChangeText={setTitle}
        placeholder="Session title"
        placeholderTextColor={colors.textSecondary}
      />

      {/* ── Day scroller ── */}
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
              <Text style={[styles.dayLabel, isSelected && styles.dayLabelSelected]}>
                {day.label}
              </Text>
              <Text style={[styles.daySlotCount, isSelected && styles.daySlotCountSelected]}>
                {slotCount > 0 ? `${slotCount} slot${slotCount > 1 ? 's' : ''}` : 'Full'}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── Readiness warning ── */}
      {isRedReadiness && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>
            Readiness is RED -- high intensity disabled
          </Text>
        </View>
      )}

      {/* ── Day schedule ── */}
      <View style={styles.scheduleSection}>
        <Text style={styles.sectionLabel}>
          {selectedDay.dayOfWeek} {selectedDay.date}
        </Text>

        {/* Existing events */}
        {selectedDay.existingEvents.length > 0 && (
          <View style={styles.eventGroup}>
            <Text style={styles.groupLabel}>YOUR DAY</Text>
            {selectedDay.existingEvents.map((ev, i) => {
              const isTraining = ev.type === 'training' || ev.type === 'match';
              const isSelected = selectedExisting?.id === ev.id;
              return (
                <Pressable
                  key={ev.id || `${ev.name}-${i}`}
                  onPress={isTraining ? () => handleExistingSelect(ev) : undefined}
                  disabled={!isTraining}
                  style={[
                    styles.eventRow,
                    isTraining && styles.eventRowTappable,
                    isSelected && styles.eventRowSelected,
                  ]}
                >
                  {isTraining && (
                    <View style={[styles.radio, isSelected && styles.radioSelected]} />
                  )}
                  <View style={styles.eventInfo}>
                    <Text style={[styles.eventName, !isTraining && styles.eventNameDimmed]}>
                      {ev.name}
                    </Text>
                    <Text style={styles.eventTime}>
                      {ev.startTime} - {ev.endTime}
                    </Text>
                  </View>
                  <View style={[styles.typeBadge, typeColor(ev.type)]}>
                    <Text style={styles.typeBadgeText}>{ev.type.toUpperCase()}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Available slots */}
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
                  <Text style={[styles.slotLabel, isSelected && styles.slotLabelSelected]}>
                    {slot.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptySlots}>
            <Text style={styles.emptyText}>
              No open slots this day -- try another day
            </Text>
          </View>
        )}
      </View>

      {/* ── Focus selector ── */}
      <PillSelector
        options={ctx?.focusOptions ?? []}
        selected={focus}
        onSelect={setFocus}
        label="Focus"
      />

      {/* ── Duration selector (new session only) ── */}
      {selectedSlot && (
        <PillSelector
          options={DURATIONS}
          selected={duration}
          onSelect={setDuration}
          label="Duration"
        />
      )}

      {/* ── Intensity selector ── */}
      <PillSelector
        options={filteredIntensities}
        selected={safeIntensity}
        onSelect={setIntensity}
        label="Intensity"
      />

      {/* ── Submit ── */}
      <CapsuleSubmitButton
        title={selectedExisting ? 'Update Session' : 'Book Session'}
        onPress={handleSubmit}
        disabled={!canSubmit}
      />
    </View>
  );
}

// ── Style helpers ─────────────────────────────────────────────────────

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

// ── Styles ──────────────────────────────────────────────────────────

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

  // Day scroller
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
    borderColor: colors.accent1,
    backgroundColor: `rgba(122, 155, 118, 0.12)`,
  },
  dayLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  dayLabelSelected: {
    color: colors.accent1,
  },
  daySlotCount: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    color: colors.textInactive,
    marginTop: 1,
  },
  daySlotCountSelected: {
    color: colors.accent1,
  },

  // Readiness warning
  warningBanner: {
    backgroundColor: `rgba(255, 80, 80, 0.1)`,
    borderRadius: borderRadius.sm,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  warningText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: '#FF5050',
  },

  // Schedule section
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

  // Event rows
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
  eventRowSelected: {
    borderWidth: 1,
    borderColor: colors.accent1,
    backgroundColor: `rgba(122, 155, 118, 0.08)`,
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

  // Radio indicator
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.glassBorder,
  },
  radioSelected: {
    borderColor: colors.accent1,
    backgroundColor: colors.accent1,
  },

  // Slot rows
  slotRow: {
    backgroundColor: `rgba(122, 155, 118, 0.04)`,
  },
  slotRowSelected: {
    borderWidth: 1,
    borderColor: colors.accent1,
    backgroundColor: `rgba(122, 155, 118, 0.12)`,
  },
  slotLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  slotLabelSelected: {
    color: colors.accent1,
  },

  // Empty state
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
