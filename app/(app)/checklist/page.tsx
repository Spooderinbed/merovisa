import Link from "next/link";
import { Eyebrow } from "@/components/marketing/eyebrow";

export default function ChecklistPage() {
  return (
    <section className="mx-auto w-full max-w-[720px] px-5 py-16 text-center">
      <Eyebrow>Coming soon</Eyebrow>
      <h1 className="mt-4 text-[clamp(28px,3.4vw,40px)]">Checklist landing in Phase 5.</h1>
      <p className="mx-auto mt-4 max-w-[52ch] text-[17px] text-ink-soft">
        A live document checklist per program, with upload tracking and real deadlines.
      </p>
      <Link href="/dashboard" className="mt-7 inline-flex rounded-pill bg-primary px-7 py-[15px] text-[17px] font-medium text-on-primary hover:bg-primary-ink">Back to dashboard</Link>
    </section>
  );
}
