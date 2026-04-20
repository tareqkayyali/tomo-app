/**
 * TomoIcon — hybrid icon resolver.
 *
 * Resolution order (first match wins):
 *   1. Bond sprite (108 icons, 198 variants)    — from tomoIconXml via SvgXml
 *   2. Arc custom set                            — for legacy sport-metaphor glyphs
 *   3. Phosphor via semantic map                 — everything else
 *   4. Phosphor by direct PascalCase name        — escape hatch
 *   5. null (dev warning)
 *
 * The call-site API is preserved from v1, so all ~180 existing
 * `<TomoIcon name="..." size color weight/>` usages work unchanged.
 *
 * Weight mapping for Bond:
 *   - weight="fill"  → filled variant
 *   - anything else  → outline variant
 *   Icons in SINGLE_VARIANT ignore weight (e.g. Close, Chevron-*, Logo-Apple).
 */
import React, { memo } from 'react';
import { SvgXml } from 'react-native-svg';
import * as PhosphorIcons from 'phosphor-react-native';
import { useTheme } from '../../hooks/useTheme';
import { ARC_ICON_MAP } from '../icons/ArcIcons';
import { TOMO_ICON_XML } from './icons/tomoIconXml';
import {
  TOMO_ICONS,
  SINGLE_VARIANT,
  type TomoIconName,
} from './icons/icons-manifest';

type IconWeight = 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';

/**
 * Lowercase-semantic → Bond TitleCase name.
 * Covers every semantic name that had a Phosphor mapping in v1 plus
 * every Arc-icon semantic name, so the ~180 existing call-sites resolve
 * to the Bond glyph wherever one exists.
 */
const SEMANTIC_TO_BOND: Record<string, string> = {
  // Tab bar / primary nav
  timeline: 'Timeline',
  output: 'Load',
  tomo: 'Chat',
  mastery: 'Star',
  ownit: 'Sparkle',
  home: 'Home',
  train: 'Train',
  chat: 'Chat',
  profile: 'Profile',
  today: 'Today',
  sessions: 'Sessions',

  // Training pillars
  endurance: 'Endurance',
  strength: 'Strength',
  power: 'Power',
  speed: 'Speed',
  agility: 'Agility',
  flexibility: 'Flexibility',
  mental: 'Mental',
  skills: 'Skills',
  tactics: 'Tactics',
  fitness: 'Train',

  // Academic
  study: 'Study',
  exam: 'Exam',
  assignment: 'Assignment',
  balance: 'Balance',
  schedule: 'Schedule',

  // System actions
  notifications: 'Bell',
  notification: 'Bell',
  bell: 'Bell',
  calendar: 'Event',
  settings: 'Settings',
  search: 'Search',
  add: 'Add',
  close: 'Close',
  back: 'Back',
  edit: 'Edit',
  delete: 'Trash',
  trash: 'Trash',
  check: 'Check',
  warning: 'Warning',
  info: 'Info',
  help: 'Help',
  share: 'Share',
  copy: 'Copy',
  download: 'Download',
  upload: 'Upload',
  link: 'Link',
  save: 'Save',
  logout: 'Logout',
  refresh: 'Refresh',
  menu: 'Menu',
  more: 'More',

  // Status & feedback
  fire: 'Flame',
  flame: 'Flame',
  trophy: 'Trophy',
  medal: 'Medal',
  star: 'Star',
  sparkle: 'Sparkle',
  verified: 'Verified',
  error: 'Error',
  live: 'Live',
  phvLocked: 'PhvLocked',

  // Metrics / wellness
  heart: 'Heart',
  pulse: 'Pulse',
  hrv: 'HRV',
  sleep: 'Sleep',
  load: 'Load',
  recovery: 'Recovery',
  readiness: 'Readiness',
  acwr: 'Acwr',
  trend: 'Trend',
  target: 'Match',
  clipboard: 'Clipboard',
  chart: 'Load',
  timer: 'Timer',
  clock: 'Clock',
  alarm: 'Alarm',
  sun: 'Sun',
  hydration: 'Hydration',
  nutrition: 'Nutrition',
  mood: 'Mood',
  soreness: 'Soreness',
  bandage: 'Bandage',

  // Sport
  football: 'Ball',
  ball: 'Ball',
  pitch: 'Pitch',
  goal: 'Goal',
  boot: 'Boot',
  match: 'Match',

  // Calendar
  day: 'Day',
  week: 'Week',
  event: 'Event',

  // Check-in
  checkin: 'CheckIn',
  checkinDone: 'CheckInDone',

  // Content & media
  camera: 'Camera',
  video: 'Video',
  document: 'Document',
  book: 'Book',
  flask: 'Flask',

  // Nav / location
  location: 'Location',
  'arrow-up': 'Arrow-up',

  // System utility
  lock: 'Lock',
  key: 'Key',
  eye: 'Eye',
  shield: 'Shield',

  // Comms & media
  mail: 'Mail',
  megaphone: 'Megaphone',
  send: 'Send',
  mic: 'Mic',
  stop: 'Stop',
  play: 'Play',
  pause: 'Pause',

  // Device & connectivity
  watch: 'Watch',
  wifi: 'Wifi',
  cloud: 'Cloud',

  // Brand
  'logo-apple': 'Logo-Apple',
  'logo-google': 'Logo-Google',
};

/**
 * Phosphor fallback map — retained for graceful fallback when a semantic
 * name has no Bond equivalent. Phase 3 will prune this once the Bond sweep
 * covers every call-site.
 */
const PHOSPHOR_FALLBACK: Record<string, string> = {
  endurance: 'Heartbeat',
  power: 'Lightning',
  speed: 'PersonSimpleRun',
  agility: 'ArrowsOutCardinal',
  flexibility: 'PersonArmsSpread',
  mental: 'Brain',
  home: 'House',
  profile: 'UserCircle',
  notifications: 'Bell',
  calendar: 'CalendarDots',
  settings: 'GearSix',
  search: 'MagnifyingGlass',
  add: 'Plus',
  close: 'X',
  back: 'ArrowLeft',
  edit: 'PencilSimple',
  delete: 'Trash',
  check: 'Check',
  warning: 'Warning',
  info: 'Info',
  help: 'Question',
  fire: 'Fire',
  trophy: 'Trophy',
  medal: 'Medal',
  heart: 'Heart',
  pulse: 'Pulse',
  target: 'Target',
  clipboard: 'Clipboard',
  chart: 'ChartBar',
  timer: 'Timer',
  football: 'SoccerBall',
  fitness: 'Barbell',
  recovery: 'BatteryCharging',
  sleep: 'Moon',
  study: 'BookOpen',
  exam: 'Exam',
  send: 'PaperPlaneRight',
  mic: 'Microphone',
  stop: 'StopCircle',
  sparkle: 'Sparkle',
};

/** Bond manifest membership set, for quick direct-name lookups. */
const BOND_NAME_SET: ReadonlySet<string> = new Set(TOMO_ICONS);

export interface TomoIconProps {
  /** Lowercase semantic name, Bond TitleCase name, or direct Phosphor name. */
  name: string;
  /** Icon size in px — default 22. */
  size?: number;
  /** Icon color. Defaults to theme chalk (cream). */
  color?: string;
  /** Phosphor-style weight. `fill` → Bond filled variant; others → outline. */
  weight?: IconWeight;
}

/**
 * Build the `tomoIconXml` key for a Bond name + filled state.
 * Returns null if the name isn't in the manifest.
 */
function resolveBondKey(bondName: string, filled: boolean): string | null {
  if (!BOND_NAME_SET.has(bondName)) return null;
  if (SINGLE_VARIANT.has(bondName as TomoIconName)) return bondName;
  return `${bondName}.${filled ? 'filled' : 'outline'}`;
}

const TomoIcon: React.FC<TomoIconProps> = memo(({
  name,
  size = 22,
  color,
  weight = 'regular',
}) => {
  const { colors } = useTheme();
  const tint = color ?? colors.chalk;
  const filled = weight === 'fill';

  // 1. Bond resolution — semantic map first, then direct TitleCase pass-through.
  const bondName = SEMANTIC_TO_BOND[name] ?? (BOND_NAME_SET.has(name) ? name : null);
  if (bondName) {
    const key = resolveBondKey(bondName, filled);
    if (key && TOMO_ICON_XML[key]) {
      return (
        <SvgXml
          xml={TOMO_ICON_XML[key]}
          width={size}
          height={size}
          color={tint}
        />
      );
    }
  }

  // 2. Arc custom set (legacy sport-metaphor glyphs).
  const ArcComponent = ARC_ICON_MAP[name];
  if (ArcComponent) {
    return <ArcComponent size={size} color={tint} active={filled} />;
  }

  // 3. Phosphor via semantic map.
  const phosphorName = PHOSPHOR_FALLBACK[name] ?? name;
  const IconComponent = (PhosphorIcons as Record<string, React.ComponentType<any>>)[phosphorName];

  if (!IconComponent) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn(`[TomoIcon] Unknown icon: "${name}" (resolved to "${phosphorName}")`);
    }
    return null;
  }

  return <IconComponent size={size} color={tint} weight={weight} />;
});

TomoIcon.displayName = 'TomoIcon';

export { SEMANTIC_TO_BOND };
export default TomoIcon;
