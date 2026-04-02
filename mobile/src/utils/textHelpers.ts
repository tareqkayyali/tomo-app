/**
 * Text Helpers — Pure string formatting utilities.
 * No React dependencies, fully testable.
 */

/**
 * Convert a snake_case or kebab-case string to Title Case.
 * 'dribble_moves' → 'Dribble Moves'
 * 'free_kicks'    → 'Free Kicks'
 * 'long-passing'  → 'Long Passing'
 */
export function formatSkillName(name: string): string {
  return name
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
