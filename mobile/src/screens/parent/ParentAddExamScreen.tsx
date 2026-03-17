/**
 * Parent Add Exam Screen
 * Form to add an exam date for a child.
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
  SafeAreaView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useTheme } from '../../hooks/useTheme';
import { suggestExam } from '../../services/api';
import { spacing, borderRadius, fontFamily } from '../../theme';
import type { ParentStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ParentStackParamList, 'ParentAddExam'>;

// ── Constants ───────────────────────────────────────────────────────

const SUBJECTS = ['Math', 'Physics', 'English', 'Biology', 'History', 'Other'];
const EXAM_TYPES = ['Quiz', 'Mid-term', 'Final', 'Essay', 'Presentation'];

// ── Component ───────────────────────────────────────────────────────

export function ParentAddExamScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const { childId, childName } = route.params;

  const [subject, setSubject] = useState('');
  const [customSubject, setCustomSubject] = useState('');
  const [examType, setExamType] = useState('');
  const [examDate, setExamDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const effectiveSubject = subject === 'Other' ? customSubject : subject;

  // Generate next 30 days for quick date selection
  const dateOptions = React.useMemo(() => {
    const result: { label: string; value: string }[] = [];
    const now = new Date();
    for (let i = 1; i <= 30; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      const iso = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      result.push({ label, value: iso });
    }
    return result;
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!effectiveSubject.trim()) {
      Alert.alert('Missing subject', 'Please select or enter a subject.');
      return;
    }
    if (!examType) {
      Alert.alert('Missing exam type', 'Please select an exam type.');
      return;
    }
    if (!examDate) {
      Alert.alert('Missing date', 'Please select an exam date.');
      return;
    }

    setSubmitting(true);
    try {
      await suggestExam(childId, {
        subject: effectiveSubject,
        examType,
        examDate,
        notes: notes.trim() || undefined,
      });
      setSuccess(true);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to add exam.');
    } finally {
      setSubmitting(false);
    }
  }, [effectiveSubject, examType, examDate, notes, childId]);

  if (success) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.successContainer}>
          <View style={[styles.successIcon, { backgroundColor: colors.error + '22' }]}>
            <Ionicons name="document-text" size={64} color={colors.error} />
          </View>
          <Text style={[styles.successTitle, { color: colors.textOnDark }]}>Exam Added</Text>
          <Text style={[styles.successSubtitle, { color: colors.textSecondary }]}>
            {effectiveSubject} {examType} on {examDate} for {childName}
          </Text>
          <TouchableOpacity
            style={[styles.doneButton, { backgroundColor: colors.accent1 }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={[styles.doneButtonText, { color: colors.textOnDark }]}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.header, { color: colors.textOnDark }]}>
          Add Exam for {childName}
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

        {/* Exam type */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>Exam Type</Text>
        <View style={styles.chipRow}>
          {EXAM_TYPES.map((t) => (
            <TouchableOpacity
              key={t}
              style={[
                styles.chip,
                {
                  backgroundColor: examType === t ? colors.error : colors.surface,
                  borderColor: examType === t ? colors.error : colors.border,
                },
              ]}
              onPress={() => setExamType(t)}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: examType === t ? colors.textOnDark : colors.textOnDark },
                ]}
              >
                {t}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Exam date */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>Exam Date</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateScroll}>
          {dateOptions.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.dateChip,
                {
                  backgroundColor: examDate === opt.value ? colors.accent1 : colors.surface,
                  borderColor: examDate === opt.value ? colors.accent1 : colors.border,
                },
              ]}
              onPress={() => setExamDate(opt.value)}
            >
              <Text
                style={[
                  styles.dateChipText,
                  { color: examDate === opt.value ? colors.textOnDark : colors.textOnDark },
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

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
            {
              backgroundColor:
                effectiveSubject.trim() && examType && examDate
                  ? colors.accent1
                  : colors.surface,
            },
          ]}
          onPress={handleSubmit}
          disabled={submitting || !effectiveSubject.trim() || !examType || !examDate}
        >
          {submitting ? (
            <ActivityIndicator color={colors.textOnDark} />
          ) : (
            <Text style={[styles.submitText, { color: colors.textOnDark }]}>Add Exam</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
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

  // Date scroll
  dateScroll: {
    marginBottom: spacing.xs,
  },
  dateChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginRight: spacing.sm,
  },
  dateChipText: {
    fontSize: 13,
    fontFamily: fontFamily.medium,
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
