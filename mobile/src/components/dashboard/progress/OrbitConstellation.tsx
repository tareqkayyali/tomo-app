/**
 * OrbitConstellation — Signal · Progress visualisation.
 *
 * Renders up to 6 metrics as cream-coloured dots orbiting a central compass.
 * Geometry follows the Signal · Orbit spec:
 *   • 390×520 canvas, centre at (195, 244).
 *   • Orbit radii (tight, close-packed): [60, 82, 104, 126, 150, 172].
 *   • Angles are hand-placed (not evenly distributed) for rhythm and to
 *     keep chips + labels clear of the header, legend, and compass.
 *   • Dot SIZE encodes "how close to personal best" (now / best, 10–34px,
 *     normalised across the 6 metrics so different units compare fairly).
 *   • Delta CHIP encodes direction of change (better = sage, worse = clay),
 *     placed adaptively right/left depending on viewport clearance.
 *   • Ranking: metrics are sorted by |delta| descending — the biggest mover
 *     gets orbit 0 (closest to the compass), smallest gets orbit 5.
 *   • Leader lines + dashed orbit rings radiate from the compass so the
 *     compass reads as the baseline origin.
 *
 * Nothing leaves the 390-wide frame: the outermost dot's label + chip must
 * fit within `W/2` of centre, which is why outer orbits stay tight.
 *
 * The component is render-only — it takes the resolved metric payload from
 * `useProgressMetrics` and never fetches anything itself.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Line,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { fontFamily } from '../../../theme/typography';
import type { ProgressMetric } from '../../../hooks/useProgressMetrics';

// ─── Canvas geometry ─────────────────────────────────────────────────
const W = 390;
const H = 520;
const CX = W / 2; // 195
const CY = 244;

const ORBITS = [60, 82, 104, 126, 150, 172];
const ANGLES = [
  -Math.PI * 0.58,
  -Math.PI * 0.18,
   Math.PI * 0.22,
   Math.PI * 0.68,
  -Math.PI * 1.22,
  -Math.PI * 0.88,
];

// ─── Palette ─────────────────────────────────────────────────────────
const CREAM = '#F5F3ED';
const SAGE = '#7A9B76';

const BETTER_TEXT = '#9AB896';
const BETTER_BG = 'rgba(154,184,150,0.12)';
const BETTER_BORDER = 'rgba(154,184,150,0.35)';

const WORSE_TEXT = '#D9604A';
const WORSE_BG = 'rgba(217,96,74,0.14)';
const WORSE_BORDER = 'rgba(217,96,74,0.38)';

const NEUTRAL_TEXT = 'rgba(245,243,237,0.6)';
const NEUTRAL_BG = 'rgba(245,243,237,0.06)';
const NEUTRAL_BORDER = 'rgba(245,243,237,0.12)';

// ─── Chip layout constants ───────────────────────────────────────────
const CHIP_W = 62;
const CHIP_H = 22;

export interface OrbitConstellationProps {
  metrics: ProgressMetric[];
  windowDays: number;
}

interface PreparedMetric {
  key: string;
  label: string;
  valueText: string;
  unit: string;
  deltaPct: number | null;
  /** true = moved in athlete's favour, false = against, null = neutral/no delta. */
  positive: boolean | null;
  ratio: number;
}

interface PlacedMetric extends PreparedMetric {
  px: number;
  py: number;
  size: number;
  onRight: boolean;
}

function formatValue(v: number | null, unit: string): string {
  if (v == null || !isFinite(v)) return '—';
  const wantsDecimal = unit === 'h' || unit === '/10' || unit === 's';
  return wantsDecimal ? v.toFixed(1) : String(Math.round(v));
}

// "Closer to personal best" heuristic. We don't ship a personal-best field
// on ProgressMetric, so valueMax/valueMin act as the proxy bounds. If the
// metric has no bounds we fall back to 0.75 — enough ratio to render the
// dot visibly without implying a meaningful fill level.
function computeRatio(m: ProgressMetric): number {
  const latest = m.latest ?? 0;
  if (m.direction === 'lower_better') {
    const floor = m.valueMin ?? latest * 0.8;
    if (latest <= 0) return 0.75;
    return Math.max(0, Math.min(1, floor / latest));
  }
  const ceiling =
    m.valueMax ?? Math.max(latest, m.avg ?? 0, 1) * 1.2;
  if (ceiling <= 0) return 0.75;
  return Math.max(0, Math.min(1, latest / ceiling));
}

function signedBetter(pct: number, direction: ProgressMetric['direction']): boolean | null {
  if (pct === 0) return null;
  if (direction === 'higher_better') return pct > 0;
  if (direction === 'lower_better') return pct < 0;
  return null;
}

export function OrbitConstellation({ metrics, windowDays }: OrbitConstellationProps) {
  void windowDays; // kept in the API for symmetry with the header copy

  const { placed, netAvg, netBetter } = useMemo(() => {
    const ranked = metrics
      .filter((m) => m.latest != null)
      .map<PreparedMetric & { direction: ProgressMetric['direction'] }>((m) => {
        const pct = m.deltaPct ?? 0;
        return {
          key: m.key,
          label: m.displayName.toUpperCase(),
          valueText: formatValue(m.latest, m.displayUnit),
          unit: m.displayUnit,
          deltaPct: m.deltaPct,
          positive: signedBetter(pct, m.direction),
          ratio: computeRatio(m),
          direction: m.direction,
        };
      })
      .sort((a, b) => Math.abs(b.deltaPct ?? 0) - Math.abs(a.deltaPct ?? 0))
      .slice(0, 6);

    const ratios = ranked.map((r) => r.ratio);
    const minR = ratios.length ? Math.min(...ratios) : 0;
    const maxR = ratios.length ? Math.max(...ratios) : 1;
    const span = maxR - minR || 1;

    const placedList: PlacedMetric[] = ranked.map((r, i) => {
      const orbit = ORBITS[i] ?? ORBITS[ORBITS.length - 1];
      const angle = ANGLES[i] ?? ANGLES[ANGLES.length - 1];
      const px = CX + orbit * Math.cos(angle);
      const py = CY + orbit * Math.sin(angle);
      const size = 10 + ((r.ratio - minR) / span) * 24;

      // Prefer right-side chip; flip only if it would overflow.
      const labelGap = size / 2 + 10;
      const rightEdge = px + labelGap + CHIP_W;
      const leftEdge = px - labelGap - CHIP_W;
      const onRight = rightEdge <= W - 6 || leftEdge < 6;

      return {
        key: r.key,
        label: r.label,
        valueText: r.valueText,
        unit: r.unit,
        deltaPct: r.deltaPct,
        positive: r.positive,
        ratio: r.ratio,
        px,
        py,
        size,
        onRight,
      };
    });

    // Net movement — signed by per-metric direction so lower_better + negative
    // counts as a positive move. Neutral direction passes through raw delta.
    let signedSum = 0;
    let counted = 0;
    let better = 0;
    let worse = 0;
    ranked.forEach((r) => {
      const pct = r.deltaPct ?? 0;
      const signed = r.direction === 'lower_better' ? -pct : pct;
      signedSum += signed;
      counted += 1;
      if (r.positive === true) better += 1;
      else if (r.positive === false) worse += 1;
    });
    const avg = counted ? signedSum / counted : 0;

    return {
      placed: placedList,
      netAvg: avg,
      netBetter: better >= worse,
    };
  }, [metrics]);

  const netArrow = netAvg >= 0 ? '▲' : '▼';
  const netColor = netBetter ? BETTER_TEXT : WORSE_TEXT;
  const netMagnitude = Math.abs(netAvg).toFixed(1);

  return (
    <View style={styles.canvas}>
      {/* ── Background SVG: glow + orbit rings + leader lines + dots ── */}
      <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient
            id="sageGlow"
            cx={CX}
            cy={CY}
            rx={220}
            ry={220}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0%" stopColor={SAGE} stopOpacity="0.14" />
            <Stop offset="100%" stopColor={SAGE} stopOpacity="0" />
          </RadialGradient>
        </Defs>

        {/* Soft sage glow pool around the compass */}
        <Rect x={0} y={0} width={W} height={H} fill="url(#sageGlow)" />

        {/* Orbit rings — innermost solid, others dashed reading aids */}
        {ORBITS.map((r, i) => (
          <Circle
            key={`orbit-${i}`}
            cx={CX}
            cy={CY}
            r={r}
            stroke={i === 0 ? 'rgba(245,243,237,0.10)' : 'rgba(245,243,237,0.045)'}
            strokeWidth={1}
            strokeDasharray={i === 0 ? undefined : '2 5'}
            fill="none"
          />
        ))}

        {/* Leader lines: compass → dot, hairline cream */}
        {placed.map((d) => (
          <Line
            key={`leader-${d.key}`}
            x1={CX}
            y1={CY}
            x2={d.px}
            y2={d.py}
            stroke="rgba(245,243,237,0.05)"
            strokeWidth={0.6}
          />
        ))}

        {/* Sage halo ring around the compass (6px translucent ring) */}
        <Circle
          cx={CX}
          cy={CY}
          r={43}
          stroke="rgba(122,155,118,0.04)"
          strokeWidth={12}
          fill="none"
        />

        {/* Dot halos — soft cream bloom */}
        {placed.map((d) => (
          <Circle
            key={`halo-${d.key}`}
            cx={d.px}
            cy={d.py}
            r={d.size / 2 + 5}
            fill="rgba(245,243,237,0.07)"
          />
        ))}

        {/* Dots — solid cream, no border */}
        {placed.map((d) => (
          <Circle
            key={`dot-${d.key}`}
            cx={d.px}
            cy={d.py}
            r={d.size / 2}
            fill={CREAM}
          />
        ))}
      </Svg>

      {/* ── Central compass ────────────────────────────────────────── */}
      <View
        pointerEvents="none"
        style={[styles.compass, { left: CX - 37, top: CY - 37 }]}
      >
        <Text style={styles.compassCaption}>7-DAY</Text>
        <Text style={styles.compassCaption}>BASELINE</Text>
        <View style={styles.compassRule} />
        <Text style={[styles.compassDelta, { color: netColor }]}>
          {netArrow} {netMagnitude}%
        </Text>
      </View>

      {/* ── Labels, values, delta chips ────────────────────────────── */}
      {placed.map((d) => {
        const labelGap = d.size / 2 + 10;
        const chipLeft = d.onRight
          ? d.px + labelGap
          : d.px - labelGap - CHIP_W;

        const chipStyle =
          d.positive === true
            ? { bg: BETTER_BG, border: BETTER_BORDER, text: BETTER_TEXT, arrow: '▲' }
            : d.positive === false
            ? { bg: WORSE_BG, border: WORSE_BORDER, text: WORSE_TEXT, arrow: '▼' }
            : { bg: NEUTRAL_BG, border: NEUTRAL_BORDER, text: NEUTRAL_TEXT, arrow: '—' };

        const pct = d.deltaPct == null ? null : Math.round(d.deltaPct);
        const sign = pct == null ? '' : pct > 0 ? '+' : '';
        const chipLabel =
          pct == null ? '—' : `${chipStyle.arrow} ${sign}${pct}%`;

        return (
          <React.Fragment key={`anno-${d.key}`}>
            {/* Label (18px above the dot) */}
            <View
              pointerEvents="none"
              style={[
                styles.labelWrap,
                { left: d.px - 70, top: d.py - d.size / 2 - 18 - 12 },
              ]}
            >
              <Text numberOfLines={1} style={styles.label}>
                {d.label}
              </Text>
            </View>

            {/* Value + unit (6px below the dot) */}
            <View
              pointerEvents="none"
              style={[
                styles.valueWrap,
                { left: d.px - 70, top: d.py + d.size / 2 + 6 },
              ]}
            >
              <Text numberOfLines={1} style={styles.value}>
                {d.valueText}
                <Text style={styles.unit}>{d.unit ? ` ${d.unit}` : ''}</Text>
              </Text>
            </View>

            {/* Delta chip */}
            <View
              pointerEvents="none"
              style={[
                styles.chip,
                {
                  left: chipLeft,
                  top: d.py - CHIP_H / 2,
                  backgroundColor: chipStyle.bg,
                  borderColor: chipStyle.border,
                },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[styles.chipText, { color: chipStyle.text }]}
              >
                {chipLabel}
              </Text>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    width: W,
    height: H,
    alignSelf: 'center',
    position: 'relative',
  },
  compass: {
    position: 'absolute',
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 1,
    borderColor: 'rgba(245,243,237,0.14)',
    backgroundColor: 'rgba(245,243,237,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: SAGE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  compassCaption: {
    fontFamily: fontFamily.medium,
    fontSize: 8,
    letterSpacing: 1.2,
    color: 'rgba(245,243,237,0.55)',
    lineHeight: 10,
  },
  compassRule: {
    width: 18,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(245,243,237,0.2)',
    marginVertical: 4,
  },
  compassDelta: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 0.2,
  },
  labelWrap: {
    position: 'absolute',
    width: 140,
    alignItems: 'center',
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 1.3,
    color: 'rgba(245,243,237,0.7)',
  },
  valueWrap: {
    position: 'absolute',
    width: 140,
    alignItems: 'center',
  },
  value: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    letterSpacing: -0.2,
    color: CREAM,
  },
  unit: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    color: 'rgba(245,243,237,0.5)',
  },
  chip: {
    position: 'absolute',
    width: CHIP_W,
    height: CHIP_H,
    borderRadius: CHIP_H / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    letterSpacing: 0.3,
  },
});
