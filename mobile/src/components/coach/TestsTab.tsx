/**
 * TestsTab — Coach inner tab showing player's My Metrics view.
 *
 * Reuses MetricsSection from the Output page with the player's data.
 * Coach can view the player's test results and log new tests for them.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SmartIcon } from '../SmartIcon';
import { Loader } from '../Loader';
import { TomoRefreshControl, PullRefreshOverlay } from '..';

import { useOutputData } from '../../hooks/useOutputData';
import { useTheme } from '../../hooks/useTheme';
import { MetricsSection } from '../output/MetricsSection';
import { GlassCard } from '../GlassCard';
import { spacing, fontFamily, layout } from '../../theme';

interface Props {
  playerId: string;
  playerName: string;
  navigation: any;
}

export function TestsTab({ playerId, playerName, navigation }: Props) {
  const { colors } = useTheme();
  const { data, loading, error, refresh } = useOutputData(playerId);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Loader size="lg" />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<TomoRefreshControl refreshing={false} onRefresh={refresh} />}
        >
          <GlassCard>
            <View style={styles.emptyContent}>
              <SmartIcon name="alert-circle-outline" size={40} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.textOnDark }]}>
                Could not load metrics
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                Pull down to retry
              </Text>
            </View>
          </GlassCard>
        </ScrollView>
        <PullRefreshOverlay refreshing={false} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<TomoRefreshControl refreshing={false} onRefresh={refresh} />}
      >
        {/* Coach context banner */}
        <View style={[styles.contextBanner, { backgroundColor: colors.accent2 + '10' }]}>
          <SmartIcon name="eye-outline" size={14} color={colors.accent2} />
          <Text style={[styles.contextText, { color: colors.accent2 }]}>
            Viewing {playerName.split(' ')[0]}'s metrics · You can log new metrics
          </Text>
        </View>

        <MetricsSection
          metrics={data.metrics}
          onTestLogged={() => refresh()}
          targetPlayerId={playerId}
        />
      </ScrollView>
      <PullRefreshOverlay refreshing={false} />
    </View>
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
