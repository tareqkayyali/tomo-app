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

  // Allow forcing API URL via env var (useful for local testing).
  // Guardrail: in a *production* native build we ignore any LAN-local URL
  // left in mobile/.env by accident (localhost / 10.x / 192.168.x / 172.16–31.x).
  // Expo Go / __DEV__=false on a released TestFlight build should NEVER point
  // at a laptop IP that may not even be reachable from the phone.
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) {
    const isLanLocal =
      /^https?:\/\/(localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(
        envUrl
      );
    if (isLanLocal && !__DEV__) {
      return PRODUCTION_API_URL;
    }
    return envUrl;
  }

  return PRODUCTION_API_URL;
}

export const API_BASE_URL = resolveApiBaseUrl();
export const REQUEST_TIMEOUT = 15000;
export const MAX_RETRIES = 2;
export const INITIAL_RETRY_DELAY = 1000;

