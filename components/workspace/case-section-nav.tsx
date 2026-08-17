"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";

/**
 * The case's own navigation (spec §1, item 7) — a narrow sticky rail beside the
 * case content on desktop, a horizontally scrollable row of ordinary links below
 * `md`.
 *
 * ## Why this one component is a client boundary
 *
 * Everything else in the frame is a Server Component. This is not, because the
 * ONE thing it has to know is which segment is rendering below the layout, and a
 * layout cannot read its child's `params`. `useSelectedLayoutSegment()` is the
 * framework's answer and it reads the URL — no data, no permission, no case
 * fact. The `href`s arrive as props from the server precisely so that
 * `caseRouteBase` (which lives in a `server-only` module) is never pulled into
 * client JS; `tests/architecture/client-server-boundary.test.ts` pins that.
 *
 * ## Why the links are ordinary links
 *
 * Same rule as the queue rows: navigation is native, Tab stays complete, and
 * nothing here depends on a click handler. `aria-current="page"` — not colour
 * alone — is what says where you are.
 *
 * The overview is the segment-less entry: `useSelectedLayoutSegment()` returns
 * `null` for the index route, which is why `segment` is nullable rather than a
 * sentinel string. `/checklist/all` and `/checklist/[programId]` both report
 * `"checklist"`, so a nested checklist route keeps its section marked.
 */

export interface CaseSection {
  /** The route segment below the case layout; `null` is the overview itself. */
  segment: string | null;
  label: string;
  href: string;
}

export function CaseSectionNav({ sections }: { sections: readonly CaseSection[] }) {
  const active = useSelectedLayoutSegment();

  return (
    <nav
      aria-label="Case sections"
      className="border-b border-line md:sticky md:top-4 md:self-start md:border-b-0 md:border-r md:border-line"
    >
      {/* `md:px-2` is not arbitrary: it puts each link's TEXT on the same 20px
          gutter the case header uses, so the rail and the name above it line up
          rather than sitting four pixels apart. */}
      <ul className="-mx-1 flex max-w-full items-center gap-1 overflow-x-auto px-4 py-2 md:mx-0 md:flex-col md:items-stretch md:gap-0.5 md:px-2 md:py-8">
        {sections.map((section) => {
          const current = section.segment === active;
          return (
            <li key={section.href} className="md:w-full">
              <Link
                href={section.href}
                aria-current={current ? "page" : undefined}
                className={
                  current
                    ? "block whitespace-nowrap rounded-pill bg-primary-tint px-3 py-1.5 text-control font-medium text-primary md:rounded-sm"
                    : "block whitespace-nowrap rounded-pill px-3 py-1.5 text-control text-ink-soft transition-colors duration-fast ease-calm hover:bg-bg-tint hover:text-ink md:rounded-sm"
                }
              >
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
