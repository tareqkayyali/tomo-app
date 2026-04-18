/**
 * WeekPlanPreviewCapsule — Step 4 of the week planner.
 *
 * Shows the generated week as a 7-day column list: per day, the
 * placed sessions in chronological order. Tap a session → inline
 * edit panel (title, date, time, duration, intensity). Submitting
 * an edit posts back `{ action: "edit_item", itemIndex, proposed }`
 * and Python re-runs /validate-edit before mutating the draft and
 * re-rendering this card.
 *
 * Tapping "Accept" sends `{ action: "accept" }` → the flow advances
 * to the confirm_card → commit bridge.
 */

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type {
  WeekPlanPreviewCapsule as WeekPlanPreviewCapsuleType,
  WeekPlanPreviewItem,
  CapsuleAction,
} from '../../../types/chat';
import { PillSelector } from './shared/PillSelector';
import { CapsuleSubmitButton } from './shared/CapsuleSubmitButton';
import { CapsuleDateChip } from './shared/CapsuleDateChip';

interface Props {
  card: WeekPlanPreviewCapsuleType;
  onSubmit: (action: CapsuleAction) => void;
}

const DURATION_PILLS = [
  { id: '30', label: '30m' },
  { id: '45', label: '45m' },
  { id: '60', label: '1h' },
  { id: '75', label: '1h15' },
  { id: '90', label: '1h30' },
  { id: '120', label: '2h' },
];

const TIME_PILLS = [
  { id: '06:00', label: '6am' },
  { id: '07:00', label: '7am' },
  { id: '08:00', label: '8am' },
  { id: '09:00', label: '9am' },
  { id: '15:00', label: '3pm' },
  { id: '16:00', label: '4pm' },
  { id: '17:00', label: '5pm' },
  { id: '18:00', label: '6pm' },
  { id: '19:00', label: '7pm' },
  { id: '20:00', label: '8pm' },
];

const INTENSITY_PILLS = [
  { id: 'LIGHT', label: 'Light' },
  { id: 'MODERATE', label: 'Moderate' },
  { id: 'HARD', label: 'Hard' },
];

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(iso: string): string {
  try {
    const d = new Date(`${iso}T12:00:00`);
    return `${DOW[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  } catch {
    return iso;
  }
}

function formatTime12h(hhmm: string): string {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  if (!Number.isFinite(h)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m ?? 0).padStart(2, '0')} ${period}`;
}

export function WeekPlanPreviewCapsuleComponent({ card, onSubmit }: Props) {
  const items = Array.isArray(card.planItems) ? card.planItems : [];
  const warnings = Array.isArray(card.warnings) ? card.warnings : [];
  const [editIndex, setEditIndex] = useState<number | null>(null);

  const byDate = useMemo(() => {
    const grouped: Record<string, Array<{ item: WeekPlanPreviewItem; index: number }>> = {};
    items.forEach((item, index) => {
      const key = item.date;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push({ item, index });
    });
    const dates = Object.keys(grouped).sort();
    return { grouped, dates };
  }, [items]);

  const summary = card.summary || {
    trainingSessions: 0,
    studySessions: 0,
    totalMinutes: 0,
    hardSessions: 0,
    predictedLoadAu: 0,
  };
  const totalH = Math.floor(summary.totalMinutes / 60);
  const totalM = summary.totalMinutes % 60;
  const hoursLabel = totalM ? `${totalH}h ${totalM}m` : `${totalH}h`;

  const handleAccept = () => {
    onSubmit({
      type: 'week_plan_preview_capsule',
      toolName: '__accept_week_plan__',
      toolInput: { action: 'accept' },
      agentType: 'timeline',
    });
  };

  if (editIndex !== null && items[editIndex]) {
    return (
      <EditPanel
        item={items[editIndex]}
        onCancel={() => setEditIndex(null)}
        onApply={(proposed) => {
          onSubmit({
            type: 'week_plan_preview_capsule',
            toolName: '__edit_week_plan_item__',
            toolInput: {
              action: 'edit_item',
              itemIndex: editIndex,
              proposed,
            },
            agentType: 'timeline',
          });
          setEditIndex(null);
        }}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Your week</Text>
        <Text style={styles.headerMeta}>
          {summary.trainingSessions} training · {summary.studySessions} study · {hoursLabel}
        </Text>
      </View>

      {warnings.length > 0 && (
        <View style={styles.warningsBlock}>
          <Text style={styles.warningsHeader}>
            Couldn&apos;t fit {warnings.length} session{warnings.length > 1 ? 's' : ''}
          </Text>
          {warnings.slice(0, 3).map((w, i) => (
            <Text key={i} style={styles.warningText}>
              • {w.message}
            </Text>
          ))}
        </View>
      )}

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} nestedScrollEnabled>
        {byDate.dates.length === 0 && (
          <Text style={styles.emptyText}>No sessions placed.</Text>
        )}
        {byDate.dates.map((date) => (
          <View key={date} style={styles.daySection}>
            <Text style={styles.dayHeader}>{formatDate(date)}</Text>
            {byDate.grouped[date].map(({ item, index }) => {
              const status = (item.status ?? 'clean') as 'clean' | 'adjusted' | 'dropped';
              const adj = Array.isArray(item.adjustments) ? item.adjustments : [];
              return (
                <Pressable
                  key={`${date}-${index}`}
                  onPress={() => setEditIndex(index)}
                  style={({ pressed }) => [
                    styles.sessionRow,
                    pressed && styles.sessionRowPressed,
                  ]}
                >
                  <View
                    style={[
                      styles.statusDot,
                      status === 'clean' && styles.statusDotClean,
                      status === 'adjusted' && styles.statusDotAdjusted,
                      status === 'dropped' && styles.statusDotDropped,
                    ]}
                  />
                  <View style={styles.sessionTimeBlock}>
                    <Text style={styles.sessionTime}>{formatTime12h(item.startTime)}</Text>
                    <Text style={styles.sessionTime}>{formatTime12h(item.endTime)}</Text>
                  </View>
                  <View style={styles.sessionBody}>
                    <Text style={styles.sessionTitle}>{item.title}</Text>
                    <Text style={styles.sessionMeta}>
                      {item.category}
                      {item.intensity ? ` · ${item.intensity}` : ''}
                      {` · ${item.durationMin}m`}
                    </Text>
                    {status === 'adjusted' && adj[0] ? (
                      <Text style={styles.adjustmentNote}>
                        {adj[0].reason}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.editHint}>Edit</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>

      <CapsuleSubmitButton title="Lock in the week" onPress={handleAccept} />
    </View>
  );
}

interface EditPanelProps {
  item: WeekPlanPreviewItem;
  onCancel: () => void;
  onApply: (proposed: {
    date: string;
    startTime: string;
    durationMin: number;
    intensity?: string;
    title?: string;
  }) => void;
}

function EditPanel({ item, onCancel, onApply }: EditPanelProps) {
  const [date, setDate] = useState(item.date);
  const [startTime, setStartTime] = useState(item.startTime);
  const [duration, setDuration] = useState(String(item.durationMin));
  const [intensity, setIntensity] = useState(item.intensity);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Edit {item.title}</Text>
        <Pressable onPress={onCancel} hitSlop={8}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>

      <Text style={styles.subLabel}>Date</Text>
      <CapsuleDateChip value={date} onChange={setDate} />

      <PillSelector
        label="Start time"
        options={TIME_PILLS}
        selected={startTime}
        onSelect={setStartTime}
      />
      <PillSelector
        label="Duration"
        options={DURATION_PILLS}
        selected={duration}
        onSelect={setDuration}
      />
      {item.eventType !== 'study' && (
        <PillSelector
          label="Intensity"
          options={INTENSITY_PILLS}
          selected={intensity}
          onSelect={(id) => setIntensity(id as typeof intensity)}
        />
      )}

      <CapsuleSubmitButton
        title="Apply edit"
        onPress={() => onApply({
          date,
          startTime,
          durationMin: parseInt(duration, 10),
          intensity: item.eventType === 'study' ? undefined : intensity,
        })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heading: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  headerMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  subLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.textInactive,
  },
  cancelText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  warningsBlock: {
    gap: 4,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    backgroundColor: colors.secondaryMuted,
    paddingHorizontal: spacing.sm,
  },
  warningsHeader: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.warning,
  },
  warningText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.warning,
  },
  list: {
    maxHeight: 440,
  },
  listContent: {
    gap: spacing.sm,
  },
  daySection: {
    gap: 4,
  },
  dayHeader: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.textInactive,
    marginTop: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotClean: {
    backgroundColor: colors.accent1,
  },
  statusDotAdjusted: {
    backgroundColor: colors.warning,
  },
  statusDotDropped: {
    backgroundColor: colors.textSecondary,
  },
  adjustmentNote: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.warning,
    marginTop: 2,
  },
  sessionRowPressed: {
    opacity: 0.7,
  },
  sessionTimeBlock: {
    width: 72,
  },
  sessionTime: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: colors.accent2,
  },
  sessionBody: {
    flex: 1,
  },
  sessionTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  sessionMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
  },
  editHint: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: colors.accent1,
  },
  emptyText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
});
