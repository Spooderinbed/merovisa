import Link from "next/link";
import { Logo } from "./logo";

type Col = { title: string; links: Array<{ label: string; href: string }> };

const COLS: Col[] = [
  {
    title: "Product",
    links: [
      { label: "Eligibility", href: "/assess" },
      { label: "Destinations", href: "/destinations" },
      { label: "How we score", href: "/how" },
    ],
  },
  {
    title: "Trust",
    links: [
      { label: "Methodology", href: "/how" },
      { label: "Why no agents", href: "/trust" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-20 border-t border-line bg-surface">
      <div className="mx-auto w-full max-w-[1120px] px-7 pb-12 pt-10">
        <div className="flex flex-wrap justify-between gap-6">
          <div className="flex max-w-[340px] flex-col gap-3">
            <Logo />
            <p className="text-[15px] text-ink-soft">
              An honest reality check before you pay anyone. No agents, no hidden commissions.
            </p>
          </div>
          <div className="flex flex-wrap gap-10">
            {COLS.map((c) => (
              <div key={c.title} className="flex flex-col gap-2">
                <span className="mb-1 font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">
                  {c.title}
                </span>
                {c.links.map((l) => (
                  <Link key={l.label} href={l.href} className="text-[15px] text-ink-soft hover:text-ink">
                    {l.label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
        <hr className="my-6 border-line" />
        <div className="flex flex-wrap justify-between gap-3">
          <span className="inline-flex items-center gap-2 font-mono text-[12.5px] text-ink-soft">
            <svg aria-hidden viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
            </svg>
            Every data point carries its source and a verification date.
          </span>
          <span className="font-mono text-[12.5px] text-ink-soft">© 2026 MyVisa</span>
        </div>
      </div>
    </footer>
  );
}
