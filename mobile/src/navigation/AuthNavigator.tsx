/**
 * Auth Navigator
 * Stack navigator for login/signup flow
 *
 * Transitions:
 *   Login → Signup: slide from right (default)
 *   Login → ForgotPassword: slide from bottom (modal feel)
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LoginScreen, SignupScreen, AgeGateScreen, ForgotPasswordScreen } from '../screens';
import { useAuth } from '../hooks/useAuth';
import type { AuthStackParamList } from './types';
import { colors } from '../theme';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator() {
  const { needsRegistration } = useAuth();

  // If the user just completed OAuth but has no backend profile,
  // start directly on Signup — SignupScreen verifies the age-gate
  // handoff and bounces back to AgeGate if it's missing.
  const initialRoute: keyof AuthStackParamList = needsRegistration ? 'Signup' : 'Login';

  return (
    <Stack.Navigator
      initialRouteName={initialRoute}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="AgeGate" component={AgeGateScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
      <Stack.Screen
        name="ForgotPassword"
        component={ForgotPasswordScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  );
}
