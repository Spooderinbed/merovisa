// components/marketing/freshness-table.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { FRESHNESS_ROWS } from "@/lib/marketing/freshness-rows";
import { verifiedCitation } from "@/lib/marketing/provenance";

export function FreshnessTable() {
  const ref = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState<number[]>([]);
  // Expanded rows, driven by a JS `.open` class (NOT native <details>): a closed
  // <details> display:none's its content, so the grid-rows 0fr→1fr ease has no
  // prior frame to interpolate and snaps open (MV-117). Keeping .fdetail rendered
  // lets it animate. Independent (multi-open) rows, so a Set of keys.
  const [openRows, setOpenRows] = useState<Set<string>>(() => new Set());

  function toggleRow(key: string) {
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

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
      {FRESHNESS_ROWS.map((row, i) => {
        const open = openRows.has(row.key);
        return (
          <div className={cn("fitem", open && "open")} key={row.key}>
            <button
              type="button"
              className={cn("frow", "verified", lit.includes(i) && "lit")}
              aria-expanded={open}
              onClick={() => toggleRow(row.key)}
            >
              <span className="fk">{row.key}</span>
              <span className="fv">{row.value}</span>
              <span className="fd">
                <span className="vdot" />
                {verifiedCitation(row)} · next check {row.nextCheck}
              </span>
              <span className="fchev" aria-hidden>›</span>
            </button>
            <div className="fdetail"><div className="fdetail-inner">
              <p>{row.detail}<span className="fmeta">Verified {row.verified} · Next check {row.nextCheck}</span></p>
            </div></div>
          </div>
        );
      })}
    </div>
  );
}
