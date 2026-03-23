/**
 * Supabase Client for React Native / Web
 * Uses SecureStore for session persistence on native (encrypted),
 * localStorage on web.
 * Reads config from EXPO_PUBLIC_* env vars (preferred) or app.json extra.
 */

import { Platform } from "react-native";
// URL polyfill only needed on native
if (Platform.OS !== "web") {
  require("react-native-url-polyfill/auto");
}

import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  Constants.expoConfig?.extra?.supabaseUrl ||
  "http://localhost:54421";

const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  Constants.expoConfig?.extra?.supabaseAnonKey ||
  "";

/**
 * Secure storage adapter for Supabase auth.
 * Native: expo-secure-store (encrypted keychain/keystore).
 * Web: default localStorage (Supabase handles this when storage is undefined).
 */
/**
 * Storage adapter for Supabase auth session.
 * Uses AsyncStorage on all platforms (no size limits).
 * SecureStore has a 2KB limit on iOS which is too small for Supabase
 * session objects (JWT + refresh token + user metadata = 3-5KB).
 */
const AsyncStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      if (Platform.OS === "web") {
        return localStorage.getItem(key);
      }
      const AsyncStorage =
        require("@react-native-async-storage/async-storage").default;
      return AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      if (Platform.OS === "web") {
        localStorage.setItem(key, value);
        return;
      }
      const AsyncStorage =
        require("@react-native-async-storage/async-storage").default;
      await AsyncStorage.setItem(key, value);
    } catch {
      // Silent fail — session won't persist but app still works
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      if (Platform.OS === "web") {
        localStorage.removeItem(key);
        return;
      }
      const AsyncStorage =
        require("@react-native-async-storage/async-storage").default;
      await AsyncStorage.removeItem(key);
    } catch {
      // Silent fail
    }
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === "web", // Enable URL detection on web for OAuth
  },
});
