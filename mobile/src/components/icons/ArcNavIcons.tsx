/**
 * ARC Navigation Icons -- 5 tab bar icons
 * All icons: 20x20 viewBox, 1.5px stroke, rounded caps/joins
 * Used only in the bottom navigation bar.
 */

import React from 'react';
import Svg, { Path, Circle, Line } from 'react-native-svg';

interface NavIconProps {
  size?: number;
  color?: string;
  active?: boolean;
}

const ACTIVE = '#7A9B76';
const INACTIVE = '#5A6B7C';

function c(active: boolean | undefined, color: string | undefined) {
  if (color) return color;
  return active ? ACTIVE : INACTIVE;
}

// NavHome -- pitch center-circle (home is the pitch)
export function NavHomeIcon({ size = 20, color, active }: NavIconProps) {
  const fill = c(active, color);
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Circle cx={10} cy={10} r={7} stroke={fill} strokeWidth={1.5} fill="none" />
      <Circle cx={10} cy={10} r={2} stroke={fill} strokeWidth={1.5} fill="none" />
      <Line x1="10" y1="3" x2="10" y2="8" stroke={fill} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1="10" y1="12" x2="10" y2="17" stroke={fill} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

// NavTrain -- velocity arc with terminal node (training trajectory)
export function NavTrainIcon({ size = 20, color, active }: NavIconProps) {
  const fill = c(active, color);
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Path d="M 2 16 Q 4 4 10 4 Q 16 4 18 16" stroke={fill} strokeWidth={1.5} fill="none" strokeLinecap="round" />
      <Circle cx={10} cy={4} r={2} stroke={fill} strokeWidth={1.5} fill="none" />
    </Svg>
  );
}

// NavChat -- signal arcs (dialogue)
export function NavChatIcon({ size = 20, color, active }: NavIconProps) {
  const fill = c(active, color);
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Path d="M 4 16 Q 4 6 10 6 Q 16 6 16 11 Q 16 16 11 16 L 8 19 Z" stroke={fill} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M 7 11 Q 10 8.5 13 11" stroke={fill} strokeWidth={1.2} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

// NavArc -- nested season arcs (timeline/calendar)
export function NavArcIcon({ size = 20, color, active }: NavIconProps) {
  const fill = c(active, color);
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Path d="M 2 17 Q 2 5 10 5 Q 18 5 18 17" stroke={fill} strokeWidth={1.5} fill="none" strokeLinecap="round" />
      <Path d="M 5 17 Q 5 9 10 9 Q 15 9 15 17" stroke={fill} strokeWidth={1.2} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

// NavProfile -- athletic silhouette in arc
export function NavProfileIcon({ size = 20, color, active }: NavIconProps) {
  const fill = c(active, color);
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Circle cx={10} cy={7} r={3.5} stroke={fill} strokeWidth={1.5} fill="none" />
      <Path d="M 3 18 Q 3 13 10 13 Q 17 13 17 18" stroke={fill} strokeWidth={1.5} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

// --- Nav icon name map ---
export const ARC_NAV_ICON_MAP: Record<string, React.FC<NavIconProps>> = {
  home: NavHomeIcon,
  train: NavTrainIcon,
  chat: NavChatIcon,
  arc: NavArcIcon,
  profile: NavProfileIcon,
};
