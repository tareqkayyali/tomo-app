/**
 * StudyScheduleCapsule — Exam planner + study schedule inline in chat.
 * Shows current exams, existing study plan info, lets player add exams and generate study plan.
 * Uses the shared CapsuleExamForm matching StudyPlanView design.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SmartIcon } from '../../SmartIcon';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type { StudyScheduleCapsule as StudyScheduleCapsuleType, CapsuleAction } from '../../../types/chat';
import { CapsuleStepper } from './shared/CapsuleStepper';
import { CapsuleSubmitButton } from './shared/CapsuleSubmitButton';
import { CapsuleExamForm } from './shared/CapsuleExamForm';

interface Props {
  card: StudyScheduleCapsuleType;
  onSubmit: (action: CapsuleAction) => void;
}

type Mode = 'overview' | 'add_exam' | 'generate_plan';

export function StudyScheduleCapsuleComponent({ card, onSubmit }: Props) {
  const exams = card.exams ?? [];
  const studySubjects = card.studySubjects ?? [];

  const [mode, setMode] = useState<Mode>('overview');
  const [preExamWeeks, setPreExamWeeks] = useState(card.preExamStudyWeeks);
  const [daysPerSubject, setDaysPerSubject] = useState(card.daysPerSubject);

  const getUrgencyColor = (daysUntil: number) => {
    if (daysUntil < 7) return colors.textSecondary;
    if (daysUntil < 14) return colors.warning;
    return colors.accent;
  };

  // OVERVIEW MODE
  if (mode === 'overview') {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>Study Schedule</Text>

        {/* Existing study plan info */}
        {card.hasStudyPlan && (
          <View style={styles.planBanner}>
            <SmartIcon name="calendar-outline" size={16} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.planBannerTitle}>
                Active study plan · {card.studyPlanBlockCount} sessions
              </Text>
              {card.studyPlanDateRange && (
                <Text style={styles.planBannerSub}>{card.studyPlanDateRange}</Text>
              )}
            </View>
          </View>
        )}

        {/* Exam countdown cards */}
        {exams.length > 0 ? (
          exams.map(exam => (
            <View key={exam.id} style={styles.examRow}>
              <View style={[styles.urgencyDot, { backgroundColor: getUrgencyColor(exam.daysUntil) }]} />
              <View style={styles.examInfo}>
                <Text style={styles.examSubject}>{exam.subject}</Text>
                <Text style={styles.examMeta}>{exam.examType} · {exam.examDate}</Text>
              </View>
              <Text style={[styles.countdown, { color: getUrgencyColor(exam.daysUntil) }]}>
                {exam.daysUntil}d
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>No exams scheduled yet</Text>
        )}

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <CapsuleSubmitButton
            title="+ Add Exam"
            onPress={() => setMode('add_exam')}
          />
          {exams.length > 0 && (
            <CapsuleSubmitButton
              title={card.hasStudyPlan ? 'Regenerate Study Plan' : 'Generate Study Plan'}
              onPress={() => setMode('generate_plan')}
            />
          )}
        </View>
      </View>
    );
  }

  // ADD EXAM MODE — uses shared form
  if (mode === 'add_exam') {
    const subjects = studySubjects.length > 0
      ? studySubjects
      : ['Math', 'Physics', 'English', 'Biology', 'Chemistry'];

    const existingExams = exams.map(e => ({
      id: e.id,
      subject: e.subject,
      examType: e.examType,
      examDate: e.examDate,
    }));

    return (
      <View style={styles.container}>
        <Text style={styles.heading}>Add Exam</Text>
        <CapsuleExamForm
          subjects={subjects}
          existingExams={existingExams}
          onAdd={(subject, examType, examDate) => {
            onSubmit({
              type: 'study_schedule_capsule',
              toolName: 'add_exam',
              toolInput: { subject, examType, examDate },
              agentType: 'timeline',
            });
          }}
          onCancel={() => setMode('overview')}
        />
      </View>
    );
  }

  // GENERATE PLAN MODE
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Generate Study Plan</Text>

      {card.hasStudyPlan && (
        <View style={styles.planBanner}>
          <SmartIcon name="information-circle-outline" size={16} color={colors.warning} />
          <Text style={[styles.planBannerTitle, { color: colors.warning }]}>
            This will replace your current {card.studyPlanBlockCount}-session plan
          </Text>
        </View>
      )}

      <Text style={styles.subtext}>
        {exams.length} exam{exams.length !== 1 ? 's' : ''} scheduled
      </Text>

      <CapsuleStepper
        label="Study weeks before exams"
        value={preExamWeeks}
        onChange={setPreExamWeeks}
        min={1}
        max={6}
        unit="weeks"
      />

      <CapsuleStepper
        label="Study days per subject"
        value={daysPerSubject}
        onChange={setDaysPerSubject}
        min={1}
        max={7}
        unit="days"
      />

      <CapsuleSubmitButton
        title="Generate Study Plan"
        onPress={() => {
          onSubmit({
            type: 'study_schedule_capsule',
            toolName: 'generate_study_plan',
            toolInput: {
              preExamStudyWeeks: preExamWeeks,
              daysPerSubject,
            },
            agentType: 'timeline',
          });
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
    fontSize: 16,
    color: colors.textPrimary,
  },
  planBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: `${colors.background}`,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  planBannerTitle: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.accent,
  },
  planBannerSub: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
  },
  examRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  urgencyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  examInfo: { flex: 1 },
  examSubject: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  examMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  countdown: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
  },
  emptyText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  actionRow: {
    gap: spacing.xs,
  },
  subtext: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
});
