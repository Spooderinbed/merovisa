import { AU_DHA_LIVING_CAPACITY_AUD } from "@/lib/data/policy/au-cost-of-living";
import { NEPAL_AU_STUDENT_VISA_GRANT_RATE } from "@/lib/data/policy/visa-outcomes";
import { AU_DOCUMENT_CHECKLIST_TOOL } from "@/lib/data/policy/au-document-checklist-tool";
import { SourceAnchor } from "@/components/analytics/source-anchor";
import { SourceLine } from "@/components/results/source-line";
import { Card } from "@/components/ui/card";

const LIVING = AU_DHA_LIVING_CAPACITY_AUD;
const GRANT = NEPAL_AU_STUDENT_VISA_GRANT_RATE;

export function PolicyBanner() {
  return (
    <Card as="aside" radius="card" tone="tint" padding="sm" className="flex flex-col gap-2 text-meta text-ink-soft">
      <span className="text-caption uppercase tracking-wide text-ink-faint">
        Current policy (Nepal &rarr; Australia)
      </span>
      <ul className="flex flex-col gap-1">
        <li>
          Nepal applications face heightened financial-evidence scrutiny &mdash; we recommend planning for
          around 6 months of bank seasoning and a strong Genuine Student case.
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
        <li className="flex flex-col">
          <span>
            DHA living-cost requirement:{" "}
            <strong className="text-ink">AUD {LIVING.value.toLocaleString()}</strong> per year (effective{" "}
            {LIVING.provenance.effectiveDate}) &mdash; travel and tuition evidence come on top.
          </span>
          <SourceLine
            url={LIVING.provenance.source!}
            lastVerified={LIVING.provenance.lastVerified}
            surface="policy-banner"
          />
        </li>
        <li className="flex flex-col">
          <span>
            Nepal student-visa grant rate (DHA, latest available &mdash; Apr&ndash;Jun 2025):{" "}
            <strong className="text-ink">{GRANT.value.offshore}%</strong> applying from outside Australia,{" "}
            <strong className="text-ink">{GRANT.value.onshore}%</strong> from within.
          </span>
          <SourceLine
            url={GRANT.provenance.source!}
            lastVerified={GRANT.provenance.lastVerified}
            surface="policy-banner"
          />
        </li>
      </ul>
    </Card>
  );
}
