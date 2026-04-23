/**
 * SessionCompletionSheet — bottom-sheet modal for marking a scheduled
 * session completed or skipped.
 *
 * Visual language matches JournalSheet so the athlete sees one coherent
 * "post-session" family:
 *   - 45% dim overlay + flex-end panel
 *   - rounded-top sheet with handle bar, close button, and sage header
 *     icon
 *   - underline section headers, cream input bg, sage primary CTA
 *
 * Capture surfaces:
 *   - RPE slider (1–10, colour-coded via the existing Slider component)
 *   - Duration input (minutes, pre-filled from scheduled span)
 *   - Notes textarea (optional)
 *
 * Actions:
 *   - "Mark done" (sage primary) → POST /api/v1/calendar/events/:id/complete
 *   - "Skipped"   (ghost)        → POST /api/v1/calendar/events/:id/skip
 *
 * On success the sheet dismisses and calls `onConfirmed` so the caller
 * can refresh the plan view.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { Loader } from '../Loader';
import { spacing, borderRadius, fontFamily } from '../../theme';
import { Slider } from '../Slider';
import {
  confirmCalendarEventCompleted,
  skipCalendarEvent,
} from '../../services/api';
import { emitRefresh } from '../../utils/refreshBus';
import type { CalendarEvent } from '../../types';

interface SessionCompletionSheetProps {
  visible: boolean;
  event:   CalendarEvent | null;
  onClose: () => void;
  /** Fires after a successful complete/skip so callers can re-fetch. */
  onConfirmed?: (result: 'completed' | 'skipped') => void;
}

function scheduledDurationMinutes(event: CalendarEvent | null): number {
  if (!event || !event.startTime || !event.endTime) return 60;
  const toMinutes = (hhmm: string): number => {
    const [h, m] = hhmm.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
    return h * 60 + m;
  };
  const start = toMinutes(event.startTime);
  const end   = toMinutes(event.endTime);
  if (end <= start) return 60;
  return end - start;
}

export function SessionCompletionSheet({
  visible,
  event,
  onClose,
  onConfirmed,
}: SessionCompletionSheetProps) {
  const { colors } = useTheme();

  const [rpe, setRpe] = useState<number>(5);
  const [durationText, setDurationText] = useState<string>('60');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<'idle' | 'completing' | 'skipping'>('idle');

  // Reset state when sheet opens for a new event.
  useEffect(() => {
    if (visible && event) {
      setRpe(5);
      setDurationText(String(scheduledDurationMinutes(event)));
      setNotes('');
      setSubmitting('idle');
    }
  }, [visible, event]);

  const parsedDuration = useMemo<number | null>(() => {
    const n = Number(durationText);
    if (!Number.isFinite(n) || n <= 0 || n > 600) return null;
    return Math.round(n);
  }, [durationText]);

  async function handleComplete() {
    if (!event) return;
    if (parsedDuration == null) {
      Alert.alert('Check the duration', 'Duration should be between 1 and 600 minutes.');
      return;
    }
    setSubmitting('completing');
    try {
      await confirmCalendarEventCompleted(event.id, {
        rpe,
        duration: parsedDuration,
        notes: notes.trim() || undefined,
      });
      emitRefresh('calendar');
      onConfirmed?.('completed');
      onClose();
    } catch (err: any) {
      Alert.alert('Could not save', err?.message ?? 'Please try again.');
      setSubmitting('idle');
    }
  }

  async function handleSkip() {
    if (!event) return;
    setSubmitting('skipping');
    try {
      await skipCalendarEvent(event.id, {
        reason: notes.trim() || undefined,
      });
      emitRefresh('calendar');
      onConfirmed?.('skipped');
      onClose();
    } catch (err: any) {
      Alert.alert('Could not save', err?.message ?? 'Please try again.');
      setSubmitting('idle');
    }
  }

  if (!event) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={ms.overlay} onPress={onClose}>
        <KeyboardAvoidingView
          style={ms.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable
            style={[ms.sheet, { backgroundColor: colors.backgroundElevated }]}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Handle bar */}
            <View style={[ms.handleBar, { backgroundColor: colors.textMuted + '40' }]} />

            {/* Header */}
            <View style={ms.headerRow}>
              <Text style={[ms.headerEyebrow, { color: colors.accent1 }]}>HOW DID IT GO?</Text>
              <Pressable onPress={onClose} hitSlop={12}>
                <Text style={[ms.closeBtn, { color: colors.textMuted }]}>✕</Text>
              </Pressable>
            </View>
            <Text style={[ms.headerTitle, { color: colors.textOnDark }]} numberOfLines={2}>
              {event.name}
            </Text>

            <ScrollView style={ms.content} keyboardShouldPersistTaps="handled">
              <View style={ms.sectionGap} />

              {/* RPE */}
              <Slider
                label="Effort (RPE)"
                value={rpe}
                onChange={setRpe}
                min={1}
                max={10}
                lowLabel="Easy"
                highLabel="Max"
              />

              <View style={ms.sectionGap} />

              {/* Duration */}
              <Text style={[ms.label, { color: colors.textSecondary }]}>
                Actual duration (minutes)
              </Text>
              <TextInput
                style={[
                  ms.durationInput,
                  { backgroundColor: colors.inputBackground, color: colors.textPrimary },
                ]}
                value={durationText}
                onChangeText={setDurationText}
                keyboardType="number-pad"
                maxLength={3}
                placeholder="60"
                placeholderTextColor={colors.textInactive}
              />

              <View style={ms.sectionGap} />

              {/* Notes */}
              <Text style={[ms.label, { color: colors.textSecondary }]}>
                Notes (optional)
              </Text>
              <TextInput
                style={[
                  ms.notesInput,
                  { backgroundColor: colors.inputBackground, color: colors.textPrimary },
                ]}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
                maxLength={500}
                placeholder="Any details worth remembering?"
                placeholderTextColor={colors.textInactive}
              />

              <View style={ms.actions}>
                <Pressable
                  onPress={handleSkip}
                  disabled={submitting !== 'idle'}
                  style={[
                    ms.skipBtn,
                    { borderColor: colors.textMuted + '40' },
                    submitting !== 'idle' && { opacity: 0.4 },
                  ]}
                >
                  {submitting === 'skipping' ? (
                    <Loader size="sm" />
                  ) : (
                    <Text style={[ms.skipText, { color: colors.textSecondary }]}>Skipped it</Text>
                  )}
                </Pressable>

                <Pressable
                  onPress={handleComplete}
                  disabled={submitting !== 'idle' || parsedDuration == null}
                  style={[
                    ms.submitBtn,
                    { backgroundColor: colors.accent1 },
                    (submitting !== 'idle' || parsedDuration == null) && { opacity: 0.6 },
                  ]}
                >
                  {submitting === 'completing' ? (
                    <Loader size="sm" />
                  ) : (
                    <Text style={[ms.submitText, { color: colors.background }]}>Mark done</Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const ms = StyleSheet.create({
  overlay: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent:  'flex-end',
  },
  keyboardView: {
    flex:          1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius:  16,
    borderTopRightRadius: 16,
    paddingTop:        8,
    paddingBottom:     40,
    paddingHorizontal: spacing.lg,
    maxHeight:         '80%',
  },
  handleBar: {
    width:        36,
    height:       4,
    borderRadius: 2,
    alignSelf:    'center',
    marginBottom: 12,
  },
  headerRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   4,
  },
  headerEyebrow: {
    fontFamily:    fontFamily.medium,
    fontSize:      11,
    letterSpacing: 1,
  },
  closeBtn: {
    fontFamily: fontFamily.medium,
    fontSize:   18,
    paddingHorizontal: 4,
  },
  headerTitle: {
    fontFamily: fontFamily.bold,
    fontSize:   18,
    marginBottom: 16,
  },
  content: {
    flexGrow:   1,
    flexShrink: 1,
  },
  sectionGap: {
    height: spacing.md,
  },
  label: {
    fontFamily:   fontFamily.medium,
    fontSize:     13,
    marginBottom: 8,
  },
  durationInput: {
    borderRadius: borderRadius.sm,
    padding:      spacing.sm,
    fontFamily:   fontFamily.regular,
    fontSize:     15,
  },
  notesInput: {
    borderRadius:    borderRadius.sm,
    padding:         spacing.sm,
    fontFamily:      fontFamily.regular,
    fontSize:        14,
    minHeight:       72,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    gap:           spacing.sm,
    marginTop:     spacing.lg,
  },
  skipBtn: {
    flex:           1,
    paddingVertical: 14,
    borderRadius:   borderRadius.full,
    borderWidth:    1,
    alignItems:     'center',
  },
  skipText: {
    fontFamily: fontFamily.medium,
    fontSize:   14,
  },
  submitBtn: {
    flex:           2,
    paddingVertical: 14,
    borderRadius:   borderRadius.full,
    alignItems:     'center',
  },
  submitText: {
    fontFamily: fontFamily.bold,
    fontSize:   14,
  },
});
