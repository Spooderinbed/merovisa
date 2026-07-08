// components/marketing/documents-checklist.tsx
"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { CHECKLIST_ITEMS } from "@/lib/marketing/checklist-items";
import { verifiedCitation } from "@/lib/marketing/provenance";

export function DocumentsChecklist() {
  const [checked, setChecked] = useState<boolean[]>(() => CHECKLIST_ITEMS.map((i) => i.done));
  const total = CHECKLIST_ITEMS.length;
  const doneCount = checked.filter(Boolean).length;
  const pct = Math.round((doneCount / total) * 100);
  const allDone = doneCount === total;

  return (
    <div className={cn("surface checklist", allDone && "alldone")}>
      <div className="cl-top">
        <div className="cl-count" aria-live="polite"><b>{doneCount}</b> of {total} ready</div>
        <span className="ready-pill">All set →</span>
      </div>
      <div className="cl-bar"><span className="cl-fill" style={{ width: `${pct}%` }} /></div>
      {CHECKLIST_ITEMS.map((item, i) => (
        <label key={item.label} className={cn("ck-row", checked[i] && "done")}>
          <input
            type="checkbox"
            className="vh"
            checked={checked[i]}
            onChange={() => setChecked((c) => c.map((v, j) => (j === i ? !v : v)))}
          />
          <span className="ck-box" aria-hidden />
          <span className="ck-label">{item.label}</span>
          <span className="ck-src">{verifiedCitation(item)}</span>
        </label>
      ))}
    </div>
  );
}
