/**
 * Onboarding 2/4 — Position
 *
 * Sport-specific position chips. Receives the chosen sport from
 * SportScreen via route params so we can render the right options
 * without a second API call.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { SmartIcon } from '../../components/SmartIcon';
import { PlayerScreen } from '../../components/tomo-ui/playerDesign';
import {
  colors,
  spacing,
  typography,
  borderRadius,
  fontFamily,
  layout,
} from '../../theme';
import { saveOnboardingProgress, OnboardingAnswers } from '../../services/api';
import type { OnboardingStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Position'>;

const POSITIONS_BY_SPORT: Record<OnboardingAnswers['sport'] & string, { value: string; label: string }[]> = {
  football: [
    { value: 'GK', label: 'Goalkeeper' },
    { value: 'CB', label: 'Centre-back' },
    { value: 'FB', label: 'Full-back' },
    { value: 'CM', label: 'Midfielder' },
    { value: 'WM', label: 'Winger' },
    { value: 'ST', label: 'Striker' },
  ],
  soccer: [
    { value: 'GK', label: 'Goalkeeper' },
    { value: 'CB', label: 'Centre-back' },
    { value: 'FB', label: 'Full-back' },
    { value: 'CM', label: 'Midfielder' },
    { value: 'WM', label: 'Winger' },
    { value: 'ST', label: 'Striker' },
  ],
  basketball: [
    { value: 'PG', label: 'Point Guard' },
    { value: 'SG', label: 'Shooting Guard' },
    { value: 'SF', label: 'Small Forward' },
    { value: 'PF', label: 'Power Forward' },
    { value: 'C', label: 'Center' },
  ],
  tennis: [
    { value: 'singles', label: 'Singles' },
    { value: 'doubles', label: 'Doubles' },
    { value: 'both', label: 'Both' },
  ],
  padel: [
    { value: 'forehand', label: 'Forehand (right)' },
    { value: 'backhand', label: 'Backhand (left)' },
    { value: 'either', label: 'Either side' },
  ],
};

export function PositionScreen({ navigation, route }: Props) {
  const sport = route.params.sport;
  const options = POSITIONS_BY_SPORT[sport] ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = async () => {
    if (!selected) {
      setError('Pick where you play to continue.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await saveOnboardingProgress('position', { position: selected });
      navigation.navigate('HeightWeight');
    } catch (e) {
      setError((e as Error).message || "Couldn't save. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PlayerScreen
      label="POSITION"
      title="Your position"
      onBack={() => navigation.goBack()}
      contentStyle={styles.scroll}
    >
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: '50%' }]} />
        </View>
        <Text style={styles.stepLabel}>Step 2 of 4</Text>
        <Text style={styles.subtitle}>Your main position.</Text>

        {error !== null && (
          <View style={styles.errorBanner}>
            <SmartIcon name="alert-circle" size={18} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.list}>
          {options.map((p) => {
            const active = selected === p.value;
            return (
              <TouchableOpacity
                key={p.value}
                onPress={() => {
                  setSelected(p.value);
                  setError(null);
                }}
                style={[styles.chip, active && styles.chipSelected]}
                activeOpacity={0.8}
              >
                <Text style={[styles.chipLabel, active && styles.chipLabelSelected]}>
                  {p.label}
                </Text>
                {active && <SmartIcon name="checkmark" size={18} color={colors.accent1} />}
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          onPress={handleContinue}
          disabled={!selected || loading}
          style={[styles.continueBtn, (!selected || loading) && styles.continueBtnDisabled]}
          activeOpacity={0.8}
        >
          <Text style={styles.continueBtnText}>{loading ? 'Saving...' : 'Continue'}</Text>
        </TouchableOpacity>
    </PlayerScreen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    maxWidth: layout.authMaxWidth,
    width: '100%',
    alignSelf: 'center',
  },
  progressBar: {
    height: 3,
    backgroundColor: colors.borderLight,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  progressFill: { height: '100%', backgroundColor: colors.accent1 },
  stepLabel: { ...typography.metadataSmall, color: colors.textInactive, marginBottom: spacing.sm },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 26,
    color: colors.textOnDark,
    marginBottom: 4,
  },
  subtitle: { ...typography.bodyOnDark, color: colors.textInactive, marginBottom: spacing.lg },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.readinessRedBg,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  errorText: { ...typography.bodySmall, color: colors.error, marginLeft: spacing.sm, flex: 1 },
  list: { gap: spacing.sm, marginBottom: spacing.xl },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  chipSelected: {
    backgroundColor: `${colors.accent1}1F`,
    borderColor: `${colors.accent1}4D`,
  },
  chipLabel: { fontFamily: fontFamily.medium, fontSize: 16, color: colors.textInactive },
  chipLabelSelected: { color: colors.accent1, fontFamily: fontFamily.semiBold },
  continueBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.accent1,
    alignItems: 'center',
  },
  continueBtnDisabled: { opacity: 0.5 },
  continueBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.background,
  },
});
