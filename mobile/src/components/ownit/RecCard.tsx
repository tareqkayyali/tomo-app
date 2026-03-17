/**
 * RecCard — Priority-aware recommendation card for the Own It page.
 *
 * Renders 4 visual variants based on priority:
 *   P1 (Urgent): Hero card with breathing glow + accent border
 *   P2 (Today):  Accent-border glass card with expandable body
 *   P3 (Week):   Standard glass card
 *   P4 (Info):   Compact chip with expandable body
 *
 * Each recType has its own color, icon, glow preset, and badge variant.
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { GlassCard } from '../GlassCard';
import { GlowWrapper, type GlowPreset } from '../GlowWrapper';
import { Badge } from '../Badge';
import { MetricPill } from './MetricPill';
import { DualLoadBar } from './DualLoadBar';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../theme/colors';
import {
  spacing,
  borderRadius,
  fontFamily,
} from '../../theme';

// ── Types ────────────────────────────────────────────────────────────

type RecType =
  | 'READINESS'
  | 'LOAD_WARNING'
  | 'RECOVERY'
  | 'DEVELOPMENT'
  | 'ACADEMIC'
  | 'CV_OPPORTUNITY'
  | 'TRIANGLE_ALERT'
  | 'MOTIVATION';

export interface ForYouRecommendation {
  recType: RecType;
  priority: 1 | 2 | 3 | 4;
  title: string;
  bodyShort: string;
  bodyLong: string;
  confidence: number;
  evidenceBasis?: Record<string, unknown>;
  context?: Record<string, unknown>;
  recId?: string;
  createdAt?: string;
  expiresAt?: string | null;
  retrievedChunkIds?: string[];
}

interface RecCardProps {
  rec: ForYouRecommendation;
  /** Index for staggered entrance animation delay */
  index: number;
}

// ── RecType Visual Config ────────────────────────────────────────────

type BadgeVariant = 'chip' | 'success' | 'warning' | 'error' | 'info' | 'outline';

interface RecTypeConfig {
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  glow: GlowPreset;
  badgeVariant: BadgeVariant;
  label: string;
}

const REC_TYPE_CONFIG: Record<RecType, RecTypeConfig> = {
  READINESS: {
    color: '#30D158',
    icon: 'pulse-outline',
    glow: 'orange',
    badgeVariant: 'success',
    label: 'Readiness',
  },
  LOAD_WARNING: {
    color: '#F39C12',
    icon: 'warning-outline',
    glow: 'orange',
    badgeVariant: 'warning',
    label: 'Load',
  },
  RECOVERY: {
    color: '#30D158',
    icon: 'leaf-outline',
    glow: 'cyan',
    badgeVariant: 'success',
    label: 'Recovery',
  },
  DEVELOPMENT: {
    color: '#00D9FF',
    icon: 'trending-up-outline',
    glow: 'cyan',
    badgeVariant: 'info',
    label: 'Development',
  },
  ACADEMIC: {
    color: '#00D9FF',
    icon: 'school-outline',
    glow: 'cyan',
    badgeVariant: 'info',
    label: 'Academic',
  },
  CV_OPPORTUNITY: {
    color: '#7B61FF',
    icon: 'document-text-outline',
    glow: 'subtle',
    badgeVariant: 'outline',
    label: 'CV',
  },
  TRIANGLE_ALERT: {
    color: '#E74C3C',
    icon: 'people-outline',
    glow: 'orange',
    badgeVariant: 'error',
    label: 'Alert',
  },
  MOTIVATION: {
    color: '#FF6B35',
    icon: 'flame-outline',
    glow: 'orange',
    badgeVariant: 'chip',
    label: 'Motivation',
  },
};

const PRIORITY_LABELS: Record<number, string> = {
  1: '🚨 URGENT',
  2: '⚡ TODAY',
  3: '📋 THIS WEEK',
  4: 'ℹ️ INFO',
};

// ── Evidence Pills Helper ──────────────────────────────────────────
interface PillConfig {
  label: string;
  value: string;
  color: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

function getEvidencePills(
  recType: RecType,
  evidence?: Record<string, unknown>
): PillConfig[] {
  if (!evidence) return [];
  const pills: PillConfig[] = [];

  switch (recType) {
    case 'READINESS': {
      const acwr = evidence.acwr as number | null;
      if (acwr != null) {
        const c = acwr > 1.5 ? '#E74C3C' : acwr > 1.3 ? '#F39C12' : acwr < 0.8 ? '#00D9FF' : '#30D158';
        pills.push({ label: 'ACWR', value: acwr.toFixed(2), color: c, icon: 'pulse-outline' });
      }
      const sleep = evidence.sleep_quality as number | null;
      if (sleep != null) pills.push({ label: 'Sleep', value: `${sleep}/10`, color: sleep < 5 ? '#E74C3C' : '#30D158', icon: 'moon-outline' });
      const rag = evidence.readiness_rag as string | null;
      if (rag) {
        const c = rag === 'RED' ? '#E74C3C' : rag === 'AMBER' ? '#F39C12' : '#30D158';
        pills.push({ label: 'RAG', value: rag, color: c });
      }
      break;
    }
    case 'LOAD_WARNING': {
      const acwr = evidence.acwr as number | null;
      if (acwr != null) {
        const c = acwr > 1.5 ? '#E74C3C' : acwr > 1.3 ? '#F39C12' : '#30D158';
        pills.push({ label: 'ACWR', value: acwr.toFixed(2), color: c, icon: 'pulse-outline' });
      }
      const atl = evidence.atl_7day as number | null;
      if (atl != null) pills.push({ label: 'ATL', value: `${Math.round(atl)} AU`, color: '#FF6B35', icon: 'trending-up' });
      const ctl = evidence.ctl_28day as number | null;
      if (ctl != null) pills.push({ label: 'CTL', value: `${Math.round(ctl)} AU`, color: '#00D9FF', icon: 'analytics-outline' });
      break;
    }
    case 'ACADEMIC': {
      const dual = evidence.dual_load_index as number | null;
      if (dual != null) pills.push({ label: 'Load', value: `${Math.round(dual)}%`, color: dual > 80 ? '#E74C3C' : '#F39C12', icon: 'barbell-outline' });
      // Support both key names from different computers
      const examDays = (evidence.days_until_exam ?? evidence.days_to_nearest_exam) as number | null;
      if (examDays != null) pills.push({ label: 'Exam', value: `${examDays}d`, color: examDays <= 3 ? '#E74C3C' : '#F39C12', icon: 'school-outline' });
      const studyLoad = evidence.academic_load_7day as number | null;
      if (studyLoad != null) pills.push({ label: 'Study', value: `${Math.round(studyLoad)} AU`, color: '#00D9FF', icon: 'book-outline' });
      // New: exam subject
      const subject = evidence.nearest_exam_subject as string | null;
      if (subject) pills.push({ label: 'Subject', value: subject, color: '#00D9FF', icon: 'document-text-outline' });
      // New: upcoming exam count
      const examCount = evidence.upcoming_exam_count as number | null;
      if (examCount != null && examCount > 1) pills.push({ label: 'Exams', value: `${examCount}`, color: '#F39C12', icon: 'calendar-outline' });
      // New: estimated prep hours
      const prepHours = evidence.estimated_prep_hours as number | null;
      if (prepHours != null) pills.push({ label: 'Prep', value: `~${Math.round(prepHours)}h`, color: '#00D9FF', icon: 'time-outline' });
      // ACADEMIC gets up to 5 pills (more data to show)
      return pills.slice(0, 5);
    }
    case 'RECOVERY': {
      const soreness = evidence.soreness as number | null;
      if (soreness != null) pills.push({ label: 'Soreness', value: `${soreness}/10`, color: soreness > 6 ? '#E74C3C' : '#F39C12', icon: 'body-outline' });
      const sleep = evidence.sleep_quality as number | null;
      if (sleep != null) pills.push({ label: 'Sleep', value: `${sleep}/10`, color: sleep < 5 ? '#E74C3C' : '#30D158', icon: 'moon-outline' });
      break;
    }
    case 'DEVELOPMENT': {
      const zone = evidence.current_zone as string | null;
      if (zone) pills.push({ label: 'Zone', value: zone, color: '#7B61FF', icon: 'stats-chart-outline' });
      break;
    }
    case 'MOTIVATION': {
      const streak = evidence.streak_days as number | null;
      if (streak != null) pills.push({ label: 'Streak', value: `${streak}🔥`, color: '#FF6B35', icon: 'flame-outline' });
      const sessions = evidence.sessions_total as number | null;
      if (sessions != null) pills.push({ label: 'Sessions', value: `${sessions}`, color: '#00D9FF', icon: 'fitness-outline' });
      break;
    }
    case 'CV_OPPORTUNITY': {
      const cvScore = evidence.cv_completeness as number | null;
      if (cvScore != null) pills.push({ label: 'CV', value: `${Math.round(cvScore)}%`, color: cvScore < 30 ? '#E74C3C' : cvScore < 60 ? '#F39C12' : '#30D158', icon: 'document-text-outline' });
      const gaps = evidence.benchmark_gaps as string[] | null;
      if (gaps?.length) pills.push({ label: 'Gaps', value: `${gaps.length} tests`, color: '#F39C12', icon: 'analytics-outline' });
      const percentile = evidence.overall_percentile as number | null;
      if (percentile != null) pills.push({ label: 'Rank', value: `P${percentile}`, color: percentile > 50 ? '#30D158' : '#F39C12', icon: 'podium-outline' });
      break;
    }
    case 'TRIANGLE_ALERT': {
      const severity = evidence.severity as string | null;
      if (severity) pills.push({ label: 'Severity', value: severity, color: severity === 'HIGH' ? '#E74C3C' : '#F39C12', icon: 'alert-circle-outline' });
      break;
    }
    default:
      break;
  }

  return pills.slice(0, 3);
}

// ── Contributing Factors Helper ───────────────────────────────────
function getContributingFactors(evidence?: Record<string, unknown>): string[] {
  if (!evidence) return [];
  const factors = evidence.contributing_factors;
  if (!Array.isArray(factors)) return [];
  return (factors as string[])
    .filter((f) => typeof f === 'string' && f.length > 0)
    .slice(0, 3)
    .map((f) => (f.length > 60 ? f.slice(0, 57) + '...' : f));
}

// ── Expiry Countdown Helper ───────────────────────────────────────
function formatExpiry(expiresAt: string | null | undefined): string | null {
  if (!expiresAt) return null;
  const now = Date.now();
  const exp = new Date(expiresAt).getTime();
  const diffMs = exp - now;
  if (diffMs <= 0) return 'Expired';
  const hours = Math.floor(diffMs / 3600000);
  if (hours < 1) return `${Math.max(1, Math.floor(diffMs / 60000))}m left`;
  if (hours < 24) return `${hours}h left`;
  const days = Math.floor(hours / 24);
  return `${days}d left`;
}

function expiryColor(expiresAt: string | null | undefined): string {
  if (!expiresAt) return '#6B6B6B';
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return '#E74C3C';
  if (diffMs < 2 * 3600000) return '#E74C3C'; // < 2 hours
  return '#6B6B6B';
}

// ── Dual Load Data Helper ─────────────────────────────────────────
function getDualLoadData(
  recType: RecType,
  evidence?: Record<string, unknown>
): { athletic: number; academic: number } | null {
  if (!evidence) return null;
  if (recType !== 'LOAD_WARNING' && recType !== 'ACADEMIC') return null;
  const athletic = evidence.athletic_load_7day as number | undefined;
  const academic = evidence.academic_load_7day as number | undefined;
  if (athletic == null || academic == null) return null;
  if (athletic + academic <= 0) return null;
  return { athletic, academic };
}

// ═════════════════════════════════════════════════════════════════════

export function RecCard({ rec, index }: RecCardProps) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);
  const config = REC_TYPE_CONFIG[rec.recType];
  const [expanded, setExpanded] = useState(false);

  const hasRag = (rec.retrievedChunkIds?.length ?? 0) > 0;
  const expiry = formatExpiry(rec.expiresAt);
  const factors = getContributingFactors(rec.evidenceBasis);
  const dualLoad = getDualLoadData(rec.recType, rec.evidenceBasis);

  if (rec.priority === 1) return <P1Card rec={rec} config={config} index={index} s={s} colors={colors} expanded={expanded} setExpanded={setExpanded} hasRag={hasRag} expiry={expiry} factors={factors} dualLoad={dualLoad} />;
  if (rec.priority === 2) return <P2Card rec={rec} config={config} index={index} s={s} colors={colors} expanded={expanded} setExpanded={setExpanded} hasRag={hasRag} expiry={expiry} factors={factors} dualLoad={dualLoad} />;
  if (rec.priority === 3) return <P3Card rec={rec} config={config} index={index} s={s} colors={colors} hasRag={hasRag} expiry={expiry} factors={factors} dualLoad={dualLoad} />;
  return <P4Chip rec={rec} config={config} index={index} s={s} colors={colors} expanded={expanded} setExpanded={setExpanded} />;
}

// ── P1: Hero Card with Breathing Glow ────────────────────────────────

function P1Card({
  rec, config, index, s, colors, expanded, setExpanded, hasRag, expiry, factors, dualLoad,
}: {
  rec: ForYouRecommendation;
  config: RecTypeConfig;
  index: number;
  s: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  hasRag: boolean;
  expiry: string | null;
  factors: string[];
  dualLoad: { athletic: number; academic: number } | null;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 80).duration(350).springify()}>
      <GlowWrapper glow={config.glow} breathing style={{ marginBottom: spacing.md }}>
        <GlassCard style={{ borderLeftWidth: 3, borderLeftColor: config.color }}>
          {/* Top row: icon + type badge + science badge + expiry + priority badge */}
          <View style={s.topRow}>
            <View style={s.typeRow}>
              <Ionicons name={config.icon} size={20} color={config.color} />
              <Badge label={config.label} variant={config.badgeVariant} size="small" />
              {hasRag && <Badge label="Research-backed" variant="outline" size="small" icon="library-outline" />}
            </View>
            <View style={s.typeRow}>
              {expiry && (
                <Text style={[s.expiryText, { color: expiryColor(rec.expiresAt) }]}>
                  {expiry}
                </Text>
              )}
              <Badge label={PRIORITY_LABELS[1]} variant="error" size="small" />
            </View>
          </View>

          {/* Title */}
          <Text style={s.p1Title}>{rec.title}</Text>

          {/* Body short */}
          <Text style={s.p1Body}>{rec.bodyShort}</Text>

          {/* Evidence Pills */}
          {(() => {
            const pills = getEvidencePills(rec.recType as RecType, rec.evidenceBasis);
            if (pills.length === 0) return null;
            return (
              <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm, flexWrap: 'wrap' }}>
                {pills.map((p, i) => (
                  <MetricPill key={i} label={p.label} value={p.value} color={p.color} icon={p.icon} />
                ))}
              </View>
            );
          })()}

          {/* Dual Load Bar */}
          {dualLoad && <DualLoadBar athleticLoad={dualLoad.athletic} academicLoad={dualLoad.academic} />}

          {/* Contributing Factors */}
          {factors.length > 0 && (
            <View style={s.factorsContainer}>
              {factors.map((f, i) => (
                <View key={i} style={s.factorRow}>
                  <View style={[s.factorBullet, { backgroundColor: config.color }]} />
                  <Text style={s.factorText}>{f}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Expandable body long */}
          {rec.bodyLong ? (
            <>
              {expanded && <Text style={s.bodyLong}>{rec.bodyLong}</Text>}
              <Pressable onPress={() => setExpanded(!expanded)} hitSlop={8}>
                <Text style={s.showMore}>
                  {expanded ? 'Show less' : 'Show more →'}
                </Text>
              </Pressable>
            </>
          ) : null}

          {/* Confidence bar */}
          <View style={s.confidenceTrack}>
            <LinearGradient
              colors={[colors.accent1, colors.accent2]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[s.confidenceFill, { width: `${Math.round((rec.confidence || 0) * 100)}%` }]}
            />
          </View>
        </GlassCard>
      </GlowWrapper>
    </Animated.View>
  );
}

// ── P2: Accent-Border Card ───────────────────────────────────────────

function P2Card({
  rec, config, index, s, colors, expanded, setExpanded, hasRag, expiry, factors, dualLoad,
}: {
  rec: ForYouRecommendation;
  config: RecTypeConfig;
  index: number;
  s: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  hasRag: boolean;
  expiry: string | null;
  factors: string[];
  dualLoad: { athletic: number; academic: number } | null;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 80).duration(350).springify()}>
      <GlassCard style={{ borderLeftWidth: 3, borderLeftColor: config.color, marginBottom: spacing.sm }}>
        {/* Top row */}
        <View style={s.topRow}>
          <View style={[s.typeRow, { flex: 1 }]}>
            <Ionicons name={config.icon} size={18} color={config.color} />
            <Text style={s.p2Title} numberOfLines={1}>{rec.title}</Text>
            {hasRag && <Badge label="Research-backed" variant="outline" size="small" icon="library-outline" />}
          </View>
          <View style={s.typeRow}>
            {expiry && (
              <Text style={[s.expiryText, { color: expiryColor(rec.expiresAt) }]}>
                {expiry}
              </Text>
            )}
            <Badge label={PRIORITY_LABELS[2]} variant="warning" size="small" />
          </View>
        </View>

        {/* Body */}
        <Text style={s.p2Body}>{rec.bodyShort}</Text>

        {/* Evidence Pills */}
        {(() => {
          const pills = getEvidencePills(rec.recType as RecType, rec.evidenceBasis);
          if (pills.length === 0) return null;
          return (
            <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm, flexWrap: 'wrap' }}>
              {pills.map((p, i) => (
                <MetricPill key={i} label={p.label} value={p.value} color={p.color} icon={p.icon} />
              ))}
            </View>
          );
        })()}

        {/* Dual Load Bar */}
        {dualLoad && <DualLoadBar athleticLoad={dualLoad.athletic} academicLoad={dualLoad.academic} />}

        {/* Contributing Factors */}
        {factors.length > 0 && (
          <View style={s.factorsContainer}>
            {factors.map((f, i) => (
              <View key={i} style={s.factorRow}>
                <View style={[s.factorBullet, { backgroundColor: config.color }]} />
                <Text style={s.factorText}>{f}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Expandable */}
        {rec.bodyLong ? (
          <>
            {expanded && <Text style={s.bodyLong}>{rec.bodyLong}</Text>}
            <Pressable onPress={() => setExpanded(!expanded)} hitSlop={8}>
              <Text style={s.showMore}>
                {expanded ? 'Show less' : 'Show more →'}
              </Text>
            </Pressable>
          </>
        ) : null}
      </GlassCard>
    </Animated.View>
  );
}

// ── P3: Standard Card ────────────────────────────────────────────────

function P3Card({
  rec, config, index, s, colors, hasRag, expiry, factors, dualLoad,
}: {
  rec: ForYouRecommendation;
  config: RecTypeConfig;
  index: number;
  s: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  hasRag: boolean;
  expiry: string | null;
  factors: string[];
  dualLoad: { athletic: number; academic: number } | null;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 80).duration(350).springify()}>
      <GlassCard style={{ marginBottom: spacing.sm }}>
        {/* Top row: icon + title + badges */}
        <View style={[s.topRow, { marginBottom: spacing.xs }]}>
          <View style={[s.typeRow, { flex: 1 }]}>
            <Ionicons name={config.icon} size={16} color={config.color} />
            <Text style={s.p3Title} numberOfLines={1}>{rec.title}</Text>
            {hasRag && <Ionicons name="library-outline" size={12} color={colors.textMuted} style={{ marginLeft: 4 }} />}
          </View>
          {expiry && (
            <Text style={[s.expiryText, { color: expiryColor(rec.expiresAt) }]}>
              {expiry}
            </Text>
          )}
        </View>

        <Text style={s.p3Body}>{rec.bodyShort}</Text>

        {/* Evidence Pills */}
        {(() => {
          const pills = getEvidencePills(rec.recType as RecType, rec.evidenceBasis);
          if (pills.length === 0) return null;
          return (
            <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm, flexWrap: 'wrap' }}>
              {pills.map((p, i) => (
                <MetricPill key={i} label={p.label} value={p.value} color={p.color} icon={p.icon} />
              ))}
            </View>
          );
        })()}

        {/* Dual Load Bar */}
        {dualLoad && <DualLoadBar athleticLoad={dualLoad.athletic} academicLoad={dualLoad.academic} />}

        {/* Contributing Factors (max 2 for P3 to save space) */}
        {factors.length > 0 && (
          <View style={s.factorsContainer}>
            {factors.slice(0, 2).map((f, i) => (
              <View key={i} style={s.factorRow}>
                <View style={[s.factorBullet, { backgroundColor: config.color }]} />
                <Text style={s.factorText}>{f}</Text>
              </View>
            ))}
          </View>
        )}
      </GlassCard>
    </Animated.View>
  );
}

// ── P4: Compact Chip ─────────────────────────────────────────────────

function P4Chip({
  rec, config, index, s, colors, expanded, setExpanded,
}: {
  rec: ForYouRecommendation;
  config: RecTypeConfig;
  index: number;
  s: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
}) {
  return (
    <View style={{ marginRight: spacing.sm, marginBottom: spacing.sm }}>
      <Badge
        label={rec.title}
        variant={config.badgeVariant}
        size="small"
        icon={config.icon}
        onPress={() => setExpanded(!expanded)}
      />
      {expanded && (
        <View style={s.p4Expanded}>
          <Text style={s.p4Body}>{rec.bodyShort}</Text>
        </View>
      )}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // Shared
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    typeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    showMore: {
      fontFamily: fontFamily.semiBold,
      fontSize: 12,
      color: colors.accent1,
      marginTop: spacing.xs,
    },
    bodyLong: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textInactive,
      lineHeight: 20,
      marginTop: spacing.xs,
    },
    expiryText: {
      fontFamily: fontFamily.medium,
      fontSize: 10,
      letterSpacing: 0.3,
    },
    factorsContainer: {
      marginTop: spacing.sm,
      gap: 4,
    },
    factorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    factorBullet: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
    },
    factorText: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      color: colors.textMuted,
      lineHeight: 16,
      flex: 1,
    },

    // P1
    p1Title: {
      fontFamily: fontFamily.bold,
      fontSize: 18,
      color: colors.textOnDark,
      marginBottom: spacing.xs,
    },
    p1Body: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      color: colors.textInactive,
      lineHeight: 22,
    },
    confidenceTrack: {
      height: 4,
      backgroundColor: colors.glassBorder,
      borderRadius: 2,
      overflow: 'hidden',
      marginTop: spacing.compact,
    },
    confidenceFill: {
      height: '100%',
      borderRadius: 2,
    },

    // P2
    p2Title: {
      fontFamily: fontFamily.semiBold,
      fontSize: 15,
      color: colors.textOnDark,
    },
    p2Body: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textInactive,
      lineHeight: 20,
    },

    // P3
    p3Title: {
      fontFamily: fontFamily.semiBold,
      fontSize: 14,
      color: colors.textOnDark,
    },
    p3Body: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textInactive,
      lineHeight: 18,
      marginTop: spacing.xs,
    },

    // P4
    p4Expanded: {
      backgroundColor: colors.glass,
      borderRadius: borderRadius.sm,
      padding: spacing.sm,
      marginTop: spacing.xs,
    },
    p4Body: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      color: colors.textInactive,
      lineHeight: 16,
    },
  });
}
