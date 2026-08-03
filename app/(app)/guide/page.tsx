import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolvePersonalCaseId } from "@/lib/cases/personal-case";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { getPrimaryAssessmentForCase } from "@/lib/assessments/repo";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { GuideChat } from "@/components/guide/guide-chat";
import { Card } from "@/components/ui/card";

export default async function GuidePage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/auth?next=/guide");

  // MV-157: resolve the personal case ONCE per render and authorize ONCE, before
  // the first read — never per repo call. A signed-in actor with no personal case
  // is the residue of the MV-155-apply-to-this-deploy window; they see the same
  // empty state a brand-new account does, and `/api/assess` heals it by calling
  // `ensurePersonalCase` on their next assessment (MV-160 §B's sweep is the bulk
  // remedy).
  const caseId = await resolvePersonalCaseId(data.user.id, supabase);
  if (caseId !== null) {
    const { decision } = await checkCasePermission(data.user.id, caseId, "case.read", supabase);
    if (!decision.allowed) redirect("/auth?next=/guide");
  }
  const primary = caseId === null ? null : await getPrimaryAssessmentForCase(supabase, caseId);
  const hasAssessment = primary !== null;

  return (
    <section className="mx-auto flex w-full max-w-[760px] flex-col gap-5 px-5 py-10">
      <header className="flex flex-col gap-2">
        <Eyebrow>AI guide</Eyebrow>
        <h1 className="text-[clamp(24px,3vw,32px)]">Ask about your standing</h1>
        <p className="max-w-[58ch] text-body text-ink-soft">
          The guide explains your assessment using MyVisa&apos;s sourced Nepal → Australia data — with
          sources, in plain language. It won&apos;t decide for you or write your application.
        </p>
      </header>

      {!hasAssessment ? (
        <Card padding="sm" className="text-meta text-ink-soft">
          You haven&apos;t run an assessment yet, so the guide can only answer general questions about
          applying from Nepal.{" "}
          <Link href="/assess" className="text-primary underline-offset-2 hover:underline">
            Run your assessment
          </Link>{" "}
          to get answers grounded in your own profile.
        </Card>
      ) : null}

      <GuideChat />
    </section>
  );
}
