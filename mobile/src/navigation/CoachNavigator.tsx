/**
 * Coach Navigator — 3-tab bottom navigation
 *
 * Tabs: Players | Programmes | Settings
 *
 * Player detail screen has inline Timeline + Mastery tabs.
 * Stack wraps tabs + detail screens:
 *   CoachTabs, CoachPlayerDetail, CoachTestInput, CoachInvite, Profile, EditProfile
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

// Screens — Tabs
import {
  CoachPlayersScreen,
  CoachPlayerDetailScreen,
  CoachPlayerPlanScreen,
  CoachTestInputScreen,
  CoachInviteScreen,
  CoachSettingsScreen,
  DrillBuilderScreen,
} from '../screens/coach';
import { RecommendEventScreen } from '../screens/RecommendEventScreen';

// Screens — Shared
import { ProfileScreen } from '../screens/ProfileScreen';

import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { HeaderProfileButton } from '../components/HeaderProfileButton';
import { NotificationBell } from '../components/NotificationBell';
import { layout, spacing } from '../theme';
import type { CoachTabParamList, CoachStackParamList } from './types';

const Tab = createBottomTabNavigator<CoachTabParamList>();
const Stack = createNativeStackNavigator<CoachStackParamList>();

// ── Tab icon mapping ────────────────────────────────────────────────

type CoachTabName = keyof CoachTabParamList;

const TAB_ICONS: Record<CoachTabName, keyof typeof Ionicons.glyphMap> = {
  Players: 'people-outline',
  Programmes: 'barbell-outline',
  Settings: 'settings-outline',
};

const TAB_LABELS: Record<CoachTabName, string> = {
  Players: 'Players',
  Programmes: 'Drills',
  Settings: 'Settings',
};

// ── Tab Navigator ───────────────────────────────────────────────────

function CoachTabNavigator() {
  const { colors } = useTheme();

  return (
    <Tab.Navigator
      initialRouteName="Players"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={TAB_ICONS[route.name]} size={layout.navIconSize} color={color} />
        ),
        tabBarLabel: TAB_LABELS[route.name],
        tabBarActiveTintColor: colors.accent1,
        tabBarInactiveTintColor: colors.textInactive,
        tabBarShowLabel: true,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: [
          styles.tabBar,
          {
            backgroundColor: colors.navBackground,
            borderTopColor: colors.border,
          },
        ],
      })}
    >
      <Tab.Screen name="Players" component={CoachPlayersScreen} />
      <Tab.Screen name="Programmes" component={DrillBuilderScreen} />
      <Tab.Screen name="Settings" component={CoachSettingsScreen} />
    </Tab.Navigator>
  );
}

// ── Stack wrapping tabs + detail screens ────────────────────────────

function CoachHeaderRight() {
  const { profile } = useAuth();
  const initial = profile?.name?.charAt(0)?.toUpperCase() || '?';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <NotificationBell />
      <HeaderProfileButton initial={initial} photoUrl={profile?.photoUrl} />
    </View>
  );
}

export function CoachNavigator() {
  const { colors } = useTheme();

  const stackHeaderOptions = {
    headerStyle: { backgroundColor: colors.background },
    headerTintColor: colors.textOnDark,
    headerTitleStyle: { color: colors.textOnDark },
    headerShadowVisible: false,
    headerRight: () => <CoachHeaderRight />,
    headerRightContainerStyle: { paddingRight: spacing.md } as any,
  };

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="CoachTabs" component={CoachTabNavigator} />
      <Stack.Screen
        name="CoachPlayerDetail"
        component={CoachPlayerDetailScreen}
        options={{ headerShown: true, title: 'Player Detail', ...stackHeaderOptions }}
      />
      <Stack.Screen
        name="CoachPlayerPlan"
        component={CoachPlayerPlanScreen}
        options={{ headerShown: true, title: 'Player Plan', ...stackHeaderOptions }}
      />
      <Stack.Screen
        name="RecommendEvent"
        component={RecommendEventScreen}
        options={{ headerShown: true, title: 'Recommend', ...stackHeaderOptions }}
      />
      <Stack.Screen
        name="CoachTestInput"
        component={CoachTestInputScreen}
        options={{ headerShown: true, title: 'Submit Test', ...stackHeaderOptions }}
      />
      <Stack.Screen
        name="CoachInvite"
        component={CoachInviteScreen}
        options={{ headerShown: true, title: 'Invite Player', ...stackHeaderOptions }}
      />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ headerShown: true, title: 'Profile', ...stackHeaderOptions }}
      />
    </Stack.Navigator>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  tabBar: {
    borderTopWidth: 0.5,
    height: layout.navHeight,
    paddingTop: 6,
    elevation: 0,
    shadowOpacity: 0,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
});
