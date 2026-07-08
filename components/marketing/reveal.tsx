"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// "off" is the post-mount pre-reveal state. It must NOT be named "hidden":
// that collides with Tailwind's global `.hidden{display:none}` utility, which
// would remove the element from layout and make it unobservable by
// IntersectionObserver (so it could never reveal). See landing.css `.mv-reveal.off`.
type Phase = "rest" | "off" | "in";

/** Shared scroll-reveal wrapper (spec §8). Server/first paint = visible ("rest").
 *  Only after mount, and only when motion is allowed + IO exists, does it hide
 *  then reveal on intersection. No matchMedia/IO during render (hydration parity). */
export function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("rest");

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof IntersectionObserver === "undefined") return; // stay visible
    // One-time, client-only seed of the hide->reveal animation. SSR/first paint
    // stays "rest" (visible) for hydration parity; this cannot run during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase("off");
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setPhase("in");
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className={cn("mv-reveal", phase !== "rest" && phase, className)}>
      {children}
    </div>
  );
}
