import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPrimaryAssessmentForUser } from "@/lib/assessments/repo";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { GuideChat } from "@/components/guide/guide-chat";
import { Card } from "@/components/ui/card";

export default async function GuidePage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/auth?next=/guide");

  const primary = await getPrimaryAssessmentForUser(supabase, data.user.id);
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
