/**
 * Tomo Mobile App
 * Calm AI Decision-Support for Young Athletes
 */

import React, { useCallback, useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import {
  useFonts,
  Poppins_300Light,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from './src/hooks/useAuth';
import { ThemeProvider, useTheme } from './src/hooks/useTheme';
import { SportProvider, type ActiveSport } from './src/hooks/useSportContext';
import { RootNavigator } from './src/navigation';
import { AnimatedSplashScreen } from './src/components';

SplashScreen.preventAutoHideAsync();

/** Reads user profile and wires SportProvider with the user's selected sports. */
function SportWrapper({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();

  const userSports = useMemo<ActiveSport[]>(() => {
    if (profile?.selectedSports?.length) {
      const valid = profile.selectedSports.filter(
        (s): s is ActiveSport => s === 'football' || s === 'padel',
      );
      if (valid.length > 0) return valid;
    }
    // Always enable both sports so the switcher is visible
    return ['football', 'padel'];
  }, [profile]);

  return <SportProvider userSports={userSports}>{children}</SportProvider>;
}

function AppContent() {
  const { isDark } = useTheme();
  return (
    <AuthProvider>
      <SportWrapper>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <RootNavigator />
      </SportWrapper>
    </AuthProvider>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Poppins_300Light,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  return (
    <View style={styles.root} onLayout={onLayoutRootView}>
      <AnimatedSplashScreen isReady={fontsLoaded}>
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
      </AnimatedSplashScreen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
  },
});
