/**
 * TrainingPlanView — Training plan generation tab
 *
 * Reads ALL category config from Rules (useScheduleRules).
 * Only shows generation-specific settings:
 *   - Read-only category summary cards (from Rules)
 *   - Plan duration (weeks) stepper
 *   - Block estimate
 *   - Generate Plan CTA
 *
 * UI is unified with StudyPlanView — same banner, sections, empty state pattern.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Pressable,
  Platform,
  Switch,
  TextInput,
} from 'react-native';
import { SmartIcon } from '../components/SmartIcon';
import { PlayerScreen } from '../components/tomo-ui/playerDesign';
import { Loader } from '../components/Loader';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { useScheduleRules } from '../hooks/useScheduleRules';
import type { TrainingCategoryRule } from '../hooks/useScheduleRules';
import { updateUser, getCalendarEventsByRange, deleteCalendarEvent } from '../services/api';
import { generateTrainingPlan } from '../services/trainingPlanGenerator';
import { spacing, borderRadius, fontFamily } from '../theme';
import type { ThemeColors } from '../theme/colors';
import type {
  TrainingCategoryConfig,
  TrainingPlanConfig,
  TrainingBlock,
} from '../types';

// ── Constants ────────────────────────────────────────────────────────

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Component ────────────────────────────────────────────────────────

type TrainingPlanViewProps = {
  onNavigateToPreview?: (blocks: TrainingBlock[], warnings?: string[]) => void;
  onNavigateToRules?: () => void;
};

export function TrainingPlanView({ onNavigateToPreview, onNavigateToRules }: TrainingPlanViewProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { profile } = useAuth();
  const { rules, loading, refresh, update } = useScheduleRules();
  const navigation = useNavigation<any>();

  const handleNavigateToPreview = onNavigateToPreview ?? ((blocks: TrainingBlock[], warnings?: string[]) => {
    navigation.navigate('StudyPlanPreview', {
      blocks: JSON.stringify(blocks),
      warnings: warnings?.length ? JSON.stringify(warnings) : undefined,
      planType: 'training',
    });
  });
  const handleNavigateToRules = onNavigateToRules ?? (() => navigation.navigate('MyRules'));

  // Refresh data when tab is focused
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      refresh();
    });
    return unsubscribe;
  }, [navigation, refresh]);

  // ── Read categories from Rules (source of truth) ───────────────────

  const categories: TrainingCategoryConfig[] = useMemo(() => {
    if (rules?.preferences?.training_categories?.length) {
      return rules.preferences.training_categories.map((rc: TrainingCategoryRule) => ({
        id: rc.id,
        label: rc.label,
        icon: rc.icon,
        color: rc.color,
        enabled: rc.enabled,
        mode: rc.mode,
        fixedDays: rc.fixedDays,
        daysPerWeek: rc.daysPerWeek,
        sessionDuration: rc.sessionDuration,
        preferredTime: rc.preferredTime,
        fixedStartTime: rc.fixedStartTime,
        fixedEndTime: rc.fixedEndTime,
        linkedPrograms: rc.linkedPrograms,
      }));
    }
    // Fallback to profile
    return profile?.trainingPlanConfig?.categories || [];
  }, [rules?.preferences?.training_categories, profile?.trainingPlanConfig?.categories]);

  const enabledCategories = useMemo(
    () => categories.filter((c) => c.enabled),
    [categories],
  );

  // School schedule from rules
  const schoolSchedule = useMemo(() => {
    if (!rules?.preferences) return undefined;
    return {
      type: 'school' as const,
      days: rules.preferences.school_days as number[],
      startTime: rules.preferences.school_start,
      endTime: rules.preferences.school_end,
    };
  }, [rules?.preferences]);

  // ── Generation-specific state ──────────────────────────────────────

  const savedConfig = profile?.trainingPlanConfig;
  const [planWeeks, setPlanWeeks] = useState(savedConfig?.planWeeks || 2);
  const [isGenerating, setIsGenerating] = useState(false);

  // ── Derived ────────────────────────────────────────────────────────

  const blockEstimate = useMemo(() => {
    let total = 0;
    for (const cat of enabledCategories) {
      const daysPerWeek = cat.mode === 'fixed_days' ? cat.fixedDays.length : cat.daysPerWeek;
      total += daysPerWeek * planWeeks;
    }
    return total;
  }, [enabledCategories, planWeeks]);

  // Config summary text for banner
  const configSummary = useMemo(() => {
    const catCount = enabledCategories.length;
    const totalSessions = enabledCategories.reduce((sum, c) => {
      return sum + (c.mode === 'fixed_days' ? c.fixedDays.length : c.daysPerWeek);
    }, 0);
    return `${catCount} categor${catCount === 1 ? 'y' : 'ies'} · ${totalSessions} sessions/wk`;
  }, [enabledCategories]);

  // ── Handlers ───────────────────────────────────────────────────────

  const saveConfig = useCallback(async (cats: TrainingCategoryConfig[], weeks: number) => {
    try {
      await updateUser({ trainingPlanConfig: { categories: cats, planWeeks: weeks } } as any);
    } catch { /* silent */ }
  }, []);

  const handleGenerate = useCallback(async () => {
    if (enabledCategories.length === 0) {
      if (Platform.OS === 'web') {
        if (window.confirm('Enable at least one training category in My Rules. Go to Rules?')) {
          handleNavigateToRules();
        }
      } else {
        Alert.alert('No Categories', 'Enable at least one training category in My Rules.', [
          { text: 'Go to Rules', onPress: handleNavigateToRules },
          { text: 'Cancel', style: 'cancel' },
        ]);
      }
      return;
    }

    saveConfig(categories, planWeeks);
    setIsGenerating(true);

    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const endDate = new Date(tomorrow);
      endDate.setDate(endDate.getDate() + planWeeks * 7);

      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      let existingEvents: any[] = [];
      try {
        const res = await getCalendarEventsByRange(fmt(tomorrow), fmt(endDate));
        existingEvents = res.events || [];
      } catch {
        console.warn('[TrainingPlan] Could not fetch calendar events');
      }

      const existingTrainingBlocks = existingEvents.filter((e: any) => e.type === 'training');

      const proceedWithGeneration = async (eventsForGenerator: any[]) => {
        const config: TrainingPlanConfig = { categories, planWeeks };
        const result = generateTrainingPlan(config, eventsForGenerator, schoolSchedule, undefined, rules?.effectiveRules);

        if (result.blocks.length === 0) {
          const msg = result.warnings.length > 0
            ? result.warnings.join('\n')
            : 'Could not generate any training blocks. Try adjusting your settings.';
          if (Platform.OS === 'web') {
            window.alert(msg);
          } else {
            Alert.alert('No Blocks Generated', msg);
          }
          setIsGenerating(false);
          return;
        }

        setIsGenerating(false);

        if (result.warnings.length > 0) {
          if (Platform.OS === 'web') {
            if (window.confirm('Some sessions could not be placed:\n' + result.warnings.join('\n') + '\n\nView Plan Anyway?')) {
              handleNavigateToPreview(result.blocks, result.warnings);
            }
          } else {
            Alert.alert(
              'Some sessions could not be placed',
              result.warnings.join('\n'),
              [
                { text: 'View Plan Anyway', onPress: () => handleNavigateToPreview(result.blocks, result.warnings) },
                { text: 'Cancel', style: 'cancel' },
              ],
            );
          }
        } else {
          handleNavigateToPreview(result.blocks);
        }
      };

      if (existingTrainingBlocks.length > 0) {
        setIsGenerating(false);
        if (Platform.OS === 'web') {
          if (window.confirm(`You have ${existingTrainingBlocks.length} training block${existingTrainingBlocks.length > 1 ? 's' : ''} in your calendar. Generating will replace them. Replace & Generate?`)) {
            setIsGenerating(true);
            for (const block of existingTrainingBlocks) {
              try { await deleteCalendarEvent(block.id); } catch { /* skip */ }
            }
            await proceedWithGeneration(existingEvents.filter((e: any) => e.type !== 'training'));
          }
        } else {
          Alert.alert(
            'Existing Training Plan',
            `You have ${existingTrainingBlocks.length} training block${existingTrainingBlocks.length > 1 ? 's' : ''} in your calendar. Generating will replace them.`,
            [
              {
                text: 'Replace & Generate',
                style: 'destructive',
                onPress: async () => {
                  setIsGenerating(true);
                  for (const block of existingTrainingBlocks) {
                    try { await deleteCalendarEvent(block.id); } catch { /* skip */ }
                  }
                  await proceedWithGeneration(existingEvents.filter((e: any) => e.type !== 'training'));
                },
              },
              { text: 'Cancel', style: 'cancel' },
            ],
          );
        }
        return;
      }

      await proceedWithGeneration(existingEvents);
    } catch (err) {
      console.error('[TrainingPlan] Generation error:', err);
      if (Platform.OS === 'web') {
        window.alert('Something went wrong. Please try again.');
      } else {
        Alert.alert('Error', 'Something went wrong. Please try again.');
      }
    } finally {
      setIsGenerating(false);
    }
  }, [categories, enabledCategories, planWeeks, saveConfig, handleNavigateToPreview, handleNavigateToRules, schoolSchedule, rules?.effectiveRules]);

  const addCategory = useCallback((name: string) => {
    const newCat: TrainingCategoryRule = {
      id: name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now(),
      label: name,
      icon: 'add-circle-outline',
      color: colors.accent2,
      enabled: true,
      mode: 'days_per_week' as const,
      fixedDays: [],
      daysPerWeek: 2,
      sessionDuration: 60,
      preferredTime: 'afternoon',
    };
    const cats = [...(rules?.preferences?.training_categories ?? []), newCat];
    update({ training_categories: cats });
  }, [rules?.preferences?.training_categories, update]);

  // ── Loading state (prevents empty-state flash) ─────────────────────

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Loader size="lg" />
      </View>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────

  if (categories.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.emptyContainer}>
        <View style={styles.emptyIcon}>
          <SmartIcon name="barbell-outline" size={32} color={colors.accent1} />
        </View>
        <Text style={styles.emptyTitle}>No training categories</Text>
        <Text style={styles.emptySubtitle}>
          Set up your training schedule in My Rules to generate a plan.
        </Text>
        <TouchableOpacity style={[styles.rulesBtn, { backgroundColor: `${colors.accent1}1F`, borderColor: `${colors.accent1}4D`, borderWidth: 1 }]} onPress={handleNavigateToRules}>
          <SmartIcon name="options-outline" size={16} color={colors.accent1} />
          <Text style={[styles.rulesBtnText, { color: colors.accent1 }]}>Go to Rules</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <PlayerScreen label="TRAINING" title="Plan" onBack={() => navigation.goBack()} contentStyle={styles.scroll}>

      {/* ─── Plan duration stepper ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Plan Duration</Text>
        <View style={styles.durationRow}>
          <TouchableOpacity
            onPress={() => {
              const v = Math.max(1, planWeeks - 1);
              setPlanWeeks(v);
              saveConfig(categories, v);
            }}
            style={[styles.stepperBtn, { borderColor: colors.border }]}
          >
            <SmartIcon name="remove" size={14} color={colors.textOnDark} />
          </TouchableOpacity>
          <Text style={styles.durationValue}>{planWeeks}</Text>
          <TouchableOpacity
            onPress={() => {
              const v = Math.min(8, planWeeks + 1);
              setPlanWeeks(v);
              saveConfig(categories, v);
            }}
            style={[styles.stepperBtn, { borderColor: colors.border }]}
          >
            <SmartIcon name="add" size={14} color={colors.textOnDark} />
          </TouchableOpacity>
          <Text style={[styles.durationUnit, { color: colors.textSecondary }]}>weeks</Text>
        </View>
      </View>

      {/* ─── Editable Training Categories ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Training Categories</Text>
        {categories.map((cat) => (
          <TrainingCategoryCardInline
            key={cat.id}
            category={cat}
            onUpdate={(updated) => {
              const cats = (rules?.preferences?.training_categories ?? []).map((c: TrainingCategoryRule) =>
                c.id === updated.id ? updated : c,
              );
              update({ training_categories: cats });
            }}
            colors={colors}
          />
        ))}
        <TouchableOpacity
          style={styles.addCategoryBtn}
          onPress={() => {
            // Simple prompt for new category
            if (Platform.OS === 'web') {
              const name = window.prompt('Add Training Category', 'e.g. Swimming, Yoga');
              if (!name?.trim()) return;
              addCategory(name.trim());
            } else {
              Alert.prompt?.('Add Category', 'e.g. Swimming, Yoga', (name: string) => {
                if (!name?.trim()) return;
                addCategory(name.trim());
              }) ?? Alert.alert('Add Category', 'Use the chat to add a new training category');
            }
          }}
        >
          <SmartIcon name="add-circle-outline" size={18} color={colors.accent1} />
          <Text style={[styles.addCategoryText, { color: colors.accent1 }]}>Add Category</Text>
        </TouchableOpacity>
      </View>

      {/* ─── League Season toggle ─── */}
      <View style={[styles.section, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SmartIcon name="trophy-outline" size={16} color={colors.accent1} />
          <Text style={styles.sectionLabel}>League Season</Text>
        </View>
        <Switch
          value={rules?.preferences?.league_is_active ?? false}
          onValueChange={(v) => update({ league_is_active: v })}
          trackColor={{ false: colors.border, true: colors.accent1 + '80' }}
          thumbColor={rules?.preferences?.league_is_active ? colors.accent1 : colors.textInactive}
          style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
        />
      </View>

      {/* ─── Block Estimate ─── */}
      {blockEstimate > 0 && (
        <View style={styles.estimateRow}>
          <SmartIcon name="layers-outline" size={16} color={colors.accent1} />
          <Text style={styles.estimateText}>~{blockEstimate} training blocks</Text>
        </View>
      )}

      {/* ─── Generate CTA ─── */}
      <TouchableOpacity
        style={[styles.generateBtn, {
          opacity: isGenerating || enabledCategories.length === 0 ? 0.4 : 1,
          backgroundColor: `${colors.accent1}1F`,
          borderWidth: 1,
          borderColor: `${colors.accent1}4D`,
        }]}
        onPress={handleGenerate}
        disabled={isGenerating || enabledCategories.length === 0}
        activeOpacity={0.7}
      >
        {isGenerating ? (
          <Loader size="sm" />
        ) : (
          <SmartIcon name="sparkles" size={16} color={colors.accent1} />
        )}
        <Text style={[styles.generateBtnText, { color: colors.accent1 }]}>
          {isGenerating ? 'Checking calendar...' : 'Generate Training Plan'}
        </Text>
      </TouchableOpacity>
    </PlayerScreen>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────

function addDuration(startTime: string, durationMin: number): string {
  const [h, m] = startTime.split(':').map(Number);
  const total = h * 60 + m + durationMin;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// ── Time Stepper Mini (±30 min) ─────────────────────────────────────

function stepTime(hhmm: string, delta: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  let total = h * 60 + m + delta;
  if (total < 0) total = 0;
  if (total > 23 * 60 + 30) total = 23 * 60 + 30;
  const newH = Math.floor(total / 60);
  const newM = total % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

function TimeStepperMini({ value, onChange, color, colors }: {
  value: string;
  onChange: (v: string) => void;
  color: string;
  colors: ThemeColors;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Pressable
        onPress={() => onChange(stepTime(value, -30))}
        style={[inlineStyles.stepper, { borderColor: colors.border, width: 22, height: 22, borderRadius: 11 }]}
      >
        <SmartIcon name="remove" size={10} color={colors.textInactive} />
      </Pressable>
      <Text style={{ fontSize: 13, fontFamily: fontFamily.semiBold, color, minWidth: 40, textAlign: 'center' }}>
        {value || '--:--'}
      </Text>
      <Pressable
        onPress={() => onChange(stepTime(value, 30))}
        style={[inlineStyles.stepper, { borderColor: colors.border, width: 22, height: 22, borderRadius: 11 }]}
      >
        <SmartIcon name="add" size={10} color={colors.textInactive} />
      </Pressable>
    </View>
  );
}

// ── Inline Training Category Card (matches MyRules design) ──────────

const INLINE_DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const INLINE_DURATIONS = [60, 75, 90, 120];

function TrainingCategoryCardInline({
  category: cat,
  onUpdate,
  colors,
}: {
  category: TrainingCategoryRule;
  onUpdate: (cat: TrainingCategoryRule) => void;
  colors: ThemeColors;
}) {
  return (
    <View style={[inlineStyles.card, { backgroundColor: colors.cardLight, borderLeftColor: cat.color }]}>
      <View style={inlineStyles.headerRow}>
        <View style={[inlineStyles.iconCircle, { backgroundColor: cat.color + '20' }]}>
          <SmartIcon name={(cat.icon || 'add-circle-outline') as any} size={16} color={cat.color} />
        </View>
        <Text style={[inlineStyles.label, { color: colors.textOnDark }]}>{cat.label}</Text>
        <Switch
          value={cat.enabled}
          onValueChange={(v) => onUpdate({ ...cat, enabled: v })}
          trackColor={{ false: colors.border, true: cat.color + '80' }}
          thumbColor={cat.enabled ? cat.color : colors.textInactive}
          style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
        />
      </View>

      {cat.enabled && (
        <View style={inlineStyles.details}>
          {/* Mode toggle */}
          <View style={inlineStyles.modeRow}>
            <Pressable
              onPress={() => onUpdate({ ...cat, mode: 'fixed_days' })}
              style={[
                inlineStyles.modeChip,
                {
                  backgroundColor: cat.mode === 'fixed_days' ? cat.color + '20' : 'transparent',
                  borderColor: cat.mode === 'fixed_days' ? cat.color : colors.border,
                },
              ]}
            >
              <Text style={{ fontSize: 11, fontFamily: fontFamily.medium, color: cat.mode === 'fixed_days' ? cat.color : colors.textInactive }}>
                Fixed Days
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onUpdate({ ...cat, mode: 'days_per_week' })}
              style={[
                inlineStyles.modeChip,
                {
                  backgroundColor: cat.mode === 'days_per_week' ? cat.color + '20' : 'transparent',
                  borderColor: cat.mode === 'days_per_week' ? cat.color : colors.border,
                },
              ]}
            >
              <Text style={{ fontSize: 11, fontFamily: fontFamily.medium, color: cat.mode === 'days_per_week' ? cat.color : colors.textInactive }}>
                X per Week
              </Text>
            </Pressable>
          </View>

          {/* Days selection */}
          {cat.mode === 'fixed_days' ? (
            <View style={{ flexDirection: 'row', gap: 4, marginTop: 8 }}>
              {INLINE_DAY_LABELS.map((label, i) => {
                const sel = cat.fixedDays.includes(i);
                return (
                  <Pressable
                    key={i}
                    onPress={() => {
                      const days = sel
                        ? cat.fixedDays.filter((d) => d !== i)
                        : [...cat.fixedDays, i].sort();
                      onUpdate({ ...cat, fixedDays: days });
                    }}
                    style={[
                      inlineStyles.dayDot,
                      {
                        backgroundColor: sel ? cat.color + '30' : 'transparent',
                        borderColor: sel ? cat.color : colors.border,
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 10, fontFamily: fontFamily.semiBold, color: sel ? cat.color : colors.textInactive }}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <Pressable
                onPress={() => onUpdate({ ...cat, daysPerWeek: Math.max(1, cat.daysPerWeek - 1) })}
                style={[inlineStyles.stepper, { borderColor: colors.border }]}
              >
                <SmartIcon name="remove" size={14} color={colors.textInactive} />
              </Pressable>
              <Text style={{ fontSize: 16, fontFamily: fontFamily.bold, color: cat.color }}>
                {cat.daysPerWeek}x
              </Text>
              <Pressable
                onPress={() => onUpdate({ ...cat, daysPerWeek: Math.min(7, cat.daysPerWeek + 1) })}
                style={[inlineStyles.stepper, { borderColor: colors.border }]}
              >
                <SmartIcon name="add" size={14} color={colors.textInactive} />
              </Pressable>
              <Text style={{ fontSize: 11, color: colors.textInactive, fontFamily: fontFamily.regular }}>
                per week
              </Text>
            </View>
          )}

          {/* Duration chips */}
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
            {INLINE_DURATIONS.map((dur) => (
              <Pressable
                key={dur}
                onPress={() => onUpdate({ ...cat, sessionDuration: dur })}
                style={[
                  inlineStyles.durChip,
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
              </Pressable>
            ))}
          </View>

          {/* Fixed time (optional — when time is known) */}
          <View style={{ marginTop: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 11, fontFamily: fontFamily.medium, color: colors.textInactive }}>
                Fixed Time
              </Text>
              <Switch
                value={!!cat.fixedStartTime}
                onValueChange={(v) => {
                  if (!v) {
                    onUpdate({ ...cat, fixedStartTime: '', fixedEndTime: '' });
                  } else {
                    const defaults: Record<string, string> = {
                      morning: '08:00', afternoon: '15:00', evening: '18:00',
                    };
                    const s = defaults[cat.preferredTime] || '18:00';
                    onUpdate({ ...cat, fixedStartTime: s, fixedEndTime: addDuration(s, cat.sessionDuration) });
                  }
                }}
                trackColor={{ false: colors.border, true: cat.color + '80' }}
                thumbColor={cat.fixedStartTime ? cat.color : colors.textInactive}
                style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }] }}
              />
            </View>
            {cat.fixedStartTime && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <Text style={{ fontSize: 11, color: colors.textInactive }}>Starts at</Text>
                <TimeStepperMini
                  value={cat.fixedStartTime}
                  onChange={(t) => onUpdate({ ...cat, fixedStartTime: t, fixedEndTime: addDuration(t, cat.sessionDuration) })}
                  color={cat.color}
                  colors={colors}
                />
                <Text style={{ fontSize: 11, color: colors.textInactive }}>
                  → {addDuration(cat.fixedStartTime, cat.sessionDuration)}
                </Text>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const inlineStyles = StyleSheet.create({
  card: { borderRadius: 14, padding: 14, marginBottom: 10, borderLeftWidth: 3 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontSize: 15, fontFamily: fontFamily.semiBold },
  details: { marginTop: 10, paddingLeft: 40 },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  dayDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  stepper: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  durChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
});

// ── Styles ───────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scroll: {
      padding: spacing.lg,
      paddingBottom: 40,
    },

    // Loading
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 60,
    },

    // Empty state (matches Study tab)
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

    // Config banner (matches Study tab exactly)
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

    // Section (matches Study tab)
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

    // Duration stepper
    durationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    durationValue: {
      fontSize: 22,
      fontFamily: fontFamily.bold,
      color: colors.textOnDark,
      minWidth: 24,
      textAlign: 'center',
    },
    durationUnit: {
      fontSize: 15,
      fontFamily: fontFamily.medium,
      marginLeft: 2,
    },
    stepperBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Category card (read-only)
    categoryCard: {
      borderRadius: 14,
      borderWidth: 1,
      padding: 14,
      marginBottom: 8,
      backgroundColor: colors.surfaceElevated,
    },
    cardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    catIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    catInfo: {
      flex: 1,
    },
    catLabel: {
      fontSize: 15,
      fontFamily: fontFamily.semiBold,
      color: colors.textOnDark,
    },
    catMeta: {
      fontSize: 12,
      fontFamily: fontFamily.regular,
      marginTop: 2,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    disabledLabel: {
      fontSize: 12,
      fontFamily: fontFamily.medium,
    },

    // Estimate (matches Study tab)
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
    addCategoryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: `${colors.accent1}30`,
      borderStyle: 'dashed',
    },
    addCategoryText: {
      fontSize: 13,
      fontFamily: fontFamily.medium,
    },
  });
}
