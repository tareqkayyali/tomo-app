/**
 * Saved Chats Service
 * Manages multiple chat conversations locally via AsyncStorage.
 * Each chat has an ID, title, messages, and timestamp.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEY_SAVED_CHATS, STORAGE_KEY_ACTIVE_CHAT } from '../constants/storageKeys';

const STORAGE_KEY = STORAGE_KEY_SAVED_CHATS;
const ACTIVE_CHAT_KEY = STORAGE_KEY_ACTIVE_CHAT;

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
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
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
  try {
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
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch {
    // Silently fail — non-critical
  }
}

// ─── Delete a chat ───────────────────────────────────────────────────

export async function deleteChat(chatId: string): Promise<void> {
  try {
    const chats = await getSavedChats();
    const filtered = chats.filter((c) => c.id !== chatId);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
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
  try {
    return await AsyncStorage.getItem(ACTIVE_CHAT_KEY);
  } catch {
    return null;
  }
}

export async function setActiveChatId(id: string): Promise<void> {
  try {
    await AsyncStorage.setItem(ACTIVE_CHAT_KEY, id);
  } catch {
    // Silently fail
  }
}
