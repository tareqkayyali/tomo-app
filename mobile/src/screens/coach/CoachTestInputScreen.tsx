/**
 * Coach Test Input Screen
 * Form to submit a test result for a player.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useTheme } from '../../hooks/useTheme';
import { submitPlayerTest } from '../../services/api';
import { spacing, borderRadius, layout, fontFamily } from '../../theme';
import type { CoachStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<CoachStackParamList, 'CoachTestInput'>;

interface TestType {
  id: string;
  label: string;
  unit: string;
  inputMode: 'numeric' | 'rating';
}

const PHYSICAL_TESTS: TestType[] = [
  { id: '30m_sprint', label: '30m Sprint', unit: 'seconds', inputMode: 'numeric' },
  { id: 'vertical_jump', label: 'Vertical Jump', unit: 'cm', inputMode: 'numeric' },
  { id: 'beep_test', label: 'Beep Test', unit: 'level', inputMode: 'numeric' },
  { id: '5_10_5_agility', label: '5-10-5 Agility', unit: 'seconds', inputMode: 'numeric' },
  { id: 'yo_yo_test', label: 'Yo-Yo Test', unit: 'level', inputMode: 'numeric' },
  { id: 'broad_jump', label: 'Broad Jump', unit: 'cm', inputMode: 'numeric' },
];

const SKILL_ASSESSMENTS: TestType[] = [
  { id: 'shooting', label: 'Shooting', unit: '/5', inputMode: 'rating' },
  { id: 'dribbling', label: 'Dribbling', unit: '/5', inputMode: 'rating' },
  { id: 'passing', label: 'Passing', unit: '/5', inputMode: 'rating' },
  { id: 'defending', label: 'Defending', unit: '/5', inputMode: 'rating' },
];

const ALL_TEST_TYPES: TestType[] = [...PHYSICAL_TESTS, ...SKILL_ASSESSMENTS];

export function CoachTestInputScreen({ route, navigation }: Props) {
  const { playerId, playerName } = route.params;
  const { colors } = useTheme();

  const [selectedTest, setSelectedTest] = useState<TestType | null>(null);
  const [primaryValue, setPrimaryValue] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!selectedTest) {
      if (Platform.OS === 'web') {
        window.alert('Please choose a test type before submitting.');
      } else {
        Alert.alert('Select a Test', 'Please choose a test type before submitting.');
      }
      return;
    }
    const numVal = parseFloat(primaryValue);
    if (isNaN(numVal)) {
      if (Platform.OS === 'web') {
        window.alert('Please enter a valid number.');
      } else {
        Alert.alert('Invalid Value', 'Please enter a valid number.');
      }
      return;
    }

    setSubmitting(true);
    setSuccessMsg(null);
    try {
      await submitPlayerTest(playerId, {
        testType: selectedTest.id,
        sport: 'football', // default — could be dynamic later
        values: { primaryValue: numVal, unit: selectedTest.unit },
        ...(notes.trim() ? { rawInputs: { notes: notes.trim() } } : {}),
      });
      // Show inline success, reset form
      setSuccessMsg(`${selectedTest.label} — ${numVal} ${selectedTest.unit} submitted for ${playerName}`);
      setSelectedTest(null);
      setPrimaryValue('');
      setNotes('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      if (Platform.OS === 'web') {
        window.alert(`Error: ${message}`);
      } else {
        Alert.alert('Error', message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.heading, { color: colors.textOnDark }]}>
        Submit Test for {playerName}
      </Text>

      {/* ── Inline Success Banner ── */}
      {successMsg && (
        <View style={[styles.successBanner, { backgroundColor: colors.success }]}>
          <Ionicons name="checkmark-circle" size={20} color={colors.textOnDark} />
          <Text style={[styles.successText, { color: colors.textOnDark }]}>{successMsg}</Text>
          <Pressable onPress={() => setSuccessMsg(null)} hitSlop={8}>
            <Ionicons name="close" size={18} color={colors.textOnDark} />
          </Pressable>
        </View>
      )}

      {/* Physical Tests */}
      <Text style={[styles.label, { color: colors.textMuted }]}>Physical Test</Text>
      <View style={styles.testGrid}>
        {PHYSICAL_TESTS.map((t) => {
          const isSelected = selectedTest?.id === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => { setSelectedTest(t); setPrimaryValue(''); }}
              style={[
                styles.testChip,
                {
                  backgroundColor: isSelected ? colors.accent1 + '22' : colors.surfaceElevated,
                  borderColor: isSelected ? colors.accent1 : 'transparent',
                },
              ]}
            >
              <Text
                style={[
                  styles.testChipText,
                  { color: isSelected ? colors.accent1 : colors.textOnDark },
                ]}
              >
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Skill Assessments */}
      <Text style={[styles.label, { color: colors.textMuted, marginTop: spacing.lg }]}>Skill Assessment</Text>
      <View style={styles.testGrid}>
        {SKILL_ASSESSMENTS.map((t) => {
          const isSelected = selectedTest?.id === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => { setSelectedTest(t); setPrimaryValue(''); }}
              style={[
                styles.testChip,
                {
                  backgroundColor: isSelected ? colors.accent1 + '22' : colors.surfaceElevated,
                  borderColor: isSelected ? colors.accent1 : 'transparent',
                },
              ]}
            >
              <Text
                style={[
                  styles.testChipText,
                  { color: isSelected ? colors.accent1 : colors.textOnDark },
                ]}
              >
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Primary Value — numeric or star rating */}
      {selectedTest?.inputMode === 'rating' ? (
        <>
          <Text style={[styles.label, { color: colors.textMuted }]}>Rating (1-5)</Text>
          <View style={styles.ratingRow}>
            {[1, 2, 3, 4, 5].map((star) => {
              const filled = primaryValue && parseInt(primaryValue, 10) >= star;
              return (
                <Pressable
                  key={star}
                  onPress={() => setPrimaryValue(String(star))}
                  style={[
                    styles.ratingButton,
                    {
                      backgroundColor: filled ? colors.accent1 + '22' : colors.surfaceElevated,
                      borderColor: filled ? colors.accent1 : colors.border,
                    },
                  ]}
                >
                  <Ionicons
                    name={filled ? 'star' : 'star-outline'}
                    size={28}
                    color={filled ? colors.accent1 : colors.textInactive}
                  />
                  <Text style={{ fontSize: 12, fontFamily: fontFamily.bold, color: filled ? colors.accent1 : colors.textInactive, marginTop: 2 }}>
                    {star}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : (
        <>
          <Text style={[styles.label, { color: colors.textMuted }]}>
            Value{selectedTest ? ` (${selectedTest.unit})` : ''}
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.surfaceElevated,
                color: colors.textOnDark,
                borderColor: colors.border,
              },
            ]}
            placeholder="e.g. 4.52"
            placeholderTextColor={colors.textInactive}
            keyboardType="decimal-pad"
            value={primaryValue}
            onChangeText={setPrimaryValue}
          />
        </>
      )}

      {/* Notes */}
      <Text style={[styles.label, { color: colors.textMuted }]}>Notes (optional)</Text>
      <TextInput
        style={[
          styles.input,
          styles.notesInput,
          {
            backgroundColor: colors.surfaceElevated,
            color: colors.textOnDark,
            borderColor: colors.border,
          },
        ]}
        placeholder="Any observations..."
        placeholderTextColor={colors.textInactive}
        multiline
        value={notes}
        onChangeText={setNotes}
      />

      {/* Submit */}
      <Pressable
        onPress={handleSubmit}
        disabled={submitting}
        style={({ pressed }) => [
          styles.submitButton,
          { backgroundColor: colors.accent1, opacity: pressed || submitting ? 0.7 : 1 },
        ]}
      >
        {submitting ? (
          <ActivityIndicator color={colors.textOnDark} />
        ) : (
          <>
            <Ionicons name="checkmark-circle-outline" size={20} color={colors.textOnDark} />
            <Text style={[styles.submitButtonText, { color: colors.textOnDark }]}>Submit Test</Text>
          </>
        )}
      </Pressable>

      {/* Back button after success */}
      {successMsg && (
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [
            styles.backButton,
            { borderColor: colors.textMuted, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Ionicons name="arrow-back" size={18} color={colors.textOnDark} />
          <Text style={[styles.backButtonText, { color: colors.textOnDark }]}>
            Back to Player
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: layout.screenMargin,
    paddingBottom: spacing.xxl,
  },
  heading: {
    fontSize: 22,
    fontFamily: fontFamily.bold,
    marginBottom: spacing.xl,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    marginBottom: spacing.md,
  },
  successText: {
    flex: 1,
    fontSize: 14,
    fontFamily: fontFamily.semiBold,
  },
  label: {
    fontSize: 14,
    fontFamily: fontFamily.semiBold,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  testGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  testChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
  },
  testChipText: {
    fontSize: 14,
    fontFamily: fontFamily.medium,
  },
  input: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.compact,
    fontSize: 16,
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.compact,
    borderRadius: borderRadius.md,
    marginTop: spacing.xl,
  },
  submitButtonText: {
    fontSize: 16,
    fontFamily: fontFamily.semiBold,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.compact,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginTop: spacing.sm,
  },
  backButtonText: {
    fontSize: 15,
    fontFamily: fontFamily.medium,
  },
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  ratingButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.compact,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
  },
});
