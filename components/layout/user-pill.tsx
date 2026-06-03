"use client";

import { useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";

function initialsFrom(user: User): string {
  const name = (user.user_metadata?.full_name as string | undefined) ?? "";
  if (name.trim()) {
    return name.split(/\s+/).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
  }
  return (user.email ?? "?")[0]!.toUpperCase();
}

export function UserPill({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const initials = initialsFrom(user);
  return (
    <div className="relative">
      <button
        type="button"
        data-testid="user-pill"
        onClick={() => setOpen((o) => !o)}
        className="grid h-9 w-9 place-items-center rounded-pill border border-line-2 bg-bg-tint text-[13px] font-medium text-ink hover:border-primary"
        aria-expanded={open}
      >
        {initials}
      </button>
      {open ? (
        <div className="absolute right-0 z-10 mt-2 w-44 overflow-hidden rounded-md border border-line bg-surface shadow-sm">
          <Link href="/dashboard" className="block px-4 py-2 text-[15px] text-ink hover:bg-bg-tint">Dashboard</Link>
          <Link href="/profile" className="block px-4 py-2 text-[15px] text-ink hover:bg-bg-tint">Profile</Link>
          <form data-testid="signout-form" action="/auth/signout" method="post" className="border-t border-line">
            <button type="submit" className="block w-full px-4 py-2 text-left text-[15px] text-ink hover:bg-bg-tint">Sign out</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
