/**
 * Content Cache — AsyncStorage wrapper for content bundle + manifest.
 * Parse-safe with try/catch — returns null on corruption.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  STORAGE_KEY_CONTENT_MANIFEST,
  STORAGE_KEY_CONTENT_BUNDLE,
} from '../constants/storageKeys';
import type { ContentBundle, ContentManifest } from './contentService';

export async function getCachedManifest(): Promise<ContentManifest | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_CONTENT_MANIFEST);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function setCachedManifest(manifest: ContentManifest): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_CONTENT_MANIFEST, JSON.stringify(manifest));
  } catch {
    // Silent fail — cache is best-effort
  }
}

export async function getCachedBundle(): Promise<ContentBundle | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_CONTENT_BUNDLE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function setCachedBundle(bundle: ContentBundle): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_CONTENT_BUNDLE, JSON.stringify(bundle));
  } catch {
    // Silent fail
  }
}

export async function clearContentCache(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEY_CONTENT_MANIFEST,
      STORAGE_KEY_CONTENT_BUNDLE,
    ]);
  } catch {
    // Silent fail
  }
}
