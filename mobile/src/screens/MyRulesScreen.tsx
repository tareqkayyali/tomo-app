/**
 * MyRulesScreen — Single source of truth for all scheduling constraints.
 *
 * Accordion card layout (one card expanded at a time):
 *   1. Athlete Mode — CMS-managed mode selector (Balanced/League/Study/Rest)
 *   2. School — School days + hours (locked blocks)
 *   3. Sleep — Bedtime + wake time
 *   4. Available Hours — Weekday + Weekend bounds for schedulable time
 *   5. Study — Subject selection (pills + add)
 *   6. Training — Toggle rows with inline expand for editing
 *
 * Session gaps managed via CMS-unified settings (not player-facing).
 * Explicit Save button — no auto-save. User edits locally, then taps Save.
 * Theme: surface (3% cream overlay) cards, border (10% cream) frames, Poppins typography.
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
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SmartIcon } from '../components/SmartIcon';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { useScheduleRules, DEFAULT_PREFERENCES } from '../hooks/useScheduleRules';
import { emitRefresh } from '../utils/refreshBus';
import type {
  PlayerSchedulePreferences,
  TrainingCategoryRule,
  ExamScheduleEntry,
  DayOfWeek,
} from '../hooks/useScheduleRules';
import { spacing, borderRadius, fontFamily } from '../theme';
import { syncAutoBlocks } from '../services/api';
import { ModeSelector } from '../components/planning/ModeSelector';
import type { ThemeColors } from '../theme/colors';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = NativeStackScreenProps<MainStackParamList, 'MyRules'>;

// ── Constants ──
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES_FULL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Accordion section IDs
type SectionId = 'mode' | 'school' | 'sleep' | 'hours' | 'study' | 'training';

// ── Mode display ──
const MODE_DISPLAY: Record<string, { label: string; color: string; icon: string }> = {
  balanced: { label: 'Balanced', color: colors.accent, icon: 'options-outline' },
  league: { label: 'League Season', color: colors.accent, icon: 'trophy-outline' },
  study: { label: 'Study Focus', color: colors.warning, icon: 'school-outline' },
  rest: { label: 'Rest & Recovery', color: colors.textSecondary, icon: 'bed-outline' },
};

const SCENARIO_DISPLAY: Record<string, { label: string }> = {
  normal: { label: 'Normal' },
  league_active: { label: 'League Season' },
  exam_period: { label: 'Exam Period' },
  league_and_exam: { label: 'League + Exams' },
};

// ═══ MAIN COMPONENT ═══

export function MyRulesScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);
  const { rules, loading, dirty, saving, setLocal, save, discard, refresh } = useScheduleRules();
  const { profile } = useAuth();

  // Refresh rules data when screen gains focus (e.g. coming back from Dashboard
  // where mode may have been changed via AthleteModeHero)
  useFocusEffect(
    useCallback(() => {
      if (!dirty) refresh();
    }, [dirty, refresh])
  );

  const athleteMode = rules?.preferences?.athlete_mode ?? 'balanced';

  // ── Accordion state — one section open at a time ──
  const [openSection, setOpenSection] = useState<SectionId>('mode');

  const toggleSection = useCallback((id: SectionId) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenSection(id);
  }, []);

  // ── Training category expand state (one at a time inside Training card) ──
  const [expandedCatId, setExpandedCatId] = useState<string | null>(null);

  const hasMigrated = useRef(false);

  // Cross-platform input modal
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

  // Date picker modal
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

  // ── Profile -> Rules migration (one-time) ──
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
      setLocal(patches);
    }
  }, [prefs, rawPrefs, profile, setLocal]);

  // ── Local edit ──
  const edit = useCallback(
    (patch: Partial<PlayerSchedulePreferences>) => {
      setLocal(patch);
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [setLocal],
  );

  // ── Training category helpers ──
  const updateCategory = useCallback(
    (updated: TrainingCategoryRule) => {
      const cats = [...(prefs.training_categories ?? [])];
      const idx = cats.findIndex((c) => c.id === updated.id);
      if (idx >= 0) cats[idx] = updated;
      edit({ training_categories: cats });
    },
    [prefs.training_categories, edit],
  );

  const addCategory = useCallback(() => {
    showInputModal('New Training Type', 'e.g. Swimming, Yoga, Boxing', (name) => {
      const id = name.toLowerCase().replace(/\s+/g, '_');
      const newCat: TrainingCategoryRule = {
        id,
        label: name,
        icon: 'fitness-outline',
        color: colors.accent,
        enabled: true,
        mode: 'days_per_week',
        fixedDays: [],
        daysPerWeek: 2,
        sessionDuration: 60,
        preferredTime: 'afternoon',
      };
      edit({ training_categories: [...(prefs.training_categories ?? []), newCat] });
      setExpandedCatId(id);
    });
  }, [prefs.training_categories, edit, showInputModal, colors.accent]);

  // ── Save / discard ──
  const [showSaved, setShowSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    setSaveError(null);
    try {
      const success = await save();
      if (success) {
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowSaved(true);
        setTimeout(() => setShowSaved(false), 2000);
        // Notify all downstream consumers (Dashboard, Own It, etc.)
        // that rules changed — triggers boot refresh via wildcard listener
        emitRefresh('rules');
        try {
          await syncAutoBlocks({
            schoolDays: prefs.school_days as number[],
            schoolStart: prefs.school_start,
            schoolEnd: prefs.school_end,
            sleepStart: prefs.sleep_start,
            sleepEnd: prefs.sleep_end,
          });
        } catch (err) {
          console.warn('[MyRules] Auto-block sync failed (non-fatal):', err);
        }
      } else {
        setSaveError('Save failed');
        if (Platform.OS === 'web') {
          window.alert('Could not save your rules. Please try again.');
        } else {
          Alert.alert('Save Failed', 'Could not save your rules. Please try again.');
        }
      }
    } catch (err) {
      console.error('[MyRules] Save threw:', err);
      setSaveError(String(err));
    }
  }, [save, prefs]);

  const handleDiscard = useCallback(() => {
    discard();
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [discard]);

  const handleBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else (navigation as any).navigate('MainTabs');
  };

  if (loading && !rules) {
    return (
      <SafeAreaView style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.accent1} />
      </SafeAreaView>
    );
  }

  const modeInfo = MODE_DISPLAY[athleteMode] ?? MODE_DISPLAY.balanced;
  const categories = prefs.training_categories ?? [];

  // ── Build training category summary text ──
  const catSummary = (cat: TrainingCategoryRule): string => {
    if (!cat.enabled) return 'Off';
    if (cat.mode === 'fixed_days' && cat.fixedDays.length > 0) {
      return `${cat.fixedDays.map((d) => DAY_NAMES_FULL[d]).join(', ')} · ${cat.sessionDuration}m`;
    }
    return `${cat.daysPerWeek}x/week · ${cat.sessionDuration}m`;
  };

  return (
    <SafeAreaView style={s.container}>
      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity onPress={handleBack} style={s.backBtn}>
          <SmartIcon name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>My Rules</Text>
        </View>
        {showSaved && (
          <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={s.savedBadge}>
            <SmartIcon name="checkmark" size={12} color={colors.textPrimary} />
            <Text style={s.savedText}>Saved</Text>
          </Animated.View>
        )}
        {saveError && (
          <Text style={{ color: colors.error, fontSize: 11, fontFamily: fontFamily.medium }}>{saveError}</Text>
        )}
      </View>

      {/* ── Save bar ── */}
      {dirty && (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={s.saveBar}>
          <TouchableOpacity onPress={handleDiscard} style={s.discardBtn}>
            <Text style={[s.discardText, { color: colors.textSecondary }]}>Discard</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            style={[s.saveBtn, { opacity: saving ? 0.6 : 1 }]}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.textPrimary} />
            ) : (
              <>
                <SmartIcon name="checkmark" size={14} color={colors.textPrimary} />
                <Text style={s.saveBtnText}>Save</Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>
      )}

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ═══ 1. ATHLETE MODE ═══ */}
        <AccordionCard
          id="mode"
          title="Athlete Mode"
          icon="options-outline"
          iconColor={modeInfo.color}
          subtitle={modeInfo.label}
          isOpen={openSection === 'mode'}
          onToggle={() => toggleSection('mode')}
          colors={colors}
        >
          <ModeSelector
            currentMode={prefs.athlete_mode ?? 'balanced'}
            onModeChange={(modeId) => setLocal({ athlete_mode: modeId } as any)}
            disabled={saving}
          />
        </AccordionCard>

        {/* ═══ 2. SCHOOL ═══ */}
        <AccordionCard
          id="school"
          title="School"
          icon="school-outline"
          iconColor={colors.accent}
          subtitle={`${prefs.school_days.length} days · ${prefs.school_start} - ${prefs.school_end}`}
          isOpen={openSection === 'school'}
          onToggle={() => toggleSection('school')}
          colors={colors}
        >
          <SettingRow label="School Days" icon="calendar-outline" colors={colors}>
            <DayPicker
              selected={prefs.school_days}
              onChange={(days) => edit({ school_days: days })}
              colors={colors}
              accent={colors.accent}
            />
          </SettingRow>
          <SettingRow label="School Hours" icon="time-outline" colors={colors}>
            <View style={s.timeRow}>
              <TimeChip value={prefs.school_start} onChange={(v) => edit({ school_start: v })} colors={colors} label="Start" />
              <Text style={s.timeSep}>&rarr;</Text>
              <TimeChip value={prefs.school_end} onChange={(v) => edit({ school_end: v })} colors={colors} label="End" />
            </View>
          </SettingRow>
        </AccordionCard>

        {/* ═══ 3. SLEEP ═══ */}
        <AccordionCard
          id="sleep"
          title="Sleep"
          icon="moon-outline"
          iconColor={colors.textSecondary}
          subtitle={`${prefs.sleep_start} - ${prefs.sleep_end}`}
          isOpen={openSection === 'sleep'}
          onToggle={() => toggleSection('sleep')}
          colors={colors}
        >
          <SettingRow label="Bedtime & Wake" icon="bed-outline" colors={colors}>
            <View style={s.timeRow}>
              <TimeChip value={prefs.sleep_start} onChange={(v) => edit({ sleep_start: v })} colors={colors} label="Bed" />
              <Text style={s.timeSep}>&rarr;</Text>
              <TimeChip value={prefs.sleep_end} onChange={(v) => edit({ sleep_end: v })} colors={colors} label="Wake" />
            </View>
          </SettingRow>
        </AccordionCard>

        {/* ═══ 4. AVAILABLE HOURS ═══ */}
        <AccordionCard
          id="hours"
          title="Available Hours"
          icon="sunny-outline"
          iconColor={colors.accent}
          subtitle={`Weekdays ${prefs.day_bounds_start} - ${prefs.day_bounds_end}`}
          isOpen={openSection === 'hours'}
          onToggle={() => toggleSection('hours')}
          colors={colors}
        >
          <Text style={s.cardHint}>
            The time window Tomo uses for scheduling training, study, and events.
          </Text>
          <SettingRow label="Weekdays" icon="briefcase-outline" colors={colors}>
            <View style={s.timeRow}>
              <TimeChip value={prefs.day_bounds_start} onChange={(v) => edit({ day_bounds_start: v })} colors={colors} label="From" />
              <Text style={s.timeSep}>&rarr;</Text>
              <TimeChip value={prefs.day_bounds_end} onChange={(v) => edit({ day_bounds_end: v })} colors={colors} label="Until" />
            </View>
          </SettingRow>
          <SettingRow label="Weekends" icon="sunny-outline" colors={colors}>
            <View style={s.timeRow}>
              <TimeChip value={prefs.weekend_bounds_start ?? prefs.day_bounds_start} onChange={(v) => edit({ weekend_bounds_start: v })} colors={colors} label="From" />
              <Text style={s.timeSep}>&rarr;</Text>
              <TimeChip value={prefs.weekend_bounds_end ?? prefs.day_bounds_end} onChange={(v) => edit({ weekend_bounds_end: v })} colors={colors} label="Until" />
            </View>
          </SettingRow>
        </AccordionCard>

        {/* ═══ 5. STUDY ═══ */}
        <AccordionCard
          id="study"
          title="Study"
          icon="book-outline"
          iconColor={colors.warning}
          subtitle={prefs.study_subjects.length > 0 ? `${prefs.study_subjects.length} subjects` : 'No subjects'}
          isOpen={openSection === 'study'}
          onToggle={() => toggleSection('study')}
          colors={colors}
        >
          <Text style={s.cardHint}>
            Select the subjects you study. Tomo uses these for exam planning and study scheduling.
          </Text>
          <SubjectPills
            subjects={prefs.study_subjects}
            onChange={(subjects) => edit({ study_subjects: subjects })}
            colors={colors}
            accent={colors.warning}
            onRequestAdd={() => {
              showInputModal('Add Subject', 'e.g. Math, Physics, English', (name) => {
                if (!prefs.study_subjects.includes(name)) {
                  edit({ study_subjects: [...prefs.study_subjects, name] });
                }
              });
            }}
          />
        </AccordionCard>

        {/* ═══ 6. TRAINING ═══ */}
        <AccordionCard
          id="training"
          title="Training"
          icon="barbell-outline"
          iconColor={colors.accent}
          subtitle={`${categories.filter((c) => c.enabled).length} active types`}
          isOpen={openSection === 'training'}
          onToggle={() => toggleSection('training')}
          colors={colors}
        >
          {categories.map((cat) => (
            <TrainingTypeRow
              key={cat.id}
              category={cat}
              summary={catSummary(cat)}
              isExpanded={expandedCatId === cat.id}
              onToggleExpand={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setExpandedCatId((prev) => (prev === cat.id ? null : cat.id));
              }}
              onUpdate={updateCategory}
              colors={colors}
            />
          ))}
          <TouchableOpacity onPress={addCategory} style={s.addTypeBtn}>
            <SmartIcon name="add-circle-outline" size={18} color={colors.accent} />
            <Text style={[s.addTypeText, { color: colors.accent }]}>Add Training Type</Text>
          </TouchableOpacity>
        </AccordionCard>

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* ── Mode Banner ── */}
      <View style={s.banner}>
        <SmartIcon name={modeInfo.icon as any} size={14} color={modeInfo.color} />
        <Text style={[s.bannerLabel, { color: modeInfo.color }]}>{modeInfo.label}</Text>
        <View style={s.bannerDot} />
        <Text style={[s.bannerSub, { color: colors.textSecondary }]}>
          {SCENARIO_DISPLAY[scenario]?.label ?? 'Normal'}
        </Text>
      </View>

      {/* ── Modals ── */}
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

// ── Accordion Card ──
function AccordionCard({
  id,
  title,
  icon,
  iconColor,
  subtitle,
  isOpen,
  onToggle,
  colors,
  children,
}: {
  id: string;
  title: string;
  icon: string;
  iconColor: string;
  subtitle: string;
  isOpen: boolean;
  onToggle: () => void;
  colors: ThemeColors;
  children: React.ReactNode;
}) {
  return (
    <View style={[accordionStyles.card, { backgroundColor: colors.surface, borderColor: isOpen ? iconColor + '40' : colors.creamSubtle }]}>
      <TouchableOpacity
        onPress={onToggle}
        style={accordionStyles.header}
        activeOpacity={0.7}
      >
        <View style={[accordionStyles.iconCircle, { backgroundColor: iconColor + '15' }]}>
          <SmartIcon name={icon as any} size={16} color={iconColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[accordionStyles.title, { color: colors.textPrimary }]}>{title}</Text>
          {!isOpen && (
            <Text style={[accordionStyles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
        <SmartIcon
          name={isOpen ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.textSecondary}
        />
      </TouchableOpacity>
      {isOpen && (
        <View style={accordionStyles.body}>
          {children}
        </View>
      )}
    </View>
  );
}

const accordionStyles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontFamily: fontFamily.semiBold,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: fontFamily.regular,
    marginTop: 1,
  },
  body: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
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
        <SmartIcon name={icon as any} size={13} color={colors.textSecondary} />
        <Text style={[rowStyles.label, { color: colors.textSecondary }]}>{label}</Text>
      </View>
      <View style={rowStyles.content}>{children}</View>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  container: {
    marginBottom: 14,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  label: {
    fontSize: 11,
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
              if (isSelected) onChange(selected.filter((d) => d !== i) as DayOfWeek[]);
              else onChange([...selected, i as DayOfWeek].sort());
            }}
            style={[
              dayPickerStyles.pill,
              {
                backgroundColor: isSelected ? accent + '20' : colors.chipBackground,
                borderColor: isSelected ? accent : colors.glassBorder,
              },
            ]}
          >
            <Text style={[dayPickerStyles.pillText, { color: isSelected ? accent : colors.textSecondary }]}>
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
    borderWidth: 1,
  },
  pillText: {
    fontSize: 13,
    fontFamily: fontFamily.semiBold,
  },
});

// ── Time Chip (stepper) ──
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
      {label && <Text style={[timeStyles.chipLabel, { color: colors.textSecondary }]}>{label}</Text>}
      <TouchableOpacity
        onPress={() => stepTime(-1)}
        style={[timeStyles.stepBtn, { backgroundColor: colors.chipBackground, borderColor: colors.glassBorder }]}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <SmartIcon name="chevron-back" size={12} color={colors.textSecondary} />
      </TouchableOpacity>
      <View style={[timeStyles.chip, { backgroundColor: colors.chipBackground, borderColor: colors.glassBorder }]}>
        <Text style={[timeStyles.chipValue, { color: colors.textPrimary }]}>{value}</Text>
      </View>
      <TouchableOpacity
        onPress={() => stepTime(1)}
        style={[timeStyles.stepBtn, { backgroundColor: colors.chipBackground, borderColor: colors.glassBorder }]}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <SmartIcon name="chevron-forward" size={12} color={colors.textSecondary} />
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
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  chipLabel: {
    fontSize: 11,
    fontFamily: fontFamily.regular,
    marginRight: 4,
  },
  chipValue: {
    fontSize: 15,
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
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
      {subjects.map((sub) => (
        <TouchableOpacity
          key={sub}
          onPress={() => {
            if (Platform.OS === 'web') {
              if (window.confirm(`Remove "${sub}"?`)) {
                onChange(subjects.filter((s) => s !== sub));
              }
            } else {
              Alert.alert('Remove Subject', `Remove "${sub}"?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: () => onChange(subjects.filter((s) => s !== sub)) },
              ]);
            }
          }}
          style={[subjectStyles.pill, { backgroundColor: accent + '15', borderColor: accent + '30' }]}
        >
          <Text style={[subjectStyles.pillText, { color: accent }]}>{sub}</Text>
          <SmartIcon name="close-circle" size={14} color={accent + '80'} style={{ marginLeft: 4 }} />
        </TouchableOpacity>
      ))}
      <TouchableOpacity onPress={onRequestAdd} style={[subjectStyles.addPill, { borderColor: colors.glassBorder }]}>
        <SmartIcon name="add" size={14} color={colors.textSecondary} />
        <Text style={[subjectStyles.addText, { color: colors.textSecondary }]}>Add</Text>
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
    borderRadius: borderRadius.full,
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
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  addText: {
    fontSize: 13,
    fontFamily: fontFamily.medium,
  },
});

// ── Training Type Row (Instagram-style toggle row with inline expand) ──
function TrainingTypeRow({
  category: cat,
  summary,
  isExpanded,
  onToggleExpand,
  onUpdate,
  colors,
}: {
  category: TrainingCategoryRule;
  summary: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (cat: TrainingCategoryRule) => void;
  colors: ThemeColors;
}) {
  return (
    <View style={[trainingStyles.row, { borderColor: isExpanded ? cat.color + '30' : colors.glassBorder }]}>
      {/* Summary row — always visible */}
      <TouchableOpacity onPress={onToggleExpand} style={trainingStyles.summaryRow} activeOpacity={0.7}>
        <View style={[trainingStyles.colorBar, { backgroundColor: cat.enabled ? cat.color : colors.textSecondary + '40' }]} />
        <View style={[trainingStyles.iconCircle, { backgroundColor: cat.color + '15' }]}>
          <SmartIcon name={cat.icon as any} size={14} color={cat.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[trainingStyles.name, { color: colors.textPrimary }]}>{cat.label}</Text>
          <Text style={[trainingStyles.summary, { color: colors.textSecondary }]}>{summary}</Text>
        </View>
        <Switch
          value={cat.enabled}
          onValueChange={(v) => onUpdate({ ...cat, enabled: v })}
          trackColor={{ false: colors.border, true: cat.color + '60' }}
          thumbColor={cat.enabled ? cat.color : colors.textSecondary}
          style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }}
        />
      </TouchableOpacity>

      {/* Expanded detail — editing controls */}
      {isExpanded && cat.enabled && (
        <View style={trainingStyles.detail}>
          {/* Schedule mode */}
          <View style={trainingStyles.modeRow}>
            <TouchableOpacity
              onPress={() => onUpdate({ ...cat, mode: 'fixed_days' })}
              style={[
                trainingStyles.modeChip,
                {
                  backgroundColor: cat.mode === 'fixed_days' ? cat.color + '15' : 'transparent',
                  borderColor: cat.mode === 'fixed_days' ? cat.color : colors.glassBorder,
                },
              ]}
            >
              <Text style={{ fontSize: 11, fontFamily: fontFamily.medium, color: cat.mode === 'fixed_days' ? cat.color : colors.textSecondary }}>
                Fixed Days
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onUpdate({ ...cat, mode: 'days_per_week' })}
              style={[
                trainingStyles.modeChip,
                {
                  backgroundColor: cat.mode === 'days_per_week' ? cat.color + '15' : 'transparent',
                  borderColor: cat.mode === 'days_per_week' ? cat.color : colors.glassBorder,
                },
              ]}
            >
              <Text style={{ fontSize: 11, fontFamily: fontFamily.medium, color: cat.mode === 'days_per_week' ? cat.color : colors.textSecondary }}>
                X per Week
              </Text>
            </TouchableOpacity>
          </View>

          {/* Day selection */}
          {cat.mode === 'fixed_days' ? (
            <View style={{ flexDirection: 'row', gap: 4, marginTop: 10 }}>
              {DAY_LABELS.map((label, i) => {
                const sel = cat.fixedDays.includes(i);
                return (
                  <TouchableOpacity
                    key={i}
                    onPress={() => {
                      const days = sel ? cat.fixedDays.filter((d) => d !== i) : [...cat.fixedDays, i].sort();
                      onUpdate({ ...cat, fixedDays: days });
                    }}
                    style={[
                      trainingStyles.dayDot,
                      {
                        backgroundColor: sel ? cat.color + '25' : 'transparent',
                        borderColor: sel ? cat.color : colors.glassBorder,
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 10, fontFamily: fontFamily.semiBold, color: sel ? cat.color : colors.textSecondary }}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <TouchableOpacity
                onPress={() => onUpdate({ ...cat, daysPerWeek: Math.max(1, cat.daysPerWeek - 1) })}
                style={[trainingStyles.stepper, { borderColor: colors.glassBorder }]}
              >
                <SmartIcon name="remove" size={14} color={colors.textSecondary} />
              </TouchableOpacity>
              <Text style={{ fontSize: 16, fontFamily: fontFamily.bold, color: cat.color }}>
                {cat.daysPerWeek}x
              </Text>
              <TouchableOpacity
                onPress={() => onUpdate({ ...cat, daysPerWeek: Math.min(7, cat.daysPerWeek + 1) })}
                style={[trainingStyles.stepper, { borderColor: colors.glassBorder }]}
              >
                <SmartIcon name="add" size={14} color={colors.textSecondary} />
              </TouchableOpacity>
              <Text style={{ fontSize: 11, color: colors.textSecondary, fontFamily: fontFamily.regular }}>per week</Text>
            </View>
          )}

          {/* Duration */}
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
            {[60, 75, 90, 120].map((dur) => (
              <TouchableOpacity
                key={dur}
                onPress={() => onUpdate({ ...cat, sessionDuration: dur })}
                style={[
                  trainingStyles.durChip,
                  {
                    backgroundColor: cat.sessionDuration === dur ? cat.color + '15' : 'transparent',
                    borderColor: cat.sessionDuration === dur ? cat.color : colors.glassBorder,
                  },
                ]}
              >
                <Text style={{ fontSize: 12, fontFamily: fontFamily.semiBold, color: cat.sessionDuration === dur ? cat.color : colors.textSecondary }}>
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

const trainingStyles = StyleSheet.create({
  row: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: 8,
    overflow: 'hidden',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingRight: 8,
    paddingVertical: 10,
  },
  colorBar: {
    width: 3,
    alignSelf: 'stretch',
    borderTopLeftRadius: borderRadius.lg,
    borderBottomLeftRadius: borderRadius.lg,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: 14,
    fontFamily: fontFamily.semiBold,
  },
  summary: {
    fontSize: 11,
    fontFamily: fontFamily.regular,
    marginTop: 1,
  },
  detail: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: 4,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  dayDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
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
    borderRadius: borderRadius.lg,
    borderWidth: 1,
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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={modalStyles.overlay}>
        <TouchableOpacity style={modalStyles.backdrop} activeOpacity={1} onPress={onCancel} />
        <View style={[modalStyles.card, { backgroundColor: colors.surface, borderColor: colors.glassBorder }]}>
          <Text style={[modalStyles.title, { color: colors.textPrimary }]}>{title}</Text>
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            placeholder={placeholder}
            placeholderTextColor={colors.textSecondary}
            keyboardType={keyboardType ?? 'default'}
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={() => { if (text.trim()) onSubmit(text.trim()); }}
            style={[modalStyles.input, { color: colors.textPrimary, borderColor: colors.glassBorder, backgroundColor: colors.background }]}
          />
          <View style={modalStyles.btnRow}>
            <TouchableOpacity onPress={onCancel} style={modalStyles.cancelBtn}>
              <Text style={[modalStyles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { if (text.trim()) onSubmit(text.trim()); }}
              style={[modalStyles.submitBtn, { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder }]}
            >
              <Text style={[modalStyles.submitText, { color: colors.accent }]}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  card: { width: '85%', maxWidth: 340, borderRadius: borderRadius.lg, borderWidth: 1, padding: spacing.lg, zIndex: 1 },
  title: { fontSize: 17, fontFamily: fontFamily.bold, marginBottom: 14 },
  input: { height: 44, borderWidth: 1, borderRadius: borderRadius.lg, paddingHorizontal: 14, fontSize: 15, fontFamily: fontFamily.regular },
  btnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 10 },
  cancelText: { fontSize: 14, fontFamily: fontFamily.medium },
  submitBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: borderRadius.lg, borderWidth: 1 },
  submitText: { fontSize: 14, fontFamily: fontFamily.semiBold },
});

// ── Date Picker Modal ──
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
  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); } else setViewMonth((m) => m - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); } else setViewMonth((m) => m + 1); };
  const formatSelected = () => `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(pickedDay).padStart(2, '0')}`;

  const todayStr = (() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  })();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={dpStyles.overlay}>
        <TouchableOpacity style={dpStyles.backdrop} activeOpacity={1} onPress={onCancel} />
        <View style={[dpStyles.card, { backgroundColor: colors.surface, borderColor: colors.glassBorder }]}>
          <Text style={[dpStyles.title, { color: colors.textPrimary }]}>{title}</Text>
          <View style={dpStyles.monthNav}>
            <TouchableOpacity onPress={prevMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <SmartIcon name="chevron-back" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[dpStyles.monthLabel, { color: colors.textPrimary }]}>{MONTHS[viewMonth]} {viewYear}</Text>
            <TouchableOpacity onPress={nextMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <SmartIcon name="chevron-forward" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <View style={dpStyles.dayHeaderRow}>
            {DAY_LABELS.map((l, i) => (
              <Text key={i} style={[dpStyles.dayHeader, { color: colors.textSecondary }]}>{l}</Text>
            ))}
          </View>
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
                    isSelected && { backgroundColor: colors.accent, borderRadius: 18 },
                    isToday && !isSelected && { borderWidth: 1, borderColor: colors.glassBorder, borderRadius: 18 },
                  ]}
                  onPress={() => setPickedDay(day)}
                >
                  <Text style={[dpStyles.cellText, { color: isSelected ? colors.textPrimary : colors.textBody }, isToday && !isSelected && { color: colors.accent }]}>{day}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={dpStyles.actions}>
            <TouchableOpacity onPress={onCancel} style={dpStyles.cancelBtn}>
              <Text style={[dpStyles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onSelect(formatSelected())} style={[dpStyles.selectBtn, { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder }]}>
              <Text style={[dpStyles.selectText, { color: colors.accent }]}>Select</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const dpStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  card: { width: '90%', maxWidth: 360, borderRadius: borderRadius.lg, borderWidth: 1, padding: spacing.lg, zIndex: 1 },
  title: { fontSize: 17, fontFamily: fontFamily.bold, marginBottom: 16, textAlign: 'center' },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  monthLabel: { fontSize: 16, fontFamily: fontFamily.semiBold },
  dayHeaderRow: { flexDirection: 'row', marginBottom: 4 },
  dayHeader: { flex: 1, textAlign: 'center', fontSize: 12, fontFamily: fontFamily.semiBold },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.285%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  cellText: { fontSize: 14, fontFamily: fontFamily.medium },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 10 },
  cancelText: { fontSize: 14, fontFamily: fontFamily.medium },
  selectBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: borderRadius.lg, borderWidth: 1 },
  selectText: { fontSize: 14, fontFamily: fontFamily.semiBold },
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
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
      gap: spacing.sm,
    },
    backBtn: {
      padding: 4,
    },
    headerTitle: {
      fontSize: 20,
      fontFamily: fontFamily.bold,
      color: colors.textPrimary,
    },
    savedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accentBorder,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: borderRadius.full,
    },
    savedText: {
      color: colors.accent,
      fontSize: 11,
      fontFamily: fontFamily.semiBold,
    },
    saveBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.xs,
      gap: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.creamSubtle,
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
      borderRadius: borderRadius.lg,
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accentBorder,
    },
    saveBtnText: {
      color: colors.accent,
      fontSize: 13,
      fontFamily: fontFamily.semiBold,
    },
    scroll: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: 100,
    },
    timeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    timeSep: {
      fontSize: 14,
      color: colors.textSecondary,
      fontFamily: fontFamily.regular,
    },
    cardHint: {
      fontSize: 12,
      fontFamily: fontFamily.regular,
      color: colors.textSecondary,
      marginBottom: 12,
      lineHeight: 16,
    },
    addTypeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 10,
      marginTop: 4,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.glassBorder,
      borderRadius: borderRadius.lg,
    },
    addTypeText: {
      fontSize: 13,
      fontFamily: fontFamily.medium,
    },

    // Bottom banner
    banner: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: spacing.sm,
      paddingBottom: 34,
      backgroundColor: colors.background,
      borderTopWidth: 1,
      borderTopColor: colors.creamSubtle,
    },
    bannerLabel: {
      fontSize: 13,
      fontFamily: fontFamily.semiBold,
    },
    bannerDot: {
      width: 3,
      height: 3,
      borderRadius: 1.5,
      backgroundColor: colors.textSecondary,
    },
    bannerSub: {
      fontSize: 11,
      fontFamily: fontFamily.regular,
    },
  });
}
