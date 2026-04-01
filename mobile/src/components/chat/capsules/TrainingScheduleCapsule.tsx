/**
 * TrainingScheduleCapsule — Plan training week inline in chat.
 * Matches the My Rules screen design: Fixed Days / X per Week toggle,
 * day circles, and duration chips.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch, Pressable } from 'react-native';
import { SmartIcon } from '../../SmartIcon';

function capsuleAddDuration(startTime: string, durationMin: number): string {
  const [h, m] = startTime.split(':').map(Number);
  const total = h * 60 + m + durationMin;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function stepTime(hhmm: string, delta: number): string {
  const [h, m] = (hhmm || '18:00').split(':').map(Number);
  let total = h * 60 + m + delta;
  if (total < 0) total = 0;
  if (total > 23 * 60 + 30) total = 23 * 60 + 30;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
import { colors as themeColors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type { TrainingScheduleCapsule as TrainingScheduleCapsuleType, CapsuleAction } from '../../../types/chat';
import { CapsuleStepper } from './shared/CapsuleStepper';
import { CapsuleSubmitButton } from './shared/CapsuleSubmitButton';

interface Props {
  card: TrainingScheduleCapsuleType;
  onSubmit: (action: CapsuleAction) => void;
}

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DURATIONS = [60, 75, 90, 120];

// Assign accent color per category index
const CAT_COLORS = ['#FF6B35', '#7B61FF', '#00D9FF', '#30D158', '#F39C12', '#FF2D55'];

export function TrainingScheduleCapsuleComponent({ card, onSubmit }: Props) {
  const [categories, setCategories] = useState(card.categories);
  const [planWeeks, setPlanWeeks] = useState(card.defaultWeeks);

  const enabledCategories = categories.filter(c => c.enabled);
  const totalSessions = enabledCategories.reduce((sum, c) => {
    const sessionsPerWeek = c.mode === 'fixed_days' ? c.fixedDays.length : c.daysPerWeek;
    return sum + sessionsPerWeek * planWeeks;
  }, 0);

  const toggleCategory = (id: string) => {
    setCategories(prev => prev.map(c =>
      c.id === id ? { ...c, enabled: !c.enabled } : c
    ));
  };

  const updateCategory = (id: string, updates: Record<string, any>) => {
    setCategories(prev => prev.map(c =>
      c.id === id ? { ...c, ...updates } : c
    ));
  };

  const handleSubmit = () => {
    onSubmit({
      type: 'training_schedule_capsule',
      toolName: 'generate_training_plan',
      toolInput: {
        planWeeks,
        categories: enabledCategories.map(c => ({
          id: c.id,
          label: c.label,
          mode: c.mode,
          fixedDays: c.fixedDays,
          daysPerWeek: c.mode === 'fixed_days' ? c.fixedDays.length : c.daysPerWeek,
          sessionDuration: c.sessionDuration,
          preferredTime: c.preferredTime,
          fixedStartTime: (c as any).fixedStartTime || undefined,
          fixedEndTime: (c as any).fixedEndTime || undefined,
        })),
      },
      agentType: 'timeline',
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>🗓️ Plan My Training</Text>

      {/* Summary */}
      <View style={styles.summaryRow}>
        <Text style={styles.summaryText}>
          {enabledCategories.length} categories · {totalSessions} sessions
        </Text>
      </View>

      {/* Plan duration */}
      <CapsuleStepper
        label="Plan Duration"
        value={planWeeks}
        onChange={setPlanWeeks}
        min={1}
        max={4}
        unit="weeks"
      />

      {/* Category cards */}
      {categories.map((cat, idx) => {
        const accent = CAT_COLORS[idx % CAT_COLORS.length];
        return (
          <View key={cat.id} style={[styles.categoryCard, { borderLeftColor: accent }]}>
            {/* Header: icon + label + toggle */}
            <View style={styles.catHeader}>
              <View style={[styles.iconCircle, { backgroundColor: accent + '20' }]}>
                <SmartIcon name={(cat.icon || 'add-circle-outline') as any} size={16} color={accent} />
              </View>
              <Text style={styles.catLabel}>{cat.label}</Text>
              <Switch
                value={cat.enabled}
                onValueChange={() => toggleCategory(cat.id)}
                trackColor={{ false: themeColors.border, true: accent + '80' }}
                thumbColor={cat.enabled ? accent : themeColors.textInactive}
                style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
              />
            </View>

            {cat.enabled && (
              <View style={styles.catDetails}>
                {/* Mode toggle: Fixed Days / X per Week */}
                <View style={styles.modeRow}>
                  <Pressable
                    onPress={() => updateCategory(cat.id, { mode: 'fixed_days' })}
                    style={[
                      styles.modeChip,
                      {
                        backgroundColor: cat.mode === 'fixed_days' ? accent + '20' : 'transparent',
                        borderColor: cat.mode === 'fixed_days' ? accent : themeColors.border,
                      },
                    ]}
                  >
                    <Text style={[
                      styles.modeText,
                      { color: cat.mode === 'fixed_days' ? accent : themeColors.textInactive },
                    ]}>
                      Fixed Days
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => updateCategory(cat.id, { mode: 'days_per_week' })}
                    style={[
                      styles.modeChip,
                      {
                        backgroundColor: cat.mode === 'days_per_week' ? accent + '20' : 'transparent',
                        borderColor: cat.mode === 'days_per_week' ? accent : themeColors.border,
                      },
                    ]}
                  >
                    <Text style={[
                      styles.modeText,
                      { color: cat.mode === 'days_per_week' ? accent : themeColors.textInactive },
                    ]}>
                      X per Week
                    </Text>
                  </Pressable>
                </View>

                {/* Days: circles or stepper */}
                {cat.mode === 'fixed_days' ? (
                  <View style={styles.daysRow}>
                    {DAY_LABELS.map((label, i) => {
                      const sel = cat.fixedDays.includes(i);
                      return (
                        <Pressable
                          key={i}
                          onPress={() => {
                            const days = sel
                              ? cat.fixedDays.filter(d => d !== i)
                              : [...cat.fixedDays, i].sort();
                            updateCategory(cat.id, { fixedDays: days });
                          }}
                          style={[
                            styles.dayDot,
                            {
                              backgroundColor: sel ? accent + '30' : 'transparent',
                              borderColor: sel ? accent : themeColors.border,
                            },
                          ]}
                        >
                          <Text style={[
                            styles.dayText,
                            { color: sel ? accent : themeColors.textInactive },
                          ]}>
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <View style={styles.stepperRow}>
                    <Pressable
                      onPress={() => updateCategory(cat.id, { daysPerWeek: Math.max(1, cat.daysPerWeek - 1) })}
                      style={[styles.stepperBtn, { borderColor: themeColors.border }]}
                    >
                      <SmartIcon name="remove" size={14} color={themeColors.textInactive} />
                    </Pressable>
                    <Text style={[styles.stepperValue, { color: accent }]}>
                      {cat.daysPerWeek}x
                    </Text>
                    <Pressable
                      onPress={() => updateCategory(cat.id, { daysPerWeek: Math.min(7, cat.daysPerWeek + 1) })}
                      style={[styles.stepperBtn, { borderColor: themeColors.border }]}
                    >
                      <SmartIcon name="add" size={14} color={themeColors.textInactive} />
                    </Pressable>
                    <Text style={styles.perWeekLabel}>per week</Text>
                  </View>
                )}

                {/* Duration chips */}
                <View style={styles.durRow}>
                  {DURATIONS.map(dur => (
                    <Pressable
                      key={dur}
                      onPress={() => updateCategory(cat.id, { sessionDuration: dur })}
                      style={[
                        styles.durChip,
                        {
                          backgroundColor: cat.sessionDuration === dur ? accent + '20' : 'transparent',
                          borderColor: cat.sessionDuration === dur ? accent : themeColors.border,
                        },
                      ]}
                    >
                      <Text style={[
                        styles.durText,
                        { color: cat.sessionDuration === dur ? accent : themeColors.textInactive },
                      ]}>
                        {dur}m
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* Fixed Time — start only, end auto-calculated from duration */}
                <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 11, fontFamily: fontFamily.medium, color: themeColors.textInactive }}>Fixed Time</Text>
                  <Switch
                    value={!!(cat as any).fixedStartTime}
                    onValueChange={(v) => {
                      if (!v) {
                        updateCategory(cat.id, { fixedStartTime: '', fixedEndTime: '' });
                      } else {
                        const defaults: Record<string, string> = { morning: '08:00', afternoon: '15:00', evening: '18:00' };
                        const s = defaults[cat.preferredTime] || '18:00';
                        updateCategory(cat.id, { fixedStartTime: s, fixedEndTime: capsuleAddDuration(s, cat.sessionDuration) });
                      }
                    }}
                    trackColor={{ false: themeColors.border, true: accent + '80' }}
                    thumbColor={(cat as any).fixedStartTime ? accent : themeColors.textInactive}
                    style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }] }}
                  />
                </View>
                {!!(cat as any).fixedStartTime && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <Text style={{ fontSize: 11, color: themeColors.textInactive }}>Starts at</Text>
                    <Pressable onPress={() => {
                      const t = stepTime((cat as any).fixedStartTime, -30);
                      updateCategory(cat.id, { fixedStartTime: t, fixedEndTime: capsuleAddDuration(t, cat.sessionDuration) });
                    }}
                      style={[styles.stepperBtn, { borderColor: themeColors.border, width: 22, height: 22, borderRadius: 11 }]}>
                      <SmartIcon name="remove" size={10} color={themeColors.textInactive} />
                    </Pressable>
                    <Text style={{ fontSize: 13, fontFamily: fontFamily.semiBold, color: accent, minWidth: 40, textAlign: 'center' }}>
                      {(cat as any).fixedStartTime}
                    </Text>
                    <Pressable onPress={() => {
                      const t = stepTime((cat as any).fixedStartTime, 30);
                      updateCategory(cat.id, { fixedStartTime: t, fixedEndTime: capsuleAddDuration(t, cat.sessionDuration) });
                    }}
                      style={[styles.stepperBtn, { borderColor: themeColors.border, width: 22, height: 22, borderRadius: 11 }]}>
                      <SmartIcon name="add" size={10} color={themeColors.textInactive} />
                    </Pressable>
                    <Text style={{ fontSize: 11, color: themeColors.textInactive }}>
                      → {capsuleAddDuration((cat as any).fixedStartTime, cat.sessionDuration)}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        );
      })}

      <CapsuleSubmitButton
        title={`Generate ${planWeeks}-Week Plan`}
        disabled={enabledCategories.length === 0}
        onPress={handleSubmit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: themeColors.backgroundElevated,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  heading: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: themeColors.textPrimary,
  },
  summaryRow: {
    backgroundColor: themeColors.chipBackground,
    borderRadius: borderRadius.md,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  summaryText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: themeColors.accent2,
  },
  categoryCard: {
    backgroundColor: themeColors.background,
    borderRadius: 14,
    padding: 14,
    borderLeftWidth: 3,
    gap: spacing.xs,
  },
  catHeader: {
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
  catLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: fontFamily.semiBold,
    color: themeColors.textPrimary,
  },
  catDetails: {
    marginTop: 10,
    paddingLeft: 40,
    gap: 4,
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
  modeText: {
    fontSize: 11,
    fontFamily: fontFamily.medium,
  },
  daysRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 8,
  },
  dayDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  dayText: {
    fontSize: 10,
    fontFamily: fontFamily.semiBold,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  stepperBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    fontSize: 16,
    fontFamily: fontFamily.bold,
  },
  perWeekLabel: {
    fontSize: 11,
    color: themeColors.textInactive,
    fontFamily: fontFamily.regular,
  },
  durRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
  durChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  durText: {
    fontSize: 12,
    fontFamily: fontFamily.semiBold,
  },
});
