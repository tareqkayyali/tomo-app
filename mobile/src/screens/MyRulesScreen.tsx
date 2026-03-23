/**
 * MyRulesScreen — Single source of truth for all scheduling constraints.
 *
 * 3 collapsible sections:
 *   A) Core Rules — School, Sleep, Gaps, League toggle
 *   B) Study Rules — Subjects, Exam mode, Exam dates
 *   C) Training Rules — Categories (Club, Gym, Personal, Custom)
 *
 * Explicit Save button — no auto-save. User edits locally, then taps Save.
 * Proper date picker modal for exam dates (calendar grid).
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Switch,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  Modal,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { useScheduleRules, DEFAULT_PREFERENCES } from '../hooks/useScheduleRules';
import type {
  PlayerSchedulePreferences,
  TrainingCategoryRule,
  ExamScheduleEntry,
  DayOfWeek,
} from '../hooks/useScheduleRules';
import { spacing, borderRadius, fontFamily } from '../theme';
import { syncAutoBlocks } from '../services/api';
import type { ThemeColors } from '../theme/colors';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<MainStackParamList, 'MyRules'>;

// ── Day names ──
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// ── Gap chip options ──
const GAP_OPTIONS = [15, 30, 45, 60];
const DURATION_OPTIONS = [30, 45, 60, 90];

// ── Scenario display ──
const SCENARIO_DISPLAY: Record<string, { label: string; color: string; icon: string }> = {
  normal: { label: 'Normal Mode', color: colors.accent, icon: 'checkmark-circle' },
  league_active: { label: 'League Season', color: colors.accent, icon: 'trophy' },
  exam_period: { label: 'Exam Period', color: colors.warning, icon: 'school' },
  league_and_exam: { label: 'League + Exams', color: colors.warning, icon: 'warning' },
};

// ── Section colors ──
const SECTION_COLORS = {
  core: colors.info,
  study: colors.warning,
  training: colors.accent,
};

// ── Month names ──
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function MyRulesScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { rules, loading, dirty, saving, setLocal, save, discard } = useScheduleRules();
  const { profile } = useAuth();

  // Section collapse state
  const [coreOpen, setCoreOpen] = useState(true);
  const [studyOpen, setStudyOpen] = useState(false);
  const [trainingOpen, setTrainingOpen] = useState(false);

  const hasMigrated = useRef(false);

  // Cross-platform input modal state
  const [inputModal, setInputModal] = useState<{
    visible: boolean;
    title: string;
    placeholder: string;
    defaultValue: string;
    onSubmit: (value: string) => void;
    keyboardType?: 'default' | 'numeric';
  }>({ visible: false, title: '', placeholder: '', defaultValue: '', onSubmit: () => {} });

  const showInputModal = useCallback(
    (title: string, placeholder: string, onSubmit: (value: string) => void, defaultValue = '', keyboardType?: 'default' | 'numeric') => {
      setInputModal({ visible: true, title, placeholder, defaultValue, onSubmit, keyboardType });
    },
    [],
  );

  // Date picker modal state
  const [datePickerState, setDatePickerState] = useState<{
    visible: boolean;
    title: string;
    selectedDate: string;
    onSelect: (date: string) => void;
  }>({ visible: false, title: '', selectedDate: '', onSelect: () => {} });

  const showDatePicker = useCallback(
    (title: string, currentDate: string | null, onSelect: (date: string) => void) => {
      const today = new Date();
      const initial = currentDate && /^\d{4}-\d{2}-\d{2}$/.test(currentDate)
        ? currentDate
        : `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      setDatePickerState({ visible: true, title, selectedDate: initial, onSelect });
    },
    [],
  );

  const rawPrefs = rules?.preferences ?? DEFAULT_PREFERENCES;
  const scenario = rules?.scenario ?? 'normal';

  // ── Profile → Rules migration (one-time) ──
  const prefs = useMemo(() => {
    const p = { ...rawPrefs };
    if ((!p.study_subjects || p.study_subjects.length === 0) && profile?.studySubjects?.length) {
      p.study_subjects = profile.studySubjects;
    }
    if ((!p.exam_schedule || p.exam_schedule.length === 0) && profile?.examSchedule?.length) {
      p.exam_schedule = profile.examSchedule.map((e: any) => ({
        id: e.id || `exam_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        subject: e.subject,
        examType: e.examType || 'final',
        examDate: e.examDate,
      }));
    }
    return p;
  }, [rawPrefs, profile?.studySubjects, profile?.examSchedule]);

  // Persist migrated data once
  useEffect(() => {
    if (hasMigrated.current) return;
    const patches: Partial<PlayerSchedulePreferences> = {};
    if (
      prefs.study_subjects.length > 0 &&
      (!rawPrefs.study_subjects || rawPrefs.study_subjects.length === 0) &&
      profile?.studySubjects?.length
    ) {
      patches.study_subjects = prefs.study_subjects;
    }
    if (
      prefs.exam_schedule.length > 0 &&
      (!rawPrefs.exam_schedule || rawPrefs.exam_schedule.length === 0) &&
      profile?.examSchedule?.length
    ) {
      patches.exam_schedule = prefs.exam_schedule;
    }
    if (Object.keys(patches).length > 0) {
      hasMigrated.current = true;
      // Use setLocal for migration — will be saved with explicit save
      setLocal(patches);
    }
  }, [prefs, rawPrefs, profile, setLocal]);

  // ── Local edit (no API call) ──
  const edit = useCallback(
    (patch: Partial<PlayerSchedulePreferences>) => {
      setLocal(patch);
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [setLocal],
  );

  // Saved toast state (visible on web too)
  const [showSaved, setShowSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Save handler ──
  const handleSave = useCallback(async () => {
    setSaveError(null);

    try {
      const success = await save();
      if (success) {
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowSaved(true);
        setTimeout(() => setShowSaved(false), 2000);

        // Auto-sync school + sleep blocks in calendar (non-fatal)
        try {
          const result = await syncAutoBlocks({
            schoolDays: prefs.school_days as number[],
            schoolStart: prefs.school_start,
            schoolEnd: prefs.school_end,
            sleepStart: prefs.sleep_start,
            sleepEnd: prefs.sleep_end,
          });
        } catch (err) {
          console.warn('[MyRules] Auto-block sync failed (non-fatal):', err);
        }

        // Post-save warning: exam mode on but missing exam dates
        if (prefs.exam_period_active && prefs.study_subjects.length > 0) {
          const scheduledSubjects = new Set(prefs.exam_schedule.map((e) => e.subject));
          const missing = prefs.study_subjects.filter((s) => !scheduledSubjects.has(s));
          if (missing.length > 0) {
            setTimeout(() => {
              setSaveError(`Heads up: ${missing.join(', ')} still need exam dates`);
              setTimeout(() => setSaveError(null), 4000);
            }, 2200);
          }
        }
      } else {
        setSaveError('Save failed — check console');
        if (Platform.OS !== 'web') Alert.alert('Save Failed', 'Could not save your rules. Please try again.');
      }
    } catch (err) {
      console.error('[MyRules] Save threw:', err);
      setSaveError(String(err));
    }
  }, [save, dirty, prefs]);

  // ── Discard handler ──
  const handleDiscard = useCallback(() => {
    discard();
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [discard]);

  // ── Back — always navigates, with fallback ──
  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      // Fallback: navigate to main tabs if can't go back (e.g. deep link)
      (navigation as any).navigate('MainTabs');
    }
  };

  if (loading && !rules) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.accent1} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textOnDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Rules</Text>
        {showSaved && (
          <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={styles.savedBadge}>
            <Ionicons name="checkmark" size={12} color="#FFF" />
            <Text style={styles.savedText}>Saved!</Text>
          </Animated.View>
        )}
        {saveError && (
          <Text style={{ color: colors.error, fontSize: 11, fontFamily: fontFamily.medium }}>{saveError}</Text>
        )}
        {dirty && (
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={handleDiscard} style={styles.discardBtn}>
              <Text style={[styles.discardText, { color: colors.textInactive }]}>Discard</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              style={[styles.saveBtn, { backgroundColor: colors.accent1, opacity: saving ? 0.6 : 1 }]}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={16} color="#FFF" />
                  <Text style={styles.saveBtnText}>Save</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ═══ SECTION A: Core Rules ═══ */}
        <SectionHeader
          title="Core"
          icon="settings-outline"
          color={SECTION_COLORS.core}
          open={coreOpen}
          onToggle={() => setCoreOpen((p) => !p)}
        />
        {coreOpen && (
          <View style={styles.sectionBody}>
            {/* School Hours */}
            <SettingRow label="School Days" icon="school-outline" colors={colors}>
              <DayPicker
                selected={prefs.school_days}
                onChange={(days) => edit({ school_days: days })}
                colors={colors}
                accent={SECTION_COLORS.core}
              />
            </SettingRow>
            <SettingRow label="School Hours" icon="time-outline" colors={colors}>
              <View style={styles.timeRow}>
                <TimeChip
                  value={prefs.school_start}
                  onChange={(v) => edit({ school_start: v })}
                  colors={colors}
                />
                <Text style={styles.timeSep}>&rarr;</Text>
                <TimeChip
                  value={prefs.school_end}
                  onChange={(v) => edit({ school_end: v })}
                  colors={colors}
                />
              </View>
            </SettingRow>

            {/* Sleep */}
            <SettingRow label="Sleep" icon="moon-outline" colors={colors}>
              <View style={styles.timeRow}>
                <TimeChip
                  value={prefs.sleep_start}
                  onChange={(v) => {
                    edit({ sleep_start: v });
                  }}
                  colors={colors}
                  label="Bed"
                />
                <Text style={styles.timeSep}>&rarr;</Text>
                <TimeChip
                  value={prefs.sleep_end}
                  onChange={(v) => {
                    edit({ sleep_end: v });
                  }}
                  colors={colors}
                  label="Wake"
                />
              </View>
            </SettingRow>

            {/* Available Hours */}
            <SettingRow label="Available Hours" icon="sunny-outline" colors={colors}>
              <View style={styles.timeRow}>
                <TimeChip
                  value={prefs.day_bounds_start}
                  onChange={(v) => edit({ day_bounds_start: v })}
                  colors={colors}
                  label="From"
                />
                <Text style={styles.timeSep}>&rarr;</Text>
                <TimeChip
                  value={prefs.day_bounds_end}
                  onChange={(v) => edit({ day_bounds_end: v })}
                  colors={colors}
                  label="Until"
                />
              </View>
            </SettingRow>

            {/* Gaps */}
            <SettingRow label="Session Gaps" icon="timer-outline" colors={colors}>
              <ChipRow
                options={GAP_OPTIONS}
                selected={prefs.buffer_default_min}
                onChange={(v) => edit({ buffer_default_min: v })}
                suffix="m"
                colors={colors}
                accent={SECTION_COLORS.core}
              />
            </SettingRow>

            {/* League toggle */}
            <SettingRow label="League Season" icon="trophy-outline" colors={colors}>
              <Switch
                value={prefs.league_is_active}
                onValueChange={(v) => edit({ league_is_active: v })}
                trackColor={{ false: colors.border, true: '#2ECC7180' }}
                thumbColor={prefs.league_is_active ? colors.accent : colors.textInactive}
              />
            </SettingRow>
          </View>
        )}

        {/* ═══ SECTION B: Study Rules ═══ */}
        <SectionHeader
          title="Study"
          icon="book-outline"
          color={SECTION_COLORS.study}
          open={studyOpen}
          onToggle={() => setStudyOpen((p) => !p)}
        />
        {studyOpen && (
          <View style={styles.sectionBody}>
            {/* Subjects */}
            <SettingRow label="Subjects" icon="list-outline" colors={colors}>
              <SubjectPills
                subjects={prefs.study_subjects}
                onChange={(subjects) => edit({ study_subjects: subjects })}
                colors={colors}
                accent={SECTION_COLORS.study}
                onRequestAdd={() =>
                  showInputModal('Add Subject', 'Subject name', (name) => {
                    if (!name?.trim()) return;
                    if (prefs.study_subjects.includes(name.trim())) return;
                    edit({ study_subjects: [...prefs.study_subjects, name.trim()] });
                  })
                }
              />
            </SettingRow>

            {/* Study Duration */}
            <SettingRow label="Session Duration" icon="hourglass-outline" colors={colors}>
              <ChipRow
                options={DURATION_OPTIONS}
                selected={prefs.study_duration_min}
                onChange={(v) => edit({ study_duration_min: v })}
                suffix="m"
                colors={colors}
                accent={SECTION_COLORS.study}
              />
            </SettingRow>

            {/* Exam Mode */}
            <SettingRow label="Exam Mode" icon="document-text-outline" colors={colors}>
              <Switch
                value={prefs.exam_period_active}
                onValueChange={(v) => {
                  if (!v) {
                    edit({ exam_period_active: false, exam_schedule: [] });
                  } else {
                    edit({ exam_period_active: true });
                  }
                }}
                trackColor={{ false: colors.border, true: '#F39C1280' }}
                thumbColor={prefs.exam_period_active ? colors.warning : colors.textInactive}
              />
            </SettingRow>

            {/* Exam details (shown when exam mode active) */}
            {prefs.exam_period_active && (
              <Animated.View entering={FadeIn.duration(200)}>
                <SettingRow label="Study Start Date" icon="calendar-outline" colors={colors}>
                  <TouchableOpacity
                    style={[dateChipStyles.chip, { backgroundColor: colors.cardLight }]}
                    onPress={() => showDatePicker(
                      'Study Start Date',
                      prefs.exam_start_date,
                      (date) => edit({ exam_start_date: date }),
                    )}
                  >
                    <Ionicons name="calendar-outline" size={14} color={SECTION_COLORS.study} />
                    <Text style={[dateChipStyles.text, { color: prefs.exam_start_date ? colors.textOnDark : colors.textInactive }]}>
                      {prefs.exam_start_date || 'Select date'}
                    </Text>
                  </TouchableOpacity>
                </SettingRow>

                <SettingRow label="Sessions/Subject" icon="repeat-outline" colors={colors}>
                  <ChipRow
                    options={[2, 3, 4, 5]}
                    selected={prefs.days_per_subject}
                    onChange={(v) => edit({ days_per_subject: v })}
                    suffix="/wk"
                    colors={colors}
                    accent={SECTION_COLORS.study}
                  />
                </SettingRow>

                {/* Exam schedule list */}
                <ExamScheduleList
                  entries={prefs.exam_schedule}
                  subjects={prefs.study_subjects}
                  onChange={(entries) => edit({ exam_schedule: entries })}
                  colors={colors}
                  onRequestDate={(title, currentDate, onSelect) =>
                    showDatePicker(title, currentDate, onSelect)
                  }
                />
              </Animated.View>
            )}
          </View>
        )}

        {/* ═══ SECTION C: Training Rules ═══ */}
        <SectionHeader
          title="Training"
          icon="barbell-outline"
          color={SECTION_COLORS.training}
          open={trainingOpen}
          onToggle={() => setTrainingOpen((p) => !p)}
        />
        {trainingOpen && (
          <View style={styles.sectionBody}>
            {prefs.training_categories.map((cat) => (
              <TrainingCategoryCard
                key={cat.id}
                category={cat}
                onUpdate={(updated) => {
                  const cats = prefs.training_categories.map((c) =>
                    c.id === updated.id ? updated : c,
                  );
                  edit({ training_categories: cats });
                }}
                colors={colors}
              />
            ))}
            <TouchableOpacity
              style={styles.addCategoryBtn}
              onPress={() => {
                showInputModal('Add Training Category', 'e.g. Swimming, Yoga', (name) => {
                  if (!name?.trim()) return;
                  const newCat: TrainingCategoryRule = {
                    id: name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now(),
                    label: name.trim(),
                    icon: 'add-circle-outline',
                    color: colors.info,
                    enabled: true,
                    mode: 'days_per_week',
                    fixedDays: [],
                    daysPerWeek: 2,
                    sessionDuration: 60,
                    preferredTime: 'afternoon',
                  };
                  edit({
                    training_categories: [...prefs.training_categories, newCat],
                  });
                });
              }}
            >
              <Ionicons name="add-circle-outline" size={18} color={colors.accent1} />
              <Text style={[styles.addCategoryText, { color: colors.accent1 }]}>
                Add Category
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Bottom spacer for scenario banner */}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* ── Scenario Banner ── */}
      <View style={[styles.scenarioBanner, { borderTopColor: colors.border }]}>
        <View style={styles.scenarioInner}>
          <Ionicons
            name={(SCENARIO_DISPLAY[scenario]?.icon ?? 'help-circle') as any}
            size={16}
            color={SCENARIO_DISPLAY[scenario]?.color ?? colors.textInactive}
          />
          <Text
            style={[
              styles.scenarioLabel,
              { color: SCENARIO_DISPLAY[scenario]?.color ?? colors.textInactive },
            ]}
          >
            {SCENARIO_DISPLAY[scenario]?.label ?? 'Unknown'}
          </Text>
        </View>
      </View>

      {/* ── Cross-platform Input Modal ── */}
      <InputModal
        visible={inputModal.visible}
        title={inputModal.title}
        placeholder={inputModal.placeholder}
        defaultValue={inputModal.defaultValue}
        keyboardType={inputModal.keyboardType}
        colors={colors}
        onSubmit={(value) => {
          inputModal.onSubmit(value);
          setInputModal((prev) => ({ ...prev, visible: false }));
        }}
        onCancel={() => setInputModal((prev) => ({ ...prev, visible: false }))}
      />

      {/* ── Date Picker Modal ── */}
      <DatePickerModal
        visible={datePickerState.visible}
        title={datePickerState.title}
        selectedDate={datePickerState.selectedDate}
        colors={colors}
        onSelect={(date) => {
          datePickerState.onSelect(date);
          setDatePickerState((prev) => ({ ...prev, visible: false }));
        }}
        onCancel={() => setDatePickerState((prev) => ({ ...prev, visible: false }))}
      />
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ── Subcomponents ────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

// ── Section Header (collapsible) ──
function SectionHeader({
  title,
  icon,
  color,
  open,
  onToggle,
}: {
  title: string;
  icon: string;
  color: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity style={sectionStyles.header} onPress={onToggle} activeOpacity={0.7}>
      <View style={[sectionStyles.iconCircle, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon as any} size={16} color={color} />
      </View>
      <Text style={[sectionStyles.title, { color }]}>{title}</Text>
      <Ionicons
        name={open ? 'chevron-up' : 'chevron-down'}
        size={18}
        color={color}
        style={{ marginLeft: 'auto' }}
      />
    </TouchableOpacity>
  );
}

const sectionStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    gap: 10,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontFamily: fontFamily.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});

// ── Setting Row ──
function SettingRow({
  label,
  icon,
  colors,
  children,
}: {
  label: string;
  icon: string;
  colors: ThemeColors;
  children: React.ReactNode;
}) {
  return (
    <View style={rowStyles.container}>
      <View style={rowStyles.labelRow}>
        <Ionicons name={icon as any} size={14} color={colors.textInactive} />
        <Text style={[rowStyles.label, { color: colors.textSecondary }]}>{label}</Text>
      </View>
      <View style={rowStyles.content}>{children}</View>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    fontFamily: fontFamily.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  content: {},
});

// ── Day Picker ──
function DayPicker({
  selected,
  onChange,
  colors,
  accent,
}: {
  selected: DayOfWeek[];
  onChange: (days: DayOfWeek[]) => void;
  colors: ThemeColors;
  accent: string;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {DAY_LABELS.map((label, i) => {
        const isSelected = selected.includes(i as DayOfWeek);
        return (
          <TouchableOpacity
            key={i}
            onPress={() => {
              if (isSelected) {
                onChange(selected.filter((d) => d !== i) as DayOfWeek[]);
              } else {
                onChange([...selected, i as DayOfWeek].sort());
              }
            }}
            style={[
              dayPickerStyles.pill,
              {
                backgroundColor: isSelected ? accent + '25' : colors.cardLight,
                borderColor: isSelected ? accent : 'transparent',
              },
            ]}
          >
            <Text
              style={[
                dayPickerStyles.pillText,
                { color: isSelected ? accent : colors.textInactive },
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const dayPickerStyles = StyleSheet.create({
  pill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  pillText: {
    fontSize: 13,
    fontFamily: fontFamily.semiBold,
  },
});

// ── Time Chip (with +/- stepper arrows) ──
function TimeChip({
  value,
  onChange,
  colors,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  colors: ThemeColors;
  label?: string;
}) {
  const stepTime = (direction: 1 | -1) => {
    const [h, m] = value.split(':').map(Number);
    let totalMin = h * 60 + m + direction * 30;
    if (totalMin < 0) totalMin += 24 * 60;
    if (totalMin >= 24 * 60) totalMin -= 24 * 60;
    const newH = Math.floor(totalMin / 60);
    const newM = totalMin % 60;
    onChange(`${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`);
  };

  return (
    <View style={timeStyles.stepperRow}>
      {label && <Text style={[timeStyles.chipLabel, { color: colors.textInactive, marginRight: 4 }]}>{label}</Text>}
      <TouchableOpacity
        onPress={() => stepTime(-1)}
        style={[timeStyles.stepBtn, { backgroundColor: colors.cardLight }]}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Ionicons name="chevron-back" size={14} color={colors.textInactive} />
      </TouchableOpacity>
      <View style={[timeStyles.chip, { backgroundColor: colors.cardLight }]}>
        <Text style={[timeStyles.chipValue, { color: colors.textOnDark }]}>{value}</Text>
      </View>
      <TouchableOpacity
        onPress={() => stepTime(1)}
        style={[timeStyles.stepBtn, { backgroundColor: colors.cardLight }]}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Ionicons name="chevron-forward" size={14} color={colors.textInactive} />
      </TouchableOpacity>
    </View>
  );
}

const timeStyles = StyleSheet.create({
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  chipLabel: {
    fontSize: 11,
    fontFamily: fontFamily.regular,
  },
  chipValue: {
    fontSize: 15,
    fontFamily: fontFamily.semiBold,
  },
});

// ── Date chip styles (for tappable date fields) ──
const dateChipStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  text: {
    fontSize: 15,
    fontFamily: fontFamily.semiBold,
  },
});

// ── Chip Row (single select) ──
function ChipRow({
  options,
  selected,
  onChange,
  suffix,
  colors,
  accent,
}: {
  options: number[];
  selected: number;
  onChange: (v: number) => void;
  suffix: string;
  colors: ThemeColors;
  accent: string;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {options.map((opt) => {
        const active = opt === selected;
        return (
          <TouchableOpacity
            key={opt}
            onPress={() => onChange(opt)}
            style={[
              chipStyles.chip,
              {
                backgroundColor: active ? accent + '25' : colors.cardLight,
                borderColor: active ? accent : 'transparent',
              },
            ]}
          >
            <Text
              style={[chipStyles.chipText, { color: active ? accent : colors.textInactive }]}
            >
              {opt}{suffix}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  chipText: {
    fontSize: 14,
    fontFamily: fontFamily.semiBold,
  },
});

// ── Subject Pills ──
function SubjectPills({
  subjects,
  onChange,
  colors,
  accent,
  onRequestAdd,
}: {
  subjects: string[];
  onChange: (subjects: string[]) => void;
  colors: ThemeColors;
  accent: string;
  onRequestAdd: () => void;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {subjects.map((sub) => (
        <TouchableOpacity
          key={sub}
          onPress={() => {
            Alert.alert('Remove Subject', `Remove "${sub}"?`, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Remove',
                style: 'destructive',
                onPress: () => onChange(subjects.filter((s) => s !== sub)),
              },
            ]);
          }}
          style={[subjectStyles.pill, { backgroundColor: accent + '20', borderColor: accent + '40' }]}
        >
          <Text style={[subjectStyles.pillText, { color: accent }]}>{sub}</Text>
          <Ionicons name="close-circle" size={14} color={accent + '80'} style={{ marginLeft: 4 }} />
        </TouchableOpacity>
      ))}
      <TouchableOpacity onPress={onRequestAdd} style={[subjectStyles.addPill, { borderColor: colors.border }]}>
        <Ionicons name="add" size={14} color={colors.textInactive} />
        <Text style={[subjectStyles.addText, { color: colors.textInactive }]}>Add</Text>
      </TouchableOpacity>
    </View>
  );
}

const subjectStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 13,
    fontFamily: fontFamily.medium,
  },
  addPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  addText: {
    fontSize: 13,
    fontFamily: fontFamily.medium,
  },
});

// ── Exam Schedule List ──
function ExamScheduleList({
  entries,
  subjects,
  onChange,
  colors,
  onRequestDate,
}: {
  entries: ExamScheduleEntry[];
  subjects: string[];
  onChange: (entries: ExamScheduleEntry[]) => void;
  colors: ThemeColors;
  onRequestDate: (title: string, currentDate: string | null, onSelect: (date: string) => void) => void;
}) {
  const addExam = () => {
    const unscheduled = subjects.filter((s) => !entries.find((e) => e.subject === s));
    if (unscheduled.length === 0 && subjects.length > 0) {
      Alert.alert('All Scheduled', 'All subjects already have exam dates.');
      return;
    }
    const subject = unscheduled[0] || 'New Subject';
    onRequestDate(`${subject} exam date`, null, (date) => {
      const entry: ExamScheduleEntry = {
        id: `exam_${Date.now()}`,
        subject,
        examType: 'final',
        examDate: date,
      };
      onChange([...entries, entry]);
    });
  };

  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 }}>
        <Ionicons name="calendar-outline" size={14} color={colors.textInactive} />
        <Text style={{ fontSize: 12, fontFamily: fontFamily.medium, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Exam Dates
        </Text>
      </View>
      {entries.map((entry) => (
        <View key={entry.id} style={[examStyles.card, { backgroundColor: colors.cardLight }]}>
          <TouchableOpacity
            style={{ flex: 1 }}
            onPress={() => {
              onRequestDate(`${entry.subject} exam date`, entry.examDate, (date) => {
                onChange(entries.map((e) => e.id === entry.id ? { ...e, examDate: date } : e));
              });
            }}
          >
            <Text style={[examStyles.subject, { color: colors.textOnDark }]}>{entry.subject}</Text>
            <View style={examStyles.dateRow}>
              <Ionicons name="calendar-outline" size={12} color={colors.warning} />
              <Text style={[examStyles.date, { color: colors.warning }]}>{entry.examDate}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onChange(entries.filter((e) => e.id !== entry.id))}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={20} color={colors.error} />
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity onPress={addExam} style={examStyles.addBtn}>
        <Ionicons name="add-circle-outline" size={16} color={colors.warning} />
        <Text style={[examStyles.addText, { color: colors.warning }]}>Add Exam</Text>
      </TouchableOpacity>
    </View>
  );
}

const examStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginBottom: 6,
  },
  subject: {
    fontSize: 14,
    fontFamily: fontFamily.semiBold,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  date: {
    fontSize: 12,
    fontFamily: fontFamily.medium,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  addText: {
    fontSize: 13,
    fontFamily: fontFamily.medium,
  },
});

// ── Cross-platform Input Modal ──
function InputModal({
  visible,
  title,
  placeholder,
  defaultValue,
  keyboardType,
  colors,
  onSubmit,
  onCancel,
}: {
  visible: boolean;
  title: string;
  placeholder: string;
  defaultValue: string;
  keyboardType?: 'default' | 'numeric';
  colors: ThemeColors;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(defaultValue);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setText(defaultValue);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [visible, defaultValue]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={modalStyles.overlay}
      >
        <TouchableOpacity style={modalStyles.backdrop} activeOpacity={1} onPress={onCancel} />
        <View style={[modalStyles.card, { backgroundColor: colors.cardLight }]}>
          <Text style={[modalStyles.title, { color: colors.textOnDark }]}>{title}</Text>
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            placeholder={placeholder}
            placeholderTextColor={colors.textInactive}
            keyboardType={keyboardType ?? 'default'}
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={() => {
              if (text.trim()) onSubmit(text.trim());
            }}
            style={[
              modalStyles.input,
              {
                color: colors.textOnDark,
                borderColor: colors.border,
                backgroundColor: colors.background,
              },
            ]}
          />
          <View style={modalStyles.btnRow}>
            <TouchableOpacity onPress={onCancel} style={modalStyles.cancelBtn}>
              <Text style={[modalStyles.cancelText, { color: colors.textInactive }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                if (text.trim()) onSubmit(text.trim());
              }}
              style={[modalStyles.submitBtn, { backgroundColor: colors.accent1 }]}
            >
              <Text style={modalStyles.submitText}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  card: {
    width: '85%',
    maxWidth: 340,
    borderRadius: 16,
    padding: 20,
    zIndex: 1,
  },
  title: {
    fontSize: 17,
    fontFamily: fontFamily.bold,
    marginBottom: 14,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    fontFamily: fontFamily.regular,
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cancelText: {
    fontSize: 14,
    fontFamily: fontFamily.medium,
  },
  submitBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  submitText: {
    fontSize: 14,
    fontFamily: fontFamily.semiBold,
    color: '#FFF',
  },
});

// ── Date Picker Modal (calendar grid) ──
function DatePickerModal({
  visible,
  title,
  selectedDate,
  colors,
  onSelect,
  onCancel,
}: {
  visible: boolean;
  title: string;
  selectedDate: string;
  colors: ThemeColors;
  onSelect: (date: string) => void;
  onCancel: () => void;
}) {
  const parseDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return { year: y || new Date().getFullYear(), month: (m || new Date().getMonth() + 1) - 1, day: d || new Date().getDate() };
  };

  const initial = parseDate(selectedDate || '');
  const [viewYear, setViewYear] = useState(initial.year);
  const [viewMonth, setViewMonth] = useState(initial.month);
  const [pickedDay, setPickedDay] = useState(initial.day);

  // Reset when opening
  useEffect(() => {
    if (visible) {
      const p = parseDate(selectedDate || '');
      setViewYear(p.year);
      setViewMonth(p.month);
      setPickedDay(p.day);
    }
  }, [visible, selectedDate]);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  const formatSelected = () => {
    return `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(pickedDay).padStart(2, '0')}`;
  };

  const todayStr = (() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  })();

  // Build calendar grid
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // Pad to complete the last row
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={dpStyles.overlay}>
        <TouchableOpacity style={dpStyles.backdrop} activeOpacity={1} onPress={onCancel} />
        <View style={[dpStyles.card, { backgroundColor: colors.cardLight }]}>
          <Text style={[dpStyles.title, { color: colors.textOnDark }]}>{title}</Text>

          {/* Month/Year nav */}
          <View style={dpStyles.monthNav}>
            <TouchableOpacity onPress={prevMonth} style={dpStyles.navBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="chevron-back" size={20} color={colors.textOnDark} />
            </TouchableOpacity>
            <Text style={[dpStyles.monthLabel, { color: colors.textOnDark }]}>
              {MONTHS[viewMonth]} {viewYear}
            </Text>
            <TouchableOpacity onPress={nextMonth} style={dpStyles.navBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="chevron-forward" size={20} color={colors.textOnDark} />
            </TouchableOpacity>
          </View>

          {/* Day headers */}
          <View style={dpStyles.dayHeaderRow}>
            {DAY_LABELS.map((l, i) => (
              <Text key={i} style={[dpStyles.dayHeader, { color: colors.textInactive }]}>{l}</Text>
            ))}
          </View>

          {/* Calendar grid */}
          <View style={dpStyles.grid}>
            {cells.map((day, idx) => {
              if (day === null) return <View key={idx} style={dpStyles.cell} />;
              const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isSelected = day === pickedDay;
              const isToday = dateStr === todayStr;
              return (
                <TouchableOpacity
                  key={idx}
                  style={[
                    dpStyles.cell,
                    isSelected && { backgroundColor: colors.warning, borderRadius: 18 },
                    isToday && !isSelected && { borderWidth: 1.5, borderColor: '#F39C1240', borderRadius: 18 },
                  ]}
                  onPress={() => setPickedDay(day)}
                >
                  <Text style={[
                    dpStyles.cellText,
                    { color: isSelected ? '#FFF' : colors.textOnDark },
                    isToday && !isSelected && { color: colors.warning },
                  ]}>
                    {day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Actions */}
          <View style={dpStyles.actions}>
            <TouchableOpacity onPress={onCancel} style={dpStyles.cancelBtn}>
              <Text style={[dpStyles.cancelText, { color: colors.textInactive }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onSelect(formatSelected())}
              style={[dpStyles.selectBtn, { backgroundColor: colors.warning }]}
            >
              <Text style={dpStyles.selectText}>Select</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const dpStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  card: {
    width: '90%',
    maxWidth: 360,
    borderRadius: 16,
    padding: 20,
    zIndex: 1,
  },
  title: {
    fontSize: 17,
    fontFamily: fontFamily.bold,
    marginBottom: 16,
    textAlign: 'center',
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  navBtn: {
    padding: 4,
  },
  monthLabel: {
    fontSize: 16,
    fontFamily: fontFamily.semiBold,
  },
  dayHeaderRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  dayHeader: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontFamily: fontFamily.semiBold,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: '14.285%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: {
    fontSize: 14,
    fontFamily: fontFamily.medium,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cancelText: {
    fontSize: 14,
    fontFamily: fontFamily.medium,
  },
  selectBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  selectText: {
    fontSize: 14,
    fontFamily: fontFamily.semiBold,
    color: '#FFF',
  },
});

// ── Training Category Card ──
function TrainingCategoryCard({
  category,
  onUpdate,
  colors,
}: {
  category: TrainingCategoryRule;
  onUpdate: (cat: TrainingCategoryRule) => void;
  colors: ThemeColors;
}) {
  const cat = category;

  return (
    <View style={[catStyles.card, { backgroundColor: colors.cardLight, borderLeftColor: cat.color }]}>
      <View style={catStyles.headerRow}>
        <View style={[catStyles.iconCircle, { backgroundColor: cat.color + '20' }]}>
          <Ionicons name={cat.icon as any} size={16} color={cat.color} />
        </View>
        <Text style={[catStyles.label, { color: colors.textOnDark }]}>{cat.label}</Text>
        <Switch
          value={cat.enabled}
          onValueChange={(v) => onUpdate({ ...cat, enabled: v })}
          trackColor={{ false: colors.border, true: cat.color + '80' }}
          thumbColor={cat.enabled ? cat.color : colors.textInactive}
          style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
        />
      </View>

      {cat.enabled && (
        <View style={catStyles.details}>
          {/* Mode */}
          <View style={catStyles.modeRow}>
            <TouchableOpacity
              onPress={() => onUpdate({ ...cat, mode: 'fixed_days' })}
              style={[
                catStyles.modeChip,
                {
                  backgroundColor: cat.mode === 'fixed_days' ? cat.color + '20' : 'transparent',
                  borderColor: cat.mode === 'fixed_days' ? cat.color : colors.border,
                },
              ]}
            >
              <Text style={{ fontSize: 11, fontFamily: fontFamily.medium, color: cat.mode === 'fixed_days' ? cat.color : colors.textInactive }}>
                Fixed Days
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onUpdate({ ...cat, mode: 'days_per_week' })}
              style={[
                catStyles.modeChip,
                {
                  backgroundColor: cat.mode === 'days_per_week' ? cat.color + '20' : 'transparent',
                  borderColor: cat.mode === 'days_per_week' ? cat.color : colors.border,
                },
              ]}
            >
              <Text style={{ fontSize: 11, fontFamily: fontFamily.medium, color: cat.mode === 'days_per_week' ? cat.color : colors.textInactive }}>
                X per Week
              </Text>
            </TouchableOpacity>
          </View>

          {/* Days */}
          {cat.mode === 'fixed_days' ? (
            <View style={{ flexDirection: 'row', gap: 4, marginTop: 8 }}>
              {DAY_LABELS.map((label, i) => {
                const sel = cat.fixedDays.includes(i);
                return (
                  <TouchableOpacity
                    key={i}
                    onPress={() => {
                      const days = sel
                        ? cat.fixedDays.filter((d) => d !== i)
                        : [...cat.fixedDays, i].sort();
                      onUpdate({ ...cat, fixedDays: days });
                    }}
                    style={[
                      catStyles.dayDot,
                      {
                        backgroundColor: sel ? cat.color + '30' : 'transparent',
                        borderColor: sel ? cat.color : colors.border,
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 10, fontFamily: fontFamily.semiBold, color: sel ? cat.color : colors.textInactive }}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <TouchableOpacity
                onPress={() => onUpdate({ ...cat, daysPerWeek: Math.max(1, cat.daysPerWeek - 1) })}
                style={[catStyles.stepper, { borderColor: colors.border }]}
              >
                <Ionicons name="remove" size={14} color={colors.textInactive} />
              </TouchableOpacity>
              <Text style={{ fontSize: 16, fontFamily: fontFamily.bold, color: cat.color }}>
                {cat.daysPerWeek}x
              </Text>
              <TouchableOpacity
                onPress={() => onUpdate({ ...cat, daysPerWeek: Math.min(7, cat.daysPerWeek + 1) })}
                style={[catStyles.stepper, { borderColor: colors.border }]}
              >
                <Ionicons name="add" size={14} color={colors.textInactive} />
              </TouchableOpacity>
              <Text style={{ fontSize: 11, color: colors.textInactive, fontFamily: fontFamily.regular }}>
                per week
              </Text>
            </View>
          )}

          {/* Duration */}
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
            {[60, 75, 90, 120].map((dur) => (
              <TouchableOpacity
                key={dur}
                onPress={() => onUpdate({ ...cat, sessionDuration: dur })}
                style={[
                  catStyles.durChip,
                  {
                    backgroundColor: cat.sessionDuration === dur ? cat.color + '20' : 'transparent',
                    borderColor: cat.sessionDuration === dur ? cat.color : colors.border,
                  },
                ]}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: fontFamily.semiBold,
                    color: cat.sessionDuration === dur ? cat.color : colors.textInactive,
                  }}
                >
                  {dur}m
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const catStyles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
    fontSize: 15,
    fontFamily: fontFamily.semiBold,
  },
  details: {
    marginTop: 10,
    paddingLeft: 40,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  dayDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  stepper: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
});

// ═══════════════════════════════════════════════════════════════════
// ── Styles ──────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
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
      fontSize: 22,
      fontFamily: fontFamily.bold,
      color: colors.textOnDark,
      flex: 1,
    },
    savedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.accent,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: borderRadius.full,
    },
    savedText: {
      color: '#FFF',
      fontSize: 11,
      fontFamily: fontFamily.semiBold,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    discardBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    discardText: {
      fontSize: 13,
      fontFamily: fontFamily.medium,
    },
    saveBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: borderRadius.md,
    },
    saveBtnText: {
      color: '#FFF',
      fontSize: 14,
      fontFamily: fontFamily.semiBold,
    },
    scroll: {
      paddingHorizontal: spacing.lg,
      paddingBottom: 100,
    },
    sectionBody: {
      paddingLeft: 8,
      paddingBottom: 8,
    },
    timeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    timeSep: {
      fontSize: 16,
      color: colors.textInactive,
      fontFamily: fontFamily.regular,
    },
    readOnlyTime: {
      fontSize: 14,
      fontFamily: fontFamily.medium,
    },

    // Scenario banner
    scenarioBanner: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      borderTopWidth: 1,
      padding: spacing.md,
      paddingBottom: 34,
      backgroundColor: colors.background,
      alignItems: 'center',
    },
    scenarioInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    scenarioLabel: {
      fontSize: 14,
      fontFamily: fontFamily.bold,
    },

    // Add category
    addCategoryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 12,
      justifyContent: 'center',
    },
    addCategoryText: {
      fontSize: 14,
      fontFamily: fontFamily.semiBold,
    },
  });
}
