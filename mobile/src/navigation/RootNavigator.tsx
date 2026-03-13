/**
 * Root Navigator
 * Switches between Auth → Onboarding → Role-based Main based on state
 *
 * Flow:
 *   1. Not authenticated → AuthNavigator (Login/Signup)
 *   2. Authenticated but !onboardingComplete → OnboardingScreen
 *   3. Authenticated + onboardingComplete →
 *      - role === 'player' → MainNavigator (5-tab player experience)
 *      - role === 'coach'  → CoachNavigator (3-tab coach portal)
 *      - role === 'parent' → ParentNavigator (3-tab parent portal)
 *
 * All transitions use fade for smooth state changes.
 */

import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthNavigator } from './AuthNavigator';
import { MainNavigator } from './MainNavigator';
import { CoachNavigator } from './CoachNavigator';
import { ParentNavigator } from './ParentNavigator';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { ParentOnboardingScreen } from '../screens/parent/ParentOnboardingScreen';
import { CoachOnboardingScreen } from '../screens/coach/CoachOnboardingScreen';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { trackScreen } from '../services/analytics';
import type { RootStackParamList } from './types';

function getActiveRouteName(state: any): string | undefined {
  if (!state) return undefined;
  const route = state.routes[state.index];
  if (route.state) return getActiveRouteName(route.state);
  return route.name;
}

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { colors } = useTheme();
  const { isAuthenticated, isLoading, needsRegistration, profile, role } = useAuth();

  // Show loading while checking auth state
  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent1} />
      </View>
    );
  }

  const showAuth = !isAuthenticated || needsRegistration;
  const showOnboarding = isAuthenticated && !needsRegistration && profile && !profile.onboardingComplete;

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

  return (
    <NavigationContainer
      onStateChange={(state) => {
        const name = getActiveRouteName(state);
        if (name) trackScreen(name);
      }}
    >
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'fade',
        }}
      >
        {showAuth ? (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        ) : showOnboarding ? (
          role === 'parent' ? (
            <Stack.Screen name="ParentOnboarding" component={ParentOnboardingScreen} />
          ) : role === 'coach' ? (
            <Stack.Screen name="CoachOnboarding" component={CoachOnboardingScreen} />
          ) : (
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
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
