/**
 * RecentTestsScroll — Horizontal scrollable test result cards
 *
 * Shows recent test results from football_test_results + phone_test_sessions.
 * Each card: test name, value, date, trend indicator.
 * Glass-morphism card design with gradient accent bar.
 *
 * Matches prototype Progress "Recent Tests" section.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SmartIcon } from './SmartIcon';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../hooks/useTheme';
import type { ThemeColors } from '../theme/colors';
import { spacing, fontFamily, borderRadius } from '../theme';

export type TestResult = {
  id: string;
  testName: string;
  value: string;
  unit: string;
  date: string;        // formatted date string
  trend?: 'up' | 'down' | 'same';
  trendValue?: string; // e.g., "-0.12s"
};

type RecentTestsScrollProps = {
  results: TestResult[];
  onTestPress?: (result: TestResult) => void;
};

export function RecentTestsScroll({ results, onTestPress }: RecentTestsScrollProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (results.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Recent Tests</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {results.map((result) => (
          <TouchableOpacity
            key={result.id}
            style={styles.card}
            onPress={() => onTestPress?.(result)}
            activeOpacity={0.8}
          >
            {/* Gradient accent bar at top */}
            <LinearGradient
              colors={colors.gradientOrangeCyan}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.accentBar}
            />
            <Text style={styles.testName} numberOfLines={1}>
              {result.testName}
            </Text>
            <View style={styles.valueRow}>
              <Text style={styles.value}>{result.value}</Text>
              <Text style={styles.unit}>{result.unit}</Text>
            </View>
            {result.trend && (
              <View style={styles.trendRow}>
                <SmartIcon
                  name={
                    result.trend === 'up'
                      ? 'trending-up'
                      : result.trend === 'down'
                        ? 'trending-down'
                        : 'remove'
                  }
                  size={12}
                  color={
                    result.trend === 'up'
                      ? colors.readinessGreen
                      : result.trend === 'down'
                        ? colors.readinessRed
                        : colors.textInactive
                  }
                />
                {result.trendValue && (
                  <Text
                    style={[
                      styles.trendText,
                      {
                        color:
                          result.trend === 'up'
                            ? colors.readinessGreen
                            : result.trend === 'down'
                              ? colors.readinessRed
                              : colors.textInactive,
                      },
                    ]}
                  >
                    {result.trendValue}
                  </Text>
                )}
              </View>
            )}
            <Text style={styles.date}>{result.date}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      marginBottom: spacing.md,
    },
    sectionTitle: {
      fontFamily: fontFamily.semiBold,
      fontSize: 13,
      color: colors.textInactive,
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: spacing.sm,
    },
    scrollContent: {
      gap: spacing.sm,
    },
    card: {
      width: 140,
      backgroundColor: colors.backgroundElevated,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: colors.borderLight,
      overflow: 'hidden',
      padding: spacing.sm,
      paddingTop: 0,
    },
    accentBar: {
      height: 3,
      marginBottom: spacing.sm,
      marginHorizontal: -spacing.sm,
    },
    testName: {
      fontFamily: fontFamily.medium,
      fontSize: 12,
      color: colors.textInactive,
      marginBottom: 4,
    },
    valueRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 3,
    },
    value: {
      fontFamily: fontFamily.bold,
      fontSize: 22,
      color: colors.textOnDark,
    },
    unit: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      color: colors.textInactive,
    },
    trendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginTop: 4,
    },
    trendText: {
      fontFamily: fontFamily.medium,
      fontSize: 11,
    },
    date: {
      fontFamily: fontFamily.regular,
      fontSize: 10,
      color: colors.textMuted,
      marginTop: 6,
    },
  });
}
