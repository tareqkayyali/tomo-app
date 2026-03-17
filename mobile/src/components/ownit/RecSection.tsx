/**
 * RecSection — Groups recommendations by domain with section header.
 * Renders RecCard for each rec with staggered entrance animation.
 */

import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RecCard } from './RecCard';
import { useTheme } from '../../hooks/useTheme';
import { spacing, fontFamily } from '../../theme';
import type { ForYouRecommendation } from './RecCard';

interface RecSectionProps {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  recs: ForYouRecommendation[];
  emptyMessage?: string;
  /** Base index offset for stagger animation */
  indexOffset?: number;
}

export function RecSection({
  title,
  icon,
  color,
  recs,
  emptyMessage,
  indexOffset = 0,
}: RecSectionProps) {
  const { colors } = useTheme();

  // Don't render section at all if no recs and no empty message
  if (recs.length === 0 && !emptyMessage) return null;

  return (
    <View style={{ marginTop: spacing.xl }}>
      {/* Section Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          marginHorizontal: spacing.lg,
          marginBottom: spacing.compact,
        }}
      >
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
      </View>

      {/* Recommendation Cards */}
      {recs.length > 0 ? (
        <View style={{ gap: spacing.compact, marginHorizontal: spacing.lg }}>
          {recs.map((rec, i) => (
            <RecCard key={rec.recId || `${rec.recType}-${i}`} rec={rec} index={indexOffset + i} />
          ))}
        </View>
      ) : emptyMessage ? (
        <View style={{ marginHorizontal: spacing.lg, paddingVertical: spacing.md }}>
          <Text
            style={{
              fontFamily: fontFamily.regular,
              fontSize: 12,
              color: colors.textMuted,
              textAlign: 'center',
              fontStyle: 'italic',
            }}
          >
            {emptyMessage}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
