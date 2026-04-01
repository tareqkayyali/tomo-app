/**
 * Icon Component
 * Typed wrapper around Ionicons for Tomo.
 * Now bridges to Phosphor icons via TomoIcon when a mapping exists.
 */

import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import TomoIcon from './tomo-ui/TomoIcon';

/**
 * Maps Ionicons glyph names → Phosphor component names.
 * Brand logos (logo-*) intentionally omitted — they always fall back to Ionicons.
 */
const IONICONS_TO_PHOSPHOR: Record<string, string> = {
  // Navigation
  'chevron-back': 'CaretLeft',
  'chevron-forward': 'CaretRight',
  'arrow-back': 'ArrowLeft',
  'arrow-forward': 'ArrowRight',
  'arrow-undo': 'ArrowUTurnLeft',
  'arrow-up-outline': 'ArrowUp',
  'arrow-down-circle': 'ArrowCircleDown',
  'arrow-up-circle': 'ArrowCircleUp',
  'return-down-back': 'ArrowBendDownLeft',

  // Status
  'checkmark': 'Check',
  'checkmark-circle': 'CheckCircle',
  'checkmark-circle-outline': 'CheckCircle',
  'close': 'X',
  'close-circle': 'XCircle',
  'warning': 'Warning',
  'warning-outline': 'Warning',
  'alert-circle': 'WarningCircle',
  'alert-circle-outline': 'WarningCircle',
  'information-circle': 'Info',
  'information-circle-outline': 'Info',

  // Actions
  'add': 'Plus',
  'add-circle-outline': 'PlusCircle',
  'pencil': 'Pencil',
  'create': 'PencilSimple',
  'create-outline': 'PencilSimple',
  'trash-outline': 'Trash',
  'send': 'PaperPlaneRight',
  'paper-plane': 'PaperPlaneRight',
  'paper-plane-outline': 'PaperPlaneRight',
  'remove': 'Minus',
  'move-outline': 'ArrowsOutCardinal',
  'reorder-three-outline': 'List',
  'resize-outline': 'ArrowsOut',

  // Communication
  'mail-outline': 'Envelope',
  'notifications': 'Bell',
  'notifications-outline': 'Bell',
  'notifications-off-outline': 'BellSlash',
  'chatbubble-outline': 'ChatCircle',
  'chatbubbles-outline': 'ChatCircleDots',
  'people-outline': 'Users',
  'person': 'User',
  'person-outline': 'User',
  'person-add-outline': 'UserPlus',
  'person-remove-outline': 'UserMinus',
  'person-circle': 'UserCircle',
  'person-circle-outline': 'UserCircle',

  // Auth
  'key-outline': 'Key',
  'lock-closed': 'Lock',
  'lock-closed-outline': 'Lock',
  'log-in-outline': 'SignIn',
  'log-out': 'SignOut',
  'log-out-outline': 'SignOut',
  'shield-checkmark': 'ShieldCheck',
  'shield-checkmark-outline': 'ShieldCheck',
  'shield': 'Shield',
  'shield-outline': 'Shield',

  // Time
  'calendar': 'CalendarDots',
  'calendar-outline': 'CalendarDots',
  'time': 'Clock',
  'time-outline': 'Clock',
  'timer-outline': 'Timer',
  'hourglass-outline': 'Hourglass',
  'alarm-outline': 'Alarm',
  'watch-outline': 'Watch',

  // Performance
  'bar-chart': 'ChartBar',
  'bar-chart-outline': 'ChartBar',
  'analytics-outline': 'ChartLineUp',
  'trending-up': 'TrendUp',
  'trending-up-outline': 'TrendUp',
  'stats-chart-outline': 'ChartLine',
  'pulse': 'Pulse',
  'pulse-outline': 'Pulse',
  'speedometer': 'Gauge',
  'speedometer-outline': 'Gauge',

  // Health & Fitness
  'fitness': 'Heartbeat',
  'fitness-outline': 'Heartbeat',
  'body': 'PersonSimple',
  'body-outline': 'PersonSimple',
  'heart-outline': 'Heart',
  'bed': 'Bed',
  'bed-outline': 'Bed',
  'water': 'Drop',
  'water-outline': 'Drop',
  'flash': 'Lightning',
  'flash-outline': 'Lightning',
  'medkit': 'FirstAid',
  'medkit-outline': 'FirstAid',

  // Sports
  'basketball': 'Basketball',
  'basketball-outline': 'Basketball',
  'football': 'SoccerBall',
  'football-outline': 'SoccerBall',
  'tennisball': 'TennisBall',
  'tennisball-outline': 'TennisBall',
  'barbell-outline': 'Barbell',
  'bicycle-outline': 'Bicycle',
  'medal': 'Medal',
  'ribbon': 'Medal',

  // Achievements
  'trophy': 'Trophy',
  'trophy-outline': 'Trophy',
  'star': 'Star',
  'star-outline': 'Star',
  'flame': 'Fire',
  'flame-outline': 'Fire',
  'play': 'Play',
  'play-skip-forward': 'SkipForward',
  'stop': 'Stop',
  'podium': 'Trophy',
  'podium-outline': 'Trophy',

  // Learning
  'school': 'GraduationCap',
  'school-outline': 'GraduationCap',
  'book': 'Book',
  'book-outline': 'BookOpen',
  'library-outline': 'Books',
  'document-text': 'FileText',
  'document-outline': 'File',
  'document-text-outline': 'FileText',
  'layers-outline': 'Stack',

  // Settings
  'settings-outline': 'GearSix',
  'options-outline': 'Sliders',
  'swap-horizontal-outline': 'ArrowsLeftRight',
  'sync-outline': 'ArrowsClockwise',
  'refresh': 'ArrowClockwise',
  'refresh-outline': 'ArrowClockwise',

  // Visual
  'sparkles': 'Sparkle',
  'sparkles-outline': 'Sparkle',
  'sunny': 'Sun',
  'sunny-outline': 'Sun',
  'moon': 'Moon',
  'moon-outline': 'Moon',
  'cloud-offline-outline': 'CloudSlash',
  'wifi': 'Wifi',

  // Info & Misc
  'help-circle': 'Question',
  'help-circle-outline': 'Question',
  'help-outline': 'Question',
  'megaphone-outline': 'Megaphone',
  'bulb-outline': 'Lightbulb',
  'flag-outline': 'Flag',
  'link-outline': 'Link',
  'unlink-outline': 'LinkBreak',
  'share-outline': 'ShareNetwork',
  'eye': 'Eye',
  'eye-outline': 'Eye',
  'download-outline': 'DownloadSimple',
  'copy-outline': 'Copy',
  'ellipsis-horizontal': 'DotsThree',

  // Gestures & Body
  'hand-left': 'HandPalm',
  'hand-left-outline': 'HandPalm',
  'hand-right-outline': 'HandPalm',
  'walk-outline': 'PersonSimpleWalk',

  // Nature & Other
  'leaf': 'Leaf',
  'leaf-outline': 'Leaf',
  'git-branch-outline': 'GitBranch',
  'navigate-outline': 'Compass',
  'diamond': 'Diamond',
  'diamond-outline': 'Diamond',

  // Mood
  'happy': 'Smiley',
  'happy-outline': 'Smiley',
  'sad': 'SmileySad',
  'sad-outline': 'SmileySad',

  // Lists & Documents
  'list': 'List',
  'list-outline': 'List',
  'thumbs-up': 'ThumbsUp',
  'thumbs-up-outline': 'ThumbsUp',

  // Microphone
  'mic': 'Microphone',
  'mic-outline': 'Microphone',
};

export { IONICONS_TO_PHOSPHOR };

/**
 * Determine Phosphor weight from Ionicons name.
 * Names ending in '-outline' → regular (stroke), others → fill.
 */
function phosphorWeight(ioniconsName: string): 'regular' | 'fill' {
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
} as const;

export type TomoIconName = keyof typeof TOMO_ICONS;

interface IconProps {
  name: TomoIconName;
  size?: number;
  color?: string;
}

export function Icon({ name, size = 24, color = colors.textOnLight }: IconProps) {
  const ioniconsName = TOMO_ICONS[name] as string;
  const phosphorName = IONICONS_TO_PHOSPHOR[ioniconsName];

  // If we have a Phosphor mapping, use the new icon system
  if (phosphorName) {
    return (
      <TomoIcon
        name={phosphorName}
        size={size}
        color={color}
        weight={phosphorWeight(ioniconsName)}
      />
    );
  }

  // Fallback to Ionicons for unmapped icons
  return <Ionicons name={ioniconsName as keyof typeof Ionicons.glyphMap} size={size} color={color} />;
}
