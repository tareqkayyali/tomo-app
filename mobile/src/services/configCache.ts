/**
 * Config Cache — AsyncStorage wrapper for UI config bundle + manifest.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  STORAGE_KEY_CONFIG_MANIFEST,
  STORAGE_KEY_CONFIG_BUNDLE,
} from '../constants/storageKeys';
import type { ConfigManifest, ConfigBundle } from './configService';

export async function getCachedConfigManifest(): Promise<ConfigManifest | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_CONFIG_MANIFEST);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function setCachedConfigManifest(manifest: ConfigManifest): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_CONFIG_MANIFEST, JSON.stringify(manifest));
  } catch {
    // Silent fail
  }
}

export async function getCachedConfigBundle(): Promise<ConfigBundle | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_CONFIG_BUNDLE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function setCachedConfigBundle(bundle: ConfigBundle): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_CONFIG_BUNDLE, JSON.stringify(bundle));
  } catch {
    // Silent fail
  }
}

export async function clearConfigCache(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEY_CONFIG_MANIFEST,
      STORAGE_KEY_CONFIG_BUNDLE,
    ]);
  } catch {
    // Silent fail
  }
}
