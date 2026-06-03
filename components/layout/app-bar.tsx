import Link from "next/link";
import { Logo } from "./logo";

type Variant = "marketing";   // "app" variant added in Phase 1

const NAV_MARKETING = [
  { label: "How it works", href: "/how" },
  { label: "Destinations", href: "/destinations" },
  { label: "Why trust us", href: "/trust" },
];

export function AppBar({ variant }: { variant: Variant }) {
  if (variant === "marketing") {
    return (
      <header className="border-b border-line bg-bg">
        <div className="mx-auto flex h-[66px] w-full max-w-[1120px] items-center justify-between px-5">
          <div className="flex items-center gap-6">
            <Logo />
            <nav className="hidden items-center gap-6 md:flex">
              {NAV_MARKETING.map((i) => (
                <Link key={i.href} href={i.href} className="text-[15px] text-ink-soft hover:text-ink">
                  {i.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/auth"
              className="hidden rounded-pill px-4 py-2 text-[15px] text-ink-soft hover:bg-bg-tint hover:text-ink md:inline-flex"
            >
              Sign in
            </Link>
            <Link
              href="/assess"
              className="inline-flex items-center rounded-pill bg-primary px-[15px] py-2 text-[14px] font-medium text-on-primary hover:bg-primary-ink"
            >
              Check eligibility
            </Link>
          </div>
        </div>
      </header>
    );
  }
  // exhaustiveness guard
  variant satisfies never;
  return null;
}
