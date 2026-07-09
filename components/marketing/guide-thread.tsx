// components/marketing/guide-thread.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { GUIDE_ANSWERS, GUIDE_ORDER } from "@/lib/marketing/guide-answers";
import { verifiedCitation, type GuideKey } from "@/lib/marketing/provenance";

const REST: GuideKey = "ielts";
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
function punct(ch: string, next: string): number {
  if (ch === "," || ch === ";" || ch === ":") return 140;
  if ((ch === "." || ch === "?" || ch === "!") && (next === "" || next === " ")) return 220;
  return 0;
}

export function GuideThread() {
  const [activeKey, setActiveKey] = useState<GuideKey>(REST);
  const [display, setDisplay] = useState<{ q: string; a: string; cite: boolean }>(() => {
    const it = GUIDE_ANSWERS[REST];
    return { q: it.q, a: it.a, cite: true };
  });
  const [status, setStatus] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const runId = useRef(0);
  const interacted = useRef(false);
  const reduce = useRef(false);

  function showFinal(key: GuideKey) {
    const it = GUIDE_ANSWERS[key];
    setDisplay({ q: it.q, a: it.a, cite: true });
    setStatus(`${it.q} ${it.a} ${verifiedCitation(it)}`);
  }

  async function play(key: GuideKey): Promise<number> {
    const my = ++runId.current;
    const it = GUIDE_ANSWERS[key];
    setActiveKey(key);
    if (reduce.current) { showFinal(key); return my; }
    setDisplay({ q: "", a: "", cite: false });
    const type = async (field: "q" | "a", text: string, base: number) => {
      for (let i = 1; i <= text.length; i++) {
        if (my !== runId.current) return false;
        setDisplay((d) => ({ ...d, [field]: text.slice(0, i) }));
        await wait(base + punct(text[i - 1]!, text[i] ?? ""));
      }
      return true;
    };
    if (!(await type("q", it.q, 26))) return my;
    await wait(520); if (my !== runId.current) return my;
    if (!(await type("a", it.a, 15))) return my;
    await wait(220); if (my !== runId.current) return my;
    setDisplay((d) => ({ ...d, cite: true }));
    setStatus(`${it.q} ${it.a} ${verifiedCitation(it)}`);
    return my;
  }

  function onChip(key: GuideKey) {
    interacted.current = true; // stop autoplay for good
    runId.current++;           // interrupt any in-flight run
    if (reduce.current) { setActiveKey(key); showFinal(key); } else void play(key);
  }

  useEffect(() => {
    reduce.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce.current || typeof IntersectionObserver === "undefined") return; // rest stays on ielts
    const el = rootRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach(async (e) => {
          if (!e.isIntersecting || interacted.current) return;
          interacted.current = true;
          obs.disconnect();
          for (const key of GUIDE_ORDER) {
            const id = await play(key);
            if (id !== runId.current) return; // chip click interrupted
            await wait(1500);
            if (id !== runId.current) return;
          }
        });
      },
      { threshold: 0.35 },
    );
    obs.observe(el);
    // Bump runId on teardown so any in-flight play()/typewriter loop sees its id go
    // stale and bails, instead of scheduling setState after the component unmounts.
    // We deliberately read the LIVE counter here (not a setup-time snapshot), so the
    // ref-in-cleanup lint below is expected and correct.
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      runId.current++;
      obs.disconnect();
    };
    // Run once on mount. `play` closes only over refs + stable setState, so it is
    // effect-stable; adding it to deps would recreate the observer each render and
    // re-trigger autoplay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="surface guide-panel" ref={rootRef}>
      <div className="g-chips" role="radiogroup" aria-label="Example questions">
        {GUIDE_ORDER.map((key) => (
          <label key={key} className={cn("g-chip", activeKey === key && "on")}>
            <input
              type="radio"
              name="mv-guide"
              className="vh"
              checked={activeKey === key}
              onChange={() => onChip(key)}
            />
            <span>{GUIDE_ANSWERS[key].chip}</span>
          </label>
        ))}
      </div>
      <div className="g-thread" aria-live="off">
        {display.q && <div className="g-q">{display.q}</div>}
        {display.a && (
          <div className="g-a">
            {display.a}
            <span className={cn("cite", display.cite && "in")}>
              {verifiedCitation(GUIDE_ANSWERS[activeKey])}
            </span>
          </div>
        )}
      </div>
      <span className="vh" aria-live="polite" aria-atomic="true">{status}</span>
    </div>
  );
}
