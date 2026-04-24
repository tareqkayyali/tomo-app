/**
 * Tomo Mobile App
 * Calm AI Decision-Support for Young Athletes
 */

import React, { useCallback, useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, Platform } from 'react-native';
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
import { OutputProvider } from './src/hooks/useOutputContext';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { RootNavigator } from './src/navigation';
import { AnimatedSplashScreen, ErrorBoundary, AppLoadingScreen } from './src/components';
import { AppAtmosphere } from './src/components/tomo-ui';
import { injectWebFonts } from './src/utils/webFonts';
import { injectWebBackground } from './src/utils/webBackground';
import { initSentry, wrapWithSentry } from './src/services/sentry';

// Flash-protection fill for the outer RN roots: paints ink underneath
// AppAtmosphere on native (before NativeStarfield mounts) so there's no
// window-black flash during transitions. On web the body CSS owns this.
const OUTER_BG = Platform.OS === 'web' ? 'transparent' : '#12141F';

initSentry();

SplashScreen.preventAutoHideAsync();

// Inject @font-face CSS for web before any component renders.
// This ensures Poppins loads from Google Fonts CDN as a reliable fallback
// in case expo-font's dynamic loading doesn't work in the static export.
injectWebFonts();

// Inject the starfield + dust-band dark-surface background on web.
// No-op on native. Screen roots read `screenBg` (transparent on web) so
// this shows through every page.
injectWebBackground();

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
          <OutputProvider>
            <SportWrapper>
              <StatusBar style="light" />
              <AppAtmosphere intensity="none">
                <RootNavigator />
              </AppAtmosphere>
            </SportWrapper>
          </OutputProvider>
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
    return <AppLoadingScreen />;  // shared component — same screen shown during auth
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: OUTER_BG }}>
      <ErrorBoundary>
        <View style={[styles.root, { backgroundColor: OUTER_BG }]} onLayout={onLayoutRootView}>
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


const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#12141F',
  },
});
