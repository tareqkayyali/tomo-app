/**
 * Coach Profile Screen — Gen Z design
 *
 * Replaces CoachSettingsScreen. Merged profile + settings view.
 * Profile card + stats + settings sections + logout.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SmartIcon } from '../../components/SmartIcon';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../hooks/useAuth';
import { getCoachPlayers } from '../../services/api';
import { GlassCard } from '../../components/GlassCard';
import { NotificationBell } from '../../components/NotificationBell';
import { HeaderProfileButton } from '../../components/HeaderProfileButton';
import { QuickAccessBar } from '../../components/QuickAccessBar';
import { spacing, borderRadius, fontFamily, layout } from '../../theme';
import type { CoachStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';

type Nav = NativeStackNavigationProp<CoachStackParamList>;

export function CoachProfileScreen() {
  const { colors } = useTheme();
  const { profile, logout } = useAuth();
  const navigation = useNavigation<Nav>();
  const [playerCount, setPlayerCount] = useState(0);

  const initial = profile?.name?.charAt(0)?.toUpperCase() || '?';
  const weekday = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();

  useEffect(() => {
    (async () => {
      try {
        const res = await getCoachPlayers();
        setPlayerCount(res.players.length);
      } catch {
        // silent
      }
    })();
  }, []);

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to log out?')) {
        logout();
      }
    } else {
      Alert.alert('Log out', 'Are you sure you want to log out?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log Out', style: 'destructive', onPress: logout },
      ]);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.headerArea}>
        <View style={styles.headerLeft}>
          <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>TOMO · {weekday}</Text>
          <Text style={[styles.headerTitle, { color: colors.textOnDark }]}>Profile</Text>
        </View>
        <View style={styles.headerRight}>
          <NotificationBell />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Profile Card */}
        <GlassCard>
          <View style={styles.profileRow}>
            <View style={[styles.avatar, { backgroundColor: colors.accent1 + '22' }]}>
              <Text style={[styles.avatarText, { color: colors.accent1 }]}>{initial}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.profileName, { color: colors.textOnDark }]}>
                {profile?.name || 'Coach'}
              </Text>
              <Text style={[styles.profileEmail, { color: colors.textMuted }]}>
                {profile?.email || ''}
              </Text>
              <View style={[styles.roleBadge, { backgroundColor: colors.accent1 + '18' }]}>
                <Text style={[styles.roleBadgeText, { color: colors.accent1 }]}>Coach</Text>
              </View>
            </View>
          </View>
        </GlassCard>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.glass }]}>
            <SmartIcon name="people-outline" size={20} color={colors.accent1} />
            <Text style={[styles.statValue, { color: colors.textOnDark }]}>{playerCount}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Players</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.glass }]}>
            <SmartIcon name="barbell-outline" size={20} color={colors.accent2} />
            <Text style={[styles.statValue, { color: colors.textOnDark }]}>0</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Programmes</Text>
          </View>
        </View>

        {/* Settings Section */}
        <GlassCard>
          <Text style={[styles.sectionTitle, { color: colors.textOnDark }]}>Settings</Text>

          <SettingsRow
            icon="person-add-outline"
            label="Generate Invite Code"
            color={colors.accent2}
            onPress={() => navigation.navigate('CoachInvite')}
            textColor={colors.textOnDark}
            chevronColor={colors.textInactive}
          />
          <SettingsRow
            icon="lock-closed-outline"
            label="Change Password"
            color={colors.accent1}
            onPress={() => {
              if (Platform.OS === 'web') {
                if (window.confirm('A password reset email will be sent to your email address. Send Reset Email?')) {
                  // send reset email
                }
              } else {
                Alert.alert('Change Password', 'A password reset email will be sent to your email address.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Send Reset Email', onPress: () => {} },
                ]);
              }
            }}
            textColor={colors.textOnDark}
            chevronColor={colors.textInactive}
          />
          <SettingsRow
            icon="notifications-outline"
            label="Notifications"
            color={colors.warning}
            onPress={() => {}}
            textColor={colors.textOnDark}
            chevronColor={colors.textInactive}
          />
        </GlassCard>

        {/* Logout */}
        <Pressable onPress={handleLogout} style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}>
          <GlassCard>
            <View style={styles.logoutRow}>
              <SmartIcon name="log-out-outline" size={20} color={colors.error} />
              <Text style={styles.logoutText}>Log Out</Text>
            </View>
          </GlassCard>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingsRow({
  icon,
  label,
  color,
  onPress,
  textColor,
  chevronColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
  textColor: string;
  chevronColor: string;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.settingsRow, { opacity: pressed ? 0.8 : 1 }]}>
      <View style={[styles.settingsIcon, { backgroundColor: color + '18' }]}>
        <SmartIcon name={icon} size={18} color={color} />
      </View>
      <Text style={[styles.settingsLabel, { color: textColor }]}>{label}</Text>
      <SmartIcon name="chevron-forward" size={16} color={chevronColor} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  headerLeft: {},
  headerSubtitle: {
    fontSize: 10,
    fontFamily: fontFamily.semiBold,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: fontFamily.bold,
    letterSpacing: -0.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  scrollContent: {
    paddingHorizontal: layout.screenMargin,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },

  // Profile
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 22,
    fontFamily: fontFamily.bold,
  },
  profileName: {
    fontSize: 18,
    fontFamily: fontFamily.bold,
  },
  profileEmail: {
    fontSize: 13,
    fontFamily: fontFamily.regular,
    marginTop: 2,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    marginTop: 6,
  },
  roleBadgeText: {
    fontSize: 11,
    fontFamily: fontFamily.semiBold,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.lg,
    gap: 4,
  },
  statValue: {
    fontSize: 20,
    fontFamily: fontFamily.bold,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: fontFamily.medium,
  },

  // Settings
  sectionTitle: {
    fontSize: 15,
    fontFamily: fontFamily.bold,
    marginBottom: spacing.sm,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 12,
  },
  settingsIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: fontFamily.medium,
  },

  // Logout
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: spacing.xs,
  },
  logoutText: {
    fontSize: 15,
    fontFamily: fontFamily.semiBold,
    color: colors.error,
  },
});
