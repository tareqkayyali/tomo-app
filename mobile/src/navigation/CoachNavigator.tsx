/**
 * Coach Navigator — 2-tab bottom navigation
 *
 * Tabs: Players | Profile
 *
 * Player detail screen has inline 4-tab layout:
 *   Timeline | Mastery | Programmes | Tests
 *
 * Stack wraps tabs + detail screens:
 *   CoachTabs → CoachPlayerDetail → CoachTestInput → CoachInvite → Profile
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Pressable, PanResponder, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { SmartIcon } from '../components/SmartIcon';
import * as Haptics from 'expo-haptics';
import { TomoIcon } from '../components/tomo-ui';

// Screens — Tabs
import { CoachDashboardScreen } from '../screens/coach/CoachDashboardScreen';
import { CoachPlayersScreen } from '../screens/coach/CoachPlayersScreen';
import { CoachPlayerDetailScreen } from '../screens/coach/CoachPlayerDetailScreen';
import { CoachPlayerPlanScreen } from '../screens/coach/CoachPlayerPlanScreen';
import { CoachTestInputScreen } from '../screens/coach/CoachTestInputScreen';
import { CoachAddProgramScreen } from '../screens/coach/CoachAddProgramScreen';
import { CoachInviteScreen } from '../screens/coach/CoachInviteScreen';
import { CoachProfileScreen } from '../screens/coach/CoachProfileScreen';

import { RecommendEventScreen } from '../screens/RecommendEventScreen';

// Screens — Shared
import { ProfileScreen } from '../screens/ProfileScreen';
import { NotificationCenterScreen } from '../screens/NotificationCenterScreen';
import { NotificationSettingsScreen } from '../screens/NotificationSettingsScreen';

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
  CoachDashboard: 'grid-outline',
  Players: 'people-outline',
  CoachProfile: 'person-circle-outline',
};

const TAB_LABELS: Record<CoachTabName, string> = {
  CoachDashboard: 'Dashboard',
  Players: 'Players',
  CoachProfile: 'Profile',
};

// ── Tab Navigator ───────────────────────────────────────────────────

const COACH_TAB_ORDER = ['CoachDashboard', 'Players', 'CoachProfile'] as const;

function CoachTabNavigator() {
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState<string>('Players');
  const navRef = useRef<any>(null);
  const activeTabRef = useRef(activeTab);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gs) =>
        Math.abs(gs.dx) > 30 && Math.abs(gs.dy) < Math.abs(gs.dx) * 0.5,
      onPanResponderRelease: (_evt, gs) => {
        if (Math.abs(gs.dx) < 60) return;
        const currentIdx = COACH_TAB_ORDER.indexOf(activeTabRef.current as any);
        if (currentIdx === -1) return;
        const nextIdx = gs.dx < 0
          ? Math.min(currentIdx + 1, COACH_TAB_ORDER.length - 1)
          : Math.max(currentIdx - 1, 0);
        if (nextIdx !== currentIdx && navRef.current) {
          navRef.current.navigate(COACH_TAB_ORDER[nextIdx]);
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      },
    })
  ).current;

  return (
    <View style={{ flex: 1 }} {...panResponder.panHandlers}>
    <Tab.Navigator
      initialRouteName="CoachDashboard"
      screenListeners={({ navigation }) => {
        navRef.current = navigation;
        return { state: (e: any) => {
          const idx = e.data?.state?.index;
          if (idx != null) setActiveTab(COACH_TAB_ORDER[idx]);
        }};
      }}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color, focused }) => {
          const iconName =
            route.name === 'CoachDashboard' ? 'SquaresFour' :
            route.name === 'Players' ? 'Users' :
            'UserCircle';
          return (
            <TomoIcon name={iconName} size={layout.navIconSize} color={color} weight={focused ? 'fill' : 'regular'} />
          );
        },
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
      <Tab.Screen name="CoachDashboard" component={CoachDashboardScreen} />
      <Tab.Screen name="Players" component={CoachPlayersScreen} />
      <Tab.Screen name="CoachProfile" component={CoachProfileScreen} />
    </Tab.Navigator>
    </View>
  );
}

// ── Stack wrapping tabs + detail screens ────────────────────────────

function CoachHeaderRight() {
  const { profile } = useAuth();
  const navigation = useNavigation<any>();
  const initial = profile?.name?.charAt(0)?.toUpperCase() || '?';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <NotificationBell />
      <HeaderProfileButton
        initial={initial}
        photoUrl={profile?.photoUrl ?? undefined}
        onPress={() => navigation.navigate('CoachTabs', { screen: 'CoachProfile' })}
      />
    </View>
  );
}

function CoachBackButton() {
  const nav = useNavigation();
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => nav.goBack()}
      style={{
        padding: 8,
        marginLeft: 4,
        backgroundColor: colors.accent1 + '18',
        borderRadius: 20,
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      hitSlop={8}
    >
      <SmartIcon name="chevron-back" size={22} color={colors.accent1} />
    </Pressable>
  );
}

export function CoachNavigator() {
  const { colors } = useTheme();

  const stackHeaderOptions = {
    headerStyle: { backgroundColor: colors.background },
    headerTintColor: colors.accent1,
    headerTitleStyle: { color: colors.textOnDark },
    headerShadowVisible: false,
    headerBackTitleVisible: false,
    headerLeft: () => <CoachBackButton />,
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
        name="CoachAddProgram"
        component={CoachAddProgramScreen}
        options={{ headerShown: true, title: 'Add Program', ...stackHeaderOptions }}
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
      <Stack.Screen
        name="Notifications"
        component={NotificationCenterScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="NotificationSettings"
        component={NotificationSettingsScreen}
        options={{ headerShown: true, title: 'Notification Settings', ...stackHeaderOptions }}
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
