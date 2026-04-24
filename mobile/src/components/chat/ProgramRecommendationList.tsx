/**
 * Program recommendation list — Pulse-style ranked program block for AI chat.
 * Replaces the generic Table layout for program_recommendation cards.
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  type StyleProp,
  type ViewStyle,
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

const NUM_WORDS = ['One', 'Two', 'Three', 'Four', 'Five'] as const;

function countWord(n: number): string {
  if (n >= 1 && n <= 5) return NUM_WORDS[n - 1];
  return String(n);
}

function formatWeeksLabel(p: ItemExtras): string {
  if (typeof p.durationWeeks === 'number' && p.durationWeeks > 0) {
    return `${p.durationWeeks} wk${p.durationWeeks === 1 ? '' : 's'}`;
  }
  return '—';
}

function formatFrequency(p: ItemExtras): string {
  const fr = p.frequency;
  if (typeof fr === 'string' && fr.trim()) {
    return fr
      .trim()
      .replace(/\s*\/\s*week/gi, 'x/wk')
      .replace(/\/\s*wk/gi, 'x/wk')
      .replace(/\s+/g, '');
  }
  const n = p.weeklyFrequency;
  if (n != null && n > 0) return `${n}x/wk`;
  return '—';
}

function programBlurb(p: ItemExtras): string {
  const impact = typeof p.impact === 'string' ? p.impact.trim() : '';
  if (impact) return impact.slice(0, 220);
  const desc = typeof p.description === 'string' ? p.description.trim() : '';
  if (desc) return desc.split('\n')[0].slice(0, 220);
  const sp = p.startingPoint?.trim();
  if (sp) return sp.slice(0, 220);
  const pn = p.positionNote?.trim();
  if (pn) return pn.slice(0, 220);
  const cat = (p.category || 'performance').replace(/_/g, ' ');
  return `Builds your ${cat} — matched to your profile.`;
}

function TopPickBadge() {
  return (
    <View style={badgeStyles.wrap}>
      <View style={badgeStyles.topOutline}>
        <Text style={badgeStyles.topText}>TOP</Text>
      </View>
      <View style={badgeStyles.pickFill}>
        <Text style={badgeStyles.pickText}>PICK</Text>
      </View>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing.sm,
    flexShrink: 0,
  },
  topOutline: {
    borderWidth: 1,
    borderColor: colors.textSecondary,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
  },
  topText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 9,
    letterSpacing: 0.5,
    color: colors.textSecondary,
  },
  pickFill: {
    backgroundColor: colors.accent,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
    marginLeft: 3,
  },
  pickText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 9,
    letterSpacing: 0.4,
    color: colors.textOnAccent,
  },
});

function RowDivider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.rowDivider, style]} />;
}

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
    const n = programs.length;
    if (n <= 0) return 'Programs for you';
    return `${countWord(n)} program${n === 1 ? '' : 's'}, ranked for you`;
  }, [card.listHeadline, programs.length]);

  const subtitle = useMemo(() => {
    const s = card.listSubtitle?.trim() || card.weeklyPlanSuggestion?.trim();
    return s || '';
  }, [card.listSubtitle, card.weeklyPlanSuggestion]);

  const cta = useMemo(() => {
    if (card.primaryCta?.label?.trim() && card.primaryCta.message?.trim()) {
      return { label: card.primaryCta.label.trim(), message: card.primaryCta.message.trim() };
    }
    const first = programs[0];
    if (!first?.name) return null;
    const short = first.name.split('—')[0].trim();
    return {
      label: `Start ${short} this week`,
      message: `I want to add "${first.name}" to my training`,
    };
  }, [card.primaryCta, programs]);

  if (programs.length === 0) {
    return (
      <View style={styles.block}>
        <Text style={styles.headline}>{headline}</Text>
        <Text style={styles.subtitleMuted}>
          No programs in this response yet. Ask again in a moment.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.block}>
      <Text style={styles.headline}>{headline}</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

      <RowDivider style={styles.dividerAfterIntro} />

      {programs.map((p, index) => {
        const idx = String(index + 1).padStart(2, '0');
        const showTopPick = index === 0;
        const blurb = programBlurb(p);

        return (
          <View key={p.programId || `${p.name}-${index}`}>
            <View style={styles.programRow}>
              <Text style={styles.indexCol}>{idx}</Text>
              <View style={styles.metaCol}>
                <Text style={styles.metaLine}>{formatWeeksLabel(p)}</Text>
                <Text style={styles.metaLine}>{formatFrequency(p)}</Text>
              </View>
              <View style={styles.contentCol}>
                <View style={styles.titleRow}>
                  <Text style={styles.programTitle} numberOfLines={2}>
                    {p.name}
                  </Text>
                  {showTopPick ? <TopPickBadge /> : null}
                </View>
                <Text style={styles.blurb}>{blurb}</Text>
              </View>
            </View>
            {index < programs.length - 1 ? <RowDivider /> : null}
          </View>
        );
      })}

      {cta && onChipPress ? (
        <Pressable
          onPress={() => onChipPress(cta.message)}
          style={({ pressed }) => [styles.ctaWrap, pressed && styles.ctaPressed]}
          accessibilityRole="button"
          accessibilityLabel={cta.label}
        >
          <Text style={styles.ctaText}>{cta.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    width: '100%',
    marginTop: spacing.xs,
  },
  headline: {
    fontFamily: fontFamily.semiBold,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.35,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  subtitleMuted: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    width: '100%',
  },
  dividerAfterIntro: {
    marginBottom: spacing.sm,
  },
  programRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  indexCol: {
    width: 28,
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textSecondary,
    paddingTop: 2,
  },
  metaCol: {
    width: 56,
    gap: 2,
  },
  metaLine: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  contentCol: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 4,
  },
  programTitle: {
    flexShrink: 1,
    minWidth: 0,
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  blurb: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  ctaWrap: {
    marginTop: spacing.lg,
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  ctaPressed: {
    opacity: 0.65,
  },
  ctaText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.accent,
  },
});
