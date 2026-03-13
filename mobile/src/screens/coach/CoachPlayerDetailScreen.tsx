/**
 * Coach Player Detail Screen
 * Shows a single player's readiness timeline, recent tests, and action button.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useTheme } from '../../hooks/useTheme';
import { getPlayerReadiness, getPlayerTests } from '../../services/api';
import { spacing, borderRadius, layout } from '../../theme';
import type { CoachStackParamList } from '../../navigation/types';
import type { Suggestion } from '../../types';

type Props = NativeStackScreenProps<CoachStackParamList, 'CoachPlayerDetail'>;

interface ReadinessEntry {
  date: string;
  level?: string;
  [key: string]: unknown;
}

function dotColorForLevel(level?: string): string {
  switch (level?.toUpperCase()) {
    case 'GREEN':
      return '#30D158';
    case 'YELLOW':
      return '#F39C12';
    case 'RED':
      return '#E74C3C';
    default:
      return '#6B6B6B';
  }
}

export function CoachPlayerDetailScreen({ route, navigation }: Props) {
  const { playerId, playerName } = route.params;
  const { colors } = useTheme();

  const [readiness, setReadiness] = useState<ReadinessEntry[]>([]);
  const [tests, setTests] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [readinessRes, testsRes] = await Promise.all([
        getPlayerReadiness(playerId),
        getPlayerTests(playerId),
      ]);
      setReadiness((readinessRes.readiness as ReadinessEntry[]).slice(-14));
      setTests(testsRes.tests);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [playerId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent1} style={{ marginTop: spacing.xxl }} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Player Header */}
      <View style={[styles.headerCard, { backgroundColor: colors.surfaceElevated }]}>
        <Text style={[styles.playerName, { color: colors.textOnDark }]}>{playerName}</Text>
        <View style={styles.headerMeta}>
          <Ionicons name="football-outline" size={16} color={colors.accent1} />
          <Text style={[styles.headerMetaText, { color: colors.textMuted }]}>
            Player
          </Text>
        </View>
      </View>

      {/* Readiness Timeline */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textOnDark }]}>
          Readiness — Last 14 Days
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timelineRow}>
          {readiness.map((entry, idx) => {
            const date = new Date(entry.date);
            const dayLabel = date.toLocaleDateString('en-US', { weekday: 'narrow' });
            return (
              <View key={idx} style={styles.timelineDotCol}>
                <View
                  style={[
                    styles.timelineDot,
                    { backgroundColor: dotColorForLevel(entry.level as string | undefined) },
                  ]}
                />
                <Text style={[styles.timelineDayLabel, { color: colors.textInactive }]}>
                  {dayLabel}
                </Text>
              </View>
            );
          })}
          {readiness.length === 0 && (
            <Text style={[styles.noDataText, { color: colors.textInactive }]}>
              No readiness data yet
            </Text>
          )}
        </ScrollView>
      </View>

      {/* Recent Tests */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textOnDark }]}>Recent Tests</Text>
        {tests.length === 0 ? (
          <Text style={[styles.noDataText, { color: colors.textInactive }]}>
            No tests recorded yet
          </Text>
        ) : (
          tests.map((test) => (
            <View
              key={test.id}
              style={[styles.testCard, { backgroundColor: colors.surfaceElevated }]}
            >
              <View style={styles.testCardHeader}>
                <Text style={[styles.testTitle, { color: colors.textOnDark }]}>
                  {test.title}
                </Text>
                <Text style={[styles.testDate, { color: colors.textInactive }]}>
                  {new Date(test.created_at).toLocaleDateString()}
                </Text>
              </View>
              {test.payload?.primaryValue != null && (
                <Text style={[styles.testValue, { color: colors.accent1 }]}>
                  {String(test.payload.primaryValue)}
                  {test.payload.unit ? ` ${test.payload.unit}` : ''}
                </Text>
              )}
            </View>
          ))
        )}
      </View>

      {/* View Plan Button */}
      <Pressable
        onPress={() =>
          navigation.navigate('CoachPlayerPlan', { playerId, playerName })
        }
        style={({ pressed }) => [
          styles.submitButton,
          { backgroundColor: colors.accent1, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Ionicons name="calendar-outline" size={20} color="#FFFFFF" />
        <Text style={styles.submitButtonText}>View Plan</Text>
      </Pressable>

      {/* Submit Test Button */}
      <Pressable
        onPress={() =>
          navigation.navigate('CoachTestInput', { playerId, playerName })
        }
        style={({ pressed }) => [
          styles.submitButton,
          { backgroundColor: colors.accent1, opacity: pressed ? 0.85 : 1, marginTop: spacing.sm },
        ]}
      >
        <Ionicons name="flash-outline" size={20} color="#FFFFFF" />
        <Text style={styles.submitButtonText}>Submit Test</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: layout.screenMargin,
    paddingBottom: spacing.xxl,
  },
  headerCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  playerName: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerMetaText: {
    fontSize: 14,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.compact,
  },
  timelineRow: {
    flexDirection: 'row',
  },
  timelineDotCol: {
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginBottom: 4,
  },
  timelineDayLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
  noDataText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  testCard: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  testCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  testTitle: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  testDate: {
    fontSize: 12,
  },
  testValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.compact,
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
