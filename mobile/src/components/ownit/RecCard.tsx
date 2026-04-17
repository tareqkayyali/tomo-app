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
import { SmartIcon } from '../SmartIcon';
import { AskTomoChip } from '../mastery/AskTomoChip';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
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
  | 'MOTIVATION'
  | 'JOURNAL_NUDGE';

export interface RecAction {
  type: string;
  params?: Record<string, unknown>;
  label: string;
}

export interface ForYouRecommendation {
  recType: RecType;
  priority: 1 | 2 | 3 | 4;
  title: string;
  bodyShort: string;
  bodyLong: string;
  confidence: number;
  evidenceBasis?: Record<string, unknown>;
  context?: Record<string, unknown>;
  action?: RecAction;
  recId?: string;
  createdAt?: string;
  expiresAt?: string | null;
  retrievedChunkIds?: string[];
}

interface RecCardProps {
  rec: ForYouRecommendation;
  /** Index for staggered entrance animation delay */
  index: number;
  /** Callback when the action CTA is pressed — navigates to the relevant screen */
  onAction?: (route: string, params?: Record<string, unknown>) => void;
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

function getRecTypeConfig(colors: { accent: string; warning: string; info: string; error: string }): Record<RecType, RecTypeConfig> {
  return {
    READINESS: { color: colors.accent, icon: 'pulse-outline', glow: 'orange', badgeVariant: 'success', label: 'Readiness' },
    LOAD_WARNING: { color: colors.warning, icon: 'warning-outline', glow: 'orange', badgeVariant: 'warning', label: 'Load' },
    RECOVERY: { color: colors.accent, icon: 'leaf-outline', glow: 'cyan', badgeVariant: 'success', label: 'Recovery' },
    DEVELOPMENT: { color: colors.info, icon: 'trending-up-outline', glow: 'cyan', badgeVariant: 'info', label: 'Development' },
    ACADEMIC: { color: colors.info, icon: 'school-outline', glow: 'cyan', badgeVariant: 'info', label: 'Academic' },
    CV_OPPORTUNITY: { color: colors.info, icon: 'document-text-outline', glow: 'subtle', badgeVariant: 'outline', label: 'CV' },
    TRIANGLE_ALERT: { color: colors.error, icon: 'people-outline', glow: 'orange', badgeVariant: 'error', label: 'Alert' },
    MOTIVATION: { color: colors.accent, icon: 'flame-outline', glow: 'orange', badgeVariant: 'chip', label: 'Motivation' },
    JOURNAL_NUDGE: { color: colors.info, icon: 'book-outline', glow: 'subtle', badgeVariant: 'info', label: 'Journal' },
  };
}

const PRIORITY_LABELS: Record<number, string> = {
  1: 'URGENT',
  2: 'TODAY',
  3: 'THIS WEEK',
  4: 'INFO',
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
  evidence: Record<string, unknown> | undefined,
  themeColors: { accent: string; warning: string; error: string; info: string; textDisabled: string }
): PillConfig[] {
  if (!evidence) return [];
  const pills: PillConfig[] = [];

  const tc = themeColors;
  switch (recType) {
    case 'READINESS': {
      const acwr = evidence.acwr as number | null;
      if (acwr != null) {
        const c = acwr > 1.5 ? tc.error : acwr > 1.3 ? tc.warning : acwr < 0.8 ? tc.info : tc.accent;
        pills.push({ label: 'ACWR', value: acwr.toFixed(2), color: c, icon: 'pulse-outline' });
      }
      const sleep = evidence.sleep_quality as number | null;
      if (sleep != null) pills.push({ label: 'Sleep', value: `${sleep}/10`, color: sleep < 5 ? tc.error : tc.accent, icon: 'moon-outline' });
      const rag = evidence.readiness_rag as string | null;
      if (rag) {
        const c = rag === 'RED' ? tc.error : rag === 'AMBER' ? tc.warning : tc.accent;
        pills.push({ label: 'RAG', value: rag, color: c });
      }
      break;
    }
    case 'LOAD_WARNING': {
      const acwr = evidence.acwr as number | null;
      if (acwr != null) {
        const c = acwr > 1.5 ? tc.error : acwr > 1.3 ? tc.warning : tc.accent;
        pills.push({ label: 'ACWR', value: acwr.toFixed(2), color: c, icon: 'pulse-outline' });
      }
      const atl = evidence.atl_7day as number | null;
      if (atl != null) pills.push({ label: 'ATL', value: `${Math.round(atl)} AU`, color: tc.accent, icon: 'trending-up' });
      const ctl = evidence.ctl_28day as number | null;
      if (ctl != null) pills.push({ label: 'CTL', value: `${Math.round(ctl)} AU`, color: tc.info, icon: 'analytics-outline' });
      break;
    }
    case 'ACADEMIC': {
      const dual = evidence.dual_load_index as number | null;
      if (dual != null) pills.push({ label: 'Load', value: `${Math.round(dual)}%`, color: dual > 80 ? tc.error : tc.warning, icon: 'barbell-outline' });
      const examDays = (evidence.days_until_exam ?? evidence.days_to_nearest_exam) as number | null;
      if (examDays != null) pills.push({ label: 'Exam', value: `${examDays}d`, color: examDays <= 3 ? tc.error : tc.warning, icon: 'school-outline' });
      const studyLoad = evidence.academic_load_7day as number | null;
      if (studyLoad != null) pills.push({ label: 'Study', value: `${Math.round(studyLoad)} AU`, color: tc.info, icon: 'book-outline' });
      const subject = evidence.nearest_exam_subject as string | null;
      if (subject) pills.push({ label: 'Subject', value: subject, color: tc.info, icon: 'document-text-outline' });
      const examCount = evidence.upcoming_exam_count as number | null;
      if (examCount != null && examCount > 1) pills.push({ label: 'Exams', value: `${examCount}`, color: tc.warning, icon: 'calendar-outline' });
      const prepHours = evidence.estimated_prep_hours as number | null;
      if (prepHours != null) pills.push({ label: 'Prep', value: `~${Math.round(prepHours)}h`, color: tc.info, icon: 'time-outline' });
      return pills.slice(0, 5);
    }
    case 'RECOVERY': {
      const soreness = evidence.soreness as number | null;
      if (soreness != null) pills.push({ label: 'Soreness', value: `${soreness}/10`, color: soreness > 6 ? tc.error : tc.warning, icon: 'body-outline' });
      const sleep = evidence.sleep_quality as number | null;
      if (sleep != null) pills.push({ label: 'Sleep', value: `${sleep}/10`, color: sleep < 5 ? tc.error : tc.accent, icon: 'moon-outline' });
      break;
    }
    case 'DEVELOPMENT': {
      const zone = evidence.current_zone as string | null;
      if (zone) pills.push({ label: 'Zone', value: zone, color: tc.info, icon: 'stats-chart-outline' });
      break;
    }
    case 'MOTIVATION': {
      const streak = evidence.streak_days as number | null;
      if (streak != null) pills.push({ label: 'Streak', value: `${streak}`, color: tc.accent, icon: 'flame-outline' });
      const sessions = evidence.sessions_total as number | null;
      if (sessions != null) pills.push({ label: 'Sessions', value: `${sessions}`, color: tc.info, icon: 'fitness-outline' });
      break;
    }
    case 'CV_OPPORTUNITY': {
      const cvScore = evidence.cv_completeness as number | null;
      if (cvScore != null) pills.push({ label: 'CV', value: `${Math.round(cvScore)}%`, color: cvScore < 30 ? tc.error : cvScore < 60 ? tc.warning : tc.accent, icon: 'document-text-outline' });
      const gaps = evidence.benchmark_gaps as string[] | null;
      if (gaps?.length) pills.push({ label: 'Gaps', value: `${gaps.length} tests`, color: tc.warning, icon: 'analytics-outline' });
      const percentile = evidence.overall_percentile as number | null;
      if (percentile != null) pills.push({ label: 'Rank', value: `P${percentile}`, color: percentile > 50 ? tc.accent : tc.warning, icon: 'podium-outline' });
      break;
    }
    case 'TRIANGLE_ALERT': {
      const severity = evidence.severity as string | null;
      if (severity) pills.push({ label: 'Severity', value: severity, color: severity === 'HIGH' ? tc.error : tc.warning, icon: 'alert-circle-outline' });
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

function expiryColor(expiresAt: string | null | undefined, tc: { textDisabled: string; error: string }): string {
  if (!expiresAt) return tc.textDisabled;
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return tc.error;
  if (diffMs < 2 * 3600000) return tc.error; // < 2 hours
  return tc.textDisabled;
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

export function RecCard({ rec, index, onAction }: RecCardProps) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);
  const configMap = getRecTypeConfig(colors);
  const config = configMap[rec.recType] ?? configMap.MOTIVATION; // fallback for unknown types
  const [expanded, setExpanded] = useState(false);

  const hasRag = (rec.retrievedChunkIds?.length ?? 0) > 0;
  const expiry = formatExpiry(rec.expiresAt);
  const factors = getContributingFactors(rec.evidenceBasis);
  const dualLoad = getDualLoadData(rec.recType, rec.evidenceBasis);

  if (rec.priority === 1) return <P1Card rec={rec} config={config} index={index} s={s} colors={colors} expanded={expanded} setExpanded={setExpanded} hasRag={hasRag} expiry={expiry} factors={factors} dualLoad={dualLoad} onAction={onAction} />;
  if (rec.priority === 2) return <P2Card rec={rec} config={config} index={index} s={s} colors={colors} expanded={expanded} setExpanded={setExpanded} hasRag={hasRag} expiry={expiry} factors={factors} dualLoad={dualLoad} onAction={onAction} />;
  if (rec.priority === 3) return <P3Card rec={rec} config={config} index={index} s={s} colors={colors} hasRag={hasRag} expiry={expiry} factors={factors} dualLoad={dualLoad} onAction={onAction} />;
  return <P4Chip rec={rec} config={config} index={index} s={s} colors={colors} expanded={expanded} setExpanded={setExpanded} />;
}

// ── Build contextual prompt from recommendation ────────────────────

function buildTomoPrompt(rec: ForYouRecommendation): string {
  const typePrompts: Record<string, string> = {
    READINESS: `My readiness recommendation says: "${rec.title}". ${rec.bodyShort} Help me understand what I should do today based on this.`,
    LOAD_WARNING: `I got a load warning: "${rec.title}". ${rec.bodyShort} What should I adjust in my training?`,
    RECOVERY: `Recovery recommendation: "${rec.title}". ${rec.bodyShort} Give me a recovery plan for today.`,
    DEVELOPMENT: `Development tip: "${rec.title}". ${rec.bodyShort} How can I work on this?`,
    ACADEMIC: `Study recommendation: "${rec.title}". ${rec.bodyShort} Help me balance my study and training.`,
    CV_OPPORTUNITY: `CV opportunity: "${rec.title}". ${rec.bodyShort} What should I do to improve my profile?`,
    TRIANGLE_ALERT: `Alert: "${rec.title}". ${rec.bodyShort} What action should I take?`,
    MOTIVATION: `Motivation tip: "${rec.title}". ${rec.bodyShort} Help me stay on track.`,
  };
  return typePrompts[rec.recType] || `Recommendation: "${rec.title}". ${rec.bodyShort} What should I do?`;
}

// ── Action CTA Button ───────────────────────────────────────────────

function ActionCTA({
  action, onAction, colors, rec,
}: {
  action?: RecAction;
  onAction?: (route: string, params?: Record<string, unknown>) => void;
  colors: ThemeColors;
  rec: ForYouRecommendation;
}) {
  const navigation = useNavigation<any>();

  return (
    <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
      {/* Original action CTA */}
      {action && onAction && (
        <Pressable
          onPress={() => onAction(action.type, action.params)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: colors.accent1 + '1F',
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: borderRadius.full,
            alignSelf: 'flex-start',
          }}
        >
          <Text style={{ fontFamily: fontFamily.semiBold, fontSize: 12, color: colors.accent1 }}>
            {action.label}
          </Text>
          <SmartIcon name="arrow-forward" size={14} color={colors.accent1} />
        </Pressable>
      )}

      {/* Ask Tomo button — shared component */}
      <AskTomoChip prompt={buildTomoPrompt(rec)} noMargin />
    </View>
  );
}

// ── P1: Hero Card with Breathing Glow ────────────────────────────────

function P1Card({
  rec, config, index, s, colors, expanded, setExpanded, hasRag, expiry, factors, dualLoad, onAction,
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
  onAction?: (route: string, params?: Record<string, unknown>) => void;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 80).duration(350).springify()}>
      <GlowWrapper glow={config.glow} breathing style={{ marginBottom: spacing.md }}>
        <GlassCard style={{ borderLeftWidth: 3, borderLeftColor: config.color }}>
          {/* Top row: icon + type badge + science badge + expiry + priority badge */}
          <View style={s.topRow}>
            <View style={s.typeRow}>
              <SmartIcon name={config.icon} size={20} color={config.color} />
              <Badge label={config.label} variant={config.badgeVariant} size="small" />
              {hasRag && <Badge label="Research-backed" variant="outline" size="small" icon="library-outline" />}
            </View>
            <View style={s.typeRow}>
              {expiry && (
                <Text style={[s.expiryText, { color: expiryColor(rec.expiresAt, colors) }]}>
                  {expiry}
                </Text>
              )}
              <Badge label={PRIORITY_LABELS[1]} variant="error" size="small" />
            </View>
          </View>

          {/* Title + chevron */}
          <Pressable
            onPress={() => setExpanded(!expanded)}
            hitSlop={8}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Text style={[s.p1Title, { flex: 1, marginBottom: 0 }]}>{rec.title}</Text>
            <SmartIcon
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={colors.textMuted}
              style={{ marginLeft: spacing.sm }}
            />
          </Pressable>

          {/* Expanded details */}
          {expanded && (
            <>
              {/* Body short */}
              <Text style={[s.p1Body, { marginTop: spacing.sm }]}>{rec.bodyShort}</Text>

              {/* Evidence Pills */}
              {(() => {
                const pills = getEvidencePills(rec.recType as RecType, rec.evidenceBasis, colors);
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

              {rec.bodyLong && <Text style={s.bodyLong}>{rec.bodyLong}</Text>}

              {/* Action CTA */}
              <ActionCTA action={rec.action} onAction={onAction} colors={colors} rec={rec} />

              {/* Confidence bar */}
              <View style={s.confidenceTrack}>
                <LinearGradient
                  colors={[colors.accent1, colors.accent2]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[s.confidenceFill, { width: `${Math.round((rec.confidence || 0) * 100)}%` }]}
                />
              </View>
            </>
          )}
        </GlassCard>
      </GlowWrapper>
    </Animated.View>
  );
}

// ── P2: Accent-Border Card ───────────────────────────────────────────

function P2Card({
  rec, config, index, s, colors, expanded, setExpanded, hasRag, expiry, factors, dualLoad, onAction,
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
  onAction?: (route: string, params?: Record<string, unknown>) => void;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 80).duration(350).springify()}>
      <GlassCard style={{ borderLeftWidth: 3, borderLeftColor: config.color, marginBottom: spacing.sm }}>
        {/* Top row — collapsed: icon + title + priority badge + chevron */}
        <Pressable
          onPress={() => setExpanded(!expanded)}
          hitSlop={8}
          style={s.topRow}
        >
          <View style={[s.typeRow, { flex: 1 }]}>
            <SmartIcon name={config.icon} size={18} color={config.color} />
            <Text style={s.p2Title} numberOfLines={2}>{rec.title}</Text>
          </View>
          <SmartIcon
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.textMuted}
            style={{ flexShrink: 0, marginLeft: 8 }}
          />
        </Pressable>

        {/* Expanded details */}
        {expanded && (
          <>
            {/* Body */}
            <Text style={s.p2Body}>{rec.bodyShort}</Text>

            {hasRag && <Badge label="Research-backed" variant="outline" size="small" icon="library-outline" />}

            {/* Evidence Pills */}
            {(() => {
              const pills = getEvidencePills(rec.recType as RecType, rec.evidenceBasis, colors);
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

            {rec.bodyLong && <Text style={s.bodyLong}>{rec.bodyLong}</Text>}

            {/* Action CTA */}
            <ActionCTA action={rec.action} onAction={onAction} colors={colors} rec={rec} />
          </>
        )}
      </GlassCard>
    </Animated.View>
  );
}

// ── P3: Standard Card ────────────────────────────────────────────────

function P3Card({
  rec, config, index, s, colors, hasRag, expiry, factors, dualLoad, onAction,
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
  onAction?: (route: string, params?: Record<string, unknown>) => void;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 80).duration(350).springify()}>
      <GlassCard style={{ marginBottom: spacing.sm }}>
        {/* Top row: icon + title + badges */}
        <View style={[s.topRow, { marginBottom: spacing.xs }]}>
          <View style={[s.typeRow, { flex: 1 }]}>
            <SmartIcon name={config.icon} size={16} color={config.color} />
            <Text style={s.p3Title} numberOfLines={2}>{rec.title}</Text>
            {hasRag && <SmartIcon name="library-outline" size={12} color={colors.textMuted} style={{ marginLeft: 4 }} />}
          </View>
          {expiry && (
            <Text style={[s.expiryText, { color: expiryColor(rec.expiresAt, colors) }]}>
              {expiry}
            </Text>
          )}
        </View>

        <Text style={s.p3Body}>{rec.bodyShort}</Text>

        {/* Evidence Pills */}
        {(() => {
          const pills = getEvidencePills(rec.recType as RecType, rec.evidenceBasis, colors);
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

        {/* Action CTA */}
        <ActionCTA action={rec.action} onAction={onAction} colors={colors} rec={rec} />
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
          <ActionCTA colors={colors} rec={rec} />
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
      color: colors.textBody,
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
      fontSize: 15,
      color: colors.textOnDark,
      marginBottom: spacing.xs,
    },
    p1Body: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      color: colors.textBody,
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
      fontSize: 13,
      color: colors.textOnDark,
    },
    p2Body: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textBody,
      lineHeight: 20,
    },

    // P3
    p3Title: {
      fontFamily: fontFamily.semiBold,
      fontSize: 13,
      color: colors.textOnDark,
    },
    p3Body: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textBody,
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
      color: colors.textBody,
      lineHeight: 16,
    },
  });
}
