/**
 * TomoIcon — Phosphor icon wrapper enforcing Tomo's 1.5px stroke style.
 *
 * Provides a consistent icon API with a mapping from Tomo semantic names
 * to Phosphor icon components. Default weight is 'regular' (1.5px stroke).
 */
import React, { memo } from 'react';
import * as PhosphorIcons from 'phosphor-react-native';
import { useTheme } from '../../hooks/useTheme';

/** Phosphor icon weight (stroke style) */
type IconWeight = 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';

/** Map of Tomo semantic icon names → Phosphor component names */
const TOMO_ICON_MAP: Record<string, string> = {
  // Tab bar
  timeline: 'CalendarDots',
  output: 'ChartBar',
  tomo: 'ChatCircle',
  mastery: 'Star',
  ownit: 'Lightbulb',

  // Pillars
  endurance: 'Heartbeat',
  strength: 'Barbell',
  power: 'Lightning',
  speed: 'PersonSimpleRun',
  agility: 'ArrowsOutCardinal',
  flexibility: 'PersonArmsSpread',
  mental: 'Brain',

  // Common actions
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

  // Status & data
  fire: 'Fire',
  trophy: 'Trophy',
  medal: 'Medal',
  heart: 'Heart',
  pulse: 'Pulse',
  target: 'Target',
  clipboard: 'Clipboard',
  chart: 'ChartBar',
  timer: 'Timer',

  // Sport
  football: 'SoccerBall',
  fitness: 'Barbell',
  recovery: 'BatteryCharging',
  sleep: 'Moon',
  study: 'BookOpen',
  exam: 'Exam',

  // Chat
  send: 'PaperPlaneRight',
  mic: 'Microphone',
  stop: 'StopCircle',
  sparkle: 'Sparkle',
};

export interface TomoIconProps {
  /** Tomo semantic name (e.g. 'endurance', 'home') or Phosphor name (e.g. 'Heartbeat') */
  name: string;
  /** Icon size in px — default 22 */
  size?: number;
  /** Icon color — default uses theme chalk color */
  color?: string;
  /** Phosphor weight — default 'regular' (1.5px stroke) */
  weight?: IconWeight;
}

const TomoIcon: React.FC<TomoIconProps> = memo(({
  name,
  size = 22,
  color,
  weight = 'regular',
}) => {
  const { colors } = useTheme();
  const iconColor = color ?? colors.chalk;

  // Resolve Tomo semantic name → Phosphor component name
  const phosphorName = TOMO_ICON_MAP[name] ?? name;

  // Look up the Phosphor component
  const IconComponent = (PhosphorIcons as Record<string, React.ComponentType<any>>)[phosphorName];

  if (!IconComponent) {
    // Fallback: render nothing rather than crash
    if (__DEV__) {
      console.warn(`[TomoIcon] Unknown icon: "${name}" (resolved to "${phosphorName}")`);
    }
    return null;
  }

  return <IconComponent size={size} color={iconColor} weight={weight} />;
});

TomoIcon.displayName = 'TomoIcon';

export { TOMO_ICON_MAP };
export default TomoIcon;
