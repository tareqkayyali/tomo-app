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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useTheme } from '../../hooks/useTheme';
import { submitPlayerTest } from '../../services/api';
import { spacing, borderRadius, layout } from '../../theme';
import type { CoachStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<CoachStackParamList, 'CoachTestInput'>;

interface TestType {
  id: string;
  label: string;
  unit: string;
}

const TEST_TYPES: TestType[] = [
  { id: '30m_sprint', label: '30m Sprint', unit: 'seconds' },
  { id: 'vertical_jump', label: 'Vertical Jump', unit: 'cm' },
  { id: 'beep_test', label: 'Beep Test', unit: 'level' },
  { id: '5_10_5_agility', label: '5-10-5 Agility', unit: 'seconds' },
  { id: 'yo_yo_test', label: 'Yo-Yo Test', unit: 'level' },
  { id: 'broad_jump', label: 'Broad Jump', unit: 'cm' },
];

export function CoachTestInputScreen({ route, navigation }: Props) {
  const { playerId, playerName } = route.params;
  const { colors } = useTheme();

  const [selectedTest, setSelectedTest] = useState<TestType | null>(null);
  const [primaryValue, setPrimaryValue] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedTest) {
      Alert.alert('Select a Test', 'Please choose a test type before submitting.');
      return;
    }
    const numVal = parseFloat(primaryValue);
    if (isNaN(numVal)) {
      Alert.alert('Invalid Value', 'Please enter a valid number.');
      return;
    }

    setSubmitting(true);
    try {
      await submitPlayerTest(playerId, {
        testType: selectedTest.id,
        sport: 'football', // default — could be dynamic later
        values: { primaryValue: numVal, unit: selectedTest.unit },
        ...(notes.trim() ? { rawInputs: { notes: notes.trim() } } : {}),
      });
      Alert.alert('Success', `Test submitted for ${playerName}.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      Alert.alert('Error', message);
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

      {/* Test Type Selector */}
      <Text style={[styles.label, { color: colors.textMuted }]}>Test Type</Text>
      <View style={styles.testGrid}>
        {TEST_TYPES.map((t) => {
          const isSelected = selectedTest?.id === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => setSelectedTest(t)}
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

      {/* Primary Value */}
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
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
            <Text style={styles.submitButtonText}>Submit Test</Text>
          </>
        )}
      </Pressable>
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
    fontWeight: '700',
    marginBottom: spacing.xl,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
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
    fontWeight: '500',
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
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
