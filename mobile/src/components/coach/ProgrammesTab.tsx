/**
 * ProgrammesTab — Coach inner tab showing player's My Programs view.
 *
 * Reuses ProgramsSection from the Output page with the player's data.
 * Coach can view the player's AI-recommended programs.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SmartIcon } from '../SmartIcon';

import { useOutputData } from '../../hooks/useOutputData';
import { useTheme } from '../../hooks/useTheme';
import { ProgramsSection } from '../output/ProgramsSection';
import { GlassCard } from '../GlassCard';
import { spacing, fontFamily, layout } from '../../theme';

interface Props {
  playerId: string;
  playerName: string;
}

export function ProgrammesTab({ playerId, playerName }: Props) {
  const { colors } = useTheme();
  const { data, loading, error, refresh, isDeepRefreshing } = useOutputData(playerId);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent1} />
      </View>
    );
  }

  if (error || !data) {
    return (
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={colors.accent1} />}
      >
        <GlassCard>
          <View style={styles.emptyContent}>
            <SmartIcon name="alert-circle-outline" size={40} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.textOnDark }]}>
              Could not load programs
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
              Pull down to retry
            </Text>
          </View>
        </GlassCard>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={colors.accent1} />}
    >
      {/* Coach context banner */}
      <View style={[styles.contextBanner, { backgroundColor: colors.accent1 + '10' }]}>
        <SmartIcon name="eye-outline" size={14} color={colors.accent1} />
        <Text style={[styles.contextText, { color: colors.accent1 }]}>
          Viewing {playerName.split(' ')[0]}'s training programs
        </Text>
      </View>

      <ProgramsSection
        programs={data.programs}
        gaps={data.metrics?.gaps}
        isDeepRefreshing={isDeepRefreshing}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: layout.screenMargin,
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contextBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  contextText: {
    fontSize: 12,
    fontFamily: fontFamily.medium,
  },
  emptyContent: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: fontFamily.semiBold,
  },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: fontFamily.regular,
    textAlign: 'center',
  },
});
