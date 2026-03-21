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
const secureStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === "web") {
      // Lazy require to avoid web bundling issues
      const AsyncStorage =
        require("@react-native-async-storage/async-storage").default;
      return AsyncStorage.getItem(key);
    }
    return SecureStore.getItemAsync(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === "web") {
      const AsyncStorage =
        require("@react-native-async-storage/async-storage").default;
      await AsyncStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === "web") {
      const AsyncStorage =
        require("@react-native-async-storage/async-storage").default;
      await AsyncStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === "web", // Enable URL detection on web for OAuth
  },
});
