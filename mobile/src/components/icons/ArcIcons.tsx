/**
 * TOMO ICON SYSTEM — Circle Grammar
 * Japanese-inspired circular icons for the Tomo athlete development platform
 *
 * 32 icons: 5 nav + 5 training + 5 academic + 6 action + 5 state + 5 metric + 1 checkin
 */

import React from 'react';
import Svg, { Circle, Line, Path } from 'react-native-svg';

// ─── TOKEN REFERENCES ────────────────────────────────────────────
const ACCENT      = '#7a9b76';
const INACTIVE    = '#2e3048';
const INACTIVE_MID = '#4a4f6a';
const WARNING     = '#c49a3c';
const ERROR       = '#a05a4a';

// ─── SHARED TYPES ────────────────────────────────────────────────
interface IconProps {
  size?: number;
  active?: boolean;
  color?: string;
}

const s = (active?: boolean, color?: string): string =>
  color ?? (active ? ACCENT : INACTIVE);

const f = (active?: boolean): string =>
  active ? ACCENT : INACTIVE_MID;

// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATION — 5 tab icons
// ─────────────────────────────────────────────────────────────────────────────

/**
 * HomeIcon — 4-quadrant circle · complete view of everything
 * All 4 sectors visible and equally weighted = home is whole picture
 */
export function HomeIcon({ size = 24, active, color }: IconProps) {
  const c = s(active, color)
  const fill = f(active)
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.5" fill="none" />
      <Line x1="12" y1="3" x2="12" y2="21" stroke={c} strokeWidth="0.8" />
      <Line x1="3" y1="12" x2="21" y2="12" stroke={c} strokeWidth="0.8" />
      {active && (
        <>
          <Path d="M12 3 A9 9 0 0 1 21 12 L12 12 Z" fill={fill} fillOpacity="0.15" />
          <Path d="M3 12 A9 9 0 0 1 12 3 L12 12 Z" fill={fill} fillOpacity="0.10" />
          <Path d="M12 21 A9 9 0 0 1 3 12 L12 12 Z" fill={fill} fillOpacity="0.10" />
          <Path d="M21 12 A9 9 0 0 1 12 21 L12 12 Z" fill={fill} fillOpacity="0.10" />
        </>
      )}
    </Svg>
  )
}

/**
 * TrainIcon — dominant left half + divided right half
 * Large sector = session · two small sectors = sets done/pending
 */
export function TrainIcon({ size = 24, active, color }: IconProps) {
  const c = s(active, color)
  const fill = f(active)
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.5" fill="none" />
      <Line x1="12" y1="3" x2="12" y2="21" stroke={c} strokeWidth="0.8" />
      <Line x1="12" y1="12" x2="21" y2="12" stroke={c} strokeWidth="0.8" />
      {active && (
        <Path d="M12 3 A9 9 0 0 0 12 21 L12 12 Z" fill={fill} fillOpacity="0.18" />
      )}
    </Svg>
  )
}

/**
 * ChatIcon — two half-circles with Ma gap between
 * Left half = athlete · right half = AI · gap = thinking space
 */
export function ChatIcon({ size = 24, active, color }: IconProps) {
  const c = s(active, color)
  const fill = f(active)
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M11 3.2 A8 8 0 0 0 11 20.8" stroke={c} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <Path d="M13 3.2 A8 8 0 0 1 13 20.8" stroke={c} strokeWidth="1.2" fill="none" strokeLinecap="round" strokeOpacity="0.6" />
      {active && (
        <Path d="M13 3.2 A8 8 0 0 1 13 20.8 L13 12 Z" fill={fill} fillOpacity="0.12" />
      )}
    </Svg>
  )
}

/**
 * TimelineIcon — ring divided into 4 season quarters
 * One sector lit = current quarter of the season
 */
export function TimelineIcon({ size = 24, active, color }: IconProps) {
  const c = s(active, color)
  const fill = f(active)
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.5" fill="none" />
      <Line x1="12" y1="3" x2="12" y2="12" stroke={c} strokeWidth="0.8" />
      <Line x1="21" y1="12" x2="12" y2="12" stroke={c} strokeWidth="0.8" />
      <Line x1="12" y1="21" x2="12" y2="12" stroke={c} strokeWidth="0.8" />
      <Line x1="3" y1="12" x2="12" y2="12" stroke={c} strokeWidth="0.8" />
      {active && (
        <Path d="M21 12 A9 9 0 0 1 12 3 L12 12 Z" fill={fill} fillOpacity="0.22" />
      )}
    </Svg>
  )
}

/**
 * ProfileIcon — small inner circle elevated within outer ring
 * Inner circle = athlete · outer ring = their world · gap = development arc
 */
export function ProfileIcon({ size = 24, active, color }: IconProps) {
  const c = s(active, color)
  const fill = f(active)
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.5" fill="none" />
      <Circle cx="12" cy="9" r="3.5" stroke={c} strokeWidth="1.2" fill="none" />
      <Path d="M5.5 19.5 A8 8 0 0 1 18.5 19.5" stroke={c} strokeWidth="1.2" fill="none" strokeLinecap="round" />
      {active && (
        <Circle cx="12" cy="9" r="3" fill={fill} fillOpacity="0.18" />
      )}
    </Svg>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// TRAINING TYPES — 5 icons
// ─────────────────────────────────────────────────────────────────────────────

/**
 * StrengthIcon — single thick ring, no divisions
 * Heaviest strokeWidth in the system = concentrated force
 */
export function StrengthIcon({ size = 24, active, color }: IconProps) {
  const c = s(active, color)
  const fill = f(active)
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="8" stroke={c} strokeWidth="2.2" fill={fill} fillOpacity={active ? 0.12 : 0.04} />
    </Svg>
  )
}

/**
 * SpeedIcon — three trailing concentric arcs open at left
 * Three incomplete circles fading = velocity trailing off
 */
export function SpeedIcon({ size = 24, active, color }: IconProps) {
  const c = s(active, color)
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 8 A4 4 0 1 1 8.5 14.5" stroke={c} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <Path d="M12 5.5 A6.5 6.5 0 1 1 6 17" stroke={c} strokeWidth="1.2" fill="none" strokeLinecap="round" strokeOpacity="0.6" />
      <Path d="M12 3 A9 9 0 1 1 3.8 18" stroke={c} strokeWidth="0.9" fill="none" strokeLinecap="round" strokeOpacity="0.3" />
    </Svg>
  )
}

/**
 * EnduranceIcon — full outer ring + steady inner arc held at 270°
 * The sustained plateau — never reaching the end, holding the effort
 */
export function EnduranceIcon({ size = 24, active, color }: IconProps) {
  const c = s(active, color)
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.2" fill="none" strokeOpacity="0.4" />
      <Path d="M18 12 A6 6 0 1 1 12 18" stroke={c} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <Circle cx="12" cy="12" r="2" fill={c} fillOpacity="0.35" />
    </Svg>
  )
}

/**
 * FlexibilityIcon — two arcs opening away from each other
 * The body's range expanding outward — the opening of range of motion
 */
export function FlexibilityIcon({ size = 24, active, color }: IconProps) {
  const c = s(active, color)
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M10 4 A7 7 0 0 0 10 20" stroke={c} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <Path d="M14 4 A7 7 0 0 1 14 20" stroke={c} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <Line x1="10" y1="12" x2="14" y2="12" stroke={c} strokeWidth="0.8" strokeOpacity="0.5" />
    </Svg>
  )
}

/**
 * RecoveryIcon — thin ring + tiny dot at bottom center
 * Lightest icon in the system — the body at rest, readiness rebuilding
 */
export function RecoveryIcon({ size = 24, active, color }: IconProps) {
  const c = s(active, color)
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" stroke={c} strokeWidth="0.8" fill="none" />
      <Circle cx="12" cy="19.5" r="1.5" fill={c} fillOpacity="0.6" />
      <Circle cx="12" cy="12" r="3" stroke={c} strokeWidth="0.6" fill="none" strokeOpacity="0.3" />
    </Svg>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// ACADEMIC TYPES — 5 icons
// ─────────────────────────────────────────────────────────────────────────────

/**
 * StudyIcon — top-right quadrant lit = cognitive readiness window
 * The optimal post-exercise study window (morning, top-right)
 */
export function StudyIcon({ size = 24, active, color }: IconProps) {
  const c = s(active, color)
  const fill = f(active)
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.2" fill="none" strokeOpacity="0.5" />
      <Path d="M12 3 A9 9 0 0 1 21 12 L12 12 Z" fill={fill} fillOpacity={active ? 0.22 : 0.06} />
      <Path d="M12 3 A9 9 0 0 1 21 12" stroke={c} strokeWidth={active ? 1.8 : 1.0} fill="none" strokeLinecap="round" />
    </Svg>
  )
}

/**
 * ExamIcon — full ring with curved check arc inside
 * The check follows the ring's curvature — it belongs here
 */
export function ExamIcon({ size = 24, active, color }: IconProps) {
  const c = s(active, color)
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.5" fill="none" />
      <Path d="M6.5 12 Q9.5 16.5 11.5 14.5 Q14.5 11 18 8" stroke={c} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

/**
 * AssignmentIcon — arc filling from bottom upward
 * Progress through a task as rising arc — water filling a circular vessel
 */
export function AssignmentIcon({ size = 24, active, color }: IconProps) {
  const c = s(active, color)
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.2" fill="none" strokeOpacity="0.4" />
      <Path d="M12 21 A9 9 0 1 1 20.8 7.5" stroke={c} strokeWidth="2" fill="none" strokeLinecap="round" />
    </Svg>
  )
}

/**
 * BalanceIcon — two equal semicircles with minimal gap
 * Training load (left) = Academic load (right) — the dual-load balance
 */
export function BalanceIcon({ size = 24, active, color }: IconProps) {
  const c = s(active, color)
  const fill = f(active)
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3.5 A8.5 8.5 0 0 0 12 20.5" stroke={c} strokeWidth="1.5" fill="none" />
      <Path d="M12 3.5 A8.5 8.5 0 0 1 12 20.5" stroke={c} strokeWidth="1.5" fill="none" />
      {active && (
        <>
          <Path d="M12 3.5 A8.5 8.5 0 0 0 12 20.5 Z" fill={fill} fillOpacity="0.10" />
          <Path d="M12 3.5 A8.5 8.5 0 0 1 12 20.5 Z" fill={fill} fillOpacity="0.07" />
        </>
      )}
    </Svg>
  )
}

/**
 * ScheduleIcon — 5-sector ring (Mon–Fri) + inner concentric ring
 * The week as a dial — inner ring = last week, outer = this week
 */
export function ScheduleIcon({ size = 24, active, color }: IconProps) {
  const c = s(active, color)
  const fill = f(active)
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.2" fill="none" />
      <Circle cx="12" cy="12" r="5" stroke={c} strokeWidth="0.7" fill="none" strokeOpacity="0.5" />
      {/* 5 radial dividers at 72° intervals */}
      <Line x1="12" y1="3" x2="12" y2="7" stroke={c} strokeWidth="0.8" />
      <Line x1="20.6" y1="8.9" x2="17" y2="10.9" stroke={c} strokeWidth="0.8" />
      <Line x1="17.6" y1="20.1" x2="15" y2="16.8" stroke={c} strokeWidth="0.8" />
      <Line x1="6.4" y1="20.1" x2="9" y2="16.8" stroke={c} strokeWidth="0.8" />
      <Line x1="3.4" y1="8.9" x2="7" y2="10.9" stroke={c} strokeWidth="0.8" />
      {active && (
        <Path d="M12 3 A9 9 0 0 1 20.6 8.9 L17 10.9 A5 5 0 0 0 12 7 Z" fill={fill} fillOpacity="0.22" />
      )}
    </Svg>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// ACTION ICONS — 6 interactions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * AddIcon — ring with cross extending beyond boundary
 * The cross exceeds the circle = new structure being created outside existing limits
 */
export function AddIcon({ size = 24, active, color }: IconProps) {
  const c = s(active, color)
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="7" stroke={c} strokeWidth="1.5" fill="none" />
      <Line x1="12" y1="1" x2="12" y2="23" stroke={c} strokeWidth="1.2" strokeLinecap="round" />
      <Line x1="1" y1="12" x2="23" y2="12" stroke={c} strokeWidth="1.2" strokeLinecap="round" />
    </Svg>
  )
}

/**
 * SettingsIcon — three concentric broken rings, gap at different positions
 * Each ring independently adjustable — like a combination lock mechanism
 */
export function SettingsIcon({ size = 24, active, color }: IconProps) {
  const c = s(active, color)
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M16 12 A4 4 0 1 1 12 16" stroke={c} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <Path d="M6 12 A6 6 0 1 1 9 17.2" stroke={c} strokeWidth="1.2" fill="none" strokeLinecap="round" strokeOpacity="0.7" />
      <Path d="M3 12 A9 9 0 1 1 7.5 19.8" stroke={c} strokeWidth="0.9" fill="none" strokeLinecap="round" strokeOpacity="0.4" />
    </Svg>
  )
}

/**
 * NotificationIcon — top arc sector lit + apex dot
 * Notifications arrive from above the current view
 */
export function NotificationIcon({ size = 24, active, color }: IconProps) {
  const c = s(active, color)
  const fill = f(active)
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.2" fill="none" strokeOpacity="0.4" />
      <Path d="M7.5 5.3 A9 9 0 0 1 16.5 5.3 L12 12 Z" fill={fill} fillOpacity={active ? 0.25 : 0.08} />
      <Path d="M7.5 5.3 A9 9 0 0 1 16.5 5.3" stroke={c} strokeWidth={active ? 1.8 : 1.2} fill="none" strokeLinecap="round" />
      <Circle cx="12" cy="3" r="1.8" fill={c} fillOpacity={active ? 1 : 0.5} />
    </Svg>
  )
}

/**
 * SearchIcon — outer ring with inner floating circle + extending line
 * The space between outer and inner rings = the domain being searched
 */
export function SearchIcon({ size = 24, active, color }: IconProps) {
  const c = s(active, color)
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.2" fill="none" />
      <Circle cx="12" cy="11" r="4" stroke={c} strokeWidth="1.5" fill="none" />
      <Line x1="15" y1="14.5" x2="19" y2="19" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  )
}

/**
 * ShareIcon — ring open at right with outward arrow
 * The incomplete ring creates the exit — content escaping the boundary
 */
export function ShareIcon({ size = 24, active, color }: IconProps) {
  const c = s(active, color)
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M17.4 5.6 A9 9 0 1 0 17.4 18.4" stroke={c} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <Line x1="12" y1="12" x2="22" y2="12" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
      <Path d="M19 9 L22 12 L19 15" stroke={c} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

/**
 * EditIcon — ring with detached arc floating outside
 * One segment lifted away = the element being modified
 */
export function EditIcon({ size = 24, active, color }: IconProps) {
  const c = s(active, color)
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M16.5 5.3 A9 9 0 1 0 17.4 18.4" stroke={c} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <Path d="M16.5 2 A5 5 0 0 1 22 5.3" stroke={c} strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </Svg>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// STATE INDICATORS — 5 states
// ─────────────────────────────────────────────────────────────────────────────

/**
 * VerifiedIcon — full circle filled with curved check
 * Nothing hidden, nothing in shadow — the fully illuminated state
 */
export function VerifiedIcon({ size = 24, color }: IconProps) {
  const c = color ?? ACCENT
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.5" fill={c} fillOpacity="0.18" />
      <Path d="M7 12 Q10 16 12 14 Q15 11 18 8" stroke={c} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

/**
 * WarningIcon — one sector in amber, ring in green
 * Warning belongs to the system — structural, not external
 */
export function WarningIcon({ size = 24, color }: IconProps) {
  const c = color ?? ACCENT
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.2" fill="none" strokeOpacity="0.5" />
      <Path d="M12 12 L3 12 A9 9 0 0 1 12 3 Z" fill={WARNING} fillOpacity="0.25" />
      <Path d="M3 12 A9 9 0 0 1 12 3" stroke={WARNING} strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </Svg>
  )
}

/**
 * PhvLockedIcon — two concentric rings, inner heavier
 * Double boundary = sealed. PHV safety hard gate — cannot pass.
 */
export function PhvLockedIcon({ size = 24, color }: IconProps) {
  const c = color ?? ACCENT
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.2" fill="none" />
      <Circle cx="12" cy="12" r="5.5" stroke={c} strokeWidth="2" fill="none" />
      <Circle cx="12" cy="12" r="1.5" fill={c} fillOpacity="0.4" />
    </Svg>
  )
}

/**
 * LiveIcon — ring + pulsing inner circle + center dot
 * Three concentric elements = the live signal structure (like a radio tower)
 */
export function LiveIcon({ size = 24, active, color }: IconProps) {
  const c = s(active, color)
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.5" fill="none" />
      <Circle cx="12" cy="12" r="5.5" stroke={c} strokeWidth="0.8" fill="none" strokeOpacity="0.5" />
      <Circle cx="12" cy="12" r="2" fill={c} />
    </Svg>
  )
}

/**
 * ErrorIcon — ring with curved X inside inner circle
 * Curved X not angular — the error belongs to the circular world
 */
export function ErrorIcon({ size = 24, color }: IconProps) {
  const c = color ?? ACCENT
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.2" fill="none" strokeOpacity="0.5" />
      <Circle cx="12" cy="12" r="5.5" stroke={ERROR} strokeWidth="1.2" fill="none" />
      <Line x1="8.5" y1="8.5" x2="15.5" y2="15.5" stroke={ERROR} strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="15.5" y1="8.5" x2="8.5" y2="15.5" stroke={ERROR} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// METRIC DISPLAYS — 5 data types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * HrvIcon — ring with sine wave flowing through interior
 * HRV trace contained within the day-circle — data in context
 */
export function HrvIcon({ size = 24, active, color }: IconProps) {
  const c = s(active, color)
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.2" fill="none" />
      <Path d="M4 12 Q6.5 7.5 9 12 Q11.5 16.5 14 12 Q16.5 7.5 19 12" stroke={c} strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </Svg>
  )
}

/**
 * SleepIcon — upper semicircle filled = night, lower open = day
 * The circle is 24 hours — sleep is exactly the upper half
 */
export function SleepIcon({ size = 24, active, color }: IconProps) {
  const c = s(active, color)
  const fill = f(active)
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.2" fill="none" strokeOpacity="0.5" />
      <Path d="M3 12 A9 9 0 0 1 21 12 L3 12 Z" fill={fill} fillOpacity={active ? 0.22 : 0.08} />
      <Path d="M3 12 A9 9 0 0 1 21 12" stroke={c} strokeWidth="1.8" fill="none" />
      <Line x1="3" y1="12" x2="21" y2="12" stroke={c} strokeWidth="0.8" strokeOpacity="0.4" />
    </Svg>
  )
}

/**
 * AcwrIcon — 5-sector radar ring (week load distribution)
 * Each sector filled to different depth = load across each day
 */
export function AcwrIcon({ size = 24, active, color }: IconProps) {
  const c = s(active, color)
  const fill = f(active)
  const fo = active ? 1 : 0.5
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.2" fill="none" />
      {/* 5 sector fills representing Mon–Fri load */}
      <Path d="M12 3 L12 12 L20.6 8.9 Z" fill={fill} fillOpacity={0.12 * fo} />
      <Path d="M20.6 8.9 L12 12 L20.6 15.1 Z" fill={fill} fillOpacity={0.22 * fo} />
      <Path d="M20.6 15.1 L12 12 L12 21 Z" fill={fill} fillOpacity={0.16 * fo} />
      <Path d="M12 21 L12 12 L3.4 15.1 Z" fill={fill} fillOpacity={0.10 * fo} />
      <Path d="M3.4 15.1 L12 12 L3.4 8.9 Z" fill={fill} fillOpacity={0.08 * fo} />
      {/* Radial dividers */}
      <Line x1="12" y1="3" x2="12" y2="12" stroke={c} strokeWidth="0.6" />
      <Line x1="20.6" y1="8.9" x2="12" y2="12" stroke={c} strokeWidth="0.6" />
      <Line x1="20.6" y1="15.1" x2="12" y2="12" stroke={c} strokeWidth="0.6" />
      <Line x1="12" y1="21" x2="12" y2="12" stroke={c} strokeWidth="0.6" />
      <Line x1="3.4" y1="15.1" x2="12" y2="12" stroke={c} strokeWidth="0.6" />
    </Svg>
  )
}

/**
 * ReadinessIcon — progress ring starting at 7am position
 * Gap always slightly open — readiness is never truly 100%
 */
export function ReadinessIcon({ size = 24, active, color }: IconProps) {
  const c = s(active, color)
  const fill = f(active)
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" stroke={c} strokeWidth="0.8" fill="none" strokeOpacity="0.25" />
      <Path d="M7.5 4.2 A9 9 0 1 1 4.2 16.5" stroke={c} strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <Circle cx="12" cy="12" r="2.5" fill={fill} fillOpacity={active ? 0.35 : 0.15} />
    </Svg>
  )
}

/**
 * TrendIcon — outward-expanding spiral
 * The only icon with no fixed boundary — growth has no ceiling
 */
export function TrendIcon({ size = 24, active, color }: IconProps) {
  const c = s(active, color)
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 12 Q14 10 15 12 Q16.5 14.5 12 16 Q7 17.5 6 12 Q5 6 12 5 Q19 4 20 12 Q21 20 12 21"
        stroke={c}
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      <Circle cx="20" cy="12" r="1.5" fill={c} />
    </Svg>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// CHECK IN — daily wellness micro-survey
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CheckInIcon — person silhouette within a ring, arms open to sides
 * The athlete presenting themselves to the system for today's reading.
 * Head = inner circle (elevated) · Arms = two diagonal lines opening outward
 * Lit sector bottom-left = the wellness data flowing into the platform
 *
 * Three visual states:
 *   active={true}   — ready to check in, sector lit
 *   active={false}  — not yet done, all inactive
 *   done={true}     — completed, full fill + smile arc (pass done prop via color override)
 *
 * @usage
 *   <CheckInIcon size={24} active={true} />           // ready state
 *   <CheckInIcon size={24} active={false} />          // not yet done
 *   <CheckInIcon size={24} active={true} color={Colors.accentDark} /> // done
 */
export function CheckInIcon({ size = 24, active, color }: IconProps) {
  const c = s(active, color)
  const fill = f(active)
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* Outer ring — the day context */}
      <Circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.2" fill="none" />
      {/* Lit sector — wellness data entering the system (bottom-left) */}
      {active && (
        <Path
          d="M12 21 A9 9 0 0 1 3 12 L12 12 Z"
          fill={fill} fillOpacity="0.12"
        />
      )}
      {/* Head — the athlete */}
      <Circle
        cx="12" cy="9.5" r="2.5"
        stroke={c} strokeWidth="1.2"
        fill={fill} fillOpacity={active ? 0.18 : 0.04}
      />
      {/* Arms open outward — presenting, not closed */}
      <Line x1="8"  y1="14.5" x2="12" y2="12" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="12" y1="12"   x2="16" y2="14.5" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  )
}

/**
 * CheckInDoneIcon — completed check-in state
 * Full ring fill + head filled + smile arc = the athlete registered for today
 */
export function CheckInDoneIcon({ size = 24, color }: IconProps) {
  const c = color ?? ACCENT
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.5" fill={c} fillOpacity="0.15" />
      <Circle cx="12" cy="9.5" r="2.5" stroke={c} strokeWidth="1.2" fill={c} fillOpacity="0.4" />
      {/* Smile arc — done, the athlete is seen */}
      <Path
        d="M8 15 Q10 17.5 12 16.5 Q14 17.5 16 15"
        stroke={c} strokeWidth="1.5" fill="none" strokeLinecap="round"
      />
    </Svg>
  )
}


// ─── ICON MAP ────────────────────────────────────────────────────
// Dynamic name → component lookup (used by TomoIcon)
export const ARC_ICON_MAP: Record<string, React.FC<IconProps>> = {
  // Navigation
  home: HomeIcon,
  train: TrainIcon,
  chat: ChatIcon,
  timeline: TimelineIcon,
  profile: ProfileIcon,
  // Training types
  strength: StrengthIcon,
  speed: SpeedIcon,
  endurance: EnduranceIcon,
  flexibility: FlexibilityIcon,
  recovery: RecoveryIcon,
  // Academic
  study: StudyIcon,
  exam: ExamIcon,
  assignment: AssignmentIcon,
  balance: BalanceIcon,
  schedule: ScheduleIcon,
  // Actions
  add: AddIcon,
  settings: SettingsIcon,
  notification: NotificationIcon,
  search: SearchIcon,
  share: ShareIcon,
  edit: EditIcon,
  // States
  verified: VerifiedIcon,
  warning: WarningIcon,
  phvLocked: PhvLockedIcon,
  live: LiveIcon,
  error: ErrorIcon,
  // Metrics
  hrv: HrvIcon,
  sleep: SleepIcon,
  acwr: AcwrIcon,
  readiness: ReadinessIcon,
  trend: TrendIcon,
  // CheckIn
  checkin: CheckInIcon,
  checkinDone: CheckInDoneIcon,
};
