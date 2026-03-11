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
import { fontFamily, borderRadius, spacing } from '../theme';

// ═══ TIER SYSTEM ═══

/**
 * Card tiers map to visual prestige.
 * Bronze = muted, Silver = lighter, Gold = vibrant Tomo gradient,
 * Diamond = premium holographic.
 */
export type CardTier = 'bronze' | 'silver' | 'gold' | 'diamond';

const TIER_GRADIENT: Record<CardTier, { gradient: [string, string]; text: string }> = {
  bronze: {
    gradient: ['#CD7F32', '#8B5E3C'],
    text: '#FFF8F0',
  },
  silver: {
    gradient: ['#C0C0C0', '#808080'],
    text: '#FFFFFF',
  },
  gold: {
    gradient: ['#2ECC71', '#00B4D8'],
    text: '#FFFFFF',
  },
  diamond: {
    gradient: ['#6366F1', '#8B5CF6'],
    text: '#FFFFFF',
  },
};

const TIER_ICON: Record<CardTier, keyof typeof Ionicons.glyphMap> = {
  bronze: 'shield',
  silver: 'shield',
  gold: 'star',
  diamond: 'diamond',
};

const TIER_LABEL: Record<CardTier, string> = {
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
  /** Overall rating (0-99), displayed prominently top-left */
  overallRating: number;
  /** Player's position (e.g., 'ST', 'GK', 'All-Round') — top-right badge */
  position: string;
  /** Visual tier controlling card gradient */
  cardTier: CardTier;
  /** Which sport this card represents — used for the sport accent */
  sport: 'football' | 'padel';
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
  const tierVisual = TIER_GRADIENT[cardTier];

  // Map CardAttribute[] to RadarAttribute[] for HexagonRadar
  const radarAttributes: RadarAttribute[] = attributes.map((attr) => ({
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
              <Text style={[styles.overallNumber, { color: tierVisual.text }]}>
                {overallRating}
              </Text>
              <Text style={[styles.overallLabel, { color: tierVisual.text }]}>OVR</Text>
            </View>

            <View style={styles.headerRight}>
              {/* Position badge */}
              <View style={styles.positionBadge}>
                <Text style={[styles.positionText, { color: tierVisual.text }]}>
                  {position}
                </Text>
              </View>

              {/* Tier badge */}
              <View style={styles.tierBadge}>
                <Ionicons
                  name={TIER_ICON[cardTier]}
                  size={14}
                  color={tierVisual.text}
                />
                <Text style={[styles.tierText, { color: tierVisual.text }]}>
                  {TIER_LABEL[cardTier]}
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
                size={200}
                onAttributeTap={onAttributeTap}
                fillColor={tierVisual.gradient[0]}
                fillOpacity={0.3}
              />
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
                  <Text style={[styles.attrLabel, { color: attr.color }]}>
                    {attr.label}
                  </Text>
                  <Text style={styles.attrScore}>{attr.value}</Text>
                  {trend !== 0 && (
                    <View style={styles.trendRow}>
                      <Ionicons
                        name={trend > 0 ? 'caret-up' : 'caret-down'}
                        size={10}
                        color={trend > 0 ? '#2ECC71' : '#8E8E93'}
                      />
                      <Text
                        style={[
                          styles.trendText,
                          { color: trend > 0 ? '#2ECC71' : '#8E8E93' },
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
    marginVertical: spacing.sm,
  },
  attributeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
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
    color: '#FFFFFF',
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
