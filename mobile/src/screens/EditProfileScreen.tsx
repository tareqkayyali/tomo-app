/**
 * Edit Profile Screen
 * Edit user name, sport, region, team
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Switch,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Input, Card, ErrorState } from '../components';
import { SportSelector } from '../components/SportSelector';
import { colors, spacing, typography, borderRadius, fontFamily } from '../theme';
import { updateUser } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useHealthKit } from '../hooks/useHealthKit';
import type { Sport } from '../types';

export function EditProfileScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const { profile, refreshProfile } = useAuth();

  const [name, setName] = useState(profile?.name || '');
  const [sport, setSport] = useState<Sport>(profile?.sport || 'football');
  const [region, setRegion] = useState(profile?.region || '');
  const [teamId, setTeamId] = useState(profile?.teamId || '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const {
    isModuleAvailable: hkModuleAvailable,
    isConnected: hkConnected,
    isLoading: hkLoading,
    error: hkError,
    connect: hkConnect,
    disconnect: hkDisconnect,
  } = useHealthKit();

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    setIsSaving(true);
    setError('');
    try {
      await updateUser({
        name: name.trim(),
        displayName: name.trim(),
        sport,
        region: region.trim() || undefined,
        teamId: teamId.trim() || undefined,
      });
      await refreshProfile();
      setSuccess(true);
      setTimeout(() => navigation.goBack(), 1000);
    } catch (err) {
      setError((err as Error).message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {error !== '' && (
          <ErrorState message={error} compact />
        )}

        {success && (
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <Text style={styles.successText}>Profile updated!</Text>
          </View>
        )}

        <Card style={styles.card}>
          <Input
            label="Name"
            placeholder="Your name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />

          <Text style={styles.sportLabel}>Sport</Text>
          <SportSelector
            selected={sport}
            onSelect={(s) => setSport(s as Sport)}
          />
          {sport === 'padel' && (
            <View style={styles.padelEnabledRow}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.padelEnabledText}>
                Padel features enabled — DNA Card, Shot Mastery, Rating Pathway
              </Text>
            </View>
          )}
          <View style={{ height: spacing.md }} />

          <Input
            label="Region (optional)"
            placeholder="e.g. US-East, Europe"
            value={region}
            onChangeText={setRegion}
          />

          <Input
            label="Team ID (optional)"
            placeholder="Your team identifier"
            value={teamId}
            onChangeText={setTeamId}
          />

          {/* ── Health Integration ─────────────────── */}
          <View style={styles.healthSection}>
            <View style={styles.healthDivider} />
            <Text style={styles.healthLabel}>Health Integration</Text>

            {Platform.OS === 'ios' ? (
              <View style={styles.healthRow}>
                <View style={styles.healthInfo}>
                  <Ionicons name="heart-outline" size={20} color={colors.accent2} />
                  <View style={styles.healthTextCol}>
                    <Text style={styles.healthTitle}>Apple Health</Text>
                    <Text style={styles.healthSubtitle}>
                      {!hkModuleAvailable
                        ? 'Requires custom dev build'
                        : hkConnected
                          ? 'Connected — syncing sleep'
                          : 'Sync sleep data automatically'}
                    </Text>
                  </View>
                </View>
                {hkLoading ? (
                  <ActivityIndicator size="small" color={colors.accent2} />
                ) : (
                  <Switch
                    value={hkConnected}
                    onValueChange={async (value) => {
                      if (value) {
                        if (!hkModuleAvailable) {
                          Alert.alert(
                            'Not Available',
                            'HealthKit requires a custom development build. Sleep data can still be entered manually during check-in.',
                          );
                          return;
                        }
                        await hkConnect();
                      } else {
                        Alert.alert(
                          'Disconnect Health',
                          'Stop syncing sleep data from Apple Health?',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Disconnect', style: 'destructive', onPress: hkDisconnect },
                          ],
                        );
                      }
                    }}
                    disabled={!hkModuleAvailable || hkLoading}
                    trackColor={{ false: colors.border, true: colors.accent2 }}
                    thumbColor={colors.cardLight}
                  />
                )}
              </View>
            ) : (
              <View style={styles.healthRow}>
                <View style={styles.healthInfo}>
                  <Ionicons name="heart-outline" size={20} color={colors.textInactive} />
                  <View style={styles.healthTextCol}>
                    <Text style={styles.healthTitle}>Health Connect</Text>
                    <Text style={styles.healthSubtitle}>
                      Android health integration coming soon. Use manual sleep entry during check-in.
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {hkError && (
              <Text style={styles.healthError}>{hkError}</Text>
            )}
          </View>
        </Card>

        <Button
          title="Save Changes"
          onPress={handleSave}
          loading={isSaving}
          variant="gradient"
          size="large"
          icon="checkmark"
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  card: {
    marginBottom: spacing.lg,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.readinessGreenBg,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  successText: {
    ...typography.body,
    color: colors.readinessGreen,
    marginLeft: spacing.sm,
  },
  sportLabel: {
    ...typography.label,
    color: colors.textInactive,
    marginBottom: spacing.sm,
  },
  padelEnabledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    backgroundColor: 'rgba(52, 199, 89, 0.1)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  padelEnabledText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.success,
    flex: 1,
  },

  // ── Health Integration ─────────────────────────
  healthSection: {
    marginTop: spacing.lg,
  },
  healthDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  healthLabel: {
    ...typography.label,
    color: colors.textInactive,
    marginBottom: spacing.sm,
  },
  healthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  healthInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
  },
  healthTextCol: {
    flex: 1,
  },
  healthTitle: {
    ...typography.body,
    color: colors.textOnLight,
    fontFamily: fontFamily.medium,
  },
  healthSubtitle: {
    ...typography.metadataSmall,
    color: colors.textInactive,
    marginTop: 2,
  },
  healthError: {
    ...typography.metadataSmall,
    color: colors.error,
    marginTop: spacing.xs,
  },
});
