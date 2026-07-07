import type { Callout } from "@/lib/callouts/types";
import { cn } from "@/lib/utils";

const toneStyles: Record<Callout["tone"], string> = {
  info: "bg-primary-tint",
  warn: "bg-possible-tint",
  positive: "bg-strong-tint",
};

export function InlineCallout({ callout }: { callout: Callout }) {
  return (
    <div className={cn("flex flex-col gap-1 rounded-md px-3 py-2 text-body text-ink-soft", toneStyles[callout.tone])}>
      <p>{callout.message}</p>
      {callout.actionHref ? (
        <a
          href={callout.actionHref}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          {callout.actionLabel ?? "Learn more"} →
        </a>
      ) : null}
    </div>
  );
}
