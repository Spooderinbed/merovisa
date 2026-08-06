import Link from "next/link";
import { Eyebrow } from "@/components/marketing/eyebrow";

export default function HowItWorksPage() {
  return (
    <section className="mx-auto w-full max-w-[720px] px-5 pb-20 pt-12">
      <Eyebrow>Methodology</Eyebrow>
      <h1 className="mt-3 text-[clamp(32px,4vw,46px)] leading-[1.1]">
        Where the numbers come from
      </h1>
      <p className="mt-4 text-lead text-ink-soft">
        Every verdict on this platform is traceable to a published threshold. Nothing is estimated without telling you
        it is an estimate. Here is how the four scoring dimensions are built and what changes when you upload
        documents.
      </p>

      <div className="mt-12 space-y-12">
        {/* Section 1 */}
        <div>
          <h2 className="text-title font-medium leading-snug">
            Data sources
          </h2>
          <p className="mt-3 text-lead text-ink-soft">
            Visa rules come directly from the Department of Home Affairs at immi.homeaffairs.gov.au — the Genuine
            Student requirement and the financial-capacity rules (AUD 29,710 per year for living costs, plus travel
            and first-year tuition evidence). We do
            not interpret or paraphrase policy; we pull the published thresholds and link to the exact page. University data comes
            from the CRICOS register and each provider&apos;s own program pages. Every data point displays the date
            it was last verified. When a threshold changes, the displayed date changes too — there is no silent
            staleness.
          </p>
        </div>

        {/* Section 2 */}
        <div>
          <h2 className="text-title font-medium leading-snug">
            The four scoring dimensions
          </h2>
          <p className="mt-3 text-lead text-ink-soft">
            Academic fit compares your Nepal TU percentage directly against each
            program&apos;s published entry minimum. Financial readiness compares your declared budget and funding
            source against the DHA expected costs for the duration of your course — living costs plus tuition, not
            just the first year. Visa case strength scores the Genuine Student narrative inputs — how you explain
            a study gap, how clearly you state your study purpose, and what ties you have to Nepal after
            graduation — and weighs any prior visa refusals you declare. Profile strength reflects assessment completeness — English score, work history, and
            whether you have uploaded documents that replace assumed values.
          </p>
        </div>

        {/* Section 3 */}
        <div>
          <h2 className="text-title font-medium leading-snug">
            How match verdicts work
          </h2>
          <p className="mt-3 text-lead text-ink-soft">
            Each program has a published grade minimum and an English requirement. We compare your inputs to
            those thresholds directly. Strong means you meet every published requirement. Possible means a small
            gap — typically one academic band or slightly below the English floor. Reach means a significant
            gap on one or more dimensions. We never invent a verdict. Each band links out to the provider &mdash; the
            program page where we have it, the provider&apos;s site otherwise &mdash; so you can check the published
            requirement yourself.
          </p>
        </div>

        {/* Section 4 */}
        <div>
          <h2 className="text-title font-medium leading-snug">
            How document uploads work today
          </h2>
          <p className="mt-3 text-lead text-ink-soft">
            Your verdict and match scores are computed from the values you declare. Uploading an IELTS
            scorecard, academic transcript, or bank statement keeps your documents organized for your
            application checklist and plan — we store them so you can track what you&apos;ve gathered. We
            don&apos;t yet read figures out of uploaded files, so uploading doesn&apos;t change your verdict
            or match scores on its own.
          </p>
        </div>
      </div>

      <div className="mt-12">
        <Link
          href="/assess"
          className="inline-flex items-center gap-2 rounded-pill bg-primary px-7 py-[15px] text-lead font-medium text-on-primary hover:bg-primary-ink"
        >
          Check your eligibility →
        </Link>
      </div>
    </section>
  );
}
