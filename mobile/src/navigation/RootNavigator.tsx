/**
 * Root Navigator
 * Switches between Auth → Onboarding → Main based on state
 *
 * Flow:
 *   1. Not authenticated → AuthNavigator (Login/Signup)
 *   2. Authenticated but !onboardingComplete → OnboardingScreen
 *   3. Authenticated + onboardingComplete → MainNavigator
 *
 * All transitions use fade for smooth state changes.
 */

import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthNavigator } from './AuthNavigator';
import { MainNavigator } from './MainNavigator';
import { OnboardingScreen } from '../screens/OnboardingScreen';
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
  const { isAuthenticated, isLoading, needsRegistration, profile } = useAuth();

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
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        ) : (
          <Stack.Screen name="Main" component={MainNavigator} />
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
