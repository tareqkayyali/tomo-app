/**
 * UnderlineTabSwitcher — Canonical animated underline tab pattern.
 *
 * Used by:
 *   - Output screen (vitals / metrics / programs)
 *   - Dashboard (Dashboard / Programs / Metrics / Progress)
 *
 * Accepts a generic string-keyed tab list so callers stay type-safe with
 * their own tab union. The underline indicator springs between tabs on
 * change, and its width equals the TEXT width (not the tab cell width) so
 * the underline sits centred directly under the active label rather than
 * spanning the full tab column.
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
  // Measured geometry — we track TAB cell x/width and TEXT width separately
  // so the indicator can sit centred under the text rather than spanning
  // the full tab column.
  const tabWidths = useRef<number[]>(tabs.map(() => 0));
  const tabOffsets = useRef<number[]>(tabs.map(() => 0));
  const textWidths = useRef<number[]>(tabs.map(() => 0));
  const lastActiveX = useRef(0);
  const indicatorX = useRef(new Animated.Value(0)).current;
  const indicatorW = useRef(new Animated.Value(0)).current;

  const activeIndex = tabs.findIndex((t) => t.key === activeTab);

  /** Compute indicator target: width = text width; x = tab centre − half text width. */
  const computeTarget = (index: number): { x: number; w: number } => {
    const tabX = tabOffsets.current[index] || 0;
    const tabW = tabWidths.current[index] || 0;
    const textW = textWidths.current[index] || 0;
    // Fallback: if we haven't measured the text yet (first render), use tab width.
    const w = textW > 0 ? textW : tabW;
    const x = tabX + Math.max(0, (tabW - w) / 2);
    return { x, w };
  };

  const animateTo = (x: number, w: number) => {
    Animated.parallel([
      Animated.spring(indicatorX, { toValue: x, useNativeDriver: false, tension: 300, friction: 30 }),
      Animated.spring(indicatorW, { toValue: w, useNativeDriver: false, tension: 300, friction: 30 }),
    ]).start();
  };

  useEffect(() => {
    if (activeIndex < 0) {
      // No tab active (overlay pattern where the active panel was dismissed):
      // collapse width at last known x so the indicator retracts in place.
      animateTo(lastActiveX.current, 0);
      return;
    }
    const { x, w } = computeTarget(activeIndex);
    lastActiveX.current = x;
    animateTo(x, w);
  }, [activeIndex, indicatorX, indicatorW]);

  const handleTabLayout = (index: number) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    tabWidths.current[index] = width;
    tabOffsets.current[index] = x;
    if (index === activeIndex) {
      const t = computeTarget(index);
      indicatorX.setValue(t.x);
      indicatorW.setValue(t.w);
    }
  };

  const handleTextLayout = (index: number) => (e: LayoutChangeEvent) => {
    const { width } = e.nativeEvent.layout;
    textWidths.current[index] = width;
    if (index === activeIndex) {
      const t = computeTarget(index);
      indicatorX.setValue(t.x);
      indicatorW.setValue(t.w);
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
              onLayout={handleTabLayout(i)}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 }}
              activeOpacity={0.7}
            >
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                onLayout={handleTextLayout(i)}
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
