/**
 * Supabase Client for React Native / Web
 * Uses AsyncStorage for session persistence on native, localStorage on web.
 * Reads config from EXPO_PUBLIC_* env vars (preferred) or app.json extra.
 */

import { Platform } from "react-native";
// URL polyfill only needed on native
if (Platform.OS !== "web") {
  require("react-native-url-polyfill/auto");
}

import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  Constants.expoConfig?.extra?.supabaseUrl ||
  "http://localhost:54421";

const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  Constants.expoConfig?.extra?.supabaseAnonKey ||
  "";

// On web, use default localStorage. On native, use AsyncStorage.
function getAuthStorage() {
  if (Platform.OS === "web") {
    return undefined; // Supabase uses localStorage by default on web
  }
  // Lazy require to avoid web bundling issues
  const AsyncStorage = require("@react-native-async-storage/async-storage").default;
  return AsyncStorage;
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: getAuthStorage(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === "web", // Enable URL detection on web for OAuth
  },
});
