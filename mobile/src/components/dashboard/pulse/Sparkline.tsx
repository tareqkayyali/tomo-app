import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Polyline, Circle } from 'react-native-svg';

type Props = {
  values: (number | null)[];
  color: string;
  height?: number;
  width?: number;
  accessibilityElementsHidden?: boolean;
};

function coalesceSeries(raw: (number | null)[]): number[] {
  const nums = raw.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : null));
  let last: number | null = null;
  return nums.map((v) => {
    if (v != null) {
      last = v;
      return v;
    }
    return last ?? 0;
  });
}

/**
 * Normalized mini sparkline — polyline + trailing dot.
 * Fades / scales in on first paint (stroke draw illusion).
 */
export function Sparkline({
  values,
  color,
  height = 32,
  width: widthProp,
  accessibilityElementsHidden = true,
}: Props) {
  const [w, setW] = useState(widthProp ?? 120);
  const opacity = useMemo(() => new Animated.Value(0), []);
  const series = useMemo(() => coalesceSeries(values), [values]);

  useEffect(() => {
    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: 650,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: true,
    }).start();
  }, [series, opacity]);

  const layoutW = widthProp ?? w;
  const { points, lx, ly } = useMemo(() => {
    if (series.length === 0 || layoutW <= 0) return { points: '', lx: 0, ly: 0 };
    const min = Math.min(...series);
    const max = Math.max(...series);
    const span = Math.max(1e-6, max - min);
    const padX = 4;
    const padY = 4;
    const innerW = layoutW - padX * 2;
    const innerH = height - padY * 2;
    const step = series.length > 1 ? innerW / (series.length - 1) : 0;
    const pts = series
      .map((v, i) => {
        const x = padX + i * step;
        const y = padY + innerH - ((v - min) / span) * innerH;
        return `${x},${y}`;
      })
      .join(' ');
    const last = series[series.length - 1];
    const lx0 = padX + (series.length - 1) * step;
    const ly0 = padY + innerH - ((last - min) / span) * innerH;
    return { points: pts, lx: lx0, ly: ly0 };
  }, [series, layoutW, height]);

  if (!points) {
    return (
      <View
        style={{ height }}
        onLayout={widthProp ? undefined : (e) => setW(e.nativeEvent.layout.width)}
      />
    );
  }

  return (
    <View
      style={[styles.wrap, { height }]}
      onLayout={widthProp ? undefined : (e) => setW(e.nativeEvent.layout.width)}
      accessibilityElementsHidden={accessibilityElementsHidden}
    >
      <Animated.View style={{ opacity }}>
        <Svg width={layoutW} height={height}>
          <Polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Circle cx={lx} cy={ly} r={2.5} fill={color} />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
});
