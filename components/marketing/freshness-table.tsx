// components/marketing/freshness-table.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { FRESHNESS_ROWS } from "@/lib/marketing/freshness-rows";
import { verifiedCitation } from "@/lib/marketing/provenance";

export function FreshnessTable() {
  const ref = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState<number[]>([]);
  // `verified` lights the provenance dot (and, for motion users, its one-shot
  // vpulse). It is applied as the on-scroll sweep reaches each row so the pulse
  // fires in view, never hardcoded at mount, which would burn it off-screen.
  const [verified, setVerified] = useState<number[]>([]);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof IntersectionObserver === "undefined") {
      // No sweep to ride: apply the end-state at once. The vpulse @keyframes is
      // gated behind prefers-reduced-motion:no-preference, so the dot is static.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVerified(FRESHNESS_ROWS.map((_, i) => i));
      return;
    }
    const el = ref.current;
    if (!el) return;
    let swept = false;
    const timers: number[] = [];
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting || swept) return;
          swept = true;
          obs.disconnect();
          FRESHNESS_ROWS.forEach((_, i) => {
            timers.push(window.setTimeout(() => {
              setVerified((v) => (v.includes(i) ? v : [...v, i]));
              setLit((l) => [...l, i]);
              timers.push(window.setTimeout(() => setLit((l) => l.filter((x) => x !== i)), 520));
            }, 130 * i));
          });
        });
      },
      { threshold: 0.4 },
    );
    obs.observe(el);
    return () => { obs.disconnect(); timers.forEach(clearTimeout); };
  }, []);

  return (
    <div className="ftable" ref={ref}>
      {FRESHNESS_ROWS.map((row, i) => (
        <details className="fitem" key={row.key}>
          <summary className={cn("frow", verified.includes(i) && "verified", lit.includes(i) && "lit")}>
            <span className="fk">{row.key}</span>
            <span className="fv">{row.value}</span>
            <span className="fd">
              <span className="vdot" />
              {verifiedCitation(row)} · next check {row.nextCheck}
            </span>
            <span className="fchev" aria-hidden>›</span>
          </summary>
          <div className="fdetail"><div className="fdetail-inner">
            <p>{row.detail}<span className="fmeta">Verified {row.verified} · Next check {row.nextCheck}</span></p>
          </div></div>
        </details>
      ))}
    </div>
  );
}
