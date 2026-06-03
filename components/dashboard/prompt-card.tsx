import Link from "next/link";

export type PromptKind = "ielts-missing" | "profile-incomplete" | "none";

export function PromptCard({ kind }: { kind: PromptKind }) {
  if (kind === "none") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-6">
        <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Next step</span>
        <p className="text-[15px] text-ink">All caught up — refresh your assessment whenever your profile changes.</p>
      </div>
    );
  }
  const isIelts = kind === "ielts-missing";
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-transparent bg-primary p-6 text-on-primary">
      <span className="font-mono text-[11.5px] uppercase tracking-wide text-on-primary/70">Next step</span>
      <h3 className="text-[21px]">{isIelts ? "Upload your IELTS report" : "Your next best step"}</h3>
      <p className="text-[15px] opacity-90">
        {isIelts
          ? "You've shared your overall band — uploading the report unlocks per-band scoring against program minimums."
          : "Filling more of your profile sharpens the verdict and unlocks better matches."}
      </p>
      <Link
        href="/profile"
        className="mt-2 inline-flex w-fit items-center rounded-pill bg-on-primary px-4 py-2 text-[14px] font-medium text-primary hover:opacity-90"
      >
        Add details →
      </Link>
    </div>
  );
}
