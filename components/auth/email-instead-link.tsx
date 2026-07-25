"use client";

import Link from "next/link";
import { track } from "@/lib/analytics/events";
import { cn } from "@/lib/utils";

/**
 * The non-Google way out of the anonymous-results gate.
 *
 * Every conversion surface leads with "Continue with Google"; this carries the
 * assessment id to /auth, which signs the claim server-side so the email path
 * keeps the same assessment the Google path would have kept.
 */
export function EmailInsteadLink({
  assessmentId,
  className,
}: {
  assessmentId: string | null;
  className?: string;
}) {
  if (!assessmentId) return null;
  return (
    <Link
      href={`/auth?assessment=${assessmentId}`}
      onClick={() => track("gate_cta_clicked")}
      className={cn("text-meta text-ink-faint underline underline-offset-4 hover:text-ink", className)}
    >
      No Google account? Use your email
    </Link>
  );
}
