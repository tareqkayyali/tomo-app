/**
 * CVEditCapsule — Inline profile/CV editor within chat.
 * Shows editable fields with current values, player updates and submits.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type { CVEditCapsule as CVEditCapsuleType, CapsuleAction } from '../../../types/chat';
import { PillSelector } from './shared/PillSelector';
import { CapsuleSubmitButton } from './shared/CapsuleSubmitButton';

interface CVEditCapsuleProps {
  card: CVEditCapsuleType;
  onSubmit: (action: CapsuleAction) => void;
}

export function CVEditCapsuleComponent({ card, onSubmit }: CVEditCapsuleProps) {
  const [values, setValues] = useState<Record<string, string | number | null>>(() => {
    const initial: Record<string, string | number | null> = {};
    for (const f of card.fields) {
      initial[f.field] = f.currentValue;
    }
    return initial;
  });

  const updateField = (field: string, value: string | number | null) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  // Check if anything changed
  const hasChanges = card.fields.some(
    (f) => values[f.field] !== f.currentValue && values[f.field] !== null && values[f.field] !== ''
  );

  const handleSubmit = () => {
    // Only send changed fields
    const changes: Record<string, any> = {};
    for (const f of card.fields) {
      if (values[f.field] !== f.currentValue && values[f.field] !== null && values[f.field] !== '') {
        changes[f.field] = values[f.field];
      }
    }

    onSubmit({
      type: 'cv_edit_capsule',
      toolName: 'update_profile_batch',
      toolInput: { updates: changes },
      agentType: 'settings',
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>✏️ Edit Profile</Text>

      {card.fields.map((field) => (
        <View key={field.field} style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>{field.label}{field.unit ? ` (${field.unit})` : ''}</Text>

          {field.inputType === 'selector' && field.options ? (
            <PillSelector
              options={field.options.map((o) => ({ id: o, label: o }))}
              selected={values[field.field]?.toString() ?? ''}
              onSelect={(id) => updateField(field.field, id)}
            />
          ) : field.inputType === 'number' ? (
            <TextInput
              style={styles.input}
              placeholder={field.currentValue?.toString() ?? `Enter ${field.label.toLowerCase()}`}
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
              value={values[field.field]?.toString() ?? ''}
              onChangeText={(t) => updateField(field.field, t ? parseFloat(t) || t : null)}
            />
          ) : (
            <TextInput
              style={styles.input}
              placeholder={field.currentValue?.toString() ?? `Enter ${field.label.toLowerCase()}`}
              placeholderTextColor={colors.textSecondary}
              value={values[field.field]?.toString() ?? ''}
              onChangeText={(t) => updateField(field.field, t || null)}
            />
          )}
        </View>
      ))}

      <CapsuleSubmitButton
        title="Save Changes"
        disabled={!hasChanges}
        onPress={handleSubmit}
      />
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
  fieldRow: {
    gap: 4,
  },
  fieldLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  input: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.inputBackground,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
