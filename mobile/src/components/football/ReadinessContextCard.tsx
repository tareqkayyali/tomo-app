/**
 * ReadinessContextCard — Football-specific readiness context
 *
 * Displays position-specific training suggestions, age-aware injury
 * notes, and overtraining alerts alongside the core readiness system.
 *
 * SAFETY: Does NOT modify readiness logic. All core safety rules
 * (pain → REST, 6+ days → REST, RED → REST) remain unchanged.
 * This component adds educational context only.
 *
 * "This is not medical advice."
 */

import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, LayoutAnimation } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../index';
import { useTheme } from '../../hooks/useTheme';
import {
  getFootballReadinessContext,
  getInjuryAwarenessNote,
  getOvertrainingAlert,
} from '../../services/footballReadinessContext';
import { fontFamily, spacing, borderRadius } from '../../theme';
import type { ThemeColors } from '../../theme/colors';
import type { ReadinessLevel, CalendarEvent } from '../../types';

// ─── Props ──────────────────────────────────────────────────────────────────

interface Props {
  readinessLevel: ReadinessLevel;
  position: string | null | undefined;
  age: number | null | undefined;
  events: CalendarEvent[];
  selectedDate: Date;
}

// ─── Readiness Color Map ────────────────────────────────────────────────────

const READINESS_COLORS: Record<ReadinessLevel, { color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  GREEN: { color: '#30D158', bg: 'rgba(48, 209, 88, 0.12)', icon: 'checkmark-circle' },
  YELLOW: { color: '#F39C12', bg: 'rgba(243, 156, 18, 0.12)', icon: 'alert-circle' },
  RED: { color: '#E74C3C', bg: 'rgba(231, 76, 60, 0.12)', icon: 'bed' },
};

// ─── Component ──────────────────────────────────────────────────────────────

export function ReadinessContextCard({
  readinessLevel,
  position,
  age,
  events,
  selectedDate,
}: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  const [showResearch, setShowResearch] = useState(false);

  const toggleResearch = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowResearch((p) => !p);
  }, []);

  const readinessConfig = READINESS_COLORS[readinessLevel];
  const context = getFootballReadinessContext(readinessLevel, position);
  const injuryNote = getInjuryAwarenessNote(age);
  const overtrainingAlert = getOvertrainingAlert(events, selectedDate);

  return (
    <GlassCard style={s.card}>
      {/* ── Header ──────────────────────────────────────────── */}
      <View style={s.header}>
        <View style={[s.iconCircle, { backgroundColor: readinessConfig.bg }]}>
          <Ionicons name="football-outline" size={18} color={readinessConfig.color} />
        </View>
        <View style={s.headerTextWrap}>
          <Text style={s.headerTitle}>Football Readiness</Text>
          <View style={[s.levelBadge, { backgroundColor: readinessConfig.bg }]}>
            <Ionicons name={readinessConfig.icon} size={12} color={readinessConfig.color} />
            <Text style={[s.levelText, { color: readinessConfig.color }]}>
              {readinessLevel}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Context Message ─────────────────────────────────── */}
      <Text style={s.contextMessage}>{context.contextMessage}</Text>

      {/* ── Research Note (collapsible) ─────────────────────── */}
      {context.researchNote && (
        <>
          <Pressable onPress={toggleResearch} style={s.researchToggle}>
            <Ionicons name="school-outline" size={14} color={colors.textInactive} />
            <Text style={s.researchToggleText}>What the research says</Text>
            <Ionicons
              name={showResearch ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={colors.textInactive}
            />
          </Pressable>
          {showResearch && (
            <View style={[s.researchContent, { backgroundColor: readinessConfig.bg }]}>
              <Text style={s.researchText}>{context.researchNote}</Text>
            </View>
          )}
        </>
      )}

      {/* ── Overtraining Alert ──────────────────────────────── */}
      {overtrainingAlert && (
        <View style={s.alertBanner}>
          <Ionicons name="warning" size={16} color={colors.readinessYellow} />
          <Text style={s.alertText}>{overtrainingAlert.message}</Text>
        </View>
      )}

      {/* ── Injury Awareness Note ───────────────────────────── */}
      {injuryNote && (
        <View style={s.injuryBanner}>
          <Ionicons name="fitness-outline" size={16} color={colors.accent2} />
          <Text style={s.injuryText}>{injuryNote.message}</Text>
        </View>
      )}

      {/* ── Disclaimer ──────────────────────────────────────── */}
      <Text style={s.disclaimer}>This is not medical advice.</Text>
    </GlassCard>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      marginBottom: 16,
    },

    // ── Header ──
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    iconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTextWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerTitle: {
      fontFamily: fontFamily.bold,
      fontSize: 16,
      color: colors.textOnDark,
    },
    levelBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 10,
    },
    levelText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 11,
    },

    // ── Context Message ──
    contextMessage: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      color: colors.textOnDark,
      lineHeight: 21,
      marginBottom: spacing.sm,
    },

    // ── Research ──
    researchToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 6,
    },
    researchToggleText: {
      fontFamily: fontFamily.medium,
      fontSize: 12,
      color: colors.textInactive,
      flex: 1,
    },
    researchContent: {
      padding: spacing.compact,
      borderRadius: borderRadius.md,
      marginBottom: spacing.sm,
    },
    researchText: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 18,
    },

    // ── Overtraining Alert ──
    alertBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      padding: spacing.compact,
      borderRadius: borderRadius.md,
      backgroundColor: colors.readinessYellowBg,
      marginTop: spacing.sm,
    },
    alertText: {
      fontFamily: fontFamily.medium,
      fontSize: 12,
      color: colors.readinessYellow,
      flex: 1,
      lineHeight: 18,
    },

    // ── Injury Note ──
    injuryBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      padding: spacing.compact,
      borderRadius: borderRadius.md,
      backgroundColor: 'rgba(0, 217, 255, 0.08)',
      marginTop: spacing.sm,
    },
    injuryText: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textInactive,
      flex: 1,
      lineHeight: 18,
    },

    // ── Disclaimer ──
    disclaimer: {
      fontFamily: fontFamily.regular,
      fontSize: 10,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: spacing.md,
    },
  });
}
