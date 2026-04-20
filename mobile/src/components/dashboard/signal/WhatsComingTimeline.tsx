/**
 * WhatsComingTimeline — the "What's Coming" vertical timeline.
 *
 * Renders up to 3 rows: next Training · next Match · next Exam, sorted by
 * date ascending. Each row is a CountdownRow with a connecting vertical line
 * between rows. Exam row is omitted gracefully when there's no upcoming exam,
 * keeping the visual rhythm intact.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { fontFamily } from '../../../theme/typography';
import { useTheme } from '../../../hooks/useTheme';
import { signalColorForKind, signalLabelForKind } from './tokens';

export type Milestone = {
  id: string;
  title: string;
  /** 'training' | 'match' | 'exam' | etc. */
  kind: string;
  startAt: string; // ISO
};

interface Props {
  milestones: Milestone[];
  onMilestonePress?: (m: Milestone) => void;
}

export function WhatsComingTimeline({ milestones, onMilestonePress }: Props) {
  const { colors } = useTheme();
  if (milestones.length === 0) return null;

  const now = new Date();

  return (
    <View>
      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
        What&apos;s coming
      </Text>
      <View>
        {milestones.map((m, i) => {
          const isFirst = i === 0;
          const isLast = i === milestones.length - 1;
          return (
            <CountdownRow
              key={m.id}
              milestone={m}
              now={now}
              isFirst={isFirst}
              isLast={isLast}
              onPress={onMilestonePress ? () => onMilestonePress(m) : undefined}
            />
          );
        })}
      </View>
    </View>
  );
}

// ── CountdownRow ────────────────────────────────────────────────────

interface RowProps {
  milestone: Milestone;
  now: Date;
  isFirst: boolean;
  isLast: boolean;
  onPress?: () => void;
}

function CountdownRow({ milestone, now, isFirst, isLast, onPress }: RowProps) {
  const { colors } = useTheme();
  const target = new Date(milestone.startAt);
  const diffMs = target.getTime() - now.getTime();
  const days = Math.floor(diffMs / 86_400_000);
  const hrs = Math.floor((diffMs % 86_400_000) / 3_600_000);

  let countdown: string;
  if (days > 1) countdown = `${days}d`;
  else if (days === 1) countdown = `1d`;
  else if (hrs > 0) countdown = `${hrs}h`;
  else if (diffMs > 0) countdown = 'soon';
  else countdown = 'now';

  const dateStr = target.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const kindColor = signalColorForKind(milestone.kind);
  const kindLabel = signalLabelForKind(milestone.kind);

  const Container = onPress ? Pressable : View;

  return (
    <Container
      onPress={onPress}
      style={({ pressed }: any) => [
        styles.row,
        { borderBottomColor: colors.borderLight },
        isLast && { borderBottomWidth: 0 },
        pressed && { opacity: 0.7 },
      ]}
    >
      {/* Column A — timeline dot + connecting lines */}
      <View style={styles.dotCol}>
        <View
          style={[
            styles.line,
            { backgroundColor: isFirst ? 'transparent' : colors.creamMuted },
          ]}
        />
        <View
          style={[
            styles.dot,
            { backgroundColor: kindColor, shadowColor: kindColor },
          ]}
        />
        <View
          style={[
            styles.line,
            { backgroundColor: isLast ? 'transparent' : colors.creamMuted },
          ]}
        />
      </View>

      {/* Column B — countdown value */}
      <View style={styles.countdownCol}>
        <Text style={[styles.countdown, { color: colors.textPrimary }]}>
          {countdown}
        </Text>
      </View>

      {/* Column C — title stack */}
      <View style={styles.titleCol}>
        <Text numberOfLines={1} style={styles.eyebrowRow}>
          <Text style={[styles.kindLabel, { color: kindColor }]}>
            {kindLabel}
          </Text>
          <Text style={[styles.dateLabel, { color: colors.textMuted }]}>
            {`  ·  ${dateStr}`}
          </Text>
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.title, { color: colors.textPrimary }]}
        >
          {milestone.title}
        </Text>
      </View>

      {/* Column D — chevron */}
      <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
    </Container>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginLeft: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    minHeight: 52,
  },
  dotCol: {
    width: 18,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  line: {
    flex: 1,
    width: 1,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  countdownCol: {
    width: 38,
    alignItems: 'flex-end',
  },
  countdown: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    letterSpacing: -0.5,
    lineHeight: 15,
  },
  titleCol: {
    flex: 1,
  },
  eyebrowRow: {
    marginBottom: 3,
  },
  kindLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 7.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  dateLabel: {
    fontFamily: fontFamily.light,
    fontSize: 8.5,
  },
  title: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    letterSpacing: -0.15,
  },
  chevron: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 16,
  },
});
