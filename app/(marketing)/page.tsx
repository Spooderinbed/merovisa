import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TrustStrip } from "@/components/layout/trust-strip";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { HeroPreview } from "@/components/marketing/hero-preview";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Tile } from "@/components/marketing/tile";
import { TrustCallout } from "@/components/marketing/trust-callout";

function IconShield() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    </svg>
  );
}
function IconGuide() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function IconDoc() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

export default async function HomePage() {
  // Signed-in users skip the marketing landing — drop them on the dashboard.
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <>
      <TrustStrip />

      {/* hero */}
      <section className="mx-auto w-full max-w-[1120px] px-5 pb-6 pt-[72px]">
        <div className="max-w-[760px]">
          <Eyebrow>For students applying abroad</Eyebrow>
          <h1 className="mt-5 text-[clamp(42px,6vw,68px)] leading-[1.05]">
            An honest answer before
            <br />
            you pay anyone.
          </h1>
          <p className="mt-6 max-w-[58ch] text-[clamp(18px,1.5vw,21px)] text-ink-soft">
            Can I get in? What will it really cost? What&apos;s my visa risk? Answer 9 quick questions to see where you
            stand — free, and no sign-up to start.
          </p>
          <p className="mt-4 max-w-[58ch] text-body text-ink-soft">
            Built on official Home Affairs and university data — every figure shows its source and date.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/assess"
              className="inline-flex items-center gap-2 rounded-pill bg-primary px-7 py-[15px] text-lead font-medium text-on-primary hover:bg-primary-ink"
            >
              Check your eligibility →
            </Link>
            <span className="inline-flex items-center gap-2 text-body text-ink-soft">
              <svg aria-hidden viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-ink-faint">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 7v5l3 2" />
              </svg>
              9 quick questions · no account needed
            </span>
          </div>
        </div>

        <div className="mt-16">
          <HeroPreview />
        </div>
      </section>

      {/* tiles */}
      <section className="mx-auto w-full max-w-[1120px] px-5 pt-20">
        <Eyebrow>What you get</Eyebrow>
        <h2 className="mt-4 max-w-[600px] text-[clamp(28px,3.4vw,38px)]">Three quiet tools, no clutter.</h2>
        <div className="mt-9 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          <Tile
            title="Eligibility & checklist"
            body="A banded verdict — strong, possible, or reach — built from official thresholds, plus a document checklist with real deadlines."
            iconSvg={<IconShield />}
          />
          <Tile
            title="An AI guide that remembers you"
            body="Not a popup bot. A calm companion that powers a feed of matches, visa updates for your country, and your next best step."
            iconSvg={<IconGuide />}
            badge="Soon"
          />
          <Tile
            title="SOP coach"
            body="Coaching on your own draft — structure, clarity, how you explain a study gap. A coach, never a ghostwriter."
            iconSvg={<IconDoc />}
            badge="Soon"
          />
        </div>
      </section>

      {/* how it works */}
      <section className="mx-auto mt-24 w-full max-w-[1120px] px-5">
        <HowItWorks />
      </section>

      <TrustCallout />
      <div className="h-20" />
    </>
  );
}
