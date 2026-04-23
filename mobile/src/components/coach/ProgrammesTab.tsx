/**
 * ProgrammesTab — Coach inner tab showing player's My Programs view.
 *
 * Reuses ProgramsSection from the Output page with the player's data.
 * Coach can view the player's AI-recommended programs.
 */

import React, { useEffect, useState, useCallback } from 'react';
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
import { ProgramsSection } from '../output/ProgramsSection';
import { GlassCard } from '../GlassCard';
import { spacing, fontFamily, layout } from '../../theme';
import { fetchActivePrograms, type ActiveProgramEntry } from '../../services/api';

interface Props {
  playerId: string;
  playerName: string;
}

export function ProgrammesTab({ playerId, playerName }: Props) {
  const { colors } = useTheme();
  const { data, loading, error, refresh, isDeepRefreshing } = useOutputData(playerId);
  const [activeEntries, setActiveEntries] = useState<ActiveProgramEntry[]>([]);
  const [playerAddedEntries, setPlayerAddedEntries] = useState<ActiveProgramEntry[]>([]);

  const loadActive = useCallback(async () => {
    try {
      const res = await fetchActivePrograms(playerId);
      setActiveEntries(res.active ?? []);
      setPlayerAddedEntries(res.playerAdded ?? []);
    } catch (e) {
      console.warn('[ProgrammesTab] fetchActivePrograms failed:', e);
    }
  }, [playerId]);

  useEffect(() => { loadActive(); }, [loadActive]);

  const onRefresh = useCallback(() => {
    refresh();
    loadActive();
  }, [refresh, loadActive]);

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
          refreshControl={<TomoRefreshControl refreshing={false} onRefresh={onRefresh} />}
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
        <PullRefreshOverlay refreshing={false} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<TomoRefreshControl refreshing={false} onRefresh={onRefresh} />}
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
          activeEntries={activeEntries}
          playerAddedEntries={playerAddedEntries}
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
