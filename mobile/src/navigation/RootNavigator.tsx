/**
 * Root Navigator
 * Switches between Auth → Onboarding → Role-based Main based on state
 *
 * Flow:
 *   1. Not authenticated → AuthNavigator (Login/Signup)
 *   2. Authenticated but !onboardingComplete → OnboardingScreen
 *   3. Authenticated + onboardingComplete →
 *      - role === 'player' → MainNavigator (3-tab player experience)
 *      - role === 'coach'  → CoachNavigator (3-tab coach portal)
 *      - role === 'parent' → ParentNavigator (3-tab parent portal)
 *
 * All transitions use fade for smooth state changes.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Loader } from '../components/Loader';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthNavigator } from './AuthNavigator';
import { MainNavigator } from './MainNavigator';
import { CoachNavigator } from './CoachNavigator';
import { ParentNavigator } from './ParentNavigator';
import { OnboardingNavigator } from './OnboardingNavigator';
import { ParentOnboardingScreen } from '../screens/parent/ParentOnboardingScreen';
import { CoachOnboardingScreen } from '../screens/coach/CoachOnboardingScreen';
import { AwaitingConsentScreen } from '../screens/consent/AwaitingConsentScreen';
import { PreviewScreen } from '../screens/PreviewScreen';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { screenBg } from '../theme/colors';
import { useConfig } from '../hooks/useConfigProvider';
import { trackScreen } from '../services/analytics';
import type { RootStackParamList } from './types';

function getActiveRouteName(state: any): string | undefined {
  if (!state) return undefined;
  const route = state.routes[state.index];
  if (route.state) return getActiveRouteName(route.state);
  return route.name;
}

const Stack = createNativeStackNavigator<RootStackParamList>();

const linking: any = {
  prefixes: ['tomo://', 'https://app.my-tomo.com'],
  config: {
    screens: {
      Main: {
        screens: {
          MainTabs: {
            screens: {
              Plan: 'timeline',
              Chat: 'chat',
              Dashboard: 'dashboard',
            },
          },
          Checkin: 'checkin',
          AddEvent: 'add-event',
          Settings: 'settings',
          Profile: 'profile',
          PlayerCV: 'cv',
        },
      },
    },
  },
};

export function RootNavigator() {
  const { colors } = useTheme();
  const { isAuthenticated, isLoading, needsRegistration, profile, role } = useAuth();
  const { isPreviewMode } = useConfig();

  // Show loading while checking auth state (skip in preview mode)
  if (isLoading && !isPreviewMode) {
    return (
      <View style={[styles.loading, { backgroundColor: screenBg }]}>
        <Loader size="lg" />
      </View>
    );
  }

  // In CMS preview mode, skip auth gates — AuthProvider already uses DEV_USER
  // so the real app renders with mock data for theme previewing.

  const showAuth = !isPreviewMode && (!isAuthenticated || needsRegistration);
  // Phase 3: EU/UK 13-15 minors land in 'awaiting_parent' until the
  // parent taps accept on ParentLinkByCodeScreen. Gate before
  // onboarding so the child sees the "share this code" sandbox first
  // and can complete onboarding afterwards.
  const showAwaitingConsent =
    !isPreviewMode &&
    isAuthenticated &&
    !needsRegistration &&
    profile &&
    profile.consentStatus === 'awaiting_parent';
  const showOnboarding =
    !isPreviewMode &&
    isAuthenticated &&
    !needsRegistration &&
    profile &&
    profile.consentStatus !== 'awaiting_parent' &&
    !profile.onboardingComplete;

  // Determine which main navigator to show based on role
  const getMainScreen = () => {
    switch (role) {
      case 'coach':
        return <Stack.Screen name="CoachMain" component={CoachNavigator} />;
      case 'parent':
        return <Stack.Screen name="ParentMain" component={ParentNavigator} />;
      default:
        return <Stack.Screen name="Main" component={MainNavigator} />;
    }
  };

  // Tomo 友 navigation theme — navy on native, transparent on web so the
  // body's starfield background shows through the stack/card surfaces.
  const tomoNavTheme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: screenBg,
      card: screenBg,
      border: colors.creamMuted,
      text: colors.textPrimary,
      primary: colors.accent,
    },
  };

  return (
    <NavigationContainer
      theme={tomoNavTheme}
      linking={linking}
      onStateChange={(state) => {
        const name = getActiveRouteName(state);
        if (name) trackScreen(name);
      }}
    >
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          contentStyle: { backgroundColor: screenBg },
        }}
      >
        {showAuth ? (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        ) : showAwaitingConsent ? (
          <Stack.Screen name="AwaitingConsent" component={AwaitingConsentScreen} />
        ) : showOnboarding ? (
          role === 'parent' ? (
            <Stack.Screen name="ParentOnboarding" component={ParentOnboardingScreen} />
          ) : role === 'coach' ? (
            <Stack.Screen name="CoachOnboarding" component={CoachOnboardingScreen} />
          ) : (
            // Phase 2: 4-screen player onboarding (Sport → Position → HeightWeight → Goal)
            // replaces the legacy single OnboardingScreen.
            <Stack.Screen name="Onboarding" component={OnboardingNavigator} />
          )
        ) : (
          getMainScreen()
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
