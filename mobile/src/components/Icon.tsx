/**
 * Icon Component
 *
 * Typed wrapper around the Bond icon system. Accepts symbolic names from
 * `TOMO_ICONS` (e.g. "home", "checkin", "progress") and renders the Bond
 * glyph via TomoIcon (the hybrid resolver — Bond sprite → Arc → Phosphor).
 *
 * Historical note: this file used to bridge to Phosphor via `IONICONS_TO_PHOSPHOR`.
 * Phase 3 replaced that map with `IONICONS_TO_TOMO` — every Ionicon name
 * now resolves to a Bond semantic name which the Phase-2 TomoIcon resolver
 * renders. The old `IONICONS_TO_PHOSPHOR` export has been removed (Phase 4);
 * all consumers (GradientButton, SmartIcon) now import `IONICONS_TO_TOMO`.
 */

import React from 'react';
import type { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import TomoIcon from './tomo-ui/TomoIcon';

/**
 * Ionicons glyph name → Bond semantic name.
 * Values are lowercase semantic names the TomoIcon resolver understands
 * (see `SEMANTIC_TO_BOND` in TomoIcon.tsx). The `-outline` / non-outline
 * split is handled at call time via `weight: 'regular' | 'fill'`.
 */
const IONICONS_TO_TOMO: Record<string, string> = {
  // Navigation & chevrons
  'chevron-back': 'Chevron-left',
  'chevron-back-outline': 'Chevron-left',
  'chevron-forward': 'Chevron-right',
  'chevron-forward-outline': 'Chevron-right',
  'chevron-up': 'Chevron-up',
  'chevron-up-outline': 'Chevron-up',
  'chevron-down': 'Chevron-down',
  'chevron-down-outline': 'Chevron-down',
  'arrow-back': 'back',
  'arrow-back-outline': 'back',
  'arrow-forward': 'Chevron-right',
  'arrow-forward-outline': 'Chevron-right',
  'arrow-undo': 'refresh',
  'arrow-up': 'Arrow-up',
  'arrow-up-outline': 'Arrow-up',
  'arrow-up-circle': 'Arrow-up',
  'arrow-up-circle-outline': 'Arrow-up',
  'arrow-down-circle': 'Arrow-up',
  'return-down-back': 'back',

  // Status & feedback
  'checkmark': 'check',
  'checkmark-outline': 'check',
  'checkmark-circle': 'check',
  'checkmark-circle-outline': 'check',
  'close': 'close',
  'close-outline': 'close',
  'close-circle': 'close',
  'close-circle-outline': 'close',
  'warning': 'warning',
  'warning-outline': 'warning',
  'alert-circle': 'error',
  'alert-circle-outline': 'error',
  'information-circle': 'info',
  'information-circle-outline': 'info',
  'help': 'help',
  'help-outline': 'help',
  'help-circle': 'help',
  'help-circle-outline': 'help',

  // Actions
  'add': 'add',
  'add-outline': 'add',
  'add-circle': 'add',
  'add-circle-outline': 'add',
  'pencil': 'edit',
  'pencil-outline': 'edit',
  'create': 'edit',
  'create-outline': 'edit',
  'trash': 'trash',
  'trash-outline': 'trash',
  'send': 'send',
  'send-outline': 'send',
  'paper-plane': 'send',
  'paper-plane-outline': 'send',
  'remove': 'close',
  'move-outline': 'more',
  'reorder-three-outline': 'menu',
  'resize-outline': 'more',

  // Communication
  'mail': 'mail',
  'mail-outline': 'mail',
  'notifications': 'bell',
  'notifications-outline': 'bell',
  'notifications-off-outline': 'bell',
  'chatbubble': 'chat',
  'chatbubble-outline': 'chat',
  'chatbubbles': 'chat',
  'chatbubbles-outline': 'chat',
  'chatbubble-ellipses-outline': 'chat',
  'people-outline': 'profile',
  'person': 'profile',
  'person-outline': 'profile',
  'person-add-outline': 'profile',
  'person-remove-outline': 'profile',
  'person-circle': 'profile',
  'person-circle-outline': 'profile',
  'megaphone-outline': 'megaphone',

  // Auth
  'key-outline': 'key',
  'lock-closed': 'lock',
  'lock-closed-outline': 'lock',
  'log-in-outline': 'key',
  'log-out': 'logout',
  'log-out-outline': 'logout',
  'shield-checkmark': 'shield',
  'shield-checkmark-outline': 'shield',
  'shield': 'shield',
  'shield-outline': 'shield',

  // Time & calendar
  'today': 'today',
  'today-outline': 'today',
  'calendar': 'event',
  'calendar-outline': 'event',
  'time': 'clock',
  'time-outline': 'clock',
  'timer-outline': 'timer',
  'hourglass-outline': 'timer',
  'alarm-outline': 'alarm',
  'watch-outline': 'watch',

  // Performance
  'bar-chart': 'load',
  'bar-chart-outline': 'load',
  'analytics-outline': 'trend',
  'trending-up': 'trend',
  'trending-up-outline': 'trend',
  'stats-chart-outline': 'trend',
  'pulse': 'pulse',
  'pulse-outline': 'pulse',
  'speedometer': 'readiness',
  'speedometer-outline': 'readiness',

  // Health & fitness
  'fitness': 'fitness',
  'fitness-outline': 'fitness',
  'body': 'soreness',
  'body-outline': 'soreness',
  'heart': 'heart',
  'heart-outline': 'heart',
  'bed': 'sleep',
  'bed-outline': 'sleep',
  'water': 'hydration',
  'water-outline': 'hydration',
  'flash': 'power',
  'flash-outline': 'power',
  'medkit': 'bandage',
  'medkit-outline': 'bandage',
  'bandage-outline': 'bandage',

  // Sports
  'basketball': 'ball',
  'basketball-outline': 'ball',
  'football': 'ball',
  'football-outline': 'ball',
  'tennisball': 'ball',
  'tennisball-outline': 'ball',
  'barbell': 'fitness',
  'barbell-outline': 'fitness',
  'bicycle-outline': 'endurance',
  'medal': 'medal',
  'ribbon': 'medal',

  // Achievements
  'trophy': 'trophy',
  'trophy-outline': 'trophy',
  'star': 'star',
  'star-outline': 'star',
  'flame': 'flame',
  'flame-outline': 'flame',
  'play': 'play',
  'play-skip-forward': 'play',
  'stop': 'stop',
  'podium': 'trophy',
  'podium-outline': 'trophy',

  // Learning
  'school': 'study',
  'school-outline': 'study',
  'book': 'book',
  'book-outline': 'book',
  'library-outline': 'book',
  'document-text': 'document',
  'document-outline': 'document',
  'document-text-outline': 'document',
  'layers-outline': 'clipboard',

  // Settings & utility
  'settings': 'settings',
  'settings-outline': 'settings',
  'options-outline': 'settings',
  'swap-horizontal-outline': 'refresh',
  'sync-outline': 'refresh',
  'refresh': 'refresh',
  'refresh-outline': 'refresh',

  // Visual & atmospheric
  'sparkles': 'sparkle',
  'sparkles-outline': 'sparkle',
  'sunny': 'sun',
  'sunny-outline': 'sun',
  'moon': 'sleep',
  'moon-outline': 'sleep',
  'cloud-offline-outline': 'cloud',
  'cloud-upload-outline': 'upload',
  'wifi': 'wifi',

  // Hints & misc
  'bulb-outline': 'sparkle',
  'flag-outline': 'location',
  'link-outline': 'link',
  'unlink-outline': 'link',
  'share-outline': 'share',
  'eye': 'eye',
  'eye-outline': 'eye',
  'eye-off-outline': 'eye',
  'download-outline': 'download',
  'copy-outline': 'copy',
  'ellipsis-horizontal': 'more',

  // Gestures & body
  'hand-left': 'profile',
  'hand-left-outline': 'profile',
  'hand-right-outline': 'profile',
  'walk-outline': 'endurance',
  'footsteps-outline': 'endurance',

  // Nature & wayfinding
  'leaf': 'recovery',
  'leaf-outline': 'recovery',
  'git-branch-outline': 'link',
  'navigate-outline': 'location',
  'compass-outline': 'location',
  'diamond': 'trophy',
  'diamond-outline': 'trophy',

  // Mood
  'happy': 'mood',
  'happy-outline': 'mood',
  'sad': 'mood',
  'sad-outline': 'mood',

  // Lists
  'list': 'document',
  'list-outline': 'document',
  'thumbs-up': 'check',
  'thumbs-up-outline': 'check',

  // Microphone / camera / video
  'mic': 'mic',
  'mic-outline': 'mic',
  'camera': 'camera',
  'camera-outline': 'camera',
  'camera-reverse-outline': 'camera',
  'videocam': 'video',
  'videocam-outline': 'video',

  // Flask / experiment
  'flask': 'flask',
  'flask-outline': 'flask',

  // Menu / save / search
  'menu': 'menu',
  'menu-outline': 'menu',
  'save-outline': 'save',
  'search': 'search',
  'search-outline': 'search',

  // Location
  'location': 'location',
  'location-outline': 'location',

  // Home
  'home': 'home',
  'home-outline': 'home',

  // Brand logos (Bond has them)
  'logo-apple': 'logo-apple',
  'logo-google': 'logo-google',
};

export { IONICONS_TO_TOMO };

/** `-outline` → outline variant, everything else → filled. */
function bondWeight(ioniconsName: string): 'regular' | 'fill' {
  return ioniconsName.endsWith('-outline') ? 'regular' : 'fill';
}

export const TOMO_ICONS = {
  home: 'home',
  homeOutline: 'home-outline',
  checkin: 'checkmark-circle',
  checkinOutline: 'checkmark-circle-outline',
  progress: 'bar-chart',
  progressOutline: 'bar-chart-outline',
  profile: 'person',
  profileOutline: 'person-outline',
  flame: 'flame',
  flameOutline: 'flame-outline',
  fitness: 'fitness',
  fitnessOutline: 'fitness-outline',
  alert: 'alert-circle',
  alertOutline: 'alert-circle-outline',
  bed: 'bed',
  bedOutline: 'bed-outline',
  edit: 'create',
  editOutline: 'create-outline',
  notifications: 'notifications',
  notificationsOutline: 'notifications-outline',
  shield: 'shield-checkmark',
  shieldOutline: 'shield-checkmark-outline',
  help: 'help-circle',
  helpOutline: 'help-circle-outline',
  chevronRight: 'chevron-forward',
  chevronLeft: 'chevron-back',
  logout: 'log-out',
  logoutOutline: 'log-out-outline',
  trophy: 'trophy',
  trophyOutline: 'trophy-outline',
  star: 'star',
  starOutline: 'star-outline',
  close: 'close',
  back: 'arrow-back',
  checkmark: 'checkmark',
  checkmarkCircle: 'checkmark-circle',
  mail: 'mail-outline',
  lock: 'lock-closed-outline',
  flash: 'flash',
  flashOutline: 'flash-outline',
  water: 'water',
  waterOutline: 'water-outline',
  basketball: 'basketball',
  footballOutline: 'football-outline',
  tennisball: 'tennisball',
  tennisballOutline: 'tennisball-outline',
  time: 'time',
  timeOutline: 'time-outline',
  calendar: 'calendar',
  calendarOutline: 'calendar-outline',
  podium: 'podium',
  podiumOutline: 'podium-outline',
  refresh: 'refresh',
  happy: 'happy',
  happyOutline: 'happy-outline',
  sad: 'sad',
  sadOutline: 'sad-outline',
  medical: 'medkit',
  medicalOutline: 'medkit-outline',
  moon: 'moon',
  moonOutline: 'moon-outline',
  sunny: 'sunny',
  body: 'body',
  bodyOutline: 'body-outline',
  pulse: 'pulse',
  speedometer: 'speedometer',
  thumbsUp: 'thumbs-up',
  thumbsUpOutline: 'thumbs-up-outline',
  document: 'document-text',
  documentOutline: 'document-text-outline',
  list: 'list',
  listOutline: 'list-outline',
} as const satisfies Record<string, keyof typeof Ionicons.glyphMap>;

export type TomoIconName = keyof typeof TOMO_ICONS;

interface IconProps {
  name: TomoIconName;
  size?: number;
  color?: string;
}

/**
 * Renders a Tomo icon by its symbolic name. Always routes through TomoIcon
 * — there is no Ionicons render path anymore. If the Ionicons glyph has no
 * entry in `IONICONS_TO_TOMO`, the raw Ionicons name is still passed to
 * TomoIcon, whose own hybrid resolver will try Bond (direct TitleCase) →
 * Arc → Phosphor fallback.
 */
export function Icon({ name, size = 24, color = colors.textOnLight }: IconProps) {
  const ioniconsName = TOMO_ICONS[name] as string;
  const tomoName = IONICONS_TO_TOMO[ioniconsName] ?? ioniconsName;
  return (
    <TomoIcon
      name={tomoName}
      size={size}
      color={color}
      weight={bondWeight(ioniconsName)}
    />
  );
}
