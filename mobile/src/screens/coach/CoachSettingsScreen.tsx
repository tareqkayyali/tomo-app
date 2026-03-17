/**
 * Coach Settings Screen
 * Profile info, invite generation, linked players count, and logout.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../hooks/useAuth';
import { getCoachPlayers } from '../../services/api';
import { spacing, borderRadius, layout, fontFamily } from '../../theme';
import type { CoachStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<CoachStackParamList>;

export function CoachSettingsScreen() {
  const { colors } = useTheme();
  const { profile, logout } = useAuth();
  const navigation = useNavigation<Nav>();
  const [playerCount, setPlayerCount] = useState(0);

  useEffect(() => {
    getCoachPlayers()
      .then((res) => setPlayerCount(res.players.length))
      .catch(() => {});
  }, []);

  const handleLogout = useCallback(() => {
    logout();
  }, [logout]);

  const MenuItem = ({
    icon,
    label,
    value,
    onPress,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    value?: string;
    onPress?: () => void;
  }) => (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuItem,
        { backgroundColor: colors.surfaceElevated, opacity: pressed && onPress ? 0.85 : 1 },
      ]}
    >
      <View style={styles.menuItemLeft}>
        <Ionicons name={icon} size={20} color={colors.accent1} />
        <Text style={[styles.menuItemLabel, { color: colors.textOnDark }]}>{label}</Text>
      </View>
      <View style={styles.menuItemRight}>
        {value && (
          <Text style={[styles.menuItemValue, { color: colors.textInactive }]}>{value}</Text>
        )}
        {onPress && (
          <Ionicons name="chevron-forward" size={18} color={colors.textInactive} />
        )}
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.textOnDark }]}>Settings</Text>

        {/* Profile Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>PROFILE</Text>
          <MenuItem
            icon="person-outline"
            label="Name"
            value={profile?.name || '—'}
          />
          <MenuItem
            icon="mail-outline"
            label="Email"
            value={profile?.email || '—'}
          />
          <MenuItem
            icon="shield-outline"
            label="Role"
            value={profile?.displayRole || 'Coach'}
          />
        </View>

        {/* Coach Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>COACHING</Text>
          <MenuItem
            icon="key-outline"
            label="Generate Invite Code"
            onPress={() => navigation.navigate('CoachInvite')}
          />
          <MenuItem
            icon="people-outline"
            label="Linked Players"
            value={String(playerCount)}
          />
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>ACCOUNT</Text>
          <MenuItem
            icon="person-circle-outline"
            label="Profile"
            onPress={() => navigation.navigate('Profile')}
          />
        </View>

        {/* Logout */}
        <Pressable
          onPress={handleLogout}
          style={({ pressed }) => [
            styles.logoutButton,
            { opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={[styles.logoutText, { color: colors.error }]}>Logout</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: layout.screenMargin,
    paddingBottom: spacing.xxl,
  },
  title: {
    fontSize: 28,
    fontFamily: fontFamily.bold,
    marginBottom: spacing.xl,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionHeader: {
    fontSize: 12,
    fontFamily: fontFamily.bold,
    letterSpacing: 1,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.compact,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.compact,
  },
  menuItemLabel: {
    fontSize: 15,
    fontFamily: fontFamily.medium,
  },
  menuItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  menuItemValue: {
    fontSize: 14,
    fontFamily: fontFamily.regular,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.compact,
    marginTop: spacing.md,
  },
  logoutText: {
    fontSize: 16,
    fontFamily: fontFamily.semiBold,
  },
});
