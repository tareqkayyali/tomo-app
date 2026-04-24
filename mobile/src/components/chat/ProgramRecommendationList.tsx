/**
 * Program recommendation list — card-based layout for AI chat.
 * Each program shown as an actionable card with details + buttons.
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../theme';
import type { ProgramRecommendationCard, ProgramRecommendationItem } from '../../types/chat';

type ItemExtras = ProgramRecommendationItem & {
  impact?: string;
  description?: string;
  frequency?: string;
  durationWeeks?: number;
};

function formatMeta(p: ItemExtras): string {
  const parts: string[] = [];

  const fr = p.frequency;
  if (typeof fr === 'string' && fr.trim()) {
    parts.push(
      fr.trim()
        .replace(/\s*\/\s*week/gi, 'x/week')
        .replace(/\/\s*wk/gi, 'x/week')
        .replace(/\s+/g, ' '),
    );
  } else if (p.weeklyFrequency != null && p.weeklyFrequency > 0) {
    parts.push(`${p.weeklyFrequency}x/week`);
  }

  if (typeof p.durationWeeks === 'number' && p.durationWeeks > 0) {
    parts.push(`${p.durationWeeks} week${p.durationWeeks === 1 ? '' : 's'}`);
  }

  return parts.join(' · ');
}

function programBlurb(p: ItemExtras): string {
  const impact = typeof p.impact === 'string' ? p.impact.trim() : '';
  if (impact) return impact.slice(0, 240);
  const desc = typeof p.description === 'string' ? p.description.trim() : '';
  if (desc) return desc.split('\n')[0].slice(0, 240);
  const sp = p.startingPoint?.trim();
  if (sp) return sp.slice(0, 240);
  const pn = p.positionNote?.trim();
  if (pn) return pn.slice(0, 240);
  return '';
}

const PRIORITY_BADGE: Record<string, { label: string; color: string }> = {
  mandatory: { label: 'Top Pick', color: colors.accent1 },
  high:      { label: 'Top Pick', color: colors.accent1 },
  medium:    { label: 'Recommended', color: colors.accent2 },
};

export type ProgramRecommendationListProps = {
  card: ProgramRecommendationCard;
  onChipPress?: (message: string) => void;
};

export function ProgramRecommendationList({
  card,
  onChipPress,
}: ProgramRecommendationListProps) {
  const programs = useMemo(
    () => (Array.isArray(card.programs) ? card.programs.slice(0, 5) : []) as ItemExtras[],
    [card.programs],
  );

  const headline = useMemo(() => {
    if (card.listHeadline?.trim()) return card.listHeadline.trim();
    return 'Your programs';
  }, [card.listHeadline]);

  const subtitle = useMemo(() => {
    const s = card.listSubtitle?.trim() || card.weeklyPlanSuggestion?.trim();
    return s || '';
  }, [card.listSubtitle, card.weeklyPlanSuggestion]);

  if (programs.length === 0) {
    return (
      <View style={styles.block}>
        <Text style={styles.headline}>{headline}</Text>
        <Text style={styles.subtitle}>No programs yet. Ask again in a moment.</Text>
      </View>
    );
  }

  return (
    <View style={styles.block}>
      <Text style={styles.headline}>{headline}</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

      {programs.map((p, index) => {
        const blurb = programBlurb(p);
        const meta = formatMeta(p);
        const badgeConfig = index === 0
          ? (PRIORITY_BADGE[p.priority] ?? PRIORITY_BADGE.high)
          : (PRIORITY_BADGE[p.priority] ?? null);

        return (
          <View
            key={p.programId || `${p.name}-${index}`}
            style={styles.card}
          >
            {badgeConfig && (
              <View style={[styles.badge, { backgroundColor: badgeConfig.color + '22' }]}>
                <Text style={[styles.badgeText, { color: badgeConfig.color }]}>
                  {badgeConfig.label}
                </Text>
              </View>
            )}

            <Text style={styles.programName} numberOfLines={3}>
              {p.name}
            </Text>

            {!!meta && (
              <Text style={styles.meta}>{meta}</Text>
            )}

            {!!blurb && (
              <Text style={styles.blurb} numberOfLines={4}>
                {blurb}
              </Text>
            )}

            <View style={styles.buttonRow}>
              <Pressable
                style={({ pressed }) => [styles.btn, styles.btnOutlined, pressed && styles.btnPressed]}
                onPress={() => onChipPress?.(`Explain my ${p.name} program drills`)}
                accessibilityRole="button"
                accessibilityLabel={`Program Details for ${p.name}`}
              >
                <Text style={styles.btnOutlinedText}>Program Details</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.btn, styles.btnFilled, pressed && styles.btnPressed]}
                onPress={() => onChipPress?.(`Add "${p.name}" to my training`)}
                accessibilityRole="button"
                accessibilityLabel={`Add ${p.name} to training`}
              >
                <Text style={styles.btnFilledText}>Add to Training</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  headline: {
    fontFamily: fontFamily.semiBold,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.35,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  card: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  badgeText: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    letterSpacing: 0.2,
  },
  programName: {
    fontFamily: fontFamily.semiBold,
    fontSize: 17,
    lineHeight: 23,
    color: colors.textPrimary,
  },
  meta: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    marginTop: -2,
  },
  blurb: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  btn: {
    flex: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutlined: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  btnFilled: {
    backgroundColor: colors.accent1,
  },
  btnPressed: {
    opacity: 0.7,
  },
  btnOutlinedText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  btnFilledText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textOnDark,
  },
});
