import { AU_GENUINE_STUDENT } from "@/lib/data/source/au-genuine-student";
import type { GenuineStudentFact } from "@/lib/data/types";
import { SourceAnchor } from "@/components/analytics/source-anchor";

const SECTIONS: { id: GenuineStudentFact["section"]; heading: string }[] = [
  { id: "what-it-is", heading: "What it is" },
  { id: "the-questions", heading: "The questions you'll answer" },
  { id: "how-weighed", heading: "How officers actually weigh it" },
  { id: "post-study", heading: "Post-study honesty" },
  { id: "evidence", heading: "Evidence & what not to trust" },
];

const DISCLAIMER = "General context for the Australian Genuine Student requirement, not legal advice.";

/**
 * Genuine Student credibility panel — gov-sourced explanation of the Australian GS test,
 * in five collapsible sections (native <details>, first open). Mirrors RefusalRecovery's
 * calm-authority shell. Purely presentational; every row links to its gov source through
 * SourceAnchor (surface "genuine-student"). No personal odds, no scoring.
 */
export function GenuineStudent() {
  return (
    <aside className="flex flex-col gap-3 rounded-md border border-line bg-bg-tint p-4 text-[14px] text-ink-soft">
      <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">
        The Genuine Student test (Australia)
      </span>

      <div className="flex flex-col gap-2">
        {SECTIONS.map((section, i) => (
          <details
            key={section.id}
            open={i === 0}
            className="group border-t border-line pt-2 first:border-t-0 first:pt-0"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between font-mono text-[11px] uppercase tracking-wide text-ink-faint marker:content-['']">
              {section.heading}
              <span className="transition-transform duration-200 ease-calm group-open:rotate-90" aria-hidden>
                &rsaquo;
              </span>
            </summary>
            <ul className="mt-2 flex flex-col gap-1.5">
              {AU_GENUINE_STUDENT.filter((r) => r.section === section.id).map((r) => (
                <li key={r.id} className="flex items-baseline justify-between gap-3">
                  <span>{r.summary}</span>
                  <SourceAnchor
                    surface="genuine-student"
                    href={r.source}
                    title={r.lastVerified ? `verified ${r.lastVerified}` : undefined}
                    className="shrink-0 font-mono text-ink hover:text-primary hover:underline"
                  >
                    {r.label}
                  </SourceAnchor>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>

      <p className="text-[12.5px] text-ink-faint">{DISCLAIMER}</p>
    </aside>
  );
}
