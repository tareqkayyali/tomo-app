/**
 * ProgramsSection — Gen Z redesign with natural language impact communication.
 *
 * Shows programs grouped by priority (Must Do / Recommended / Supplementary)
 * with weekly overview, position-specific insights, and impact descriptions
 * that communicate WHY each program matters in language athletes understand.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { spacing, fontFamily, borderRadius } from '../../theme';
import { GlassCard } from '../GlassCard';
import { GlowWrapper } from '../GlowWrapper';
import type { OutputSnapshot } from '../../services/api';

interface Props {
  programs: OutputSnapshot['programs'];
  gaps?: string[];
}

const PRIORITY_COLORS: Record<string, string> = {
  mandatory: '#FF453A',
  high: '#FF9500',
  medium: '#30D158',
};

const PRIORITY_LABELS: Record<string, string> = {
  mandatory: '🔥 Must Do',
  high: '⭐ Recommended',
  medium: '💡 Supplementary',
};

const PRIORITY_DESCRIPTIONS: Record<string, string> = {
  mandatory: 'These are non-negotiable for your position — skip these and you fall behind',
  high: 'Highly recommended to level up your game — prioritize these after must-dos',
  medium: 'Extra work to separate you from the pack — do these when time allows',
};

const CATEGORY_EMOJI: Record<string, string> = {
  sprint: '⚡', sled: '🛷', strength: '💪', nordic: '🦵', plyometric: '🦘',
  agility: '🔀', endurance: '🫁', power: '💥', hip_mobility: '🧘', acl_prevention: '🛡️',
  groin: '🦿', ankle_stability: '⚓', passing: '🎯', shooting: '⚽', dribbling: '🏃',
  first_touch: '🤲', crossing: '📐', heading: '🧠', defensive: '🏰', goalkeeping: '🧤',
  set_piece: '🎪', tactical: '♟️', scanning: '👁️', combination_play: '🤝',
};

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: '#30D158',
  intermediate: '#FF9500',
  advanced: '#FF453A',
};

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function ProgramsSection({ programs, gaps = [] }: Props) {
  const { colors } = useTheme();
  const { recommendations, weeklyPlanSuggestion, weeklyStructure, playerProfile } = programs;

  if (recommendations.length === 0) {
    return (
      <GlassCard>
        <View style={styles.emptyState}>
          <Ionicons name="barbell-outline" size={40} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.textOnDark }]}>No Programs Yet</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
            Complete your profile (height, weight, position) to get personalized training programs.
          </Text>
        </View>
      </GlassCard>
    );
  }

  // Group by priority
  const mandatory = recommendations.filter((r) => r.priority === 'mandatory');
  const high = recommendations.filter((r) => r.priority === 'high');
  const medium = recommendations.filter((r) => r.priority === 'medium');

  // Count physical vs technical
  const physicalCount = recommendations.filter((r) => r.type === 'physical').length;
  const technicalCount = recommendations.filter((r) => r.type === 'technical').length;

  // Weekly structure for day dots
  const totalWeeklySessions = weeklyStructure
    ? Object.values(weeklyStructure).reduce((a, b) => a + b, 0)
    : mandatory.length + Math.min(high.length, 3);

  return (
    <View style={styles.container}>
      {/* ── Hero: Your Training Blueprint ─────────────────────── */}
      <GlowWrapper glow="subtle">
        <GlassCard>
          <Text style={[styles.heroTitle, { color: colors.textOnDark }]}>
            Your Training Blueprint
          </Text>
          <Text style={[styles.heroSubtitle, { color: colors.textMuted }]}>
            Personalized for {playerProfile.position === 'ALL' ? 'your position' : playerProfile.position} · {playerProfile.ageBand}
          </Text>

          {/* Quick stats row */}
          <View style={styles.statsRow}>
            <View style={[styles.statChip, { backgroundColor: '#FF453A18' }]}>
              <Text style={[styles.statValue, { color: '#FF453A' }]}>{mandatory.length}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>Must Do</Text>
            </View>
            <View style={[styles.statChip, { backgroundColor: '#FF950018' }]}>
              <Text style={[styles.statValue, { color: '#FF9500' }]}>{high.length}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>Recommended</Text>
            </View>
            <View style={[styles.statChip, { backgroundColor: '#30D15818' }]}>
              <Text style={[styles.statValue, { color: '#30D158' }]}>{physicalCount}⚡ {technicalCount}⚽</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>Physical · Technical</Text>
            </View>
          </View>

          {/* Week at a glance */}
          <View style={styles.weekRow}>
            {DAY_LABELS.map((day, i) => {
              const isRest = i >= 5;
              const isTraining = !isRest && i < Math.min(totalWeeklySessions, 5);
              const dotColor = isRest ? colors.textMuted
                : isTraining ? '#FF6B35'
                : colors.glassBorder;
              return (
                <View key={day} style={styles.dayCol}>
                  <View style={[styles.dayDot, { backgroundColor: dotColor }]} />
                  <Text style={[styles.dayLabel, { color: colors.textMuted }]}>{day}</Text>
                </View>
              );
            })}
          </View>

          {weeklyPlanSuggestion && (
            <Text style={[styles.weekSuggestion, { color: colors.textMuted }]}>
              {weeklyPlanSuggestion}
            </Text>
          )}

          {/* Weekly structure chips */}
          {weeklyStructure && (
            <View style={styles.structureRow}>
              {Object.entries(weeklyStructure).map(([key, val]) => (
                <View key={key} style={[styles.structureChip, { backgroundColor: colors.glass }]}>
                  <Text style={[styles.structureText, { color: colors.textMuted }]}>
                    {key.charAt(0).toUpperCase() + key.slice(1)} {val}x
                  </Text>
                </View>
              ))}
            </View>
          )}
        </GlassCard>
      </GlowWrapper>

      {/* ── Gap Connection Banner ──────────────────────────────── */}
      {gaps.length > 0 && (
        <GlassCard>
          <View style={styles.gapHeader}>
            <Ionicons name="analytics-outline" size={18} color={colors.accent1} />
            <Text style={[styles.gapTitle, { color: colors.textOnDark }]}>
              Based on your test results
            </Text>
          </View>
          <Text style={[styles.gapSubtitle, { color: colors.textMuted }]}>
            We've added programs targeting your weakest areas
          </Text>
          <View style={styles.gapChips}>
            {gaps.slice(0, 3).map((gap) => (
              <View key={gap} style={styles.gapChipRow}>
                <View style={[styles.gapChip, { backgroundColor: 'rgba(255, 149, 0, 0.15)' }]}>
                  <Ionicons name="trending-down" size={12} color="#FF9500" />
                  <Text style={[styles.gapChipText, { color: '#FF9500' }]}>{gap}</Text>
                </View>
                <Ionicons name="arrow-forward" size={14} color={colors.accent1} />
                <Text style={[styles.gapArrowText, { color: colors.accent1 }]}>Program added</Text>
              </View>
            ))}
          </View>
        </GlassCard>
      )}

      {/* ── Priority Groups ────────────────────────────────────── */}
      {mandatory.length > 0 && (
        <PriorityGroup label="mandatory" programs={mandatory} colors={colors} />
      )}
      {high.length > 0 && (
        <PriorityGroup label="high" programs={high} colors={colors} />
      )}
      {medium.length > 0 && (
        <PriorityGroup label="medium" programs={medium} colors={colors} />
      )}
    </View>
  );
}

// ── Priority Group ──────────────────────────────────────────────────────

function PriorityGroup({ label, programs, colors }: {
  label: string;
  programs: OutputSnapshot['programs']['recommendations'];
  colors: any;
}) {
  const priorityColor = PRIORITY_COLORS[label] || '#666';
  const displayLabel = PRIORITY_LABELS[label] || label;
  const description = PRIORITY_DESCRIPTIONS[label] || '';

  // Show first 5 collapsed, rest behind "show more"
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? programs : programs.slice(0, 5);
  const hasMore = programs.length > 5;

  return (
    <View style={styles.group}>
      <View style={styles.groupHeader}>
        <View style={[styles.priorityDot, { backgroundColor: priorityColor }]} />
        <Text style={[styles.groupLabel, { color: colors.textOnDark }]}>{displayLabel}</Text>
        <View style={[styles.countBadge, { backgroundColor: priorityColor + '22' }]}>
          <Text style={[styles.countBadgeText, { color: priorityColor }]}>{programs.length}</Text>
        </View>
      </View>
      <Text style={[styles.groupDesc, { color: colors.textMuted }]}>{description}</Text>

      {visible.map((p) => (
        <ProgramCard key={p.programId} program={p} colors={colors} />
      ))}

      {hasMore && !showAll && (
        <Pressable onPress={() => setShowAll(true)}>
          <View style={[styles.showMoreBtn, { backgroundColor: colors.glass }]}>
            <Text style={[styles.showMoreText, { color: colors.accent1 }]}>
              Show {programs.length - 5} more
            </Text>
            <Ionicons name="chevron-down" size={14} color={colors.accent1} />
          </View>
        </Pressable>
      )}
    </View>
  );
}

// ── Program Card ────────────────────────────────────────────────────────

function ProgramCard({ program, colors }: {
  program: OutputSnapshot['programs']['recommendations'][0];
  colors: any;
}) {
  const [expanded, setExpanded] = useState(false);
  const priorityColor = PRIORITY_COLORS[program.priority] || '#666';
  const emoji = CATEGORY_EMOJI[program.category] || '📋';
  const diffColor = DIFFICULTY_COLORS[program.difficulty] || '#666';

  return (
    <Pressable onPress={() => setExpanded(!expanded)}>
      <GlassCard>
        {/* Header with emoji + name */}
        <View style={styles.cardHeader}>
          <Text style={styles.cardEmoji}>{emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.programName, { color: colors.textOnDark }]}>{program.name}</Text>
            <View style={styles.metaRow}>
              <Text style={[styles.programMeta, { color: colors.textMuted }]}>
                {program.frequency} · {program.durationMin}min
              </Text>
              <View style={[styles.diffBadge, { backgroundColor: diffColor + '22' }]}>
                <Text style={[styles.diffText, { color: diffColor }]}>{program.difficulty}</Text>
              </View>
              <View style={[styles.typeBadge, { backgroundColor: program.type === 'physical' ? '#FF6B3518' : '#5E5CE618' }]}>
                <Text style={[styles.typeText, { color: program.type === 'physical' ? '#FF6B35' : '#5E5CE6' }]}>
                  {program.type === 'physical' ? '⚡' : '⚽'} {program.type}
                </Text>
              </View>
            </View>
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.textMuted}
          />
        </View>

        {/* Impact statement — the Gen Z hook */}
        <View style={[styles.impactBanner, { backgroundColor: priorityColor + '10' }]}>
          <Ionicons name="flash" size={14} color={priorityColor} />
          <Text style={[styles.impactText, { color: priorityColor }]}>
            {program.impact}
          </Text>
        </View>

        {/* Position note */}
        {program.positionNote && !expanded ? (
          <View style={[styles.positionBadge, { backgroundColor: colors.accent1 + '12' }]}>
            <Ionicons name="football-outline" size={12} color={colors.accent1} />
            <Text style={[styles.positionBadgeText, { color: colors.accent1 }]}>{program.positionNote}</Text>
          </View>
        ) : null}

        {/* PHV Warnings */}
        {program.phvWarnings.length > 0 && (
          <View style={[styles.warningBadge, { backgroundColor: '#FF453A15' }]}>
            <Ionicons name="warning-outline" size={12} color="#FF453A" />
            <Text style={styles.warningText}>{program.phvWarnings[0]}</Text>
          </View>
        )}

        {/* ── Expanded content ────────────────────────────────── */}
        {expanded && (
          <View style={styles.expandedContent}>
            {/* Description */}
            <Text style={[styles.descriptionText, { color: colors.textMuted }]}>
              {program.description}
            </Text>

            {/* Prescription details */}
            <View style={styles.prescriptionRow}>
              <RxChip label="Sets" value={String(program.prescription.sets)} colors={colors} />
              <RxChip label="Reps" value={program.prescription.reps} colors={colors} />
              <RxChip label="RPE" value={program.prescription.rpe} colors={colors} />
              <RxChip label="Rest" value={program.prescription.rest} colors={colors} />
              <RxChip label="Intensity" value={program.prescription.intensity} colors={colors} />
            </View>

            {/* Why this program */}
            {program.reason && (
              <View style={[styles.reasonBlock, { backgroundColor: colors.glass }]}>
                <View style={styles.reasonHeader}>
                  <Ionicons name="bulb-outline" size={14} color={colors.accent1} />
                  <Text style={[styles.reasonLabel, { color: colors.accent1 }]}>Why this program</Text>
                </View>
                <Text style={[styles.reasonText, { color: colors.textOnDark }]}>{program.reason}</Text>
              </View>
            )}

            {/* Position note in expanded */}
            {program.positionNote ? (
              <View style={styles.positionExpandedRow}>
                <Ionicons name="football-outline" size={14} color={colors.accent1} />
                <Text style={[styles.positionExpandedText, { color: colors.textMuted }]}>{program.positionNote}</Text>
              </View>
            ) : null}

            {/* Tags */}
            {program.tags && program.tags.length > 0 && (
              <View style={styles.tagsRow}>
                {program.tags.slice(0, 4).map((tag) => (
                  <View key={tag} style={[styles.tagChip, { backgroundColor: colors.glassBorder + '40' }]}>
                    <Text style={[styles.tagText, { color: colors.textMuted }]}>#{tag.replace(/_/g, '')}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Coaching cues */}
            {program.prescription.coachingCues.length > 0 && (
              <View style={styles.cuesBlock}>
                <Text style={[styles.cuesTitle, { color: colors.textMuted }]}>💬 Coaching cues</Text>
                {program.prescription.coachingCues.map((c, i) => (
                  <Text key={i} style={[styles.cueText, { color: colors.textOnDark }]}>
                    {'\u2022'} {c}
                  </Text>
                ))}
              </View>
            )}

            {/* All PHV warnings in expanded */}
            {program.phvWarnings.length > 1 && (
              <View style={[styles.phvExpandedBlock, { backgroundColor: '#FF453A10' }]}>
                <Text style={[styles.phvExpandedTitle, { color: '#FF453A' }]}>⚠️ Growth considerations</Text>
                {program.phvWarnings.map((w, i) => (
                  <Text key={i} style={[styles.phvExpandedText, { color: '#FF453A' }]}>• {w}</Text>
                ))}
              </View>
            )}
          </View>
        )}
      </GlassCard>
    </Pressable>
  );
}

function RxChip({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={[styles.rxChip, { backgroundColor: colors.glass }]}>
      <Text style={[styles.rxLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.rxValue, { color: colors.textOnDark }]}>{value}</Text>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { gap: spacing.sm },

  // Hero
  heroTitle: { fontFamily: fontFamily.bold, fontSize: 18, marginBottom: 2 },
  heroSubtitle: { fontFamily: fontFamily.regular, fontSize: 13, marginBottom: spacing.md },
  statsRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md },
  statChip: { flex: 1, borderRadius: borderRadius.sm, paddingVertical: 8, alignItems: 'center' },
  statValue: { fontFamily: fontFamily.bold, fontSize: 14 },
  statLabel: { fontFamily: fontFamily.regular, fontSize: 9, marginTop: 2 },

  // Weekly plan
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  dayCol: { alignItems: 'center', gap: 4 },
  dayDot: { width: 10, height: 10, borderRadius: 5 },
  dayLabel: { fontFamily: fontFamily.regular, fontSize: 10 },
  weekSuggestion: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 17, marginBottom: spacing.sm },
  structureRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  structureChip: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  structureText: { fontFamily: fontFamily.medium, fontSize: 10 },

  // Gap connection
  gapHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  gapTitle: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  gapSubtitle: { fontFamily: fontFamily.regular, fontSize: 12, marginBottom: spacing.sm },
  gapChips: { gap: 6 },
  gapChipRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gapChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  gapChipText: { fontFamily: fontFamily.medium, fontSize: 12 },
  gapArrowText: { fontFamily: fontFamily.medium, fontSize: 11 },

  // Priority groups
  group: { gap: spacing.xs },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  groupLabel: { fontFamily: fontFamily.bold, fontSize: 15 },
  countBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  countBadgeText: { fontFamily: fontFamily.bold, fontSize: 12 },
  groupDesc: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 17, marginBottom: 4 },
  showMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: borderRadius.md,
    paddingVertical: 10,
  },
  showMoreText: { fontFamily: fontFamily.medium, fontSize: 13 },

  // Program card
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  cardEmoji: { fontSize: 24, marginTop: 2 },
  programName: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' },
  programMeta: { fontFamily: fontFamily.regular, fontSize: 11 },
  diffBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  diffText: { fontFamily: fontFamily.medium, fontSize: 9, textTransform: 'capitalize' as const },
  typeBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  typeText: { fontFamily: fontFamily.medium, fontSize: 9 },

  // Impact
  impactBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 8,
  },
  impactText: { fontFamily: fontFamily.medium, fontSize: 12, flex: 1, lineHeight: 17 },

  // Position badge
  positionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  positionBadgeText: { fontFamily: fontFamily.medium, fontSize: 11 },

  // Warning
  warningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  warningText: { fontFamily: fontFamily.medium, fontSize: 11, color: '#FF453A' },

  // Expanded
  expandedContent: { marginTop: spacing.sm, gap: spacing.sm },
  descriptionText: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 18 },
  prescriptionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rxChip: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center' },
  rxLabel: { fontFamily: fontFamily.regular, fontSize: 9 },
  rxValue: { fontFamily: fontFamily.semiBold, fontSize: 12 },
  reasonBlock: { borderRadius: borderRadius.sm, padding: spacing.sm, gap: 4 },
  reasonHeader: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  reasonLabel: { fontFamily: fontFamily.semiBold, fontSize: 12 },
  reasonText: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 18 },
  positionExpandedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  positionExpandedText: { fontFamily: fontFamily.regular, fontSize: 12, fontStyle: 'italic' as const },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tagChip: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  tagText: { fontFamily: fontFamily.regular, fontSize: 10 },
  cuesBlock: { gap: 4 },
  cuesTitle: { fontFamily: fontFamily.semiBold, fontSize: 12 },
  cueText: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 18 },
  phvExpandedBlock: { borderRadius: borderRadius.sm, padding: spacing.sm, gap: 4 },
  phvExpandedTitle: { fontFamily: fontFamily.semiBold, fontSize: 12 },
  phvExpandedText: { fontFamily: fontFamily.regular, fontSize: 11 },

  // Empty
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.huge,
    gap: spacing.sm,
  },
  emptyTitle: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  emptySubtitle: { fontFamily: fontFamily.regular, fontSize: 13, textAlign: 'center', paddingHorizontal: spacing.lg },
});
