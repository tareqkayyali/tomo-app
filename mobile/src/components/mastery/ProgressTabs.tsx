/**
 * ProgressTabs — Underline-style tab bar for Trends/History sub-sections.
 * Animated underline position follows the active tab.
 */

import React, { memo, useRef, useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, { useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '../../hooks/useTheme';
import { fontFamily } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

interface Tab {
  key: string;
  label: string;
}

interface ProgressTabsProps {
  tabs: Tab[];
  activeKey: string;
  onTabPress: (key: string) => void;
}

const ProgressTabs: React.FC<ProgressTabsProps> = memo(({ tabs, activeKey, onTabPress }) => {
  const { colors } = useTheme();
  const [tabLayouts, setTabLayouts] = useState<Record<string, { x: number; width: number }>>({});
  const underlineLeft = useSharedValue(0);
  const underlineWidth = useSharedValue(0);

  const handleLayout = useCallback((key: string, event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    setTabLayouts((prev) => {
      const next = { ...prev, [key]: { x, width } };
      // Update underline position for active tab
      if (key === activeKey) {
        underlineLeft.value = withTiming(x, { duration: 200 });
        underlineWidth.value = withTiming(width, { duration: 200 });
      }
      return next;
    });
  }, [activeKey]);

  const handlePress = useCallback((key: string) => {
    const layout = tabLayouts[key];
    if (layout) {
      underlineLeft.value = withTiming(layout.x, { duration: 200 });
      underlineWidth.value = withTiming(layout.width, { duration: 200 });
    }
    onTabPress(key);
  }, [tabLayouts, onTabPress]);

  return (
    <View style={[styles.container, { borderBottomColor: colors.border }]}>
      {tabs.map((tab) => (
        <Pressable
          key={tab.key}
          onPress={() => handlePress(tab.key)}
          onLayout={(e) => handleLayout(tab.key, e)}
          style={styles.tab}
        >
          <Text style={[
            styles.tabText,
            {
              color: tab.key === activeKey ? colors.accent : colors.textDisabled,
              fontFamily: tab.key === activeKey ? fontFamily.semiBold : fontFamily.medium,
            },
          ]}>
            {tab.label}
          </Text>
        </Pressable>
      ))}

      {/* Animated underline */}
      <Animated.View
        style={[
          styles.underline,
          {
            backgroundColor: colors.accent,
            left: underlineLeft,
            width: underlineWidth,
          },
        ]}
      />
    </View>
  );
});

ProgressTabs.displayName = 'ProgressTabs';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    position: 'relative',
    marginBottom: spacing.md,
  },
  tab: {
    paddingVertical: spacing.compact,
    paddingHorizontal: spacing.md,
  },
  tabText: {
    fontSize: 14,
  },
  underline: {
    position: 'absolute',
    bottom: 0,
    height: 2,
    borderRadius: 1,
  },
});

export { ProgressTabs };
