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
export const STORAGE_KEY_FAVORITES = '@tomo_favorites';

// ── Content Cache ──
export const STORAGE_KEY_CONTENT_MANIFEST = '@tomo_content_manifest';
export const STORAGE_KEY_CONTENT_BUNDLE = '@tomo_content_bundle';

// ── Config Cache ──
export const STORAGE_KEY_CONFIG_MANIFEST = '@tomo_config_manifest';
export const STORAGE_KEY_CONFIG_BUNDLE = '@tomo_config_bundle';

// ── Saved Study Plans ──
export const STORAGE_KEY_SAVED_STUDY_PLANS = '@tomo_saved_study_plans';

// ── Football Tests ──
export const STORAGE_KEY_FOOTBALL_TEST_PREFIX = '@tomo_football_test_';
export function getFootballTestPBKey(testId: string): string {
  return `${STORAGE_KEY_FOOTBALL_TEST_PREFIX}${testId}_best`;
}
