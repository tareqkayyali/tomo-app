/**
 * CapsuleExamForm — Shared exam add form for capsules.
 * Matches the StudyPlanView inline exam form UI exactly:
 * - Wrapping subject chips
 * - Chevron date picker (circular buttons)
 * - Type pills (Final/Mid/Quiz) side-by-side with date
 * - Cancel / Add Exam buttons
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { SmartIcon } from '../../../SmartIcon';
import { colors } from '../../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../../theme';

interface CapsuleExamFormProps {
  subjects: string[];
  existingExams?: Array<{ id: string; subject: string; examType: string; examDate: string }>;
  onAdd: (subject: string, examType: string, examDate: string) => void;
  onCancel: () => void;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function daysUntil(examDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exam = new Date(examDate);
  exam.setHours(0, 0, 0, 0);
  return Math.ceil((exam.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function CapsuleExamForm({ subjects, existingExams, onAdd, onCancel }: CapsuleExamFormProps) {
  const defaultDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return toDateStr(d);
  })();

  const [selectedSubject, setSelectedSubject] = useState('');
  const [examDate, setExamDate] = useState(defaultDate);
  const [examType, setExamType] = useState('Final');

  const canAdd = !!selectedSubject;

  return (
    <View style={styles.container}>
      {/* Existing exams */}
      {existingExams && existingExams.length > 0 && (
        <View style={styles.existingRow}>
          {existingExams.slice(0, 5).map((e) => {
            const days = daysUntil(e.examDate);
            return (
              <View key={e.id} style={styles.examPill}>
                <Text style={styles.examPillSubject}>{e.subject}</Text>
                <Text style={[styles.examPillDays, days <= 7 && { color: '#E74C3C' }]}>{days}d</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Subject selector */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Subject</Text>
        <View style={styles.chipsWrap}>
          {subjects.map((subj) => {
            const isActive = selectedSubject === subj;
            return (
              <TouchableOpacity
                key={subj}
                style={[styles.subjectChip, isActive && styles.subjectChipActive]}
                onPress={() => setSelectedSubject(subj)}
              >
                <Text style={[styles.subjectChipText, isActive && styles.subjectChipTextActive]}>{subj}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Date + Type row */}
      <View style={styles.dateTypeRow}>
        {/* Date */}
        <View style={[styles.fieldGroup, { flex: 1 }]}>
          <Text style={styles.fieldLabel}>Date</Text>
          <View style={styles.datePickerRow}>
            <Pressable
              style={styles.chevronCircle}
              onPress={() => {
                const d = new Date(examDate);
                d.setDate(d.getDate() - 1);
                if (d > new Date()) setExamDate(toDateStr(d));
              }}
            >
              <SmartIcon name="chevron-back" size={14} color={colors.accent1} />
            </Pressable>
            <Text style={styles.dateText}>{formatShortDate(examDate)}</Text>
            <Pressable
              style={styles.chevronCircle}
              onPress={() => {
                const d = new Date(examDate);
                d.setDate(d.getDate() + 1);
                setExamDate(toDateStr(d));
              }}
            >
              <SmartIcon name="chevron-forward" size={14} color={colors.accent1} />
            </Pressable>
          </View>
        </View>

        {/* Type */}
        <View style={[styles.fieldGroup, { flex: 1 }]}>
          <Text style={styles.fieldLabel}>Type</Text>
          <View style={styles.typeRow}>
            {['Final', 'Mid', 'Quiz'].map((t) => {
              const fullType = t === 'Mid' ? 'Midterm' : t;
              const isActive = examType === fullType;
              return (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeChip, isActive && styles.typeChipActive]}
                  onPress={() => setExamType(fullType)}
                >
                  <Text style={[styles.typeChipText, isActive && styles.typeChipTextActive]}>{t}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      {/* Buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.addBtn, !canAdd && { opacity: 0.4 }]}
          disabled={!canAdd}
          onPress={() => onAdd(selectedSubject, examType.toLowerCase(), examDate)}
        >
          <Text style={styles.addBtnText}>Add Exam</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  existingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  examPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(123, 97, 255, 0.25)',
    backgroundColor: 'rgba(123, 97, 255, 0.10)',
  },
  examPillSubject: { fontFamily: fontFamily.medium, fontSize: 12, color: '#FFF' },
  examPillDays: { fontFamily: fontFamily.semiBold, fontSize: 11, color: '#7B61FF' },

  fieldGroup: { gap: 6 },
  fieldLabel: {
    fontSize: 11,
    fontFamily: fontFamily.semiBold,
    color: colors.textInactive,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  subjectChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: 'transparent',
  },
  subjectChipActive: {
    borderColor: '#7B61FF',
    backgroundColor: '#7B61FF20',
  },
  subjectChipText: {
    fontSize: 13,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
  },
  subjectChipTextActive: { color: '#7B61FF' },

  dateTypeRow: { flexDirection: 'row', gap: 12 },
  datePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  chevronCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: `${colors.accent1}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
    textAlign: 'center',
  },

  typeRow: { flexDirection: 'row', gap: 6 },
  typeChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: 'transparent',
  },
  typeChipActive: {
    borderColor: '#7B61FF',
    backgroundColor: '#7B61FF20',
  },
  typeChipText: {
    fontSize: 12,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
  },
  typeChipTextActive: { color: '#7B61FF' },

  buttonRow: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: borderRadius.sm,
    backgroundColor: `${colors.textInactive}15`,
    alignItems: 'center',
  },
  cancelBtnText: { fontFamily: fontFamily.medium, fontSize: 14, color: colors.textSecondary },
  addBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: borderRadius.sm,
    backgroundColor: '#7B61FF',
    alignItems: 'center',
  },
  addBtnText: { fontFamily: fontFamily.semiBold, fontSize: 14, color: '#FFF' },
});
