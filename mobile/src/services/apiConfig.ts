/**
 * API Configuration (updated for Supabase/Vercel backend)
 * Environment-based URL detection for dev/prod
 */

import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Production API URL — Railway deployment
 */
const PRODUCTION_API_URL =
  Constants.expoConfig?.extra?.apiUrl || "https://app.my-tomo.com";

/**
 * Get the API base URL based on environment:
 * - Production: deployed Vercel URL
 * - Dev (Android emulator): 10.0.2.2 (host loopback alias)
 * - Dev (iOS simulator): localhost
 * - Dev (physical device via Expo): extract host IP from Expo manifest
 */
function resolveApiBaseUrl(): string {
  // On web: use the current origin so API calls go to the same host automatically.
  // This handles both production (app.my-tomo.com) and local dev (localhost:3000).
  // This MUST run before the env var check since env vars are baked at build time.
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const origin = window.location.origin;
    if (origin) {
      return origin;
    }
  }

  // Allow forcing API URL via env var (useful for local testing)
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  return PRODUCTION_API_URL;
}

export const API_BASE_URL = resolveApiBaseUrl();
export const REQUEST_TIMEOUT = 15000;
export const MAX_RETRIES = 2;
export const INITIAL_RETRY_DELAY = 1000;

