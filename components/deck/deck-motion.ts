"use client";

// The deck's motion system -- the sample's inline IIFE (08-deck.src.html lines
// 568-643) rebuilt as React hooks, because the strict per-request-nonce CSP
// forbids inline <script>. The MECHANICS are the sample's, unchanged: an
// IntersectionObserver reveal that adds the `.dk-in` class (threshold .14, one
// shot), rAF count-ups with the 1-(1-k)^4 ease over 1150ms, a passive scroll
// progress bar, and a dot-rail section observer (threshold .35). Every branch
// honors prefers-reduced-motion by landing on the FINAL value immediately --
// parity with the sample's `reduced` guards. Environments without
// IntersectionObserver (jsdom) settle everything to its final state at once,
// so a unit render never hangs on motion.

import { useEffect, useRef, useState } from "react";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// The reveal observer (sample `io`): observes every `.dk-rv` under the root and
// adds `.dk-in` when it enters (one-shot -- unobserved after firing, exactly
// like the sample). Class mutation, not state: re-rendering the whole deck per
// reveal would be wasted work, and the CSS transition is the animation.
export function useReveal<T extends HTMLElement>() {
  const rootRef = useRef<T | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const targets = Array.from(root.querySelectorAll<HTMLElement>(".dk-rv"));
    // No observer (jsdom / very old runtimes) or reduced motion: everything
    // lands revealed immediately -- the supplier fill widths key off `.dk-in`,
    // so the class must still be applied, not just the CSS opacity override.
    if (typeof IntersectionObserver === "undefined" || prefersReducedMotion()) {
      targets.forEach((el) => el.classList.add("dk-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("dk-in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14 }
    );
    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return rootRef;
}

// A count-up that starts when its element scrolls into view (sample countUp):
// initializes AT the final value (SSR, no-JS, reduced-motion, and jsdom all
// paint the real figure -- never a flash of 0), then, only when motion is
// allowed and the element intersects, drops to 0 and eases up along
// 1 - (1-k)^easePow over `durationMs`. The power is a parameter because the
// sample uses TWO curves: quartic (^4, 1150ms) for the general count-ups and
// cubic (^3, 900ms) for the runway numeral -- one hook, both easings.
export function useCountUpOnView(
  target: number,
  durationMs = 1150,
  threshold = 0.14,
  easePow = 4
) {
  const [value, setValue] = useState(target);
  const elRef = useRef<HTMLElement | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    const el = elRef.current;
    if (!el || ran.current) return;
    if (
      typeof IntersectionObserver === "undefined" ||
      typeof requestAnimationFrame !== "function" ||
      prefersReducedMotion() ||
      target === 0
    ) {
      // Nothing to animate; state already holds the target. Keep it in sync on
      // a later target change without a synchronous in-effect setState.
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) setValue(target);
      });
      return () => {
        cancelled = true;
      };
    }

    let frame: number | null = null;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || ran.current) return;
          ran.current = true;
          io.disconnect();
          const t0 = performance.now();
          const tick = (t: number) => {
            const k = Math.min(1, (t - t0) / durationMs);
            const eased = 1 - Math.pow(1 - k, easePow); // the sample's ease family
            setValue(Math.round(target * eased));
            if (k < 1) frame = requestAnimationFrame(tick);
          };
          frame = requestAnimationFrame((t) => {
            setValue(0);
            tick(t);
          });
        });
      },
      { threshold }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [target, durationMs, threshold, easePow]);

  return { value, elRef };
}

// The top progress thread (sample `prg`): width tracks document scroll. Direct
// style writes on a ref (no re-render per scroll frame); passive listener,
// cleaned up on unmount. Kept under reduced motion -- it is scroll-position
// feedback, not an animation (parity: the sample has no reduced branch for it).
export function useScrollProgress<T extends HTMLElement>() {
  const barRef = useRef<T | null>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar || typeof window === "undefined") return;
    const onScroll = () => {
      const h = document.documentElement;
      const denom = h.scrollHeight - h.clientHeight;
      bar.style.width = denom > 0 ? `${(h.scrollTop / denom) * 100}%` : "0%";
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return barRef;
}

// The dot-rail active section (sample `io3`): observes the hero + each slot at
// threshold .35 and reports the id currently in view. State (not class
// mutation) because the active dot is a cheap, six-element re-render.
export function useActiveSection(ids: string[]) {
  const [active, setActive] = useState<string | null>(null);
  // The ids arrive as a fresh array each render; key the effect on the joined
  // string so it re-binds only when the actual id list changes.
  const key = ids.join(",");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const sections = key
      .split(",")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { threshold: 0.35 }
    );
    sections.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [key]);

  return active;
}
