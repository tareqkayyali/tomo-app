/**
 * Onboarding 4/4 — Goal
 *
 * Final screen. One-tap pick from five life-and-sport goals. On
 * Continue calls /onboarding/finalize which materialises the full
 * accumulated state, seeds My Rules, fires the PHV event, and flips
 * onboarding_complete. After refreshProfile the RootNavigator
 * auto-routes to MainNavigator.
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
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SmartIcon } from '../../components/SmartIcon';
import {
  colors,
  spacing,
  typography,
  borderRadius,
  fontFamily,
  layout,
} from '../../theme';
import { saveOnboardingProgress, finalizeOnboarding } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import type { OnboardingStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Goal'>;

type Goal = 'get_better' | 'stay_consistent' | 'recover' | 'get_recruited' | 'have_fun';

const GOALS: { value: Goal; label: string; body: string; icon: string }[] = [
  { value: 'get_better',     label: 'Get better',        body: 'Level up your game.',                 icon: 'trending-up-outline' },
  { value: 'stay_consistent',label: 'Stay consistent',   body: 'Show up week after week.',            icon: 'calendar-outline' },
  { value: 'recover',        label: 'Recover from injury', body: 'Get back to full training safely.', icon: 'medkit-outline' },
  { value: 'get_recruited',  label: 'Get recruited',     body: 'Work toward a scholarship or pro.',   icon: 'trophy-outline' },
  { value: 'have_fun',       label: 'Have fun',          body: 'Enjoy the game, stay active.',        icon: 'happy-outline' },
];

export function GoalScreen({}: Props) {
  const [selected, setSelected] = useState<Goal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { refreshProfile } = useAuth();

  const handleFinish = async () => {
    if (!selected) {
      setError('Pick what matters to you.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await saveOnboardingProgress('goal', { primaryGoal: selected });
      await finalizeOnboarding({ primaryGoal: selected });
      // Refresh the profile so RootNavigator sees onboarding_complete=true
      // and routes to MainNavigator.
      await refreshProfile();
      // No explicit navigation — the navigator switch handles it.
    } catch (e) {
      setError((e as Error).message || "Couldn't finish. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: '100%' }]} />
        </View>
        <Text style={styles.stepLabel}>Step 4 of 4</Text>
        <Text style={styles.title}>What matters most to you?</Text>
        <Text style={styles.subtitle}>Your goal shapes the coaching Tomo gives you.</Text>

        {error !== null && (
          <View style={styles.errorBanner}>
            <SmartIcon name="alert-circle" size={18} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.list}>
          {GOALS.map((g) => {
            const active = selected === g.value;
            return (
              <TouchableOpacity
                key={g.value}
                onPress={() => {
                  setSelected(g.value);
                  setError(null);
                }}
                style={[styles.card, active && styles.cardSelected]}
                activeOpacity={0.8}
              >
                <SmartIcon
                  name={g.icon as never}
                  size={28}
                  color={active ? colors.accent1 : colors.textInactive}
                />
                <View style={styles.cardText}>
                  <Text style={[styles.cardTitle, active && styles.cardTitleSelected]}>{g.label}</Text>
                  <Text style={styles.cardBody}>{g.body}</Text>
                </View>
                {active && <SmartIcon name="checkmark" size={22} color={colors.accent1} />}
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          onPress={handleFinish}
          disabled={!selected || loading}
          style={[styles.continueBtn, (!selected || loading) && styles.continueBtnDisabled]}
          activeOpacity={0.8}
        >
          <Text style={styles.continueBtnText}>
            {loading ? 'Setting you up...' : 'Start training'}
          </Text>
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
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  cardSelected: {
    backgroundColor: `${colors.accent1}1F`,
    borderColor: `${colors.accent1}4D`,
  },
  cardText: { flex: 1 },
  cardTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.textOnDark,
  },
  cardTitleSelected: { color: colors.accent1 },
  cardBody: {
    ...typography.bodySmall,
    color: colors.textInactive,
    marginTop: 2,
  },
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
