"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Mobile counterpart of NAV_APP in app-bar.tsx — the five core surfaces.
// Profile stays in the avatar menu (UserPill).
const TABS = [
  { label: "Home", href: "/dashboard" },
  { label: "Matches", href: "/matches" },
  { label: "My plan", href: "/plan" },
  { label: "Documents", href: "/documents" },
  { label: "Guide", href: "/guide" },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      data-testid="mobile-tab-bar"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="flex h-14 items-stretch">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 items-center justify-center whitespace-nowrap text-small transition-colors ease-calm ${
                active ? "font-medium text-primary" : "text-ink-soft hover:text-ink"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
