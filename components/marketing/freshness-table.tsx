// components/marketing/freshness-table.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { FRESHNESS_ROWS } from "@/lib/marketing/freshness-rows";
import { verifiedCitation } from "@/lib/marketing/provenance";

export function FreshnessTable() {
  const ref = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState<number[]>([]);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof IntersectionObserver === "undefined") return;
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
          <summary className={cn("frow", "verified", lit.includes(i) && "lit")}>
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
