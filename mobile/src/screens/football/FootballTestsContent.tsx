/**
 * FootballTestsContent — Football-specific test cards.
 *
 * Rendered inside TestsScreen when activeSport === 'football'.
 * Shows 8 football physical test cards driven by FOOTBALL_TEST_DEFS,
 * plus a link to the phone-sensor tests that also work for football.
 *
 * Each card shows: icon, test name, description, attribute badge,
 * and a "Start Test" button that navigates to FootballTestInput.
 */

import React, { useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { GlassCard, GradientButton } from '../../components';
import { useTheme } from '../../hooks/useTheme';
import { useSpringEntrance } from '../../hooks/useAnimations';
import { useFadeIn } from '../../hooks/useFadeIn';
import { useIsFocused } from '@react-navigation/native';

import {
  FOOTBALL_TEST_DEFS,
  getTestAttributeLabel,
} from '../../data/footballTestDefs';
import type { FootballTestDef } from '../../data/footballTestDefs';
import { FOOTBALL_ATTRIBUTE_LABELS } from '../../types/football';
import type { FootballAttribute } from '../../types/football';

import { fontFamily, spacing, borderRadius, layout } from '../../theme';
import type { ThemeColors } from '../../theme/colors';

import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainTabParamList, MainStackParamList } from '../../navigation/types';

// ═══ TYPES ═══

type TestsNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Tests'>,
  NativeStackNavigationProp<MainStackParamList>
>;

interface FootballTestsContentProps {
  navigation: TestsNavigationProp;
}

// ═══ COMPONENT ═══

export function FootballTestsContent({ navigation }: FootballTestsContentProps) {
  const { colors } = useTheme();
  const isFocused = useIsFocused();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const fadeIn0 = useFadeIn(0, { trigger: isFocused });
  const fadeIn1 = useFadeIn(1, { trigger: isFocused });
  const fadeIn2 = useFadeIn(2, { trigger: isFocused });

  const handleStartTest = useCallback(
    (testId: string) => {
      navigation.navigate('FootballTestInput', { testId });
    },
    [navigation],
  );

  return (
    <>
      {/* Football Context Card */}
      <Animated.View style={fadeIn0}>
        <GlassCard style={styles.contextCard}>
          <View style={styles.contextHeader}>
            <Ionicons name="football-outline" size={18} color={colors.accent1} />
            <Text style={styles.contextTitle}>Football Physical Tests</Text>
          </View>
          <Text style={styles.contextDesc}>
            Tests feed your player card attributes. Complete any test to see your percentile.
          </Text>
        </GlassCard>
      </Animated.View>

      {/* 8 Test Cards */}
      <Animated.View style={[fadeIn1, { gap: spacing.md }]}>
        {FOOTBALL_TEST_DEFS.map((testDef) => (
          <FootballTestCard
            key={testDef.id}
            testDef={testDef}
            onPress={() => handleStartTest(testDef.id)}
          />
        ))}
      </Animated.View>

      {/* Phone Tests Link */}
      <Animated.View style={fadeIn2}>
        <Pressable
          onPress={() => navigation.navigate('PhoneTestsList')}
          style={({ pressed }) => [pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
        >
          <LinearGradient
            colors={['rgba(255,107,53,0.20)', 'rgba(0,217,255,0.15)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.phoneCard}
          >
            <View style={styles.phoneIconWrap}>
              <LinearGradient
                colors={colors.gradientOrangeCyan}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.phoneIconBox}
              >
                <Ionicons name="phone-portrait-outline" size={28} color="#FFFFFF" />
              </LinearGradient>
            </View>
            <View style={styles.phoneInfo}>
              <Text style={styles.phoneTitle}>Phone Only</Text>
              <Text style={styles.phoneDesc}>
                Reaction, jump, sprint, agility & balance tests using your phone sensors
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textInactive} />
          </LinearGradient>
        </Pressable>
      </Animated.View>
    </>
  );
}

// ═══ FOOTBALL TEST CARD ═══

function FootballTestCard({
  testDef,
  onPress,
}: {
  testDef: FootballTestDef;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const attrLabel = getTestAttributeLabel(testDef);

  return (
    <Pressable onPress={onPress}>
      <GlassCard style={styles.testCard}>
        <View style={styles.testTop}>
          <View style={[styles.testIconBox, { backgroundColor: testDef.color + '18' }]}>
            <Ionicons name={testDef.icon as any} size={24} color={testDef.color} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.testNameRow}>
              <Text style={styles.testName}>{testDef.name}</Text>
              <View style={[styles.attrBadge, { backgroundColor: testDef.color + '20' }]}>
                <Text style={[styles.attrBadgeText, { color: testDef.color }]}>{attrLabel}</Text>
              </View>
            </View>
            <Text style={styles.testDesc} numberOfLines={2}>
              {testDef.description}
            </Text>
          </View>
        </View>
        <View style={styles.testBottom}>
          <GradientButton title="Start Test" onPress={onPress} small />
        </View>
      </GlassCard>
    </Pressable>
  );
}

// ═══ STYLES ═══

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // Context Card
    contextCard: {
      borderColor: 'rgba(48, 209, 88, 0.15)',
    },
    contextHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: spacing.xs,
    },
    contextTitle: {
      fontFamily: fontFamily.bold,
      fontSize: 15,
      color: colors.textOnDark,
    },
    contextDesc: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textInactive,
      lineHeight: 18,
    },

    // Test Cards
    testCard: {
      gap: spacing.md,
    },
    testTop: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    testIconBox: {
      width: 48,
      height: 48,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    testNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    testName: {
      fontFamily: fontFamily.semiBold,
      fontSize: 16,
      color: colors.textOnDark,
    },
    testDesc: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textInactive,
      marginTop: 2,
      lineHeight: 18,
    },
    attrBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
    },
    attrBadgeText: {
      fontFamily: fontFamily.bold,
      fontSize: 10,
      letterSpacing: 0.5,
    },
    testBottom: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },

    // Phone Card
    phoneCard: {
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      padding: spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      overflow: 'hidden',
    },
    phoneIconWrap: {},
    phoneIconBox: {
      width: 48,
      height: 48,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    phoneInfo: {
      flex: 1,
    },
    phoneTitle: {
      fontFamily: fontFamily.semiBold,
      fontSize: 16,
      color: colors.textOnDark,
      marginBottom: 2,
    },
    phoneDesc: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textInactive,
      lineHeight: 18,
    },
  });
}
