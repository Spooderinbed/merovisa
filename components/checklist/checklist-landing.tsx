import Link from "next/link";
import { Card } from "@/components/ui/card";

/**
 * `base` prefixes every internal link. Empty on `/checklist`; inside a case route
 * it is that case's base, so a counsellor opening "all documents" or a program's
 * checklist stays in the student's case instead of landing on their own.
 *
 * `documentsHref` is null there for a different reason: the vault is Stage 4's,
 * its Storage object paths are still owner-keyed, and there is no case-scoped
 * documents surface to link to yet. Offering the student's counsellor a link to
 * their OWN vault would be worse than offering none.
 */
export function ChecklistLanding({
  shortlisted,
  base = "",
  documentsHref = "/documents",
}: {
  shortlisted: { id: string; name: string }[];
  base?: string;
  documentsHref?: string | null;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-2">
        <span className="text-caption uppercase tracking-wide text-ink-faint">Document checklist</span>
        <h1 className="text-[clamp(28px,3.4vw,40px)]">Pick a program to see its checklist</h1>
        <p className="max-w-[64ch] text-control text-ink-soft">
          Each program has its own checklist — what you need now, and what comes after your offer.
        </p>
      </header>

      <Card
        as={Link}
        href={`${base}/checklist/all`}
        radius="card"
        tone="tint"
        padding="sm"
        className="flex items-center justify-between hover:border-primary"
      >
        <span className="flex flex-col gap-0.5">
          <span className="text-body text-ink">Your overall document checklist</span>
          <span className="text-small text-ink-soft">
            One running list across every program — tick off each document as you obtain it.
          </span>
        </span>
        <span className="ml-4 shrink-0 text-small text-primary">Open →</span>
      </Card>

      {shortlisted.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {shortlisted.map((p) => (
            <li key={p.id}>
              <Card
                as="a"
                href={`${base}/checklist/${p.id}`}
                padding="sm"
                className="flex items-center justify-between hover:border-primary"
              >
                <span className="text-body text-ink">{p.name}</span>
                <span className="text-small text-primary">View checklist →</span>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <Card radius="card" tone="tint" padding="md" className="flex flex-col items-start gap-3">
          <p className="text-body text-ink">You haven&apos;t shortlisted any programs yet.</p>
          <a
            href={`${base}/matches`}
            className="rounded-pill bg-primary px-4 py-2 text-meta text-white hover:opacity-90"
          >
            Browse matches
          </a>
        </Card>
      )}

      {documentsHref === null ? null : (
        <a href={documentsHref} className="text-small text-primary hover:underline">
          Go to your documents vault →
        </a>
      )}
    </div>
  );
}
