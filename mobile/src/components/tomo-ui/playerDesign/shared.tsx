/**
 * Player App — Shared primitives
 *
 * Matches the visual language in /tmp/kyrai-design/tomo/project/primitives.jsx
 * and data.jsx, ported to React Native. All components use the Bond theme
 * tokens (colors.ts Phase 5 additions: sage08/12/15/30, cream03-20, etc.).
 */
import React, { memo } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  ViewStyle,
  StyleProp,
  Animated,
  Easing,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../../hooks/useTheme';
import { usePulse } from '../../../hooks/usePulse';
import Bond from '../Bond';

// ─────────────────────────────────────────────────────────────
// SectionLabel — 9pt all-caps, +2 tracking, 35% cream.
// Used above most content groups in Signal/Mastery/Own It.
// ─────────────────────────────────────────────────────────────

export const SectionLabel = memo(({ children }: { children: React.ReactNode }) => {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        fontFamily: 'Poppins_500Medium',
        fontSize: 9,
        letterSpacing: 2,
        color: 'rgba(245,243,237,0.35)',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </Text>
  );
});
SectionLabel.displayName = 'SectionLabel';

// ─────────────────────────────────────────────────────────────
// SectionHeader — title + optional value/hint/action on baseline row.
// Used for grouping rhythm in Output, Mastery, Own It.
// ─────────────────────────────────────────────────────────────

export interface SectionHeaderProps {
  title: string;
  value?: string;
  hint?: string;
  action?: string;
  onAction?: () => void;
}

export const SectionHeader = memo(({ title, value, hint, action, onAction }: SectionHeaderProps) => {
  const { colors } = useTheme();
  return (
    <View style={styles.headerRow}>
      <View style={styles.headerLeft}>
        <Text
          style={{
            fontFamily: 'Poppins_500Medium',
            fontSize: 13,
            color: colors.tomoCream,
            letterSpacing: -0.2,
          }}
        >
          {title}
        </Text>
        {value && (
          <Text
            style={{
              fontFamily: 'Poppins_400Regular',
              fontSize: 10,
              color: colors.muted,
              letterSpacing: 0.2,
              marginLeft: 8,
            }}
          >
            {value}
          </Text>
        )}
        {hint && (
          <View
            style={{
              marginLeft: 8,
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 999,
              backgroundColor: colors.sage15,
              borderWidth: 1,
              borderColor: colors.sage30,
            }}
          >
            <Text
              style={{
                fontFamily: 'Poppins_500Medium',
                fontSize: 9,
                letterSpacing: 0.4,
                color: colors.tomoSageDim,
                textTransform: 'uppercase',
              }}
            >
              {hint}
            </Text>
          </View>
        )}
      </View>
      {action && (
        <Pressable onPress={onAction}>
          <Text
            style={{
              fontFamily: 'Poppins_500Medium',
              fontSize: 10,
              color: colors.tomoSageDim,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
            }}
          >
            {action} →
          </Text>
        </Pressable>
      )}
    </View>
  );
});
SectionHeader.displayName = 'SectionHeader';

// ─────────────────────────────────────────────────────────────
// UnderlineTabs — segmented horizontal tab row with a sage underline.
// Used for Signal sub-tabs (Dashboard / Programs / Metrics / Progress).
// ─────────────────────────────────────────────────────────────

export interface UnderlineTabsProps {
  tabs: { key: string; label: string }[];
  active: string;
  onChange: (key: string) => void;
}

export const UnderlineTabs = memo(({ tabs, active, onChange }: UnderlineTabsProps) => {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: colors.cream08,
        paddingHorizontal: 16,
        marginBottom: 4,
      }}
    >
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            style={{
              flex: 1,
              paddingVertical: 12,
              paddingHorizontal: 4,
              borderBottomWidth: 2,
              borderBottomColor: on ? colors.tomoSage : 'transparent',
              marginBottom: -1,
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                fontFamily: on ? 'Poppins_600SemiBold' : 'Poppins_400Regular',
                fontSize: 11.5,
                color: on ? colors.tomoCream : colors.muted,
                letterSpacing: -0.1,
              }}
            >
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
});
UnderlineTabs.displayName = 'UnderlineTabs';

// ─────────────────────────────────────────────────────────────
// ReadinessDot — colored dot with optional pulse glow.
// Green / Yellow / Red mapped to sage / clay / terracotta.
// ─────────────────────────────────────────────────────────────

export interface ReadinessDotProps {
  level?: 'GREEN' | 'YELLOW' | 'RED' | 'green' | 'yellow' | 'red' | null | undefined;
  size?: number;
  pulse?: boolean;
}

export const ReadinessDot = memo(({ level, size = 8, pulse = false }: ReadinessDotProps) => {
  const { colors } = useTheme();
  const t = usePulse();
  const color =
    level === 'GREEN' || level === 'green'
      ? colors.tomoSage
      : level === 'YELLOW' || level === 'yellow'
      ? colors.tomoClay
      : level === 'RED' || level === 'red'
      ? '#B08A7A'
      : colors.cream15;
  const scale = pulse ? 1 + Math.sin(t * 1.8) * 0.15 : 1;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        backgroundColor: color,
        transform: [{ scale }],
        shadowColor: pulse ? color : 'transparent',
        shadowOpacity: pulse ? 0.8 : 0,
        shadowRadius: pulse ? size * 1.5 : 0,
        shadowOffset: { width: 0, height: 0 },
      }}
    />
  );
});
ReadinessDot.displayName = 'ReadinessDot';

// ─────────────────────────────────────────────────────────────
// PageTitle — large page heading stacked above a small muted caption.
// Used atop Output, Own It, Mastery, Signal.
// ─────────────────────────────────────────────────────────────

export interface PageTitleProps {
  label: string;
  title: string;
  caption?: string;
}

export const PageTitle = memo(({ label, title, caption }: PageTitleProps) => {
  const { colors } = useTheme();
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16 }}>
      <Text
        style={{
          fontFamily: 'Poppins_500Medium',
          fontSize: 10,
          letterSpacing: 0.8,
          color: colors.muted,
          textTransform: 'uppercase',
          marginBottom: 4,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: 'Poppins_600SemiBold',
          fontSize: 24,
          color: colors.tomoCream,
          letterSpacing: -0.5,
          lineHeight: 26,
        }}
      >
        {title}
      </Text>
      {caption && (
        <Text
          style={{
            fontFamily: 'Poppins_400Regular',
            fontSize: 11,
            color: colors.muted,
            marginTop: 4,
          }}
        >
          {caption}
        </Text>
      )}
    </View>
  );
});
PageTitle.displayName = 'PageTitle';

// ─────────────────────────────────────────────────────────────
// TomoHeader — shared top bar with Bond mark + greeting + icons.
// Replaces the "T" avatar in the design with the Bond two-circle mark.
// ─────────────────────────────────────────────────────────────

export interface TomoHeaderProps {
  greeting?: string;
  name: string;
  subtitle?: string;
  /** Single-letter monogram. Falls back to Bond mark when absent. */
  initial?: string;
  /** Optional avatar photo URL. Takes priority over `initial`. */
  photoUrl?: string | null;
  onBell?: () => void;
  onMenu?: () => void;
  onAvatar?: () => void;
}

export const TomoHeader = memo(
  ({ greeting = 'Hey', name, subtitle, initial, photoUrl, onBell, onMenu, onAvatar }: TomoHeaderProps) => {
    const { colors } = useTheme();
    const avatar = (
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 999,
          backgroundColor: initial || photoUrl ? colors.sage15 : colors.cream03,
          borderWidth: 1,
          borderColor: initial || photoUrl ? colors.sage30 : colors.cream10,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={{ width: 40, height: 40 }} />
        ) : initial ? (
          <Text
            style={{
              fontFamily: 'Poppins_600SemiBold',
              fontSize: 15,
              color: colors.tomoSageDim,
              letterSpacing: 0.2,
            }}
          >
            {initial}
          </Text>
        ) : (
          <Bond size={22} color={colors.tomoSage} />
        )}
      </View>
    );
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingTop: 10,
          paddingBottom: 8,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          {onAvatar ? <Pressable onPress={onAvatar}>{avatar}</Pressable> : avatar}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: 'Poppins_600SemiBold',
                fontSize: 15,
                color: colors.tomoCream,
                letterSpacing: -0.2,
                lineHeight: 18,
              }}
            >
              {greeting} {name}
            </Text>
            {subtitle && (
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: 'Poppins_400Regular',
                  fontSize: 11,
                  color: colors.muted,
                  marginTop: 1,
                  letterSpacing: 0.2,
                }}
              >
                {subtitle}
              </Text>
            )}
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginLeft: 8 }}>
          <IconBtn onPress={onBell}>
            <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
              <Path
                d="M4 6.5a4 4 0 1 1 8 0V10l1 1.5H3L4 10V6.5Z"
                stroke={colors.tomoCream}
                strokeWidth={1.3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Path
                d="M6.5 13a1.5 1.5 0 0 0 3 0"
                stroke={colors.tomoCream}
                strokeWidth={1.3}
                strokeLinecap="round"
              />
            </Svg>
          </IconBtn>
          <IconBtn onPress={onMenu}>
            <View style={{ flexDirection: 'column', gap: 2.5, alignItems: 'center' }}>
              <View style={{ width: 3, height: 3, borderRadius: 999, backgroundColor: colors.tomoCream }} />
              <View style={{ width: 3, height: 3, borderRadius: 999, backgroundColor: colors.tomoCream }} />
              <View style={{ width: 3, height: 3, borderRadius: 999, backgroundColor: colors.tomoCream }} />
            </View>
          </IconBtn>
        </View>
      </View>
    );
  },
);
TomoHeader.displayName = 'TomoHeader';

export interface IconBtnProps {
  children: React.ReactNode;
  onPress?: () => void;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const IconBtn = memo(({ children, onPress, active, style }: IconBtnProps) => {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: 36,
          height: 36,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: active ? colors.sage30 : colors.cream10,
          backgroundColor: active ? colors.sage12 : pressed ? colors.cream06 : colors.cream03,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
});
IconBtn.displayName = 'IconBtn';

// ─────────────────────────────────────────────────────────────
// TCard — signature translucent card.
// cream03 bg + cream10 border, 12px radius, 16px padding.
// ─────────────────────────────────────────────────────────────

export interface TCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: 'sage' | 'warm' | 'blue';
  onPress?: () => void;
}

export const TCard = memo(({ children, style, tone, onPress }: TCardProps) => {
  const { colors } = useTheme();
  const toneStyles: Record<string, ViewStyle> = {
    sage: { backgroundColor: colors.sage08, borderColor: colors.sage30 },
    warm: { backgroundColor: 'rgba(200,162,122,0.06)', borderColor: 'rgba(200,162,122,0.20)' },
    blue: { backgroundColor: 'rgba(138,155,176,0.05)', borderColor: 'rgba(138,155,176,0.18)' },
  };
  const baseStyle: ViewStyle = {
    backgroundColor: colors.cream03,
    borderWidth: 1,
    borderColor: colors.cream10,
    borderRadius: 12,
    padding: 16,
    ...(tone ? toneStyles[tone] : {}),
  };
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={[baseStyle, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[baseStyle, style]}>{children}</View>;
});
TCard.displayName = 'TCard';

// ─────────────────────────────────────────────────────────────
// TButton — sage/ghost/subtle/primary.
// Height 44, radius 12, press shrinks to 0.97.
// ─────────────────────────────────────────────────────────────

export type TButtonKind = 'primary' | 'ghost' | 'subtle' | 'sage';

export interface TButtonProps {
  children: React.ReactNode;
  kind?: TButtonKind;
  onPress?: () => void;
  full?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  height?: number;
}

export const TButton = memo(({ children, kind = 'primary', onPress, full, icon, style, height = 44 }: TButtonProps) => {
  const { colors } = useTheme();
  const palette: Record<TButtonKind, { bg: string; fg: string; border?: string }> = {
    primary: { bg: colors.tomoSage, fg: colors.tomoCream },
    ghost: { bg: colors.cream06, fg: colors.tomoCream, border: colors.cream10 },
    subtle: { bg: 'transparent', fg: colors.muted, border: colors.cream08 },
    sage: { bg: colors.sage15, fg: colors.tomoSageDim, border: colors.sage30 },
  };
  const { bg, fg, border } = palette[kind];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          height,
          borderRadius: 12,
          paddingHorizontal: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          width: full ? '100%' : undefined,
          flex: full ? 1 : undefined,
          backgroundColor: bg,
          borderWidth: border ? 1 : 0,
          borderColor: border,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
        style,
      ]}
    >
      {icon}
      <Text
        style={{
          fontFamily: 'Poppins_500Medium',
          fontSize: 13,
          color: fg,
          letterSpacing: 0.2,
        }}
      >
        {children as string}
      </Text>
    </Pressable>
  );
});
TButton.displayName = 'TButton';

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
});
