"use client";

import Link from "next/link";
import type { PlanItemRow } from "@/lib/plan/types";
import { Card } from "@/components/ui/card";
import { completionFor } from "@/lib/plan/completion";
import { track } from "@/lib/analytics/events";

export type PromptState =
  | { kind: "profile-incomplete" }
  | { kind: "next"; item: PlanItemRow }
  | { kind: "waiting"; openCount: number }
  | { kind: "caught-up" };

// Paper pill + teal text resolve to visible contrast against the dark panel in
// both light and dark modes (the old bg-on-primary pill collapsed in dark mode).
const CTA_CLASSES =
  "mt-2 inline-flex w-fit items-center rounded-pill bg-bg px-4 py-2 text-meta font-medium text-primary hover:opacity-90";

function Eyebrow({ tone }: { tone: "dark" | "light" }) {
  return (
    <span
      className={`font-mono text-caption uppercase tracking-wide ${
        tone === "dark" ? "text-on-primary/70" : "text-ink-faint"
      }`}
    >
      Next step
    </span>
  );
}

export function PromptCard({ prompt }: { prompt: PromptState }) {
  if (prompt.kind === "caught-up") {
    return (
      <Card padding="lg" className="animate-rise flex flex-col gap-2">
        <Eyebrow tone="light" />
        <h3 className="text-headline text-ink">All caught up</h3>
        <p className="text-body text-ink-soft">
          Nothing on your plan needs action right now. We&apos;ll surface the next step here when
          something changes.
        </p>
        <Link
          href="/plan"
          className="text-meta text-ink-soft underline-offset-4 hover:underline"
          onClick={() => track("dashboard_cta_clicked", { state: "caught-up" })}
        >
          See your plan →
        </Link>
      </Card>
    );
  }

  if (prompt.kind === "waiting") {
    return (
      <Card padding="lg" className="animate-rise flex flex-col gap-2">
        <Eyebrow tone="light" />
        <h3 className="text-headline text-ink">Everything is underway</h3>
        <p className="text-body text-ink-soft">
          All {prompt.openCount} remaining plan items are marked in progress. Check your plan if
          anything has changed.
        </p>
        <Link
          href="/plan"
          className="text-meta text-ink-soft underline-offset-4 hover:underline"
          onClick={() => track("dashboard_cta_clicked", { state: "waiting" })}
        >
          Open your plan →
        </Link>
      </Card>
    );
  }

  if (prompt.kind === "next") {
    const meta = completionFor(prompt.item.kind);
    return (
      <Card tone="primary" border="transparent" padding="lg" className="animate-rise flex flex-col gap-3">
        <Eyebrow tone="dark" />
        <h3 className="text-headline">{prompt.item.title}</h3>
        {prompt.item.body ? (
          <p className="line-clamp-3 text-body opacity-90">{prompt.item.body}</p>
        ) : null}
        <Link
          href={meta.href}
          className={CTA_CLASSES}
          onClick={() => track("dashboard_cta_clicked", { state: "next", kind: prompt.item.kind })}
        >
          {meta.cta}
        </Link>
      </Card>
    );
  }

  return (
    <Card tone="primary" border="transparent" padding="lg" className="animate-rise flex flex-col gap-3">
      <Eyebrow tone="dark" />
      <h3 className="text-headline">Your next best step</h3>
      <p className="text-body opacity-90">
        Filling more of your profile sharpens the verdict and unlocks better matches.
      </p>
      <Link
        href="/profile"
        className={CTA_CLASSES}
        onClick={() => track("dashboard_cta_clicked", { state: "profile-incomplete" })}
      >
        Add details →
      </Link>
    </Card>
  );
}
