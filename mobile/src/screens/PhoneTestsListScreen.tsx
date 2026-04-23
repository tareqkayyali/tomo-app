/**
 * Phone Tests List Screen
 * Lists the 5 phone-based tests as GlassCard items.
 * Each card shows test info + last result + "Start Test" button.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  RefreshControl,
} from 'react-native';
import { PlayerScreen } from '../components/tomo-ui/playerDesign';
import { SmartIcon } from '../components/SmartIcon';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard } from '../components';
import {
  colors,
  spacing,
  fontFamily,
  layout,
  borderRadius,
  screenBg,
} from '../theme';
import { getPhoneTestHistory } from '../services/api';
import { usePhoneTests } from '../hooks/useContentHelpers';
import { useFadeIn } from '../hooks/useFadeIn';
import Animated from 'react-native-reanimated';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<MainStackParamList, 'PhoneTestsList'>;
};

const SCREEN_MAP: Record<string, keyof MainStackParamList> = {
  'reaction-tap': 'ReactionTest',
  'jump-height': 'JumpTest',
  'sprint-speed': 'SprintTest',
  'agility-shuffle': 'AgilityTest',
  'balance-stability': 'BalanceTest',
};

export function PhoneTestsListScreen({ navigation }: Props) {
  const phoneTests = usePhoneTests();
  const [refreshing, setRefreshing] = useState(false);
  const [lastResults, setLastResults] = useState<Record<string, string>>({});

  const fadeIn0 = useFadeIn(0);
  const fadeIn1 = useFadeIn(1);
  const fadeIn2 = useFadeIn(2);
  const fadeIns = [fadeIn0, fadeIn1, fadeIn2];

  const loadHistory = useCallback(async () => {
    try {
      const data = await getPhoneTestHistory(20);
      const results: Record<string, string> = {};
      for (const session of data.sessions || []) {
        if (!results[session.testId]) {
          results[session.testId] = `${session.primaryScore} ${session.unit}`;
        }
      }
      setLastResults(results);
    } catch {
      // Graceful
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadHistory();
  }, [loadHistory]);

  const handleStartTest = useCallback((testId: string) => {
    const screenName = SCREEN_MAP[testId];
    if (screenName) {
      navigation.navigate(screenName as any);
    }
  }, [navigation]);

  return (
    <PlayerScreen
      label="TESTS"
      title="Phone tests"
      onBack={() => navigation.goBack()}
      scrollProps={{
        refreshControl: (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent1} />
        ),
      }}
      contentStyle={styles.scrollContent}
    >
      {phoneTests.map((test, index) => (
          <Animated.View key={test.id} style={fadeIns[Math.min(index, 2)]}>
            <GlassCard style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconCircle, { backgroundColor: test.color + '22' }]}>
                  <SmartIcon name={test.icon as any} size={24} color={test.color} />
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardTitle}>{test.name}</Text>
                  <Text style={styles.cardMeta}>{test.durationSeconds}s | {test.unit}</Text>
                </View>
              </View>

              <Text style={styles.cardDesc}>{test.description}</Text>

              {lastResults[test.id] && (
                <View style={styles.lastResult}>
                  <SmartIcon name="trophy-outline" size={14} color={colors.accent2} />
                  <Text style={styles.lastResultText}>Last: {lastResults[test.id]}</Text>
                </View>
              )}

              <Pressable
                onPress={() => handleStartTest(test.id)}
                style={styles.testButtonWrap}
              >
                <LinearGradient
                  colors={[test.color, test.color + 'CC']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.testButton}
                >
                  <SmartIcon name="play" size={16} color={colors.textPrimary} />
                  <Text style={styles.testButtonText}>Start Test</Text>
                </LinearGradient>
              </Pressable>
            </GlassCard>
          </Animated.View>
        ))}
    </PlayerScreen>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: screenBg,
  },
  scrollContent: {
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.md,
    paddingBottom: layout.navHeight + spacing.xl,
    gap: spacing.md,
  },
  card: {
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 17,
    color: colors.textOnDark,
  },
  cardMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textInactive,
    marginTop: 2,
  },
  cardDesc: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textInactive,
    lineHeight: 20,
  },
  lastResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  lastResultText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.accent2,
  },
  testButtonWrap: {
    marginTop: spacing.xs,
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: 12,
    borderRadius: borderRadius.lg,
  },
  testButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: colors.textPrimary,
  },
});
