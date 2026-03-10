/**
 * Icon Component
 * Typed wrapper around Ionicons for Tomo
 */

import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

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
  const iconName = TOMO_ICONS[name] as keyof typeof Ionicons.glyphMap;
  return <Ionicons name={iconName} size={size} color={color} />;
}
