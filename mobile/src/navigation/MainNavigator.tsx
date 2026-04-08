/**
 * Main Navigator — 3-tab bottom navigation (v2 Premium)
 *
 * Tabs:
 *   Timeline | Chat (CENTER RAISED, tomo logo) | Dashboard
 *
 * Profile removed from tabs → accessible via HeaderProfileButton (top-right)
 *
 * Center Chat tab:
 *   - Oversized, raised above tab bar
 *   - Rounded-square with gradient
 *   - tomo logo icon
 *   - Subtle glow shadow
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View, Pressable, Image, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import type { MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SmartIcon } from '../components/SmartIcon';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

// Screens — Tabs
import { HomeScreen } from '../screens/HomeScreen';
import { TrainingScreen } from '../screens/TrainingScreen';
import { SignalDashboardScreen } from '../screens/SignalDashboardScreen';

// Screens — Stack
import { ProfileScreen } from '../screens/ProfileScreen';
import { CheckinScreen } from '../screens/CheckinScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { NotificationSettingsScreen } from '../screens/NotificationSettingsScreen';
import { PrivacySettingsScreen } from '../screens/PrivacySettingsScreen';
import ChangePasswordScreen from '../screens/ChangePasswordScreen';
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
import { NotificationCenterScreen } from '../screens/NotificationCenterScreen';
import { LinkAccountScreen } from '../screens/LinkAccountScreen';
import { StudyPlanPreviewScreen } from '../screens/StudyPlanPreviewScreen';
import { MyRulesScreen } from '../screens/MyRulesScreen';
import { FavoritesScreen } from '../screens/FavoritesScreen';
import PHVCalculatorScreen from '../screens/PHVCalculatorScreen';
import { StudyPlanView } from '../screens/StudyPlanView';
import { TrainingPlanView } from '../screens/TrainingPlanView';
import { BulkEditEventsScreen } from '../screens/BulkEditEventsScreen';

import { HeaderProfileButton } from '../components/HeaderProfileButton';
import { NotificationBell } from '../components/NotificationBell';
import { CheckinHeaderButton } from '../components/CheckinHeaderButton';
import { TomoIcon } from '../components/tomo-ui';
import { fontFamily } from '../theme/typography';
import { useAuth } from '../hooks/useAuth';
import { useCheckinStatus } from '../hooks/useCheckinStatus';
import { NotificationsProvider } from '../hooks/useNotifications';
import { SubTabProvider, useSubTabs } from '../hooks/useSubTabContext';

import type { MainTabParamList, MainStackParamList } from './types';
import { layout, spacing, borderRadius } from '../theme';
import { useTheme } from '../hooks/useTheme';
import { colors } from '../theme/colors';

const Tab = createMaterialTopTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<MainStackParamList>();

// ── Tab icon mapping ────────────────────────────────────────────────

type TabName = keyof MainTabParamList;

const TAB_ICONS_IONICONS: Record<TabName, keyof typeof Ionicons.glyphMap> = {
  Plan: 'calendar-outline',
  Chat: 'chatbubble-outline',
  Dashboard: 'grid-outline',
};

/** Circle Grammar icon names for the tab bar (resolves via ARC_ICON_MAP) */
const TAB_ICONS: Record<TabName, string> = {
  Plan: 'timeline',
  Chat: 'tomo',
  Dashboard: 'trend',
};

const TAB_LABELS: Record<TabName, string> = {
  Plan: 'Timeline',
  Chat: 'Chat',
  Dashboard: 'Dashboard',
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const tomoLogo = require('../../assets/tomo-logo.png');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tomoOWaves = require('../../assets/tomo-o-waves.png');

// ── Animated tab icon ───────────────────────────────────────────────

function AnimatedTabIcon({
  focused,
  color,
  iconName,
}: {
  focused: boolean;
  color: string;
  iconName: string;
}) {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withSpring(focused ? 1.12 : 1, {
      damping: 15,
      stiffness: 150,
    });
  }, [focused]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <TomoIcon
        name={iconName}
        size={layout.navIconSize}
        color={color}
        weight={focused ? 'fill' : 'regular'}
      />
    </Animated.View>
  );
}

// ── Center Chat Tab Button (RAISED, GRADIENT, TOMO LOGO) ────────────

// -- Tomo 友 Logo: Two overlapping circles (companion symbol) --
function TomoCompanionIcon({ size = 28, color = colors.textPrimary }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28">
      {/* Left circle */}
      <SvgCircle cx={10} cy={14} r={7} stroke={color} strokeWidth={1.8} fill="none" />
      {/* Right circle (overlapping) */}
      <SvgCircle cx={18} cy={14} r={7} stroke={color} strokeWidth={1.8} fill="none" />
    </Svg>
  );
}

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
      <View style={[
        styles.centerButton,
        { backgroundColor: colors.accent },
      ]}>
        {/* Base gradient: sage green → darker sage */}
        <LinearGradient
          colors={[colors.accentLight, colors.accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFillObject, { borderRadius: 15 }]}
        />
        {/* Glass shine overlay */}
        <LinearGradient
          colors={['rgba(255,255,255,0.30)', 'rgba(255,255,255,0.08)', 'transparent']}
          locations={[0, 0.35, 0.65]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[StyleSheet.absoluteFillObject, { borderRadius: 15 }]}
        />
        {/* Inner border highlight */}
        <View style={{
          ...StyleSheet.absoluteFillObject,
          borderRadius: 15,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.15)',
        }} />
        <TomoCompanionIcon size={30} color={colors.textPrimary} />
      </View>
      <Text style={[styles.tabLabel, { color: focused ? colors.accent : colors.textSecondary, marginTop: 4 }]}>
        Chat
      </Text>
    </Pressable>
  );
}

// ── Custom Bottom Tab Bar (for Material Top Tabs) ─────────────────

function CustomBottomTabBar({ state, navigation }: MaterialTopTabBarProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.tabBar, { backgroundColor: colors.navBackground, borderTopColor: colors.border }]}>
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const tabName = route.name as TabName;

        const onPress = () => {
          if (!isFocused) {
            navigation.navigate(route.name);
          }
          if (Platform.OS !== 'web') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
        };

        if (tabName === 'Chat') {
          return (
            <CenterChatButton
              key={tabName}
              onPress={onPress}
              focused={isFocused}
            />
          );
        }

        return (
          <Pressable key={tabName} onPress={onPress} style={styles.tabBarItem}>
            <AnimatedTabIcon
              focused={isFocused}
              color={isFocused ? colors.electricGreen : colors.textSecondary}
              iconName={TAB_ICONS[tabName]}
            />
            <Text style={[styles.tabLabel, { color: isFocused ? colors.electricGreen : colors.textSecondary }]}>
              {TAB_LABELS[tabName]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Tab Navigator ───────────────────────────────────────────────────

const TAB_ORDER = ['Plan', 'Chat', 'Dashboard'] as const;

function TabNavigator() {
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState<string>('Chat');

  useEffect(() => {
    if (activeTab) {
      AsyncStorage.setItem('tomo_active_tab', activeTab);
    }
  }, [activeTab]);

  return (
    <Tab.Navigator
      initialRouteName="Chat"
      tabBarPosition="bottom"
      tabBar={(props) => <CustomBottomTabBar {...props} />}
      screenListeners={{
        state: (e) => {
          const state = (e as any).data?.state;
          if (state) {
            setActiveTab(state.routes[state.index].name);
          }
        },
      }}
      screenOptions={{
        swipeEnabled: true,
        animationEnabled: true,
        lazy: true,
        lazyPreloadDistance: 1,
      }}
    >
      <Tab.Screen name="Plan" component={TrainingScreen} />
      <Tab.Screen name="Chat" component={HomeScreen} />
      <Tab.Screen name="Dashboard" component={SignalDashboardScreen} />
    </Tab.Navigator>
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
        name="ChangePassword"
        component={ChangePasswordScreen}
        options={{ headerShown: false }}
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
        options={{ headerShown: false }}
      />
      {/* Multi-role screens */}
      <Stack.Screen
        name="Notifications"
        component={NotificationCenterScreen}
        options={{ headerShown: false }}
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
      <Stack.Screen
        name="StudyPlanView"
        component={StudyPlanView}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="TrainingPlanView"
        component={TrainingPlanView}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="BulkEditEvents"
        component={BulkEditEventsScreen}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopWidth: 0.5,
    height: layout.navHeight,
    paddingTop: 6,
    elevation: 0,
    shadowOpacity: 0,
  },
  tabBarItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  tabLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    letterSpacing: 0.3,
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
    borderRadius: 15,
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
