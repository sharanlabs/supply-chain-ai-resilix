"use client";

import { useEffect, useRef, useState } from "react";

// A restrained count-up for a key threat figure (e.g. the confidence %). One
// animation, ~0.9s, easeOutCubic — never a perpetual loop.
//
// Honors prefers-reduced-motion in JS (CSS cannot stop a number ticking): when
// the user opts out — or matchMedia is unavailable, as under jsdom — the value
// stays at its target and no rAF runs. SSR-safe: it renders the final value on
// the server and on first client paint, then animates only if motion is allowed,
// so there is no hydration mismatch and no flash of zero.
export function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(target);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // No-RAF environments (older runtimes, some test/SSR-ish contexts) cannot
    // animate; the value already initializes to `target`, so simply leave it at
    // the final figure — never paint 0 then jump.
    const hasRaf = typeof requestAnimationFrame === "function";

    const reduce =
      typeof window.matchMedia !== "function" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce || target === 0 || !hasRaf) {
      // State is initialized to target; nothing to animate. Keep it in sync on
      // a later target change WITHOUT a synchronous in-effect setState (the lint
      // forbids it): defer one tick via rAF when available, else a microtask.
      let cancelled = false;
      if (hasRaf) {
        frame.current = requestAnimationFrame(() => setValue(target));
      } else {
        queueMicrotask(() => {
          if (!cancelled) setValue(target);
        });
      }
      return () => {
        cancelled = true;
        if (frame.current !== null) cancelAnimationFrame(frame.current);
      };
    }

    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      setValue(Math.round(target * eased));
      if (progress < 1) {
        frame.current = requestAnimationFrame(tick);
      } else {
        setValue(target);
      }
    };
    // First frame starts the ramp from 0 -> target (an async set, not a
    // synchronous in-effect one).
    frame.current = requestAnimationFrame(() => {
      setValue(0);
      frame.current = requestAnimationFrame(tick);
    });

    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [target, durationMs]);

  return value;
}
