/**
 * Parent Navigator — 2-tab bottom navigation
 *
 * Tabs: Children | Profile
 *
 * Child detail screen has inline 3-tab layout:
 *   Timeline | Exams | Mastery
 *
 * Stack wraps tabs + detail screens:
 *   ParentTabs → ParentChildDetail → ParentAddStudy → ParentAddExam → etc.
 */

import React, { useRef, useState, useEffect } from 'react';
import { View, StyleSheet, Pressable, PanResponder, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import type { Ionicons } from '@expo/vector-icons';
import { SmartIcon } from '../components/SmartIcon';
import { TomoIcon } from '../components/tomo-ui';

import { ParentChildrenScreen } from '../screens/parent/ParentChildrenScreen';
import { ParentChildDetailScreen } from '../screens/parent/ParentChildDetailScreen';
import { ParentEducationProgressScreen } from '../screens/parent/ParentEducationProgressScreen';
import { ParentCalendarScreen } from '../screens/parent/ParentCalendarScreen';
import { ParentAddStudyScreen } from '../screens/parent/ParentAddStudyScreen';
import { ParentAddExamScreen } from '../screens/parent/ParentAddExamScreen';
import { ParentInviteScreen } from '../screens/parent/ParentInviteScreen';
import { ParentProfileScreen } from '../screens/parent/ParentProfileScreen';
import { RecommendEventScreen } from '../screens/RecommendEventScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { NotificationCenterScreen } from '../screens/NotificationCenterScreen';
import { NotificationSettingsScreen } from '../screens/NotificationSettingsScreen';

import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { HeaderProfileButton } from '../components/HeaderProfileButton';
import { NotificationBell } from '../components/NotificationBell';
import { layout, spacing } from '../theme';
import { screenBg } from '../theme/colors';
import type { ParentTabParamList, ParentStackParamList } from './types';

const Tab = createBottomTabNavigator<ParentTabParamList>();
const Stack = createNativeStackNavigator<ParentStackParamList>();

// ── Tab icon mapping ────────────────────────────────────────────────

type TabName = keyof ParentTabParamList;

const TAB_ICONS: Record<TabName, keyof typeof Ionicons.glyphMap> = {
  Children: 'people-outline',
  ParentProfile: 'person-circle-outline',
};

const TAB_LABELS: Record<TabName, string> = {
  Children: 'Children',
  ParentProfile: 'Profile',
};

// ── Tab Navigator ───────────────────────────────────────────────────

const PARENT_TAB_ORDER = ['Children', 'ParentProfile'] as const;

function ParentTabNavigator() {
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState<string>('Children');
  const navRef = useRef<any>(null);
  const activeTabRef = useRef(activeTab);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gs) =>
        Math.abs(gs.dx) > 30 && Math.abs(gs.dy) < Math.abs(gs.dx) * 0.5,
      onPanResponderRelease: (_evt, gs) => {
        if (Math.abs(gs.dx) < 60) return;
        const currentIdx = PARENT_TAB_ORDER.indexOf(activeTabRef.current as any);
        if (currentIdx === -1) return;
        const nextIdx = gs.dx < 0
          ? Math.min(currentIdx + 1, PARENT_TAB_ORDER.length - 1)
          : Math.max(currentIdx - 1, 0);
        if (nextIdx !== currentIdx && navRef.current) {
          navRef.current.navigate(PARENT_TAB_ORDER[nextIdx]);
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      },
    })
  ).current;

  return (
    <View style={{ flex: 1 }} {...panResponder.panHandlers}>
    <Tab.Navigator
      initialRouteName="Children"
      screenListeners={({ navigation }) => {
        navRef.current = navigation;
        return { state: (e: any) => {
          const idx = e.data?.state?.index;
          if (idx != null) setActiveTab(PARENT_TAB_ORDER[idx]);
        }};
      }}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color, focused }) => (
          <TomoIcon name={route.name === 'Children' ? 'Users' : 'UserCircle'} size={layout.navIconSize} color={color} weight={focused ? 'fill' : 'regular'} />
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
      <Tab.Screen name="Children" component={ParentChildrenScreen} />
      <Tab.Screen name="ParentProfile" component={ParentProfileScreen} />
    </Tab.Navigator>
    </View>
  );
}

// ── Stack wrapping tabs + detail screens ────────────────────────────

function ParentHeaderRight() {
  const { profile } = useAuth();
  const navigation = useNavigation<any>();
  const initial = profile?.name?.charAt(0)?.toUpperCase() || '?';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <NotificationBell />
      <HeaderProfileButton
        initial={initial}
        photoUrl={profile?.photoUrl ?? undefined}
        onPress={() => navigation.navigate('ParentTabs', { screen: 'ParentProfile' })}
      />
    </View>
  );
}

function ParentBackButton() {
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

export function ParentNavigator() {
  const { colors } = useTheme();

  const stackHeaderOptions = {
    headerStyle: { backgroundColor: screenBg },
    headerTintColor: colors.accent1,
    headerTitleStyle: { color: colors.textOnDark },
    headerShadowVisible: false,
    headerBackTitleVisible: false,
    headerLeft: () => <ParentBackButton />,
    headerRight: () => <ParentHeaderRight />,
    headerRightContainerStyle: { paddingRight: spacing.md } as any,
  };

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: screenBg },
      }}
    >
      <Stack.Screen name="ParentTabs" component={ParentTabNavigator} />
      <Stack.Screen
        name="ParentChildDetail"
        component={ParentChildDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ParentEducationProgress"
        component={ParentEducationProgressScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ParentDailyView"
        component={ParentCalendarScreen as any}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ParentAddStudy"
        component={ParentAddStudyScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ParentAddExam"
        component={ParentAddExamScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="RecommendEvent"
        component={RecommendEventScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ParentInvite"
        component={ParentInviteScreen}
        options={{ headerShown: false }}
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
