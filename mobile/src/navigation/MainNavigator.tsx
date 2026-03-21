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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View, Pressable, Image, Text, PanResponder } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
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
import { SettingsScreen } from '../screens/SettingsScreen';
import { NotificationSettingsScreen } from '../screens/NotificationSettingsScreen';
import { PrivacySettingsScreen } from '../screens/PrivacySettingsScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { WorkoutFeedbackScreen } from '../screens/WorkoutFeedbackScreen';
import { AddEventScreen } from '../screens/AddEventScreen';
import { EventEditScreen } from '../screens/EventEditScreen';
import { DiagnosticsScreen } from '../screens/DiagnosticsScreen';
import { DrillDetailScreen } from '../screens/DrillDetailScreen';
import { DrillCameraScreen } from '../screens/DrillCameraScreen';
import { SessionCompleteScreen } from '../screens/SessionCompleteScreen';
import { DashboardScreen as FullChatScreen } from '../screens/DashboardScreen';
import { ShotDetailScreen } from '../screens/ShotDetailScreen';
import { ShotSessionScreen } from '../screens/ShotSessionScreen';
import { PadelRatingScreen } from '../screens/PadelRatingScreen';
import { FootballSkillDetailScreen, FootballRatingScreen, FootballTestInputScreen } from '../screens/football';
import { PlayerCVScreen } from '../screens/PlayerCVScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { LinkAccountScreen } from '../screens/LinkAccountScreen';
import { StudyPlanPreviewScreen } from '../screens/StudyPlanPreviewScreen';
import { MyRulesScreen } from '../screens/MyRulesScreen';
import { FavoritesScreen } from '../screens/FavoritesScreen';
import PHVCalculatorScreen from '../screens/PHVCalculatorScreen';

import { HeaderProfileButton } from '../components/HeaderProfileButton';
import { NotificationBell } from '../components/NotificationBell';
import { CheckinHeaderButton } from '../components/CheckinHeaderButton';
import { useAuth } from '../hooks/useAuth';
import { useCheckinStatus } from '../hooks/useCheckinStatus';
import { NotificationsProvider, useNotifications } from '../hooks/useNotifications';
import { SubTabProvider, useSubTabs } from '../hooks/useSubTabContext';

import type { MainTabParamList, MainStackParamList } from './types';
import { layout, spacing, borderRadius } from '../theme';
import { useTheme } from '../hooks/useTheme';
import { colors } from '../theme/colors';

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
  Plan: 'Timeline',
  Test: 'Output',
  Chat: 'TOMO',
  Progress: 'Mastery',
  ForYou: 'Own It',
};

import { TomoIcon } from '../components/TomoIcon';

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
      {focused ? (
        // Focused: gradient outline ring around black button
        <LinearGradient
          colors={colors.gradientOrangeCyan}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.centerButtonGradientRing}
        >
          <View style={[styles.centerButton, { backgroundColor: '#000000' }]}>
            <TomoIcon size={48} />
          </View>
        </LinearGradient>
      ) : (
        // Unfocused: thin brand-color border
        <View style={[styles.centerButtonOuter, { borderWidth: 1, borderColor: 'rgba(255, 107, 53, 0.35)' }]}>
          <View style={[styles.centerButton, { backgroundColor: '#000000' }]}>
            <TomoIcon size={48} />
          </View>
        </View>
      )}
    </Pressable>
  );
}

// ── Tab Navigator ───────────────────────────────────────────────────

const TAB_ORDER = ['Plan', 'Test', 'Chat', 'Progress', 'ForYou'] as const;

function TabNavigator() {
  const { colors } = useTheme();
  const { pendingDrillNotifs } = useNotifications();
  const subTabs = useSubTabs();
  const [activeTab, setActiveTab] = useState<string>('Chat');
  const [initialTab, setInitialTab] = useState<string | null>(null);
  const navigationRef = useRef<any>(null);
  const activeTabRef = useRef(activeTab);
  const subTabsRef = useRef(subTabs);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { subTabsRef.current = subTabs; }, [subTabs]);

  // Always open on Chat (Tomo AI) when user logs in
  useEffect(() => {
    setInitialTab('Chat');
  }, []);

  useEffect(() => {
    if (activeTab) {
      AsyncStorage.setItem('tomo_active_tab', activeTab);
    }
  }, [activeTab]);

  // ── Swipe between tabs + sub-tabs ──────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gestureState) => {
        // Only respond to horizontal swipes (not vertical scroll)
        return Math.abs(gestureState.dx) > 30 && Math.abs(gestureState.dy) < Math.abs(gestureState.dx) * 0.5;
      },
      onPanResponderRelease: (_evt, gestureState) => {
        const SWIPE_THRESHOLD = 60;
        if (Math.abs(gestureState.dx) < SWIPE_THRESHOLD) return;

        const currentTab = activeTabRef.current;
        const currentIdx = TAB_ORDER.indexOf(currentTab as typeof TAB_ORDER[number]);
        if (currentIdx === -1) return;

        const swipeLeft = gestureState.dx < 0;
        const controller = subTabsRef.current.get(currentTab);

        // Try sub-tab navigation first
        if (controller) {
          if (swipeLeft && controller.activeIndex < controller.tabs.length - 1) {
            controller.setTab(controller.activeIndex + 1);
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            return;
          }
          if (!swipeLeft && controller.activeIndex > 0) {
            controller.setTab(controller.activeIndex - 1);
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            return;
          }
        }

        // Sub-tab exhausted (or none) → switch main tab
        const nextIdx = swipeLeft
          ? Math.min(currentIdx + 1, TAB_ORDER.length - 1)
          : Math.max(currentIdx - 1, 0);

        if (nextIdx !== currentIdx && navigationRef.current) {
          const nextTab = TAB_ORDER[nextIdx];

          // When entering a tab with sub-tabs, start at first (swipe left) or last (swipe right)
          const nextController = subTabsRef.current.get(nextTab);
          if (nextController) {
            const targetIdx = swipeLeft ? 0 : nextController.tabs.length - 1;
            nextController.setTab(targetIdx);
          }

          // Pass initialTab param for screens with sub-tabs (handles first-mount case
          // where the controller doesn't exist yet)
          const subTabMap: Record<string, string[]> = {
            Plan: ['dayflow', 'studyplan', 'trainingplan'],
            Test: ['vitals', 'metrics', 'programs'],
          };
          const subTabs = subTabMap[nextTab];
          if (subTabs) {
            const initialTab = swipeLeft ? subTabs[0] : subTabs[subTabs.length - 1];
            navigationRef.current.navigate(nextTab, { initialTab });
          } else {
            navigationRef.current.navigate(nextTab);
          }
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      },
    })
  ).current;

  const handleTabPress = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  // Wait for initial tab to be resolved from storage before rendering
  if (!initialTab) return null;

  return (
    <View style={{ flex: 1 }} {...panResponder.panHandlers}>
      <Tab.Navigator
        initialRouteName={(initialTab || 'Chat') as keyof MainTabParamList}
        screenListeners={({ navigation }) => ({
          focus: () => {
            navigationRef.current = navigation;
          },
          state: (e) => {
            navigationRef.current = navigation;
            const state = (e as any).data?.state;
            if (state) {
              const currentRoute = state.routes[state.index];
              setActiveTab(currentRoute.name);
            }
          },
          tabPress: () => handleTabPress(),
        })}
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
        <Tab.Screen
          name="ForYou"
          component={ForYouScreen}
          options={pendingDrillNotifs.length > 0 ? {
            tabBarBadge: pendingDrillNotifs.length,
            tabBarBadgeStyle: { backgroundColor: colors.accent, fontSize: 10, fontWeight: '700' },
          } : undefined}
        />
      </Tab.Navigator>
    </View>
  );
}

// ── Header with Profile Button ──────────────────────────────────────

function ScreenHeader() {
  const { profile } = useAuth();
  const initial = profile?.name?.charAt(0)?.toUpperCase() || '?';
  const navigation = useNavigation<any>();
  const { needsCheckin, isStale, checkinAgeHours } = useCheckinStatus();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <CheckinHeaderButton
        needsCheckin={needsCheckin}
        onPress={() => navigation.navigate('Checkin')}
      />
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
    <SubTabProvider>
    <NotificationsProvider>
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
        options={{ headerShown: true, title: 'Profile', ...stackHeaderOptions, headerRight: undefined, headerBackVisible: true }}
      />
      <Stack.Screen
        name="Checkin"
        component={CheckinScreen}
        options={{ headerShown: true, title: 'Check-in', ...stackHeaderOptions }}
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
        name="EventEdit"
        component={EventEditScreen}
        options={{ headerShown: false }}
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
        name="PlayerCV"
        component={PlayerCVScreen}
        options={{ headerShown: true, title: 'Player CV', ...stackHeaderOptions }}
      />
      <Stack.Screen
        name="FootballTestInput"
        component={FootballTestInputScreen}
        options={{ headerShown: true, title: 'Football Test', ...stackHeaderOptions }}
      />
      {/* Rules screen */}
      <Stack.Screen
        name="MyRules"
        component={MyRulesScreen}
        options={{ headerShown: false }}
      />
      {/* Favorites screen */}
      <Stack.Screen
        name="Favorites"
        component={FavoritesScreen}
        options={{ headerShown: false }}
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
      <Stack.Screen
        name="PHVCalculator"
        component={PHVCalculatorScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
    </NotificationsProvider>
    </SubTabProvider>
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
    padding: 3,
  },
  centerButtonGradientRing: {
    borderRadius: 20,
    padding: 3,
  },
  centerLogo: {
    width: 42,
    height: 42,
    tintColor: colors.textPrimary,
  },
});
