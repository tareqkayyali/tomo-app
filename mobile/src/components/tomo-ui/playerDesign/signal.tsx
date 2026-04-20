/**
 * Player App — Signal / Output / Mastery / Own It primitives.
 *
 * VitalCard       — 2x2 grid card w/ title, value, delta badge, sparkline.
 * MiniSpark       — 20-unit-high gradient sparkline.
 * LoadBar         — single day load bar in the weekly chart.
 * ProgramRow      — active-program row w/ progress bar + left accent.
 * ArchetypeBadge  — gradient chip with 2-letter initials (e.g. "Ph").
 * StatTile        — streak/points stat tile (with optional flame icon).
 * DNARadar        — 6-pillar radar chart.
 * JourneyRow      — unlockable achievement row with emoji/icon + progress.
 * RecCard         — urgency-colored recommendation card.
 * MiniRec         — row with circular progress ring for weekly goals.
 * DailyRecCard    — collapsible daily recommendation card (Signal Dashboard).
 * UpNextRow       — upcoming-event row with time + type pill.
 * AthleteModeHero — top hero card in Signal Dashboard.
 */
import React, { memo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, {
  Circle,
  Path,
  Rect,
  Line,
  G,
  Text as SvgText,
  Defs,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import { useTheme } from '../../../hooks/useTheme';
import { usePulse } from '../../../hooks/usePulse';
import { SectionLabel } from './shared';
import TomoIcon from '../TomoIcon';

// ─────────────────────────────────────────────────────────────
// VitalCard + MiniSpark
// ─────────────────────────────────────────────────────────────

export interface VitalCardProps {
  label: string;
  value: number | string;
  unit?: string;
  delta: number;
  trend: number[];
  onPress?: () => void;
}

export const VitalCard = memo(({ label, value, unit, delta, trend, onPress }: VitalCardProps) => {
  const { colors } = useTheme();
  const positive = delta > 0;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? colors.cream06 : colors.cream03,
        borderWidth: 1,
        borderColor: pressed ? colors.sage30 : colors.cream10,
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 12,
        transform: [{ translateY: pressed ? -1 : 0 }],
      })}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <Text
          style={{
            fontFamily: 'Poppins_500Medium',
            fontSize: 9.5,
            letterSpacing: 0.5,
            color: colors.muted,
            textTransform: 'uppercase',
          }}
        >
          {label}
        </Text>
        <View
          style={{
            paddingHorizontal: 5,
            paddingVertical: 2,
            borderRadius: 999,
            backgroundColor: positive ? colors.sage15 : 'rgba(176,138,122,0.12)',
          }}
        >
          <Text
            style={{
              fontFamily: 'Poppins_500Medium',
              fontSize: 9,
              color: positive ? colors.tomoSageDim : '#B08A7A',
            }}
          >
            {positive ? '+' : ''}
            {delta}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3, marginBottom: 8 }}>
        <Text
          style={{
            fontFamily: 'Poppins_500Medium',
            fontSize: 24,
            color: colors.tomoCream,
            letterSpacing: -0.8,
            lineHeight: 24,
          }}
        >
          {value}
        </Text>
        {unit && (
          <Text
            style={{
              fontFamily: 'Poppins_300Light',
              fontSize: 10,
              color: colors.muted,
            }}
          >
            {unit}
          </Text>
        )}
      </View>
      <MiniSpark data={trend} />
    </Pressable>
  );
});
VitalCard.displayName = 'VitalCard';

export interface MiniSparkProps {
  data: number[];
  width?: number;
  height?: number;
}

export const MiniSpark = memo(({ data, width = 130, height = 20 }: MiniSparkProps) => {
  const { colors } = useTheme();
  if (!data || data.length < 2) return <View style={{ height }} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / (max - min || 1)) * (height - 3) - 1;
    return [x, y] as const;
  });
  const d = pts.reduce((s, [x, y], i) => s + (i === 0 ? `M${x},${y}` : ` L${x},${y}`), '');
  const gradId = `spark-${data.join('-')}`;
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={colors.tomoSage} stopOpacity={0} />
          <Stop offset="1" stopColor={colors.tomoSage} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Path d={d} fill="none" stroke={`url(#${gradId})`} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2} fill={colors.tomoSage} />
    </Svg>
  );
});
MiniSpark.displayName = 'MiniSpark';

// ─────────────────────────────────────────────────────────────
// LoadBar — single day in weekly load grid.
// ─────────────────────────────────────────────────────────────

export interface LoadBarProps {
  day: string;
  load: number;
  max?: number;
  type?: 'training' | 'match' | 'recovery' | 'rest' | 'study';
}

export const LoadBar = memo(({ day, load, max = 18, type = 'training' }: LoadBarProps) => {
  const { colors } = useTheme();
  const h = Math.max((load / max) * 100, 2);
  const byType: Record<string, string> = {
    training: colors.tomoSage,
    match: colors.evMatch,
    recovery: colors.evRecovery,
    rest: colors.cream15,
    study: colors.evStudy,
  };
  const c = byType[type] || colors.tomoSage;
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 6 }}>
      <View style={{ width: '100%', height: 96, justifyContent: 'flex-end', paddingHorizontal: 2 }}>
        <View
          style={{
            width: '100%',
            height: `${h}%`,
            minHeight: 4,
            backgroundColor: c,
            borderTopLeftRadius: 4,
            borderTopRightRadius: 4,
            borderBottomLeftRadius: 2,
            borderBottomRightRadius: 2,
            opacity: type === 'rest' ? 0.4 : 0.92,
          }}
        />
      </View>
      <Text
        style={{
          fontFamily: 'Poppins_400Regular',
          fontSize: 9,
          color: colors.muted,
        }}
      >
        {day}
      </Text>
    </View>
  );
});
LoadBar.displayName = 'LoadBar';

// ─────────────────────────────────────────────────────────────
// ProgramRow
// ─────────────────────────────────────────────────────────────

export interface ProgramRowProps {
  name: string;
  week: string;
  pct: number;
  next?: string;
  color?: string;
  onPress?: () => void;
}

export const ProgramRow = memo(({ name, week, pct, next, color, onPress }: ProgramRowProps) => {
  const { colors } = useTheme();
  const c = color || colors.tomoSage;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? colors.cream06 : colors.cream03,
        borderWidth: 1,
        borderColor: pressed ? c + '55' : colors.cream10,
        borderLeftWidth: 2,
        borderLeftColor: c,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        transform: [{ translateX: pressed ? 2 : 0 }],
      })}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <Text
          style={{
            fontFamily: 'Poppins_500Medium',
            fontSize: 13,
            color: colors.tomoCream,
            letterSpacing: -0.2,
          }}
        >
          {name}
        </Text>
        <Text
          style={{
            fontFamily: 'Poppins_400Regular',
            fontSize: 9,
            color: colors.muted,
          }}
        >
          {Math.round(pct * 100)}%
        </Text>
      </View>
      <Text
        style={{
          fontFamily: 'Poppins_400Regular',
          fontSize: 10,
          color: colors.muted,
          marginBottom: 8,
        }}
      >
        {week}
        {next ? ` · ${next}` : ''}
      </Text>
      <View
        style={{
          height: 3,
          borderRadius: 999,
          backgroundColor: colors.cream08,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            height: '100%',
            width: `${Math.min(1, pct) * 100}%`,
            backgroundColor: c,
            borderRadius: 999,
          }}
        />
      </View>
    </Pressable>
  );
});
ProgramRow.displayName = 'ProgramRow';

// ─────────────────────────────────────────────────────────────
// ArchetypeBadge — 58x58 gradient block with 2-letter initials.
// ─────────────────────────────────────────────────────────────

export interface ArchetypeBadgeProps {
  initials: string;
  size?: number;
}

export const ArchetypeBadge = memo(({ initials, size = 58 }: ArchetypeBadgeProps) => {
  const { colors } = useTheme();
  const t = usePulse();
  const glow = 0.4 + Math.sin(t * 1.6) * 0.2;
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          position: 'absolute',
          inset: 0 as unknown as number,
          width: size,
          height: size,
          borderRadius: 14,
          backgroundColor: colors.tomoSage,
          shadowColor: colors.tomoSage,
          shadowOpacity: glow,
          shadowRadius: 20 * glow,
          shadowOffset: { width: 0, height: 0 },
        }}
      />
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id="arch" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.tomoSage} />
            <Stop offset="1" stopColor={colors.accentDark} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={size} height={size} rx={14} ry={14} fill="url(#arch)" />
      </Svg>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Text
          style={{
            fontFamily: 'Poppins_700Bold',
            fontSize: size * 0.45,
            color: colors.tomoCream,
          }}
        >
          {initials}
        </Text>
      </View>
    </View>
  );
});
ArchetypeBadge.displayName = 'ArchetypeBadge';

// ─────────────────────────────────────────────────────────────
// StatTile — streak / points tile
// ─────────────────────────────────────────────────────────────

export interface StatTileProps {
  label: string;
  value: string | number;
  sub: string;
  flame?: boolean;
}

export const StatTile = memo(({ label, value, sub, flame }: StatTileProps) => {
  const { colors } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.cream03,
        borderWidth: 1,
        borderColor: colors.cream10,
        borderRadius: 12,
        padding: 12,
      }}
    >
      <Text
        style={{
          fontFamily: 'Poppins_500Medium',
          fontSize: 9.5,
          letterSpacing: 0.5,
          color: colors.muted,
          textTransform: 'uppercase',
          marginBottom: 4,
        }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        {flame && <TomoIcon name="flame" size={16} color={colors.tomoClay} weight="fill" />}
        <Text
          style={{
            fontFamily: 'Poppins_500Medium',
            fontSize: 24,
            color: colors.tomoCream,
            letterSpacing: -0.6,
            lineHeight: 24,
          }}
        >
          {value}
        </Text>
      </View>
      <Text
        style={{
          fontFamily: 'Poppins_400Regular',
          fontSize: 9.5,
          color: colors.muted,
          marginTop: 4,
        }}
      >
        {sub}
      </Text>
    </View>
  );
});
StatTile.displayName = 'StatTile';

// ─────────────────────────────────────────────────────────────
// DNARadar — 6-pillar radar chart
// ─────────────────────────────────────────────────────────────

export interface Pillar {
  id: string;
  label: string;
  value: number;
  color: string;
}

export const DNARadar = memo(({ pillars, size = 220 }: { pillars: Pillar[]; size?: number }) => {
  const { colors } = useTheme();
  const CX = size / 2;
  const CY = size / 2;
  const R = size * 0.386;
  const n = pillars.length;
  const angle = (i: number) => (i / n) * 2 * Math.PI - Math.PI / 2;
  const point = (i: number, v: number) => ({
    x: CX + Math.cos(angle(i)) * R * (v / 100),
    y: CY + Math.sin(angle(i)) * R * (v / 100),
  });
  const path =
    pillars
      .map((p, i) => {
        const pt = point(i, p.value);
        return (i === 0 ? 'M' : 'L') + pt.x + ',' + pt.y;
      })
      .join(' ') + ' Z';

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* concentric polygons */}
        {[0.25, 0.5, 0.75, 1].map((scale) => {
          const d =
            pillars
              .map((_, i) => {
                const pt = {
                  x: CX + Math.cos(angle(i)) * R * scale,
                  y: CY + Math.sin(angle(i)) * R * scale,
                };
                return (i === 0 ? 'M' : 'L') + pt.x + ',' + pt.y;
              })
              .join(' ') + ' Z';
          return <Path key={scale} d={d} fill="none" stroke={colors.cream08} strokeWidth={0.8} />;
        })}
        {/* spokes */}
        {pillars.map((_, i) => {
          const pt = { x: CX + Math.cos(angle(i)) * R, y: CY + Math.sin(angle(i)) * R };
          return <Line key={i} x1={CX} y1={CY} x2={pt.x} y2={pt.y} stroke={colors.cream08} strokeWidth={0.8} />;
        })}
        {/* filled shape */}
        <Path d={path} fill={colors.tomoSage} fillOpacity={0.18} stroke={colors.tomoSage} strokeWidth={1.5} strokeLinejoin="round" />
        {/* points */}
        {pillars.map((p, i) => {
          const pt = point(i, p.value);
          return <Circle key={p.id} cx={pt.x} cy={pt.y} r={3} fill={p.color} stroke={colors.background} strokeWidth={1.5} />;
        })}
        {/* labels */}
        {pillars.map((p, i) => {
          const lp = { x: CX + Math.cos(angle(i)) * (R + 18), y: CY + Math.sin(angle(i)) * (R + 18) };
          return (
            <SvgText
              key={`${p.id}-label`}
              x={lp.x}
              y={lp.y}
              textAnchor="middle"
              fontFamily="Poppins_500Medium"
              fontSize={10}
              fontWeight="500"
              fill={colors.body}
            >
              {p.label}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
});
DNARadar.displayName = 'DNARadar';

// ─────────────────────────────────────────────────────────────
// JourneyRow — unlockable milestone row
// ─────────────────────────────────────────────────────────────

export interface JourneyRowProps {
  label: string;
  sub: string;
  pct: number;
  iconName?: string; // TomoIcon name e.g. 'trophy', 'flame', 'power'
}

export const JourneyRow = memo(({ label, sub, pct, iconName = 'star' }: JourneyRowProps) => {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        backgroundColor: colors.cream03,
        borderWidth: 1,
        borderColor: colors.cream10,
        borderRadius: 12,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          backgroundColor: colors.sage15,
          borderWidth: 1,
          borderColor: colors.sage30,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <TomoIcon name={iconName} size={18} color={colors.tomoSageDim} weight="fill" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontFamily: 'Poppins_500Medium',
            fontSize: 12.5,
            color: colors.tomoCream,
            letterSpacing: -0.2,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontFamily: 'Poppins_400Regular',
            fontSize: 10,
            color: colors.muted,
            marginTop: 2,
          }}
        >
          {sub}
        </Text>
        <View style={{ height: 2, borderRadius: 999, backgroundColor: colors.cream08, marginTop: 6, overflow: 'hidden' }}>
          <View
            style={{
              height: '100%',
              width: `${Math.min(1, pct) * 100}%`,
              backgroundColor: colors.tomoSage,
              borderRadius: 999,
            }}
          />
        </View>
      </View>
    </View>
  );
});
JourneyRow.displayName = 'JourneyRow';

// ─────────────────────────────────────────────────────────────
// RecCard — top-of-page recommendation
// ─────────────────────────────────────────────────────────────

export interface RecCardProps {
  kind: string; // "Now" | "Today" | "Tonight"
  urgency: 'high' | 'med' | 'low';
  title: string;
  body: string;
  action: string;
  time?: string;
  onAction?: () => void;
  onSnooze?: () => void;
  onWhy?: () => void;
}

export const RecCard = memo(({ kind, urgency, title, body, action, time, onAction, onSnooze, onWhy }: RecCardProps) => {
  const { colors } = useTheme();
  const urgencyColor = urgency === 'high' ? colors.tomoSage : urgency === 'med' ? colors.evMatch : colors.evStudy;
  return (
    <View
      style={{
        backgroundColor: colors.cream03,
        borderWidth: 1,
        borderColor: colors.cream10,
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 14,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              backgroundColor: urgencyColor,
              shadowColor: urgencyColor,
              shadowOpacity: 0.9,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 0 },
            }}
          />
          <Text
            style={{
              fontFamily: 'Poppins_500Medium',
              fontSize: 9,
              letterSpacing: 0.6,
              color: urgencyColor,
              textTransform: 'uppercase',
            }}
          >
            {kind}
          </Text>
        </View>
        {time && (
          <Text
            style={{
              fontFamily: 'Poppins_400Regular',
              fontSize: 10,
              color: colors.muted,
              letterSpacing: 0.2,
            }}
          >
            {time}
          </Text>
        )}
      </View>
      <Text
        style={{
          fontFamily: 'Poppins_500Medium',
          fontSize: 15,
          color: colors.tomoCream,
          letterSpacing: -0.2,
          marginBottom: 4,
          lineHeight: 19,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontFamily: 'Poppins_300Light',
          fontSize: 11.5,
          color: colors.body,
          lineHeight: 17,
          marginBottom: 12,
        }}
      >
        {body}
      </Text>
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
        <Pressable
          onPress={onAction}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 7,
            borderRadius: 10,
            backgroundColor: colors.sage15,
            borderWidth: 1,
            borderColor: colors.sage30,
          }}
        >
          <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 11, color: colors.tomoSageDim }}>{action}</Text>
        </Pressable>
        {onSnooze && (
          <Pressable
            onPress={onSnooze}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.cream08,
            }}
          >
            <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 11, color: colors.muted }}>Snooze</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }} />
        {onWhy && (
          <Pressable onPress={onWhy}>
            <Text
              style={{
                fontFamily: 'Poppins_400Regular',
                fontSize: 10,
                color: colors.muted,
                letterSpacing: 0.4,
              }}
            >
              Why? →
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
});
RecCard.displayName = 'RecCard';

// ─────────────────────────────────────────────────────────────
// MiniRec — weekly goal row with circular progress ring
// ─────────────────────────────────────────────────────────────

export interface MiniRecProps {
  label: string;
  sub: string;
  pct: number;
  onPress?: () => void;
}

export const MiniRec = memo(({ label, sub, pct, onPress }: MiniRecProps) => {
  const { colors } = useTheme();
  const r = 11;
  const c = 2 * Math.PI * r;
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: colors.cream03,
        borderWidth: 1,
        borderColor: colors.cream10,
        borderRadius: 10,
      }}
    >
      <View style={{ width: 28, height: 28 }}>
        <Svg width={28} height={28} style={{ transform: [{ rotate: '-90deg' }] }}>
          <Circle cx={14} cy={14} r={r} fill="none" stroke={colors.cream08} strokeWidth={2} />
          <Circle
            cx={14}
            cy={14}
            r={r}
            fill="none"
            stroke={colors.tomoSage}
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={c * (1 - pct)}
          />
        </Svg>
        <View style={{ position: 'absolute', inset: 0 as unknown as number, alignItems: 'center', justifyContent: 'center' }}>
          <Text
            style={{
              fontFamily: 'Poppins_500Medium',
              fontSize: 9,
              color: colors.tomoCream,
            }}
          >
            {Math.round(pct * 100)}
          </Text>
        </View>
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: 'Poppins_500Medium',
            fontSize: 12,
            color: colors.tomoCream,
            letterSpacing: -0.1,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontFamily: 'Poppins_400Regular',
            fontSize: 10,
            color: colors.muted,
            marginTop: 1,
          }}
        >
          {sub}
        </Text>
      </View>
      <TomoIcon name="Chevron-right" size={12} color={colors.muted} />
    </Pressable>
  );
});
MiniRec.displayName = 'MiniRec';

// ─────────────────────────────────────────────────────────────
// DailyRecCard — collapsible rec card for Signal Dashboard
// ─────────────────────────────────────────────────────────────

export interface DailyRecCardProps {
  type: string;
  time?: string;
  title: string;
  bodyShort: string;
  bodyLong: string;
  priority: 'high' | 'med' | 'low';
  iconName?: string;
}

export const DailyRecCard = memo(
  ({ type, time, title, bodyShort, bodyLong, priority, iconName = 'sparkle' }: DailyRecCardProps) => {
    const { colors } = useTheme();
    const [expanded, setExpanded] = useState(false);
    const urgencyColor =
      priority === 'high' ? colors.tomoSage : priority === 'med' ? colors.evMatch : colors.evStudy;
    return (
      <Pressable
        onPress={() => setExpanded((e) => !e)}
        style={{
          backgroundColor: colors.cream03,
          borderWidth: 1,
          borderColor: colors.cream10,
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              backgroundColor: urgencyColor + '26',
              borderWidth: 1,
              borderColor: urgencyColor + '55',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <TomoIcon name={iconName} size={16} color={urgencyColor} weight="fill" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
              <Text
                style={{
                  fontFamily: 'Poppins_500Medium',
                  fontSize: 8.5,
                  letterSpacing: 1.2,
                  color: urgencyColor,
                  textTransform: 'uppercase',
                }}
              >
                {type}
              </Text>
              {time && (
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 9.5, color: colors.muted }}>{time}</Text>
              )}
            </View>
            <Text
              style={{
                fontFamily: 'Poppins_500Medium',
                fontSize: 13,
                color: colors.tomoCream,
                letterSpacing: -0.2,
                lineHeight: 16,
              }}
            >
              {title}
            </Text>
          </View>
          <Text
            style={{
              color: colors.muted,
              fontSize: 10,
              transform: [{ rotate: expanded ? '90deg' : '0deg' }],
            }}
          >
            ›
          </Text>
        </View>
        <Text
          style={{
            marginTop: expanded ? 10 : 6,
            fontFamily: 'Poppins_300Light',
            fontSize: 11,
            color: colors.body,
            lineHeight: 17,
          }}
        >
          {expanded ? bodyLong : bodyShort}
        </Text>
      </Pressable>
    );
  }
);
DailyRecCard.displayName = 'DailyRecCard';

// ─────────────────────────────────────────────────────────────
// UpNextRow — upcoming events list row
// ─────────────────────────────────────────────────────────────

export interface UpNextRowProps {
  time: string;
  title: string;
  typeLabel: string;
  isNext?: boolean;
  coachNote?: string;
  intensity?: number;
}

export const UpNextRow = memo(({ time, title, typeLabel, isNext, coachNote, intensity }: UpNextRowProps) => {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: isNext ? 10 : 0,
        paddingVertical: isNext ? 12 : 11,
        marginHorizontal: isNext ? -10 : 0,
        borderRadius: isNext ? 12 : 0,
        backgroundColor: isNext ? 'rgba(245,243,237,0.025)' : 'transparent',
        borderBottomWidth: isNext ? 0 : 1,
        borderBottomColor: 'rgba(245,243,237,0.04)',
        marginBottom: isNext ? 4 : 0,
      }}
    >
      <View style={{ width: 50, paddingTop: 1 }}>
        <Text
          style={{
            fontFamily: 'Poppins_600SemiBold',
            fontSize: 11,
            color: isNext ? colors.tomoSageDim : 'rgba(245,243,237,0.4)',
          }}
        >
          {time}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <Text
            style={{
              fontFamily: 'Poppins_500Medium',
              fontSize: 13,
              color: isNext ? colors.tomoCream : 'rgba(245,243,237,0.65)',
              flex: 1,
            }}
          >
            {title}
          </Text>
          <View
            style={{
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderRadius: 6,
              backgroundColor: isNext ? colors.sage15 : 'rgba(245,243,237,0.05)',
            }}
          >
            <Text
              style={{
                fontFamily: 'Poppins_500Medium',
                fontSize: 8,
                color: isNext ? colors.tomoSageDim : 'rgba(245,243,237,0.35)',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              {typeLabel}
            </Text>
          </View>
        </View>
        {isNext && coachNote && (
          <Text
            style={{
              fontFamily: 'Poppins_400Regular',
              fontSize: 10.5,
              color: colors.tomoSageDim + 'CC',
              marginTop: 4,
              lineHeight: 15,
            }}
          >
            {coachNote}
          </Text>
        )}
        {intensity != null && (
          <Text
            style={{
              fontFamily: 'Poppins_400Regular',
              fontSize: 9.5,
              color: 'rgba(245,243,237,0.28)',
              marginTop: 2,
            }}
          >
            Intensity {intensity}/10
          </Text>
        )}
      </View>
    </View>
  );
});
UpNextRow.displayName = 'UpNextRow';

// ─────────────────────────────────────────────────────────────
// AthleteModeHero — top hero card in Signal Dashboard
// ─────────────────────────────────────────────────────────────

export interface AthleteModeHeroProps {
  modeLabel: string; // e.g. "Match Week"
  description: string;
  subtitle?: string;
  iconName?: string; // TomoIcon name
  onSwitch?: () => void;
}

export const AthleteModeHero = memo(({ modeLabel, description, subtitle, iconName = 'flame', onSwitch }: AthleteModeHeroProps) => {
  const { colors } = useTheme();
  const t = usePulse();
  const glow = 0.4 + Math.sin(t * 1.2) * 0.25;
  return (
    <View
      style={{
        backgroundColor: colors.sage15,
        borderWidth: 1,
        borderColor: colors.sage30,
        borderRadius: 20,
        padding: 16,
        overflow: 'hidden',
      }}
    >
      {/* corner halo */}
      <View
        style={{
          position: 'absolute',
          top: -30,
          right: -30,
          width: 120,
          height: 120,
          borderRadius: 999,
          backgroundColor: colors.tomoSage,
          opacity: 0.2 * glow,
        }}
      />

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <Text
          style={{
            fontFamily: 'Poppins_500Medium',
            fontSize: 9,
            letterSpacing: 1.5,
            color: colors.tomoSageDim,
            textTransform: 'uppercase',
          }}
        >
          Mode
        </Text>
        {onSwitch && (
          <Pressable
            onPress={onSwitch}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: colors.cream03,
              borderWidth: 1,
              borderColor: colors.cream10,
            }}
          >
            <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 10, color: colors.body }}>Switch</Text>
          </Pressable>
        )}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            backgroundColor: colors.sage15,
            borderWidth: 1,
            borderColor: colors.sage30,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <TomoIcon name={iconName} size={20} color={colors.tomoSageDim} weight="fill" />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: 'Poppins_600SemiBold',
              fontSize: 18,
              color: colors.tomoCream,
              letterSpacing: -0.3,
              lineHeight: 20,
            }}
          >
            {modeLabel}
          </Text>
          <Text
            style={{
              fontFamily: 'Poppins_400Regular',
              fontSize: 10.5,
              color: colors.body,
              marginTop: 3,
            }}
          >
            {description}
          </Text>
        </View>
      </View>

      {subtitle && (
        <Text
          style={{
            fontFamily: 'Poppins_400Regular',
            fontSize: 11,
            color: colors.muted,
            letterSpacing: -0.05,
          }}
        >
          {subtitle}
        </Text>
      )}
    </View>
  );
});
AthleteModeHero.displayName = 'AthleteModeHero';
