/**
 * Player App — Timeline screen primitives.
 *
 * WeekStrip    — 7-day horizontal strip with readiness dot + today pulse.
 * DayDial      — 24h radial clock with event arcs + now pointer + readiness score.
 * FocusCard    — "Now" / "Next up" current-event card with type glyph.
 * PlanRow      — two-button planning row for Plan day + Plan week.
 */
import React, { memo } from 'react';
import { View, Text, Pressable } from 'react-native';
import Svg, { Circle, Path, Line, Defs, LinearGradient, Stop, RadialGradient, Text as SvgText, G } from 'react-native-svg';
import { useTheme } from '../../../hooks/useTheme';
import { usePulse } from '../../../hooks/usePulse';
import { ReadinessDot, TButton } from './shared';
import TomoIcon from '../TomoIcon';

// ─────────────────────────────────────────────────────────────
// WeekStrip — 7 pills, one active.
// ─────────────────────────────────────────────────────────────

export interface WeekDay {
  d: number | string;
  label: string; // Mon, Tue, …
  readiness?: 'green' | 'yellow' | 'red' | null;
  today?: boolean;
}

export interface WeekStripProps {
  days: WeekDay[];
  activeIdx: number;
  onSelect: (idx: number) => void;
}

/**
 * Grouped-pill week strip — single rounded container with 7 inset pills.
 * Matches `variant-arc.jsx` lines 40-57: cream03 bg + cream08 border, 14px
 * outer radius, inner pills 10px radius, active pill has cream08 bg.
 */
export const WeekStrip = memo(({ days, activeIdx, onSelect }: WeekStripProps) => {
  const { colors } = useTheme();
  return (
    <View style={{ paddingHorizontal: 20 }}>
      <View
        style={{
          flexDirection: 'row',
          gap: 4,
          padding: 4,
          borderRadius: 14,
          backgroundColor: colors.cream03,
          borderWidth: 1,
          borderColor: colors.cream08,
        }}
      >
        {days.map((d, i) => {
          const active = i === activeIdx;
          return (
            <Pressable
              key={`${d.label}-${d.d}`}
              onPress={() => onSelect(i)}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: active ? colors.cream08 : 'transparent',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <Text
                style={{
                  fontFamily: active ? 'Poppins_500Medium' : 'Poppins_400Regular',
                  fontSize: 12,
                  letterSpacing: 0.3,
                  color: active ? colors.tomoCream : colors.muted,
                }}
              >
                {d.label}
              </Text>
              <Text
                style={{
                  fontFamily: 'Poppins_500Medium',
                  fontSize: 17,
                  color: active ? colors.tomoCream : colors.muted,
                  lineHeight: 19,
                }}
              >
                {d.d}
              </Text>
              {d.today && !active && (
                <View
                  style={{
                    width: 3,
                    height: 3,
                    borderRadius: 999,
                    backgroundColor: colors.tomoSage,
                    marginTop: 1,
                  }}
                />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
});
WeekStrip.displayName = 'WeekStrip';

// ─────────────────────────────────────────────────────────────
// DayDial — 24-hour radial clock.
// ─────────────────────────────────────────────────────────────

export interface DialEvent {
  id: string;
  name: string;
  type: 'training' | 'match' | 'recovery' | 'study_block' | 'exam' | 'other';
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

export interface DayDialProps {
  events: DialEvent[];
  nowHour?: number; // 0..24
  score: number; // readiness 0..100
  readinessLabel: string; // "Recovered" | "Locked in" etc.
  dateText?: string; // "Wednesday, Apr 17"
  size?: number;
  onEvent?: (ev: DialEvent) => void;
}

export const DayDial = memo(({ events, nowHour = 12, score, readinessLabel, dateText, size = 320, onEvent }: DayDialProps) => {
  const { colors } = useTheme();
  const t = usePulse();
  // `size` is the dial content size. Render the Svg larger (size + 2*PAD)
  // so big hour labels can sit outside R_OUTER without getting clipped.
  // PAD = 36 leaves room for digit + "AM/PM" upper-right superscript on
  // every position without clipping at SVG edges.
  const LABEL_PAD = 36;
  const SVG = size + 2 * LABEL_PAD;
  const R_OUTER = size * 0.46;
  const R_INNER = size * 0.385;
  const R_TRACK = size * 0.42;
  const CX = SVG / 2;
  const CY = SVG / 2;

  const hourToAngle = (h: number) => (h / 24) * 360 - 90;
  const polar = (a: number, r: number) => ({
    x: CX + Math.cos((a * Math.PI) / 180) * r,
    y: CY + Math.sin((a * Math.PI) / 180) * r,
  });

  const arcPath = (startH: number, endH: number, r1: number, r2: number) => {
    const a1 = hourToAngle(startH);
    const a2 = hourToAngle(endH);
    const p1 = polar(a1, r2);
    const p2 = polar(a2, r2);
    const p3 = polar(a2, r1);
    const p4 = polar(a1, r1);
    const large = endH - startH > 12 ? 1 : 0;
    return `M${p1.x},${p1.y} A${r2},${r2} 0 ${large} 1 ${p2.x},${p2.y} L${p3.x},${p3.y} A${r1},${r1} 0 ${large} 0 ${p4.x},${p4.y} Z`;
  };

  const eventColor = (type: DialEvent['type']): string => {
    const palette: Record<DialEvent['type'], string> = {
      training: colors.evTraining,
      match: colors.evMatch,
      recovery: colors.evRecovery,
      study_block: colors.evStudy,
      exam: colors.evExam,
      other: colors.evOther,
    };
    return palette[type] || colors.evOther;
  };

  const nowAngle = hourToAngle(nowHour);
  const nowPt = polar(nowAngle, R_TRACK);
  const glow = 0.5 + 0.4 * Math.sin(t * 2.0);

  return (
    <View style={{ width: SVG, height: SVG, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={SVG} height={SVG} viewBox={`0 0 ${SVG} ${SVG}`}>
        <Defs>
          <RadialGradient id="dialCenter" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={colors.tomoSage} stopOpacity={0.18} />
            <Stop offset="100%" stopColor={colors.tomoSage} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id="ringBg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#F5F3ED" stopOpacity={0.05} />
            <Stop offset="100%" stopColor="#F5F3ED" stopOpacity={0.02} />
          </LinearGradient>
        </Defs>

        {/* Center aura */}
        <Circle cx={CX} cy={CY} r={R_INNER - 4} fill="url(#dialCenter)" />

        {/* Outer ring bg (subtle cream overlay, not overpowering) */}
        <Circle cx={CX} cy={CY} r={R_TRACK} fill="none" stroke="url(#ringBg)" strokeWidth={R_OUTER - R_INNER} />

        {/* Hour ticks */}
        {Array.from({ length: 24 }).map((_, h) => {
          const a = hourToAngle(h);
          const major = h % 3 === 0;
          const rA = polar(a, R_OUTER - 2);
          const rB = polar(a, R_OUTER - (major ? 10 : 5));
          return (
            <Line
              key={h}
              x1={rA.x}
              y1={rA.y}
              x2={rB.x}
              y2={rB.y}
              stroke={major ? colors.cream20 : colors.cream08}
              strokeWidth={major ? 1.2 : 0.8}
              strokeLinecap="round"
            />
          );
        })}

        {/* Hour labels — digit + AM/PM rendered as TWO separate SvgText
            elements with manual positioning. TSpan superscript was
            unreliable on react-native-svg (PM stacked under digit, AM
            clipped). This approach gives full control over both pieces.
            Digit anchor follows position: end on left, start on right,
            middle on top/bottom. AM/PM always sits upper-right of digit. */}
        {(() => {
          const digitAnchor = (h: number): 'start' | 'middle' | 'end' => {
            if (h === 3 || h === 6 || h === 9) return 'start';
            if (h === 15 || h === 18 || h === 21) return 'end';
            return 'middle';
          };
          // Approximate digit width per character in Poppins (factor × fontSize).
          const charW = (fs: number) => fs * 0.55;
          const renderLabel = (
            h: number,
            opts: {
              offsetR: number;
              numFontSize: number;
              numFamily: string;
              numFill: string;
              numOpacity: number;
              apFontSize: number;
              apOpacity: number;
            },
          ) => {
            const { offsetR, numFontSize, numFamily, numFill, numOpacity, apFontSize, apOpacity } = opts;
            const num = h === 0 || h === 12 ? '12' : h > 12 ? `${h - 12}` : `${h}`;
            const ap = h < 12 ? 'AM' : 'PM';
            const anchor = digitAnchor(h);
            const p = polar(hourToAngle(h), R_OUTER + offsetR);
            const numWidth = num.length * charW(numFontSize);
            // Right edge of the rendered digit (where AM/PM begins).
            const numRightEdge =
              anchor === 'start'
                ? p.x + numWidth
                : anchor === 'end'
                ? p.x
                : p.x + numWidth / 2;
            const apX = numRightEdge + 1.5; // small gap before AM/PM
            const numY = p.y + numFontSize * 0.36; // baseline tweak so glyph centers on p.y
            const apY = numY - numFontSize * 0.45; // superscript above digit baseline
            return (
              <G key={h}>
                <SvgText
                  x={p.x}
                  y={numY}
                  textAnchor={anchor}
                  fontFamily={numFamily}
                  fontSize={numFontSize}
                  fill={numFill}
                  opacity={numOpacity}
                  letterSpacing={0.4}
                >
                  {num}
                </SvgText>
                <SvgText
                  x={apX}
                  y={apY}
                  textAnchor="start"
                  fontFamily={numFamily}
                  fontSize={apFontSize}
                  fill={numFill}
                  opacity={numOpacity * apOpacity}
                  letterSpacing={0.3}
                >
                  {ap}
                </SvgText>
              </G>
            );
          };
          return (
            <>
              {/* Major positions — 12AM / 6AM / 12PM / 6PM */}
              {[0, 6, 12, 18].map((h) =>
                renderLabel(h, {
                  offsetR: 18,
                  numFontSize: 14,
                  numFamily: 'Poppins_500Medium',
                  numFill: colors.tomoCream,
                  numOpacity: 0.85,
                  apFontSize: 9,
                  apOpacity: 0.7,
                }),
              )}
              {/* Secondary 3-hour marks — smaller, muted */}
              {[3, 9, 15, 21].map((h) =>
                renderLabel(h, {
                  offsetR: 16,
                  numFontSize: 10,
                  numFamily: 'Poppins_300Light',
                  numFill: colors.muted,
                  numOpacity: 0.55,
                  apFontSize: 7,
                  apOpacity: 0.7,
                }),
              )}
            </>
          );
        })()}

        {/* Event arcs — events crossing midnight (e.g. Sleep 22:00 → 06:00)
            get their end-hour bumped by 24 so the arc sweeps through the top
            of the 24h dial instead of going backwards. */}
        {events.map((ev) => {
          const [sh, sm] = ev.startTime.split(':').map(Number);
          const [eh, em] = ev.endTime.split(':').map(Number);
          const c = eventColor(ev.type);
          const sT = sh + sm / 60;
          let eT = eh + em / 60;
          if (eT <= sT) eT += 24;
          return (
            <G key={ev.id} onPress={onEvent ? () => onEvent(ev) : undefined}>
              <Path d={arcPath(sT, eT, R_INNER, R_OUTER)} fill={c} fillOpacity={0.24} />
              <Path d={arcPath(sT, eT, R_INNER, R_OUTER)} fill="none" stroke={c} strokeWidth={1} opacity={0.55} />
            </G>
          );
        })}

        {/* Event start dots on inner ring */}
        {events.map((ev) => {
          const [sh, sm] = ev.startTime.split(':').map(Number);
          const c = eventColor(ev.type);
          const p = polar(hourToAngle(sh + sm / 60), (R_OUTER + R_INNER) / 2);
          return <Circle key={`${ev.id}-dot`} cx={p.x} cy={p.y} r={2.2} fill={c} />;
        })}

        {/* Now pointer — green glow line + pulsing sage dot */}
        {(() => {
          const inner = polar(nowAngle, R_INNER - 6);
          const outer = polar(nowAngle, R_OUTER + 6);
          return (
            <G>
              {/* Outer glow line — wide, low opacity sage */}
              <Line
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke={colors.tomoSage}
                strokeWidth={7}
                strokeLinecap="round"
                opacity={0.25 + 0.2 * glow}
              />
              {/* Mid glow line — narrower sage */}
              <Line
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke={colors.tomoSage}
                strokeWidth={3.5}
                strokeLinecap="round"
                opacity={0.6}
              />
              {/* Crisp core line — bright sage */}
              <Line
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke={colors.tomoSageDim}
                strokeWidth={1.5}
                strokeLinecap="round"
                opacity={1}
              />
              {/* Pulsing outer halo on the track */}
              <Circle cx={nowPt.x} cy={nowPt.y} r={9 + glow * 3} fill={colors.tomoSage} opacity={0.25} />
              <Circle cx={nowPt.x} cy={nowPt.y} r={5.5} fill={colors.tomoSage} />
              <Circle cx={nowPt.x} cy={nowPt.y} r={2} fill={colors.tomoCream} />
            </G>
          );
        })()}

        {/* Inner & outer edges */}
        <Circle cx={CX} cy={CY} r={R_INNER} fill="none" stroke={colors.cream10} strokeWidth={1} />
        <Circle cx={CX} cy={CY} r={R_OUTER} fill="none" stroke={colors.cream10} strokeWidth={1} />
      </Svg>

      {/* Center overlay: readiness score */}
      <View
        style={{
          position: 'absolute',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <Text
          style={{
            fontFamily: 'Poppins_400Regular',
            fontSize: 12,
            color: colors.muted,
            letterSpacing: 1,
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          Readiness
        </Text>
        <Text
          style={{
            fontFamily: 'Poppins_300Light',
            fontSize: size * 0.2,
            color: colors.tomoCream,
            letterSpacing: -2,
            lineHeight: size * 0.22,
          }}
        >
          {score}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6 }}>
          <ReadinessDot level="GREEN" size={7} pulse />
          <Text
            style={{
              fontFamily: 'Poppins_500Medium',
              fontSize: 12,
              letterSpacing: 0.5,
              color: colors.tomoSageDim,
              textTransform: 'uppercase',
            }}
          >
            {readinessLabel}
          </Text>
        </View>
        {dateText && (
          <Text
            style={{
              fontFamily: 'Poppins_400Regular',
              fontSize: 11,
              color: colors.mutedDim,
              marginTop: 10,
              letterSpacing: 0.3,
            }}
          >
            {dateText}
          </Text>
        )}
      </View>
    </View>
  );
});
DayDial.displayName = 'DayDial';

// ─────────────────────────────────────────────────────────────
// FocusCard — "Now"/"Next up" current-event card.
// ─────────────────────────────────────────────────────────────

export interface FocusCardProps {
  event: DialEvent & { note?: string };
  label: string; // "Right now" | "Next up"
  accent?: boolean;
  pulse?: boolean;
  onPress?: () => void;
}

const eventTypeIcon: Record<DialEvent['type'], string> = {
  training: 'fitness',
  match: 'target',
  recovery: 'recovery',
  study_block: 'book',
  exam: 'exam',
  other: 'more',
};

export const FocusCard = memo(({ event, label, accent, pulse, onPress }: FocusCardProps) => {
  const { colors } = useTheme();
  const t = usePulse();
  const typeColors: Record<DialEvent['type'], string> = {
    training: colors.evTraining,
    match: colors.evMatch,
    recovery: colors.evRecovery,
    study_block: colors.evStudy,
    exam: colors.evExam,
    other: colors.evOther,
  };
  const c = typeColors[event.type];

  const formatTime = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const hh = h > 12 ? h - 12 : h === 0 ? 12 : h;
    const ap = h >= 12 ? 'PM' : 'AM';
    return m === 0 ? `${hh} ${ap}` : `${hh}:${String(m).padStart(2, '0')} ${ap}`;
  };

  // Accent cards get a pulsing sage glow frame so "Right now"/"Next up" stand
  // out from the scrollable list. Pulse animation drives shadow radius +
  // border opacity subtly; on web this maps to boxShadow via RN web.
  const pulseAmt = accent ? 0.5 + 0.5 * Math.sin(t * 2.0) : 0;
  const glowShadow = accent
    ? {
        shadowColor: colors.tomoSage,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.35 + 0.25 * pulseAmt,
        shadowRadius: 10 + 6 * pulseAmt,
        elevation: 6,
      }
    : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: accent ? colors.sage08 : colors.cream03,
        borderWidth: accent ? 1.5 : 1,
        borderColor: accent ? colors.tomoSage : colors.cream10,
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        transform: [{ translateY: pressed ? -1 : 0 }],
        ...(glowShadow ?? {}),
      })}
    >
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 12,
          backgroundColor: c + '22',
          borderWidth: 1,
          borderColor: c + '55',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <TomoIcon name={eventTypeIcon[event.type]} size={18} color={c} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <Text
            style={{
              fontFamily: 'Poppins_500Medium',
              fontSize: 9,
              letterSpacing: 0.5,
              color: accent ? colors.tomoSageDim : colors.muted,
              textTransform: 'uppercase',
            }}
          >
            {label}
          </Text>
          {pulse && <ReadinessDot level="GREEN" size={5} pulse />}
        </View>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: 'Poppins_500Medium',
            fontSize: 14,
            color: colors.tomoCream,
            letterSpacing: -0.2,
          }}
        >
          {event.name}
        </Text>
        <Text
          style={{
            fontFamily: 'Poppins_300Light',
            fontSize: 10.5,
            color: colors.muted,
            marginTop: 1,
          }}
        >
          {formatTime(event.startTime)} – {formatTime(event.endTime)}
          {event.note ? ` · ${event.note}` : ''}
        </Text>
      </View>
      <TomoIcon name="Chevron-right" size={14} color={colors.muted} />
    </Pressable>
  );
});
FocusCard.displayName = 'FocusCard';

// ─────────────────────────────────────────────────────────────
// PlanRow — two-button planning row: Plan day / Plan week
// ─────────────────────────────────────────────────────────────

export interface PlanRowProps {
  onPlanDay?: () => void;
  onPlanWeek?: () => void;
  planDayLabel?: string;
  planWeekLabel?: string;
}

export const PlanRow = memo(({ onPlanDay, onPlanWeek, planDayLabel = 'Plan day', planWeekLabel = 'Plan week' }: PlanRowProps) => {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
      <TButton kind="sage" full onPress={onPlanDay} icon={<TomoIcon name="clock" size={14} color={colors.tomoSageDim} />}>
        {planDayLabel}
      </TButton>
      <TButton kind="ghost" full onPress={onPlanWeek} icon={<TomoIcon name="clock" size={14} color={colors.tomoCream} />}>
        {planWeekLabel}
      </TButton>
    </View>
  );
});
PlanRow.displayName = 'PlanRow';
