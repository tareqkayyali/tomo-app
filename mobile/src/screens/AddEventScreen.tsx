/**
 * Add Event Screen — Simplified block creation
 *
 * Fields: type (required), date, time, duration, notes (optional)
 * Title auto-generated from type. No sport or intensity selectors.
 * When opened from grid slot tap: time + 1hr duration auto-filled, just pick type.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  FlatList,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  spacing,
  borderRadius,
  layout,
  fontFamily,
} from '../theme';
import { useTheme } from '../hooks/useTheme';
import type { ThemeColors } from '../theme/colors';
import { createCalendarEvent, getCalendarEventsByDate } from '../services/api';
import {
  suggestBestTimes,
  minutesToTime,
  DEFAULT_CONFIG,
} from '../services/schedulingEngine';
import type { ScheduleEvent } from '../services/schedulingEngine';
import { SlotPill } from '../components/calendar/SlotPill';
import { useScheduleRules } from '../hooks/useScheduleRules';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { MainStackParamList } from '../navigation/types';
import type { CalendarEvent } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AddEventScreenProps = {
  navigation: NativeStackNavigationProp<MainStackParamList, 'AddEvent'>;
  route: RouteProp<MainStackParamList, 'AddEvent'>;
};

type EventType = 'training' | 'match' | 'recovery' | 'study_block' | 'exam' | 'other';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EVENT_TYPES: Array<{
  key: EventType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { key: 'training', label: 'Training', icon: 'barbell-outline' },
  { key: 'match', label: 'Match', icon: 'trophy-outline' },
  { key: 'study_block', label: 'Study', icon: 'book-outline' },
  { key: 'exam', label: 'Exam', icon: 'document-text-outline' },
  { key: 'recovery', label: 'Recovery', icon: 'leaf-outline' },
  { key: 'other', label: 'Other', icon: 'ellipsis-horizontal' },
];

/** Auto-generated name from event type */
const TYPE_NAMES: Record<EventType, string> = {
  training: 'Training',
  match: 'Match',
  study_block: 'Study Block',
  exam: 'Exam',
  recovery: 'Recovery',
  other: 'Other',
};

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

const DURATION_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '1 hour' },
  { value: 90, label: '1.5 hours' },
  { value: 120, label: '2 hours' },
  { value: 150, label: '2.5 hours' },
  { value: 180, label: '3 hours' },
];

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const totalMin = h * 60 + m + minutes;
  const newH = Math.floor(totalMin / 60) % 24;
  const newM = totalMin % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function getDateStr(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

function formatDateDisplay(dateStr: string): string {
  const today = getTodayStr();
  const tomorrow = getDateStr(1);
  if (dateStr === today) return 'Today';
  if (dateStr === tomorrow) return 'Tomorrow';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime12h(time24: string): string {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function getDateOptions(): Array<{ value: string; label: string }> {
  return Array.from({ length: 14 }, (_, i) => {
    const val = getDateStr(i);
    return { value: val, label: formatDateDisplay(val) };
  });
}

// ---------------------------------------------------------------------------
// Time Picker Modal
// ---------------------------------------------------------------------------

function TimePickerModal({
  visible,
  title,
  onSelect,
  onClose,
  colors,
}: {
  visible: boolean;
  title: string;
  onSelect: (time: string) => void;
  onClose: () => void;
  colors: ThemeColors;
}) {
  const [hour, setHour] = useState('09');
  const [minute, setMinute] = useState('00');
  const ms = useMemo(() => createModalStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable style={ms.overlay} onPress={onClose}>
        <Pressable style={ms.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={ms.title}>{title}</Text>

          <View style={ms.pickerRow}>
            <View style={ms.pickerCol}>
              <Text style={ms.pickerLabel}>Hour</Text>
              <FlatList
                data={HOURS}
                keyExtractor={(item) => item}
                style={ms.list}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => setHour(item)}
                    style={[ms.option, item === hour && ms.optionActive]}
                  >
                    <Text style={[ms.optionText, item === hour && ms.optionTextActive]}>
                      {item}
                    </Text>
                  </Pressable>
                )}
              />
            </View>

            <Text style={ms.colon}>:</Text>

            <View style={ms.pickerCol}>
              <Text style={ms.pickerLabel}>Min</Text>
              <FlatList
                data={MINUTES}
                keyExtractor={(item) => item}
                style={ms.list}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => setMinute(item)}
                    style={[ms.option, item === minute && ms.optionActive]}
                  >
                    <Text style={[ms.optionText, item === minute && ms.optionTextActive]}>
                      {item}
                    </Text>
                  </Pressable>
                )}
              />
            </View>
          </View>

          <View style={ms.actions}>
            <Pressable onPress={onClose} style={ms.cancelBtn}>
              <Text style={ms.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                onSelect(`${hour}:${minute}`);
                onClose();
              }}
              style={ms.confirmBtn}
            >
              <Text style={ms.confirmText}>Set</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AddEventScreen({ navigation, route }: AddEventScreenProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { rules } = useScheduleRules();

  const params = route.params as { initialType?: string; date?: string; startTime?: string } | undefined;
  const hasStartTime = !!(params?.startTime);

  const validInitialType = params?.initialType && ['training', 'match', 'recovery', 'study_block', 'exam', 'other'].includes(params.initialType)
    ? (params.initialType as EventType)
    : 'training';

  const [eventType, setEventType] = useState<EventType>(validInitialType);
  const [date, setDate] = useState(params?.date || getTodayStr());
  const [startTime, setStartTime] = useState(params?.startTime || '');
  // Auto-set 1hr duration when opened from a grid slot
  const [duration, setDuration] = useState<number | null>(hasStartTime ? 60 : null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showDurationPicker, setShowDurationPicker] = useState(false);

  const dateOptions = useMemo(() => getDateOptions(), []);
  const ms = useMemo(() => createModalStyles(colors), [colors]);

  // ─── Best Time Suggestions ───
  const [dayEvents, setDayEvents] = useState<CalendarEvent[]>([]);
  const [selectedSlotIdx, setSelectedSlotIdx] = useState<number | null>(null);

  // Fetch day events when date changes
  useEffect(() => {
    let cancelled = false;
    getCalendarEventsByDate(date)
      .then((res) => { if (!cancelled) setDayEvents(res.events); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [date]);

  // Map to ScheduleEvent shape for the engine
  const scheduleEvents = useMemo((): ScheduleEvent[] =>
    dayEvents
      .filter((e) => e.startTime && e.endTime)
      .map((e) => ({
        id: e.id,
        name: e.name,
        startTime: e.startTime,
        endTime: e.endTime,
        type: e.type,
        intensity: e.intensity,
      })),
    [dayEvents]
  );

  // Compute top 3 suggestions when type + duration are both set
  const bestTimeSuggestions = useMemo(() => {
    if (!duration) return [];
    const dow = new Date(date + 'T00:00:00').getDay();
    return suggestBestTimes(eventType, duration, scheduleEvents, null, DEFAULT_CONFIG, dow, 3);
  }, [eventType, duration, scheduleEvents, date]);

  const handleSlotPress = useCallback((idx: number) => {
    const slot = bestTimeSuggestions[idx];
    if (!slot) return;
    setStartTime(minutesToTime(slot.startMin));
    setSelectedSlotIdx(idx);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [bestTimeSuggestions]);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    try {
      const computedEndTime = (startTime && duration)
        ? addMinutesToTime(startTime, duration)
        : undefined;

      // Auto-inject linked program names for training events
      let autoNotes = notes.trim();
      if (eventType === 'training' && rules?.preferences?.training_categories) {
        // Collect linked programs from all enabled training categories
        const allLinked = rules.preferences.training_categories
          .filter((cat) => cat.enabled && cat.linkedPrograms?.length)
          .flatMap((cat) => cat.linkedPrograms!);
        if (allLinked.length > 0) {
          // Deduplicate by programId
          const seen = new Set<string>();
          const unique = allLinked.filter((p) => {
            if (seen.has(p.programId)) return false;
            seen.add(p.programId);
            return true;
          });
          const programNames = unique.map((p) => p.name).join(', ');
          autoNotes = autoNotes
            ? `${autoNotes}\n📋 Programs: ${programNames}`
            : `📋 Programs: ${programNames}`;
        }
      }

      await createCalendarEvent({
        name: TYPE_NAMES[eventType],
        type: eventType,
        sport: 'general',
        date,
        startTime: startTime || undefined,
        endTime: computedEndTime,
        notes: autoNotes || undefined,
      });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    } catch {
      if (Platform.OS === 'web') {
        window.alert('Could not create event. Please try again.');
      } else {
        Alert.alert('Error', 'Could not create event. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }, [eventType, date, startTime, duration, notes, navigation, rules]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* ─── Header ─── */}
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={styles.headerCancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>New Block</Text>
          <Pressable
            onPress={handleSubmit}
            disabled={submitting}
            hitSlop={12}
          >
            <Text
              style={[
                styles.headerAdd,
                submitting && styles.headerAddDisabled,
              ]}
            >
              Add
            </Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ═══ Group 1: Type (required) ═══ */}
          <View style={styles.group}>
            <Text style={styles.groupLabel}>Type</Text>
            <View style={styles.chipRow}>
              {EVENT_TYPES.map((t) => {
                const active = eventType === t.key;
                return (
                  <Pressable
                    key={t.key}
                    onPress={() => {
                      setEventType(t.key);
                      setSelectedSlotIdx(null);
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Ionicons
                      name={t.icon}
                      size={15}
                      color={active ? colors.textPrimary : colors.textMuted}
                    />
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {t.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* ═══ Best Time Suggestions ═══ */}
          {bestTimeSuggestions.length > 0 && (
            <View style={styles.bestTimeSection}>
              <Text style={styles.bestTimeLabel}>Best Times</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.bestTimeRow}
              >
                {bestTimeSuggestions.map((slot, idx) => (
                  <SlotPill
                    key={`${slot.startMin}-${slot.endMin}`}
                    startMin={slot.startMin}
                    endMin={slot.endMin}
                    score={slot.score}
                    reason={slot.reason}
                    isBest={idx === 0}
                    selected={selectedSlotIdx === idx}
                    onPress={() => handleSlotPress(idx)}
                    colors={colors}
                  />
                ))}
              </ScrollView>
            </View>
          )}

          {/* ═══ Group 2: Date & Time & Duration ═══ */}
          <View style={styles.group}>
            {/* Date row */}
            <Pressable
              style={styles.settingRow}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={styles.settingLabel}>Date</Text>
              <View style={styles.settingValueWrap}>
                <Text style={styles.settingValue}>{formatDateDisplay(date)}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textInactive} />
              </View>
            </Pressable>

            <View style={styles.groupDivider} />

            {/* Start time row */}
            <Pressable
              style={styles.settingRow}
              onPress={() => setShowStartTimePicker(true)}
            >
              <Text style={styles.settingLabel}>Starts</Text>
              <View style={styles.settingValueWrap}>
                <Text style={[styles.settingValue, !startTime && styles.settingPlaceholder]}>
                  {startTime ? formatTime12h(startTime) : 'None'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textInactive} />
              </View>
            </Pressable>

            <View style={styles.groupDivider} />

            {/* Duration row */}
            <Pressable
              style={styles.settingRow}
              onPress={() => setShowDurationPicker(true)}
            >
              <Text style={styles.settingLabel}>Duration</Text>
              <View style={styles.settingValueWrap}>
                <Text style={[styles.settingValue, !duration && styles.settingPlaceholder]}>
                  {duration ? DURATION_OPTIONS.find(d => d.value === duration)?.label || `${duration} min` : 'None'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textInactive} />
              </View>
            </Pressable>
          </View>

          {/* ═══ Group 3: Notes (optional) ═══ */}
          <View style={styles.group}>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Notes (optional)"
              placeholderTextColor={colors.textInactive}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>
        </ScrollView>

        {/* ─── Modals ─── */}
        <TimePickerModal
          visible={showStartTimePicker}
          title="Start Time"
          onSelect={setStartTime}
          onClose={() => setShowStartTimePicker(false)}
          colors={colors}
        />

        {/* Duration picker modal */}
        <Modal visible={showDurationPicker} transparent animationType="slide">
          <Pressable style={ms.overlay} onPress={() => setShowDurationPicker(false)}>
            <Pressable style={ms.sheet} onPress={(e) => e.stopPropagation()}>
              <Text style={ms.title}>Duration</Text>
              <FlatList
                data={DURATION_OPTIONS}
                keyExtractor={(item) => String(item.value)}
                style={{ maxHeight: 300 }}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => {
                      setDuration(item.value);
                      setSelectedSlotIdx(null);
                      setShowDurationPicker(false);
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    style={[ms.dateOption, item.value === duration && ms.dateOptionActive]}
                  >
                    <Text style={[ms.dateOptionLabel, item.value === duration && ms.dateOptionLabelActive]}>
                      {item.label}
                    </Text>
                    {item.value === duration && (
                      <Ionicons name="checkmark" size={18} color={colors.accent1} />
                    )}
                  </Pressable>
                )}
              />
            </Pressable>
          </Pressable>
        </Modal>

        {/* Date picker modal */}
        <Modal visible={showDatePicker} transparent animationType="slide">
          <Pressable style={ms.overlay} onPress={() => setShowDatePicker(false)}>
            <Pressable style={ms.sheet} onPress={(e) => e.stopPropagation()}>
              <Text style={ms.title}>Select Date</Text>
              <FlatList
                data={dateOptions}
                keyExtractor={(item) => item.value}
                style={{ maxHeight: 300 }}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => {
                      setDate(item.value);
                      setShowDatePicker(false);
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    style={[ms.dateOption, item.value === date && ms.dateOptionActive]}
                  >
                    <Text style={[ms.dateOptionLabel, item.value === date && ms.dateOptionLabelActive]}>
                      {item.label}
                    </Text>
                    <Text style={ms.dateOptionValue}>{item.value}</Text>
                    {item.value === date && (
                      <Ionicons name="checkmark" size={18} color={colors.accent1} />
                    )}
                  </Pressable>
                )}
              />
            </Pressable>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles Factory
// ---------------------------------------------------------------------------

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: layout.screenMargin,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.glassBorder,
    },
    headerCancel: {
      fontFamily: fontFamily.regular,
      fontSize: 17,
      color: colors.accent1,
    },
    headerTitle: {
      fontFamily: fontFamily.semiBold,
      fontSize: 17,
      color: colors.textOnDark,
    },
    headerAdd: {
      fontFamily: fontFamily.semiBold,
      fontSize: 17,
      color: colors.accent1,
    },
    headerAddDisabled: {
      opacity: 0.35,
    },

    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: layout.screenMargin,
      paddingTop: spacing.lg,
      paddingBottom: spacing.huge,
    },

    group: {
      backgroundColor: colors.backgroundElevated,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginBottom: spacing.md,
    },
    groupLabel: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
      color: colors.textMuted,
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    groupDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.glassBorder,
      marginVertical: 10,
      marginHorizontal: -16,
      marginLeft: 0,
    },

    settingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 4,
      minHeight: 36,
    },
    settingLabel: {
      fontFamily: fontFamily.regular,
      fontSize: 16,
      color: colors.textOnDark,
    },
    settingValueWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    settingValue: {
      fontFamily: fontFamily.regular,
      fontSize: 16,
      color: colors.accent1,
    },
    settingPlaceholder: {
      color: colors.textInactive,
    },

    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      backgroundColor: colors.glass,
    },
    chipActive: {
      backgroundColor: colors.accent1,
      borderColor: colors.accent1,
    },
    chipText: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
      color: colors.textMuted,
    },
    chipTextActive: {
      color: colors.textPrimary,
    },

    notesInput: {
      fontFamily: fontFamily.regular,
      fontSize: 16,
      color: colors.textOnDark,
      minHeight: 80,
      paddingVertical: 4,
    },

    bestTimeSection: {
      marginBottom: spacing.md,
    },
    bestTimeLabel: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
      marginBottom: 8,
    },
    bestTimeRow: {
      flexDirection: 'row',
      gap: 8,
    },
  });
}

// ---------------------------------------------------------------------------
// Modal Styles Factory
// ---------------------------------------------------------------------------

function createModalStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.backgroundElevated,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingTop: spacing.lg,
      paddingBottom: spacing.huge,
      paddingHorizontal: layout.screenMargin,
      maxHeight: '55%',
    },
    title: {
      fontFamily: fontFamily.semiBold,
      fontSize: 17,
      color: colors.textOnDark,
      textAlign: 'center',
      marginBottom: spacing.lg,
    },
    pickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      marginBottom: spacing.lg,
    },
    pickerCol: {
      alignItems: 'center',
      width: 80,
    },
    pickerLabel: {
      fontFamily: fontFamily.medium,
      fontSize: 12,
      color: colors.textMuted,
      marginBottom: spacing.sm,
    },
    list: {
      maxHeight: 200,
    },
    option: {
      paddingVertical: 8,
      paddingHorizontal: spacing.md,
      borderRadius: 10,
      alignItems: 'center',
      marginBottom: 2,
    },
    optionActive: {
      backgroundColor: colors.accent1 + '20',
    },
    optionText: {
      fontFamily: fontFamily.medium,
      fontSize: 18,
      color: colors.textMuted,
    },
    optionTextActive: {
      color: colors.accent1,
      fontFamily: fontFamily.bold,
    },
    colon: {
      fontFamily: fontFamily.bold,
      fontSize: 28,
      color: colors.textOnDark,
      marginTop: 20,
    },
    actions: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    cancelBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: colors.glass,
      alignItems: 'center',
    },
    cancelText: {
      fontFamily: fontFamily.medium,
      fontSize: 16,
      color: colors.textMuted,
    },
    confirmBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: colors.accent1,
      alignItems: 'center',
    },
    confirmText: {
      fontFamily: fontFamily.bold,
      fontSize: 16,
      color: colors.textPrimary,
    },
    dateOption: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: spacing.md,
      borderRadius: 10,
      marginBottom: 2,
    },
    dateOptionActive: {
      backgroundColor: colors.accent1 + '15',
    },
    dateOptionLabel: {
      fontFamily: fontFamily.medium,
      fontSize: 16,
      color: colors.textOnDark,
      flex: 1,
    },
    dateOptionLabelActive: {
      color: colors.accent1,
      fontFamily: fontFamily.bold,
    },
    dateOptionValue: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textMuted,
      marginRight: spacing.sm,
    },
  });
}
