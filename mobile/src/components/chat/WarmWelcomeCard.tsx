/**
 * Warm Welcome Card
 *
 * Phase 4: shown at the top of the empty Tomo Chat screen to give a
 * first-time user a sense that Tomo already knows them. Reads
 * profile.name / sport / position / age_band (via ageBandFromProfile)
 * and renders a human greeting + two action chips.
 *
 * The card renders whenever chat is empty — returning users who
 * clear their chat see it too, which is a welcome not an interruption.
 *
 * No AI call, no DB write. Pure render-time personalisation.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SmartIcon } from '../SmartIcon';
import {
  colors,
  spacing,
  typography,
  borderRadius,
  fontFamily,
} from '../../theme';
import { ageBandFromProfile } from '../../utils/ageBand';
import type { User } from '../../types';

type Props = {
  profile: User | null;
  /** Called when the user taps "Log today's check-in". */
  onCheckIn?: () => void;
  /** Called when the user taps "Plan my week". */
  onPlanWeek?: () => void;
};

const POSITION_LABEL: Record<string, string> = {
  GK: 'goalkeeper',
  CB: 'centre-back',
  FB: 'full-back',
  CM: 'midfielder',
  WM: 'winger',
  ST: 'striker',
  PG: 'point guard',
  SG: 'shooting guard',
  SF: 'small forward',
  PF: 'power forward',
  C: 'center',
};

const SPORT_LABEL: Record<string, string> = {
  football: 'football',
  soccer: 'football',
  basketball: 'basketball',
  tennis: 'tennis',
  padel: 'padel',
};

function buildGreeting(profile: User | null): { title: string; body: string } {
  if (!profile) {
    return {
      title: "Welcome to Tomo.",
      body: "Log today's session, check in, or ask me anything — I've got you.",
    };
  }
  const firstName = (profile.displayName || profile.name || '').split(/\s+/)[0] || 'there';
  const band = ageBandFromProfile({ age: profile.age, dateOfBirth: profile.dateOfBirth });
  const sport = SPORT_LABEL[profile.sport ?? ''] ?? profile.sport ?? 'athlete';
  const posCode = profile.position ?? null;
  const position = posCode ? POSITION_LABEL[posCode] ?? null : null;

  const title = `Hey ${firstName}.`;
  // Two-part body: identity + invitation. Tone: Gen Z teen-ready,
  // not corporate, not slang — a coach who's seen you around.
  const identity = position
    ? `I've got you as a ${position} ${sport} player`
    : `I've got you as a ${sport} player`;
  const suffix = band !== 'unknown' ? `, ${band} athlete.` : '.';
  const body = `${identity}${suffix} Ready when you are.`;
  return { title, body };
}

export function WarmWelcomeCard({ profile, onCheckIn, onPlanWeek }: Props) {
  const { title, body } = useMemo(() => buildGreeting(profile), [profile]);

  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <SmartIcon name="sparkles-outline" size={20} color={colors.accent1} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>

      {(onCheckIn || onPlanWeek) && (
        <View style={styles.chipRow}>
          {onCheckIn && (
            <Pressable style={styles.chip} onPress={onCheckIn}>
              <SmartIcon name="heart-outline" size={14} color={colors.accent1} />
              <Text style={styles.chipText}>Check in</Text>
            </Pressable>
          )}
          {onPlanWeek && (
            <Pressable style={styles.chip} onPress={onPlanWeek}>
              <SmartIcon name="calendar-outline" size={14} color={colors.accent1} />
              <Text style={styles.chipText}>Plan my week</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: `${colors.accent1}14`,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: `${colors.accent1}33`,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: `${colors.accent1}26`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: fontFamily.semiBold,
    fontSize: 18,
    color: colors.textOnDark,
    marginBottom: 2,
  },
  body: {
    ...typography.bodyOnDark,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: `${colors.accent1}4D`,
    backgroundColor: `${colors.accent1}1F`,
  },
  chipText: {
    ...typography.caption,
    fontFamily: fontFamily.medium,
    color: colors.accent1,
  },
});
