import Link from "next/link";
import type { PlanItemRow } from "@/lib/plan/types";
import { completionFor } from "@/lib/plan/completion";

export type PromptState =
  | { kind: "profile-incomplete" }
  | { kind: "next"; item: PlanItemRow }
  | { kind: "waiting"; openCount: number }
  | { kind: "caught-up" };

// Paper pill + teal text resolve to visible contrast against the dark panel in
// both light and dark modes (the old bg-on-primary pill collapsed in dark mode).
const CTA_CLASSES =
  "mt-2 inline-flex w-fit items-center rounded-pill bg-bg px-4 py-2 text-[14px] font-medium text-primary hover:opacity-90";

function Eyebrow({ tone }: { tone: "dark" | "light" }) {
  return (
    <span
      className={`font-mono text-[11.5px] uppercase tracking-wide ${
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
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-6">
        <Eyebrow tone="light" />
        <h3 className="text-[21px] text-ink">All caught up</h3>
        <p className="text-[15px] text-ink-soft">
          Nothing on your plan needs action right now. We&apos;ll surface the next step here when
          something changes.
        </p>
        <Link href="/plan" className="text-[14px] text-ink-soft underline-offset-4 hover:underline">
          See your plan →
        </Link>
      </div>
    );
  }

  if (prompt.kind === "waiting") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-6">
        <Eyebrow tone="light" />
        <h3 className="text-[21px] text-ink">Everything is underway</h3>
        <p className="text-[15px] text-ink-soft">
          All {prompt.openCount} remaining plan items are marked in progress. Check your plan if
          anything has changed.
        </p>
        <Link href="/plan" className="text-[14px] text-ink-soft underline-offset-4 hover:underline">
          Open your plan →
        </Link>
      </div>
    );
  }

  if (prompt.kind === "next") {
    const meta = completionFor(prompt.item.kind);
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-transparent bg-primary p-6 text-on-primary">
        <Eyebrow tone="dark" />
        <h3 className="text-[21px]">{prompt.item.title}</h3>
        {prompt.item.body ? (
          <p className="line-clamp-3 text-[15px] opacity-90">{prompt.item.body}</p>
        ) : null}
        <Link href={meta.href} className={CTA_CLASSES}>
          {meta.cta}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-transparent bg-primary p-6 text-on-primary">
      <Eyebrow tone="dark" />
      <h3 className="text-[21px]">Your next best step</h3>
      <p className="text-[15px] opacity-90">
        Filling more of your profile sharpens the verdict and unlocks better matches.
      </p>
      <Link href="/profile" className={CTA_CLASSES}>
        Add details →
      </Link>
    </div>
  );
}
