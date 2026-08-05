import { getEducationLoanBanks } from "@/lib/data/source/banks";

function npr(n?: number): string | null {
  return n === undefined ? null : "NPR " + n.toLocaleString("en-US");
}

function rate(b: ReturnType<typeof getEducationLoanBanks>[number]): string | null {
  const p = b.educationLoan?.pricing;
  if (!p) return null;
  if (p.kind === "base-spread") return `Base + ${p.minSpreadPct}–${p.maxSpreadPct}%`;
  if (p.effectiveRatePct !== undefined) return `${p.effectiveRatePct}% fixed`;
  if (p.minRatePct !== undefined && p.maxRatePct !== undefined) return `${p.minRatePct}–${p.maxRatePct}% fixed`;
  return null;
}

export function BankLoanPanel() {
  const banks = getEducationLoanBanks();
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line-2 bg-surface p-4">
      <h3 className="text-caption uppercase tracking-wide text-ink-faint">
        Class-A banks with education loans
      </h3>
      <ul className="flex flex-col divide-y divide-line-2">
        {banks.map((b) => {
          const ceiling = npr(b.educationLoan?.maxAmountNpr);
          const r = rate(b);
          const tenure = b.educationLoan?.maxTenureYears;
          return (
            <li key={b.id} className="flex flex-col gap-1 py-2">
              <a
                href={b.educationLoan!.source}
                target="_blank"
                rel="noreferrer"
                className="text-body text-ink hover:text-primary"
              >
                {b.name}
              </a>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-small text-ink-soft">
                {ceiling ? <span>Up to {ceiling}</span> : null}
                {tenure ? <span>{tenure}-yr term</span> : null}
                {r ? <span>{r}</span> : null}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-small text-ink-faint">
        Class-A list per Nepal Rastra Bank. Verify current rates with the bank before applying.
      </p>
    </section>
  );
}
