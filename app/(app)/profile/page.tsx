import type * as React from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";
import { getProfile } from "@/lib/profiles/repo";
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
import { DeleteAccountSection } from "@/components/account/delete-account-section";

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

export default async function ProfilePage() {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    const h = await headers();
    const next = safeNext(h.get("x-pathname")) ?? "/dashboard";
    redirect(`/auth?next=${encodeURIComponent(next)}`);
  }
  const user = userData.user;
  const profileRow = await getProfile(supabase, user.id);
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

  const displayName = sections.personal?.name ?? "Add your name";
  return (
    <div className="mx-auto grid w-full max-w-[1120px] grid-cols-1 gap-6 px-5 py-10 lg:grid-cols-[280px_1fr]">
      <header className="flex flex-col gap-2 lg:col-span-2">
        <h1 className="text-[clamp(28px,3.4vw,40px)]">{displayName}</h1>
        <span className="text-[15px] text-ink-soft">{user.email}</span>
      </header>
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
      <DeleteAccountSection />
    </div>
  );
}
