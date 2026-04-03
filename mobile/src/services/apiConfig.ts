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

  // On web: if frontend is served from the same origin as the backend (e.g., Replit),
  // use the current origin so API calls go to the same host automatically.
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const origin = window.location.origin;
    // Only use same-origin for non-localhost production deployments
    // (localhost still uses EXPO_PUBLIC_API_URL or PRODUCTION_API_URL)
    if (origin && !origin.includes("localhost")) {
      return origin;
    }
  }

  // Always use production API in all environments (web + mobile, dev + prod).
  // For local backend testing: set EXPO_PUBLIC_API_URL=http://localhost:3000
  return PRODUCTION_API_URL;
}

export const API_BASE_URL = resolveApiBaseUrl();
export const REQUEST_TIMEOUT = 15000;
export const MAX_RETRIES = 2;
export const INITIAL_RETRY_DELAY = 1000;

