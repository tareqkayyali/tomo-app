/**
 * Centralized AsyncStorage key constants.
 * All keys should be prefixed with @tomo_ to avoid collisions.
 */

// ── Chat ──
export const STORAGE_KEY_SAVED_CHATS = '@tomo_saved_chats';
export const STORAGE_KEY_ACTIVE_CHAT = '@tomo_active_chat_id';

// ── Planning ──
export const STORAGE_KEY_PLANNING_STREAK = '@tomo_planning_streak';
export const STORAGE_KEY_MORNING_SWIPE_PREFIX = '@tomo_morning_swipe_';

// ── Preferences ──
export const STORAGE_KEY_THEME_MODE = '@tomo_theme_mode';
export const STORAGE_KEY_ACTIVE_SPORT = '@tomo_active_sport';

// ── Football Tests ──
export const STORAGE_KEY_FOOTBALL_TEST_PREFIX = '@tomo_football_test_';
export function getFootballTestPBKey(testId: string): string {
  return `${STORAGE_KEY_FOOTBALL_TEST_PREFIX}${testId}_best`;
}
