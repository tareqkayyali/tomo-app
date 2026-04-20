/**
 * usePulse — continuous seconds timer driving pulse / breathing animations.
 *
 * Returns a numeric `t` (seconds since mount) that updates each animation
 * frame. Consumers transform it into a scale, opacity, or color via a
 * trig function, e.g. `scale = 1 + Math.sin(t * 1.4) * 0.04`.
 *
 * Caution: this causes a re-render every frame. Use sparingly — only for
 * small components where the whole subtree should repaint (e.g. ChatOrb,
 * a readiness pulse dot). For anything else, prefer react-native-svg's
 * built-in animation or a shared Animated.Value.
 */
import { useEffect, useState } from 'react';

export function usePulse(): number {
  const [t, setT] = useState(0);

  useEffect(() => {
    let raf: number | null = null;
    const start = performance.now();
    const tick = () => {
      setT((performance.now() - start) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, []);

  return t;
}
