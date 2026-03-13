/**
 * StudyPlanView — Player's Study Plan tab content
 *
 * Shows study info summary (subjects, exams) with "Edit in Profile" link,
 * generator controls, and "Generate Plan" button.
 * Generated blocks go to StudyPlanPreviewScreen.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { updateUser } from '../services/api';
import { generateStudyPlan } from '../services/studyPlanGenerator';
import { spacing, borderRadius, fontFamily, layout } from '../theme';
import type { ThemeColors } from '../theme/colors';
import type {
  StudyPlanConfig,
  StudyBlock,
  StudyStrategy,
} from '../types';

// ── Constants ────────────────────────────────────────────────────────

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DURATIONS: (30 | 45 | 60 | 90)[] = [30, 45, 60, 90];
const HOURS = Array.from({ length: 15 }, (_, i) => {
  const h = 7 + i; // 07:00 to 21:00
  return `${String(h).padStart(2, '0')}:00`;
});

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function cycleTime(current: string, direction: 1 | -1): string {
  const idx = HOURS.indexOf(current);
  if (idx === -1) return current;
  const next = idx + direction;
  if (next < 0 || next >= HOURS.length) return current;
  return HOURS[next];
}

// ── Component ────────────────────────────────────────────────────────

type StudyPlanViewProps = {
  onNavigateToPreview: (blocks: StudyBlock[]) => void;
  onNavigateToEditProfile: () => void;
};

export function StudyPlanView({ onNavigateToPreview, onNavigateToEditProfile }: StudyPlanViewProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { profile, refreshProfile } = useAuth();

  const subjects = profile?.studySubjects || [];
  const exams = profile?.examSchedule || [];
  const trainingPrefs = profile?.trainingPreferences || {
    gymSessionsPerWeek: 0,
    gymFixedDays: [],
    clubSessionsPerWeek: 0,
    clubFixedDays: [],
  };

  // Initialize config from saved profile or defaults
  const savedConfig = profile?.studyPlanConfig;

  const [daysPerSubject, setDaysPerSubject] = useState<Record<string, number>>(() => {
    if (savedConfig?.daysPerSubject) return savedConfig.daysPerSubject;
    const defaults: Record<string, number> = {};
    for (const subj of subjects) defaults[subj] = 2;
    return defaults;
  });
  const [timeSlotStart, setTimeSlotStart] = useState(savedConfig?.timeSlotStart || '15:00');
  const [timeSlotEnd, setTimeSlotEnd] = useState(savedConfig?.timeSlotEnd || '18:00');
  const [sessionDuration, setSessionDuration] = useState<30 | 45 | 60 | 90>(savedConfig?.sessionDuration || 45);
  const [strategy, setStrategy] = useState<StudyStrategy>(savedConfig?.strategy || 'last_exam_first');
  const [excludedDays, setExcludedDays] = useState<number[]>(savedConfig?.excludedDays || []);

  // ── Save config on change ──────────────────────────────────────────

  const saveConfig = useCallback(async (config: StudyPlanConfig) => {
    try {
      await updateUser({ studyPlanConfig: config } as any);
    } catch {
      // silent — non-critical
    }
  }, []);

  const currentConfig = useMemo((): StudyPlanConfig => ({
    daysPerSubject,
    timeSlotStart,
    timeSlotEnd,
    sessionDuration,
    strategy,
    excludedDays,
  }), [daysPerSubject, timeSlotStart, timeSlotEnd, sessionDuration, strategy, excludedDays]);

  // ── Stepper helpers ────────────────────────────────────────────────

  const setSubjectDays = (subj: string, val: number) => {
    const clamped = Math.max(1, Math.min(7, val));
    setDaysPerSubject((prev) => {
      const next = { ...prev, [subj]: clamped };
      saveConfig({ ...currentConfig, daysPerSubject: next });
      return next;
    });
  };

  const toggleExcludedDay = (day: number) => {
    setExcludedDays((prev) => {
      const next = prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day];
      saveConfig({ ...currentConfig, excludedDays: next });
      return next;
    });
  };

  // ── Generate handler ───────────────────────────────────────────────

  const handleGenerate = useCallback(() => {
    if (subjects.length === 0 || exams.length === 0) {
      Alert.alert('Missing Info', 'Please add your subjects and exam schedule in Edit Profile first.');
      return;
    }

    // Pre-validate
    if (excludedDays.length >= 7) {
      Alert.alert('No Days Available', 'You excluded all days. Uncheck some days to generate a plan.');
      return;
    }
    if (timeToMinutes(timeSlotEnd) - timeToMinutes(timeSlotStart) < sessionDuration) {
      Alert.alert('Time Window Too Small', `The study window must be at least ${sessionDuration} minutes.`);
      return;
    }

    // Warn about past exams
    const pastExams = exams.filter((e) => new Date(e.examDate) <= new Date());
    if (pastExams.length > 0 && pastExams.length < exams.length) {
      Alert.alert('Past Exams', `${pastExams.length} exam(s) already passed and will be skipped.`);
    }

    // Save config before generating
    saveConfig(currentConfig);

    const blocks = generateStudyPlan(currentConfig, exams, trainingPrefs);

    if (blocks.length === 0) {
      Alert.alert('No Blocks', 'Could not generate any study blocks with these settings. Try adjusting the time slot or days per subject.');
      return;
    }

    onNavigateToPreview(blocks);
  }, [subjects, exams, trainingPrefs, currentConfig, excludedDays, timeSlotStart, timeSlotEnd, sessionDuration, saveConfig, onNavigateToPreview]);

  // ── No study info state ────────────────────────────────────────────

  if (subjects.length === 0 && exams.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.emptyContainer}>
        <Ionicons name="school-outline" size={48} color={colors.textInactive} />
        <Text style={[styles.emptyTitle, { color: colors.textOnDark }]}>No study info yet</Text>
        <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
          Add your subjects and exam schedule to generate a study plan.
        </Text>
        <TouchableOpacity
          style={[styles.editProfileBtn, { backgroundColor: colors.accent1 }]}
          onPress={onNavigateToEditProfile}
        >
          <Ionicons name="create-outline" size={18} color="#FFF" />
          <Text style={styles.editProfileBtnText}>Edit Profile</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── Main render ────────────────────────────────────────────────────

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      {/* Study Info Summary */}
      <View style={[styles.summaryCard, { backgroundColor: colors.surfaceElevated }]}>
        <View style={styles.summaryHeader}>
          <Text style={[styles.summaryTitle, { color: colors.textOnDark }]}>Your Study Info</Text>
          <TouchableOpacity onPress={onNavigateToEditProfile} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={[styles.editLink, { color: colors.accent1 }]}>Edit in Profile</Text>
          </TouchableOpacity>
        </View>

        {/* Subjects */}
        <View style={styles.summaryRow}>
          <Ionicons name="book-outline" size={16} color={colors.accent1} />
          <View style={styles.summaryChips}>
            {subjects.map((s) => (
              <View key={s} style={[styles.readOnlyChip, { backgroundColor: colors.surface }]}>
                <Text style={[styles.chipText, { color: colors.textOnDark }]}>{s}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Exams */}
        {exams.length > 0 && (
          <View style={styles.summaryRow}>
            <Ionicons name="document-text-outline" size={16} color="#E74C3C" />
            <View style={{ flex: 1, gap: 4 }}>
              {exams.map((e) => (
                <Text key={e.id} style={[styles.examLine, { color: colors.textSecondary }]}>
                  {e.subject} ({e.examType}) — {e.examDate}
                </Text>
              ))}
            </View>
          </View>
        )}

        {exams.length === 0 && (
          <View style={styles.summaryRow}>
            <Ionicons name="alert-circle-outline" size={16} color="#E74C3C" />
            <Text style={[styles.examLine, { color: '#E74C3C' }]}>
              No exams scheduled yet. Add exams in Edit Profile.
            </Text>
          </View>
        )}
      </View>

      {/* Generator Controls */}
      {exams.length > 0 && (
        <>
          <View style={[styles.configSection, { backgroundColor: colors.surfaceElevated }]}>
            <Text style={[styles.configTitle, { color: colors.textOnDark }]}>Generator Settings</Text>

            {/* Per-subject steppers */}
            <Text style={[styles.configLabel, { color: colors.textInactive }]}>Days per week per subject</Text>
            {subjects.map((subj) => (
              <View key={subj} style={styles.subjectStepperRow}>
                <Text style={[styles.subjectName, { color: colors.textOnDark }]}>{subj}</Text>
                <View style={styles.miniStepper}>
                  <TouchableOpacity
                    onPress={() => setSubjectDays(subj, (daysPerSubject[subj] || 2) - 1)}
                    style={[styles.miniStepperBtn, { borderColor: colors.border }]}
                  >
                    <Ionicons name="remove" size={16} color={colors.textOnDark} />
                  </TouchableOpacity>
                  <Text style={[styles.miniStepperVal, { color: colors.textOnDark }]}>
                    {daysPerSubject[subj] || 2}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setSubjectDays(subj, (daysPerSubject[subj] || 2) + 1)}
                    style={[styles.miniStepperBtn, { borderColor: colors.border }]}
                  >
                    <Ionicons name="add" size={16} color={colors.textOnDark} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {/* Time slot */}
            <Text style={[styles.configLabel, { color: colors.textInactive, marginTop: spacing.md }]}>Study time window</Text>
            <View style={styles.timeSlotRow}>
              <View style={styles.timePickerCol}>
                <Text style={[styles.timePickerLabel, { color: colors.textInactive }]}>From</Text>
                <View style={styles.timePicker}>
                  <TouchableOpacity onPress={() => { const v = cycleTime(timeSlotStart, -1); setTimeSlotStart(v); saveConfig({ ...currentConfig, timeSlotStart: v }); }}>
                    <Ionicons name="chevron-down" size={20} color={colors.textOnDark} />
                  </TouchableOpacity>
                  <Text style={[styles.timeValue, { color: colors.textOnDark }]}>{timeSlotStart}</Text>
                  <TouchableOpacity onPress={() => { const v = cycleTime(timeSlotStart, 1); setTimeSlotStart(v); saveConfig({ ...currentConfig, timeSlotStart: v }); }}>
                    <Ionicons name="chevron-up" size={20} color={colors.textOnDark} />
                  </TouchableOpacity>
                </View>
              </View>
              <Ionicons name="arrow-forward" size={18} color={colors.textInactive} />
              <View style={styles.timePickerCol}>
                <Text style={[styles.timePickerLabel, { color: colors.textInactive }]}>To</Text>
                <View style={styles.timePicker}>
                  <TouchableOpacity onPress={() => { const v = cycleTime(timeSlotEnd, -1); setTimeSlotEnd(v); saveConfig({ ...currentConfig, timeSlotEnd: v }); }}>
                    <Ionicons name="chevron-down" size={20} color={colors.textOnDark} />
                  </TouchableOpacity>
                  <Text style={[styles.timeValue, { color: colors.textOnDark }]}>{timeSlotEnd}</Text>
                  <TouchableOpacity onPress={() => { const v = cycleTime(timeSlotEnd, 1); setTimeSlotEnd(v); saveConfig({ ...currentConfig, timeSlotEnd: v }); }}>
                    <Ionicons name="chevron-up" size={20} color={colors.textOnDark} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Duration */}
            <Text style={[styles.configLabel, { color: colors.textInactive, marginTop: spacing.md }]}>Session duration</Text>
            <View style={styles.durationRow}>
              {DURATIONS.map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[
                    styles.durationChip,
                    {
                      backgroundColor: sessionDuration === d ? colors.accent1 : 'transparent',
                      borderColor: sessionDuration === d ? colors.accent1 : colors.border,
                    },
                  ]}
                  onPress={() => { setSessionDuration(d); saveConfig({ ...currentConfig, sessionDuration: d }); }}
                >
                  <Text style={{ color: sessionDuration === d ? '#FFF' : colors.textOnDark, fontSize: 14, fontWeight: '600' }}>
                    {d} min
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Strategy */}
            <Text style={[styles.configLabel, { color: colors.textInactive, marginTop: spacing.md }]}>Priority strategy</Text>
            <View style={styles.strategyRow}>
              <TouchableOpacity
                style={[
                  styles.strategyChip,
                  {
                    backgroundColor: strategy === 'last_exam_first' ? colors.accent1 : 'transparent',
                    borderColor: strategy === 'last_exam_first' ? colors.accent1 : colors.border,
                  },
                ]}
                onPress={() => { setStrategy('last_exam_first'); saveConfig({ ...currentConfig, strategy: 'last_exam_first' }); }}
              >
                <Text style={{ color: strategy === 'last_exam_first' ? '#FFF' : colors.textOnDark, fontSize: 13, fontWeight: '600' }}>
                  Closest exam first
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.strategyChip,
                  {
                    backgroundColor: strategy === 'first_exam_first' ? colors.accent1 : 'transparent',
                    borderColor: strategy === 'first_exam_first' ? colors.accent1 : colors.border,
                  },
                ]}
                onPress={() => { setStrategy('first_exam_first'); saveConfig({ ...currentConfig, strategy: 'first_exam_first' }); }}
              >
                <Text style={{ color: strategy === 'first_exam_first' ? '#FFF' : colors.textOnDark, fontSize: 13, fontWeight: '600' }}>
                  Furthest exam first
                </Text>
              </TouchableOpacity>
            </View>

            {/* Excluded days */}
            <Text style={[styles.configLabel, { color: colors.textInactive, marginTop: spacing.md }]}>Exclude days</Text>
            <View style={styles.dayRow}>
              {DAY_LABELS.map((label, idx) => {
                const excluded = excludedDays.includes(idx);
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.excludeDayChip,
                      {
                        backgroundColor: excluded ? '#E74C3C' : 'transparent',
                        borderColor: excluded ? '#E74C3C' : colors.border,
                      },
                    ]}
                    onPress={() => toggleExcludedDay(idx)}
                  >
                    <Text style={{ color: excluded ? '#FFF' : colors.textOnDark, fontSize: 12, fontWeight: '600' }}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Generate button */}
          <TouchableOpacity
            style={[styles.generateBtn, { backgroundColor: colors.accent1 }]}
            onPress={handleGenerate}
          >
            <Ionicons name="sparkles" size={20} color="#FFF" />
            <Text style={styles.generateBtnText}>Generate Plan</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scroll: {
      padding: spacing.lg,
      paddingBottom: 40,
    },
    emptyContainer: {
      alignItems: 'center',
      paddingTop: 60,
      gap: spacing.md,
      padding: spacing.lg,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '700',
      textAlign: 'center',
    },
    emptySubtitle: {
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
      paddingHorizontal: spacing.xl,
    },
    editProfileBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: borderRadius.md,
      marginTop: spacing.sm,
    },
    editProfileBtnText: {
      color: '#FFF',
      fontSize: 16,
      fontWeight: '600',
    },

    // Summary card
    summaryCard: {
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      marginBottom: spacing.md,
      gap: spacing.sm,
    },
    summaryHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    summaryTitle: {
      fontSize: 16,
      fontWeight: '700',
    },
    editLink: {
      fontSize: 13,
      fontWeight: '600',
    },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    summaryChips: {
      flex: 1,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    readOnlyChip: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: borderRadius.full,
    },
    chipText: {
      fontSize: 12,
      fontWeight: '500',
    },
    examLine: {
      fontSize: 13,
      lineHeight: 18,
    },

    // Config section
    configSection: {
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    configTitle: {
      fontSize: 16,
      fontWeight: '700',
      marginBottom: spacing.sm,
    },
    configLabel: {
      fontSize: 12,
      fontWeight: '600',
      marginBottom: 6,
    },

    // Subject steppers
    subjectStepperRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    subjectName: {
      fontSize: 14,
      fontWeight: '500',
    },
    miniStepper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    miniStepperBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    miniStepperVal: {
      fontSize: 16,
      fontWeight: '700',
      minWidth: 20,
      textAlign: 'center',
    },

    // Time slot
    timeSlotRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
    },
    timePickerCol: {
      alignItems: 'center',
    },
    timePickerLabel: {
      fontSize: 11,
      marginBottom: 4,
    },
    timePicker: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    timeValue: {
      fontSize: 18,
      fontWeight: '700',
      minWidth: 60,
      textAlign: 'center',
    },

    // Duration
    durationRow: {
      flexDirection: 'row',
      gap: 8,
    },
    durationChip: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: borderRadius.md,
      borderWidth: 1,
    },

    // Strategy
    strategyRow: {
      flexDirection: 'row',
      gap: 8,
    },
    strategyChip: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: borderRadius.md,
      borderWidth: 1,
    },

    // Excluded days
    dayRow: {
      flexDirection: 'row',
      gap: 6,
    },
    excludeDayChip: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Generate button
    generateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: borderRadius.md,
    },
    generateBtnText: {
      color: '#FFF',
      fontSize: 16,
      fontWeight: '700',
    },
  });
}
