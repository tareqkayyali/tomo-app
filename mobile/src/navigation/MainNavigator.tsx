/**
 * Main Navigator — 5-tab bottom navigation (v2 Premium)
 *
 * Tabs:
 *   Plan | Test | Chat (CENTER RAISED, tomo logo) | Progress | For You
 *
 * Profile removed from tabs → accessible via HeaderProfileButton (top-right)
 *
 * Center Chat tab:
 *   - Oversized, raised above tab bar
 *   - Rounded-square with orange→cyan gradient
 *   - tomo logo icon
 *   - Subtle glow shadow
 *
 * Loop Indicator: 4-step daily progress (Plan → Test → Progress → For You)
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, View, Pressable, Image, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

// Screens — Tabs
import { HomeScreen } from '../screens/HomeScreen';
import { ProgressScreen } from '../screens/ProgressScreen';
import { TestsScreen } from '../screens/TestsScreen';
import { TrainingScreen } from '../screens/TrainingScreen';
import { ForYouScreen } from '../screens/ForYouScreen';

// Screens — Stack
import { ProfileScreen } from '../screens/ProfileScreen';
import { CheckinScreen } from '../screens/CheckinScreen';
import { EditProfileScreen } from '../screens/EditProfileScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { NotificationSettingsScreen } from '../screens/NotificationSettingsScreen';
import { PrivacySettingsScreen } from '../screens/PrivacySettingsScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { WorkoutFeedbackScreen } from '../screens/WorkoutFeedbackScreen';
import { AddEventScreen } from '../screens/AddEventScreen';
import { DiagnosticsScreen } from '../screens/DiagnosticsScreen';
import { DrillDetailScreen } from '../screens/DrillDetailScreen';
import { DrillCameraScreen } from '../screens/DrillCameraScreen';
import { SessionCompleteScreen } from '../screens/SessionCompleteScreen';
import { DashboardScreen as FullChatScreen } from '../screens/DashboardScreen';
import { PhoneTestsListScreen } from '../screens/PhoneTestsListScreen';
import { ReactionTestScreen } from '../screens/ReactionTestScreen';
import { JumpTestScreen } from '../screens/JumpTestScreen';
import { SprintTestScreen } from '../screens/SprintTestScreen';
import { AgilityTestScreen } from '../screens/AgilityTestScreen';
import { BalanceTestScreen } from '../screens/BalanceTestScreen';
import { PhoneTestCompleteScreen } from '../screens/PhoneTestCompleteScreen';
import { ShotDetailScreen } from '../screens/ShotDetailScreen';
import { ShotSessionScreen } from '../screens/ShotSessionScreen';
import { PadelRatingScreen } from '../screens/PadelRatingScreen';
import { FootballSkillDetailScreen, FootballRatingScreen, FootballTestInputScreen } from '../screens/football';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { LinkAccountScreen } from '../screens/LinkAccountScreen';
import { StudyPlanPreviewScreen } from '../screens/StudyPlanPreviewScreen';

import { HeaderProfileButton } from '../components/HeaderProfileButton';
import { NotificationBell } from '../components/NotificationBell';
import { LoopIndicator, LoopCompleteBanner } from '../components/LoopIndicator';
import { useAuth } from '../hooks/useAuth';

import type { MainTabParamList, MainStackParamList } from './types';
import { layout, spacing, borderRadius } from '../theme';
import { useTheme } from '../hooks/useTheme';

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<MainStackParamList>();

// ── Tab icon mapping ────────────────────────────────────────────────

type TabName = keyof MainTabParamList;

const TAB_ICONS: Record<TabName, keyof typeof Ionicons.glyphMap> = {
  Plan: 'calendar-outline',
  Test: 'flash-outline',
  Chat: 'chatbubble-outline',
  Progress: 'bar-chart-outline',
  ForYou: 'star-outline',
};

const TAB_LABELS: Record<TabName, string> = {
  Plan: 'Plan',
  Test: 'Test',
  Chat: 'TOMO',
  Progress: 'Progress',
  ForYou: 'For You',
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const tomoLogo = require('../../assets/tomo-logo.png');

// ── Animated tab icon ───────────────────────────────────────────────

function AnimatedTabIcon({
  focused,
  color,
  iconName,
}: {
  focused: boolean;
  color: string;
  iconName: keyof typeof Ionicons.glyphMap;
}) {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withSpring(focused ? 1.1 : 1, {
      damping: 15,
      stiffness: 150,
    });
  }, [focused]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Ionicons name={iconName} size={layout.navIconSize} color={color} />
    </Animated.View>
  );
}

// ── Center Chat Tab Button (RAISED, GRADIENT, TOMO LOGO) ────────────

function CenterChatButton({
  onPress,
  focused,
}: {
  onPress: () => void;
  focused: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.centerButtonWrap,
        pressed && { transform: [{ scale: 0.95 }] },
      ]}
    >
      <View style={[styles.centerButtonOuter, focused && styles.centerButtonFocusRing]}>
        <LinearGradient
          colors={colors.gradientOrangeCyan}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.centerButton, { shadowColor: colors.accent1 }]}
        >
          <Image
            source={tomoLogo}
            style={styles.centerLogo}
            resizeMode="contain"
          />
        </LinearGradient>
      </View>
    </Pressable>
  );
}

// ── Tab Navigator ───────────────────────────────────────────────────

// Tab-to-loop-step mapping (Chat is not a loop step)
const TAB_TO_LOOP: Record<string, number> = { Plan: 0, Test: 1, Progress: 2, ForYou: 3 };

function TabNavigator() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<string>('Chat');
  const [loopSteps, setLoopSteps] = useState([false, false, false, false]);

  // Mark loop step complete 1s after visiting the tab
  useEffect(() => {
    const stepIdx = TAB_TO_LOOP[activeTab];
    if (stepIdx !== undefined && !loopSteps[stepIdx]) {
      const timer = setTimeout(() => {
        setLoopSteps(prev => {
          const next = [...prev];
          next[stepIdx] = true;
          return next;
        });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [activeTab]);

  const loopComplete = loopSteps.every(Boolean);

  const handleTabPress = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  // Navigate to tab when user taps a loop step
  const handleLoopStepPress = useCallback((index: number) => {
    const tabNames = ['Plan', 'Test', 'Progress', 'ForYou'] as const;
    // We need a ref to navigate — for now, just set the active tab
    // (actual navigation is handled via the tab bar state listener)
    setActiveTab(tabNames[index]);
  }, []);

  return (
    <View style={{ flex: 1 }}>
      {/* Loop Indicator above tab content — paddingTop for safe area */}
      <View style={{ backgroundColor: colors.background, paddingTop: insets.top }}>
        <LoopIndicator steps={loopSteps} onStepPress={handleLoopStepPress} />
        <LoopCompleteBanner visible={loopComplete} />
      </View>

      <Tab.Navigator
        initialRouteName="Chat"
        screenListeners={{
          state: (e) => {
            const state = (e as any).data?.state;
            if (state) {
              const currentRoute = state.routes[state.index];
              setActiveTab(currentRoute.name);
            }
          },
          tabPress: handleTabPress,
        }}
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarIcon: ({ focused, color }) => {
            if (route.name === 'Chat') {
              return null; // Custom center button handles this
            }
            return (
              <AnimatedTabIcon
                focused={focused}
                color={color}
                iconName={TAB_ICONS[route.name]}
              />
            );
          },
          tabBarButton: route.name === 'Chat'
            ? (props) => (
                <CenterChatButton
                  onPress={() => props.onPress?.({} as any)}
                  focused={activeTab === 'Chat'}
                />
              )
            : undefined,
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
        <Tab.Screen name="Plan" component={TrainingScreen} />
        <Tab.Screen name="Test" component={TestsScreen} />
        <Tab.Screen name="Chat" component={HomeScreen} />
        <Tab.Screen name="Progress" component={ProgressScreen} />
        <Tab.Screen name="ForYou" component={ForYouScreen} />
      </Tab.Navigator>
    </View>
  );
}

// ── Header with Profile Button ──────────────────────────────────────

function ScreenHeader() {
  const { profile } = useAuth();
  const initial = profile?.name?.charAt(0)?.toUpperCase() || '?';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <NotificationBell />
      <HeaderProfileButton
        initial={initial}
        photoUrl={profile?.photoUrl}
      />
    </View>
  );
}

function useStackHeaderOptions() {
  const { colors } = useTheme();
  return {
    headerStyle: { backgroundColor: colors.background },
    headerTintColor: colors.textOnDark,
    headerTitleStyle: { color: colors.textOnDark },
    headerShadowVisible: false,
    headerRight: () => <ScreenHeader />,
    headerRightContainerStyle: { paddingRight: spacing.md } as any,
  };
}

// ── Stack wrapping tabs + detail screens ────────────────────────────

export function MainNavigator() {
  const { colors } = useTheme();
  const stackHeaderOptions = useStackHeaderOptions();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="MainTabs" component={TabNavigator} />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ headerShown: true, title: 'Profile', ...stackHeaderOptions, headerRight: undefined }}
      />
      <Stack.Screen
        name="Checkin"
        component={CheckinScreen}
        options={{ headerShown: true, title: 'Check-in', ...stackHeaderOptions }}
      />
      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ headerShown: true, title: 'Edit Profile', ...stackHeaderOptions }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="NotificationSettings"
        component={NotificationSettingsScreen}
        options={{ headerShown: true, title: 'Notifications', ...stackHeaderOptions }}
      />
      <Stack.Screen
        name="PrivacySettings"
        component={PrivacySettingsScreen}
        options={{ headerShown: true, title: 'Privacy', ...stackHeaderOptions }}
      />
      <Stack.Screen
        name="History"
        component={HistoryScreen}
        options={{ headerShown: true, title: 'Check-in History', ...stackHeaderOptions }}
      />
      <Stack.Screen
        name="WorkoutFeedback"
        component={WorkoutFeedbackScreen}
        options={{ headerShown: true, title: 'Workout Feedback', ...stackHeaderOptions }}
      />
      <Stack.Screen
        name="AddEvent"
        component={AddEventScreen}
        options={{ headerShown: false, presentation: 'modal' }}
      />
      <Stack.Screen
        name="Diagnostics"
        component={DiagnosticsScreen}
        options={{ headerShown: true, title: 'Diagnostics', ...stackHeaderOptions }}
      />
      <Stack.Screen
        name="DrillDetail"
        component={DrillDetailScreen}
        options={{ headerShown: true, title: 'Drill', ...stackHeaderOptions }}
      />
      <Stack.Screen
        name="DrillCamera"
        component={DrillCameraScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="SessionComplete"
        component={SessionCompleteScreen}
        options={{
          headerShown: true,
          title: 'Session Complete',
          ...stackHeaderOptions,
          headerBackVisible: false,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="FullChat"
        component={FullChatScreen}
        options={{ headerShown: true, title: 'TOMO', ...stackHeaderOptions }}
      />
      <Stack.Screen
        name="PhoneTestsList"
        component={PhoneTestsListScreen}
        options={{ headerShown: true, title: 'Phone Tests', ...stackHeaderOptions }}
      />
      <Stack.Screen
        name="ReactionTest"
        component={ReactionTestScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="JumpTest"
        component={JumpTestScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="SprintTest"
        component={SprintTestScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AgilityTest"
        component={AgilityTestScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="BalanceTest"
        component={BalanceTestScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PhoneTestComplete"
        component={PhoneTestCompleteScreen}
        options={{
          headerShown: true,
          title: 'Test Results',
          ...stackHeaderOptions,
          headerBackVisible: false,
          gestureEnabled: false,
        }}
      />
      {/* Padel-specific screens */}
      <Stack.Screen
        name="ShotDetail"
        component={ShotDetailScreen}
        options={{ headerShown: true, title: 'Shot Detail', ...stackHeaderOptions }}
      />
      <Stack.Screen
        name="ShotSession"
        component={ShotSessionScreen}
        options={{ headerShown: true, title: 'Rate Session', ...stackHeaderOptions }}
      />
      <Stack.Screen
        name="PadelRating"
        component={PadelRatingScreen}
        options={{ headerShown: true, title: 'Padel Rating', ...stackHeaderOptions }}
      />
      {/* Football-specific screens */}
      <Stack.Screen
        name="FootballSkillDetail"
        component={FootballSkillDetailScreen}
        options={{ headerShown: true, title: 'Skill Detail', ...stackHeaderOptions }}
      />
      <Stack.Screen
        name="FootballRating"
        component={FootballRatingScreen}
        options={{ headerShown: true, title: 'Football Rating', ...stackHeaderOptions }}
      />
      <Stack.Screen
        name="FootballTestInput"
        component={FootballTestInputScreen}
        options={{ headerShown: true, title: 'Football Test', ...stackHeaderOptions }}
      />
      {/* Study plan screens */}
      <Stack.Screen
        name="StudyPlanPreview"
        component={StudyPlanPreviewScreen}
        options={{ headerShown: true, title: 'Study Plan Preview', ...stackHeaderOptions }}
      />
      {/* Multi-role screens */}
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ headerShown: true, title: 'Notifications', ...stackHeaderOptions }}
      />
      <Stack.Screen
        name="LinkAccount"
        component={LinkAccountScreen}
        options={{ headerShown: true, title: 'Link Account', ...stackHeaderOptions }}
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

  // ── Center Chat Button (Tomo Logo) ───────────────────────────────
  centerButtonWrap: {
    top: -20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerButton: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
  centerButtonOuter: {
    borderRadius: 20,
    borderWidth: 3,
    borderColor: 'transparent',
    padding: 3,
  },
  centerButtonFocusRing: {
    borderColor: '#FF6B35',
  },
  centerLogo: {
    width: 32,
    height: 32,
    tintColor: '#FFFFFF',
  },
});
