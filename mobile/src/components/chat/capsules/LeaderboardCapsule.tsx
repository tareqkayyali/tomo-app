/**
 * LeaderboardCapsule — View leaderboard rankings inline in chat.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type { LeaderboardCapsule as LeaderboardCapsuleType } from '../../../types/chat';
import { PillSelector } from './shared/PillSelector';

interface Props {
  card: LeaderboardCapsuleType;
}

const RANK_MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

export function LeaderboardCapsuleComponent({ card }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>🏆 Leaderboard</Text>

      {card.userRank && (
        <Text style={styles.yourRank}>Your rank: #{card.userRank}</Text>
      )}

      <ScrollView style={styles.list} nestedScrollEnabled>
        {card.entries.slice(0, 10).map((entry) => (
          <View key={`${entry.rank}-${entry.name}`} style={[styles.row, entry.isCurrentUser && styles.highlightRow]}>
            <Text style={styles.rank}>
              {RANK_MEDALS[entry.rank] ?? `#${entry.rank}`}
            </Text>
            <View style={styles.nameCol}>
              <Text style={[styles.name, entry.isCurrentUser && styles.nameHighlight]} numberOfLines={1}>
                {entry.name} {entry.isCurrentUser ? '(You)' : ''}
              </Text>
              <Text style={styles.sport}>{entry.sport}</Text>
            </View>
            <View style={styles.scoreCol}>
              <Text style={styles.points}>{entry.totalPoints.toLocaleString()}</Text>
              <Text style={styles.streak}>🔥 {entry.currentStreak}d</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.backgroundElevated, borderRadius: borderRadius.lg, padding: spacing.md, gap: spacing.sm },
  heading: { fontFamily: fontFamily.semiBold, fontSize: 16, color: colors.textPrimary },
  yourRank: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.accent1 },
  list: { maxHeight: 350 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.glassBorder, gap: spacing.sm },
  highlightRow: { backgroundColor: 'rgba(255, 107, 53, 0.08)', borderRadius: borderRadius.sm, marginHorizontal: -4, paddingHorizontal: 4 },
  rank: { fontFamily: fontFamily.bold, fontSize: 16, width: 36, textAlign: 'center', color: colors.textPrimary },
  nameCol: { flex: 1 },
  name: { fontFamily: fontFamily.medium, fontSize: 14, color: colors.textPrimary },
  nameHighlight: { color: colors.accent1 },
  sport: { fontFamily: fontFamily.regular, fontSize: 11, color: colors.textSecondary },
  scoreCol: { alignItems: 'flex-end' },
  points: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.accent2 },
  streak: { fontFamily: fontFamily.regular, fontSize: 11, color: colors.textSecondary },
});
