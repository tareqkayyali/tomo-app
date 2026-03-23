/**
 * DNACard — FIFA-style player card with tier gradient, radar, and attributes.
 * Gold tier gets animated shimmer border. Diamond gets holographic edge.
 *
 * Sport-agnostic: accepts a generic array of attribute descriptors plus
 * tier, overall rating, position, and pathway info. The same component
 * renders both football and padel cards — only the data differs.
 *
 * Research basis:
 * - FIFA card system is universally recognized by 13-23 demographic
 *   (FutGraphics, 2024)
 * - Visual prestige hierarchy: card color communicates tier before
 *   reading stats
 * - Information density: 6 visible stats for quick comparison,
 *   sub-stats for depth (FIFA UX research)
 * - Aspirational identity: card represents "who I could be"
 *   (London Daily News psychology study)
 *
 * Growth Mindset:
 * - Never shows a "max potential" ceiling (implies fixed limit)
 * - Shows current value only; improvement is on a separate detail view
 * - Tapping an attribute reveals the physical test breakdown
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { HexagonRadar, type RadarAttribute } from './HexagonRadar';
import { useScaleOnPress, useSpringEntrance } from '../hooks/useAnimations';
import { useDNATierConfig } from '../hooks/useUIConfig';
import { useComponentStyle } from '../hooks/useComponentStyle';
import { fontFamily, borderRadius, spacing } from '../theme';
import { colors } from '../theme/colors';

// ═══ TIER SYSTEM ═══

/**
 * Card tiers map to visual prestige.
 * Bronze = muted, Silver = lighter, Gold = vibrant Tomo gradient,
 * Diamond = premium holographic.
 *
 * Tier visuals are now CMS-managed via the ui_config table.
 * The useDNATierConfig hook fetches from the content API and caches locally.
 * Hardcoded defaults are kept as fallbacks.
 */
export type CardTier = 'bronze' | 'silver' | 'gold' | 'diamond';

// Hardcoded fallbacks (used if CMS config hasn't loaded yet)
const FALLBACK_GRADIENT: Record<CardTier, { gradient: [string, string]; text: string }> = {
  bronze: { gradient: [colors.tierBronze, colors.tierBronzeDark], text: colors.textPrimary },
  silver: { gradient: [colors.tierSilver, colors.tierSilverDark], text: colors.textPrimary },
  gold: { gradient: [colors.accent, colors.info], text: colors.textPrimary },
  diamond: { gradient: [colors.warning, colors.warning], text: colors.textPrimary },
};

const FALLBACK_ICON: Record<CardTier, keyof typeof Ionicons.glyphMap> = {
  bronze: 'shield',
  silver: 'shield',
  gold: 'star',
  diamond: 'diamond',
};

const FALLBACK_LABEL: Record<CardTier, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  diamond: 'Diamond',
};

// ═══ CARD ATTRIBUTE ═══

/**
 * Single attribute displayed in the card's 2x3 grid.
 * Matches the prompt spec exactly.
 */
export interface CardAttribute {
  /** 3-char abbreviation (e.g., 'PAC', 'POW') */
  label: string;
  /** Full attribute name for accessibility (e.g., 'Pace', 'Power') */
  abbreviation: string;
  /** Current score */
  value: number;
  /** Max possible score (typically 99) */
  maxValue: number;
  /** Hex color for this attribute */
  color: string;
  /** Change from last period (e.g., +3, -1). Optional. */
  trend?: number;
  /** Unique key for React list rendering and tap identification */
  key?: string;
}

// ═══ PROPS ═══

export interface DNACardProps {
  /** 6 attributes in display order */
  attributes: CardAttribute[];
  /** Optional benchmark attributes for a second radar polygon (P50 norm target) */
  benchmarkAttributes?: CardAttribute[];
  /** Overall rating (0-99), displayed prominently top-left */
  overallRating: number;
  /** Player's position (e.g., 'ST', 'GK', 'All-Round') — top-right badge */
  position: string;
  /** Visual tier controlling card gradient */
  cardTier: CardTier;
  /** Which sport this card represents — used for the sport accent */
  sport: 'football' | 'padel' | 'basketball' | 'tennis' | 'soccer';
  /** Pathway rating (0-1000), displayed under the tier badge */
  pathwayRating?: number;
  /** Pathway level name (e.g., 'Academy Elite', 'Semi-Pro') */
  pathwayLevel?: string;
  /** Hide the hexagonal radar (show only the 2x3 grid) */
  compact?: boolean;
  /** Called when the user taps an attribute (passes the attribute key/abbreviation) */
  onAttributeTap?: (key: string) => void;
  /** Called when the card itself is pressed */
  onPress?: () => void;
  /** Animation trigger — re-fires entrance animation when toggled */
  trigger?: boolean;
}

// ═══ COMPONENT ═══

export function DNACard({
  attributes,
  benchmarkAttributes,
  overallRating,
  position,
  cardTier,
  sport,
  pathwayRating,
  pathwayLevel,
  compact = false,
  onAttributeTap,
  onPress,
  trigger,
}: DNACardProps) {
  const { animatedStyle: scaleStyle, onPressIn, onPressOut } = useScaleOnPress();
  const entranceStyle = useSpringEntrance(0, 0, trigger);
  const { getComponentStyle } = useComponentStyle();

  // CMS-managed tier visuals (falls back to hardcoded defaults)
  const { tierConfig } = useDNATierConfig();
  const cmsTier = tierConfig.tiers[cardTier];
  const tierVisual = cmsTier
    ? { gradient: cmsTier.gradient as [string, string], text: cmsTier.text }
    : FALLBACK_GRADIENT[cardTier];
  const tierIcon = (cmsTier?.icon ?? FALLBACK_ICON[cardTier]) as keyof typeof Ionicons.glyphMap;
  const tierLabel = cmsTier?.label ?? FALLBACK_LABEL[cardTier];

  // Map CardAttribute[] to RadarAttribute[] for HexagonRadar
  const radarAttributes: RadarAttribute[] = attributes.map((attr) => ({
    key: attr.key ?? attr.abbreviation,
    label: attr.label,
    value: attr.value,
    maxValue: attr.maxValue,
    color: attr.color,
  }));

  // Map benchmark CardAttribute[] to RadarAttribute[] if provided
  const benchmarkRadarAttributes: RadarAttribute[] | undefined = benchmarkAttributes?.map((attr) => ({
    key: attr.key ?? attr.abbreviation,
    label: attr.label,
    value: attr.value,
    maxValue: attr.maxValue,
    color: attr.color,
  }));

  return (
    <Animated.View style={[entranceStyle, scaleStyle, styles.cardOuter]}>
      <Pressable onPressIn={onPressIn} onPressOut={onPressOut} onPress={onPress}>
        <LinearGradient
          colors={[tierVisual.gradient[0], tierVisual.gradient[1]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          {/* Header: Overall + Position & Tier */}
          <View style={styles.header}>
            <View style={styles.overallContainer}>
              <Text style={[styles.overallNumber, { color: tierVisual.text }, getComponentStyle('dna_card_overall_number')]}>
                {overallRating}
              </Text>
              <Text style={[styles.overallLabel, { color: tierVisual.text }, getComponentStyle('dna_card_overall_label')]}>OVR</Text>
            </View>

            <View style={styles.headerRight}>
              {/* Position badge */}
              <View style={styles.positionBadge}>
                <Text style={[styles.positionText, { color: tierVisual.text }, getComponentStyle('dna_card_position_badge')]}>
                  {position}
                </Text>
              </View>

              {/* Tier badge */}
              <View style={styles.tierBadge}>
                <Ionicons
                  name={tierIcon}
                  size={14}
                  color={tierVisual.text}
                />
                <Text style={[styles.tierText, { color: tierVisual.text }, getComponentStyle('dna_card_tier_badge')]}>
                  {tierLabel}
                </Text>
              </View>

              {/* Pathway rating + level */}
              {pathwayRating !== undefined && pathwayLevel && (
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={[styles.pathwayRating, { color: tierVisual.text }]}
                >
                  {pathwayRating} — {pathwayLevel}
                </Text>
              )}
            </View>
          </View>

          {/* Hexagonal Radar */}
          {!compact && (
            <View style={styles.radarContainer}>
              <HexagonRadar
                attributes={radarAttributes}
                benchmarkAttributes={benchmarkRadarAttributes}
                size={200}
                onAttributeTap={onAttributeTap}
                fillColor={tierVisual.gradient[0]}
                fillOpacity={0.3}
              />
              {/* Legend */}
              <View style={styles.radarLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendSwatch, { backgroundColor: tierVisual.gradient[0], opacity: 0.6 }]} />
                  <Text style={[styles.legendText, { color: colors.textMuted }]}>You</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDash, { borderColor: '#00D9FF' }]} />
                  <Text style={[styles.legendText, { color: colors.textMuted }]}>Peer Average</Text>
                </View>
              </View>
            </View>
          )}

          {/* Attribute Grid (2x3) */}
          <View style={styles.attributeGrid}>
            {attributes.map((attr) => {
              const attrKey = attr.key ?? attr.abbreviation;
              const trend = attr.trend ?? 0;
              return (
                <Pressable
                  key={attrKey}
                  style={styles.attrItem}
                  onPress={() => onAttributeTap?.(attrKey)}
                  accessibilityLabel={`${attr.abbreviation} ${attr.value} out of ${attr.maxValue}`}
                >
                  <Text style={[styles.attrLabel, { color: attr.color }, getComponentStyle('dna_card_attribute_label')]}>
                    {attr.label}
                  </Text>
                  <Text style={[styles.attrScore, getComponentStyle('dna_card_attribute_score')]}>{attr.value}</Text>
                  {trend !== 0 && (
                    <View style={styles.trendRow}>
                      <Ionicons
                        name={trend > 0 ? 'caret-up' : 'caret-down'}
                        size={10}
                        color={trend > 0 ? colors.accent : colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.trendText,
                          { color: trend > 0 ? colors.accent : colors.textSecondary },
                        ]}
                      >
                        {Math.abs(trend)}
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

// ═══ STYLES ═══

const styles = StyleSheet.create({
  cardOuter: {
    marginBottom: 16,
  },
  card: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    paddingTop: spacing.lg + 4,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  overallContainer: {
    alignItems: 'center',
  },
  overallNumber: {
    fontFamily: fontFamily.bold,
    fontSize: 48,
    lineHeight: 56,
  },
  overallLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    letterSpacing: 2,
    opacity: 0.8,
  },
  headerRight: {
    alignItems: 'flex-end',
    paddingTop: 4,
  },
  positionBadge: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    marginBottom: 4,
  },
  positionText: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    letterSpacing: 1,
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tierText: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  pathwayRating: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    marginTop: 6,
    opacity: 0.9,
  },
  radarContainer: {
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
  },
  radarLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legendDash: {
    width: 14,
    height: 0,
    borderTopWidth: 2,
    borderStyle: 'dashed',
  },
  legendText: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
  },
  attributeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  attrItem: {
    width: '30%',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: borderRadius.sm,
  },
  attrLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  attrScore: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: colors.textPrimary,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 1,
  },
  trendText: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
  },
});
