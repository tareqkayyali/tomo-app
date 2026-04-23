/**
 * Parent Education Progress Screen — P4.3 (2026-04-18)
 *
 * Parent-facing progress surface focused on education + school/athletic
 * balance. Renders parent-safe labels only (no raw ACWR / HRV / PHV).
 * Visible to both Guardian and Supporter modes — the label vocabulary
 * is identical for both.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Loader } from '../../components/Loader';

import { useTheme } from '../../hooks/useTheme';
import { PlayerScreen } from '../../components/tomo-ui/playerDesign';
import { spacing, borderRadius, fontFamily } from '../../theme';
import {
  getParentEducationProgress,
  type ParentEducationProgressResponse,
} from '../../services/api';
import { SmartIcon } from '../../components/SmartIcon';
import type { ParentStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ParentStackParamList, 'ParentEducationProgress'>;

export function ParentEducationProgressScreen({ route, navigation }: Props) {
  const { childId, childName } = route.params;
  const { colors } = useTheme();
  const [data, setData] = useState<ParentEducationProgressResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh: boolean) => {
    try {
      if (!isRefresh) setLoading(true);
      setError(null);
      const res = await getParentEducationProgress(childId);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [childId]);

  useEffect(() => {
    load(false);
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const loadColor =
    data?.load.color === 'green' ? '#2ECC71' :
    data?.load.color === 'amber' ? '#F5A623' :
    data?.load.color === 'red' ? '#E74C3C' :
    colors.textSecondary;

  return (
    <PlayerScreen
      label="EDUCATION"
      title="Progress"
      caption={`${childName} · this week at school and in training.`}
      onBack={() => navigation.goBack()}
      contentStyle={styles.scroll}
      scrollProps={{ refreshControl: <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> }}
    >
        {loading && !refreshing && (
          <Loader size="lg" style={{ marginTop: 32 }} />
        )}

        {error && !loading && (
          <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.cardLight }]}>
            <Text style={{ color: colors.textSecondary }}>{error}</Text>
          </View>
        )}

        {data && !loading && (
          <>
            {/* Load label card — the hero signal for parents */}
            <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.cardLight }]}>
              <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>
                Balance right now
              </Text>
              <View style={styles.loadRow}>
                <View style={[styles.loadDot, { backgroundColor: loadColor }]} />
                <Text style={[styles.loadLabel, { color: colors.textPrimary }]}>
                  {data.load.label}
                </Text>
              </View>
              <Text style={[styles.loadHint, { color: colors.textSecondary }]}>
                {data.load.hint}
              </Text>
            </View>

            {/* Next exam card */}
            {data.nextExam && (
              <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.cardLight }]}>
                <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>Next exam</Text>
                <Text style={[styles.examSubject, { color: colors.textPrimary }]}>
                  {data.nextExam.subject}
                </Text>
                <Text style={[styles.examCountdown, { color: loadColor }]}>
                  {data.nextExam.daysUntil === 0
                    ? 'today'
                    : data.nextExam.daysUntil === 1
                      ? 'tomorrow'
                      : `in ${data.nextExam.daysUntil} days`}
                </Text>
              </View>
            )}

            {/* Week summary */}
            {data.week && (
              <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.cardLight }]}>
                <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>This week</Text>
                <View style={styles.weekGrid}>
                  <WeekStat label="Training" value={data.week.trainingSessions} unit="sessions" colors={colors} />
                  <WeekStat label="Study" value={data.week.studySessions} unit="blocks" colors={colors} />
                  <WeekStat label="Check-ins" value={data.week.checkIns} unit="days" colors={colors} />
                </View>
              </View>
            )}

            {/* Digest bullets */}
            {data.digest.length > 0 && (
              <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.cardLight }]}>
                <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>Highlights</Text>
                {data.digest.map((b, i) => (
                  <View key={i} style={styles.digestRow}>
                    <SmartIcon
                      name={iconFor(b.icon)}
                      size={14}
                      color={colors.accent1}
                    />
                    <Text style={[styles.digestText, { color: colors.textPrimary }]}>
                      {b.text}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Empty state */}
            {data.digest.length === 0 && !data.nextExam && !data.week && (
              <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.cardLight }]}>
                <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>
                  No activity yet this week. Check back soon.
                </Text>
              </View>
            )}
          </>
        )}
    </PlayerScreen>
  );
}

function iconFor(icon: string): string {
  switch (icon) {
    case 'streak':
      return 'flame-outline';
    case 'training':
      return 'barbell-outline';
    case 'study':
      return 'book-outline';
    case 'wellness':
      return 'heart-outline';
    case 'milestone':
      return 'flag-outline';
    default:
      return 'star-outline';
  }
}

function WeekStat({
  label,
  value,
  unit,
  colors,
}: {
  label: string;
  value: number;
  unit: string;
  colors: { textPrimary: string; textSecondary: string };
}) {
  return (
    <View style={styles.weekStat}>
      <Text style={[styles.weekStatValue, { color: colors.textPrimary }]}>{value}</Text>
      <Text style={[styles.weekStatLabel, { color: colors.textSecondary }]}>
        {label} · {unit}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerArea: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    fontFamily: fontFamily.semiBold,
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  scroll: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  card: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 0.5,
  },
  cardLabel: {
    fontSize: 11,
    fontFamily: fontFamily.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  loadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  loadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  loadLabel: {
    fontSize: 22,
    fontFamily: fontFamily.semiBold,
    fontWeight: '700',
  },
  loadHint: {
    fontSize: 13,
    lineHeight: 18,
  },
  examSubject: {
    fontSize: 20,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
  },
  examCountdown: {
    fontSize: 14,
    fontFamily: fontFamily.medium,
    marginTop: 2,
  },
  weekGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  weekStat: {
    alignItems: 'center',
  },
  weekStatValue: {
    fontSize: 24,
    fontFamily: fontFamily.semiBold,
    fontWeight: '700',
  },
  weekStatLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  digestRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 6,
  },
  digestText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
});
