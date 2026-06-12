import Link from "next/link";
import { Eyebrow } from "@/components/marketing/eyebrow";

export default function HowItWorksPage() {
  return (
    <section className="mx-auto w-full max-w-[720px] px-5 pb-20 pt-12">
      <Eyebrow>Methodology</Eyebrow>
      <h1 className="mt-3 text-[clamp(32px,4vw,46px)] leading-[1.1]">
        Where the numbers come from
      </h1>
      <p className="mt-4 text-[17px] text-ink-soft">
        Every verdict on this platform is traceable to a published threshold. Nothing is estimated without telling you
        it is an estimate. Here is how the four scoring dimensions are built and what changes when you upload
        documents.
      </p>

      <div className="mt-12 space-y-10">
        {/* Section 1 */}
        <div>
          <h2 className="text-[20px] font-medium leading-snug">
            Data sources
          </h2>
          <p className="mt-3 text-[17px] text-ink-soft">
            Visa rules come directly from the Department of Home Affairs at immi.homeaffairs.gov.au — the Genuine
            Student requirement and the financial-capacity rules (AUD 29,710 per year for living costs, plus travel
            and first-year tuition evidence). We do
            not interpret or paraphrase policy; we pull the published thresholds and link to the exact page. University data comes
            from the CRICOS register and each provider&apos;s own program pages. Every data point displays the date
            it was last verified. When a threshold changes, the displayed date changes too — there is no silent
            staleness.
          </p>
        </div>

        <hr className="border-line-1" />

        {/* Section 2 */}
        <div>
          <h2 className="text-[20px] font-medium leading-snug">
            The four scoring dimensions
          </h2>
          <p className="mt-3 text-[17px] text-ink-soft">
            Academic fit maps your Nepal TU percentage to an Australian WAM band and compares it against each
            program&apos;s published entry minimum. Financial readiness compares your declared budget and funding
            source against the DHA expected costs for the duration of your course — living costs plus tuition, not
            just the first year. Visa case strength scores the Genuine Student narrative inputs: how you explain
            a study gap, how clearly you state your study purpose, and what ties you have to Nepal after
            graduation. Profile strength reflects assessment completeness — English score, work history, and
            whether you have uploaded documents that replace assumed values.
          </p>
        </div>

        <hr className="border-line-1" />

        {/* Section 3 */}
        <div>
          <h2 className="text-[20px] font-medium leading-snug">
            How match verdicts work
          </h2>
          <p className="mt-3 text-[17px] text-ink-soft">
            Each program has a published grade minimum and an English requirement. We compare your inputs to
            those thresholds directly. Strong means you meet every published requirement. Possible means a small
            gap — typically one academic band or slightly below the English floor. Reach means a significant
            gap on one or more dimensions. We never invent a verdict. Every band shown links to the specific
            program threshold it is derived from, so you can verify the comparison yourself.
          </p>
        </div>

        <hr className="border-line-1" />

        {/* Section 4 */}
        <div>
          <h2 className="text-[20px] font-medium leading-snug">
            What changes when you upload documents
          </h2>
          <p className="mt-3 text-[17px] text-ink-soft">
            Before you upload, verdicts are computed from what you declare. Uploading an IELTS scorecard,
            academic transcript, or bank statement replaces a declared value with a verified one. The cascade
            is immediate: your dashboard verdict refreshes, your plan items regenerate, and every program
            match score updates to reflect the verified figure. You can see which values are declared and
            which are verified at any point in the profile section of your dashboard.
          </p>
        </div>
      </div>

      <div className="mt-12">
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
