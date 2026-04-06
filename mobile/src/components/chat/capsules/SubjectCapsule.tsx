/**
 * SubjectCapsule — Add/remove study subjects inline in chat.
 */
import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable } from 'react-native';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type { SubjectCapsule as SubjectCapsuleType, CapsuleAction } from '../../../types/chat';
import { CapsuleSubmitButton } from './shared/CapsuleSubmitButton';

interface Props {
  card: SubjectCapsuleType;
  onSubmit: (action: CapsuleAction) => void;
}

export function SubjectCapsuleComponent({ card, onSubmit }: Props) {
  const [subjects, setSubjects] = useState<string[]>(card.currentSubjects ?? []);
  const [newSubject, setNewSubject] = useState('');

  const addSubject = () => {
    const trimmed = newSubject.trim();
    if (trimmed && !subjects.includes(trimmed)) {
      setSubjects([...subjects, trimmed]);
      setNewSubject('');
    }
  };

  const removeSubject = (s: string) => {
    setSubjects(subjects.filter((x) => x !== s));
  };

  const handleSave = () => {
    onSubmit({
      type: 'subject_capsule',
      toolName: 'update_schedule_rules',
      toolInput: { study_subjects: subjects },
      agentType: 'timeline',
    });
  };

  const hasChanges = JSON.stringify(subjects.sort()) !== JSON.stringify([...(card.currentSubjects ?? [])].sort());

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Study Subjects</Text>

      <View style={styles.pillRow}>
        {subjects.map((s) => (
          <Pressable key={s} onPress={() => removeSubject(s)} style={styles.subjectPill}>
            <Text style={styles.subjectText}>{s}</Text>
            <Text style={styles.removeX}>x</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.addRow}>
        <TextInput
          style={styles.textInput}
          placeholder="Add subject..."
          placeholderTextColor={colors.textSecondary}
          value={newSubject}
          onChangeText={setNewSubject}
          onSubmitEditing={addSubject}
          returnKeyType="done"
        />
        <CapsuleSubmitButton title="+" onPress={addSubject} disabled={!newSubject.trim()} variant="subtle" />
      </View>

      <CapsuleSubmitButton title="Save Subjects" disabled={!hasChanges} onPress={handleSave} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.backgroundElevated, borderRadius: borderRadius.lg, padding: spacing.md, gap: spacing.sm },
  heading: { fontFamily: fontFamily.semiBold, fontSize: 15, color: colors.textPrimary },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  subjectPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accentMuted, paddingVertical: 5, paddingHorizontal: 10, borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.accentBorder },
  subjectText: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.accent2 },
  removeX: { fontFamily: fontFamily.bold, fontSize: 12, color: 'rgba(245,243,237,0.4)' },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  textInput: { flex: 1, fontFamily: fontFamily.regular, fontSize: 14, color: colors.textPrimary, backgroundColor: colors.inputBackground, borderRadius: borderRadius.lg, paddingHorizontal: spacing.compact, paddingVertical: 8 },
});
