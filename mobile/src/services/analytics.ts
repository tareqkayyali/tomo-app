/**
 * Analytics Service — Mixpanel wrapper with COPPA gate
 * All tracking is disabled by default and only enabled for eligible users.
 * No PII (email, name) is ever sent — only uid, sport, age_bracket, archetype, region.
 *
 * useNative: false + AsyncStorage: JS mode — works in Expo Go (no Mixpanel native binary).
 * Production EAS builds can use native mode later if desired; JS mode is fine for product analytics.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Mixpanel } from 'mixpanel-react-native';

const mixpanelStorage = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(key),
};

let mp: Mixpanel | null = null;
let enabled = false;

export async function initAnalytics(token: string) {
  if (!token) return;
  mp = new Mixpanel(token, false, false, mixpanelStorage);
  await mp.init();
}

export function setAnalyticsEnabled(isEnabled: boolean) {
  enabled = isEnabled;
  if (!mp) return;
  if (!isEnabled) mp.optOutTracking();
  else mp.optInTracking();
}

export function identify(userId: string, traits: Record<string, unknown>) {
  if (!enabled || !mp) return;
  mp.identify(userId);
  for (const [key, value] of Object.entries(traits)) {
    mp.getPeople().set(key, String(value ?? ''));
  }
}

export function track(event: string, properties?: Record<string, unknown>) {
  if (!enabled || !mp) return;
  mp.track(event, properties);
}

export function trackScreen(screenName: string) {
  if (!enabled || !mp) return;
  mp.track('screen_view', { screen_name: screenName });
}

export function resetAnalytics() {
  if (mp) mp.reset();
  enabled = false;
}
