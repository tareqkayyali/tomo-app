/**
 * Coach Players Screen
 * Grid/list of linked players with readiness indicators and streak counts.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../../hooks/useTheme';
import { getCoachPlayers } from '../../services/api';
import { spacing, borderRadius, layout } from '../../theme';
import type { CoachStackParamList } from '../../navigation/types';
import type { PlayerSummary } from '../../types';

type Nav = NativeStackNavigationProp<CoachStackParamList>;

function readinessColor(lastCheckinDate: string | null | undefined): string {
  if (!lastCheckinDate) return '#6B6B6B'; // gray — no data
  const daysSince = Math.floor(
    (Date.now() - new Date(lastCheckinDate).getTime()) / (1000 * 60 * 60 * 24),
  );
  if (daysSince <= 1) return '#30D158'; // green
  if (daysSince <= 3) return '#F39C12'; // yellow
  return '#E74C3C'; // red
}

export function CoachPlayersScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<Nav>();
  const [players, setPlayers] = useState<PlayerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPlayers = useCallback(async () => {
    try {
      const res = await getCoachPlayers();
      setPlayers(res.players);
    } catch {
      // silent — empty state handles it
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPlayers();
  }, [fetchPlayers]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPlayers();
  }, [fetchPlayers]);

  const renderPlayer = useCallback(
    ({ item }: { item: PlayerSummary }) => {
      const dotColor = readinessColor(item.lastCheckinDate);
      return (
        <Pressable
          onPress={() =>
            navigation.navigate('CoachPlayerDetail', {
              playerId: item.id,
              playerName: item.name,
            })
          }
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: colors.surfaceElevated, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <View style={styles.cardHeader}>
            <Text style={[styles.playerName, { color: colors.textOnDark }]} numberOfLines={1}>
              {item.name}
            </Text>
            <View style={[styles.readinessDot, { backgroundColor: dotColor }]} />
          </View>

          <View style={styles.cardMeta}>
            <View style={[styles.sportBadge, { backgroundColor: colors.accent1 + '22' }]}>
              <Text style={[styles.sportBadgeText, { color: colors.accent1 }]}>
                {item.sport.charAt(0).toUpperCase() + item.sport.slice(1)}
              </Text>
            </View>

            <View style={styles.streakRow}>
              <Ionicons name="flame-outline" size={14} color={colors.accent1} />
              <Text style={[styles.streakText, { color: colors.textMuted }]}>
                {item.currentStreak}
              </Text>
            </View>
          </View>
        </Pressable>
      );
    },
    [colors, navigation],
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <ActivityIndicator size="large" color={colors.accent1} style={{ marginTop: spacing.xxl }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Text style={[styles.title, { color: colors.textOnDark }]}>Players</Text>

      {players.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={64} color={colors.textInactive} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            No players linked yet
          </Text>
          <Pressable
            onPress={() => navigation.navigate('CoachInvite')}
            style={[styles.emptyButton, { backgroundColor: colors.accent1 }]}
          >
            <Text style={[styles.emptyButtonText, { color: '#FFFFFF' }]}>Generate Invite Code</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={players}
          keyExtractor={(item) => item.id}
          renderItem={renderPlayer}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent1}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginHorizontal: layout.screenMargin,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  listContent: {
    paddingHorizontal: layout.screenMargin,
    paddingBottom: spacing.xxl,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  card: {
    width: '48%',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  playerName: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    marginRight: spacing.sm,
  },
  readinessDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sportBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  sportBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  streakText: {
    fontSize: 13,
    fontWeight: '500',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyText: {
    fontSize: 16,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  emptyButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.compact,
    borderRadius: borderRadius.md,
  },
  emptyButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
