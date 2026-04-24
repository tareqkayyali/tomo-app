/**
 * EventEditCapsule — Inline calendar event form within chat.
 *
 * Create mode is a single self-contained card: title, type, day picker,
 * smart-slot suggestions (from the 5-day pre-fetch) with an inline
 * custom-time wheel, duration, intensity, training category, linked
 * program, and optional notes. "Custom time" expands in place — no
 * chat round-trip. Matches the interaction model of SchedulingCapsule
 * and StudyScheduleCapsule.
 *
 * Update/delete modes keep the pre-existing flow.
 *
 * Backend tool contract: `create_event` expects snake_case
 * `start_time` / `end_time` plus `linked_program_slugs[]`
 * (see ai-service/app/agents/tools/timeline_tools.py:217).
 */

import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type {
  EventEditCapsule as EventEditCapsuleType,
  CapsuleAction,
} from '../../../types/chat';
import { PillSelector } from './shared/PillSelector';
import { CapsuleSubmitButton } from './shared/CapsuleSubmitButton';

interface EventEditCapsuleProps {
  card: EventEditCapsuleType;
  onSubmit: (action: CapsuleAction) => void;
}

const EVENT_TYPES = [
  { id: 'training', label: 'Training' },
  { id: 'match', label: 'Match' },
  { id: 'recovery', label: 'Recovery' },
  { id: 'study', label: 'Study' },
  { id: 'exam', label: 'Exam' },
  { id: 'other', label: 'Other' },
];

const DEFAULT_TRAINING_CATEGORIES = [
  { id: 'club', label: 'Club / Academy' },
  { id: 'gym', label: 'Gym' },
  { id: 'personal', label: 'Personal' },
];

const DURATIONS = [
  { id: '30', label: '30 min' },
  { id: '45', label: '45 min' },
  { id: '60', label: '1 hr' },
  { id: '90', label: '1.5 hr' },
  { id: '120', label: '2 hr' },
];

const INTENSITIES = [
  { id: 'LIGHT', label: 'Light' },
  { id: 'MODERATE', label: 'Moderate' },
  { id: 'HARD', label: 'Hard' },
];

const SMART_SLOT_COUNT = 4;
const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = [0, 15, 30, 45];

function to24h(hour12: number, minute: number, period: 'AM' | 'PM'): string {
  let h = hour12 % 12;
  if (period === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function from24h(t: string): { hour12: number; minute: number; period: 'AM' | 'PM' } {
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10) || 0;
  const m = parseInt(mStr, 10) || 0;
  const period: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return { hour12, minute: m, period };
}

function formatTimeLabel(t: string): string {
  if (!t) return '';
  const { hour12, minute, period } = from24h(t);
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const totalMin = (h || 0) * 60 + (m || 0) + minutes;
  const newH = Math.min(Math.floor(totalMin / 60), 23);
  const newM = totalMin % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

export function EventEditCapsuleComponent({
  card,
  onSubmit,
}: EventEditCapsuleProps) {
  const isCreate = card.mode === 'create';
  const isDelete = card.mode === 'delete';

  const days = useMemo(() => card.days ?? [], [card.days]);
  const initialDate =
    card.prefilledDate ??
    days[0]?.date ??
    new Date().toISOString().slice(0, 10);

  const [title, setTitle] = useState(card.prefilledTitle ?? '');
  const [eventType, setEventType] = useState(card.prefilledEventType ?? '');
  const [date, setDate] = useState(initialDate);
  const [startTime, setStartTime] = useState(card.prefilledStartTime ?? '');
  const [duration, setDuration] = useState(String(card.prefilledDuration ?? '60'));
  const [intensity, setIntensity] = useState(
    card.prefilledIntensity ?? 'MODERATE',
  );
  const [category, setCategory] = useState(card.prefilledCategory ?? '');
  const [linkedProgramSlug, setLinkedProgramSlug] = useState(
    card.prefilledLinkedProgramSlug ?? '',
  );
  const [notes, setNotes] = useState(card.prefilledNotes ?? '');
  const [notesOpen, setNotesOpen] = useState(Boolean(card.prefilledNotes));
  const [customOpen, setCustomOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState(
    card.selectedEventId ?? '',
  );

  const selectedDay = useMemo(
    () => days.find((d) => d.date === date),
    [days, date],
  );

  // Smart slot suggestions — 4 top-scored open slots for the selected day.
  const smartSlots = useMemo(() => {
    if (!selectedDay) return [];
    const slots = [...(selectedDay.availableSlots ?? [])]
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, SMART_SLOT_COUNT);
    return slots;
  }, [selectedDay]);

  // Delete-mode picker (unchanged)
  if (isDelete && card.existingEvents && card.existingEvents.length > 0 && !selectedEventId) {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>Cancel which event?</Text>
        <PillSelector
          options={card.existingEvents.map((e) => ({
            id: e.id,
            label: `${e.title} (${e.startTime})`,
          }))}
          selected={selectedEventId}
          onSelect={(id) => {
            const event = card.existingEvents?.find((e) => e.id === id);
            if (event) {
              onSubmit({
                type: 'event_edit_capsule',
                toolName: 'delete_event',
                toolInput: { eventId: event.id, eventTitle: event.title },
                agentType: 'timeline',
              });
            }
          }}
          label="Select event"
        />
      </View>
    );
  }

  const isTraining = eventType === 'training';
  const showIntensity = isTraining || eventType === 'match';
  const showCategory = isTraining;
  const showLinkedProgram =
    (isTraining || eventType === 'match') && (card.linkedPrograms?.length ?? 0) > 0;

  const computedEndTime = startTime
    ? addMinutes(startTime, parseInt(duration, 10) || 60)
    : '';

  const canSubmit = isCreate
    ? Boolean(title.trim() && eventType && date && startTime)
    : Boolean(selectedEventId);

  const handleSubmit = () => {
    if (isCreate) {
      onSubmit({
        type: 'event_edit_capsule',
        toolName: 'create_event',
        toolInput: {
          title: title.trim(),
          event_type: eventType,
          date,
          start_time: startTime,
          end_time: computedEndTime,
          ...(showIntensity ? { intensity } : {}),
          ...(showCategory && category
            ? { notes: [notes.trim(), `Category: ${category}`].filter(Boolean).join('\n') }
            : notes.trim()
              ? { notes: notes.trim() }
              : {}),
          ...(showLinkedProgram && linkedProgramSlug
            ? { linked_program_slugs: [linkedProgramSlug] }
            : {}),
        },
        agentType: 'timeline',
      });
    } else {
      onSubmit({
        type: 'event_edit_capsule',
        toolName: 'update_event',
        toolInput: {
          event_id: selectedEventId,
          ...(title ? { title: title.trim() } : {}),
          ...(date ? { date } : {}),
          ...(startTime ? { start_time: startTime } : {}),
          ...(computedEndTime ? { end_time: computedEndTime } : {}),
          ...(intensity ? { intensity } : {}),
        },
        agentType: 'timeline',
      });
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>
        {isCreate ? 'Add event' : 'Edit event'}
      </Text>

      {/* Title */}
      <TextInput
        style={styles.titleInput}
        placeholder="Event title (e.g. Club Training)"
        placeholderTextColor={colors.textSecondary}
        value={title}
        onChangeText={setTitle}
      />

      {/* Event type */}
      <PillSelector
        options={EVENT_TYPES}
        selected={eventType}
        onSelect={setEventType}
        label="Type"
      />

      {/* Category (training only) */}
      {showCategory && (
        <PillSelector
          options={
            card.trainingCategories
              ? card.trainingCategories.map((c) => ({ id: c.id, label: c.label }))
              : DEFAULT_TRAINING_CATEGORIES
          }
          selected={category}
          onSelect={setCategory}
          label="Category"
        />
      )}

      {/* Day picker — horizontal scroll of the pre-fetched days */}
      {days.length > 0 && (
        <View style={styles.block}>
          <Text style={styles.fieldLabel}>Day</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dayRow}
          >
            {days.map((d) => {
              const active = d.date === date;
              return (
                <Pressable
                  key={d.date}
                  onPress={() => {
                    setDate(d.date);
                    // Clear slot since the smart-slot set changes per day.
                    setStartTime('');
                  }}
                  style={[styles.dayChip, active && styles.dayChipActive]}
                >
                  <Text
                    style={[
                      styles.dayChipLabel,
                      active && styles.dayChipLabelActive,
                    ]}
                  >
                    {d.label}
                  </Text>
                  <Text
                    style={[
                      styles.dayChipSub,
                      active && styles.dayChipSubActive,
                    ]}
                  >
                    {d.dayOfWeek}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Start time — smart slots + inline custom-time expansion */}
      <View style={styles.block}>
        <Text style={styles.fieldLabel}>Start time</Text>
        <View style={styles.slotWrap}>
          {smartSlots.map((slot) => {
            const active = startTime === slot.start24;
            return (
              <Pressable
                key={slot.start24}
                onPress={() => {
                  setStartTime(slot.start24);
                  setCustomOpen(false);
                }}
                style={[styles.slotPill, active && styles.slotPillActive]}
              >
                <Text
                  style={[
                    styles.slotLabel,
                    active && styles.slotLabelActive,
                  ]}
                >
                  {formatTimeLabel(slot.start24)}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => setCustomOpen((v) => !v)}
            style={[
              styles.slotPill,
              customOpen && styles.slotPillActive,
            ]}
          >
            <Text
              style={[
                styles.slotLabel,
                customOpen && styles.slotLabelActive,
              ]}
            >
              {customOpen && startTime && !smartSlots.some((s) => s.start24 === startTime)
                ? formatTimeLabel(startTime)
                : 'Custom'}
            </Text>
          </Pressable>
        </View>

        {customOpen && (
          <InlineTimePicker
            value={startTime}
            onChange={setStartTime}
          />
        )}
      </View>

      {/* Duration */}
      <PillSelector
        options={DURATIONS}
        selected={duration}
        onSelect={setDuration}
        label="Duration"
      />

      {/* Intensity */}
      {showIntensity && (
        <PillSelector
          options={INTENSITIES}
          selected={intensity}
          onSelect={(id) =>
            setIntensity(id as 'REST' | 'LIGHT' | 'MODERATE' | 'HARD')
          }
          label="Intensity"
        />
      )}

      {/* Linked program (training / match only) */}
      {showLinkedProgram && (
        <View style={styles.block}>
          <Text style={styles.fieldLabel}>Linked program</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dayRow}
          >
            <Pressable
              onPress={() => setLinkedProgramSlug('')}
              style={[
                styles.linkedPill,
                !linkedProgramSlug && styles.linkedPillActive,
              ]}
            >
              <Text
                style={[
                  styles.linkedLabel,
                  !linkedProgramSlug && styles.linkedLabelActive,
                ]}
              >
                None
              </Text>
            </Pressable>
            {(card.linkedPrograms ?? []).map((p) => {
              const active = linkedProgramSlug === p.slug;
              return (
                <Pressable
                  key={p.slug}
                  onPress={() => setLinkedProgramSlug(p.slug)}
                  style={[
                    styles.linkedPill,
                    active && styles.linkedPillActive,
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.linkedLabel,
                      active && styles.linkedLabelActive,
                    ]}
                  >
                    {p.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Notes (collapsed) */}
      <Pressable
        onPress={() => setNotesOpen((v) => !v)}
        style={styles.notesToggle}
      >
        <Text style={styles.notesToggleText}>
          {notesOpen ? 'Hide notes' : 'Add notes'}
        </Text>
      </Pressable>

      {notesOpen && (
        <TextInput
          style={styles.notesInput}
          placeholder="Optional notes"
          placeholderTextColor={colors.textSecondary}
          multiline
          value={notes}
          onChangeText={setNotes}
        />
      )}

      <CapsuleSubmitButton
        title={isCreate ? 'Add to Calendar' : 'Save Changes'}
        disabled={!canSubmit}
        onPress={handleSubmit}
      />
    </View>
  );
}

// ── Inline time wheel ──────────────────────────────────────────────

interface InlineTimePickerProps {
  value: string;
  onChange: (t: string) => void;
}

function InlineTimePicker({ value, onChange }: InlineTimePickerProps) {
  const parsed = value ? from24h(value) : { hour12: 7, minute: 0, period: 'PM' as const };
  const [hour12, setHour12] = useState(parsed.hour12);
  const [minute, setMinute] = useState(parsed.minute);
  const [period, setPeriod] = useState<'AM' | 'PM'>(parsed.period);

  const commit = (h: number, m: number, p: 'AM' | 'PM') => {
    setHour12(h);
    setMinute(m);
    setPeriod(p);
    onChange(to24h(h, m, p));
  };

  return (
    <View style={styles.wheelWrap}>
      <View style={styles.wheelColumn}>
        <Text style={styles.wheelLabel}>Hour</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.wheelRow}
        >
          {HOURS_12.map((h) => {
            const active = h === hour12;
            return (
              <Pressable
                key={h}
                onPress={() => commit(h, minute, period)}
                style={[styles.wheelCell, active && styles.wheelCellActive]}
              >
                <Text
                  style={[
                    styles.wheelCellText,
                    active && styles.wheelCellTextActive,
                  ]}
                >
                  {h}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.wheelColumn}>
        <Text style={styles.wheelLabel}>Min</Text>
        <View style={styles.wheelRow}>
          {MINUTES.map((m) => {
            const active = m === minute;
            return (
              <Pressable
                key={m}
                onPress={() => commit(hour12, m, period)}
                style={[styles.wheelCell, active && styles.wheelCellActive]}
              >
                <Text
                  style={[
                    styles.wheelCellText,
                    active && styles.wheelCellTextActive,
                  ]}
                >
                  :{String(m).padStart(2, '0')}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.wheelColumn}>
        <Text style={styles.wheelLabel}>AM/PM</Text>
        <View style={styles.wheelRow}>
          {(['AM', 'PM'] as const).map((p) => {
            const active = p === period;
            return (
              <Pressable
                key={p}
                onPress={() => commit(hour12, minute, p)}
                style={[styles.wheelCell, active && styles.wheelCellActive]}
              >
                <Text
                  style={[
                    styles.wheelCellText,
                    active && styles.wheelCellTextActive,
                  ]}
                >
                  {p}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
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
  titleInput: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.inputBackground,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  block: {
    gap: spacing.xs,
  },
  fieldLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 9.5,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.textSecondary,
  },
  dayRow: {
    gap: spacing.xs,
    paddingVertical: 2,
  },
  dayChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBackground,
    alignItems: 'center',
    minWidth: 80,
  },
  dayChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSubtle,
  },
  dayChipLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  dayChipLabelActive: {
    color: colors.accent,
  },
  dayChipSub: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  dayChipSubActive: {
    color: colors.accent,
  },
  slotWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  slotPill: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBackground,
  },
  slotPillActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSubtle,
  },
  slotLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  slotLabelActive: {
    color: colors.accent,
  },
  wheelWrap: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
    backgroundColor: colors.inputBackground,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
  },
  wheelColumn: {
    flex: 1,
    gap: 4,
  },
  wheelLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.textSecondary,
  },
  wheelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  wheelCell: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: borderRadius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    minWidth: 34,
    alignItems: 'center',
  },
  wheelCellActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSubtle,
  },
  wheelCellText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  wheelCellTextActive: {
    color: colors.accent,
  },
  linkedPill: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBackground,
    maxWidth: 220,
  },
  linkedPillActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSubtle,
  },
  linkedLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  linkedLabelActive: {
    color: colors.accent,
  },
  notesToggle: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  notesToggleText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.accent,
  },
  notesInput: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.inputBackground,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 64,
    textAlignVertical: 'top',
  },
});
