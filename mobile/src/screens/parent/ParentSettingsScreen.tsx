/**
 * Parent Settings Screen
 * Profile info, invite code generation, linked children, and logout.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../hooks/useAuth';
import { getParentChildren } from '../../services/api';
import { spacing, borderRadius, fontFamily } from '../../theme';
import type { ParentTabParamList, ParentStackParamList } from '../../navigation/types';

// @ts-ignore — Legacy screen, replaced by ParentProfileScreen
type Props = CompositeScreenProps<
  BottomTabScreenProps<ParentTabParamList, 'Children'>,
  NativeStackScreenProps<ParentStackParamList>
>;

export function ParentSettingsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { profile, logout } = useAuth();

  const [childrenCount, setChildrenCount] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const res = await getParentChildren();
        setChildrenCount(res.children.length);
      } catch {
        // ignore
      }
    })();
  }, []);

  const handleLogout = () => {
    logout();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.screenTitle, { color: colors.textOnDark }]}>Settings</Text>

        {/* Profile section */}
        <TouchableOpacity
          style={[styles.profileCard, { backgroundColor: colors.surface }]}
          onPress={() => navigation.navigate('Profile')}
        >
          <View style={[styles.avatar, { backgroundColor: colors.accent1 }]}>
            <Text style={[styles.avatarText, { color: colors.textOnDark }]}>
              {profile?.name?.charAt(0)?.toUpperCase() || '?'}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.textOnDark }]}>
              {profile?.name || 'Parent'}
            </Text>
            <Text style={[styles.profileEmail, { color: colors.textSecondary }]}>
              {profile?.email || ''}
            </Text>
            <Text style={[styles.profileRole, { color: colors.accent1 }]}>
              {profile?.displayRole || 'Parent'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Actions */}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface }]}>
          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => navigation.navigate('ParentInvite')}
          >
            <View style={[styles.settingsIconWrap, { backgroundColor: colors.accent1 + '22' }]}>
              <Ionicons name="key-outline" size={20} color={colors.accent1} />
            </View>
            <View style={styles.settingsRowContent}>
              <Text style={[styles.settingsRowTitle, { color: colors.textOnDark }]}>
                Generate Invite Code
              </Text>
              <Text style={[styles.settingsRowSub, { color: colors.textSecondary }]}>
                Link your child's account
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.settingsRow}>
            <View style={[styles.settingsIconWrap, { backgroundColor: colors.success + '22' }]}>
              <Ionicons name="people-outline" size={20} color={colors.success} />
            </View>
            <View style={styles.settingsRowContent}>
              <Text style={[styles.settingsRowTitle, { color: colors.textOnDark }]}>
                Linked Children
              </Text>
              <Text style={[styles.settingsRowSub, { color: colors.textSecondary }]}>
                {childrenCount} {childrenCount === 1 ? 'child' : 'children'} linked
              </Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => navigation.navigate('Profile' as any)}
          >
            <View style={[styles.settingsIconWrap, { backgroundColor: colors.accent2 + '22' }]}>
              <Ionicons name="create-outline" size={20} color={colors.accent2} />
            </View>
            <View style={styles.settingsRowContent}>
              <Text style={[styles.settingsRowTitle, { color: colors.textOnDark }]}>
                Edit Profile
              </Text>
              <Text style={[styles.settingsRowSub, { color: colors.textSecondary }]}>
                Update your information
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity
          style={[styles.logoutButton, { backgroundColor: colors.error + '22' }]}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={[styles.logoutText, { color: colors.error }]}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    padding: spacing.lg,
    paddingBottom: 40,
  },
  screenTitle: {
    fontSize: 28,
    fontFamily: fontFamily.bold,
    marginBottom: spacing.xl,
  },

  // Profile card
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 22,
    fontFamily: fontFamily.bold,
  },
  profileInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  profileName: {
    fontSize: 17,
    fontFamily: fontFamily.bold,
  },
  profileEmail: {
    fontSize: 13,
    marginTop: 2,
  },
  profileRole: {
    fontSize: 12,
    fontFamily: fontFamily.semiBold,
    marginTop: 2,
  },

  // Section card
  sectionCard: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  settingsIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsRowContent: {
    flex: 1,
    marginLeft: spacing.md,
  },
  settingsRowTitle: {
    fontSize: 15,
    fontFamily: fontFamily.semiBold,
  },
  settingsRowSub: {
    fontSize: 12,
    marginTop: 2,
  },
  divider: {
    height: 0.5,
    marginLeft: spacing.md + 36 + spacing.md,
  },

  // Logout
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  logoutText: {
    fontSize: 16,
    fontFamily: fontFamily.semiBold,
  },
});
