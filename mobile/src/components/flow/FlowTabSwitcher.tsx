/**
 * FlowTabSwitcher — Pill-style tab bar with sliding orange indicator
 *
 * The indicator tracks the PagerView scroll position 1:1 via a shared value,
 * so it moves in perfect sync with the user's swipe gesture.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform, LayoutChangeEvent } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);
import { spacing, borderRadius, fontFamily } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { useSpringEntrance } from '../../hooks/useAnimations';
import type { ThemeColors } from '../../theme/colors';

export type FlowTab = 'flow' | 'week' | 'month';

interface Props {
  activeTab: FlowTab;
  onTabChange: (tab: FlowTab) => void;
  /** Continuous scroll position (0–2) driven by PagerView onPageScroll */
  scrollPosition: SharedValue<number>;
}

const TABS: { key: FlowTab; label: string }[] = [
  { key: 'flow', label: 'Flow' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
];

const TAB_COUNT = TABS.length;
const PAD = 3; // inner padding of the pill bar

export function FlowTabSwitcher({ activeTab, onTabChange, scrollPosition }: Props) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const entranceStyle = useSpringEntrance(0);

  const barWidth = useSharedValue(0);

  const handleBarLayout = (e: LayoutChangeEvent) => {
    barWidth.value = e.nativeEvent.layout.width;
  };

  // Indicator tracks scrollPosition directly — no animation delay
  const indicatorStyle = useAnimatedStyle(() => {
    const innerWidth = barWidth.value - PAD * 2;
    const tabWidth = innerWidth / TAB_COUNT;
    return {
      width: barWidth.value > 0 ? tabWidth : 0,
      transform: [{ translateX: scrollPosition.value * tabWidth }],
    };
  });

  const handlePress = (tab: FlowTab) => {
    if (tab !== activeTab) {
      onTabChange(tab);
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
  };

  return (
    <Animated.View style={[styles.container, entranceStyle]}>
      <View style={styles.pillBar} onLayout={handleBarLayout}>
        {/* Sliding gradient indicator (orange → teal) */}
        <AnimatedGradient
          colors={colors.textOnDark === '#FFFFFF' ? ['#CC5522', '#0099BB'] : ['#FF9B6B', '#66E8FF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.indicator, indicatorStyle]}
        />

        {/* Tab labels */}
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <Pressable
              key={tab.key}
              onPress={() => handlePress(tab.key)}
              style={styles.tab}
            >
              <Text style={styles.tabText}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Animated.View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: 20,
      paddingVertical: spacing.sm,
    },
    pillBar: {
      flexDirection: 'row',
      backgroundColor: colors.glass,
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      padding: 3,
      position: 'relative',
    },
    indicator: {
      position: 'absolute',
      top: 3,
      bottom: 3,
      left: 3,
      borderRadius: borderRadius.full,
    },
    tab: {
      flex: 1,
      paddingVertical: 8,
      alignItems: 'center',
      borderRadius: borderRadius.full,
      zIndex: 1,
    },
    tabText: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
      color: colors.textOnDark,
    },
  });
}
