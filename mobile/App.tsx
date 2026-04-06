/**
 * Tomo Mobile App
 * Calm AI Decision-Support for Young Athletes
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet, Platform, Text } from 'react-native';
import { useFonts } from 'expo-font';
import {
  Poppins_300Light,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { Ionicons } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from './src/hooks/useAuth';
import { ThemeProvider } from './src/hooks/useTheme';
import { SportProvider, type ActiveSport } from './src/hooks/useSportContext';
import { ContentProvider } from './src/hooks/useContentProvider';
import { ConfigProvider } from './src/hooks/useConfigProvider';
import { BootProvider } from './src/hooks/useBootData';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { RootNavigator } from './src/navigation';
import { AnimatedSplashScreen, ErrorBoundary } from './src/components';
import { AppAtmosphere } from './src/components/tomo-ui';
import { injectWebFonts } from './src/utils/webFonts';
import { initSentry, wrapWithSentry } from './src/services/sentry';

initSentry();

SplashScreen.preventAutoHideAsync();

// Inject @font-face CSS for web before any component renders.
// This ensures Poppins loads from Google Fonts CDN as a reliable fallback
// in case expo-font's dynamic loading doesn't work in the static export.
injectWebFonts();

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
  return (
    <ContentProvider>
      <AuthProvider>
        <BootProvider>
          <SportWrapper>
            <StatusBar style="light" />
            <AppAtmosphere intensity="none">
              <RootNavigator />
            </AppAtmosphere>
          </SportWrapper>
        </BootProvider>
      </AuthProvider>
    </ContentProvider>
  );
}

function App() {
  // On web, fonts are loaded via CSS @font-face injection (injectWebFonts above).
  // useFonts() hangs on web static exports because expo-font's dynamic loading
  // can't resolve bundled node_modules paths. So we skip it entirely on web.
  const isWeb = Platform.OS === 'web';

  const [nativeFontsLoaded] = useFonts(
    isWeb
      ? {} // No-op on web — CSS handles all fonts
      : {
          ...Ionicons.font,
          Poppins_300Light,
          Poppins_400Regular,
          Poppins_500Medium,
          Poppins_600SemiBold,
          Poppins_700Bold,
        },
  );

  const fontsLoaded = isWeb || nativeFontsLoaded;

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return <AppLoadingScreen />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#12141F' }}>
      <ErrorBoundary>
        <View style={styles.root} onLayout={onLayoutRootView}>
          <AnimatedSplashScreen isReady={fontsLoaded}>
            <ConfigProvider>
              <ThemeProvider>
                <AppContent />
              </ThemeProvider>
            </ConfigProvider>
          </AnimatedSplashScreen>
        </View>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

export default wrapWithSentry(App);

// ── Dynamic Loading Screen (rotating messages like Own It / My Programs) ──

const APP_LOADING_MESSAGES = [
  { title: 'Loading Your Profile', subtitle: 'Setting up your athlete dashboard...', icon: 'person-outline' as const },
  { title: 'Preparing AI Coach', subtitle: 'Tomo is getting ready for you...', icon: 'sparkles-outline' as const },
  { title: 'Syncing Training Data', subtitle: 'Pulling your latest sessions...', icon: 'barbell-outline' as const },
  { title: 'Checking Readiness', subtitle: 'Sleep, energy, recovery status...', icon: 'pulse-outline' as const },
  { title: 'Loading Schedule', subtitle: 'Your calendar and upcoming events...', icon: 'calendar-outline' as const },
  { title: 'Almost There', subtitle: 'Finalizing your experience...', icon: 'rocket-outline' as const },
];

function AppLoadingScreen() {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % APP_LOADING_MESSAGES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const msg = APP_LOADING_MESSAGES[msgIndex];

  return (
    <View style={styles.loading}>
      <View style={styles.loadingIconWrap}>
        <Ionicons name={msg.icon} size={28} color="#00D9FF" />
      </View>
      <Text style={styles.loadingTitle}>{msg.title}</Text>
      <Text style={styles.loadingSubtitle}>{msg.subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#12141F',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#12141F',
    gap: 8,
  },
  loadingIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(122, 155, 118, 0.1)',
    marginBottom: 4,
  },
  loadingTitle: {
    fontFamily: Platform.OS === 'web' ? 'Poppins, sans-serif' : undefined,
    fontWeight: '600',
    fontSize: 16,
    color: '#F5F3ED',
    textAlign: 'center',
  },
  loadingSubtitle: {
    fontFamily: Platform.OS === 'web' ? 'Poppins, sans-serif' : undefined,
    fontWeight: '400',
    fontSize: 13,
    color: 'rgba(245,243,237,0.5)',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
