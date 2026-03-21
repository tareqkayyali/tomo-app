/**
 * TimeSection — Collapsible time-horizon section for Own It recommendations.
 *
 * Three horizons: Today (P1-P2), Tomorrow (P3), This Week (P4).
 * Tappable header toggles expand/collapse with chevron indicator.
 */

import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RecCard } from './RecCard';
import { useTheme } from '../../hooks/useTheme';
import { spacing, fontFamily } from '../../theme';
import type { ForYouRecommendation } from './RecCard';

interface TimeSectionProps {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  recs: ForYouRecommendation[];
  /** Start expanded by default */
  defaultExpanded?: boolean;
  /** Base index offset for stagger animation */
  indexOffset?: number;
  /** Callback when a rec's action CTA is pressed */
  onAction?: (route: string, params?: Record<string, unknown>) => void;
}

export function TimeSection({
  title,
  icon,
  color,
  recs,
  defaultExpanded = true,
  indexOffset = 0,
  onAction,
}: TimeSectionProps) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (recs.length === 0) return null;

  return (
    <View style={{ marginTop: spacing.lg }}>
      {/* Collapsible Header */}
      <Pressable
        onPress={() => setExpanded(!expanded)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginHorizontal: spacing.lg,
          marginBottom: expanded ? spacing.compact : 0,
          paddingVertical: spacing.sm,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: color + '20',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name={icon} size={16} color={color} />
          </View>
          <Text
            style={{
              fontFamily: fontFamily.semiBold,
              fontSize: 13,
              color: colors.textInactive,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            {title}
          </Text>
          {/* Count badge */}
          <View
            style={{
              backgroundColor: color + '1F',
              borderRadius: 10,
              paddingHorizontal: 8,
              paddingVertical: 2,
            }}
          >
            <Text style={{ fontFamily: fontFamily.medium, fontSize: 11, color }}>
              {recs.length}
            </Text>
          </View>
        </View>

        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.textMuted}
        />
      </Pressable>

      {/* Cards */}
      {expanded && (
        <View style={{ gap: spacing.compact, marginHorizontal: spacing.lg }}>
          {recs.map((rec, i) => (
            <RecCard
              key={rec.recId || `${rec.recType}-${i}`}
              rec={rec}
              index={indexOffset + i}
              onAction={onAction}
            />
          ))}
        </View>
      )}
    </View>
  );
}
