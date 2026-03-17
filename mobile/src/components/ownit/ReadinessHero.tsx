/**
 * ReadinessHero — Top-of-page hero showing athlete's current readiness state.
 * Pulls from AthleteSnapshot for real-time data.
 */

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { GlassCard } from '../GlassCard';
import { GlowWrapper } from '../GlowWrapper';
import { MetricPill } from './MetricPill';
import { useTheme } from '../../hooks/useTheme';
import { spacing, fontFamily, borderRadius } from '../../theme';
import type { AthleteSnapshot } from '../../services/api';

interface ReadinessHeroProps {
  snapshot: AthleteSnapshot | null;
}

function ragColor(rag: string | null | undefined): string {
  if (rag === 'GREEN' || rag === 'green') return '#30D158';
  if (rag === 'AMBER' || rag === 'yellow') return '#F39C12';
  if (rag === 'RED' || rag === 'red') return '#E74C3C';
  return '#6B6B6B';
}

function ragLabel(rag: string | null | undefined): string {
  if (rag === 'GREEN' || rag === 'green') return 'Ready to Go';
  if (rag === 'AMBER' || rag === 'yellow') return 'Take It Easy';
  if (rag === 'RED' || rag === 'red') return 'Rest Day';
  return 'Check In';
}

function acwrColor(acwr: number | null | undefined): string {
  if (acwr == null) return '#6B6B6B';
  if (acwr > 1.5) return '#E74C3C';
  if (acwr > 1.3) return '#F39C12';
  if (acwr < 0.8) return '#00D9FF';
  return '#30D158';
}

function trendIcon(trend: string | null | undefined): keyof typeof Ionicons.glyphMap {
  if (trend === 'IMPROVING') return 'trending-up';
  if (trend === 'DECLINING') return 'trending-down';
  return 'remove-outline';
}

function trendColor(trend: string | null | undefined): string {
  if (trend === 'IMPROVING') return '#30D158';
  if (trend === 'DECLINING') return '#E74C3C';
  return '#F39C12';
}

export function ReadinessHero({ snapshot }: ReadinessHeroProps) {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();

  // Fully empty — no snapshot at all
  if (!snapshot) {
    return (
      <GlassCard style={{ marginHorizontal: spacing.lg, marginTop: spacing.md }}>
        <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
          <Ionicons name="pulse-outline" size={40} color={colors.textMuted} />
          <Text
            style={{
              fontFamily: fontFamily.medium,
              fontSize: 14,
              color: colors.textMuted,
              marginTop: spacing.sm,
              textAlign: 'center',
            }}
          >
            Check in to see your readiness
          </Text>
          <Pressable
            onPress={() => navigation.navigate('Checkin')}
            style={{
              marginTop: spacing.md,
              backgroundColor: colors.accent1,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.sm,
              borderRadius: borderRadius.full,
            }}
          >
            <Text
              style={{
                fontFamily: fontFamily.semiBold,
                fontSize: 12,
                color: '#FFFFFF',
                textTransform: 'uppercase',
                letterSpacing: 0.8,
              }}
            >
              Check In
            </Text>
          </Pressable>
        </View>
      </GlassCard>
    );
  }

  const hasReadiness = snapshot.readiness_score != null;
  const score = snapshot.readiness_score;
  const rag = snapshot.readiness_rag;
  const color = hasReadiness ? ragColor(rag) : '#00D9FF';
  const glowPreset = rag === 'RED' || rag === 'red' ? 'orange' : 'cyan';

  return (
    <View style={{ marginHorizontal: spacing.lg, marginTop: spacing.md }}>
      <GlowWrapper glow={glowPreset} breathing>
        <GlassCard>
          {/* Score Ring + Label */}
          <View style={{ alignItems: 'center' }}>
            {hasReadiness ? (
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
            ) : (
              <>
                <Pressable
                  onPress={() => navigation.navigate('Checkin')}
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 40,
                    borderWidth: 2,
                    borderColor: colors.textMuted + '40',
                    borderStyle: 'dashed',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.textMuted + '08',
                  }}
                >
                  <Ionicons name="add" size={28} color={colors.accent1} />
                </Pressable>
                <Text
                  style={{
                    fontFamily: fontFamily.semiBold,
                    fontSize: 13,
                    color: colors.accent1,
                    marginTop: spacing.sm,
                  }}
                >
                  Check in for readiness
                </Text>
              </>
            )}

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
                <Ionicons
                  name={trendIcon(snapshot.wellness_trend)}
                  size={14}
                  color={trendColor(snapshot.wellness_trend)}
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
                color={acwrColor(snapshot.acwr)}
                icon="pulse-outline"
              />
            )}
            {snapshot.dual_load_index != null && (
              <MetricPill
                label="Load"
                value={`${Math.round(snapshot.dual_load_index)}/100`}
                color={snapshot.dual_load_index > 80 ? '#E74C3C' : snapshot.dual_load_index > 60 ? '#F39C12' : '#30D158'}
                icon="barbell-outline"
              />
            )}
            <MetricPill
              label="Streak"
              value={`${snapshot.streak_days ?? 0}🔥`}
              color={colors.accent1}
              icon="flame-outline"
            />
            {snapshot.sleep_quality != null && (
              <MetricPill
                label="Sleep"
                value={`${snapshot.sleep_quality}/10`}
                color={snapshot.sleep_quality < 5 ? '#E74C3C' : snapshot.sleep_quality < 7 ? '#F39C12' : '#30D158'}
                icon="moon-outline"
              />
            )}
            {snapshot.hrv_today_ms != null && (
              <MetricPill
                label="HRV"
                value={`${Math.round(snapshot.hrv_today_ms)}ms`}
                color={
                  snapshot.hrv_baseline_ms != null && snapshot.hrv_today_ms < snapshot.hrv_baseline_ms * 0.85
                    ? '#E74C3C'
                    : '#30D158'
                }
                icon="heart-outline"
              />
            )}
            {snapshot.injury_risk_flag != null && snapshot.injury_risk_flag !== 'NONE' && (
              <MetricPill
                label="Risk"
                value="Injury"
                color="#E74C3C"
                icon="warning-outline"
              />
            )}
          </View>
        </GlassCard>
      </GlowWrapper>
    </View>
  );
}
