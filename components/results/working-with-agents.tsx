import { AU_WORKING_WITH_AGENTS } from "@/lib/data/source/au-working-with-agents";
import type { WorkingWithAgentsFact } from "@/lib/data/types";
import { Card } from "@/components/ui/card";
import { SourceAnchor } from "@/components/analytics/source-anchor";

const SECTIONS: { id: WorkingWithAgentsFact["section"]; heading: string }[] = [
  { id: "do-you-need-one", heading: "Do you need an agent?" },
  { id: "verify-register", heading: "Check the register first" },
  { id: "what-they-owe", heading: "What your agent owes you" },
  { id: "formal-representation", heading: "Formal representation" },
  { id: "commission-ban", heading: "The 2026 commission ban" },
];

const DISCLAIMER =
  "General context on migration assistance and education-agent commissions for Australia, not legal advice.";

/**
 * Working-with-agents trust panel — gov-sourced guidance on using an agent for an Australian
 * student visa, in five collapsible sections (native <details>, first open). Mirrors
 * GenuineStudent's calm-authority shell. Purely presentational; every row links to its gov
 * source through SourceAnchor (surface "working-with-agents"). No personal odds, no scoring.
 */
export function WorkingWithAgents() {
  return (
    <Card as="aside" radius="card" tone="tint" padding="sm" className="flex flex-col gap-3 text-meta text-ink-soft">
      <span className="font-mono text-caption uppercase tracking-wide text-ink-faint">
        Working with an agent (Australia)
      </span>

      <div className="flex flex-col gap-2">
        {SECTIONS.map((section, i) => (
          <details
            key={section.id}
            open={i === 0}
            className="group border-t border-line pt-2 first:border-t-0 first:pt-0"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between font-mono text-caption uppercase tracking-wide text-ink-faint marker:content-['']">
              {section.heading}
              <span className="transition-transform duration-medium ease-calm group-open:rotate-90" aria-hidden>
                &rsaquo;
              </span>
            </summary>
            <ul className="mt-2 flex flex-col gap-1.5">
              {AU_WORKING_WITH_AGENTS.filter((r) => r.section === section.id).map((r) => (
                <li key={r.id} className="flex items-baseline justify-between gap-3">
                  <span>{r.summary}</span>
                  <SourceAnchor
                    surface="working-with-agents"
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

      <p className="text-small text-ink-faint">{DISCLAIMER}</p>
    </Card>
  );
}
