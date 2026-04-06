/**
 * ARC Custom Icon System -- 13 sport-metaphor content icons
 * All icons: 24x24 viewBox, 1.5px stroke, rounded caps/joins
 */

import React from 'react';
import Svg, { Path, Circle, Line, Rect } from 'react-native-svg';

interface IconProps {
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

// 1. DAILY -- sunrise arc over horizon
export function DailyIcon({ size = 24, color, active }: IconProps) {
  const fill = c(active, color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M 4 14 A 8 8 0 0 1 20 14" stroke={fill} strokeWidth={1.5} fill="none" strokeLinecap="round" />
      <Line x1="12" y1="6" x2="12" y2="4" stroke={fill} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1="6.5" y1="8.5" x2="5" y2="7" stroke={fill} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1="17.5" y1="8.5" x2="19" y2="7" stroke={fill} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1="2" y1="14" x2="22" y2="14" stroke={fill} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

// 2. STRENGTH -- velocity arc with weight node at peak
export function StrengthIcon({ size = 24, color, active }: IconProps) {
  const fill = c(active, color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M 3 18 Q 5 6 12 6 Q 19 6 21 18" stroke={fill} strokeWidth={1.5} fill="none" strokeLinecap="round" />
      <Circle cx={12} cy={6} r={2.5} stroke={fill} strokeWidth={1.5} fill="none" />
      <Line x1="12" y1="8.5" x2="12" y2="12" stroke={fill} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

// 3. SPEED -- motion lines behind leading node
export function SpeedIcon({ size = 24, color, active }: IconProps) {
  const fill = c(active, color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={18} cy={12} r={2.5} stroke={fill} strokeWidth={1.5} fill="none" />
      <Line x1="3" y1="9" x2="14" y2="9" stroke={fill} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1="5" y1="12" x2="14" y2="12" stroke={fill} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1="3" y1="15" x2="14" y2="15" stroke={fill} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

// 4. ENDURANCE -- sustained plateau wave
export function EnduranceIcon({ size = 24, color, active }: IconProps) {
  const fill = c(active, color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M 2 16 L 6 16 L 8 9 L 11 9 L 13 9 L 16 9 L 18 16 L 22 16"
        stroke={fill} strokeWidth={1.5} fill="none"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

// 5. FLEXIBILITY -- curved spine arc
export function FlexibilityIcon({ size = 24, color, active }: IconProps) {
  const fill = c(active, color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M 8 20 Q 4 14 8 10 Q 12 6 16 10 Q 20 14 16 20" stroke={fill} strokeWidth={1.5} fill="none" strokeLinecap="round" />
      <Line x1="8" y1="20" x2="5" y2="22" stroke={fill} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1="16" y1="20" x2="19" y2="22" stroke={fill} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

// 6. RECOVERY -- heart-rate wave returning to baseline
export function RecoveryIcon({ size = 24, color, active }: IconProps) {
  const fill = c(active, color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M 2 13 L 5 13 L 7 7 L 9 17 L 11 10 L 13 13 L 22 13"
        stroke={fill} strokeWidth={1.5} fill="none"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

// 7. STUDY -- narrow window with focused beam
export function StudyIcon({ size = 24, color, active }: IconProps) {
  const fill = c(active, color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={7} y={3} width={10} height={14} rx={1.5} stroke={fill} strokeWidth={1.5} fill="none" />
      <Line x1="12" y1="3" x2="12" y2="17" stroke={fill} strokeWidth={1.5} strokeLinecap="round" strokeDasharray="2 2" />
      <Line x1="10" y1="20" x2="14" y2="20" stroke={fill} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1="12" y1="17" x2="12" y2="20" stroke={fill} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

// 8. EXAM -- score card with check mark
export function ExamIcon({ size = 24, color, active }: IconProps) {
  const fill = c(active, color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={4} y={3} width={16} height={18} rx={2} stroke={fill} strokeWidth={1.5} fill="none" />
      <Line x1="8" y1="9" x2="16" y2="9" stroke={fill} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1="8" y1="13" x2="13" y2="13" stroke={fill} strokeWidth={1.5} strokeLinecap="round" />
      <Path d="M 13 16 L 15 18 L 19 14" stroke={fill} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// 9. ASSIGNMENT -- clipboard with progress marks
export function AssignmentIcon({ size = 24, color, active }: IconProps) {
  const fill = c(active, color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={5} y={4} width={14} height={17} rx={2} stroke={fill} strokeWidth={1.5} fill="none" />
      <Rect x={9} y={2} width={6} height={4} rx={1} stroke={fill} strokeWidth={1.5} fill="none" />
      <Path d="M 8 11 L 9.5 12.5 L 12 10" stroke={fill} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="13" y1="11" x2="17" y2="11" stroke={fill} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1="8" y1="15" x2="17" y2="15" stroke={fill} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1="8" y1="18" x2="14" y2="18" stroke={fill} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

// 10. CHAT -- signal arcs with return arcs (dialogue)
export function ChatIcon({ size = 24, color, active }: IconProps) {
  const fill = c(active, color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M 4 18 Q 4 8 12 8 Q 20 8 20 13 Q 20 18 14 18 L 10 22 Z" stroke={fill} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M 9 13 Q 12 10 15 13" stroke={fill} strokeWidth={1.5} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

// 11. PROGRESS -- ascending trajectory with speed ticks
export function ProgressIcon({ size = 24, color, active }: IconProps) {
  const fill = c(active, color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M 3 19 Q 7 19 10 14 Q 13 9 17 7 L 21 5" stroke={fill} strokeWidth={1.5} fill="none" strokeLinecap="round" />
      <Line x1="17" y1="5" x2="21" y2="5" stroke={fill} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1="21" y1="5" x2="21" y2="9" stroke={fill} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1="7" y1="16" x2="7" y2="19" stroke={fill} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1="13" y1="11" x2="13" y2="14" stroke={fill} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

// 12. DATA -- three stacked arcs (signal layers)
export function DataIcon({ size = 24, color, active }: IconProps) {
  const fill = c(active, color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M 6 18 A 6 6 0 0 1 18 18" stroke={fill} strokeWidth={1.5} fill="none" strokeLinecap="round" />
      <Path d="M 3 15 A 9 9 0 0 1 21 15" stroke={fill} strokeWidth={1.5} fill="none" strokeLinecap="round" />
      <Path d="M 1 12 A 11 11 0 0 1 23 12" stroke={fill} strokeWidth={1.5} fill="none" strokeLinecap="round" />
      <Circle cx={12} cy={20} r={1.5} fill={fill} />
    </Svg>
  );
}

// 13. TIMELINE -- season arc with milestone nodes
export function TimelineIcon({ size = 24, color, active }: IconProps) {
  const fill = c(active, color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M 3 18 Q 3 6 12 6 Q 21 6 21 18" stroke={fill} strokeWidth={1.5} fill="none" strokeLinecap="round" />
      <Circle cx={12} cy={6} r={2} stroke={fill} strokeWidth={1.5} fill="none" />
      <Circle cx={7} cy={11} r={1.5} stroke={fill} strokeWidth={1.5} fill="none" />
      <Circle cx={17} cy={11} r={1.5} stroke={fill} strokeWidth={1.5} fill="none" />
    </Svg>
  );
}

// --- Icon name map for dynamic resolution ---
export const ARC_ICON_MAP: Record<string, React.FC<IconProps>> = {
  daily: DailyIcon,
  strength: StrengthIcon,
  speed: SpeedIcon,
  endurance: EnduranceIcon,
  flexibility: FlexibilityIcon,
  recovery: RecoveryIcon,
  study: StudyIcon,
  exam: ExamIcon,
  assignment: AssignmentIcon,
  chat: ChatIcon,
  progress: ProgressIcon,
  data: DataIcon,
  timeline: TimelineIcon,
};
