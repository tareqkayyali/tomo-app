/**
 * API Configuration (updated for Supabase/Vercel backend)
 * Environment-based URL detection for dev/prod
 */

import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Production API URL — update after deploying backend to Vercel
 */
const PRODUCTION_API_URL =
  Constants.expoConfig?.extra?.apiUrl || "https://api.my-tomo.com";

/**
 * Get the API base URL based on environment:
 * - Production: deployed Vercel URL
 * - Dev (Android emulator): 10.0.2.2 (host loopback alias)
 * - Dev (iOS simulator): localhost
 * - Dev (physical device via Expo): extract host IP from Expo manifest
 */
function resolveApiBaseUrl(): string {
  // Allow forcing production API via env var (useful for testing prod from Expo Go)
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // Always use production API unless a local backend is explicitly running
  // For local dev: set EXPO_PUBLIC_API_URL=http://localhost:3000 in .env
  if (!__DEV__) {
    return PRODUCTION_API_URL;
  }

  // In dev on web (browser), try local backend
  if (Platform.OS === 'web') {
    const debuggerHost =
      Constants.expoConfig?.hostUri ??
      Constants.manifest2?.extra?.expoGo?.debuggerHost;

    if (debuggerHost) {
      const host = debuggerHost.split(":")[0];
      return `http://${host}:3000`;
    }
    return "http://localhost:3000";
  }

  // On mobile (Expo Go / dev client), always use production API
  // Local backend isn't reachable from physical devices without extra setup
  return PRODUCTION_API_URL;
}

export const API_BASE_URL = resolveApiBaseUrl();
export const REQUEST_TIMEOUT = 15000;
export const MAX_RETRIES = 2;
export const INITIAL_RETRY_DELAY = 1000;

