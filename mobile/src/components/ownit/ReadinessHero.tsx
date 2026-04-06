/**
 * ReadinessHero — Top-of-page hero showing athlete's current readiness state.
 * Pulls from AthleteSnapshot for real-time data.
 */

import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SmartIcon } from '../SmartIcon';
import { GlassCard } from '../GlassCard';
import { GlowWrapper } from '../GlowWrapper';
import { MetricPill } from './MetricPill';
import { useTheme } from '../../hooks/useTheme';
import { spacing, fontFamily } from '../../theme';
import type { AthleteSnapshot } from '../../services/api';

interface ReadinessHeroProps {
  snapshot: AthleteSnapshot | null;
}

function ragColor(rag: string | null | undefined, tc: { accent: string; warning: string; error: string; textDisabled: string }): string {
  if (rag === 'GREEN' || rag === 'green') return tc.accent;
  if (rag === 'AMBER' || rag === 'yellow') return tc.warning;
  if (rag === 'RED' || rag === 'red') return tc.error;
  return tc.textDisabled;
}

function ragLabel(rag: string | null | undefined): string {
  if (rag === 'GREEN' || rag === 'green') return 'Ready to Go';
  if (rag === 'AMBER' || rag === 'yellow') return 'Take It Easy';
  if (rag === 'RED' || rag === 'red') return 'Rest Day';
  return 'Check In';
}

function acwrColor(acwr: number | null | undefined, tc: { accent: string; warning: string; error: string; info: string; textDisabled: string }): string {
  if (acwr == null) return tc.textDisabled;
  if (acwr > 1.5) return tc.error;
  if (acwr > 1.3) return tc.warning;
  if (acwr < 0.8) return tc.info;
  return tc.accent;
}

function trendIcon(trend: string | null | undefined): keyof typeof Ionicons.glyphMap {
  if (trend === 'IMPROVING') return 'trending-up';
  if (trend === 'DECLINING') return 'trending-down';
  return 'remove-outline';
}

function trendColor(trend: string | null | undefined, tc: { accent: string; warning: string; error: string }): string {
  if (trend === 'IMPROVING') return tc.accent;
  if (trend === 'DECLINING') return tc.error;
  return tc.warning;
}

export function ReadinessHero({ snapshot }: ReadinessHeroProps) {
  const { colors } = useTheme();

  // No snapshot — don't render anything
  if (!snapshot) {
    return null;
  }

  // Check if readiness data is stale (last checkin > 24h ago)
  const lastCheckin = (snapshot as any).last_checkin_at as string | null;
  const isStale = lastCheckin
    ? (Date.now() - new Date(lastCheckin).getTime()) > 24 * 3600000
    : false;

  const hasReadiness = snapshot.readiness_score != null && !isStale;
  const score = isStale ? null : snapshot.readiness_score;
  const rag = isStale ? null : snapshot.readiness_rag;
  const color = hasReadiness ? ragColor(rag, colors) : colors.textDisabled;
  const glowPreset = rag === 'RED' || rag === 'red' ? 'orange' : 'cyan';

  return (
    <View style={{ marginHorizontal: spacing.lg, marginTop: spacing.md }}>
      <GlowWrapper glow={glowPreset} breathing>
        <GlassCard>
          {/* Score Ring + Label */}
          <View style={{ alignItems: 'center' }}>
            {isStale ? (
              <>
                <View
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 40,
                    borderWidth: 4,
                    borderColor: colors.textDisabled,
                    borderStyle: 'dashed',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.textDisabled + '10',
                  }}
                >
                  <SmartIcon name="time-outline" size={28} color={colors.textDisabled} />
                </View>
                <Text
                  style={{
                    fontFamily: fontFamily.semiBold,
                    fontSize: 14,
                    color: colors.warning,
                    marginTop: spacing.sm,
                  }}
                >
                  Check In
                </Text>
                <Text
                  style={{
                    fontFamily: fontFamily.regular,
                    fontSize: 11,
                    color: colors.textMuted,
                    marginTop: 2,
                  }}
                >
                  Last check-in was over 24h ago
                </Text>
              </>
            ) : hasReadiness ? (
              <>
                <View
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 40,
                    borderWidth: 4,
                    borderColor: color,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: color + '15',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: fontFamily.bold,
                      fontSize: 28,
                      color,
                    }}
                  >
                    {score}
                  </Text>
                </View>
                <Text
                  style={{
                    fontFamily: fontFamily.semiBold,
                    fontSize: 14,
                    color,
                    marginTop: spacing.sm,
                  }}
                >
                  {ragLabel(rag)}
                </Text>
              </>
            ) : null}

            {/* Wellness Trend */}
            {snapshot.wellness_trend && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  marginTop: spacing.xs,
                }}
              >
                <SmartIcon
                  name={trendIcon(snapshot.wellness_trend)}
                  size={14}
                  color={trendColor(snapshot.wellness_trend, colors)}
                />
                <Text
                  style={{
                    fontFamily: fontFamily.regular,
                    fontSize: 11,
                    color: colors.textMuted,
                  }}
                >
                  {snapshot.wellness_7day_avg != null
                    ? `7d avg: ${snapshot.wellness_7day_avg.toFixed(0)}`
                    : snapshot.wellness_trend.toLowerCase()}
                </Text>
              </View>
            )}
          </View>

          {/* Metric Pills Row */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              gap: spacing.sm,
              marginTop: spacing.md,
              flexWrap: 'wrap',
            }}
          >
            {snapshot.acwr != null && (
              <MetricPill
                label="ACWR"
                value={snapshot.acwr.toFixed(2)}
                color={acwrColor(snapshot.acwr, colors)}
                icon="pulse-outline"
              />
            )}
            {snapshot.dual_load_index != null && (
              <MetricPill
                label="Load"
                value={`${Math.round(snapshot.dual_load_index)}/100`}
                color={snapshot.dual_load_index > 80 ? colors.error : snapshot.dual_load_index > 60 ? colors.warning : colors.accent}
                icon="barbell-outline"
              />
            )}
            <MetricPill
              label="Streak"
              value={`${snapshot.streak_days ?? 0}`}
              color={colors.accent1}
              icon="flame-outline"
            />
            {snapshot.sleep_quality != null && (
              <MetricPill
                label="Sleep"
                value={`${snapshot.sleep_quality}/10`}
                color={snapshot.sleep_quality < 5 ? colors.error : snapshot.sleep_quality < 7 ? colors.warning : colors.accent}
                icon="moon-outline"
              />
            )}
            {snapshot.hrv_today_ms != null && (
              <MetricPill
                label="HRV"
                value={`${Math.round(snapshot.hrv_today_ms)}ms`}
                color={
                  snapshot.hrv_baseline_ms != null && snapshot.hrv_today_ms < snapshot.hrv_baseline_ms * 0.85
                    ? colors.error
                    : colors.accent
                }
                icon="heart-outline"
              />
            )}
            {snapshot.injury_risk_flag != null && snapshot.injury_risk_flag !== 'NONE' && (
              <MetricPill
                label="Risk"
                value="Injury"
                color={colors.error}
                icon="warning-outline"
              />
            )}
          </View>
        </GlassCard>
      </GlowWrapper>
    </View>
  );
}
