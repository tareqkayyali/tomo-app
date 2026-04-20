/**
 * Historical Data Screen (Profile > Historical Data)
 *
 * One screen, three cards — lets the athlete add pre-Tomo context so AI
 * coaching treats `users.created_at` as "day 1 on Tomo" rather than "day 1
 * of training." Data flows into contextBuilder.historicalData and surfaces
 * in every agent's dynamic prompt tagged "self-reported, confidence: medium."
 *
 *   1. "When you started"  → users.training_started_at + training_history_note
 *   2. "Past test results" → phone_test_sessions (source='historical_self_reported')
 *   3. "Past injuries"     → athlete_injury_history
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Button, Card } from '../components';
import { SmartIcon } from '../components/SmartIcon';
import { spacing, borderRadius, fontFamily } from '../theme';
import type { ThemeColors } from '../theme/colors';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import {
  getHistory,
  addHistoricalInjury,
  deleteHistoricalInjury,
  logTestResult,
  updateUser,
} from '../services/api';
import type {
  HistoricalDataResponse,
  HistoricalInjury,
  HistoricalTestEntry,
} from '../types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<MainStackParamList, 'HistoricalData'>;
};

// Narrow catalog athletes will actually recognize without a trip to Output.
// Maps athlete-facing label → testType id expected by /api/v1/tests/my-results.
const TEST_CATALOG: Array<{ id: string; label: string; unit: string }> = [
  { id: '10m-sprint', label: '10m sprint', unit: 's' },
  { id: '20m-sprint', label: '20m sprint', unit: 's' },
  { id: '30m-sprint', label: '30m sprint', unit: 's' },
  { id: 'cmj', label: 'Countermovement jump', unit: 'cm' },
  { id: 'broad-jump', label: 'Broad jump', unit: 'cm' },
  { id: 'vertical-jump', label: 'Vertical jump', unit: 'cm' },
  { id: '5-0-5', label: '5-0-5 agility', unit: 's' },
  { id: 't-test', label: 'T-test agility', unit: 's' },
  { id: 'yoyo-ir1', label: 'Yo-Yo IR1', unit: 'ml/kg/min' },
  { id: 'beep-test', label: 'Beep test', unit: 'ml/kg/min' },
  { id: 'cooper-12min', label: 'Cooper 12-min', unit: 'm' },
  { id: '1rm-squat', label: '1RM squat', unit: 'kg' },
  { id: '1rm-bench', label: '1RM bench', unit: 'kg' },
  { id: 'grip-strength', label: 'Grip strength', unit: 'kg' },
];

const BODY_AREAS = [
  'hamstring', 'quadriceps', 'calf', 'knee', 'ankle',
  'groin', 'hip', 'lower back', 'shoulder', 'wrist', 'other',
] as const;

const SEVERITIES: Array<'minor' | 'moderate' | 'severe'> = ['minor', 'moderate', 'severe'];

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function confirmAsync(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

function showError(message: string) {
  if (Platform.OS === 'web') {
    window.alert(message);
  } else {
    Alert.alert('Error', message);
  }
}

export function HistoricalDataScreen({ navigation: _nav }: Props) {
  const { colors, typography } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { refreshProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<HistoricalDataResponse | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getHistory();
      setData(res);
    } catch (err) {
      showError((err as Error).message ?? 'Could not load historical data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !data) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.accent1} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.intro, { ...typography.bodySmall, color: colors.textSecondary }]}>
        Tell Tomo what happened before you joined. This makes coaching more
        accurate from day one. Everything here is self-reported and treated as
        directional context — not as current benchmarks.
      </Text>

      <WhenYouStartedCard
        trainingStartedAt={data.trainingStartedAt}
        trainingHistoryNote={data.trainingHistoryNote}
        onSaved={async () => {
          await load();
          await refreshProfile();
        }}
      />

      <PastTestsCard
        tests={data.historicalTests}
        onAdded={load}
      />

      <PastInjuriesCard
        injuries={data.injuries}
        onChanged={load}
      />
    </ScrollView>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Card 1: When you started
// ───────────────────────────────────────────────────────────────────────

function WhenYouStartedCard({
  trainingStartedAt,
  trainingHistoryNote,
  onSaved,
}: {
  trainingStartedAt: string | null;
  trainingHistoryNote: string | null;
  onSaved: () => Promise<void>;
}) {
  const { colors, typography } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const initialDate = trainingStartedAt
    ? new Date(`${trainingStartedAt}T12:00:00`)
    : null;
  const [date, setDate] = useState<Date | null>(initialDate);
  const [showPicker, setShowPicker] = useState(false);
  const [note, setNote] = useState(trainingHistoryNote ?? '');
  const [saving, setSaving] = useState(false);

  const handleDateChange = useCallback((event: unknown, selected?: Date) => {
    if (Platform.OS !== 'ios') setShowPicker(false);
    if (selected) setDate(selected);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await updateUser({
        trainingStartedAt: date ? toYMD(date) : null,
        trainingHistoryNote: note.trim() ? note.trim() : null,
      } as Parameters<typeof updateUser>[0]);
      await onSaved();
    } catch (err) {
      showError((err as Error).message ?? 'Could not save');
    } finally {
      setSaving(false);
    }
  }, [date, note, onSaved]);

  return (
    <Card style={styles.card}>
      <Text style={[styles.cardTitle, { ...typography.h4, color: colors.textOnDark }]}>
        When you started
      </Text>
      <Text style={[styles.cardHelp, { ...typography.bodySmall, color: colors.textSecondary }]}>
        Roughly when did you start training seriously for sport? This sets your
        real training age (years training), not your Tomo-join date.
      </Text>

      <Text style={[styles.fieldLabel, { color: colors.textOnDark }]}>Start date</Text>
      <Pressable style={styles.datePressable} onPress={() => setShowPicker(true)}>
        <SmartIcon name="calendar-outline" size={18} color={colors.textSecondary} />
        <Text style={[styles.dateText, { color: date ? colors.textOnDark : colors.textInactive }]}>
          {date
            ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
            : 'Select start date'}
        </Text>
      </Pressable>
      {showPicker && (
        <DateTimePicker
          value={date ?? new Date(2018, 0, 1)}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDateChange}
          maximumDate={new Date()}
          minimumDate={new Date(1990, 0, 1)}
          themeVariant="dark"
        />
      )}

      <Text style={[styles.fieldLabel, { color: colors.textOnDark, marginTop: spacing.md }]}>
        Note (optional, max 280 chars)
      </Text>
      <TextInput
        style={[styles.textArea, { color: colors.textOnDark, borderColor: colors.border }]}
        placeholder="e.g. academy from age 8, futsal before that"
        placeholderTextColor={colors.textInactive}
        value={note}
        onChangeText={(t) => setNote(t.slice(0, 280))}
        multiline
        numberOfLines={3}
      />
      <Text style={[styles.charCount, { color: colors.textInactive }]}>
        {note.length}/280
      </Text>

      <Button
        title={saving ? 'Saving…' : 'Save'}
        onPress={handleSave}
        disabled={saving}
        variant="primary"
        style={{ marginTop: spacing.md }}
      />
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Card 2: Past test results
// ───────────────────────────────────────────────────────────────────────

function PastTestsCard({
  tests,
  onAdded,
}: {
  tests: HistoricalTestEntry[];
  onAdded: () => Promise<void>;
}) {
  const { colors, typography } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [addOpen, setAddOpen] = useState(false);

  const [testId, setTestId] = useState<string | null>(null);
  const [score, setScore] = useState('');
  const [date, setDate] = useState<Date>(new Date(Date.now() - 86400000)); // yesterday
  const [showPicker, setShowPicker] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setTestId(null);
    setScore('');
    setDate(new Date(Date.now() - 86400000));
    setNotes('');
    setAddOpen(false);
  };

  const handleSave = async () => {
    if (!testId) {
      showError('Pick a test');
      return;
    }
    const numScore = parseFloat(score);
    if (!Number.isFinite(numScore)) {
      showError('Score must be a number');
      return;
    }
    const catalog = TEST_CATALOG.find((t) => t.id === testId);
    const todayStr = toYMD(new Date());
    const dateStr = toYMD(date);
    if (dateStr >= todayStr) {
      showError('Historical test date must be in the past');
      return;
    }
    setSaving(true);
    try {
      await logTestResult({
        testType: testId,
        score: numScore,
        unit: catalog?.unit,
        date: dateStr,
        notes: notes.trim() || undefined,
        source: 'historical_self_reported',
      });
      reset();
      await onAdded();
    } catch (err) {
      showError((err as Error).message ?? 'Could not save test');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={styles.card}>
      <Text style={[styles.cardTitle, { ...typography.h4, color: colors.textOnDark }]}>
        Past test results
      </Text>
      <Text style={[styles.cardHelp, { ...typography.bodySmall, color: colors.textSecondary }]}>
        Scores from before Tomo. Helps the AI see your trajectory. These never
        replace Tomo-tracked tests — they just add context.
      </Text>

      {tests.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.textInactive }]}>
          No past tests added yet.
        </Text>
      ) : (
        <View style={styles.list}>
          {tests.map((t) => {
            const label = TEST_CATALOG.find((c) => c.id === t.testType)?.label ?? t.testType;
            const unit = t.unit ?? TEST_CATALOG.find((c) => c.id === t.testType)?.unit ?? '';
            return (
              <View key={t.id} style={styles.listRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.listPrimary, { color: colors.textOnDark }]}>{label}</Text>
                  <Text style={[styles.listSecondary, { color: colors.textSecondary }]}>
                    {t.date}
                  </Text>
                </View>
                <Text style={[styles.listValue, { color: colors.accent1 }]}>
                  {t.score}
                  {unit ? ` ${unit}` : ''}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {!addOpen ? (
        <Button
          title="Add past test"
          onPress={() => setAddOpen(true)}
          variant="outline"
          style={{ marginTop: spacing.md }}
          icon="add"
        />
      ) : (
        <View style={styles.inlineForm}>
          <Text style={[styles.fieldLabel, { color: colors.textOnDark }]}>Test</Text>
          <View style={styles.chipRow}>
            {TEST_CATALOG.map((t) => {
              const active = testId === t.id;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setTestId(t.id)}
                  style={[
                    styles.chip,
                    {
                      borderColor: active ? colors.accent1 : colors.border,
                      backgroundColor: active ? colors.accent1 : 'transparent',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: active ? colors.textPrimary : colors.textOnDark },
                    ]}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.fieldLabel, { color: colors.textOnDark, marginTop: spacing.md }]}>
            Score{testId ? ` (${TEST_CATALOG.find((t) => t.id === testId)?.unit})` : ''}
          </Text>
          <TextInput
            style={[styles.textInput, { color: colors.textOnDark, borderColor: colors.border }]}
            keyboardType="decimal-pad"
            value={score}
            onChangeText={setScore}
            placeholder="e.g. 28"
            placeholderTextColor={colors.textInactive}
          />

          <Text style={[styles.fieldLabel, { color: colors.textOnDark, marginTop: spacing.md }]}>
            Date
          </Text>
          <Pressable style={styles.datePressable} onPress={() => setShowPicker(true)}>
            <SmartIcon name="calendar-outline" size={18} color={colors.textSecondary} />
            <Text style={[styles.dateText, { color: colors.textOnDark }]}>
              {date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            </Text>
          </Pressable>
          {showPicker && (
            <DateTimePicker
              value={date}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(_, selected) => {
                if (Platform.OS !== 'ios') setShowPicker(false);
                if (selected) setDate(selected);
              }}
              maximumDate={new Date(Date.now() - 86400000)}
              minimumDate={new Date(1990, 0, 1)}
              themeVariant="dark"
            />
          )}

          <Text style={[styles.fieldLabel, { color: colors.textOnDark, marginTop: spacing.md }]}>
            Notes (optional)
          </Text>
          <TextInput
            style={[styles.textInput, { color: colors.textOnDark, borderColor: colors.border }]}
            value={notes}
            onChangeText={(t) => setNotes(t.slice(0, 500))}
            placeholder="e.g. indoor turf, warm-up included"
            placeholderTextColor={colors.textInactive}
          />

          <View style={styles.rowButtons}>
            <Button title="Cancel" onPress={reset} variant="ghost" disabled={saving} />
            <Button
              title={saving ? 'Saving…' : 'Save test'}
              onPress={handleSave}
              variant="primary"
              disabled={saving}
            />
          </View>
        </View>
      )}
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Card 3: Past injuries
// ───────────────────────────────────────────────────────────────────────

function PastInjuriesCard({
  injuries,
  onChanged,
}: {
  injuries: HistoricalInjury[];
  onChanged: () => Promise<void>;
}) {
  const { colors, typography } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const currentYear = new Date().getFullYear();
  const [addOpen, setAddOpen] = useState(false);

  const [bodyArea, setBodyArea] = useState<string | null>(null);
  const [severity, setSeverity] = useState<'minor' | 'moderate' | 'severe'>('moderate');
  const [year, setYear] = useState<number>(currentYear - 1);
  const [weeksOut, setWeeksOut] = useState('');
  const [resolved, setResolved] = useState(true);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setBodyArea(null);
    setSeverity('moderate');
    setYear(currentYear - 1);
    setWeeksOut('');
    setResolved(true);
    setNote('');
    setAddOpen(false);
  };

  const handleAdd = async () => {
    if (!bodyArea) {
      showError('Pick a body area');
      return;
    }
    const weeksNum = weeksOut.trim() ? parseInt(weeksOut, 10) : null;
    if (weeksOut.trim() && (!Number.isFinite(weeksNum as number) || (weeksNum as number) < 0)) {
      showError('Weeks out must be a positive number');
      return;
    }
    setSaving(true);
    try {
      await addHistoricalInjury({
        bodyArea,
        severity,
        year,
        weeksOut: weeksNum,
        resolved,
        note: note.trim() || null,
      });
      reset();
      await onChanged();
    } catch (err) {
      showError((err as Error).message ?? 'Could not save injury');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (injury: HistoricalInjury) => {
    const ok = await confirmAsync(
      'Delete injury',
      `Remove ${injury.year} ${injury.bodyArea}?`,
    );
    if (!ok) return;
    try {
      await deleteHistoricalInjury(injury.id);
      await onChanged();
    } catch (err) {
      showError((err as Error).message ?? 'Could not delete');
    }
  };

  return (
    <Card style={styles.card}>
      <Text style={[styles.cardTitle, { ...typography.h4, color: colors.textOnDark }]}>
        Past injuries
      </Text>
      <Text style={[styles.cardHelp, { ...typography.bodySmall, color: colors.textSecondary }]}>
        Injuries before Tomo. The AI uses these for tone calibration and
        injury-aware programming. Doesn't affect current injury-risk flags.
      </Text>

      {injuries.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.textInactive }]}>
          No past injuries added.
        </Text>
      ) : (
        <View style={styles.list}>
          {injuries.map((inj) => (
            <View key={inj.id} style={styles.listRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.listPrimary, { color: colors.textOnDark }]}>
                  {inj.year} · {inj.bodyArea}
                </Text>
                <Text style={[styles.listSecondary, { color: colors.textSecondary }]}>
                  {inj.severity}
                  {inj.weeksOut !== null ? ` · ${inj.weeksOut}w out` : ''}
                  {inj.resolved ? ' · resolved' : ' · ongoing'}
                </Text>
              </View>
              <Pressable onPress={() => handleDelete(inj)} style={styles.deleteBtn} hitSlop={12}>
                <SmartIcon name="trash-outline" size={18} color={colors.logout} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {!addOpen ? (
        <Button
          title="Add past injury"
          onPress={() => setAddOpen(true)}
          variant="outline"
          style={{ marginTop: spacing.md }}
          icon="add"
        />
      ) : (
        <View style={styles.inlineForm}>
          <Text style={[styles.fieldLabel, { color: colors.textOnDark }]}>Body area</Text>
          <View style={styles.chipRow}>
            {BODY_AREAS.map((b) => {
              const active = bodyArea === b;
              return (
                <Pressable
                  key={b}
                  onPress={() => setBodyArea(b)}
                  style={[
                    styles.chip,
                    {
                      borderColor: active ? colors.accent1 : colors.border,
                      backgroundColor: active ? colors.accent1 : 'transparent',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: active ? colors.textPrimary : colors.textOnDark },
                    ]}
                  >
                    {b}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.fieldLabel, { color: colors.textOnDark, marginTop: spacing.md }]}>
            Severity
          </Text>
          <View style={styles.chipRow}>
            {SEVERITIES.map((s) => {
              const active = severity === s;
              return (
                <Pressable
                  key={s}
                  onPress={() => setSeverity(s)}
                  style={[
                    styles.chip,
                    {
                      borderColor: active ? colors.accent1 : colors.border,
                      backgroundColor: active ? colors.accent1 : 'transparent',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: active ? colors.textPrimary : colors.textOnDark },
                    ]}
                  >
                    {s}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.fieldLabel, { color: colors.textOnDark, marginTop: spacing.md }]}>
            Year
          </Text>
          <View style={styles.stepperRow}>
            <Pressable
              onPress={() => setYear((y) => Math.max(1990, y - 1))}
              style={styles.stepperBtn}
            >
              <SmartIcon name="remove" size={18} color={colors.textOnDark} />
            </Pressable>
            <Text style={[styles.stepperValue, { color: colors.textOnDark }]}>{year}</Text>
            <Pressable
              onPress={() => setYear((y) => Math.min(currentYear, y + 1))}
              style={styles.stepperBtn}
            >
              <SmartIcon name="add" size={18} color={colors.textOnDark} />
            </Pressable>
          </View>

          <Text style={[styles.fieldLabel, { color: colors.textOnDark, marginTop: spacing.md }]}>
            Weeks out (optional)
          </Text>
          <TextInput
            style={[styles.textInput, { color: colors.textOnDark, borderColor: colors.border }]}
            keyboardType="number-pad"
            value={weeksOut}
            onChangeText={setWeeksOut}
            placeholder="e.g. 6"
            placeholderTextColor={colors.textInactive}
          />

          <Pressable
            onPress={() => setResolved((r) => !r)}
            style={styles.toggleRow}
          >
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: colors.accent1,
                  backgroundColor: resolved ? colors.accent1 : 'transparent',
                },
              ]}
            >
              {resolved && (
                <SmartIcon name="checkmark" size={14} color={colors.textPrimary} />
              )}
            </View>
            <Text style={[styles.toggleLabel, { color: colors.textOnDark }]}>
              Fully resolved
            </Text>
          </Pressable>

          <Text style={[styles.fieldLabel, { color: colors.textOnDark, marginTop: spacing.md }]}>
            Note (optional, max 280 chars)
          </Text>
          <TextInput
            style={[styles.textArea, { color: colors.textOnDark, borderColor: colors.border }]}
            value={note}
            onChangeText={(t) => setNote(t.slice(0, 280))}
            placeholder="e.g. surgery, extended rehab"
            placeholderTextColor={colors.textInactive}
            multiline
            numberOfLines={2}
          />

          <View style={styles.rowButtons}>
            <Button title="Cancel" onPress={reset} variant="ghost" disabled={saving} />
            <Button
              title={saving ? 'Saving…' : 'Save injury'}
              onPress={handleAdd}
              variant="primary"
              disabled={saving}
            />
          </View>
        </View>
      )}
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Styles
// ───────────────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      padding: spacing.lg,
      paddingBottom: spacing.xxl,
    },
    centered: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    intro: {
      marginBottom: spacing.lg,
    },
    card: {
      marginBottom: spacing.lg,
      padding: spacing.lg,
    },
    cardTitle: {
      marginBottom: spacing.xs,
    },
    cardHelp: {
      marginBottom: spacing.md,
      lineHeight: 18,
    },
    fieldLabel: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
      marginBottom: spacing.xs,
    },
    datePressable: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: borderRadius.sm,
      padding: spacing.md,
      gap: spacing.sm,
    },
    dateText: {
      fontFamily: fontFamily.regular,
      fontSize: 15,
    },
    textInput: {
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: borderRadius.sm,
      padding: spacing.md,
      fontFamily: fontFamily.regular,
      fontSize: 15,
    },
    textArea: {
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: borderRadius.sm,
      padding: spacing.md,
      fontFamily: fontFamily.regular,
      fontSize: 15,
      minHeight: 80,
      textAlignVertical: 'top',
    },
    charCount: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      textAlign: 'right',
      marginTop: spacing.xs,
    },
    emptyText: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      fontStyle: 'italic',
      paddingVertical: spacing.sm,
    },
    list: {
      marginTop: spacing.xs,
    },
    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    listPrimary: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
    },
    listSecondary: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      marginTop: 2,
    },
    listValue: {
      fontFamily: fontFamily.bold,
      fontSize: 15,
      marginLeft: spacing.sm,
    },
    deleteBtn: {
      padding: spacing.xs,
      marginLeft: spacing.sm,
    },
    inlineForm: {
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
    },
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 16,
    },
    chipText: {
      fontFamily: fontFamily.medium,
      fontSize: 12,
    },
    stepperRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    stepperBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    stepperValue: {
      fontFamily: fontFamily.bold,
      fontSize: 17,
      minWidth: 60,
      textAlign: 'center',
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.md,
      gap: spacing.sm,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 4,
      borderWidth: 1.5,
      justifyContent: 'center',
      alignItems: 'center',
    },
    toggleLabel: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
    },
    rowButtons: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: spacing.sm,
      marginTop: spacing.lg,
    },
  });
}
