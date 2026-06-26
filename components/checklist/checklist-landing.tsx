import Link from "next/link";

export function ChecklistLanding({ shortlisted }: { shortlisted: { id: string; name: string }[] }) {
  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-2">
        <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Document checklist</span>
        <h1 className="text-[clamp(28px,3.4vw,40px)]">Pick a program to see its checklist</h1>
        <p className="max-w-[64ch] text-[16px] text-ink-soft">
          Each program has its own checklist — what you need now, and what comes after your offer.
        </p>
      </header>

      <Link
        href="/checklist/all"
        className="flex items-center justify-between rounded-xl border border-line bg-bg-tint p-4 hover:border-primary"
      >
        <span className="flex flex-col gap-0.5">
          <span className="text-[15px] text-ink">Your overall document checklist</span>
          <span className="text-[13px] text-ink-soft">
            One running list across every program — tick off each document as you obtain it.
          </span>
        </span>
        <span className="ml-4 shrink-0 text-[13px] text-primary">Open →</span>
      </Link>

      {shortlisted.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {shortlisted.map((p) => (
            <li key={p.id}>
              <a
                href={`/checklist/${p.id}`}
                className="flex items-center justify-between rounded-lg border border-line bg-surface p-4 hover:border-primary"
              >
                <span className="text-[15px] text-ink">{p.name}</span>
                <span className="text-[13px] text-primary">View checklist →</span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-line bg-bg-tint p-5">
          <p className="text-[15px] text-ink">You haven&apos;t shortlisted any programs yet.</p>
          <a href="/matches" className="rounded-pill bg-primary px-4 py-2 text-[14px] text-white hover:opacity-90">
            Browse matches
          </a>
        </div>
      )}

      <a href="/documents" className="text-[13px] text-primary hover:underline">
        Go to your documents vault →
      </a>
    </div>
  );
}
