import Link from "next/link";
import { Eyebrow } from "./eyebrow";

export function TrustCallout() {
  return (
    <section className="mx-auto w-full max-w-[720px] px-5 pt-24 text-center">
      <Eyebrow>Trust is the product</Eyebrow>
      <h2 className="mt-4 text-[clamp(28px,3.4vw,38px)]">We sit before the consultancy, not in place of one.</h2>
      <p className="mx-auto mt-4 max-w-[58ch] text-[17px] text-ink-soft">
        Every recommendation shows the factors behind it. Every visa rule shows where it came from and when we last
        checked. If we ever earn referral revenue, you&apos;ll see it said plainly — right where it&apos;s relevant.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/assess"
          className="inline-flex items-center rounded-pill bg-primary px-7 py-[15px] text-[17px] font-medium text-on-primary hover:bg-primary-ink"
        >
          Check your eligibility
        </Link>
        <Link
          href="/destinations"
          className="inline-flex items-center rounded-pill border border-line-2 px-7 py-[15px] text-[17px] text-ink hover:bg-bg-tint"
        >
          Browse destinations
        </Link>
      </div>
    </section>
  );
}
