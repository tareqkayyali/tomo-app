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
 * Storage adapter for Supabase auth session.
 * Web: localStorage with in-memory fallback for Incognito/private browsing.
 * Native: AsyncStorage (no size limits — SecureStore has 2KB limit, too small).
 *
 * In-memory fallback: When localStorage is unavailable (Chrome Incognito on iOS,
 * Safari Private Browsing, storage quota exceeded), the session is kept in memory.
 * This means the session won't survive page refreshes, but the app works within
 * a single browser session — much better than a blank screen.
 */

// In-memory fallback store for when localStorage is blocked
const memoryStore = new Map<string, string>();
let usingMemoryFallback = false;

// Detect localStorage availability once at startup (web only)
function isLocalStorageAvailable(): boolean {
  if (Platform.OS !== "web") return false;
  try {
    const testKey = "__tomo_storage_test__";
    localStorage.setItem(testKey, "1");
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

const localStorageWorks = Platform.OS === "web" ? isLocalStorageAvailable() : false;
if (Platform.OS === "web" && !localStorageWorks) {
  usingMemoryFallback = true;
  console.warn("[Tomo] localStorage unavailable (Incognito/Private mode) — using in-memory session storage. Session won't persist across page refreshes.");
}

const AsyncStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      if (Platform.OS === "web") {
        if (usingMemoryFallback) return memoryStore.get(key) ?? null;
        return localStorage.getItem(key);
      }
      const AsyncStorage =
        require("@react-native-async-storage/async-storage").default;
      return AsyncStorage.getItem(key);
    } catch {
      // Fallback to memory if localStorage throws unexpectedly
      return memoryStore.get(key) ?? null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      if (Platform.OS === "web") {
        if (usingMemoryFallback) {
          memoryStore.set(key, value);
          return;
        }
        localStorage.setItem(key, value);
        return;
      }
      const AsyncStorage =
        require("@react-native-async-storage/async-storage").default;
      await AsyncStorage.setItem(key, value);
    } catch {
      // Fallback to memory store so session survives within the tab
      memoryStore.set(key, value);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      if (Platform.OS === "web") {
        if (usingMemoryFallback) {
          memoryStore.delete(key);
          return;
        }
        localStorage.removeItem(key);
        return;
      }
      const AsyncStorage =
        require("@react-native-async-storage/async-storage").default;
      await AsyncStorage.removeItem(key);
    } catch {
      memoryStore.delete(key);
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
