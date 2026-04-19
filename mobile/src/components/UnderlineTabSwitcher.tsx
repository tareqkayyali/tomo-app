/**
 * UnderlineTabSwitcher — Canonical animated underline tab pattern.
 *
 * Used by:
 *   - Output screen (vitals / metrics / programs)
 *   - Dashboard (Program / Metrics / Progress)
 *
 * Accepts a generic string-keyed tab list so callers stay type-safe with their
 * own tab union. The underline indicator springs between tabs on change.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  LayoutChangeEvent,
} from 'react-native';
import { fontFamily } from '../theme/typography';
import { spacing } from '../theme';

export interface UnderlineTab<K extends string> {
  key: K;
  label: string;
}

interface Props<K extends string> {
  tabs: UnderlineTab<K>[];
  activeTab: K;
  onTabChange: (tab: K) => void;
  /** Color for active label + indicator. */
  accentColor: string;
  /** Color for inactive labels. */
  inactiveColor: string;
  /** Color for the base bottom border. */
  borderColor: string;
  /** Optional CMS-driven label overrides keyed by tab key. */
  tabLabels?: Partial<Record<K, string>>;
  /** Horizontal padding for the container. Defaults to `spacing.md`. */
  paddingHorizontal?: number;
  /** Bottom margin below the switcher. Defaults to `spacing.sm`. */
  marginBottom?: number;
}

export function UnderlineTabSwitcher<K extends string>({
  tabs,
  activeTab,
  onTabChange,
  accentColor,
  inactiveColor,
  borderColor,
  tabLabels,
  paddingHorizontal = spacing.md,
  marginBottom = spacing.sm,
}: Props<K>) {
  const tabWidths = useRef<number[]>(tabs.map(() => 0));
  const tabOffsets = useRef<number[]>(tabs.map(() => 0));
  const lastActiveX = useRef(0);
  const indicatorX = useRef(new Animated.Value(0)).current;
  const indicatorW = useRef(new Animated.Value(0)).current;

  const activeIndex = tabs.findIndex((t) => t.key === activeTab);

  useEffect(() => {
    // When no tab is active (e.g. overlay pattern where the active panel was
    // dismissed), collapse width to 0 at the last known x so the indicator
    // retracts in place instead of sticking on the previous selection.
    const x = activeIndex >= 0 ? tabOffsets.current[activeIndex] || 0 : lastActiveX.current;
    const w = activeIndex >= 0 ? tabWidths.current[activeIndex] || 0 : 0;
    if (activeIndex >= 0) lastActiveX.current = x;
    Animated.parallel([
      Animated.spring(indicatorX, { toValue: x, useNativeDriver: false, tension: 300, friction: 30 }),
      Animated.spring(indicatorW, { toValue: w, useNativeDriver: false, tension: 300, friction: 30 }),
    ]).start();
  }, [activeIndex, indicatorX, indicatorW]);

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
    <View style={{ marginBottom, paddingHorizontal }}>
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: borderColor }}>
        {tabs.map((tab, i) => {
          const isActive = tab.key === activeTab;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => onTabChange(tab.key)}
              onLayout={handleLayout(i)}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 }}
              activeOpacity={0.7}
            >
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                style={{
                  fontFamily: isActive ? fontFamily.semiBold : fontFamily.medium,
                  fontSize: 14,
                  color: isActive ? accentColor : inactiveColor,
                }}
              >
                {tabLabels?.[tab.key] ?? tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Animated.View
        style={{
          position: 'absolute',
          bottom: 0,
          height: 2,
          backgroundColor: accentColor,
          borderRadius: 1,
          left: indicatorX,
          width: indicatorW,
        }}
      />
    </View>
  );
}
