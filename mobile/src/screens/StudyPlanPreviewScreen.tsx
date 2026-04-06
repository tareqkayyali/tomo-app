/**
 * StudyPlanPreviewScreen — Unified preview for study + training blocks
 *
 * Shows blocks grouped by date with exam markers inline.
 * Each block can be edited (date/time) or deleted.
 * "Book All" creates real calendar events.
 */

import React, { useState, useCallback, useMemo, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SmartIcon } from '../components/SmartIcon';
import { useTheme } from '../hooks/useTheme';
import { useScheduleRules } from '../hooks/useScheduleRules';
import { createCalendarEvent, getCalendarEventsByRange, deleteCalendarEvent } from '../services/api';
import { spacing, borderRadius, fontFamily } from '../theme';
import type { ThemeColors } from '../theme/colors';
import { GradientButton } from '../components/GradientButton';
import type { StudyBlock, TrainingBlock, CalendarEventInput, StudyPlanConfig } from '../types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import { saveStudyPlan, createStudyPlanFromBooking } from '../services/savedStudyPlans';
import { exportStudyPlanPdf } from '../services/studyPlanPdfExport';

type Props = NativeStackScreenProps<MainStackParamList, 'StudyPlanPreview'>;

// Unified block shape for rendering
interface PreviewBlock {
  id: string;
  title: string;
  subtitle: string;
  date: string;
  startTime: string;
  endTime: string;
  color: string;
  icon: string;
  eventType: 'study_block' | 'training';
  notes: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

const TIME_OPTIONS = (() => {
  const opts: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of ['00', '15', '30', '45']) {
      opts.push(`${String(h).padStart(2, '0')}:${m}`);
    }
  }
  return opts;
})();

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function StudyPlanPreviewScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { rules } = useScheduleRules();

  const planType = route.params.planType || 'study';
  const savedPlanId = route.params.savedPlanId;
  const isViewOnly = route.params.viewOnly === 'true';
  const isEdit = !!savedPlanId && !isViewOnly; // editing an existing saved plan

  // Parse config from route params (for saving)
  const config = useMemo<StudyPlanConfig | null>(() => {
    try {
      return route.params.config ? JSON.parse(route.params.config) : null;
    } catch {
      return null;
    }
  }, [route.params.config]);

  // Store raw StudyBlock[] for saving
  const rawStudyBlocksRef = useRef<StudyBlock[]>([]);

  // Get exam dates for markers (study plans only)
  const examDates = useMemo(() => {
    if (planType !== 'study') return new Map<string, string[]>();
    const exams = rules?.preferences?.exam_schedule ?? [];
    const map = new Map<string, string[]>();
    for (const e of exams) {
      if (!e.examDate) continue;
      const existing = map.get(e.examDate) || [];
      existing.push(e.subject);
      map.set(e.examDate, existing);
    }
    return map;
  }, [rules?.preferences?.exam_schedule, planType]);

  // Parse blocks from route params
  const initialBlocks: PreviewBlock[] = useMemo(() => {
    try {
      const raw = JSON.parse(route.params.blocks);
      if (planType === 'training') {
        return (raw as TrainingBlock[]).map((b) => {
          const programNames = b.linkedPrograms?.length
            ? b.linkedPrograms.map(p => p.name).join(', ')
            : '';
          const notes = programNames
            ? `${b.categoryLabel}\nPrograms: ${programNames}`
            : b.categoryLabel;
          return {
            id: b.id,
            title: b.categoryLabel,
            subtitle: `${b.startTime} – ${b.endTime}`,
            date: b.date,
            startTime: b.startTime,
            endTime: b.endTime,
            color: b.categoryColor || colors.accent1,
            icon: 'barbell-outline',
            eventType: 'training' as const,
            notes,
          };
        });
      }
      const studyBlocks = raw as StudyBlock[];
      rawStudyBlocksRef.current = studyBlocks;
      return studyBlocks.map((b) => ({
        id: b.id,
        title: b.subject,
        subtitle: `${b.startTime} – ${b.endTime}`,
        date: b.date,
        startTime: b.startTime,
        endTime: b.endTime,
        color: colors.warning,
        icon: 'book-outline',
        eventType: 'study_block' as const,
        notes: `For ${b.examType} on ${b.examDate}`,
      }));
    } catch {
      return [];
    }
  }, [route.params.blocks, planType, colors.accent1]);

  // Get available subjects for editing (study plans only)
  const availableSubjects = useMemo(() => {
    if (planType !== 'study') return [];
    const subjects = rules?.preferences?.study_subjects ?? [];
    if (subjects.length > 0) return subjects;
    // Fallback: extract unique subjects from the blocks themselves
    const fromBlocks = [...new Set(initialBlocks.map((b) => b.title))];
    return fromBlocks;
  }, [rules?.preferences?.study_subjects, planType, initialBlocks]);

  const warnings: string[] = useMemo(() => {
    try {
      return route.params.warnings ? JSON.parse(route.params.warnings) : [];
    } catch {
      return [];
    }
  }, [route.params.warnings]);

  const [blocks, setBlocks] = useState<PreviewBlock[]>(initialBlocks);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // ── Block mutations ──

  const removeBlock = useCallback((id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const updateBlock = useCallback((id: string, patch: Partial<PreviewBlock>, keepOpen = true) => {
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b;
        const updated = { ...b, ...patch };
        updated.subtitle = `${updated.startTime} – ${updated.endTime}`;
        return updated;
      }),
    );
    if (!keepOpen) setEditingId(null);
  }, []);

  // Group by date (including exam marker dates)
  const groupedEntries = useMemo(() => {
    // Collect all dates (blocks + exams)
    const allDates = new Set<string>();
    for (const b of blocks) allDates.add(b.date);
    for (const d of examDates.keys()) allDates.add(d);

    const sorted = [...allDates].sort();
    return sorted.map((date) => ({
      date,
      label: formatDateLabel(date),
      blocks: blocks.filter((b) => b.date === date),
      exams: examDates.get(date) || [],
    })).filter((g) => g.blocks.length > 0 || g.exams.length > 0);
  }, [blocks, examDates]);

  // Book all
  const handleBookAll = useCallback(async () => {
    if (blocks.length === 0) return;

    setSaving(true);
    let successCount = 0;
    const failed: PreviewBlock[] = [];

    // 0) If editing an existing plan, delete old study_block + exam events first
    if (isEdit && planType === 'study') {
      try {
        const dates = blocks.map((b) => b.date);
        const examDateKeys = [...examDates.keys()];
        const allDates = [...new Set([...dates, ...examDateKeys])].sort();
        const rangeStart = allDates[0];
        const rangeEnd = allDates[allDates.length - 1];
        if (rangeStart && rangeEnd) {
          const res = await getCalendarEventsByRange(rangeStart, rangeEnd);
          const oldEvents = (res.events || []).filter(
            (e: any) => e.type === 'study_block' || e.type === 'exam',
          );
          await Promise.allSettled(
            oldEvents.map((e: any) => deleteCalendarEvent(e.id)),
          );
        }
      } catch {
        // Non-critical — proceed with creating new events
      }
    }

    // 1) Create study/training block events
    const blockPromises = blocks.map(async (block) => {
      const eventData: CalendarEventInput & { gapMinutes?: number } = {
        name: planType === 'training' ? block.title : `${block.title} Study`,
        type: block.eventType,
        date: block.date,
        startTime: block.startTime,
        endTime: block.endTime,
        notes: block.notes,
        // Skip conflict repositioning for plan-generated events — times are pre-validated
        gapMinutes: 0,
      };
      return createCalendarEvent(eventData as CalendarEventInput);
    });

    // 2) Create exam events covering full school hours
    const examPromises: Promise<any>[] = [];
    if (planType === 'study' && examDates.size > 0) {
      const schoolStart = rules?.preferences?.school_start ?? '08:00';
      const schoolEnd = rules?.preferences?.school_end ?? '15:00';

      for (const [date, subjects] of examDates.entries()) {
        for (const subject of subjects) {
          examPromises.push(
            createCalendarEvent({
              name: `${subject} Exam`,
              type: 'exam',
              date,
              startTime: schoolStart,
              endTime: schoolEnd,
              notes: `${subject} exam`,
            }),
          );
        }
      }
    }

    const allPromises = [...blockPromises, ...examPromises];
    const results = await Promise.allSettled(allPromises);

    // Count block results (first N are blocks)
    results.slice(0, blocks.length).forEach((result, i) => {
      if (result.status === 'fulfilled') {
        successCount++;
      } else {
        failed.push(blocks[i]);
      }
    });

    const examSuccessCount = results
      .slice(blocks.length)
      .filter((r) => r.status === 'fulfilled').length;

    setSaving(false);

    if (failed.length > 0) {
      setBlocks(failed);
      if (Platform.OS === 'web') {
        window.alert(`${successCount} blocks added, ${failed.length} failed. Retry remaining?`);
      } else {
        Alert.alert(
          'Partial Success',
          `${successCount} blocks added, ${failed.length} failed. Retry remaining?`,
        );
      }
    } else {
      // Save the study plan for later viewing
      if (planType === 'study') {
        try {
          // Rebuild StudyBlock[] from current (possibly edited) blocks
          const currentStudyBlocks: StudyBlock[] = blocks.map((b, i) => {
            const orig = rawStudyBlocksRef.current[i];
            return {
              id: b.id,
              subject: b.title,
              date: b.date,
              startTime: b.startTime,
              endTime: b.endTime,
              examDate: orig?.examDate ?? '',
              examType: orig?.examType ?? ('Quiz' as any),
            };
          });
          const examEntries = (rules?.preferences?.exam_schedule ?? [])
            .filter((e: any) => e.examDate && e.subject)
            .map((e: any) => ({ subject: e.subject, examDate: e.examDate, examType: e.examType || 'Quiz' }));
          const fallbackConfig: StudyPlanConfig = config ?? {
            daysPerSubject: {},
            timeSlotStart: '15:00',
            timeSlotEnd: '21:00',
            sessionDuration: 60,
            strategy: 'last_exam_first',
            excludedDays: [],
          };
          const plan = createStudyPlanFromBooking(currentStudyBlocks, examEntries, fallbackConfig);
          await saveStudyPlan(plan);
        } catch {
          // Non-critical — don't block success flow
        }
      }

      // Auto-navigate to Timeline after short success feedback
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      navigation.navigate('MainTabs' as any, { screen: 'Plan' });
    }
  }, [blocks, navigation, planType, examDates, rules?.preferences, config, isEdit]);

  // Export PDF handler (view-only mode)
  const handleExportPdf = useCallback(async () => {
    setSaving(true);
    try {
      const currentStudyBlocks: StudyBlock[] = blocks.map((b, i) => {
        const orig = rawStudyBlocksRef.current[i];
        return {
          id: b.id,
          subject: b.title,
          date: b.date,
          startTime: b.startTime,
          endTime: b.endTime,
          examDate: orig?.examDate ?? '',
          examType: orig?.examType ?? ('Quiz' as any),
        };
      });
      const examEntries = (rules?.preferences?.exam_schedule ?? [])
        .filter((e: any) => e.examDate && e.subject)
        .map((e: any) => ({ subject: e.subject, examDate: e.examDate, examType: e.examType || 'Quiz' }));
      const fallbackConfig: StudyPlanConfig = config ?? {
        daysPerSubject: {},
        timeSlotStart: '15:00',
        timeSlotEnd: '21:00',
        sessionDuration: 60,
        strategy: 'last_exam_first',
        excludedDays: [],
      };
      const plan = createStudyPlanFromBooking(currentStudyBlocks, examEntries, fallbackConfig);
      await exportStudyPlanPdf(plan);
    } catch (err) {
      if (Platform.OS === 'web') {
        window.alert('Could not generate PDF. Please try again.');
      } else {
        Alert.alert('Export Failed', 'Could not generate PDF. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }, [blocks, rules?.preferences, config]);

  const accentColor = planType === 'training' ? colors.accent1 : colors.warning;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <SmartIcon name="arrow-back" size={24} color={colors.textOnDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {planType === 'training' ? 'Training Plan' : 'Study Plan'}
        </Text>
        <View style={[styles.countBadge, { backgroundColor: accentColor }]}>
          <Text style={styles.countBadgeText}>{blocks.length}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Warnings */}
        {warnings.length > 0 && (
          <View style={styles.warningBanner}>
            <View style={styles.warningHeader}>
              <SmartIcon name="warning-outline" size={18} color="#5A6B7C" />
              <Text style={styles.warningTitle}>Some sessions could not be placed</Text>
            </View>
            {warnings.map((w, i) => (
              <Text key={i} style={styles.warningText}>{'\u2022'} {w}</Text>
            ))}
          </View>
        )}

        {/* Grouped blocks with exam markers */}
        {groupedEntries.map(({ date, label, blocks: dayBlocks, exams: dayExams }) => (
          <View key={date} style={styles.dateGroup}>
            <Text style={styles.dateHeader}>{label}</Text>

            {/* Exam marker */}
            {dayExams.length > 0 && (
              <View style={styles.examMarker}>
                <View style={styles.examMarkerDot} />
                <SmartIcon name="school" size={14} color={colors.error} />
                <Text style={styles.examMarkerText}>
                  {dayExams.join(', ')} exam{dayExams.length > 1 ? 's' : ''}
                </Text>
              </View>
            )}

            {/* Study/training blocks */}
            {dayBlocks.map((block) => (
              <View key={block.id}>
                <View style={styles.blockCard}>
                  <View style={[styles.blockColorBar, { backgroundColor: block.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.blockTitle}>{block.title}</Text>
                    <Text style={[styles.blockTime, { color: block.color }]}>
                      {block.startTime} – {block.endTime}
                    </Text>
                    {planType === 'study' && (
                      <Text style={styles.blockMeta}>{block.notes}</Text>
                    )}
                  </View>
                  <View style={styles.blockActions}>
                    <TouchableOpacity
                      onPress={() => setEditingId(editingId === block.id ? null : block.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <SmartIcon name="pencil" size={18} color={colors.textInactive} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => removeBlock(block.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <SmartIcon name="close-circle" size={20} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Inline edit panel */}
                {editingId === block.id && (
                  <View style={styles.editPanel}>
                    {/* Subject picker (study only) */}
                    {planType === 'study' && availableSubjects.length > 1 && (
                      <View style={styles.editRow}>
                        <Text style={styles.editLabel}>Subj</Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.editChips}
                        >
                          {availableSubjects.map((subj) => {
                            const isActive = block.title === subj;
                            return (
                              <TouchableOpacity
                                key={subj}
                                style={[
                                  styles.editChip,
                                  isActive && { backgroundColor: colors.warning, borderColor: colors.warning },
                                ]}
                                onPress={() => {
                                  if (!isActive) {
                                    updateBlock(block.id, { title: subj, notes: `Study: ${subj}` }, true);
                                  }
                                }}
                              >
                                <Text
                                  style={[
                                    styles.editChipText,
                                    isActive && { color: colors.textPrimary },
                                  ]}
                                >
                                  {subj}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      </View>
                    )}

                    {/* Date shift */}
                    <View style={styles.editRow}>
                      <Text style={styles.editLabel}>Date</Text>
                      <View style={styles.editChips}>
                        <TouchableOpacity
                          style={styles.editChip}
                          onPress={() => updateBlock(block.id, { date: shiftDate(block.date, -1) })}
                        >
                          <SmartIcon name="chevron-back" size={14} color={colors.textOnDark} />
                          <Text style={styles.editChipText}>-1d</Text>
                        </TouchableOpacity>
                        <Text style={[styles.editValue, { color: colors.textOnDark }]}>
                          {formatDateLabel(block.date)}
                        </Text>
                        <TouchableOpacity
                          style={styles.editChip}
                          onPress={() => updateBlock(block.id, { date: shiftDate(block.date, 1) })}
                        >
                          <Text style={styles.editChipText}>+1d</Text>
                          <SmartIcon name="chevron-forward" size={14} color={colors.textOnDark} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Start time */}
                    <View style={styles.editRow}>
                      <Text style={styles.editLabel}>Start</Text>
                      <View style={styles.editChips}>
                        <TouchableOpacity
                          style={styles.editChip}
                          onPress={() => {
                            const idx = TIME_OPTIONS.indexOf(block.startTime);
                            if (idx > 0) {
                              const dur = timeToMin(block.endTime) - timeToMin(block.startTime);
                              const newStart = TIME_OPTIONS[idx - 1];
                              updateBlock(block.id, { startTime: newStart, endTime: minToTime(timeToMin(newStart) + dur) });
                            }
                          }}
                        >
                          <SmartIcon name="chevron-back" size={14} color={colors.textOnDark} />
                        </TouchableOpacity>
                        <Text style={[styles.editValue, { color: colors.textOnDark }]}>
                          {block.startTime}
                        </Text>
                        <TouchableOpacity
                          style={styles.editChip}
                          onPress={() => {
                            const idx = TIME_OPTIONS.indexOf(block.startTime);
                            if (idx < TIME_OPTIONS.length - 1) {
                              const dur = timeToMin(block.endTime) - timeToMin(block.startTime);
                              const newStart = TIME_OPTIONS[idx + 1];
                              updateBlock(block.id, { startTime: newStart, endTime: minToTime(timeToMin(newStart) + dur) });
                            }
                          }}
                        >
                          <SmartIcon name="chevron-forward" size={14} color={colors.textOnDark} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Duration pills */}
                    <View style={styles.editRow}>
                      <Text style={styles.editLabel}>Dur</Text>
                      <View style={styles.editChips}>
                        {[30, 45, 60, 75, 90, 120].map((dur) => {
                          const currentDur = timeToMin(block.endTime) - timeToMin(block.startTime);
                          const isActive = currentDur === dur;
                          return (
                            <TouchableOpacity
                              key={dur}
                              style={[
                                styles.editChip,
                                isActive && { backgroundColor: colors.accent1, borderColor: colors.accent1 },
                              ]}
                              onPress={() => {
                                updateBlock(block.id, { endTime: minToTime(timeToMin(block.startTime) + dur) });
                              }}
                            >
                              <Text style={[styles.editChipText, isActive && { color: colors.textPrimary }]}>
                                {dur}m
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>

                    {/* Done button */}
                    <TouchableOpacity
                      style={{
                        alignSelf: 'center',
                        marginTop: 8,
                        paddingVertical: 8,
                        paddingHorizontal: 24,
                        borderRadius: 20,
                        backgroundColor: colors.accent1,
                      }}
                      onPress={() => setEditingId(null)}
                    >
                      <Text style={{ fontFamily: fontFamily.semiBold, fontSize: 13, color: colors.textPrimary }}>Done</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </View>
        ))}

        {blocks.length === 0 && (
          <View style={styles.emptyCenter}>
            <Text style={styles.emptySubtitle}>
              All blocks removed. Go back to regenerate.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Bottom bar */}
      {blocks.length > 0 && (
        <View style={[styles.bottomBar, { borderTopColor: colors.border }]}>
          {isViewOnly ? (
            <GradientButton
              title="Export PDF"
              icon="document-text"
              onPress={handleExportPdf}
              disabled={saving}
              loading={saving}
            />
          ) : (
            <GradientButton
              title={isEdit ? `Update Calendar (${blocks.length})` : `Book All (${blocks.length})`}
              icon={isEdit ? 'refresh' : 'calendar'}
              onPress={handleBookAll}
              disabled={saving}
              loading={saving}
            />
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

// ── Time helpers ──────────────────────────────────────────────────────

function timeToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function minToTime(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ── Styles ───────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      gap: spacing.sm,
    },
    backBtn: {
      padding: 4,
    },
    headerTitle: {
      fontSize: 20,
      fontFamily: fontFamily.bold,
      color: colors.textOnDark,
      flex: 1,
    },
    countBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: borderRadius.full,
    },
    countBadgeText: {
      color: colors.textPrimary,
      fontSize: 14,
      fontFamily: fontFamily.bold,
    },
    scroll: {
      padding: spacing.lg,
      paddingBottom: 100,
    },

    // Warnings
    warningBanner: {
      backgroundColor: colors.secondarySubtle,
      borderLeftWidth: 3,
      borderLeftColor: colors.textSecondary,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    warningHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 6,
    },
    warningTitle: {
      fontSize: 13,
      fontFamily: fontFamily.bold,
      color: colors.textSecondary,
    },
    warningText: {
      fontSize: 12,
      fontFamily: fontFamily.regular,
      color: colors.textSecondary,
      lineHeight: 18,
      marginLeft: 24,
    },

    // Date groups
    dateGroup: {
      marginBottom: spacing.md,
    },
    dateHeader: {
      fontSize: 13,
      fontFamily: fontFamily.semiBold,
      color: colors.textSecondary,
      marginBottom: 8,
    },

    // Exam markers
    examMarker: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 12,
      marginBottom: 8,
      borderRadius: 10,
      backgroundColor: colors.secondarySubtle,
      borderWidth: 1,
      borderColor: colors.secondaryMuted,
    },
    examMarkerDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.error,
    },
    examMarkerText: {
      fontSize: 13,
      fontFamily: fontFamily.semiBold,
      color: colors.error,
    },

    // Block cards
    blockCard: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 14,
      padding: spacing.md,
      marginBottom: 8,
      backgroundColor: colors.surfaceElevated,
      overflow: 'hidden',
    },
    blockColorBar: {
      width: 4,
      borderRadius: 2,
      alignSelf: 'stretch',
      marginRight: 12,
    },
    blockTitle: {
      fontSize: 15,
      fontFamily: fontFamily.semiBold,
      color: colors.textOnDark,
    },
    blockTime: {
      fontSize: 13,
      fontFamily: fontFamily.semiBold,
      marginTop: 2,
    },
    blockMeta: {
      fontSize: 12,
      fontFamily: fontFamily.regular,
      color: colors.textInactive,
      marginTop: 2,
    },
    blockActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginLeft: 8,
    },

    // Edit panel
    editPanel: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
      marginTop: -4,
      borderWidth: 1,
      borderColor: `${colors.accent1}30`,
    },
    editRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    editLabel: {
      fontSize: 12,
      fontFamily: fontFamily.semiBold,
      color: colors.textInactive,
      textTransform: 'uppercase',
      width: 40,
    },
    editChips: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
      justifyContent: 'center',
    },
    editChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 8,
      backgroundColor: `${colors.accent1}15`,
      borderWidth: 1,
      borderColor: `${colors.accent1}30`,
    },
    editChipText: {
      fontSize: 12,
      fontFamily: fontFamily.medium,
      color: colors.accent1,
    },
    editValue: {
      fontSize: 13,
      fontFamily: fontFamily.semiBold,
      minWidth: 80,
      textAlign: 'center',
    },

    // Empty
    emptyCenter: {
      alignItems: 'center',
      paddingTop: 60,
      gap: spacing.md,
    },
    emptySubtitle: {
      fontSize: 14,
      fontFamily: fontFamily.regular,
      lineHeight: 20,
      color: colors.textSecondary,
      textAlign: 'center',
    },

    // Bottom bar
    bottomBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      borderTopWidth: 1,
      padding: spacing.md,
      paddingBottom: 34,
      backgroundColor: colors.background,
    },
    bookBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: 14,
    },
    bookBtnText: {
      color: colors.textPrimary,
      fontSize: 16,
      fontFamily: fontFamily.bold,
    },
  });
}
