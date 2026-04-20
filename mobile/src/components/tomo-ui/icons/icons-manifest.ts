/**
 * tomo — typed list of all icon names (v1.1 extension set).
 * Generated from assets/icons/. Each name is a "base" — you pass it to <TomoIcon/>
 * along with an optional `filled` prop. Single-variant icons (see SINGLE_VARIANT)
 * ignore the `filled` prop.
 */

export const TOMO_ICONS = [
  // ── Bond 29 (original set) ───────────────────────────────────────────
  // Tab bar
  'Today', 'Chat', 'Sessions', 'Profile',
  // Actions
  'Send', 'Mic', 'Play', 'Pause', 'Add',
  // Metrics
  'Heart', 'HRV', 'Sleep', 'Load', 'Recovery', 'Readiness',
  // Calendar
  'Day', 'Week', 'Event', 'Match',
  // System
  'Bell', 'Search', 'Settings', 'Close', 'Back',
  'Chevron-right', 'Chevron-left', 'Chevron-up', 'Chevron-down',
  // Sport
  'Ball', 'Pitch', 'Goal', 'Boot',

  // ── Arc ports (v1.1) ─────────────────────────────────────────────────
  // Navigation
  'Home', 'Train', 'Timeline',
  // Training (Arc)
  'Strength', 'Speed', 'Endurance', 'Flexibility',
  // Academic
  'Study', 'Exam', 'Assignment', 'Balance', 'Schedule',
  // Actions (Arc)
  'Share', 'Edit',
  // States
  'Verified', 'Warning', 'PhvLocked', 'Live', 'Error',
  // Metrics (Arc)
  'Acwr', 'Trend',
  // Check-in
  'CheckIn', 'CheckInDone',

  // ── New (v1.1) ───────────────────────────────────────────────────────
  // Status & feedback
  'Info', 'Help', 'Check', 'Star', 'Trophy', 'Medal', 'Flame', 'Sparkle',
  // Time & cycle
  'Timer', 'Clock', 'Alarm', 'Sun', 'Refresh',
  // Training types (extended)
  'Power', 'Agility', 'Mental', 'Skills', 'Tactics',
  // Readiness & wellness
  'Pulse', 'Hydration', 'Nutrition', 'Mood', 'Soreness', 'Bandage',
  // Content & media
  'Camera', 'Video', 'Document', 'Book', 'Clipboard', 'Flask',
  // Navigation
  'Menu', 'More', 'Arrow-up', 'Location',
  // System & utility
  'Lock', 'Key', 'Eye', 'Copy', 'Download', 'Upload', 'Link', 'Trash', 'Save', 'Logout',
  // Communication
  'Mail', 'Megaphone', 'Stop',
  // Device & connectivity
  'Watch', 'Wifi', 'Cloud', 'Shield',
  // Brand marks
  'Logo-Apple', 'Logo-Google',
] as const;

export type TomoIconName = typeof TOMO_ICONS[number];

/**
 * Icons that ship only as a single variant (no outline/filled split).
 * These ignore the `filled` prop on <TomoIcon/>.
 */
export const SINGLE_VARIANT: ReadonlySet<TomoIconName> = new Set([
  'Close', 'Back',
  'Chevron-right', 'Chevron-left', 'Chevron-up', 'Chevron-down',
  'Refresh',
  'Menu', 'More', 'Arrow-up',
  'Copy', 'Download', 'Upload', 'Link', 'Trash', 'Logout',
  'Logo-Apple', 'Logo-Google',
]);

/** Logical groupings for settings UIs, pickers, docs. */
export const TOMO_ICON_GROUPS = {
  // Bond 29
  tab:        ['Today', 'Chat', 'Sessions', 'Profile'],
  actions:    ['Send', 'Mic', 'Play', 'Pause', 'Add'],
  metrics:    ['Heart', 'HRV', 'Sleep', 'Load', 'Recovery', 'Readiness'],
  calendar:   ['Day', 'Week', 'Event', 'Match'],
  system:     ['Bell', 'Search', 'Settings', 'Close', 'Back',
               'Chevron-right', 'Chevron-left', 'Chevron-up', 'Chevron-down'],
  sport:      ['Ball', 'Pitch', 'Goal', 'Boot'],

  // Arc ports
  navigation: ['Home', 'Train', 'Timeline'],
  training:   ['Strength', 'Speed', 'Endurance', 'Flexibility'],
  academic:   ['Study', 'Exam', 'Assignment', 'Balance', 'Schedule'],
  arcActions: ['Share', 'Edit'],
  states:     ['Verified', 'Warning', 'PhvLocked', 'Live', 'Error'],
  arcMetrics: ['Acwr', 'Trend'],
  checkin:    ['CheckIn', 'CheckInDone'],

  // New
  status:     ['Info', 'Help', 'Check', 'Star', 'Trophy', 'Medal', 'Flame', 'Sparkle'],
  time:       ['Timer', 'Clock', 'Alarm', 'Sun', 'Refresh'],
  trainingX:  ['Power', 'Agility', 'Mental', 'Skills', 'Tactics'],
  wellness:   ['Pulse', 'Hydration', 'Nutrition', 'Mood', 'Soreness', 'Bandage'],
  media:      ['Camera', 'Video', 'Document', 'Book', 'Clipboard', 'Flask'],
  nav:        ['Menu', 'More', 'Arrow-up', 'Location'],
  utility:    ['Lock', 'Key', 'Eye', 'Copy', 'Download', 'Upload', 'Link',
               'Trash', 'Save', 'Logout'],
  comms:      ['Mail', 'Megaphone', 'Stop'],
  device:     ['Watch', 'Wifi', 'Cloud', 'Shield'],
  brand:      ['Logo-Apple', 'Logo-Google'],
} as const;
