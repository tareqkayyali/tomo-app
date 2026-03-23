/**
 * InlineTestInput — Compact row for logging a new test value inline.
 *
 * Shows: TextInput (decimal-pad) + unit label + save ✓ + cancel ✕
 * Follows the existing pendingInputRow pattern from MetricsSection.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../hooks/useTheme';
import { spacing, fontFamily, borderRadius } from '../../theme';

interface InlineTestInputProps {
  testType: string;
  unit: string;
  currentValue?: number;
  onSave: (score: number) => Promise<void>;
  onCancel: () => void;
}

export function InlineTestInput({
  testType,
  unit,
  currentValue,
  onSave,
  onCancel,
}: InlineTestInputProps) {
  const { colors } = useTheme();
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSave = async () => {
    const numVal = parseFloat(value);
    if (isNaN(numVal)) {
      if (Platform.OS === 'web') {
        window.alert('Please enter a valid number.');
      } else {
        Alert.alert('Invalid', 'Please enter a valid number.');
      }
      return;
    }

    setSubmitting(true);
    try {
      await onSave(numVal);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      if (Platform.OS === 'web') {
        window.alert('Could not save test result.');
      } else {
        Alert.alert('Error', 'Could not save test result.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const canSave = value.trim().length > 0 && !submitting;

  return (
    <View style={[styles.container, { borderLeftColor: colors.accent1 }]}>
      <View style={styles.row}>
        <View
          style={[
            styles.inputWrap,
            { backgroundColor: colors.inputBackground || colors.backgroundElevated },
          ]}
        >
          <TextInput
            style={[styles.input, { color: colors.textOnDark }]}
            placeholder={currentValue != null ? `Current: ${currentValue}` : `Value`}
            placeholderTextColor={colors.textInactive}
            value={value}
            onChangeText={setValue}
            keyboardType="decimal-pad"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={canSave ? handleSave : undefined}
          />
          <Text style={[styles.unitLabel, { color: colors.textMuted }]}>{unit}</Text>
        </View>

        {/* Save */}
        <Pressable
          style={[
            styles.actionBtn,
            { backgroundColor: colors.accent1, opacity: canSave ? 1 : 0.5 },
          ]}
          onPress={handleSave}
          disabled={!canSave}
        >
          {submitting ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Ionicons name="checkmark" size={18} color="#FFF" />
          )}
        </Pressable>

        {/* Cancel */}
        <Pressable
          style={[styles.actionBtn, { backgroundColor: colors.backgroundElevated }]}
          onPress={onCancel}
          disabled={submitting}
        >
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderLeftWidth: 2,
    paddingLeft: spacing.compact,
    marginLeft: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.md,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'web' ? 8 : 6,
    gap: 6,
    borderWidth: 0,
  },
  input: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 16,
    padding: 0,
  },
  unitLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
