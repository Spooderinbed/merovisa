"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { SAMPLE_PROFILES, getProfile, formatCost, type SampleProfile } from "@/lib/marketing/sample-profiles";

const DEFAULT_ID: SampleProfile["id"] = "aarav";

export function VerdictPanel() {
  // selectedId drives the toggle pill; it updates INSTANTLY on click so the button
  // gives immediate tactile feedback. activeId drives the panel content, which swaps
  // after a short crossfade. Splitting them stops the pill lagging 150ms behind the tap.
  const [selectedId, setSelectedId] = useState<SampleProfile["id"]>(DEFAULT_ID);
  const [activeId, setActiveId] = useState<SampleProfile["id"]>(DEFAULT_ID);
  const [displayCost, setDisplayCost] = useState<number>(getProfile(DEFAULT_ID).cost);
  const [swapping, setSwapping] = useState(false);
  const [openDims, setOpenDims] = useState<Set<string>>(() => new Set());
  const reduceRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const swapRef = useRef<number | null>(null);
  const profile = getProfile(activeId);

  function toggleDim(key: string) {
    setOpenDims((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  useEffect(() => {
    reduceRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (swapRef.current) clearTimeout(swapRef.current);
    };
  }, []);

  function countTo(target: number, from: number) {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (reduceRef.current) { setDisplayCost(target); return; }
    const dur = 650;
    let t0: number | null = null;
    const step = (ts: number) => {
      if (t0 === null) t0 = ts;
      const p = Math.min((ts - t0) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setDisplayCost(Math.round(from + (target - from) * e));
      if (p < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }

  function select(id: SampleProfile["id"]) {
    if (id === selectedId) return;
    setSelectedId(id); // instant pill highlight, never waiting on the content crossfade
    const next = getProfile(id);
    const from = displayCost;
    if (reduceRef.current) { setActiveId(id); setDisplayCost(next.cost); return; }
    setSwapping(true);
    if (swapRef.current) clearTimeout(swapRef.current);
    swapRef.current = window.setTimeout(() => {
      setActiveId(id);
      setSwapping(false);
      countTo(next.cost, from);
    }, 150);
  }

  return (
    <div className="panel">
      <div className={cn("panel-head", swapping && "swapping")}>
        <div>
          <div className="p-label">Your assessment</div>
          <div className={cn("verdict", `v-${profile.tone}`)} role="status" aria-live="polite">
            <span className="vd" />
            <span>{profile.verdict}</span>
          </div>
          <p className="p-note">{profile.note}</p>
        </div>
        <div className="head-right">
          <span className="p-badge">Nepal → Australia</span>
          <span className="toggle-lbl">Sample profile</span>
          <div className="toggle" role="radiogroup" aria-label="Sample profile">
            {SAMPLE_PROFILES.map((p) => (
              <label key={p.id} className={cn("toggle-opt", selectedId === p.id && "on")}>
                <input
                  type="radio"
                  name="mv-profile"
                  className="vh"
                  checked={selectedId === p.id}
                  onChange={() => select(p.id)}
                />
                <span>{p.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="panel-body">
        <div className="dims">
          {profile.dims.map((d) => {
            const open = openDims.has(d.key);
            return (
              <div className={cn("dim", open && "open")} key={d.key}>
                <button
                  type="button"
                  className="dim-head"
                  aria-expanded={open}
                  onClick={() => toggleDim(d.key)}
                >
                  <span className="dim-name">{d.name}</span>
                  <span className={cn("tag", `t-${d.tone}`)}>{d.tag}</span>
                  <span className="chev" aria-hidden>›</span>
                </button>
                {/* .bar/.fill are a DIRECT sibling of .dim-head, never nested in the
                    collapsible .dim-detail, so the final-width fill shows at rest (invariant 1). */}
                <span className="bar"><span className={cn("fill", `f-${d.tone}`)} style={{ width: `${d.width}%` }} /></span>
                <div className="dim-detail"><div className="dim-detail-inner"><p>{d.blurb}</p></div></div>
              </div>
            );
          })}
        </div>

        <div className="p-side">
          <div className="cost-lbl">Est. first-year cost</div>
          <div className="cost-val">{formatCost(displayCost)}</div>
          <Link className="p-more" href="/assess">See full breakdown →</Link>
          <p className="hint">A sample estimate, not a sourced figure · tap a row for detail, switch the sample profile above.</p>
        </div>
      </div>
    </div>
  );
}
