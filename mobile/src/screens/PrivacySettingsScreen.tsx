/**
 * Privacy Settings Screen
 * Toggle passport visibility and granular data sharing for scouts.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
  Pressable,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, borderRadius, fontFamily } from '../theme';
import type { ThemeColors } from '../theme/colors';
import { useTheme } from '../hooks/useTheme';
import { getPrivacySettings, updatePrivacySettings } from '../services/api';
import type { PrivacySettings } from '../types';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ToggleRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle: string;
  value: boolean;
  onValueChange: (val: boolean) => void;
  disabled?: boolean;
}

function ToggleRow({ icon, label, subtitle, value, onValueChange, disabled }: ToggleRowProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.toggleRow, disabled && styles.toggleRowDisabled]}>
      <View style={styles.toggleInfo}>
        <View style={styles.toggleIconWrap}>
          <Ionicons
            name={icon}
            size={20}
            color={disabled ? colors.textMuted : value ? colors.accent1 : colors.textInactive}
          />
        </View>
        <View style={styles.toggleTextCol}>
          <Text style={[styles.toggleLabel, disabled && styles.textDisabled]}>{label}</Text>
          <Text style={[styles.toggleSubtitle, disabled && styles.textDisabled]}>{subtitle}</Text>
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.border, true: colors.accent1 }}
        thumbColor={colors.cardLight}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Granular toggle config
// ---------------------------------------------------------------------------

const TOGGLES: Array<{
  key: keyof Omit<PrivacySettings, 'passportEnabled'>;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle: string;
}> = [
  { key: 'showVideoTests', icon: 'flash-outline', label: 'Drill Results', subtitle: 'BlazePod reaction times and drill stats' },
  { key: 'showStreakData', icon: 'flame-outline', label: 'Consistency Score', subtitle: 'Streak history and multiplier' },
  { key: 'showArchetype', icon: 'flash-outline', label: 'Archetype', subtitle: 'Your athletic archetype classification' },
  { key: 'showPhysicalProfile', icon: 'body-outline', label: 'Physical Profile', subtitle: 'Age, height, weight, position' },
  { key: 'showSleepData', icon: 'moon-outline', label: 'Sleep Data', subtitle: 'Average sleep hours (aggregated)' },
  { key: 'showPoints', icon: 'trophy-outline', label: 'Points & Level', subtitle: 'Total points and milestones' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PrivacySettingsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [settings, setSettings] = useState<PrivacySettings | null>(null);
  const [parentalConsentRequired, setParentalConsentRequired] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    getPrivacySettings()
      .then((res) => {
        setSettings(res.privacySettings);
        setParentalConsentRequired(res.parentalConsentRequired);
        if (res.parentalConsentRequired) {
          Alert.alert(
            'Parental Consent Required',
            'Athletes under 18 need parental consent before enabling their public passport.',
          );
        }
      })
      .catch(() => {
        setSettings({
          passportEnabled: false,
          showVideoTests: false,
          showStreakData: false,
          showArchetype: false,
          showPhysicalProfile: false,
          showSleepData: false,
          showPoints: false,
        });
      })
      .finally(() => setIsLoading(false));
  }, []);

  const handleToggle = useCallback(
    async (key: keyof PrivacySettings, value: boolean) => {
      if (!settings) return;

      const prev = { ...settings };
      const updated = { ...settings, [key]: value };
      setSettings(updated);

      setIsSaving(true);
      try {
        const res = await updatePrivacySettings({ [key]: value });
        setSettings(res.privacySettings);
      } catch {
        setSettings(prev);
        Alert.alert('Error', 'Failed to update privacy settings.');
      } finally {
        setIsSaving(false);
      }
    },
    [settings],
  );

  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        message: 'Check out my Tomo Athletic Passport!',
      });
    } catch {
      // User cancelled
    }
  }, []);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent1} />
        </View>
      </View>
    );
  }

  if (!settings) return null;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Parental consent warning */}
        {parentalConsentRequired && (
          <View style={styles.warningCard}>
            <Ionicons name="warning-outline" size={20} color={colors.warning} />
            <Text style={styles.warningText}>
              Parental consent is required for athletes under 18 to enable their public passport.
            </Text>
          </View>
        )}

        {/* Master toggle */}
        <View style={styles.card}>
          <ToggleRow
            icon="globe-outline"
            label="Athletic Passport"
            subtitle="Allow scouts to view your verified profile"
            value={settings.passportEnabled}
            onValueChange={(val) => handleToggle('passportEnabled', val)}
            disabled={parentalConsentRequired}
          />
        </View>

        {/* Share passport URL */}
        {settings.passportEnabled && !parentalConsentRequired && (
          <Pressable
            style={({ pressed }) => [styles.shareCard, pressed && { opacity: 0.7 }]}
            onPress={handleShare}
          >
            <Ionicons name="share-outline" size={20} color={colors.accent1} />
            <Text style={styles.shareText}>Share Passport Link</Text>
          </Pressable>
        )}

        {/* Granular toggles */}
        <View style={[styles.card, { marginTop: spacing.lg }]}>
          <Text style={styles.sectionTitle}>Data Visibility</Text>
          <Text style={styles.sectionSubtitle}>
            Choose what scouts can see on your passport
          </Text>

          {TOGGLES.map((toggle, idx) => (
            <React.Fragment key={toggle.key}>
              {idx > 0 && <View style={styles.divider} />}
              <ToggleRow
                icon={toggle.icon}
                label={toggle.label}
                subtitle={toggle.subtitle}
                value={settings[toggle.key]}
                onValueChange={(val) => handleToggle(toggle.key, val)}
                disabled={!settings.passportEnabled || parentalConsentRequired}
              />
            </React.Fragment>
          ))}
        </View>

        {isSaving && (
          <Text style={styles.savingText}>Saving...</Text>
        )}

        <Text style={styles.footnote}>
          All privacy settings default to off. Only data you explicitly enable will be visible on your public passport. This is not medical advice.
        </Text>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xxl,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },

    // ── Cards ───────────────────────────────────────────────────────────
    card: {
      backgroundColor: colors.backgroundElevated,
      borderRadius: borderRadius.lg,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
    },

    warningCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: 'rgba(255,212,59,0.1)',
      borderRadius: borderRadius.md,
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    warningText: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.warning,
      flex: 1,
    },

    shareCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      backgroundColor: colors.backgroundElevated,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      marginTop: spacing.md,
    },
    shareText: {
      fontFamily: fontFamily.medium,
      fontSize: 15,
      color: colors.accent1,
    },

    // ── Section header ──────────────────────────────────────────────────
    sectionTitle: {
      fontFamily: fontFamily.semiBold,
      fontSize: 15,
      color: colors.textOnDark,
      paddingTop: spacing.md,
    },
    sectionSubtitle: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      color: colors.textInactive,
      marginTop: 2,
      marginBottom: spacing.sm,
    },

    // ── Toggle Row ──────────────────────────────────────────────────────
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.md,
    },
    toggleRowDisabled: {
      opacity: 0.4,
    },
    toggleInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      marginRight: spacing.md,
    },
    toggleIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'rgba(255,255,255,0.06)',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: spacing.md,
    },
    toggleTextCol: {
      flex: 1,
    },
    toggleLabel: {
      fontFamily: fontFamily.medium,
      fontSize: 15,
      color: colors.textOnDark,
    },
    toggleSubtitle: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      color: colors.textInactive,
      marginTop: 2,
    },
    textDisabled: {
      color: colors.textMuted,
    },

    // ── Misc ────────────────────────────────────────────────────────────
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
    },
    savingText: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.accent1,
      textAlign: 'center',
      marginTop: spacing.md,
    },
    footnote: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: spacing.lg,
    },
  });
}
