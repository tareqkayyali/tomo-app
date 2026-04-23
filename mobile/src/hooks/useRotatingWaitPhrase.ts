import { useState, useEffect, useRef } from 'react';

function pickIndexExcluding(length: number, exclude: number): number {
  if (length <= 1) return 0;
  let n = Math.floor(Math.random() * length);
  let guard = 0;
  while (n === exclude && guard++ < 16) {
    n = Math.floor(Math.random() * length);
  }
  return n;
}

/**
 * Cycles through `phrases` on a randomized interval while `active` is true.
 * Picks a new random line each tick, avoiding an immediate repeat when possible.
 */
export function useRotatingWaitPhrase(
  phrases: readonly string[],
  active: boolean,
  minDelayMs = 2000,
  maxDelayMs = 3600,
): string {
  const [index, setIndex] = useState(() =>
    phrases.length ? Math.floor(Math.random() * phrases.length) : 0,
  );
  const indexRef = useRef(index);
  indexRef.current = index;

  useEffect(() => {
    if (!active || phrases.length === 0) return;

    setIndex(pickIndexExcluding(phrases.length, indexRef.current));

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const scheduleNext = () => {
      const delay = minDelayMs + Math.random() * (maxDelayMs - minDelayMs);
      timeoutId = setTimeout(() => {
        if (cancelled) return;
        setIndex((prev) => pickIndexExcluding(phrases.length, prev));
        scheduleNext();
      }, delay);
    };

    scheduleNext();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [active, phrases, minDelayMs, maxDelayMs]);

  return phrases[index] ?? phrases[0] ?? '…';
}
