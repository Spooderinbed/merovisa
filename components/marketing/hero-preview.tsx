import { Card } from "@/components/ui/card";
import { VerdictPill } from "@/components/ui/verdict-pill";

export function HeroPreview() {
  return (
    <Card className="overflow-hidden">
      {/* header */}
      <div className="flex items-center justify-between border-b border-line bg-surface-2 px-5 py-3">
        <span className="inline-flex items-center gap-2 text-[15px] font-medium text-ink">
          <svg aria-hidden viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
            <circle cx="12" cy="12" r="8" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          A preview of your feed
        </span>
        <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">preview</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr]">
        {/* feed */}
        <div className="flex flex-col gap-3 border-b border-line p-5 lg:border-b-0 lg:border-r">
          <div className="flex flex-col gap-2 rounded-md bg-primary-tint p-4">
            <span className="inline-flex items-center gap-2 font-medium text-primary">
              <svg aria-hidden viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v6M12 16v6M2 12h6M16 12h6" />
              </svg>
              Your next best step
            </span>
            <p className="text-[15px] text-ink">
              Add your IELTS report to unlock 3 more matches and sharpen your Australia verdict.
            </p>
          </div>
          <Card radius="card" padding="sm" className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-[15px] font-medium text-ink">🇦🇺 Visa update</span>
              <VerdictPill verdict="strong" size="md" />
            </div>
            <p className="text-[15px] text-ink-soft">
              Australia&apos;s Genuine Student rules — your work gap is an asset here, not a liability.
            </p>
          </Card>
        </div>

        {/* guide */}
        <div className="flex flex-col gap-3 bg-surface-2 p-5">
          <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Your guide</span>
          <Card radius="card" padding="sm">
            <p className="text-[15px] text-ink">
              You&apos;re in good shape for Australia. The highest-impact thing right now is documenting your work gap — want to do it together?
            </p>
          </Card>
          <div className="flex flex-col gap-2">
            {["Is my gap a problem?", "How much must I show?"].map((q) => (
              <span
                key={q}
                className="inline-flex items-center justify-start rounded-pill border border-line bg-surface px-3 py-1.5 text-[14px] text-ink-soft"
              >
                {q}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
