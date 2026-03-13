/**
 * TestSubTabs — Segmented control for Tests screen
 *
 * 3 tabs: Standard | My Tests | Coach
 * Animated underline indicator slides between tabs.
 *
 * Matches prototype Test tab sub-navigation.
 */

import React, { useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  LayoutChangeEvent,
} from 'react-native';
import { useTheme } from '../hooks/useTheme';
import type { ThemeColors } from '../theme/colors';
import { spacing, fontFamily, borderRadius } from '../theme';

export type TestSubTab = 'standard' | 'myTests' | 'coach';

type TestSubTabsProps = {
  activeTab: TestSubTab;
  onTabChange: (tab: TestSubTab) => void;
  coachCount?: number; // badge count for pending coach suggestions
};

const TABS: { key: TestSubTab; label: string }[] = [
  { key: 'standard', label: 'Standard' },
  { key: 'myTests', label: 'My Tests' },
  { key: 'coach', label: 'Coach' },
];

export function TestSubTabs({ activeTab, onTabChange, coachCount = 0 }: TestSubTabsProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const tabWidths = useRef<number[]>([0, 0, 0]);
  const tabOffsets = useRef<number[]>([0, 0, 0]);
  const indicatorX = useRef(new Animated.Value(0)).current;
  const indicatorW = useRef(new Animated.Value(0)).current;

  const activeIndex = TABS.findIndex((t) => t.key === activeTab);

  useEffect(() => {
    const x = tabOffsets.current[activeIndex] || 0;
    const w = tabWidths.current[activeIndex] || 0;
    Animated.parallel([
      Animated.spring(indicatorX, { toValue: x, useNativeDriver: false, tension: 300, friction: 30 }),
      Animated.spring(indicatorW, { toValue: w, useNativeDriver: false, tension: 300, friction: 30 }),
    ]).start();
  }, [activeIndex]);

  const handleLayout = (index: number) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    tabWidths.current[index] = width;
    tabOffsets.current[index] = x;
    if (index === activeIndex) {
      indicatorX.setValue(x);
      indicatorW.setValue(width);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabRow}>
        {TABS.map((tab, i) => {
          const isActive = tab.key === activeTab;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => onTabChange(tab.key)}
              onLayout={handleLayout(i)}
              style={styles.tab}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {tab.label}
              </Text>
              {tab.key === 'coach' && coachCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{coachCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      <Animated.View
        style={[
          styles.indicator,
          {
            left: indicatorX,
            width: indicatorW,
          },
        ]}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      marginBottom: spacing.md,
    },
    tabRow: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    tab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      gap: 6,
    },
    tabLabel: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
      color: colors.textInactive,
    },
    tabLabelActive: {
      fontFamily: fontFamily.semiBold,
      color: colors.accent1,
    },
    badge: {
      backgroundColor: colors.accent1,
      borderRadius: 10,
      minWidth: 18,
      height: 18,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 5,
    },
    badgeText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 10,
      color: '#FFFFFF',
    },
    indicator: {
      position: 'absolute',
      bottom: 0,
      height: 2,
      backgroundColor: colors.accent1,
      borderRadius: 1,
    },
  });
}
