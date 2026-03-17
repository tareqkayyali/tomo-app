/**
 * Parent Navigator — 4-tab bottom navigation
 *
 * Tabs:
 *   Timeline | Exams | Mastery | Settings
 *
 * Stack wraps tabs + detail screens for drill-in navigation.
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import {
  ParentCalendarScreen,
  ParentChildPlanScreen,
  ParentExamScreen,
  ParentMasteryScreen,
  ParentAddStudyScreen,
  ParentAddExamScreen,
  ParentInviteScreen,
  ParentSettingsScreen,
} from '../screens/parent';
import { RecommendEventScreen } from '../screens/RecommendEventScreen';

import { ProfileScreen } from '../screens/ProfileScreen';

import type { ParentTabParamList, ParentStackParamList } from './types';
import { layout, spacing } from '../theme';
import { useTheme } from '../hooks/useTheme';

const Tab = createBottomTabNavigator<ParentTabParamList>();
const Stack = createNativeStackNavigator<ParentStackParamList>();

// ── Tab icon mapping ────────────────────────────────────────────────

type TabName = keyof ParentTabParamList;

const TAB_ICONS: Record<TabName, keyof typeof Ionicons.glyphMap> = {
  Timeline: 'calendar-outline',
  Exams: 'school-outline',
  Mastery: 'trending-up-outline',
  Settings: 'settings-outline',
};

const TAB_LABELS: Record<TabName, string> = {
  Timeline: 'Timeline',
  Exams: 'Exams',
  Mastery: 'Mastery',
  Settings: 'Settings',
};

// ── Tab Navigator ───────────────────────────────────────────────────

function ParentTabNavigator() {
  const { colors } = useTheme();

  return (
    <Tab.Navigator
      initialRouteName="Timeline"
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
        tabBarStyle: [styles.tabBar, {
          backgroundColor: colors.navBackground,
          borderTopColor: colors.border,
        }],
      })}
    >
      <Tab.Screen name="Timeline" component={ParentChildPlanScreen} />
      <Tab.Screen name="Exams" component={ParentExamScreen} />
      <Tab.Screen name="Mastery" component={ParentMasteryScreen} />
      <Tab.Screen name="Settings" component={ParentSettingsScreen} />
    </Tab.Navigator>
  );
}

// ── Stack wrapping tabs + detail screens ────────────────────────────

export function ParentNavigator() {
  const { colors } = useTheme();

  const stackHeaderOptions = {
    headerStyle: { backgroundColor: colors.background },
    headerTintColor: colors.textOnDark,
    headerTitleStyle: { color: colors.textOnDark },
    headerShadowVisible: false,
  };

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="ParentTabs" component={ParentTabNavigator} />
      <Stack.Screen
        name="ParentDailyView"
        component={ParentCalendarScreen as any}
        options={{ headerShown: true, title: 'Daily View', ...stackHeaderOptions }}
      />
      <Stack.Screen
        name="ParentAddStudy"
        component={ParentAddStudyScreen}
        options={{ headerShown: true, title: 'Add Study Block', ...stackHeaderOptions }}
      />
      <Stack.Screen
        name="ParentAddExam"
        component={ParentAddExamScreen}
        options={{ headerShown: true, title: 'Add Exam', ...stackHeaderOptions }}
      />
      <Stack.Screen
        name="RecommendEvent"
        component={RecommendEventScreen}
        options={{ headerShown: true, title: 'Recommend', ...stackHeaderOptions }}
      />
      <Stack.Screen
        name="ParentInvite"
        component={ParentInviteScreen}
        options={{ headerShown: true, title: 'Invite Code', ...stackHeaderOptions }}
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
