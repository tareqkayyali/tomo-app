/**
 * Parent Add Study Screen
 * Form to suggest a study block for a child.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SmartIcon } from '../../components/SmartIcon';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useTheme } from '../../hooks/useTheme';
import { PlayerScreen } from '../../components/tomo-ui/playerDesign';
import { suggestStudyBlock } from '../../services/api';
import { spacing, borderRadius, fontFamily } from '../../theme';
import type { ParentStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ParentStackParamList, 'ParentAddStudy'>;

// ── Constants ───────────────────────────────────────────────────────

const SUBJECTS = ['Math', 'Physics', 'English', 'Biology', 'History', 'Other'];
const DURATIONS = [
  { label: '30 min', minutes: 30 },
  { label: '45 min', minutes: 45 },
  { label: '60 min', minutes: 60 },
  { label: '90 min', minutes: 90 },
];
const PRIORITIES = ['Low', 'Medium', 'High'] as const;
const HOURS = Array.from({ length: 16 }, (_, i) => i + 7); // 7-22

// ── Component ───────────────────────────────────────────────────────

export function ParentAddStudyScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const { childId, childName } = route.params;

  const [subject, setSubject] = useState('');
  const [customSubject, setCustomSubject] = useState('');
  const [startHour, setStartHour] = useState(15);
  const [duration, setDuration] = useState(60);
  const [priority, setPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const effectiveSubject = subject === 'Other' ? customSubject : subject;

  const handleSubmit = useCallback(async () => {
    if (!effectiveSubject.trim()) {
      if (Platform.OS === 'web') {
        window.alert('Please select or enter a subject.');
      } else {
        Alert.alert('Missing subject', 'Please select or enter a subject.');
      }
      return;
    }

    setSubmitting(true);
    try {
      const startAt = new Date();
      startAt.setHours(startHour, 0, 0, 0);

      const endAt = new Date(startAt.getTime() + duration * 60 * 1000);

      await suggestStudyBlock(childId, {
        subject: effectiveSubject,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        priority: priority.toLowerCase(),
        notes: notes.trim() || undefined,
      });

      setSuccess(true);
    } catch (err: any) {
      if (Platform.OS === 'web') {
        window.alert(err?.message || 'Failed to create study block.');
      } else {
        Alert.alert('Error', err?.message || 'Failed to create study block.');
      }
    } finally {
      setSubmitting(false);
    }
  }, [effectiveSubject, startHour, duration, priority, notes, childId]);

  if (success) {
    return (
      <PlayerScreen label="STUDY" title="Add block" onBack={() => navigation.goBack()} scroll={false}>
        <View style={styles.successContainer}>
          <View style={[styles.successIcon, { backgroundColor: colors.success + '22' }]}>
            <SmartIcon name="checkmark-circle" size={64} color={colors.success} />
          </View>
          <Text style={[styles.successTitle, { color: colors.textOnDark }]}>Study Block Added</Text>
          <Text style={[styles.successSubtitle, { color: colors.textSecondary }]}>
            {effectiveSubject} session suggested for {childName}
          </Text>
          <TouchableOpacity
            style={[styles.doneButton, { backgroundColor: colors.accent1 }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={[styles.doneButtonText, { color: colors.textOnDark }]}>Done</Text>
          </TouchableOpacity>
        </View>
      </PlayerScreen>
    );
  }

  return (
    <PlayerScreen label="STUDY" title="Add block" onBack={() => navigation.goBack()}>
      <View style={styles.scroll}>
        <Text style={[styles.header, { color: colors.textOnDark }]}>
          Add Study Block for {childName}
        </Text>

        {/* Subject picker */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>Subject</Text>
        <View style={styles.chipRow}>
          {SUBJECTS.map((s) => (
            <TouchableOpacity
              key={s}
              style={[
                styles.chip,
                {
                  backgroundColor: subject === s ? colors.accent1 : colors.surface,
                  borderColor: subject === s ? colors.accent1 : colors.border,
                },
              ]}
              onPress={() => setSubject(s)}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: subject === s ? colors.textOnDark : colors.textOnDark },
                ]}
              >
                {s}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {subject === 'Other' && (
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, color: colors.textOnDark, borderColor: colors.border }]}
            placeholder="Enter subject..."
            placeholderTextColor={colors.textSecondary}
            value={customSubject}
            onChangeText={setCustomSubject}
          />
        )}

        {/* Start time */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>Start Time</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hourScroll}>
          {HOURS.map((h) => (
            <TouchableOpacity
              key={h}
              style={[
                styles.hourChip,
                {
                  backgroundColor: startHour === h ? colors.accent1 : colors.surface,
                  borderColor: startHour === h ? colors.accent1 : colors.border,
                },
              ]}
              onPress={() => setStartHour(h)}
            >
              <Text
                style={[
                  styles.hourText,
                  { color: startHour === h ? colors.textOnDark : colors.textOnDark },
                ]}
              >
                {`${String(h).padStart(2, '0')}:00`}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Duration */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>Duration</Text>
        <View style={styles.chipRow}>
          {DURATIONS.map((d) => (
            <TouchableOpacity
              key={d.minutes}
              style={[
                styles.chip,
                {
                  backgroundColor: duration === d.minutes ? colors.accent1 : colors.surface,
                  borderColor: duration === d.minutes ? colors.accent1 : colors.border,
                },
              ]}
              onPress={() => setDuration(d.minutes)}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: duration === d.minutes ? colors.textOnDark : colors.textOnDark },
                ]}
              >
                {d.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Priority */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>Priority</Text>
        <View style={styles.chipRow}>
          {PRIORITIES.map((p) => {
            const priorityColors: Record<string, string> = {
              Low: colors.success,
              Medium: colors.warning,
              High: colors.error,
            };
            const isSelected = priority === p;
            return (
              <TouchableOpacity
                key={p}
                style={[
                  styles.chip,
                  {
                    backgroundColor: isSelected ? priorityColors[p] + '33' : colors.surface,
                    borderColor: isSelected ? priorityColors[p] : colors.border,
                  },
                ]}
                onPress={() => setPriority(p)}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: isSelected ? priorityColors[p] : colors.textOnDark },
                  ]}
                >
                  {p}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Notes */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>Notes (optional)</Text>
        <TextInput
          style={[styles.textArea, { backgroundColor: colors.surface, color: colors.textOnDark, borderColor: colors.border }]}
          placeholder="Any additional details..."
          placeholderTextColor={colors.textSecondary}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
        />

        {/* Submit */}
        <TouchableOpacity
          style={[
            styles.submitButton,
            { backgroundColor: effectiveSubject.trim() ? colors.accent1 : colors.surface },
          ]}
          onPress={handleSubmit}
          disabled={submitting || !effectiveSubject.trim()}
        >
          {submitting ? (
            <ActivityIndicator color={colors.textOnDark} />
          ) : (
            <Text style={[styles.submitText, { color: colors.textOnDark }]}>Suggest Study Block</Text>
          )}
        </TouchableOpacity>
      </View>
    </PlayerScreen>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    padding: spacing.lg,
    paddingBottom: 40,
  },
  header: {
    fontSize: 20,
    fontFamily: fontFamily.bold,
    marginBottom: spacing.xl,
  },
  label: {
    fontSize: 13,
    fontFamily: fontFamily.semiBold,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Chips
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 14,
    fontFamily: fontFamily.medium,
  },

  // Hour scroll
  hourScroll: {
    marginBottom: spacing.xs,
  },
  hourChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginRight: spacing.sm,
  },
  hourText: {
    fontSize: 14,
    fontFamily: fontFamily.semiBold,
  },

  // Input
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 15,
    marginTop: spacing.sm,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
  },

  // Submit
  submitButton: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  submitText: {
    fontSize: 16,
    fontFamily: fontFamily.bold,
  },

  // Success
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  successIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  successTitle: {
    fontSize: 22,
    fontFamily: fontFamily.bold,
    marginBottom: spacing.sm,
  },
  successSubtitle: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  doneButton: {
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  doneButtonText: {
    fontSize: 16,
    fontFamily: fontFamily.bold,
  },
});
