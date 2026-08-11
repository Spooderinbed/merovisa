import type * as React from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getProfileForCase } from "@/lib/profiles/repo";
import { computeCompleteness } from "@/lib/profiles/completeness";
import { SECTION_KEYS } from "@/lib/profiles/sections";
import type { ProfileSections } from "@/lib/profiles/sections";
import { PROFILE_GROUPS, deriveGroupStatus, summarizeGroup } from "@/components/profile/groups";
import type { ProfileGroupKey } from "@/components/profile/groups";
import { CompletenessRing } from "@/components/profile/completeness-ring";
import { SectionAccordion } from "@/components/profile/section-accordion";
import { AboutYouEditor } from "@/components/profile/editors/about-you-editor";
import { DestinationIntakeEditor } from "@/components/profile/editors/destination-intake-editor";
import { AcademicEditor } from "@/components/profile/editors/academic-editor";
import { StudyCareerEditor } from "@/components/profile/editors/study-career-editor";
import { EnglishEditor } from "@/components/profile/editors/english-editor";
import { WorkGapEditor } from "@/components/profile/editors/work-gap-editor";
import { MoneyScholarshipsEditor } from "@/components/profile/editors/money-scholarships-editor";
import { ImmigrationEditor } from "@/components/profile/editors/immigration-editor";

/**
 * The profile editor, for ONE case — access-matrix cell 14.
 *
 * ## Why this is a panel and not still a page
 *
 * MV-172 renders the same experience twice: at `/profile` for the student whose
 * case it is, and inside a counsellor's case route for a student who has no
 * account. Copying the page would have produced two profile editors that drift;
 * the case id is the only thing that differs, so the case id is the parameter.
 *
 * `caseId` is **already authorized** when it arrives — `/profile` resolves the
 * actor's own and the case route runs `openCaseRoute` — and `db` is the
 * **authenticated** client, so cell 13's `profiles_select_case` decides what this
 * read returns. Handing it a service-role client would render identical markup
 * with the tenant boundary switched off, which is why the client is a parameter
 * rather than something this module constructs.
 *
 * The writes belong to the eight editors below and travel through
 * `useGroupSave` → `PATCH /api/profile/section`, which names the case from
 * `CaseScopeProvider`.
 */

/**
 * One editor per presentation group; multi-section groups receive the
 * slices of every member storage section they compose.
 */
function renderGroupEditor(key: ProfileGroupKey, sections: ProfileSections): React.ReactNode {
  switch (key) {
    case "about-you":
      return <AboutYouEditor initial={{ personal: sections.personal, family: sections.family }} />;
    case "destination-intake":
      return (
        <DestinationIntakeEditor
          initial={{
            destination: sections.destination,
            personal: sections.personal,
            "deal-breakers": sections["deal-breakers"],
          }}
        />
      );
    case "academic":
      return <AcademicEditor initial={sections.academic ?? {}} />;
    case "study-career":
      return (
        <StudyCareerEditor
          initial={{ "intended-study": sections["intended-study"], career: sections.career }}
        />
      );
    case "english":
      return <EnglishEditor initial={sections.english ?? {}} />;
    case "work-gap":
      return <WorkGapEditor initial={{ work: sections.work, gap: sections.gap }} />;
    case "money-scholarships":
      return (
        <MoneyScholarshipsEditor
          initial={{ finance: sections.finance, scholarships: sections.scholarships }}
        />
      );
    case "visa-history":
      return <ImmigrationEditor initial={sections.immigration ?? {}} />;
  }
}

export async function ProfilePanel({
  db,
  caseId,
  subtitle,
  footer,
}: {
  db: SupabaseClient<Database>;
  /** Null for a signed-in actor who has no case yet — the same empty state a brand-new account sees. */
  caseId: string | null;
  /**
   * When present, the panel renders its own header: the name the PROFILE carries,
   * with this underneath. `/profile` passes the signed-in person's email; the case
   * route passes nothing, because its shell already names the case — and showing
   * the profile's self-reported name a second time under the case's display name
   * would invite the reader to treat a disagreement between them as an error.
   */
  subtitle?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const profileRow = caseId === null ? null : await getProfileForCase(db, caseId);
  const sections = (profileRow?.sections as ProfileSections | undefined) ?? {};
  const { pct, status } = computeCompleteness(sections);
  // The ring keeps its existing math + breakdown over the 13 storage
  // sections — only the rows below group them for presentation.
  const counts = SECTION_KEYS.reduce(
    (acc, k) => {
      acc[status[k]] += 1;
      return acc;
    },
    { complete: 0, partial: 0, empty: 0 } as Record<"complete" | "partial" | "empty", number>,
  );

  return (
    <div className="mx-auto grid w-full max-w-[1120px] grid-cols-1 gap-6 px-5 py-10 lg:grid-cols-[280px_1fr]">
      {subtitle === undefined ? null : (
        <header className="flex flex-col gap-2 lg:col-span-2">
          <h1 className="text-[clamp(28px,3.4vw,40px)]">{profileDisplayName(sections)}</h1>
          {subtitle}
        </header>
      )}
      <CompletenessRing pct={pct} complete={counts.complete} partial={counts.partial} empty={counts.empty} />
      <div className="flex flex-col gap-3">
        {PROFILE_GROUPS.map((group) => (
          <SectionAccordion
            key={group.key}
            title={group.title}
            summary={summarizeGroup(group, sections)}
            status={deriveGroupStatus(group.sections, status)}
          >
            {renderGroupEditor(group.key, sections)}
          </SectionAccordion>
        ))}
      </div>
      {footer}
    </div>
  );
}

/** The name the profile itself carries — never the case's `display_name`. */
function profileDisplayName(sections: ProfileSections): string {
  return sections.personal?.name ?? "Add your name";
}
