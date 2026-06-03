import Link from "next/link";
import { Eyebrow } from "@/components/marketing/eyebrow";

export default function HowItWorksPage() {
  return (
    <section className="mx-auto w-full max-w-[720px] px-5 pb-16 pt-12">
      <Eyebrow>How it works</Eyebrow>
      <h1 className="mt-3 text-[clamp(32px,4vw,46px)] leading-[1.1]">
        We score what&apos;s measurable. We tell you the rest.
      </h1>
      <p className="mt-4 text-[17px] text-ink-soft">
        Detailed methodology is on the way. For now: every verdict comes from official thresholds (academics, English,
        finances), every visa rule shows its source and the date we last checked it, and nothing is hidden behind a
        sign-up wall to start.
      </p>
      <div className="mt-6">
        <Link
          href="/assess"
          className="inline-flex items-center gap-2 rounded-pill bg-primary px-7 py-[15px] text-[17px] font-medium text-on-primary hover:bg-primary-ink"
        >
          Check your eligibility →
        </Link>
      </div>
    </section>
  );
}
