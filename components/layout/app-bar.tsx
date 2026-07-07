import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { Logo } from "./logo";
import { UserPill } from "./user-pill";

type Variant = "marketing" | "marketing-signed-in" | "app";

const NAV_MARKETING = [
  { label: "How it works", href: "/how" },
  { label: "Destinations", href: "/destinations" },
  { label: "Why trust us", href: "/trust" },
];

// Canonical app nav (post-2026-06-05 reconciliation): Home / Matches /
// My plan / Profile / Documents / Guide. "Destinations" is a marketing
// browse concept — signed-in users have personalized /matches instead.
const NAV_APP = [
  { label: "Home", href: "/dashboard" },
  { label: "Matches", href: "/matches" },
  { label: "My plan", href: "/plan" },
  { label: "Profile", href: "/profile" },
  { label: "Documents", href: "/documents" },
  { label: "Guide", href: "/guide" },
];

export function AppBar({ variant, user }: { variant: Variant; user?: User | null }) {
  if (variant === "marketing") {
    return (
      <header className="border-b border-line bg-bg">
        <div className="mx-auto flex h-[66px] w-full max-w-[1120px] items-center justify-between px-5">
          <div className="flex items-center gap-6">
            <Logo />
            <nav className="hidden items-center gap-6 md:flex">
              {NAV_MARKETING.map((i) => (
                <Link key={i.href} href={i.href} className="text-body text-ink-soft hover:text-ink">{i.label}</Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/auth" className="hidden rounded-pill px-4 py-2 text-body text-ink-soft hover:bg-bg-tint hover:text-ink md:inline-flex">Sign in</Link>
            <Link href="/assess" className="inline-flex items-center rounded-pill bg-primary px-[15px] py-2 text-meta font-medium text-on-primary hover:bg-primary-ink">Check eligibility</Link>
          </div>
        </div>
      </header>
    );
  }

  if (variant === "marketing-signed-in") {
    return (
      <header className="border-b border-line bg-bg">
        <div className="mx-auto flex h-[66px] w-full max-w-[1120px] items-center justify-between px-5">
          <div className="flex items-center gap-6">
            <Logo />
            <nav className="hidden items-center gap-6 md:flex">
              {NAV_MARKETING.map((i) => (
                <Link key={i.href} href={i.href} className="text-body text-ink-soft hover:text-ink">{i.label}</Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="hidden rounded-pill bg-primary px-[15px] py-2 text-meta font-medium text-on-primary hover:bg-primary-ink md:inline-flex">Open dashboard</Link>
            <UserPill user={user!} />
          </div>
        </div>
      </header>
    );
  }

  if (variant === "app") {
    return (
      <header className="border-b border-line bg-bg">
        <div className="mx-auto flex h-[66px] w-full max-w-[1120px] items-center justify-between px-5">
          <div className="flex items-center gap-6">
            <Logo href="/dashboard" />
            <nav className="hidden items-center gap-5 md:flex">
              {NAV_APP.map((i) => (
                <Link key={i.href} href={i.href} className="text-body text-ink-soft hover:text-ink">{i.label}</Link>
              ))}
            </nav>
          </div>
          <UserPill user={user!} />
        </div>
      </header>
    );
  }

  variant satisfies never;
  return null;
}
