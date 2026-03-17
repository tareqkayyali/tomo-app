/**
 * MyDrillsTab — AI-recommended drills + Coach-assigned drills
 *
 * Section A: Personalized drill recommendations from getRecommendedDrills()
 *            Each drill has "Add to Schedule" with inline date/day picker
 * Section B: Coach-assigned drills (pending + accepted) via notifications
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Modal,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  getRecommendedDrills,
  scheduleDrills,
  type RecommendedDrill,
} from '../../services/api';
import { useNotifications } from '../../hooks/useNotifications';
import { DrillNotificationCard } from '../player/DrillNotificationCard';
import type { ThemeColors } from '../../theme/colors';
import { spacing, fontFamily, borderRadius } from '../../theme';

// ── Category colors ──────────────────────────────────────────────

const CAT_COLORS: Record<string, string> = {
  warmup: '#F7B731',
  training: '#FF6B35',
  cooldown: '#00D9FF',
  recovery: '#2ECC71',
  activation: '#AF52DE',
};

const CAT_LABELS: Record<string, string> = {
  warmup: 'Warm-up',
  training: 'Training',
  cooldown: 'Cooldown',
  recovery: 'Recovery',
  activation: 'Activation',
};

const INTENSITY_COLORS: Record<string, string> = {
  light: '#2ECC71',
  moderate: '#F7B731',
  hard: '#FF3B30',
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Props ────────────────────────────────────────────────────────

interface Props {
  colors: ThemeColors;
}

export function MyDrillsTab({ colors }: Props) {
  const s = useMemo(() => createStyles(colors), [colors]);
  const { notifications, pendingDrillNotifs, refresh: refreshNotifs } = useNotifications();

  const [drills, setDrills] = useState<RecommendedDrill[]>([]);
  const [readiness, setReadiness] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Schedule picker state
  const [pickerVisible, setPickerVisible] = useState(false);
  const [selectedDrillIds, setSelectedDrillIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 3, 5]); // Mon, Wed, Fri
  const [scheduling, setScheduling] = useState(false);

  // Accepted coach drill notifications
  const acceptedDrillNotifs = useMemo(
    () =>
      notifications.filter(
        (n) => n.type === 'coach_drill_assigned' && n.isActed
      ),
    [notifications]
  );

  // ── Fetch recommended drills ───────────────────────────────────

  const fetchDrills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getRecommendedDrills({ limit: 8 });
      setDrills(res.recommendations ?? []);
      setReadiness(res.readiness ?? '');
    } catch (err: any) {
      setError('Could not load recommendations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDrills();
  }, [fetchDrills]);

  // ── Schedule picker handlers ───────────────────────────────────

  const openSchedulePicker = useCallback(
    (drillIds: string[]) => {
      setSelectedDrillIds(drillIds);
      setPickerVisible(true);
      if (Platform.OS !== 'web')
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    []
  );

  const toggleDay = useCallback((day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
    if (Platform.OS !== 'web')
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const adjustDate = useCallback((delta: number) => {
    setStartDate((prev) => {
      const d = new Date(prev + 'T00:00:00');
      d.setDate(d.getDate() + delta);
      // Don't go before today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (d < today) return prev;
      return d.toISOString().split('T')[0];
    });
  }, []);

  const handleSchedule = useCallback(async () => {
    if (selectedDays.length === 0) {
      Alert.alert('Select days', 'Please select at least one training day.');
      return;
    }

    setScheduling(true);
    try {
      const result = await scheduleDrills({
        drillIds: selectedDrillIds,
        startDate,
        daysPerWeek: selectedDays.length,
        selectedDays,
      });

      if (Platform.OS !== 'web')
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      setPickerVisible(false);
      Alert.alert('Added to Timeline', result.message);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not schedule drills');
    } finally {
      setScheduling(false);
    }
  }, [selectedDrillIds, startDate, selectedDays]);

  const handleAddAll = useCallback(() => {
    const ids = drills.map((d) => d.drill.id);
    openSchedulePicker(ids);
  }, [drills, openSchedulePicker]);

  // ── Formatted start date label ─────────────────────────────────

  const startDateLabel = useMemo(() => {
    const d = new Date(startDate + 'T00:00:00');
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }, [startDate]);

  // ── Render ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={s.centerWrap}>
        <ActivityIndicator color={colors.accent1} size="large" />
        <Text style={s.loadingText}>Loading your drills...</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.lg }}>
      {/* ═══════ Section A — AI Recommendations ═══════ */}
      <View style={{ gap: spacing.md }}>
        <View style={s.sectionHeader}>
          <View>
            <Text style={s.sectionTitle}>Recommended for You</Text>
            {readiness ? (
              <Text style={s.sectionSub}>
                Based on your{' '}
                <Text style={{ color: readiness === 'GREEN' ? '#2ECC71' : readiness === 'YELLOW' ? '#F7B731' : '#FF3B30' }}>
                  {readiness}
                </Text>{' '}
                readiness
              </Text>
            ) : null}
          </View>
          {drills.length > 0 && (
            <Pressable style={s.addAllBtn} onPress={handleAddAll}>
              <Ionicons name="calendar-outline" size={14} color={colors.accent1} />
              <Text style={s.addAllText}>Schedule All</Text>
            </Pressable>
          )}
        </View>

        {error ? (
          <View style={s.errorCard}>
            <Ionicons name="alert-circle" size={20} color={colors.readinessRed} />
            <Text style={s.errorText}>{error}</Text>
            <Pressable onPress={fetchDrills}>
              <Text style={s.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : drills.length === 0 ? (
          <View style={s.emptyCard}>
            <Ionicons name="barbell-outline" size={32} color={colors.textInactive} />
            <Text style={s.emptyText}>
              No drill recommendations yet. Complete a check-in and some tests to
              unlock personalized drills.
            </Text>
          </View>
        ) : (
          drills.map((rec, i) => (
            <DrillCard
              key={rec.drill.id}
              rec={rec}
              index={i}
              colors={colors}
              s={s}
              onSchedule={() => openSchedulePicker([rec.drill.id])}
            />
          ))
        )}
      </View>

      {/* ═══════ Section B — Coach Assigned Drills ═══════ */}
      {(pendingDrillNotifs.length > 0 || acceptedDrillNotifs.length > 0) && (
        <View style={{ gap: spacing.md }}>
          <Text style={s.sectionTitle}>From Your Coach</Text>

          {pendingDrillNotifs.map((notif) => (
            <DrillNotificationCard
              key={notif.id}
              notification={notif}
              onActed={refreshNotifs}
              colors={colors}
            />
          ))}

          {acceptedDrillNotifs.map((notif) => (
            <DrillNotificationCard
              key={notif.id}
              notification={notif}
              onActed={refreshNotifs}
              colors={colors}
            />
          ))}
        </View>
      )}

      {/* ═══════ Schedule Picker Modal ═══════ */}
      <Modal
        visible={pickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerVisible(false)}
      >
        <Pressable style={s.modalOverlay} onPress={() => setPickerVisible(false)}>
          <Pressable style={s.modalSheet} onPress={() => {}}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Add to Schedule</Text>
            <Text style={s.modalSub}>
              {selectedDrillIds.length} drill{selectedDrillIds.length > 1 ? 's' : ''} will
              be distributed across your selected days
            </Text>

            {/* Start date */}
            <View style={s.dateRow}>
              <Text style={s.dateLabel}>Start Date</Text>
              <View style={s.datePicker}>
                <Pressable onPress={() => adjustDate(-1)} hitSlop={8}>
                  <Ionicons name="chevron-back" size={18} color={colors.textOnDark} />
                </Pressable>
                <Text style={s.dateValue}>{startDateLabel}</Text>
                <Pressable onPress={() => adjustDate(1)} hitSlop={8}>
                  <Ionicons name="chevron-forward" size={18} color={colors.textOnDark} />
                </Pressable>
              </View>
            </View>

            {/* Day of week selector */}
            <Text style={s.daysLabel}>Training Days</Text>
            <View style={s.dayRow}>
              {DAY_LABELS.map((label, i) => {
                const isSelected = selectedDays.includes(i);
                return (
                  <Pressable
                    key={label}
                    style={[s.dayPill, isSelected && s.dayPillActive]}
                    onPress={() => toggleDay(i)}
                  >
                    <Text
                      style={[
                        s.dayPillText,
                        isSelected && s.dayPillTextActive,
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={s.daysSummary}>
              {selectedDays.length} day{selectedDays.length !== 1 ? 's' : ''} per week
            </Text>

            {/* CTA */}
            <Pressable
              style={[s.scheduleCta, scheduling && { opacity: 0.6 }]}
              onPress={handleSchedule}
              disabled={scheduling}
            >
              {scheduling ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <>
                  <Ionicons name="calendar" size={18} color="#FFF" />
                  <Text style={s.scheduleCtaText}>Add to Timeline</Text>
                </>
              )}
            </Pressable>

            <Pressable
              style={s.cancelBtn}
              onPress={() => setPickerVisible(false)}
            >
              <Text style={s.cancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── DrillCard sub-component ──────────────────────────────────────

function DrillCard({
  rec,
  index,
  colors,
  s,
  onSchedule,
}: {
  rec: RecommendedDrill;
  index: number;
  colors: ThemeColors;
  s: ReturnType<typeof createStyles>;
  onSchedule: () => void;
}) {
  const { drill, reason } = rec;
  const catColor = CAT_COLORS[drill.category] ?? '#6B6B6B';
  const catLabel = CAT_LABELS[drill.category] ?? drill.category;
  const intColor = INTENSITY_COLORS[drill.intensity] ?? '#B0B0B0';

  return (
    <View style={[s.drillCard, { borderLeftColor: catColor }]}>
      {/* Header row */}
      <View style={s.drillHeader}>
        <View style={[s.catPill, { backgroundColor: catColor + '18' }]}>
          <Text style={[s.catPillText, { color: catColor }]}>{catLabel}</Text>
        </View>
        <View style={[s.intensityPill, { backgroundColor: intColor + '18' }]}>
          <Text style={[s.intensityText, { color: intColor }]}>
            {drill.intensity}
          </Text>
        </View>
        <Text style={s.durationText}>{drill.duration_minutes}min</Text>
      </View>

      {/* Name */}
      <Text style={s.drillName}>{drill.name}</Text>

      {/* Description */}
      {drill.description ? (
        <Text style={s.drillDesc} numberOfLines={2}>
          {drill.description}
        </Text>
      ) : null}

      {/* Reason tag */}
      <View style={s.reasonRow}>
        <Ionicons name="sparkles" size={12} color={colors.accent1} />
        <Text style={s.reasonText}>{reason}</Text>
      </View>

      {/* Equipment tags */}
      {drill.equipment && drill.equipment.length > 0 && (
        <View style={s.tagRow}>
          {drill.equipment.slice(0, 3).map((eq, i) => (
            <View key={i} style={s.equipTag}>
              <Text style={s.equipTagText}>{eq.name}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Action */}
      <Pressable style={s.addBtn} onPress={onSchedule}>
        <Ionicons name="add-circle-outline" size={16} color="#FFF" />
        <Text style={s.addBtnText}>Add to Schedule</Text>
      </Pressable>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    centerWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
      gap: spacing.md,
    },
    loadingText: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      color: colors.textInactive,
    },

    // Section header
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    sectionTitle: {
      fontFamily: fontFamily.bold,
      fontSize: 18,
      color: colors.textOnDark,
    },
    sectionSub: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textInactive,
      marginTop: 2,
    },
    addAllBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.accent1 + '14',
      borderWidth: 0.5,
      borderColor: colors.accent1 + '40',
      borderRadius: borderRadius.full,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    addAllText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 12,
      color: colors.accent1,
    },

    // Error / empty
    errorCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.backgroundElevated,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
    },
    errorText: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textInactive,
      flex: 1,
    },
    retryText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 13,
      color: colors.accent1,
    },
    emptyCard: {
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.backgroundElevated,
      borderRadius: borderRadius.lg,
      padding: spacing.xl,
    },
    emptyText: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textInactive,
      textAlign: 'center',
      lineHeight: 20,
    },

    // Drill card
    drillCard: {
      backgroundColor: colors.backgroundElevated,
      borderRadius: 12,
      borderLeftWidth: 3,
      padding: 14,
      gap: 8,
    },
    drillHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    catPill: {
      borderRadius: 4,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    catPillText: {
      fontSize: 10,
      fontFamily: fontFamily.bold,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    intensityPill: {
      borderRadius: 4,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    intensityText: {
      fontSize: 10,
      fontFamily: fontFamily.semiBold,
    },
    durationText: {
      fontSize: 11,
      fontFamily: fontFamily.regular,
      color: colors.textInactive,
      marginLeft: 'auto',
    },
    drillName: {
      fontFamily: fontFamily.bold,
      fontSize: 15,
      color: colors.textOnDark,
    },
    drillDesc: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textInactive,
      lineHeight: 18,
    },
    reasonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    reasonText: {
      fontFamily: fontFamily.medium,
      fontSize: 11,
      color: colors.accent1,
    },
    tagRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
    },
    equipTag: {
      backgroundColor: 'rgba(255,255,255,0.06)',
      borderRadius: 4,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    equipTagText: {
      fontFamily: fontFamily.regular,
      fontSize: 10,
      color: colors.textInactive,
    },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.accent1,
      borderRadius: 8,
      paddingVertical: 10,
      marginTop: 4,
    },
    addBtnText: {
      fontFamily: fontFamily.bold,
      fontSize: 13,
      color: '#FFF',
    },

    // Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: colors.backgroundElevated,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 24,
      paddingBottom: Platform.OS === 'ios' ? 44 : 24,
      gap: 16,
    },
    modalHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: 'rgba(255,255,255,0.15)',
      alignSelf: 'center',
      marginBottom: 4,
    },
    modalTitle: {
      fontFamily: fontFamily.bold,
      fontSize: 20,
      color: colors.textOnDark,
    },
    modalSub: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textInactive,
      marginTop: -8,
    },

    // Date picker
    dateRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    dateLabel: {
      fontFamily: fontFamily.semiBold,
      fontSize: 14,
      color: colors.textOnDark,
    },
    datePicker: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    dateValue: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
      color: colors.accent1,
      minWidth: 110,
      textAlign: 'center',
    },

    // Day pills
    daysLabel: {
      fontFamily: fontFamily.semiBold,
      fontSize: 14,
      color: colors.textOnDark,
    },
    dayRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 6,
    },
    dayPill: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: 'rgba(255,255,255,0.06)',
      borderWidth: 1,
      borderColor: 'transparent',
    },
    dayPillActive: {
      backgroundColor: colors.accent1 + '20',
      borderColor: colors.accent1,
    },
    dayPillText: {
      fontFamily: fontFamily.medium,
      fontSize: 12,
      color: colors.textInactive,
    },
    dayPillTextActive: {
      color: colors.accent1,
      fontFamily: fontFamily.bold,
    },
    daysSummary: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textInactive,
      textAlign: 'center',
    },

    // CTA
    scheduleCta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.accent1,
      borderRadius: 12,
      paddingVertical: 14,
    },
    scheduleCtaText: {
      fontFamily: fontFamily.bold,
      fontSize: 15,
      color: '#FFF',
    },
    cancelBtn: {
      alignItems: 'center',
      paddingVertical: 8,
    },
    cancelText: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
      color: colors.textInactive,
    },
  });
}
