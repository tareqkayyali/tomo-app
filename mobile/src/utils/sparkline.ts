/**
 * Sparkline Helpers — SVG polyline point generation.
 * No React dependencies, fully testable.
 */

/**
 * Build SVG polyline `points` string from a numeric array.
 * Returns an empty string for fewer than 2 values.
 */
export function buildSparklinePath(
  values: number[],
  width: number,
  height: number,
): string {
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 2;
  const usableH = height - pad * 2;

  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = pad + usableH - ((v - min) / range) * usableH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}
