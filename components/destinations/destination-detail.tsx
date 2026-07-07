import Link from "next/link";
import type { MarketingDestination } from "@/lib/marketing/destinations";
import { Card } from "@/components/ui/card";
import { VerdictPill } from "@/components/ui/verdict-pill";
import { Fact } from "./fact";

const RISK_STYLE = {
  calm:    "bg-strong-tint text-strong",
  caution: "bg-possible-tint text-possible",
  warning: "bg-reach-tint text-reach",
} as const;

export function DestinationDetail({ destination: c }: { destination: MarketingDestination }) {
  const sourceHost = c.source.replace(/^https?:\/\//, "").split("/")[0];

  return (
    <section className="mx-auto w-full max-w-[1120px] px-5 pb-16 pt-7">
      <Link
        href="/destinations"
        className="inline-flex items-center gap-2 rounded-pill px-3 py-1.5 text-meta text-ink-soft hover:bg-bg-tint"
      >
        ← All destinations
      </Link>

      {/* hero */}
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <span aria-hidden className="inline-flex h-10 w-12 items-center justify-center rounded-md border border-line bg-bg-tint text-2xl leading-none">
          {c.flag}
        </span>
        <h1 className="text-[clamp(36px,4.6vw,52px)] leading-[1.05]">{c.name}</h1>
        {c.supported ? (
          <VerdictPill verdict={c.match} size="lg" className="text-small" />
        ) : (
          <span className="inline-flex items-center rounded-pill border border-line bg-bg-tint px-3 py-1 font-mono text-small text-ink-soft">
            Not yet available
          </span>
        )}
      </div>

      <p className="mt-3 max-w-[640px] text-lead text-ink-soft">{c.tagline}</p>

      <span className="mt-4 inline-flex flex-wrap items-center gap-2 font-mono text-small text-ink-soft">
        ↻ updated {c.lastVerified}
        <span className="opacity-50">·</span>
        <a href={c.source} target="_blank" rel="noreferrer" className="text-primary hover:underline">
          {sourceHost}
        </a>
      </span>

      {/* risk */}
      <Card className="mt-6 overflow-hidden">
        <div className={`flex items-center gap-2 border-b border-line px-5 py-3 ${RISK_STYLE[c.risk.level]}`}>
          <svg aria-hidden viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
          </svg>
          <span className="font-medium">Current visa note</span>
        </div>
        <div className="flex flex-col gap-2 p-5">
          <span className="font-medium">{c.risk.title}</span>
          <p className="text-body text-ink-soft">{c.risk.body}</p>
        </div>
      </Card>

      {/* facts */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Fact label="Tuition" value={c.tuition} />
        <Fact label="Living cost" value={c.living} />
        <Fact label="Financial proof" value={c.financialProof} />
        <Fact label="Work rights" value={c.workRights} />
        <Fact label="Post-study" value={c.postStudy} />
        <Fact label="Last checked" value={`${c.lastVerified} · ${sourceHost}`} mono />
      </div>

      {/* docs */}
      <Card padding="lg" className="mt-4 flex flex-col gap-3">
        <h3 className="text-title">What you&apos;ll need</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {c.docs.map((d) => (
            <div key={d} className="flex items-center gap-2">
              <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-primary" />
              <span className="text-body text-ink">{d}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* CTA */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-transparent bg-primary-tint p-6">
        <div className="flex flex-col gap-1">
          <span className="text-title font-medium text-ink">
            {c.supported ? `Check your standing for ${c.name}` : `We don't assess Nepal → ${c.name} yet`}
          </span>
          <span className="text-body text-ink-soft">
            {c.supported
              ? "9 quick questions, no sign-up to start."
              : "Australia is the corridor we fully cover today."}
          </span>
        </div>
        <Link
          href="/assess"
          className="inline-flex items-center gap-2 rounded-pill bg-primary px-[22px] py-3 text-control font-medium text-on-primary hover:bg-primary-ink"
        >
          {c.supported ? "Check eligibility →" : "See where you stand for Australia →"}
        </Link>
      </div>
    </section>
  );
}
