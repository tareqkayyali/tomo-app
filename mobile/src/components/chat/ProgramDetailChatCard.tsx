/**
 * Program detail block for AI chat — mirrors ProgramsSection ExpandedBody
 * (metadata, impact, description, prescription chips, why-block, tags, cues).
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SmartIcon } from '../SmartIcon';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../theme';
import type { ProgramDetailCard } from '../../types/chat';

const CREAM_70 = 'rgba(245,243,237,0.70)';
const CREAM_90 = 'rgba(245,243,237,0.90)';

const SOURCE_LABEL: Record<string, string> = {
  coach: 'COACH',
  ai_recommended: 'AI RECOMMENDED',
  player_added: 'PLAYER ADDED',
};

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: colors.tomoSage,
  intermediate: colors.warning,
  advanced: colors.error,
};

function RxChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.rxChip}>
      <Text style={styles.rxLabel}>{label}</Text>
      <Text style={styles.rxValue}>{value}</Text>
    </View>
  );
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  const s = String(v).trim();
  return s || '—';
}

export function ProgramDetailChatCard({ card }: { card: ProgramDetailCard }) {
  const sourceKey = card.source && SOURCE_LABEL[card.source] ? card.source : 'ai_recommended';
  const sourceColor = sourceKey === 'coach' ? colors.accent : colors.tomoSageDim;
  const diff = (card.difficulty || '').toLowerCase();
  const diffColor = DIFFICULTY_COLORS[diff] || colors.textSecondary;
  const ptype = (card.programType || 'physical').toLowerCase();
  const rx = card.prescription ?? {};
  const cues = rx.coachingCues ?? [];
  const weeks = card.durationWeeks ?? null;
  const metaBits = [
    card.frequency,
    card.durationMin != null ? `${card.durationMin} min` : null,
    weeks != null ? `${weeks} wks` : null,
  ].filter(Boolean);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.sourceEyebrow, { color: sourceColor }]} numberOfLines={1}>
        {SOURCE_LABEL[sourceKey]}
      </Text>
      <Text style={styles.programName} numberOfLines={3}>
        {card.name}
      </Text>
      {metaBits.length > 0 ? (
        <Text style={styles.programMeta}>{metaBits.join(' · ')}</Text>
      ) : null}

      <View style={styles.metaRow}>
        {!!card.difficulty && (
          <View style={[styles.diffBadge, { borderColor: diffColor + '66', backgroundColor: diffColor + '22' }]}>
            <Text style={[styles.diffText, { color: diffColor }]}>{card.difficulty}</Text>
          </View>
        )}
        <View
          style={[
            styles.typeBadge,
            { backgroundColor: ptype === 'physical' ? colors.accentSoft : colors.secondarySubtle },
          ]}
        >
          <Text
            style={[
              styles.typeText,
              { color: ptype === 'physical' ? colors.accent : colors.textSecondary },
            ]}
          >
            {ptype}
          </Text>
        </View>
      </View>

      {!!card.impact && (
        <View style={styles.impactBanner}>
          <SmartIcon name="flash" size={14} color={colors.tomoSageDim} />
          <Text style={styles.impactText}>{card.impact}</Text>
        </View>
      )}

      {!!card.positionNote && (
        <View style={styles.positionBadge}>
          <SmartIcon name="football-outline" size={12} color={colors.tomoSage} />
          <Text style={styles.positionBadgeText}>{card.positionNote}</Text>
        </View>
      )}

      {card.phvWarnings && card.phvWarnings.length > 0 && (
        <View style={styles.warningBadge}>
          <SmartIcon name="warning-outline" size={12} color={colors.error} />
          <Text style={styles.warningText}>{card.phvWarnings[0]}</Text>
        </View>
      )}

      {!!card.description && (
        <Text style={styles.descriptionText}>{card.description}</Text>
      )}

      <View style={styles.prescriptionRow}>
        <RxChip label="Sets" value={fmtVal(rx.sets)} />
        <RxChip label="Reps" value={fmtVal(rx.reps)} />
        <RxChip label="Rpe" value={fmtVal(rx.rpe)} />
        <RxChip label="Rest" value={fmtVal(rx.rest)} />
        <RxChip label="Intensity" value={fmtVal(rx.intensity)} />
      </View>

      {card.targetedGaps && card.targetedGaps.length > 0 && (
        <View style={styles.gapHint}>
          <Text style={styles.gapHintLabel}>Benchmark focus</Text>
          <Text style={styles.gapHintText}>{card.targetedGaps.join(' · ')}</Text>
        </View>
      )}

      {!!card.reason && (
        <View style={styles.reasonBlock}>
          <View style={styles.reasonHeader}>
            <SmartIcon name="sparkles-outline" size={12} color={colors.tomoSageDim} />
            <Text style={styles.reasonLabel}>Why this program</Text>
          </View>
          <Text style={styles.reasonText}>{card.reason}</Text>
        </View>
      )}

      {card.tags && card.tags.length > 0 && (
        <View style={styles.tagsRow}>
          {card.tags.slice(0, 6).map((tag) => (
            <View key={tag} style={styles.tagChip}>
              <Text style={styles.tagText}>#{String(tag).replace(/_/g, '')}</Text>
            </View>
          ))}
        </View>
      )}

      {cues.length > 0 && (
        <View style={styles.cuesBlock}>
          <Text style={styles.cuesTitle}>Coaching cues</Text>
          {cues.map((c, i) => (
            <View key={i} style={styles.cueRow}>
              <Text style={styles.cueBullet}>{'\u2022'}</Text>
              <Text style={styles.cueText}>{c}</Text>
            </View>
          ))}
        </View>
      )}

      {card.phvWarnings && card.phvWarnings.length > 1 && (
        <View style={styles.phvExpandedBlock}>
          <Text style={styles.phvExpandedTitle}>Growth considerations</Text>
          {card.phvWarnings.map((w, i) => (
            <Text key={i} style={styles.phvExpandedText}>
              • {w}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.cream03,
    borderWidth: 1,
    borderColor: colors.cream10,
    gap: spacing.sm,
  },
  sourceEyebrow: {
    fontFamily: fontFamily.semiBold,
    fontSize: 9.5,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  programName: {
    fontFamily: fontFamily.semiBold,
    fontSize: 17,
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  programMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 4,
  },
  diffBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
  },
  diffText: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    textTransform: 'capitalize',
  },
  typeBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  typeText: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
  },
  impactBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.sage08,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    marginTop: 4,
  },
  impactText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.tomoSageDim,
  },
  positionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: borderRadius.md,
    backgroundColor: colors.tomoSage + '12',
  },
  positionBadgeText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.tomoSage,
  },
  warningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.secondarySubtle,
  },
  warningText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.error,
  },
  descriptionText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  prescriptionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  rxChip: {
    minWidth: 52,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: colors.cream03,
    borderWidth: 1,
    borderColor: colors.cream10,
  },
  rxLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 9,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  rxValue: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.textPrimary,
    marginTop: 2,
  },
  gapHint: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.cream06,
    borderWidth: 1,
    borderColor: colors.cream10,
  },
  gapHintLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    letterSpacing: 0.6,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  gapHintText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: CREAM_70,
  },
  reasonBlock: {
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.cream03,
    borderWidth: 1,
    borderColor: colors.cream10,
  },
  reasonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  reasonLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.tomoSageDim,
  },
  reasonText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: CREAM_70,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.cream06,
    borderWidth: 1,
    borderColor: colors.cream10,
  },
  tagText: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: CREAM_70,
  },
  cuesBlock: {
    marginTop: 4,
  },
  cuesTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: CREAM_90,
    marginBottom: 6,
  },
  cueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 4,
  },
  cueBullet: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 1,
  },
  cueText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: CREAM_70,
  },
  phvExpandedBlock: {
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.secondarySubtle,
  },
  phvExpandedTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.error,
    marginBottom: 4,
  },
  phvExpandedText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.error,
  },
});
