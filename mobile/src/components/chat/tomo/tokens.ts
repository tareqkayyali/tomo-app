/**
 * Tomo AI Chat — design tokens
 *
 * Ported from `tomo-ai-chat.jsx` reference. Values mirror the
 * JSX reference exactly; palette maps 1:1 onto Tomo's existing
 * Kon/Kinari/Moegi theme (ink/cream/sage).
 */

import { fontFamily } from '../../../theme/typography';

export const T = {
  // Palette
  ink: '#12141F',
  surface: '#12141F',
  surface2: '#161826',
  cream: '#F5F3ED',
  cream90: 'rgba(245,243,237,0.90)',
  cream70: 'rgba(245,243,237,0.70)',
  cream55: 'rgba(245,243,237,0.55)',
  cream40: 'rgba(245,243,237,0.40)',
  cream25: 'rgba(245,243,237,0.25)',
  cream15: 'rgba(245,243,237,0.15)',
  cream10: 'rgba(245,243,237,0.10)',
  cream08: 'rgba(245,243,237,0.08)',
  cream06: 'rgba(245,243,237,0.06)',
  cream04: 'rgba(245,243,237,0.04)',
  cream03: 'rgba(245,243,237,0.03)',

  sage: '#7A9B76',
  sageLight: '#9AB896',
  sage30: 'rgba(154,184,150,0.30)',
  sage12: 'rgba(154,184,150,0.12)',
  sage08: 'rgba(154,184,150,0.08)',

  warm: '#C8A27A',
  red: '#D45B4A',
  red10: 'rgba(212,91,74,0.10)',

  // Fonts (Poppins — loaded in App.tsx)
  fontLight: fontFamily.light,
  fontRegular: fontFamily.regular,
  fontMedium: fontFamily.medium,
  fontSemiBold: fontFamily.semiBold,
} as const;

export type TierKind = 'alert' | 'ontrack' | 'elite';

export const TIER_LABEL: Record<TierKind, string> = {
  alert: 'Needs work',
  ontrack: 'On track',
  elite: 'Elite',
};

export const tierColor = (t: TierKind | undefined): string => {
  if (t === 'alert') return T.red;
  if (t === 'elite') return T.sageLight;
  return T.cream55;
};
