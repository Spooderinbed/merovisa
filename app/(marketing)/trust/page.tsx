import Link from "next/link";
import { Eyebrow } from "@/components/marketing/eyebrow";

export default function TrustPage() {
  return (
    <section className="mx-auto w-full max-w-[720px] px-5 pb-16 pt-12">
      <Eyebrow>Why trust us</Eyebrow>
      <h1 className="mt-3 text-[clamp(32px,4vw,46px)] leading-[1.1]">
        No agents. No hidden commissions. No upsells in disguise.
      </h1>
      <p className="mt-4 text-[17px] text-ink-soft">
        Detailed trust statement coming soon. Headline: every recommendation shows the factors behind it, every visa
        rule shows where it came from, and if we ever earn referral revenue you&apos;ll see it said plainly — right where
        it&apos;s relevant.
      </p>
      <div className="mt-6">
        <Link
          href="/destinations"
          className="inline-flex items-center gap-2 rounded-pill border border-line-2 px-7 py-[15px] text-[17px] text-ink hover:bg-bg-tint"
        >
          Browse destinations
        </Link>
      </div>
    </section>
  );
}
