/**
 * EventEditCapsule — Inline calendar event form within chat.
 * Supports create, update, and delete modes.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type { EventEditCapsule as EventEditCapsuleType, CapsuleAction } from '../../../types/chat';
import { PillSelector } from './shared/PillSelector';
import { CapsuleDateChip } from './shared/CapsuleDateChip';
import { CapsuleSubmitButton } from './shared/CapsuleSubmitButton';

interface EventEditCapsuleProps {
  card: EventEditCapsuleType;
  onSubmit: (action: CapsuleAction) => void;
}

const EVENT_TYPES = [
  { id: 'training', label: '🏃 Training' },
  { id: 'match', label: '⚽ Match' },
  { id: 'recovery', label: '🩹 Recovery' },
  { id: 'study', label: '📚 Study' },
  { id: 'exam', label: '📝 Exam' },
  { id: 'other', label: '📌 Other' },
];

// Default fallback categories if player hasn't configured any
const DEFAULT_TRAINING_CATEGORIES = [
  { id: 'club', label: '⚽ Club / Academy' },
  { id: 'gym', label: '🏋️ Gym' },
  { id: 'personal', label: '🏃 Personal' },
];

const DURATIONS = [
  { id: '30', label: '30 min' },
  { id: '45', label: '45 min' },
  { id: '60', label: '1 hr' },
  { id: '90', label: '1.5 hr' },
  { id: '120', label: '2 hr' },
];

const INTENSITIES = [
  { id: 'LIGHT', label: '🟢 Light' },
  { id: 'MODERATE', label: '🟡 Moderate' },
  { id: 'HARD', label: '🔴 Hard' },
];

const TIME_SLOTS = [
  { id: '06:00', label: '6am' },
  { id: '07:00', label: '7am' },
  { id: '08:00', label: '8am' },
  { id: '09:00', label: '9am' },
  { id: '10:00', label: '10am' },
  { id: '14:00', label: '2pm' },
  { id: '15:00', label: '3pm' },
  { id: '16:00', label: '4pm' },
  { id: '17:00', label: '5pm' },
  { id: '18:00', label: '6pm' },
  { id: '19:00', label: '7pm' },
  { id: '20:00', label: '8pm' },
];

export function EventEditCapsuleComponent({ card, onSubmit }: EventEditCapsuleProps) {
  const [title, setTitle] = useState(card.prefilledTitle ?? '');
  const [eventType, setEventType] = useState(card.prefilledEventType ?? '');
  const [date, setDate] = useState(card.prefilledDate ?? '');
  const [startTime, setStartTime] = useState(card.prefilledStartTime ?? '');
  const [duration, setDuration] = useState(String(card.prefilledDuration ?? '60'));
  const [intensity, setIntensity] = useState(card.prefilledIntensity ?? 'MODERATE');
  const [category, setCategory] = useState(card.prefilledCategory ?? '');
  const [selectedEventId, setSelectedEventId] = useState(card.selectedEventId ?? '');

  const isCreate = card.mode === 'create';
  const isDelete = card.mode === 'delete';

  // For delete mode with existing events to pick from
  if (isDelete && card.existingEvents && card.existingEvents.length > 0 && !selectedEventId) {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>🗑️ Cancel which event?</Text>
        <PillSelector
          options={card.existingEvents.map(e => ({
            id: e.id,
            label: `${e.title} (${e.startTime})`,
          }))}
          selected={selectedEventId}
          onSelect={(id) => {
            const event = card.existingEvents?.find(e => e.id === id);
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

  // Calculate end time from start + duration
  const computedEndTime = startTime ? addMinutes(startTime, parseInt(duration) || 60) : '';

  const isTraining = eventType === 'training';
  const showIntensity = isTraining || eventType === 'match';

  const canSubmit = isCreate
    ? title.trim() && eventType && date && startTime
    : selectedEventId;

  const handleSubmit = () => {
    if (isCreate) {
      onSubmit({
        type: 'event_edit_capsule',
        toolName: 'create_event',
        toolInput: {
          title: title.trim(),
          event_type: eventType,
          date,
          startTime,
          endTime: computedEndTime,
          ...(showIntensity ? { intensity } : {}),
          ...(isTraining && category ? { notes: `Category: ${category}` } : {}),
        },
        agentType: 'timeline',
      });
    } else {
      // Update mode
      onSubmit({
        type: 'event_edit_capsule',
        toolName: 'update_event',
        toolInput: {
          eventId: selectedEventId,
          ...(title ? { title: title.trim() } : {}),
          ...(date ? { date } : {}),
          ...(startTime ? { startTime } : {}),
          ...(computedEndTime ? { endTime: computedEndTime } : {}),
          ...(intensity ? { intensity } : {}),
        },
        agentType: 'timeline',
      });
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>
        {isCreate ? '📅 Add event' : '✏️ Edit event'}
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

      {/* Training Category (training only) — uses player's custom categories */}
      {isTraining && (
        <PillSelector
          options={
            card.trainingCategories
              ? card.trainingCategories.map(c => ({ id: c.id, label: c.label }))
              : DEFAULT_TRAINING_CATEGORIES
          }
          selected={category}
          onSelect={setCategory}
          label="Category"
        />
      )}

      {/* Date */}
      <CapsuleDateChip value={date} onChange={setDate} />

      {/* Start time */}
      <PillSelector
        options={TIME_SLOTS}
        selected={startTime}
        onSelect={setStartTime}
        label="Start time"
      />

      {/* Duration */}
      <PillSelector
        options={DURATIONS}
        selected={duration}
        onSelect={setDuration}
        label="Duration"
      />

      {/* Intensity (training/match only) */}
      {showIntensity && (
        <PillSelector
          options={INTENSITIES}
          selected={intensity}
          onSelect={(id) => setIntensity(id as 'REST' | 'LIGHT' | 'MODERATE' | 'HARD')}
          label="Intensity"
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

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const totalMin = h * 60 + (m ?? 0) + minutes;
  const newH = Math.min(Math.floor(totalMin / 60), 23);
  const newM = totalMin % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
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
});
