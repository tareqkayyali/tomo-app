/**
 * Saved Chats Service
 * Manages multiple chat conversations locally via AsyncStorage.
 * Each chat has an ID, title, messages, and timestamp.
 *
 * SECURITY: All storage keys are scoped to the current user ID
 * to prevent cross-user data leakage on shared devices.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEY_SAVED_CHATS, STORAGE_KEY_ACTIVE_CHAT } from '../constants/storageKeys';

// ─── User-scoped key management ─────────────────────────────────────
let _currentUserId: string | null = null;

/** Must be called after login with the authenticated user's ID */
export function setSavedChatsUserId(userId: string | null): void {
  _currentUserId = userId;
}

function getUserScopedKey(baseKey: string): string {
  if (!_currentUserId) {
    // Fallback to base key — but getSavedChats will return [] if no user
    return baseKey;
  }
  return `${baseKey}_${_currentUserId}`;
}

/** Clear all chat data for the current user from AsyncStorage (call on logout) */
export async function clearSavedChatsStorage(): Promise<void> {
  if (_currentUserId) {
    await AsyncStorage.multiRemove([
      getUserScopedKey(STORAGE_KEY_SAVED_CHATS),
      getUserScopedKey(STORAGE_KEY_ACTIVE_CHAT),
    ]);
  }
  // Also clear legacy unscoped keys (one-time migration cleanup)
  await AsyncStorage.multiRemove([
    STORAGE_KEY_SAVED_CHATS,
    STORAGE_KEY_ACTIVE_CHAT,
  ]);
  _currentUserId = null;
}

export interface SavedChat {
  id: string;
  title: string;
  messages: SavedMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface SavedMessage {
  id: string;
  role: 'user' | 'ai';
  text: string;
  timestamp: string;
  /** Structured visual response data (cards, chips) — preserved for re-rendering */
  structured?: any | null;
  /** Pending confirmation action data — preserved for confirm buttons */
  confirmAction?: any | null;
}

function generateId(): string {
  return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function deriveTitle(messages: SavedMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return 'New Chat';
  const text = firstUser.text.trim();
  if (text.length <= 40) return text;
  return text.slice(0, 37) + '...';
}

// ─── Read all saved chats ────────────────────────────────────────────

export async function getSavedChats(): Promise<SavedChat[]> {
  if (!_currentUserId) return []; // No user = no chats (security guard)
  try {
    const key = getUserScopedKey(STORAGE_KEY_SAVED_CHATS);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    const chats: SavedChat[] = JSON.parse(raw);
    // Sort newest first
    return chats.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  } catch {
    return [];
  }
}

// ─── Save / update a chat ────────────────────────────────────────────

export async function saveChat(chat: SavedChat): Promise<void> {
  if (!_currentUserId) return; // No user = don't save (security guard)
  try {
    const key = getUserScopedKey(STORAGE_KEY_SAVED_CHATS);
    const chats = await getSavedChats();
    const index = chats.findIndex((c) => c.id === chat.id);
    const updated: SavedChat = {
      ...chat,
      title: deriveTitle(chat.messages),
      updatedAt: new Date().toISOString(),
    };
    if (index >= 0) {
      chats[index] = updated;
    } else {
      chats.unshift(updated);
    }
    await AsyncStorage.setItem(key, JSON.stringify(chats));
  } catch {
    // Silently fail — non-critical
  }
}

// ─── Delete a chat ───────────────────────────────────────────────────

export async function deleteChat(chatId: string): Promise<void> {
  if (!_currentUserId) return;
  try {
    const key = getUserScopedKey(STORAGE_KEY_SAVED_CHATS);
    const chats = await getSavedChats();
    const filtered = chats.filter((c) => c.id !== chatId);
    await AsyncStorage.setItem(key, JSON.stringify(filtered));
  } catch {
    // Silently fail
  }
}

// ─── Create a new empty chat ─────────────────────────────────────────

export function createNewChat(): SavedChat {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    title: 'New Chat',
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Active chat ID (which chat is currently open) ───────────────────

export async function getActiveChatId(): Promise<string | null> {
  if (!_currentUserId) return null;
  try {
    const key = getUserScopedKey(STORAGE_KEY_ACTIVE_CHAT);
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setActiveChatId(id: string): Promise<void> {
  if (!_currentUserId) return;
  try {
    const key = getUserScopedKey(STORAGE_KEY_ACTIVE_CHAT);
    await AsyncStorage.setItem(key, id);
  } catch {
    // Silently fail
  }
}
