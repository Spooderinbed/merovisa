import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-[80vh] w-full max-w-narrow flex-col justify-center gap-6 px-5 py-10">
      <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">
        Honest answers for studying abroad
      </span>
      <h1 className="text-[clamp(38px,5.4vw,62px)]">Know your real chances before you spend a rupee.</h1>
      <p className="max-w-[52ch] text-[clamp(18px,1.5vw,21px)] text-ink-soft">
        MyVisa assesses your eligibility across academics, finances, visa strength, and profile — with transparent
        reasoning and no consultancy fees.
      </p>
      <div>
        <Link href="/assess">
          <Button size="lg">Check eligibility →</Button>
        </Link>
      </div>
    </main>
  );
}
