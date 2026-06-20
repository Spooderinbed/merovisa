import Link from "next/link";
import { humanize } from "@/lib/text/humanize";
import { RefreshButton } from "./refresh-button";

export interface PrimaryRef {
  id: string;
  destination_id: string;
  created_at: string;
}

export function AssessInterstitial({ primary }: { primary: PrimaryRef }) {
  return (
    <section className="mx-auto flex w-full max-w-[640px] flex-col gap-5 px-5 py-16 text-center">
      <h1 className="text-[clamp(28px,3.4vw,40px)]">You have an active assessment for {humanize(primary.destination_id)}.</h1>
      <p className="text-[17px] text-ink-soft">
        It&apos;s from {primary.created_at.slice(0, 10)}. Refresh it with your latest profile, start a new
        assessment, or open your dashboard to review what you&apos;ve already got.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <RefreshButton assessmentId={primary.id} />
        <Link
          href="/assess?new=1"
          className="inline-flex rounded-pill border border-line-2 px-7 py-[15px] text-[17px] text-ink hover:bg-bg-tint"
        >
          Start a new assessment
        </Link>
        <Link
          href="/dashboard"
          className="inline-flex rounded-pill border border-line-2 px-7 py-[15px] text-[17px] text-ink hover:bg-bg-tint"
        >
          Open my dashboard
        </Link>
      </div>
    </section>
  );
}
