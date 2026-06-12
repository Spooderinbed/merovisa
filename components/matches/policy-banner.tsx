import {
  DHA_LIVING_COSTS_AUD,
  DHA_LIVING_COSTS_AUD_EFFECTIVE,
  NEPAL_AU_VISA_GRANT_RATE_BAND,
} from "@/lib/programs/policy";
import { AU_DOCUMENT_CHECKLIST_TOOL } from "@/lib/data/policy/au-document-checklist-tool";
import { SourceAnchor } from "@/components/analytics/source-anchor";

export function PolicyBanner() {
  return (
    <aside className="flex flex-col gap-2 rounded-md border border-line bg-bg-tint p-4 text-[14px] text-ink-soft">
      <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">
        Current policy (Nepal &rarr; Australia)
      </span>
      <ul className="flex flex-col gap-1">
        <li>
          Nepal applications face heightened financial-evidence scrutiny &mdash; plan for 6 months of
          bank seasoning and a strong Genuine Student case.
        </li>
        <li>
          DHA&rsquo;s{" "}
          <SourceAnchor
            surface="policy-banner"
            href={AU_DOCUMENT_CHECKLIST_TOOL.value}
            title={
              AU_DOCUMENT_CHECKLIST_TOOL.provenance.lastVerified
                ? `verified ${AU_DOCUMENT_CHECKLIST_TOOL.provenance.lastVerified}`
                : undefined
            }
            className="text-ink underline underline-offset-2 hover:text-primary"
          >
            Document Checklist Tool
          </SourceAnchor>{" "}
          shows exactly what to attach for your passport country and provider.
        </li>
        <li>
          DHA living-cost requirement: <strong className="text-ink">AUD {DHA_LIVING_COSTS_AUD.toLocaleString()}</strong>{" "}
          per year (effective {DHA_LIVING_COSTS_AUD_EFFECTIVE}) &mdash; travel and tuition evidence come on top.
        </li>
        <li>
          Nepal student-visa grant rate (DHA, Apr&ndash;Jun 2025):{" "}
          <strong className="text-ink">{NEPAL_AU_VISA_GRANT_RATE_BAND[0]}%</strong> applying from
          outside Australia, <strong className="text-ink">{NEPAL_AU_VISA_GRANT_RATE_BAND[1]}%</strong>{" "}
          from within.
        </li>
      </ul>
    </aside>
  );
}
