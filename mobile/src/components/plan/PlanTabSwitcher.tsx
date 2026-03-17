/**
 * PlanTabSwitcher — "Day Flow" | "Study Plan" segmented control
 *
 * Animated underline indicator slides between tabs.
 * Follows TestSubTabs.tsx pattern.
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
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../theme/colors';
import { spacing, fontFamily, borderRadius } from '../../theme';

export type PlanTab = 'dayflow' | 'studyplan' | 'trainingplan';

type PlanTabSwitcherProps = {
  activeTab: PlanTab;
  onTabChange: (tab: PlanTab) => void;
};

const TABS: { key: PlanTab; label: string }[] = [
  { key: 'dayflow', label: 'Timeline' },
  { key: 'studyplan', label: 'Study' },
  { key: 'trainingplan', label: 'Training' },
];

export function PlanTabSwitcher({ activeTab, onTabChange }: PlanTabSwitcherProps) {
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
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    tabRow: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
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
    indicator: {
      position: 'absolute',
      bottom: 0,
      height: 2,
      backgroundColor: colors.accent1,
      borderRadius: 1,
    },
  });
}
