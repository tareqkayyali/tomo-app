/**
 * For You Screen — AI-personalized recommendations, recovery tips,
 * milestones, peer insights, and weekly challenges.
 * Matches the approved prototype ForYouScreen.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  colors,
  spacing,
  borderRadius,
  fontFamily,
  layout,
} from '../theme';

// ── Section Card ─────────────────────────────────────────────────────
function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: object;
}) {
  return (
    <View style={[styles.card, style]}>
      {children}
    </View>
  );
}

// ── Mini Readiness Ring ──────────────────────────────────────────────
function MiniReadinessRing({ score = 65, size = 60 }: { score?: number; size?: number }) {
  const color =
    score >= 80 ? colors.readinessGreen :
    score >= 50 ? colors.readinessYellow :
    colors.readinessRed;
  const label =
    score >= 80 ? 'GREEN' :
    score >= 50 ? 'YELLOW' : 'RED';

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Background circle */}
      <View style={{
        position: 'absolute',
        width: size - 8,
        height: size - 8,
        borderRadius: (size - 8) / 2,
        borderWidth: 4,
        borderColor: colors.border,
      }} />
      {/* Progress arc (simplified — full circle tinted) */}
      <View style={{
        position: 'absolute',
        width: size - 8,
        height: size - 8,
        borderRadius: (size - 8) / 2,
        borderWidth: 4,
        borderColor: color,
        opacity: 0.8,
      }} />
      <Text style={{ fontSize: 18, fontWeight: '700', color }}>{score}</Text>
      <Text style={{ fontSize: 7, fontWeight: '600', color, letterSpacing: 0.5 }}>{label}</Text>
    </View>
  );
}

// ── Progress Bar with Gradient ───────────────────────────────────────
function GradientProgressBar({ percent }: { percent: number }) {
  return (
    <View style={styles.progressBarBg}>
      <LinearGradient
        colors={colors.gradientOrangeCyan}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.progressBarFill, { width: `${percent}%` }]}
      />
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════
export function ForYouScreen() {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Focus This Week ──────────────────────────────────────── */}
      <LinearGradient
        colors={[`${colors.accent1}18`, `${colors.accent2}18`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, styles.focusCard]}
      >
        <View style={styles.sectionHeader}>
          <Ionicons name="locate-outline" size={18} color={colors.accent1} />
          <Text style={[styles.sectionLabel, { color: colors.accent1 }]}>
            FOCUS THIS WEEK
          </Text>
        </View>
        <Text style={styles.focusTitle}>Level Up Your Defending</Text>
        <Text style={styles.focusDesc}>
          Your Defending attribute (53) is your weakest area. Here's a 3-drill
          plan to improve positioning and tackling this week.
        </Text>
        <TouchableOpacity activeOpacity={0.85}>
          <LinearGradient
            colors={colors.gradientOrangeCyan}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.ctaButton}
          >
            <Text style={styles.ctaText}>See Drill Plan</Text>
          </LinearGradient>
        </TouchableOpacity>
      </LinearGradient>

      {/* ── Tomorrow Preview ──────────────────────────────────────── */}
      <Card>
        <View style={styles.sectionHeader}>
          <Ionicons name="moon-outline" size={18} color={colors.readinessYellow} />
          <Text style={[styles.sectionLabel, { color: colors.readinessYellow }]}>
            TOMORROW PREVIEW
          </Text>
        </View>
        <View style={styles.tomorrowRow}>
          <MiniReadinessRing score={65} size={60} />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={styles.tomorrowTitle}>Projected: YELLOW Day</Text>
            <Text style={styles.tomorrowDesc}>
              Technical focus — light intensity. Recovery from today's speed session.
            </Text>
          </View>
        </View>
      </Card>

      {/* ── Recovery Tips ─────────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>RECOVERY TIPS</Text>

      {[
        {
          emoji: '😴',
          title: 'Sleep Target: 9+ hours',
          desc: "Your sleep has been averaging 8.2hrs. Push for 9+ tonight for max recovery.",
          color: colors.accent2,
        },
        {
          emoji: '🥤',
          title: 'Hydration Check',
          desc: 'Speed sessions increase fluid loss. Aim for 2.5L before bed.',
          color: colors.readinessGreen,
        },
        {
          emoji: '🧘',
          title: '10-min Stretch',
          desc: "Focus on hip flexors and hamstrings after today's sprint work.",
          color: '#A855F7',
        },
      ].map((tip, i) => (
        <Card key={i} style={{ marginBottom: spacing.sm }}>
          <View style={styles.tipRow}>
            <Text style={{ fontSize: 24 }}>{tip.emoji}</Text>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={[styles.tipTitle, { color: tip.color }]}>{tip.title}</Text>
              <Text style={styles.tipDesc}>{tip.desc}</Text>
            </View>
          </View>
        </Card>
      ))}

      {/* ── Next Milestone ────────────────────────────────────────── */}
      <Card>
        <View style={styles.sectionHeader}>
          <Ionicons name="trophy-outline" size={18} color={colors.accent1} />
          <Text style={[styles.sectionLabel, { color: colors.accent1 }]}>
            NEXT MILESTONE
          </Text>
        </View>
        <Text style={styles.milestoneTitle}>
          Bronze Defender → Silver Defender
        </Text>
        <GradientProgressBar percent={65} />
        <Text style={styles.milestoneDesc}>
          65% complete — 3 more defending drills to unlock
        </Text>
      </Card>

      {/* ── Athletes Like You ─────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>ATHLETES LIKE YOU</Text>
      <Card>
        <Text style={styles.insightText}>
          <Text style={{ color: colors.accent2, fontFamily: fontFamily.semiBold }}>
            Phoenix
          </Text>{' '}
          athletes who tested 3x/week improved their overall rating{' '}
          <Text style={{ color: colors.readinessGreen, fontFamily: fontFamily.semiBold }}>
            23% faster
          </Text>{' '}
          than those who tested 1x/week.
        </Text>
      </Card>

      {/* ── Challenge of the Week ─────────────────────────────────── */}
      <Card style={styles.challengeCard}>
        <View style={styles.sectionHeader}>
          <Ionicons name="flame-outline" size={18} color={colors.accent2} />
          <Text style={[styles.sectionLabel, { color: colors.accent2 }]}>
            CHALLENGE OF THE WEEK
          </Text>
        </View>
        <Text style={styles.challengeTitle}>Sprint Speed Challenge</Text>
        <Text style={styles.challengeDesc}>
          Run 3 sprint tests this week and beat your personal best
        </Text>
        <View style={styles.challengeButtons}>
          <TouchableOpacity activeOpacity={0.85}>
            <LinearGradient
              colors={colors.gradientOrangeCyan}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.challengeAcceptBtn}
            >
              <Text style={styles.ctaText}>Accept Challenge</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={styles.challengeShareBtn} activeOpacity={0.7}>
            <Ionicons name="share-outline" size={16} color={colors.textInactive} />
            <Text style={styles.challengeShareText}>Share</Text>
          </TouchableOpacity>
        </View>
      </Card>

      {/* Bottom spacer for tab bar */}
      <View style={{ height: spacing.xxxl }} />
    </ScrollView>
  );
}

// ═════════════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.sm,
    paddingBottom: layout.navHeight + spacing.lg,
  },

  // ── Card ─────────────────────────────────────────────────────────
  card: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },

  // ── Section Headers ──────────────────────────────────────────────
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: fontFamily.semiBold,
    letterSpacing: 0.5,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: fontFamily.semiBold,
    color: colors.textInactive,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },

  // ── Focus This Week ──────────────────────────────────────────────
  focusCard: {
    borderColor: `${colors.accent1}33`,
  },
  focusTitle: {
    fontSize: 16,
    fontFamily: fontFamily.bold,
    color: colors.textOnDark,
    marginBottom: spacing.xs,
  },
  focusDesc: {
    fontSize: 13,
    fontFamily: fontFamily.regular,
    color: colors.textInactive,
    lineHeight: 20,
  },
  ctaButton: {
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  ctaText: {
    fontSize: 15,
    fontFamily: fontFamily.semiBold,
    color: '#FFFFFF',
  },

  // ── Tomorrow Preview ─────────────────────────────────────────────
  tomorrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tomorrowTitle: {
    fontSize: 14,
    fontFamily: fontFamily.semiBold,
    color: colors.textOnDark,
  },
  tomorrowDesc: {
    fontSize: 12,
    fontFamily: fontFamily.regular,
    color: colors.textInactive,
    marginTop: 2,
    lineHeight: 18,
  },

  // ── Recovery Tips ────────────────────────────────────────────────
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  tipTitle: {
    fontSize: 13,
    fontFamily: fontFamily.semiBold,
  },
  tipDesc: {
    fontSize: 12,
    fontFamily: fontFamily.regular,
    color: colors.textInactive,
    marginTop: 2,
    lineHeight: 18,
  },

  // ── Milestone ────────────────────────────────────────────────────
  milestoneTitle: {
    fontSize: 14,
    fontFamily: fontFamily.semiBold,
    color: colors.textOnDark,
    marginBottom: spacing.sm,
  },
  milestoneDesc: {
    fontSize: 11,
    fontFamily: fontFamily.regular,
    color: colors.textInactive,
    marginTop: spacing.xs,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },

  // ── Insight ──────────────────────────────────────────────────────
  insightText: {
    fontSize: 13,
    fontFamily: fontFamily.regular,
    color: colors.textOnDark,
    lineHeight: 20,
  },

  // ── Challenge ────────────────────────────────────────────────────
  challengeCard: {
    backgroundColor: '#1F1A24',
    borderColor: `${colors.accent2}44`,
  },
  challengeTitle: {
    fontSize: 15,
    fontFamily: fontFamily.bold,
    color: colors.textOnDark,
    marginBottom: spacing.xs,
  },
  challengeDesc: {
    fontSize: 12,
    fontFamily: fontFamily.regular,
    color: colors.textInactive,
    marginBottom: spacing.md,
  },
  challengeButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  challengeAcceptBtn: {
    borderRadius: borderRadius.sm,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  challengeShareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  challengeShareText: {
    fontSize: 13,
    fontFamily: fontFamily.medium,
    color: colors.textInactive,
  },
});
