/**
 * stripEmoji — Removes all emoji characters from a string.
 * Used to sanitize backend/CMS data that may contain emoji icons.
 * Tomo 友 Japanese aesthetic: no emoji in UI.
 */

// Comprehensive emoji regex covering all Unicode emoji ranges
const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{231A}-\u{231B}\u{2328}\u{23CF}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{25AA}-\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}\u{2614}-\u{2615}\u{2648}-\u{2653}\u{267F}\u{2693}\u{26A1}\u{26AA}-\u{26AB}\u{26BD}-\u{26BE}\u{26C4}-\u{26C5}\u{26CE}\u{26D4}\u{26EA}\u{26F2}-\u{26F3}\u{26F5}\u{26FA}\u{26FD}\u{2702}\u{2705}\u{2708}-\u{270D}\u{270F}\u{2934}-\u{2935}\u{2B05}-\u{2B07}\u{2B1B}-\u{2B1C}\u{2B50}\u{2B55}\u{3030}\u{303D}\u{3297}\u{3299}\u{E0020}-\u{E007F}]/gu;

/**
 * Remove all emoji characters from a string. Returns trimmed result.
 * Safe to call on null/undefined — returns empty string.
 */
export function stripEmoji(text: string | null | undefined): string {
  if (!text) return '';
  return text.replace(EMOJI_REGEX, '').trim();
}

/**
 * Check if a string contains any emoji characters.
 */
export function hasEmoji(text: string | null | undefined): boolean {
  if (!text) return false;
  return EMOJI_REGEX.test(text);
}
