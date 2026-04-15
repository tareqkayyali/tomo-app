/**
 * Event Edit Screen — Full-page event editor
 *
 * Opens when tapping the pencil icon on a calendar event block.
 * Editable: title, date, start/end time, intensity, notes.
 * Type badge is display-only (non-editable).
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
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
import { SmartIcon } from '../components/SmartIcon';
import * as Haptics from 'expo-haptics';
import {
  spacing,
  borderRadius,
  layout,
  fontFamily,
} from '../theme';
import { useTheme } from '../hooks/useTheme';
import { emitRefresh } from '../utils/refreshBus';
import type { ThemeColors } from '../theme/colors';
import {
  updateCalendarEvent,
  deleteCalendarEvent,
  getJournalForEvent,
  searchPrograms,
  getEventLinkedPrograms,
  linkProgramToEvent,
  unlinkProgramFromEvent,
} from '../services/api';
import type { JournalEntry, ProgramSearchResult, EventLinkedProgram } from '../services/api';
import { JournalSheet } from '../components/journal/JournalSheet';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { MainStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EventEditScreenProps = {
  navigation: NativeStackNavigationProp<MainStackParamList, 'EventEdit'>;
  route: RouteProp<MainStackParamList, 'EventEdit'>;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

const TYPE_CONFIG: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  training: { label: 'Training', icon: 'barbell-outline', color: colors.accent },
  match: { label: 'Match', icon: 'trophy-outline', color: colors.info },
  study_block: { label: 'Study', icon: 'book-outline', color: colors.info },
  exam: { label: 'Exam', icon: 'document-text-outline', color: colors.warning },
  recovery: { label: 'Recovery', icon: 'leaf-outline', color: colors.accent },
  other: { label: 'Other', icon: 'ellipsis-horizontal', color: colors.textDisabled },
};

const INTENSITY_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'light', label: 'Light' },
  { key: 'medium', label: 'Medium' },
  { key: 'hard', label: 'Hard' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime12h(time24: string): string {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function formatDateDisplay(dateStr: string): string {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  if (dateStr === today) return 'Today';
  if (dateStr === tomorrow) return 'Tomorrow';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

function computeDurationLabel(start: string, end: string): string {
  if (!start || !end) return '';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) return '';
  if (mins < 60) return `(${mins} min)`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `(${hrs}h ${rem}m)` : `(${hrs}h)`;
}

function getDateOptions(): Array<{ value: string; label: string }> {
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i - 7); // 7 days back, 22 days forward
    const val = d.toISOString().split('T')[0];
    return { value: val, label: formatDateDisplay(val) };
  });
}

// ---------------------------------------------------------------------------
// Time Picker Modal (reused pattern from AddEventScreen)
// ---------------------------------------------------------------------------

function TimePickerModal({
  visible,
  title,
  initialTime,
  onSelect,
  onClose,
  colors,
}: {
  visible: boolean;
  title: string;
  initialTime: string;
  onSelect: (time: string) => void;
  onClose: () => void;
  colors: ThemeColors;
}) {
  const [h, m] = (initialTime || '09:00').split(':');
  const [hour, setHour] = useState(h || '09');
  const [minute, setMinute] = useState(m || '00');
  const ms = useMemo(() => createModalStyles(colors), [colors]);

  // Reset when opened
  useEffect(() => {
    if (visible && initialTime) {
      const [ih, im] = initialTime.split(':');
      setHour(ih || '09');
      setMinute(im || '00');
    }
  }, [visible, initialTime]);

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

export function EventEditScreen({ navigation, route }: EventEditScreenProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const ms = useMemo(() => createModalStyles(colors), [colors]);

  const params = route.params;
  const typeConf = TYPE_CONFIG[params.type] || TYPE_CONFIG.other;

  // ── Editable state ──
  const [name, setName] = useState(params.name);
  const [date, setDate] = useState(params.date);
  const [startTime, setStartTime] = useState(params.startTime);
  const [endTime, setEndTime] = useState(params.endTime);
  const [notes, setNotes] = useState(params.notes || '');
  const [intensity, setIntensity] = useState(params.intensity || 'medium');
  const [saving, setSaving] = useState(false);

  // ── Picker visibility ──
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const dateOptions = useMemo(() => getDateOptions(), []);
  const durationLabel = useMemo(
    () => computeDurationLabel(startTime, endTime),
    [startTime, endTime],
  );

  const showIntensity = params.type === 'training' || params.type === 'match';

  // ── Journal ──
  const [journal, setJournal] = useState<JournalEntry | null>(null);
  const [journalSheetOpen, setJournalSheetOpen] = useState(false);
  const isJournalEligible = ['training', 'match', 'recovery'].includes(params.type);

  useEffect(() => {
    if (!isJournalEligible) return;
    getJournalForEvent(params.eventId).then(({ journal: j }) => setJournal(j)).catch(() => {});
  }, [params.eventId, isJournalEligible]);

  // ── Linked Programs (server-backed via event_linked_programs) ──
  // Every link/unlink is a durable op — no "Save" needed. The Save button
  // only applies to event fields (name/date/time/notes/intensity).
  const [linkedPrograms, setLinkedPrograms] = useState<EventLinkedProgram[]>([]);
  const [showProgramSearch, setShowProgramSearch] = useState(false);
  const [programSearchQuery, setProgramSearchQuery] = useState('');
  const [programSearchResults, setProgramSearchResults] = useState<ProgramSearchResult[]>([]);
  const [programSearchLoading, setProgramSearchLoading] = useState(false);

  // Fetch linked programs from the event-scoped endpoint. If the screen was
  // opened with `params.linkedPrograms` preloaded (from a calendar GET that
  // already ran attachLinkedPrograms), seed state from it so the first render
  // isn't empty — then reconcile with the server.
  useEffect(() => {
    const preload = (params as any).linkedPrograms;
    if (Array.isArray(preload) && preload.length > 0) {
      setLinkedPrograms(preload as EventLinkedProgram[]);
    }
    getEventLinkedPrograms(params.eventId)
      .then(({ linkedPrograms: fresh }) => setLinkedPrograms(fresh || []))
      .catch((e) => console.warn('[EventEdit] getEventLinkedPrograms failed:', e));
  }, [params.eventId]);

  const handleUnlinkProgram = useCallback(async (programId: string) => {
    // Optimistic remove, rollback on failure.
    const snapshot = linkedPrograms;
    setLinkedPrograms(prev => prev.filter(lp => lp.programId !== programId));
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await unlinkProgramFromEvent(params.eventId, programId);
      emitRefresh('calendar');
    } catch (e) {
      console.warn('[EventEdit] unlinkProgram failed:', e);
      setLinkedPrograms(snapshot);
      if (Platform.OS === 'web') {
        window.alert('Could not unlink program. Please try again.');
      } else {
        Alert.alert('Error', 'Could not unlink program. Please try again.');
      }
    }
  }, [linkedPrograms, params.eventId]);

  const handleLinkProgram = useCallback(async (program: ProgramSearchResult) => {
    if (linkedPrograms.some(lp => lp.programId === program.id)) return;

    // Optimistic add. We only have a subset of EventLinkedProgram fields
    // from the search result — fill the rest with zero/default values and
    // reconcile with the server response once it comes back.
    const optimistic: EventLinkedProgram = {
      id: `optimistic-${program.id}`,
      programId: program.id,
      name: program.name,
      category: program.category || '',
      type: '',
      description: '',
      durationMinutes: 0,
      durationWeeks: (program as any).duration_weeks || 0,
      difficulty: '',
      tags: [],
      linkedAt: new Date().toISOString(),
      linkedBy: 'user',
    };
    setLinkedPrograms(prev => [...prev, optimistic]);
    setShowProgramSearch(false);
    setProgramSearchQuery('');
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await linkProgramToEvent(params.eventId, program.id, 'user');
      // Refetch the canonical list so the row has the real join id + any
      // fields the server enriched (category/type/description etc.).
      const { linkedPrograms: fresh } = await getEventLinkedPrograms(params.eventId);
      setLinkedPrograms(fresh || []);
      emitRefresh('calendar');
    } catch (e) {
      console.warn('[EventEdit] linkProgram failed:', e);
      setLinkedPrograms(prev => prev.filter(lp => lp.programId !== program.id));
      if (Platform.OS === 'web') {
        window.alert('Could not link program. Please try again.');
      } else {
        Alert.alert('Error', 'Could not link program. Please try again.');
      }
    }
  }, [linkedPrograms, params.eventId]);

  // Debounced program search
  useEffect(() => {
    if (!showProgramSearch) return;
    const timer = setTimeout(async () => {
      setProgramSearchLoading(true);
      try {
        const { programs } = await searchPrograms(programSearchQuery || undefined);
        setProgramSearchResults(programs ?? []);
      } catch { setProgramSearchResults([]); }
      finally { setProgramSearchLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [programSearchQuery, showProgramSearch]);

  // ── Handlers ──

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      // Build patch — only include changed fields
      const patch: Record<string, string | undefined> = {};
      if (name !== params.name) patch.name = name;
      if (date !== params.date) patch.date = date;
      if (startTime !== params.startTime) patch.startTime = startTime;
      if (endTime !== params.endTime) patch.endTime = endTime;
      if (notes !== (params.notes || '')) patch.notes = notes;
      if (intensity !== (params.intensity || 'medium')) patch.intensity = intensity;

      // Only call API if there are actual event field changes.
      // Linked programs are persisted immediately via handleLinkProgram /
      // handleUnlinkProgram — no batching through Save anymore.
      if (Object.keys(patch).length > 0) {
        await updateCalendarEvent(params.eventId, patch);
      }
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      emitRefresh('calendar');
      emitRefresh('notifications');
      navigation.goBack();
    } catch (e: any) {
      const msg = e?.message || 'Unknown error';
      console.error('[EventEdit] Save failed:', msg, e);
      if (Platform.OS === 'web') {
        window.alert('Could not save changes: ' + msg);
      } else {
        Alert.alert('Error', 'Could not save changes. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }, [saving, params, name, date, startTime, endTime, notes, intensity, navigation]);

  const handleDelete = useCallback(async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (Platform.OS === 'web') {
      if (window.confirm(`Remove "${name}"?`)) {
        try {
          await deleteCalendarEvent(params.eventId);
          emitRefresh('calendar');
          emitRefresh('notifications');
          navigation.goBack();
        } catch {
          window.alert('Could not delete event.');
        }
      }
    } else {
      Alert.alert('Delete Event', `Remove "${name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCalendarEvent(params.eventId);
              emitRefresh('calendar');
              emitRefresh('notifications');
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              navigation.goBack();
            } catch {
              Alert.alert('Error', 'Could not delete event.');
            }
          },
        },
      ]);
    }
  }, [name, params.eventId, navigation]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* ─── Header ─── */}
        <View style={styles.header}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={12}
            style={styles.headerBack}
          >
            <SmartIcon name="chevron-back" size={24} color={colors.textOnDark} />
          </Pressable>
          <Text style={styles.headerTitle}>Edit Event</Text>
          <Pressable onPress={handleDelete} hitSlop={12}>
            <SmartIcon name="trash-outline" size={22} color={colors.error} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ═══ Type Badge (non-editable) ═══ */}
          <View style={[styles.typeBadge, { backgroundColor: typeConf.color + '20' }]}>
            <SmartIcon name={typeConf.icon} size={16} color={typeConf.color} />
            <Text style={[styles.typeBadgeText, { color: typeConf.color }]}>
              {typeConf.label}
            </Text>
          </View>

          {/* ═══ Title Input ═══ */}
          <View style={styles.group}>
            <Text style={styles.groupLabel}>Title</Text>
            <TextInput
              style={styles.titleInput}
              value={name}
              onChangeText={setName}
              placeholder="Event name"
              placeholderTextColor={colors.textInactive}
              returnKeyType="done"
            />
          </View>

          {/* ═══ Date & Time ═══ */}
          <View style={styles.group}>
            {/* Date row */}
            <Pressable
              style={styles.settingRow}
              onPress={() => setShowDatePicker(true)}
            >
              <View style={styles.settingIconRow}>
                <SmartIcon name="calendar-outline" size={18} color={colors.accent1} />
                <Text style={styles.settingLabel}>Date</Text>
              </View>
              <View style={styles.settingValueWrap}>
                <Text style={styles.settingValue}>{formatDateDisplay(date)}</Text>
                <SmartIcon name="chevron-forward" size={16} color={colors.textInactive} />
              </View>
            </Pressable>

            <View style={styles.groupDivider} />

            {/* Start time row */}
            <Pressable
              style={styles.settingRow}
              onPress={() => setShowStartPicker(true)}
            >
              <View style={styles.settingIconRow}>
                <SmartIcon name="time-outline" size={18} color={colors.accent1} />
                <Text style={styles.settingLabel}>Starts</Text>
              </View>
              <View style={styles.settingValueWrap}>
                <Text style={styles.settingValue}>{formatTime12h(startTime)}</Text>
                <SmartIcon name="chevron-forward" size={16} color={colors.textInactive} />
              </View>
            </Pressable>

            <View style={styles.groupDivider} />

            {/* End time row */}
            <Pressable
              style={styles.settingRow}
              onPress={() => setShowEndPicker(true)}
            >
              <View style={styles.settingIconRow}>
                <SmartIcon name="time-outline" size={18} color={colors.accent2} />
                <Text style={styles.settingLabel}>Ends</Text>
              </View>
              <View style={styles.settingValueWrap}>
                <Text style={styles.settingValue}>{formatTime12h(endTime)}</Text>
                {durationLabel ? (
                  <Text style={styles.durationLabel}>{durationLabel}</Text>
                ) : null}
                <SmartIcon name="chevron-forward" size={16} color={colors.textInactive} />
              </View>
            </Pressable>
          </View>

          {/* ═══ Intensity (training/match only) ═══ */}
          {showIntensity && (
            <View style={styles.group}>
              <Text style={styles.groupLabel}>Intensity</Text>
              <View style={styles.intensityRow}>
                {INTENSITY_OPTIONS.map((opt) => {
                  const active = intensity === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => {
                        setIntensity(opt.key);
                        if (Platform.OS !== 'web') {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }
                      }}
                      style={[
                        styles.intensityPill,
                        active && styles.intensityPillActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.intensityPillText,
                          active && styles.intensityPillTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* ═══ Notes ═══ */}
          <View style={styles.group}>
            <Text style={styles.groupLabel}>Notes</Text>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add notes..."
              placeholderTextColor={colors.textInactive}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />
          </View>

          {/* ═══ Session Plan (read-only, built by Tomo) ═══ */}
          {params.type === 'training' && (params as any).sessionPlan?.drills?.length > 0 && (
            <View style={styles.group}>
              <Text style={styles.groupLabel}>
                Session Plan{(params as any).sessionPlan?.focus ? ` — ${(params as any).sessionPlan.focus}` : ''}
              </Text>
              {((params as any).sessionPlan.drills as any[]).map((d, idx) => {
                const intensityLabel = d.intensity ? String(d.intensity).toLowerCase() : null;
                const intensityColor =
                  intensityLabel === 'hard' ? colors.error :
                  intensityLabel === 'moderate' || intensityLabel === 'medium' ? colors.warning :
                  intensityLabel === 'light' ? colors.success :
                  colors.textMuted;
                return (
                  <View
                    key={`${d.name}-${idx}`}
                    style={[styles.linkedProgramRow, { backgroundColor: colors.glass }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.linkedProgramName, { color: colors.textOnDark }]}>
                        {d.name}
                      </Text>
                      {(d.category || d.description) && (
                        <Text
                          style={{ fontSize: 11, fontFamily: fontFamily.regular, color: colors.textMuted }}
                          numberOfLines={2}
                        >
                          {d.description || d.category}
                        </Text>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {typeof d.durationMin === 'number' && (
                        <Text style={{ fontSize: 12, fontFamily: fontFamily.medium, color: colors.textMuted }}>
                          {d.durationMin}m
                        </Text>
                      )}
                      {intensityLabel && (
                        <View
                          style={{
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            borderRadius: 10,
                            backgroundColor: intensityColor + '22',
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 10,
                              fontFamily: fontFamily.semiBold,
                              color: intensityColor,
                              textTransform: 'uppercase',
                            }}
                          >
                            {intensityLabel}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* ═══ Linked Programs ═══ */}
          {params.type === 'training' && (
            <View style={styles.group}>
              <Text style={styles.groupLabel}>Linked Programs</Text>
              {linkedPrograms.length > 0 && linkedPrograms.map((lp: any) => (
                <View key={lp.programId} style={[styles.linkedProgramRow, { backgroundColor: colors.glass }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.linkedProgramName, { color: colors.textOnDark }]}>{lp.name}</Text>
                    {lp.category && (
                      <Text style={{ fontSize: 11, fontFamily: fontFamily.regular, color: colors.textMuted }}>{lp.category}</Text>
                    )}
                  </View>
                  <Pressable
                    onPress={() => {
                      if (Platform.OS === 'web') {
                        if (window.confirm(`Unlink "${lp.name}" from this training?`)) {
                          handleUnlinkProgram(lp.programId);
                        }
                      } else {
                        Alert.alert('Unlink Program', `Remove "${lp.name}" from this training?`, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Unlink', style: 'destructive', onPress: () => handleUnlinkProgram(lp.programId) },
                        ]);
                      }
                    }}
                    hitSlop={8}
                    style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
                  >
                    <SmartIcon name="close-circle" size={22} color={colors.error} />
                  </Pressable>
                </View>
              ))}
              <Pressable
                onPress={() => setShowProgramSearch(true)}
                style={({ pressed }) => [
                  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <SmartIcon name="add-circle-outline" size={18} color={colors.accent2} />
                <Text style={{ fontFamily: fontFamily.medium, fontSize: 14, color: colors.accent2 }}>
                  Link Program
                </Text>
              </Pressable>
            </View>
          )}

          {/* ═══ Journal ═══ */}
          {isJournalEligible && (
            <View style={styles.group}>
              <Text style={styles.groupLabel}>Training Journal</Text>
              {journal?.pre_target ? (
                <View style={{ gap: 8 }}>
                  <View style={{ backgroundColor: colors.glass, borderRadius: borderRadius.sm, padding: spacing.sm }}>
                    <Text style={{ fontFamily: fontFamily.medium, fontSize: 12, color: colors.textMuted, marginBottom: 2 }}>Target</Text>
                    <Text style={{ fontFamily: fontFamily.regular, fontSize: 14, color: colors.textOnDark }}>{journal.pre_target}</Text>
                  </View>
                  {journal?.post_reflection && (
                    <View style={{ backgroundColor: colors.glass, borderRadius: borderRadius.sm, padding: spacing.sm }}>
                      <Text style={{ fontFamily: fontFamily.medium, fontSize: 12, color: colors.textMuted, marginBottom: 2 }}>
                        Reflection — {journal.post_outcome === 'hit_it' ? 'Hit it' : journal.post_outcome === 'exceeded' ? 'Exceeded' : 'Fell short'}
                      </Text>
                      <Text style={{ fontFamily: fontFamily.regular, fontSize: 14, color: colors.textOnDark }}>{journal.post_reflection}</Text>
                    </View>
                  )}
                  {journal?.ai_insight && (
                    <View style={{ flexDirection: 'row', gap: 6, backgroundColor: colors.accent2 + '10', borderRadius: borderRadius.sm, padding: spacing.sm }}>
                      <SmartIcon name="sparkles-outline" size={14} color={colors.accent2} />
                      <Text style={{ fontFamily: fontFamily.regular, fontSize: 13, color: colors.textMuted, flex: 1 }}>{journal.ai_insight}</Text>
                    </View>
                  )}
                </View>
              ) : (
                <Text style={{ fontFamily: fontFamily.regular, fontSize: 13, color: colors.textMuted }}>
                  No journal entry yet.
                </Text>
              )}
              <Pressable
                onPress={() => setJournalSheetOpen(true)}
                style={({ pressed }) => [
                  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <SmartIcon name="book-outline" size={16} color={colors.accent2} />
                <Text style={{ fontFamily: fontFamily.medium, fontSize: 14, color: colors.accent2 }}>
                  {journal?.pre_target ? 'Edit Journal' : 'Add Journal Entry'}
                </Text>
              </Pressable>
            </View>
          )}

          {/* ═══ Save Button ═══ */}
          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={({ pressed }) => [
              styles.saveButton,
              saving && styles.saveButtonDisabled,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.saveButtonText}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Text>
          </Pressable>
        </ScrollView>

        {/* ─── Time Picker Modals ─── */}
        <TimePickerModal
          visible={showStartPicker}
          title="Start Time"
          initialTime={startTime}
          onSelect={setStartTime}
          onClose={() => setShowStartPicker(false)}
          colors={colors}
        />
        <TimePickerModal
          visible={showEndPicker}
          title="End Time"
          initialTime={endTime}
          onSelect={setEndTime}
          onClose={() => setShowEndPicker(false)}
          colors={colors}
        />

        {/* Date picker modal */}
        <Modal visible={showDatePicker} transparent animationType="slide">
          <Pressable style={ms.overlay} onPress={() => setShowDatePicker(false)}>
            <Pressable style={ms.sheet} onPress={(e) => e.stopPropagation()}>
              <Text style={ms.title}>Select Date</Text>
              <FlatList
                data={dateOptions}
                keyExtractor={(item) => item.value}
                style={{ maxHeight: 350 }}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => {
                      setDate(item.value);
                      setShowDatePicker(false);
                      if (Platform.OS !== 'web') {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }
                    }}
                    style={[ms.dateOption, item.value === date && ms.dateOptionActive]}
                  >
                    <Text style={[ms.dateOptionLabel, item.value === date && ms.dateOptionLabelActive]}>
                      {item.label}
                    </Text>
                    <Text style={ms.dateOptionValue}>{item.value}</Text>
                    {item.value === date && (
                      <SmartIcon name="checkmark" size={18} color={colors.accent1} />
                    )}
                  </Pressable>
                )}
              />
            </Pressable>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>

      {/* Program Search Modal */}
      <Modal visible={showProgramSearch} transparent animationType="slide">
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }} onPress={() => setShowProgramSearch(false)}>
          <Pressable
            style={{ backgroundColor: colors.backgroundElevated, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 8, paddingBottom: 32, paddingHorizontal: spacing.lg, maxHeight: '65%' }}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Handle bar */}
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.textMuted + '40', alignSelf: 'center', marginBottom: 12 }} />

            <Text style={{ fontFamily: fontFamily.bold, fontSize: 16, color: colors.textOnDark, marginBottom: 12 }}>
              Link a Program
            </Text>

            {/* Search input */}
            <TextInput
              style={{
                backgroundColor: colors.inputBackground,
                borderRadius: borderRadius.sm,
                padding: spacing.sm,
                color: colors.textPrimary,
                fontFamily: fontFamily.regular,
                fontSize: 14,
                marginBottom: 12,
              }}
              placeholder="Search programs..."
              placeholderTextColor={colors.textInactive}
              value={programSearchQuery}
              onChangeText={setProgramSearchQuery}
              autoFocus
            />

            {/* Results */}
            <FlatList
              data={programSearchResults}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const alreadyLinked = linkedPrograms.some(lp => lp.programId === item.id);
                return (
                  <Pressable
                    onPress={() => !alreadyLinked && handleLinkProgram(item)}
                    style={({ pressed }) => [{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 10,
                      paddingHorizontal: 8,
                      borderRadius: borderRadius.sm,
                      backgroundColor: pressed && !alreadyLinked ? colors.glass : 'transparent',
                      opacity: alreadyLinked ? 0.4 : 1,
                    }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: fontFamily.medium, fontSize: 14, color: colors.textOnDark }}>
                        {item.name}
                      </Text>
                      <Text style={{ fontFamily: fontFamily.regular, fontSize: 12, color: colors.textMuted }}>
                        {item.category}{item.duration_weeks ? ` · ${item.duration_weeks}w` : ''}
                      </Text>
                    </View>
                    {alreadyLinked ? (
                      <SmartIcon name="checkmark-circle" size={20} color={colors.accent} />
                    ) : (
                      <SmartIcon name="add-circle-outline" size={20} color={colors.accent2} />
                    )}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <Text style={{ fontFamily: fontFamily.regular, fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingVertical: 20 }}>
                  {programSearchLoading ? 'Searching...' : 'No programs found'}
                </Text>
              }
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Journal Sheet */}
      {isJournalEligible && (
        <JournalSheet
          visible={journalSheetOpen}
          event={{
            id: params.eventId,
            userId: '',
            name: params.name,
            type: params.type as any,
            sport: 'general' as any,
            date: params.date,
            startTime: params.startTime,
            endTime: params.endTime,
            intensity: (params.intensity || null) as any,
            notes: params.notes || '',
            createdAt: '',
          }}
          onClose={() => {
            setJournalSheetOpen(false);
            // Reload journal data
            getJournalForEvent(params.eventId).then(({ journal: j }) => setJournal(j)).catch(() => {});
          }}
        />
      )}
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
    headerBack: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerTitle: {
      fontFamily: fontFamily.semiBold,
      fontSize: 17,
      color: colors.textOnDark,
    },

    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: layout.screenMargin,
      paddingTop: spacing.lg,
      paddingBottom: spacing.huge,
    },

    typeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderRadius: 20,
      marginBottom: spacing.lg,
    },
    typeBadgeText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 13,
      letterSpacing: 0.3,
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
    linkedProgramRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      borderRadius: borderRadius.md,
      marginBottom: 6,
    },
    linkedProgramName: {
      fontFamily: fontFamily.semiBold,
      fontSize: 14,
    },
    groupDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.glassBorder,
      marginVertical: 10,
      marginHorizontal: -16,
      marginLeft: 0,
    },

    titleInput: {
      fontFamily: fontFamily.semiBold,
      fontSize: 20,
      color: colors.textOnDark,
      paddingVertical: 4,
    },

    settingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 4,
      minHeight: 36,
    },
    settingIconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    settingLabel: {
      fontFamily: fontFamily.regular,
      fontSize: 16,
      color: colors.textOnDark,
    },
    settingValueWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    settingValue: {
      fontFamily: fontFamily.regular,
      fontSize: 16,
      color: colors.accent1,
    },
    durationLabel: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textMuted,
    },

    intensityRow: {
      flexDirection: 'row',
      gap: 8,
    },
    intensityPill: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      backgroundColor: colors.glass,
    },
    intensityPillActive: {
      backgroundColor: colors.accent1,
      borderColor: colors.accent1,
    },
    intensityPillText: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
      color: colors.textMuted,
    },
    intensityPillTextActive: {
      color: colors.textPrimary,
      fontFamily: fontFamily.semiBold,
    },

    notesInput: {
      fontFamily: fontFamily.regular,
      fontSize: 16,
      color: colors.textOnDark,
      minHeight: 100,
      paddingVertical: 4,
    },

    saveButton: {
      backgroundColor: colors.accent1,
      borderRadius: 16,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: spacing.md,
    },
    saveButtonDisabled: {
      opacity: 0.45,
    },
    saveButtonText: {
      fontFamily: fontFamily.bold,
      fontSize: 17,
      color: colors.textPrimary,
      letterSpacing: 0.5,
    },
  });
}

// ---------------------------------------------------------------------------
// Modal Styles Factory (matches AddEventScreen pattern)
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
