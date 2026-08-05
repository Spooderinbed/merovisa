"use client";

import { useState } from "react";
import type { AssessmentResult, DimensionScore } from "@/lib/scoring/types";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { bandLabel } from "@/lib/scoring/band";
import { humanizeFactorDetail } from "@/lib/results/factor-copy";
import { SourceLine } from "./source-line";

const DIMENSION_META = [
  { key: "academic", label: "Academic fit" },
  { key: "financial", label: "Financial readiness" },
  { key: "visa", label: "Visa case strength" },
  { key: "profileStrength", label: "Profile strength" },
] as const;

const INFLUENCE_CLS = {
  positive: "text-strong",
  neutral: "text-ink-soft",
  risk: "text-reach",
} as const;

export function FactorBars({ dimensions }: { dimensions: AssessmentResult["dimensions"] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="flex flex-col gap-3">
      {DIMENSION_META.map(({ key, label }) => {
        const dim: DimensionScore = dimensions[key];
        // Data-driven affordance: a dimension that ships no factors (e.g. profile
        // strength for a zero-gap bachelor's profile) gets a plain row — nothing
        // that pretends to open onto empty content. Stored payloads from older
        // rule versions may lack the factors array entirely — same plain row.
        const factors = dim.factors ?? [];
        const expandable = factors.length > 0;
        const isOpen = expandable && open === key;
        const rowCls = "flex w-full flex-col gap-2 px-4 py-3 text-left";
        const rowContent = (
          <>
            <span className="flex items-center justify-between">
              <span className="text-ink">{label}</span>
              <span className="text-small text-ink-faint">{bandLabel(dim.value)}</span>
            </span>
            <span className="h-2 w-full overflow-hidden rounded-pill bg-bg-tint">
              <span
                className="block h-full rounded-pill bg-primary transition-[width] duration-slower ease-calm"
                style={{ width: `${dim.value}%` }}
              />
            </span>
          </>
        );
        return (
          <Card key={key} radius="card">
            {expandable ? (
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : key)}
                className={rowCls}
              >
                {rowContent}
              </button>
            ) : (
              <div className={rowCls}>{rowContent}</div>
            )}
            {isOpen ? (
              <ul className="flex flex-col gap-2 border-t border-line px-4 py-3">
                {factors.map((f, i) => (
                  <li key={i} className="flex flex-col text-body">
                    <span className={cn("font-medium", INFLUENCE_CLS[f.influence])}>{f.label}</span>
                    <span className="text-ink-soft">{humanizeFactorDetail(f.detail)}</span>
                    {f.source ? <SourceLine url={f.source.url} lastVerified={f.source.lastVerified} surface="factor-bars" /> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
        );
      })}
    </section>
  );
}
