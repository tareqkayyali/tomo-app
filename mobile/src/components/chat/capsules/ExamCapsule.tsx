/**
 * ExamCapsule — Add/view exams inline in chat.
 * Uses the shared CapsuleExamForm matching StudyPlanView design.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type { ExamCapsule as ExamCapsuleType, CapsuleAction } from '../../../types/chat';
import { CapsuleExamForm } from './shared/CapsuleExamForm';

interface Props {
  card: ExamCapsuleType;
  onSubmit: (action: CapsuleAction) => void;
}

export function ExamCapsuleComponent({ card, onSubmit }: Props) {
  // Use studySubjects from card, fallback to subjects from existing exams, then defaults
  const fromCard = card.studySubjects?.length ? card.studySubjects : [];
  const fromExams = [...new Set(card.existingExams.map((e) => e.subject))];
  const allSubjects = fromCard.length > 0 ? fromCard : fromExams.length > 0 ? fromExams : ['Math', 'Physics', 'English', 'Biology', 'Chemistry'];

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Add Exam</Text>
      <CapsuleExamForm
        subjects={allSubjects}
        existingExams={card.existingExams}
        onAdd={(subject, examType, examDate) => {
          onSubmit({
            type: 'exam_capsule',
            toolName: 'add_exam',
            toolInput: { subject, examType, examDate },
            agentType: 'timeline',
          });
        }}
        onCancel={() => {
          // Capsule can't be dismissed, but cancel clears form — noop for now
        }}
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
    fontSize: 15,
    color: colors.textPrimary,
  },
});
