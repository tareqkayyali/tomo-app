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
import type { Ionicons } from '@expo/vector-icons';
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
import { VisibilityPreferencesScreen } from '../screens/settings/VisibilityPreferencesScreen';
import ChangePasswordScreen from '../screens/ChangePasswordScreen';
import DeleteAccountScreen from '../screens/settings/DeleteAccountScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { HistoricalDataScreen } from '../screens/HistoricalDataScreen';
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
import {
  CVHubScreen,
  CVIdentityScreen,
  CVPlayerProfileScreen,
  CVPhysicalProfileScreen,
  CVPlayingPositionsScreen,
  CVVerifiedPerformanceScreen,
  CVCareerHistoryScreen,
  CVVideoMediaScreen,
  CVReferencesScreen,
  CVAwardsCharacterScreen,
  CVHealthStatusScreen,
  CVNextStepsScreen,
} from '../features/cv/screens';
import { NotificationCenterScreen } from '../screens/NotificationCenterScreen';
import { LinkAccountScreen } from '../screens/LinkAccountScreen';
import { StudyPlanPreviewScreen } from '../screens/StudyPlanPreviewScreen';
import { MyRulesScreen } from '../screens/MyRulesScreen';
import { FavoritesScreen } from '../screens/FavoritesScreen';
import PHVCalculatorScreen from '../screens/PHVCalculatorScreen';
import { StudyPlanView } from '../screens/StudyPlanView';
import { TrainingPlanView } from '../screens/TrainingPlanView';
import { BulkEditEventsScreen } from '../screens/BulkEditEventsScreen';
import { WhoopDataScreen } from '../screens/WhoopDataScreen';

import { HeaderProfileButton } from '../components/HeaderProfileButton';
import { NotificationBell } from '../components/NotificationBell';
import { CheckinHeaderButton } from '../components/CheckinHeaderButton';
import { TomoIcon } from '../components/tomo-ui';
import { IconTimeline, IconTomo, IconSignal } from '../components/tomo-tab-icons';
import { fontFamily } from '../theme/typography';
import { useAuth } from '../hooks/useAuth';
import { useCheckinStatus } from '../hooks/useCheckinStatus';
import { NotificationsProvider } from '../hooks/useNotifications';
import { SubTabProvider, useSubTabs } from '../hooks/useSubTabContext';

import type { MainTabParamList, MainStackParamList } from './types';
import { layout, spacing, borderRadius } from '../theme';
import { useTheme } from '../hooks/useTheme';
import { colors, screenBg } from '../theme/colors';

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

/** Player App design labels — Timeline / Tomo / Signal. */
const TAB_LABELS: Record<TabName, string> = {
  Plan: 'Timeline',
  Chat: 'Tomo',
  Dashboard: 'Signal',
};

/**
 * Player App tab glyphs — Tomo brand icons.
 *   Plan      → Ichinichi 三 (three strokes: morning, noon, night + "now" dot)
 *   Dashboard → Ensō 円相 (zen ring with gap + pulse core)
 * Source: Files/assets/tomo-icons/ (README spec, 20×20 viewBox). Active state
 * thickens stroke (1.5 → 2) and reveals the center dot so the icon pair
 * reads as one design language: Ichinichi's dot ↔ Ensō's pulse core.
 */
function TabGlyph({ name, active }: { name: TabName; color: string; active: boolean }) {
  if (name === 'Plan') return <IconTimeline size={32} on={active} />;
  // Chat is rendered as the floating orb; Dashboard = Signal beacon.
  return <IconSignal size={32} on={active} />;
}

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

// ── Custom Bottom Tab Bar (Player App design) ─────────────────────
// Horizontal pill container, 3 equal-weight tabs, sage15 active bg,
// scale 1.03 active, Timeline/Tomo/Signal labels, custom SVG glyphs.

function CustomBottomTabBar({ state, navigation }: MaterialTopTabBarProps) {
  const { colors } = useTheme();
  const ORB_SIZE = 68;

  // Two glow layers:
  //   • `activeGlow` — continuous breathing pulse while Chat is focused.
  //   • `pressGlow`  — one-shot peak on press, layered on top.
  // Halo opacity/scale = max of the two so the press pulse always dominates
  // the breathing baseline and the transition back is smooth.
  const isChatFocused = state.routes[state.index].name === 'Chat';

  const onChatPress = () => {
    if (!isChatFocused) navigation.navigate('Chat');
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  return (
    <View style={styles.tabBarWrap} pointerEvents="box-none">
      {/* Radial-gradient backdrop so the bar floats over content edges. */}
      <LinearGradient
        colors={['rgba(18,20,31,0)', 'rgba(18,20,31,0.92)']}
        locations={[0, 0.45]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      <View style={[styles.tabBarRow, { borderTopColor: colors.cream10 }]}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const tabName = route.name as TabName;
          const tint = isFocused ? colors.tomoSageDim : colors.muted;

          // Chat slot is an inert spacer — orb floats independently above
          // the pill so its size never affects the pill's borders/height.
          if (tabName === 'Chat') {
            return <View key={tabName} style={styles.tabPillBtn} pointerEvents="none" />;
          }

          const onPress = () => {
            if (!isFocused) navigation.navigate(route.name);
            if (Platform.OS !== 'web') {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
          };

          return (
            <Pressable
              key={tabName}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityLabel={TAB_LABELS[tabName]}
              accessibilityState={{ selected: isFocused }}
              style={({ pressed }) => [
                styles.tabPillBtn,
                {
                  // No background shade — the active state is conveyed by the
                  // icon's own static sage halo (rendered inside TabGlyph).
                  backgroundColor: 'transparent',
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                },
              ]}
            >
              <TabGlyph name={tabName} color={tint} active={isFocused} />
              {/* Labels removed for all tabs — icons stand on their own at 30px.
                  accessibilityLabel above preserves screen-reader announcement. */}
            </Pressable>
          );
        })}
      </View>

      {/* ─── Floating Chat orb — independent of pill borders ─── */}
      {/*
        Active state: the sphere itself glows (brighter highlight-heavy
        gradient) with the thin orbit ring visible around it. No backdrop
        halo, no haze — the glow lives in the sphere's own colour.
        Inactive state: default shiny sage sphere, no orbit ring.
      */}
      <View style={styles.floatingOrbWrap} pointerEvents="box-none">
        <Pressable
          onPress={onChatPress}
          hitSlop={6}
          style={({ pressed }) => ({
            transform: [{ scale: pressed ? 0.95 : 1 }],
          })}
        >
          <IconTomo size={ORB_SIZE} on={isChatFocused} />
        </Pressable>
      </View>
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
      {/* Dashboard manages its own swipeEnabled via setOptions in
          SignalDashboardScreen — true on the Dashboard sub-tab so users
          can swipe back to Chat, false on Programs/Metrics/Progress so
          the inner PagerView owns sub-tab swipes. */}
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
    headerStyle: { backgroundColor: screenBg },
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
        // Swipe-back on every pushed screen by default — iOS-style full-screen
        // gesture so the hit area isn't a thin left edge. Screens that need to
        // trap the user mid-flow (e.g. SessionComplete) override with
        // `gestureEnabled: false`.
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
        contentStyle: { backgroundColor: screenBg },
      }}
    >
      <Stack.Screen
        name="MainTabs"
        component={TabNavigator}
        options={{
          // Root screen — there's no prior screen to swipe back to. The
          // stack-default `fullScreenGestureEnabled: true` would otherwise
          // claim every horizontal swipe and block both the Material Top
          // Tab pager (main-tab swipe) and the Signal sub-tab GestureDetector.
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Checkin"
        component={CheckinScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="NotificationSettings"
        component={NotificationSettingsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PrivacySettings"
        component={PrivacySettingsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="VisibilityPreferences"
        component={VisibilityPreferencesScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ChangePassword"
        component={ChangePasswordScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="DeleteAccount"
        component={DeleteAccountScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="History"
        component={HistoryScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="HistoricalData"
        component={HistoricalDataScreen}
        options={{ headerShown: true, title: 'Historical Data', ...stackHeaderOptions }}
      />
      <Stack.Screen
        name="WorkoutFeedback"
        component={WorkoutFeedbackScreen}
        options={{ headerShown: false }}
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
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="DrillDetail"
        component={DrillDetailScreen}
        options={{ headerShown: false }}
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
          headerShown: false,
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
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ShotSession"
        component={ShotSessionScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PadelRating"
        component={PadelRatingScreen}
        options={{ headerShown: false }}
      />
      {/* Football-specific screens */}
      <Stack.Screen
        name="FootballSkillDetail"
        component={FootballSkillDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="FootballRating"
        component={FootballRatingScreen}
        options={{ headerShown: false }}
      />
      {/* Player CV (hub + 11 sub-screens) */}
      <Stack.Screen name="CVHub"                 component={CVHubScreen}                 options={{ headerShown: false }} />
      <Stack.Screen name="CVIdentity"            component={CVIdentityScreen}            options={{ headerShown: false }} />
      <Stack.Screen name="CVPlayerProfile"       component={CVPlayerProfileScreen}       options={{ headerShown: false }} />
      <Stack.Screen name="CVPhysicalProfile"     component={CVPhysicalProfileScreen}     options={{ headerShown: false }} />
      <Stack.Screen name="CVPlayingPositions"    component={CVPlayingPositionsScreen}    options={{ headerShown: false }} />
      <Stack.Screen name="CVVerifiedPerformance" component={CVVerifiedPerformanceScreen} options={{ headerShown: false }} />
      <Stack.Screen name="CVCareerHistory"       component={CVCareerHistoryScreen}       options={{ headerShown: false }} />
      <Stack.Screen name="CVVideoMedia"          component={CVVideoMediaScreen}          options={{ headerShown: false }} />
      <Stack.Screen name="CVReferences"          component={CVReferencesScreen}          options={{ headerShown: false }} />
      <Stack.Screen name="CVAwardsCharacter"     component={CVAwardsCharacterScreen}     options={{ headerShown: false }} />
      <Stack.Screen name="CVHealthStatus"        component={CVHealthStatusScreen}        options={{ headerShown: false }} />
      <Stack.Screen name="CVNextSteps"           component={CVNextStepsScreen}           options={{ headerShown: false }} />
      <Stack.Screen
        name="FootballTestInput"
        component={FootballTestInputScreen}
        options={{ headerShown: false }}
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
        options={{ headerShown: false }}
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
      <Stack.Screen
        name="WhoopData"
        component={WhoopDataScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
    </NotificationsProvider>
    </SubTabProvider>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Player App design tab bar — pill row floating over a radial backdrop.
  tabBarWrap: {
    paddingHorizontal: 14,
    // Extra top padding so the floating Chat orb sits in the touch area
    // and doesn't get clipped above the bar.
    paddingTop: 60,
    paddingBottom: 28,
  },
  // Thin divider line above the tab row — replaces the old rounded-pill
  // container. Buttons stay identical; the bar just reads as part of the
  // page rather than a floating card.
  tabBarRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 4,
  },
  tabPillBtn: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  // Absolute container that centers the floating Chat orb above the pill.
  // `pointerEvents="box-none"` (set on the View) lets touches pass through
  // empty space to the pill below — only the orb itself is tappable.
  floatingOrbWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 50,
    height: 85,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Legacy styles retained for CenterChatButton (now unused by the tab
  // bar, but kept for potential re-use elsewhere).
  tabLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    letterSpacing: 0.3,
    marginTop: 2,
  },
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
});
