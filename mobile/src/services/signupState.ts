/**
 * Signup State Service
 *
 * Holds the in-progress signup data (DOB + legal versions accepted +
 * region hint) between AgeGate and SignupScreen. On web, OAuth does
 * a full page redirect, so we persist to AsyncStorage with a short
 * TTL — 15 minutes is more than enough for the round-trip and stale
 * state past that is safely discarded.
 *
 * Cleared after a successful register() call.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@tomo_signup_state_v1';
const TTL_MS = 15 * 60 * 1000; // 15 minutes

export type SignupState = {
  dateOfBirth: string; // YYYY-MM-DD
  tosVersion: string;
  privacyVersion: string;
  regionCode: string | null;
  acceptedAt: number; // epoch ms — used for TTL check
};

export async function saveSignupState(s: Omit<SignupState, 'acceptedAt'>): Promise<void> {
  const payload: SignupState = { ...s, acceptedAt: Date.now() };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export async function loadSignupState(): Promise<SignupState | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SignupState;
    if (!parsed || typeof parsed !== 'object') return null;
    if (Date.now() - parsed.acceptedAt > TTL_MS) {
      await AsyncStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function clearSignupState(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
