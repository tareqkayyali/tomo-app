/**
 * Onboarding 1/4 — Sport
 *
 * Single-tap pick between the four sports Tomo currently supports.
 * Saves to users.onboarding_state via /onboarding/progress and
 * pushes PositionScreen.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SmartIcon } from '../../components/SmartIcon';
import {
  colors,
  spacing,
  typography,
  borderRadius,
  fontFamily,
  layout,
} from '../../theme';
import { saveOnboardingProgress } from '../../services/api';
import type { OnboardingStackParamList } from '../../navigation/types';

type Sport = 'football' | 'basketball' | 'tennis' | 'padel';

type Props = {
  navigation: NativeStackNavigationProp<OnboardingStackParamList, 'Sport'>;
};

const SPORTS: { value: Sport; label: string; icon: string }[] = [
  { value: 'football', label: 'Football', icon: 'football-outline' },
  { value: 'basketball', label: 'Basketball', icon: 'basketball-outline' },
  { value: 'tennis', label: 'Tennis', icon: 'tennisball-outline' },
  { value: 'padel', label: 'Padel', icon: 'tennisball-outline' },
];

export function SportScreen({ navigation }: Props) {
  const [selected, setSelected] = useState<Sport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = async () => {
    if (!selected) {
      setError('Pick your sport to continue.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await saveOnboardingProgress('sport', { sport: selected });
      navigation.navigate('Position', { sport: selected });
    } catch (e) {
      setError((e as Error).message || "Couldn't save your pick. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: '25%' }]} />
        </View>
        <Text style={styles.stepLabel}>Step 1 of 4</Text>
        <Text style={styles.title}>What sport do you play?</Text>
        <Text style={styles.subtitle}>Pick the one you train most.</Text>

        {error !== null && (
          <View style={styles.errorBanner}>
            <SmartIcon name="alert-circle" size={18} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.grid}>
          {SPORTS.map((s) => {
            const active = selected === s.value;
            return (
              <TouchableOpacity
                key={s.value}
                onPress={() => {
                  setSelected(s.value);
                  setError(null);
                }}
                style={[styles.card, active && styles.cardSelected]}
                activeOpacity={0.8}
              >
                <SmartIcon
                  name={s.icon as never}
                  size={40}
                  color={active ? colors.accent1 : colors.textInactive}
                />
                <Text style={[styles.cardLabel, active && styles.cardLabelSelected]}>
                  {s.label}
                </Text>
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.lg,
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
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent1,
  },
  stepLabel: {
    ...typography.metadataSmall,
    color: colors.textInactive,
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 26,
    color: colors.textOnDark,
    marginBottom: 4,
  },
  subtitle: {
    ...typography.bodyOnDark,
    color: colors.textInactive,
    marginBottom: spacing.lg,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.readinessRedBg,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.error,
    marginLeft: spacing.sm,
    flex: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  card: {
    width: '48%',
    aspectRatio: 1,
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  cardSelected: {
    backgroundColor: `${colors.accent1}1F`,
    borderColor: `${colors.accent1}4D`,
  },
  cardLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.textInactive,
  },
  cardLabelSelected: {
    color: colors.accent1,
  },
  continueBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.accent1,
    alignItems: 'center',
  },
  continueBtnDisabled: {
    opacity: 0.5,
  },
  continueBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.background,
  },
});
