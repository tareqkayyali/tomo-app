/**
 * StudyPlanView — Study plan generation tab
 *
 * Reads ALL scheduling config from Rules (useScheduleRules).
 * Only shows generation-specific settings that don't exist in Rules:
 *   - Exam countdown pills (read-only)
 *   - Strategy (closest first / furthest first)
 *   - Per-subject sessions/week fine-tuning
 *   - Generate Plan CTA
 *
 * UI is unified with TrainingPlanView — same banner, sections, empty state pattern.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { useScheduleRules } from '../hooks/useScheduleRules';
import { updateUser, getCalendarEventsByRange, deleteCalendarEvent } from '../services/api';
import { generateStudyPlan } from '../services/studyPlanGenerator';
import { spacing, borderRadius, fontFamily } from '../theme';
import type { ThemeColors } from '../theme/colors';
import type {
  StudyPlanConfig,
  StudyBlock,
  StudyStrategy,
  SavedStudyPlan,
} from '../types';
import { getSavedStudyPlans, deleteStudyPlan } from '../services/savedStudyPlans';
import { exportStudyPlanPdf } from '../services/studyPlanPdfExport';

// ── Helpers ──────────────────────────────────────────────────────────

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function daysUntil(examDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exam = new Date(examDate);
  exam.setHours(0, 0, 0, 0);
  return Math.ceil((exam.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function urgencyColor(days: number, colors: ThemeColors): string {
  if (days <= 0) return colors.textInactive;
  if (days <= 7) return colors.error;
  if (days <= 14) return colors.warning;
  return colors.accent1;
}

// ── Component ────────────────────────────────────────────────────────

type StudyPlanViewProps = {
  onNavigateToPreview: (blocks: StudyBlock[], warnings?: string[], config?: StudyPlanConfig, savedPlanId?: string, viewOnly?: boolean) => void;
  onNavigateToRules: () => void;
};

export function StudyPlanView({ onNavigateToPreview, onNavigateToRules }: StudyPlanViewProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { profile } = useAuth();
  const { rules, loading, refresh } = useScheduleRules();
  const navigation = useNavigation();

  // Saved study plans
  const [savedPlans, setSavedPlans] = useState<SavedStudyPlan[]>([]);

  // Load saved plans on mount
  useEffect(() => {
    getSavedStudyPlans().then(setSavedPlans).catch(() => {});
  }, []);

  // Refresh data when tab is focused (so edits in Rules are picked up)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      refresh();
      setIsGenerating(false); // safety reset — prevents stuck disabled state
      getSavedStudyPlans().then(setSavedPlans).catch(() => {});
    });
    return unsubscribe;
  }, [navigation, refresh]);

  // ── Read everything from schedule rules ────────────────────────────

  const prefs = rules?.preferences;
  // Fallback: if rules.study_subjects is empty, use profile (migration bridge)
  const subjects = (prefs?.study_subjects?.length ? prefs.study_subjects : profile?.studySubjects) ?? [];
  const sessionDuration = (prefs?.study_duration_min ?? 45) as 30 | 45 | 60 | 90;

  // Study days — all 7 days (study plan uses every day, not linked to school days)
  const studyDays = [0, 1, 2, 3, 4, 5, 6];
  const excludedDays: number[] = []; // no excluded days — study happens every day

  // Study time window from rules
  const timeSlotStart = prefs?.study_start ?? '15:00';
  const timeSlotEnd = prefs?.day_bounds_end ?? '22:00';

  // Exams from rules
  const exams = useMemo(() => {
    if (prefs?.exam_schedule?.length) {
      return prefs.exam_schedule.map((e) => ({
        id: e.id,
        subject: e.subject,
        examType: e.examType as any,
        examDate: e.examDate,
      }));
    }
    // Fallback to profile if rules have no exams yet
    return profile?.examSchedule || [];
  }, [prefs?.exam_schedule, profile?.examSchedule]);

  const futureExams = useMemo(
    () => exams.filter((e) => daysUntil(e.examDate) > 0),
    [exams],
  );

  // Training prefs from rules (for conflict detection)
  const trainingPrefs = useMemo(() => {
    if (prefs?.training_categories?.length) {
      const club = prefs.training_categories.find((c) => c.id === 'club');
      const gym = prefs.training_categories.find((c) => c.id === 'gym');
      return {
        gymSessionsPerWeek: gym?.daysPerWeek ?? 0,
        gymFixedDays: gym?.fixedDays ?? [],
        clubSessionsPerWeek: club?.daysPerWeek ?? 0,
        clubFixedDays: club?.fixedDays ?? [],
      };
    }
    return profile?.trainingPreferences || {
      gymSessionsPerWeek: 0, gymFixedDays: [],
      clubSessionsPerWeek: 0, clubFixedDays: [],
    };
  }, [prefs?.training_categories, profile?.trainingPreferences]);

  const schoolSchedule = useMemo(() => {
    if (!prefs) return undefined;
    return {
      type: 'school' as const,
      days: prefs.school_days as number[],
      startTime: prefs.school_start,
      endTime: prefs.school_end,
    };
  }, [prefs]);

  // ── Generation-specific state (NOT in Rules) ───────────────────────

  const savedConfig = profile?.studyPlanConfig;

  // Subjects that have future exams — these drive sessions/week
  const examSubjects = useMemo(
    () => [...new Set(futureExams.map((e) => e.subject))],
    [futureExams],
  );

  // Auto-calculate daysPerSubject from exam proximity
  const autoDaysPerSubject = useMemo(() => {
    const defaults: Record<string, number> = {};
    for (const exam of futureExams) {
      const days = daysUntil(exam.examDate);
      if (days <= 7) defaults[exam.subject] = 4;
      else if (days <= 14) defaults[exam.subject] = 3;
      else defaults[exam.subject] = 2;
    }
    return defaults;
  }, [futureExams]);

  const [strategy, setStrategy] = useState<StudyStrategy>(savedConfig?.strategy || 'last_exam_first');
  const [daysPerSubject, setDaysPerSubject] = useState<Record<string, number>>(
    savedConfig?.daysPerSubject || autoDaysPerSubject,
  );
  const [isGenerating, setIsGenerating] = useState(false);

  // ── Derived ────────────────────────────────────────────────────────

  const currentConfig = useMemo((): StudyPlanConfig => ({
    daysPerSubject,
    timeSlotStart,
    timeSlotEnd,
    sessionDuration,
    strategy,
    excludedDays,
  }), [daysPerSubject, timeSlotStart, timeSlotEnd, sessionDuration, strategy, excludedDays]);

  const blockEstimate = useMemo(() => {
    if (futureExams.length === 0) return 0;
    let total = 0;
    for (const exam of futureExams) {
      const sessionsPerWeek = daysPerSubject[exam.subject] || 2;
      const weeksForSubj = Math.ceil(daysUntil(exam.examDate) / 7);
      total += sessionsPerWeek * weeksForSubj;
    }
    return total;
  }, [futureExams, daysPerSubject]);

  // Config summary text for banner
  const configSummary = useMemo(() => {
    return `${sessionDuration}m sessions · 7 days/wk · ${subjects.length} subject${subjects.length === 1 ? '' : 's'}`;
  }, [sessionDuration, subjects.length]);

  // ── Handlers ───────────────────────────────────────────────────────

  const saveConfig = useCallback(async (config: StudyPlanConfig) => {
    try {
      await updateUser({ studyPlanConfig: config } as any);
    } catch { /* silent */ }
  }, []);

  const setSubjectDays = (subj: string, val: number) => {
    const clamped = Math.max(1, Math.min(7, val));
    setDaysPerSubject((prev) => {
      const next = { ...prev, [subj]: clamped };
      saveConfig({ ...currentConfig, daysPerSubject: next });
      return next;
    });
  };

  // ── Generate ───────────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (subjects.length === 0 || exams.length === 0) {
      Alert.alert('Missing Info', 'Add your subjects and exam schedule in My Rules first.', [
        { text: 'Go to Rules', onPress: onNavigateToRules },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }

    if (timeToMinutes(timeSlotEnd) - timeToMinutes(timeSlotStart) < sessionDuration) {
      Alert.alert('Time Window Too Small', `The study window must be at least ${sessionDuration} minutes. Adjust in My Rules.`);
      return;
    }

    saveConfig(currentConfig);
    setIsGenerating(true);

    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const latestExamDate = exams.reduce((latest, e) => {
        const d = new Date(e.examDate);
        return d > latest ? d : latest;
      }, new Date(exams[0].examDate));

      const startDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
      const endDate = `${latestExamDate.getFullYear()}-${String(latestExamDate.getMonth() + 1).padStart(2, '0')}-${String(latestExamDate.getDate()).padStart(2, '0')}`;

      let existingEvents: any[] = [];
      try {
        const res = await getCalendarEventsByRange(startDate, endDate);
        existingEvents = res.events || [];
      } catch {
        console.warn('[StudyPlan] Could not fetch calendar events');
      }

      const existingStudyBlocks = existingEvents.filter((e: any) => e.type === 'study_block');

      const proceedWithGeneration = async (eventsForGenerator: any[]) => {
        const result = generateStudyPlan(currentConfig, exams, trainingPrefs, eventsForGenerator, schoolSchedule, rules?.effectiveRules);

        if (result.blocks.length === 0) {
          const msg = result.warnings.length > 0
            ? result.warnings.join('\n')
            : 'Could not generate any study blocks. Try adjusting your settings.';
          Alert.alert('No Blocks Generated', msg);
          setIsGenerating(false);
          return;
        }

        setIsGenerating(false);

        // Always go straight to preview — warnings are shown inline there
        onNavigateToPreview(result.blocks, result.warnings.length > 0 ? result.warnings : undefined, currentConfig);
      };

      if (existingStudyBlocks.length > 0) {
        setIsGenerating(false);
        Alert.alert(
          'Existing Study Plan',
          `You have ${existingStudyBlocks.length} study block${existingStudyBlocks.length > 1 ? 's' : ''} in your calendar. Generating will replace them.`,
          [
            {
              text: 'Replace & Generate',
              style: 'destructive',
              onPress: async () => {
                setIsGenerating(true);
                for (const block of existingStudyBlocks) {
                  try { await deleteCalendarEvent(block.id); } catch { /* skip */ }
                }
                await proceedWithGeneration(existingEvents.filter((e: any) => e.type !== 'study_block'));
              },
            },
            { text: 'Cancel', style: 'cancel' },
          ],
        );
        return;
      }

      await proceedWithGeneration(existingEvents);
    } catch (err) {
      console.error('[StudyPlan] Generation error:', err);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }, [subjects, exams, trainingPrefs, currentConfig, timeSlotStart, timeSlotEnd, sessionDuration, saveConfig, onNavigateToPreview, onNavigateToRules, schoolSchedule, rules?.effectiveRules]);

  // ── Loading state (prevents flash — matches Training tab) ──────────

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.accent1} />
      </View>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────

  if (subjects.length === 0 && exams.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.emptyContainer}>
        <View style={styles.emptyIcon}>
          <Ionicons name="school-outline" size={32} color={colors.accent1} />
        </View>
        <Text style={styles.emptyTitle}>No study info yet</Text>
        <Text style={styles.emptySubtitle}>
          Add your subjects and exam schedule in My Rules to generate a study plan.
        </Text>
        <TouchableOpacity style={[styles.rulesBtn, { backgroundColor: `${colors.accent1}1F`, borderColor: `${colors.accent1}4D`, borderWidth: 1 }]} onPress={onNavigateToRules}>
          <Ionicons name="options-outline" size={16} color={colors.accent1} />
          <Text style={[styles.rulesBtnText, { color: colors.accent1 }]}>Go to Rules</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

      {/* ─── Saved Plans ─── */}
      {savedPlans.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Saved Plans</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.savedPlanRow}>
            {savedPlans.map((plan) => {
              const createdDate = new Date(plan.createdAt);
              const daysAgo = Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
              const relTime = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo}d ago`;

              return (
                <TouchableOpacity
                  key={plan.id}
                  style={styles.savedPlanCard}
                  activeOpacity={0.7}
                  onPress={() => onNavigateToPreview(plan.blocks, undefined, plan.config, plan.id, true)}
                  onLongPress={() => {
                    Alert.alert('Delete Plan?', `Remove "${plan.name}"?`, [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: async () => {
                          await deleteStudyPlan(plan.id);
                          setSavedPlans((prev) => prev.filter((p) => p.id !== plan.id));
                        },
                      },
                    ]);
                  }}
                >
                  <View style={styles.savedPlanHeader}>
                    <Ionicons name="document-text" size={16} color={colors.warning} />
                    <TouchableOpacity
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      onPress={async () => {
                        try {
                          await exportStudyPlanPdf(plan);
                        } catch {
                          Alert.alert('Export Failed', 'Could not generate PDF.');
                        }
                      }}
                    >
                      <Ionicons name="download-outline" size={16} color={colors.textInactive} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.savedPlanName} numberOfLines={1}>{plan.name}</Text>
                  <Text style={styles.savedPlanMeta}>
                    {plan.blockCount} blocks · {plan.examCount} exams
                  </Text>
                  <Text style={styles.savedPlanDate}>{relTime}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ─── Config summary banner (matches Training tab) ─── */}
      <TouchableOpacity style={styles.configBanner} onPress={onNavigateToRules} activeOpacity={0.7}>
        <View style={styles.configBannerLeft}>
          <Ionicons name="options-outline" size={14} color={colors.accent1} />
          <Text style={[styles.configBannerText, { color: colors.textSecondary }]}>
            {configSummary}
          </Text>
        </View>
        <Text style={[styles.configBannerEdit, { color: colors.accent1 }]}>Edit Rules</Text>
      </TouchableOpacity>

      {/* ─── Exam Countdown Pills ─── */}
      {futureExams.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Upcoming Exams</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.examPillRow}>
            {futureExams
              .sort((a, b) => daysUntil(a.examDate) - daysUntil(b.examDate))
              .map((exam) => {
                const days = daysUntil(exam.examDate);
                return (
                  <View
                    key={exam.id}
                    style={[styles.examPill, { borderColor: 'rgba(123, 97, 255, 0.25)', backgroundColor: 'rgba(123, 97, 255, 0.10)' }]}
                  >
                    <Text style={[styles.examPillSubject, { color: '#7B61FF' }]}>{exam.subject}</Text>
                    <Text style={[styles.examPillDays, { color: days <= 7 ? colors.error : '#7B61FF' }]}>{days}d</Text>
                  </View>
                );
              })}
          </ScrollView>
        </View>
      ) : exams.length > 0 ? (
        <View style={styles.section}>
          <View style={[styles.infoBanner, { backgroundColor: `${colors.textInactive}10` }]}>
            <Ionicons name="checkmark-circle" size={16} color={colors.readinessGreen} />
            <Text style={[styles.infoBannerText, { color: colors.textSecondary }]}>
              All exams completed!
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.infoBanner, { backgroundColor: '#E74C3C12' }]}
            onPress={onNavigateToRules}
          >
            <Ionicons name="alert-circle" size={16} color={colors.error} />
            <Text style={[styles.infoBannerText, { color: colors.error }]}>
              No exams scheduled
            </Text>
            <Text style={[styles.configBannerEdit, { color: colors.accent1 }]}>Add in Rules</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ─── Strategy (generation-specific, not in Rules) ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Priority Strategy</Text>
        <View style={styles.chipRow}>
          <TouchableOpacity
            style={[
              styles.chip,
              strategy === 'last_exam_first'
                ? { backgroundColor: 'rgba(123, 97, 255, 0.12)', borderColor: 'rgba(123, 97, 255, 0.30)' }
                : { backgroundColor: 'transparent', borderColor: colors.border },
            ]}
            onPress={() => { setStrategy('last_exam_first'); saveConfig({ ...currentConfig, strategy: 'last_exam_first' }); }}
          >
            <Text style={[styles.chipText, { color: strategy === 'last_exam_first' ? '#7B61FF' : colors.textInactive }]}>
              Closest first
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.chip,
              strategy === 'first_exam_first'
                ? { backgroundColor: 'rgba(123, 97, 255, 0.12)', borderColor: 'rgba(123, 97, 255, 0.30)' }
                : { backgroundColor: 'transparent', borderColor: colors.border },
            ]}
            onPress={() => { setStrategy('first_exam_first'); saveConfig({ ...currentConfig, strategy: 'first_exam_first' }); }}
          >
            <Text style={[styles.chipText, { color: strategy === 'first_exam_first' ? '#7B61FF' : colors.textInactive }]}>
              Furthest first
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── Per-subject sessions/week (only subjects with future exams) ─── */}
      {examSubjects.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Sessions per week</Text>
          {examSubjects.map((subj) => {
            const exam = futureExams.find((e) => e.subject === subj);
            const daysLeft = exam ? daysUntil(exam.examDate) : 0;
            return (
            <View key={subj} style={styles.subjectRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.subjectName}>{subj}</Text>
                {exam && (
                  <Text style={[styles.blockMeta, { color: daysLeft <= 7 ? colors.error : '#7B61FF' }]}>
                    Exam in {daysLeft}d
                  </Text>
                )}
              </View>
              <View style={styles.miniStepper}>
                <TouchableOpacity
                  onPress={() => setSubjectDays(subj, (daysPerSubject[subj] || 2) - 1)}
                  style={[styles.stepperBtn, { borderColor: colors.border }]}
                >
                  <Ionicons name="remove" size={14} color={colors.textOnDark} />
                </TouchableOpacity>
                <Text style={styles.miniStepperVal}>{daysPerSubject[subj] || 2}</Text>
                <TouchableOpacity
                  onPress={() => setSubjectDays(subj, (daysPerSubject[subj] || 2) + 1)}
                  style={[styles.stepperBtn, { borderColor: colors.border }]}
                >
                  <Ionicons name="add" size={14} color={colors.textOnDark} />
                </TouchableOpacity>
              </View>
            </View>
            );
          })}
        </View>
      )}

      {/* ─── Block Estimate ─── */}
      {blockEstimate > 0 && (
        <View style={styles.estimateRow}>
          <Ionicons name="layers-outline" size={16} color={colors.accent1} />
          <Text style={styles.estimateText}>~{blockEstimate} study blocks</Text>
        </View>
      )}

      {/* ─── Generate / Edit CTA ─── */}
      {(() => {
        const canGenerate = futureExams.length > 0 && subjects.length > 0;
        const hasExistingPlan = savedPlans.length > 0;
        const reason = subjects.length === 0
          ? 'Add subjects in Rules first'
          : exams.length === 0
          ? 'Add exam schedule in Rules first'
          : futureExams.length === 0
          ? 'No upcoming exams — all dates are in the past'
          : null;

        return (
          <>
            {reason && (
              <TouchableOpacity
                style={[styles.infoBanner, { backgroundColor: '#F39C1212', marginBottom: spacing.sm }]}
                onPress={onNavigateToRules}
              >
                <Ionicons name="warning-outline" size={16} color={colors.warning} />
                <Text style={[styles.infoBannerText, { color: colors.warning }]}>{reason}</Text>
                {(subjects.length === 0 || exams.length === 0) && (
                  <Text style={[styles.configBannerEdit, { color: colors.accent1 }]}>Fix in Rules</Text>
                )}
              </TouchableOpacity>
            )}

            {/* Edit existing plan */}
            {hasExistingPlan && (
              <TouchableOpacity
                style={[styles.generateBtn, { backgroundColor: `${colors.warning}1F`, borderColor: `${colors.warning}4D`, borderWidth: 1, marginBottom: spacing.sm }]}
                onPress={() => {
                  const latest = savedPlans[0];
                  onNavigateToPreview(latest.blocks, undefined, latest.config, latest.id);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="pencil" size={16} color={colors.warning} />
                <Text style={[styles.generateBtnText, { color: colors.warning }]}>Edit Study Plan</Text>
              </TouchableOpacity>
            )}

            {/* Generate new plan */}
            <TouchableOpacity
              style={[styles.generateBtn, {
                opacity: !canGenerate || isGenerating ? 0.4 : 1,
                backgroundColor: `${colors.accent1}1F`,
                borderWidth: 1,
                borderColor: `${colors.accent1}4D`,
              }]}
              onPress={handleGenerate}
              disabled={!canGenerate || isGenerating}
              activeOpacity={0.7}
            >
              {isGenerating ? (
                <ActivityIndicator size="small" color={colors.accent1} />
              ) : (
                <Ionicons name="sparkles" size={16} color={colors.accent1} />
              )}
              <Text style={[styles.generateBtnText, { color: colors.accent1 }]}>
                {isGenerating ? 'Generating plan...' : hasExistingPlan ? 'Regenerate New Plan' : 'Generate Study Plan'}
              </Text>
            </TouchableOpacity>
          </>
        );
      })()}
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

    // Loading (matches Training tab)
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 60,
    },

    // Empty state (matches Training tab)
    emptyContainer: {
      alignItems: 'center',
      paddingTop: 60,
      gap: spacing.md,
      padding: spacing.lg,
    },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: `${colors.accent1}15`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyTitle: {
      fontSize: 18,
      fontFamily: fontFamily.bold,
      color: colors.textOnDark,
      textAlign: 'center',
    },
    emptySubtitle: {
      fontSize: 14,
      fontFamily: fontFamily.regular,
      lineHeight: 20,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingHorizontal: spacing.xl,
    },
    rulesBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 12,
      marginTop: spacing.sm,
    },
    rulesBtnText: {
      fontSize: 13,
      fontFamily: fontFamily.medium,
    },

    // Config banner (matches Training tab exactly)
    configBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: `${colors.accent1}08`,
      borderWidth: 1,
      borderColor: `${colors.accent1}20`,
      marginBottom: spacing.lg,
    },
    configBannerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    configBannerText: {
      fontSize: 13,
      fontFamily: fontFamily.medium,
    },
    configBannerEdit: {
      fontSize: 13,
      fontFamily: fontFamily.semiBold,
    },

    // Section (matches Training tab)
    section: {
      marginBottom: spacing.lg,
    },
    sectionLabel: {
      fontSize: 12,
      fontFamily: fontFamily.semiBold,
      color: colors.textInactive,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: spacing.sm,
    },

    // Saved plans
    savedPlanRow: {
      flexDirection: 'row',
      gap: 10,
      paddingRight: spacing.md,
    },
    savedPlanCard: {
      width: 155,
      padding: 12,
      borderRadius: 14,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: `#F39C1220`,
    },
    savedPlanHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    savedPlanName: {
      fontSize: 14,
      fontFamily: fontFamily.semiBold,
      color: colors.textOnDark,
      marginBottom: 2,
    },
    savedPlanMeta: {
      fontSize: 11,
      fontFamily: fontFamily.regular,
      color: colors.textSecondary,
    },
    savedPlanDate: {
      fontSize: 10,
      fontFamily: fontFamily.regular,
      color: colors.textInactive,
      marginTop: 4,
    },

    // Info banner
    infoBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 12,
      borderRadius: 12,
    },
    infoBannerText: {
      flex: 1,
      fontSize: 13,
      fontFamily: fontFamily.medium,
    },

    // Exam pills
    examPillRow: {
      flexDirection: 'row',
      gap: 8,
      paddingRight: spacing.md,
    },
    examPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 20,
      borderWidth: 1,
    },
    examPillSubject: {
      fontSize: 14,
      fontFamily: fontFamily.semiBold,
    },
    examPillDays: {
      fontSize: 13,
      fontFamily: fontFamily.bold,
    },

    // Chips
    chipRow: {
      flexDirection: 'row',
      gap: 8,
    },
    chip: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
    },
    chipText: {
      fontSize: 13,
      fontFamily: fontFamily.medium,
    },

    // Subject rows
    subjectRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    subjectName: {
      fontSize: 14,
      fontFamily: fontFamily.medium,
      color: colors.textOnDark,
    },
    blockMeta: {
      fontSize: 11,
      fontFamily: fontFamily.regular,
      marginTop: 1,
    },
    miniStepper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    stepperBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    miniStepperVal: {
      fontSize: 16,
      fontFamily: fontFamily.bold,
      color: colors.textOnDark,
      minWidth: 20,
      textAlign: 'center',
    },

    // Estimate (matches Training tab)
    estimateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: spacing.md,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: `${colors.accent1}10`,
      alignSelf: 'center',
    },
    estimateText: {
      fontSize: 14,
      fontFamily: fontFamily.semiBold,
      color: colors.accent1,
    },

    // Generate button (subtle style — matches "Ask Tomo" in My Programs)
    generateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 12,
    },
    generateBtnText: {
      fontSize: 13,
      fontFamily: fontFamily.medium,
    },
  });
}
