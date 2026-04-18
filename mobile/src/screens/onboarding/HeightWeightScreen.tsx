/**
 * Onboarding 3/4 — Height & Weight
 *
 * Two numeric inputs on one screen. Required for PHV calculation
 * (growth-phase load modulation). We accept only sensible ranges
 * (100-230 cm, 25-180 kg) and trust the server to re-validate.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
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
import { saveOnboardingProgress } from '../../services/api';
import type { OnboardingStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'HeightWeight'>;

export function HeightWeightScreen({ navigation }: Props) {
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const heightNum = parseFloat(height);
  const weightNum = parseFloat(weight);
  const heightValid = heightNum >= 100 && heightNum <= 230;
  const weightValid = weightNum >= 25 && weightNum <= 180;
  const canContinue = heightValid && weightValid && !loading;

  const handleContinue = async () => {
    if (!heightValid) {
      setError('Height should be between 100 and 230 cm.');
      return;
    }
    if (!weightValid) {
      setError('Weight should be between 25 and 180 kg.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await saveOnboardingProgress('heightWeight', {
        heightCm: heightNum,
        weightKg: weightNum,
      });
      navigation.navigate('Goal');
    } catch (e) {
      setError((e as Error).message || "Couldn't save. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kav}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: '75%' }]} />
          </View>
          <Text style={styles.stepLabel}>Step 3 of 4</Text>
          <Text style={styles.title}>How tall are you?</Text>
          <Text style={styles.subtitle}>
            This lets Tomo keep your training load safe for your growth stage.
          </Text>

          {error !== null && (
            <View style={styles.errorBanner}>
              <SmartIcon name="alert-circle" size={18} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.row}>
            <View style={styles.field}>
              <Text style={styles.label}>Height</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={height}
                  onChangeText={(v) => {
                    setHeight(v.replace(/[^0-9.]/g, ''));
                    setError(null);
                  }}
                  keyboardType="decimal-pad"
                  placeholder="175"
                  placeholderTextColor={colors.textInactive}
                  maxLength={5}
                />
                <Text style={styles.unit}>cm</Text>
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Weight</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={weight}
                  onChangeText={(v) => {
                    setWeight(v.replace(/[^0-9.]/g, ''));
                    setError(null);
                  }}
                  keyboardType="decimal-pad"
                  placeholder="65"
                  placeholderTextColor={colors.textInactive}
                  maxLength={5}
                />
                <Text style={styles.unit}>kg</Text>
              </View>
            </View>
          </View>

          <Text style={styles.hint}>
            Accurate numbers help — they only get used for your training plan.
          </Text>

          <TouchableOpacity
            onPress={handleContinue}
            disabled={!canContinue}
            style={[styles.continueBtn, !canContinue && styles.continueBtnDisabled]}
            activeOpacity={0.8}
          >
            <Text style={styles.continueBtnText}>{loading ? 'Saving...' : 'Continue'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  kav: { flex: 1 },
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
  errorText: { ...typography.bodySmall, color: colors.error, marginLeft: spacing.sm, flex: 1 },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  field: { flex: 1 },
  label: { ...typography.metadataSmall, color: colors.textInactive, marginBottom: spacing.xs },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
  },
  input: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 24,
    color: colors.textOnDark,
    paddingVertical: spacing.md,
  },
  unit: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.textInactive,
    marginLeft: spacing.sm,
  },
  hint: {
    ...typography.bodySmall,
    color: colors.textInactive,
    marginBottom: spacing.xl,
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
