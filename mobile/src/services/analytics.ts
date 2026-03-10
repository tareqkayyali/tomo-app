/**
 * Analytics Service — Mixpanel wrapper with COPPA gate
 * All tracking is disabled by default and only enabled for eligible users.
 * No PII (email, name) is ever sent — only uid, sport, age_bracket, archetype, region.
 */

import { Mixpanel } from 'mixpanel-react-native';

let mp: Mixpanel | null = null;
let enabled = false;

export async function initAnalytics(token: string) {
  if (!token) return;
  mp = new Mixpanel(token, false);
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
