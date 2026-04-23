/**
 * OrbitConstellation — Signal · Progress visualisation.
 *
 * Renders up to 6 metrics as cream-coloured dots orbiting a central compass.
 * Geometry follows the Signal · Orbit spec:
 *   • 390×440 canvas, centre at (195, 210). Height tightened from the
 *     original 520 so the canvas + legend pill fit above the tab bar
 *     without a scroll.
 *   • Six orbit radii, close-packed. Angles hand-placed so each orbit
 *     lives in a distinct wedge (no two neighbours share a hemisphere).
 *   • Dot SIZE encodes progress MAGNITUDE (|progressScore|) — big
 *     improvements AND big regressions both read as large dots. Orbit
 *     placement encodes direction: positive progress → inner, negative
 *     → outer. Ranking is by
 *     `progressScore = direction === 'lower_better' ? -delta : delta`.
 *     Top 6 selected by |progressScore| desc (biggest movers — most
 *     visible); within those 6, signed score orders orbit assignment.
 *     Best mover gets orbit 0 (innermost); worst gets orbit 5 (outermost).
 *     Neutral metrics (direction = neutral) score 0 and land mid-pack.
 *   • Delta CHIP arrow + colour track SEMANTIC progress (▲ sage = better,
 *     ▼ clay = worse, — muted = neutral). The numeric portion keeps the
 *     raw signed delta so the athlete still sees the measurement
 *     direction (e.g. "▼ +100%" for soreness up — semantic-bad with
 *     raw-positive number).
 *   • Chip placement is adaptive: test both sides against viewport
 *     margin AND compass exclusion zone; flip left only when right
 *     fails.
 *   • Leader lines + dashed orbit rings radiate from the compass so the
 *     compass reads as the baseline origin.
 *
 * The component is render-only — it takes the resolved metric payload
 * from `useProgressMetrics` and never fetches anything itself.
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
const H = 440;
const CX = W / 2; // 195
const CY = 210;

// Radii — pushed outward so the innermost dot's value text (which sits
// ~20px below the dot centre) clears the compass halo (radius ~43).
const ORBITS = [92, 110, 128, 146, 160, 174];

// Hand-placed angles. Each orbit lives in a distinct wedge so dot +
// label + chip clusters don't collide. Biased away from pure horizontal
// (chips would invade the compass) and pure vertical (labels would clip
// the header / legend).
const ANGLES = [
  -Math.PI * 0.58,   //   0: upper-slightly-left (-104°)
  -Math.PI * 0.18,   //   1: upper-right         (-32°)
   Math.PI * 0.22,   //   2: lower-right         (+40°)
   Math.PI * 0.68,   //   3: lower-left          (+122°)
  -Math.PI * 1.10,   //   4: left-slightly-below (+162°)
  -Math.PI * 0.88,   //   5: upper-far-left      (-158°)
];

// Minimum viewport margin a chip must respect on its side of the dot.
const EDGE_MARGIN = 8;

// Compass exclusion zone — any chip placement that intersects this box
// is rejected in favour of the opposite side. Box is the compass circle
// plus its 6px sage halo, inflated by a small pad so chips don't kiss
// the halo edge.
const COMPASS_EXCLUSION = {
  l: CX - 46,
  r: CX + 46,
  t: CY - 46,
  b: CY + 46,
};

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
  /**
   * Signed progress score. `direction === 'lower_better' ? -delta : delta`
   * (neutral direction always scores 0). Higher = better progress. Drives
   * orbit index (signed desc) and dot size (|score| normalised).
   */
  progressScore: number;
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

// Signed progress score. Positive = athlete moved in their favour (HRV up,
// soreness down). Negative = regression. Neutral-direction metrics always
// score 0 — they live mid-pack regardless of raw delta. Null deltas are
// treated as zero so a metric with no baseline doesn't dominate ranking.
function computeProgressScore(m: ProgressMetric): number {
  const pct = m.deltaPct ?? 0;
  if (m.direction === 'higher_better') return pct;
  if (m.direction === 'lower_better') return -pct;
  return 0;
}

interface BBox { l: number; r: number; t: number; b: number }
function boxesOverlap(a: BBox, b: BBox): boolean {
  return !(a.r <= b.l || a.l >= b.r || a.b <= b.t || a.t >= b.b);
}

function signedBetter(pct: number, direction: ProgressMetric['direction']): boolean | null {
  if (pct === 0) return null;
  if (direction === 'higher_better') return pct > 0;
  if (direction === 'lower_better') return pct < 0;
  return null;
}

export function OrbitConstellation({ metrics, windowDays }: OrbitConstellationProps) {
  const { placed, netAvg, netBetter } = useMemo(() => {
    // Step 1 — candidate pool. Only metrics with actual data are eligible
    // (no-data metrics are dropped per product direction: "top 6 that has
    // data and changes").
    const withData = metrics
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
          progressScore: computeProgressScore(m),
          direction: m.direction,
        };
      });

    // Step 2 — top 6 by |progressScore| so the biggest movers are shown,
    // tiebreak by CMS sort_order so ties don't flicker between renders.
    const topMovers = [...withData]
      .map((m, i) => ({ m, i }))
      .sort((a, b) => {
        const diff = Math.abs(b.m.progressScore) - Math.abs(a.m.progressScore);
        return diff !== 0 ? diff : a.i - b.i;
      })
      .slice(0, 6)
      .map(({ m }) => m);

    // Step 3 — within the top 6, signed score places the best mover on
    // orbit 0 (inner) and the worst on orbit 5 (outer).
    const ranked = [...topMovers].sort(
      (a, b) => b.progressScore - a.progressScore,
    );

    // Size by |progressScore|: big improvements AND big regressions both
    // read as large dots. Orbit placement (inner vs outer) already
    // conveys direction — so a −100% soreness swing lands on orbit 5 AT
    // the max 34px dot, making the regression unmistakable.
    const magnitudes = ranked.map((r) => Math.abs(r.progressScore));
    const minM = magnitudes.length ? Math.min(...magnitudes) : 0;
    const maxM = magnitudes.length ? Math.max(...magnitudes) : 1;
    const spanM = maxM - minM || 1;

    const placedList: PlacedMetric[] = ranked.map((r, i) => {
      const orbit = ORBITS[i] ?? ORBITS[ORBITS.length - 1];
      const angle = ANGLES[i] ?? ANGLES[ANGLES.length - 1];
      const px = CX + orbit * Math.cos(angle);
      const py = CY + orbit * Math.sin(angle);
      const size = 10 + ((Math.abs(r.progressScore) - minM) / spanM) * 24;

      // Chip placement: test both sides against (a) viewport margin and
      // (b) compass exclusion zone. Prefer right; flip left only when
      // right fails. If both fail, default right (shouldn't occur with
      // current ORBITS / ANGLES but keeps layout robust).
      const labelGap = size / 2 + 10;
      const rightBox = {
        l: px + labelGap,
        r: px + labelGap + CHIP_W,
        t: py - CHIP_H / 2,
        b: py + CHIP_H / 2,
      };
      const leftBox = {
        l: px - labelGap - CHIP_W,
        r: px - labelGap,
        t: py - CHIP_H / 2,
        b: py + CHIP_H / 2,
      };
      const rightFits =
        rightBox.r <= W - EDGE_MARGIN && !boxesOverlap(rightBox, COMPASS_EXCLUSION);
      const leftFits =
        leftBox.l >= EDGE_MARGIN && !boxesOverlap(leftBox, COMPASS_EXCLUSION);
      const onRight = rightFits || !leftFits;

      return {
        key: r.key,
        label: r.label,
        valueText: r.valueText,
        unit: r.unit,
        deltaPct: r.deltaPct,
        positive: r.positive,
        progressScore: r.progressScore,
        px,
        py,
        size,
        onRight,
      };
    });

    // Net movement — signed per direction so lower_better + negative
    // counts as a positive move. Neutral direction passes through raw.
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

        {/* Leader lines: compass → dot */}
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

        {/* Sage halo ring around the compass */}
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
        <Text style={styles.compassCaption}>{windowDays}-DAY</Text>
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

        const pct = d.deltaPct == null ? null : Math.round(d.deltaPct);
        const arrow =
          d.positive === true ? '▲' : d.positive === false ? '▼' : '—';
        const sign = pct != null && pct > 0 ? '+' : '';
        const chipColors =
          d.positive === true
            ? { bg: BETTER_BG, border: BETTER_BORDER, text: BETTER_TEXT }
            : d.positive === false
            ? { bg: WORSE_BG, border: WORSE_BORDER, text: WORSE_TEXT }
            : { bg: NEUTRAL_BG, border: NEUTRAL_BORDER, text: NEUTRAL_TEXT };
        const chipLabel =
          pct == null ? '—' : `${arrow} ${sign}${pct}%`;

        return (
          <React.Fragment key={`anno-${d.key}`}>
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

            <View
              pointerEvents="none"
              style={[
                styles.chip,
                {
                  left: chipLeft,
                  top: d.py - CHIP_H / 2,
                  backgroundColor: chipColors.bg,
                  borderColor: chipColors.border,
                },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[styles.chipText, { color: chipColors.text }]}
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
