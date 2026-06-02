import type { Verdict } from "@/lib/scoring/types";
import { AUSTRALIA } from "@/lib/data/destination/australia";

const VERDICT_META: Record<Verdict, { label: string; line: string; cls: string }> = {
  strong: {
    label: "Strong match",
    line: "You have a realistic shot, with strong fundamentals.",
    cls: "bg-strong-tint text-strong",
  },
  possible: {
    label: "Possible",
    line: "You have a realistic shot, with a few areas to strengthen.",
    cls: "bg-possible-tint text-possible",
  },
  reach: {
    label: "Reach",
    line: "This is ambitious — focus on strengthening a few key areas.",
    cls: "bg-reach-tint text-reach",
  },
};

export function VerdictCard({ verdict }: { verdict: Verdict }) {
  const meta = VERDICT_META[verdict];
  const sourceHost = AUSTRALIA.source.replace(/^https?:\/\//, "").split("/")[0];
  return (
    <section className="animate-rise rounded-lg border border-line bg-surface p-6">
      <span className={`inline-flex items-center rounded-pill px-3 py-1 font-mono text-[12.5px] ${meta.cls}`}>
        {meta.label}
      </span>
      <h2 className="mt-4 text-[clamp(24px,3vw,32px)]">{meta.line}</h2>
      <p className="mt-3 font-mono text-[12.5px] text-ink-faint">
        Based on rules verified {AUSTRALIA.lastVerified} · {sourceHost}
      </p>
    </section>
  );
}
